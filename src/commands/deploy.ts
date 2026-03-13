import { createHash } from "node:crypto";
import { existsSync, statSync, readdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import pc from "picocolors";
import { Spinner } from "picospinner";
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
    if (entry.isSymbolicLink()) {
      continue;
    }
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
  const spinner = new Spinner("Preparing deploy...");
  spinner.start();

  try {
    const outputDir = findOutputDir(dir);
    log.debug("Output directory:", outputDir);
    const { files: entries, totalSize } = walkDir(outputDir);
    const fileCount = entries.length;

    spinner.setText(
      `Found ${fileCount} files (${(totalSize / 1024).toFixed(1)}KB) in ${outputDir}`,
    );
    log.debug("Total size:", totalSize, "bytes,", fileCount, "files");

    // Resolve slug: --slug flag > .samplex.config.json > let server generate one
    const projectConfig = loadProjectConfig();
    const slug = options?.slug || projectConfig?.slug;
    if (slug) {
      const slugError = validateSlug(slug);
      if (slugError) {
        spinner.fail(pc.red(`Invalid slug "${slug}": ${slugError}`));
        process.exit(1);
      }
      log.debug(
        "Using slug:",
        slug,
        options?.slug ? "(from --slug)" : "(from .samplex.config.json)",
      );
    }

    // Create tar.gz archive
    spinner.setText("Creating archive...");
    log.debug("Archiving", entries.length, "files");

    const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024; // 100 MB
    const archive = await tar.create({ gzip: true, cwd: outputDir, portable: true }, entries);

    // Stream into buffer while computing SHA-256 hash in one pass
    const hash = createHash("sha256");
    const chunks: Buffer[] = [];
    let archiveSize = 0;
    for await (const chunk of archive) {
      const buf = Buffer.from(chunk);
      archiveSize += buf.length;
      if (archiveSize > MAX_ARCHIVE_BYTES) {
        throw new Error(
          `Archive exceeds ${MAX_ARCHIVE_BYTES / 1024 / 1024}MB limit. ` +
            "Consider excluding large files or using a smaller build output.",
        );
      }
      chunks.push(buf);
      hash.update(buf);
    }
    const archiveBuffer = Buffer.concat(chunks);
    log.debug("Archive size:", archiveBuffer.length, "bytes");

    const sha256 = hash.digest("hex");
    log.debug("Archive SHA-256:", sha256);

    // Upload via oRPC (server enforces limits)
    spinner.setText("Uploading...");
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

    // Save slug + name to .samplex.config.json so subsequent deploys update the same site
    saveProjectConfig({
      slug: result.siteSlug,
      ...(options?.name && { name: options.name }),
    });

    spinner.succeed(
      pc.green(
        `Deployed to ${pc.bold(result.url)}` +
          ` (${result.filesUploaded} files, ${(result.totalSize / 1024).toFixed(1)}KB)`,
      ),
    );
  } catch (error) {
    spinner.fail(`Deploy failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exit(1);
  }
}
