import { createHash } from "node:crypto";
import { existsSync, statSync, readdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import chalk from "chalk";
import ora from "ora";
import * as tar from "tar";
import { rpcUpload } from "../lib/api.js";
import { loadProjectConfig, saveProjectConfig } from "../lib/config.js";
import { log } from "../lib/logger.js";
import { validateSlug } from "../lib/validate.js";

const OUTPUT_DIRS = ["dist", "build", "out", ".output/public"];

function findOutputDir(dir?: string): string {
  if (dir) {
    const resolved = resolve(dir);
    if (!existsSync(resolved)) throw new Error(`Directory not found: ${dir}`);
    return resolved;
  }
  for (const candidate of OUTPUT_DIRS) {
    const resolved = resolve(candidate);
    if (existsSync(resolved) && statSync(resolved).isDirectory()) {
      return resolved;
    }
  }
  throw new Error(
    "No output directory found. Run your build first or specify a directory: samplex deploy ./dist",
  );
}

function walkDir(dirPath: string, root?: string): { files: string[]; totalSize: number } {
  const base = root || dirPath;
  const files: string[] = [];
  let totalSize = 0;
  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const sub = walkDir(fullPath, base);
      files.push(...sub.files);
      totalSize += sub.totalSize;
    } else {
      files.push(relative(base, fullPath));
      totalSize += statSync(fullPath).size;
    }
  }
  return { files, totalSize };
}

export async function deployCommand(
  dir?: string,
  options?: { slug?: string; name?: string },
): Promise<void> {
  const spinner = ora("Preparing deploy...").start();

  try {
    const outputDir = findOutputDir(dir);
    log.debug("Output directory:", outputDir);
    const { files: entries, totalSize } = walkDir(outputDir);
    const fileCount = entries.length;

    spinner.text = `Found ${fileCount} files (${(totalSize / 1024).toFixed(1)}KB) in ${outputDir}`;
    log.debug("Total size:", totalSize, "bytes,", fileCount, "files");

    // Resolve slug: --slug flag > .smpx.config.json > let server generate one
    const projectConfig = loadProjectConfig();
    const slug = options?.slug || projectConfig?.slug;
    if (slug) {
      const slugError = validateSlug(slug);
      if (slugError) {
        spinner.fail(chalk.red(`Invalid slug "${slug}": ${slugError}`));
        process.exit(1);
      }
      log.debug("Using slug:", slug, options?.slug ? "(from --slug)" : "(from .smpx.config.json)");
    }

    // Create tar.gz archive
    spinner.text = "Creating archive...";
    log.debug("Archiving", entries.length, "files");

    const archive = await tar.create({ gzip: true, cwd: outputDir, portable: true }, entries);

    // tar.create returns a readable stream — collect into Buffer
    const chunks: Buffer[] = [];
    for await (const chunk of archive) {
      chunks.push(Buffer.from(chunk));
    }
    const archiveBuffer = Buffer.concat(chunks);
    log.debug("Archive size:", archiveBuffer.length, "bytes");

    // Compute SHA-256 hash for integrity verification
    const sha256 = createHash("sha256").update(archiveBuffer).digest("hex");
    log.debug("Archive SHA-256:", sha256);

    // Upload via oRPC (server enforces limits)
    spinner.text = "Uploading...";
    const archiveBlob = new Blob([archiveBuffer], { type: "application/gzip" });

    const result = await rpcUpload<{
      siteId: string;
      url: string;
      siteSlug: string;
      filesUploaded: number;
      totalSize: number;
    }>(
      "site.upload",
      { blob: archiveBlob, fieldName: "archive" },
      {
        sha256,
        ...(slug && { slug }),
        ...((options?.name || projectConfig?.name) && {
          name: options?.name || projectConfig?.name,
        }),
      },
    );

    // Save slug + name to .smpx.config.json so subsequent deploys update the same site
    saveProjectConfig({
      slug: result.siteSlug,
      ...(options?.name && { name: options.name }),
    });

    spinner.succeed(
      chalk.green(
        `Deployed to ${chalk.bold(result.url)}` +
          ` (${result.filesUploaded} files, ${(result.totalSize / 1024).toFixed(1)}KB)`,
      ),
    );
  } catch (error) {
    spinner.fail(`Deploy failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exit(1);
  }
}
