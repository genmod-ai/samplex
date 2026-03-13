import pc from "picocolors";
import { loadProjectConfig, saveProjectConfig } from "../lib/config.js";
import { validateSlug } from "../lib/validate.js";

export async function initCommand(options: { slug?: string; name?: string }): Promise<void> {
  const existing = loadProjectConfig();

  if (!options.slug && !options.name) {
    // Show current config
    if (existing) {
      console.log(pc.bold("Current .samplex.config.json config:"));
      if (existing.slug) console.log(`  slug: ${pc.cyan(existing.slug)}`);
      if (existing.name) console.log(`  name: ${existing.name}`);
    } else {
      console.log("No .samplex.config.json found in this directory.");
      console.log(
        `Run ${pc.cyan("samplex init --slug <slug>")} to create one, or it will be created on first deploy.`,
      );
    }
    return;
  }

  if (options.slug) {
    const slug = options.slug.toLowerCase().trim();
    const error = validateSlug(slug);
    if (error) {
      console.error(pc.red(`Invalid slug "${slug}": ${error}`));
      process.exit(1);
    }
    options.slug = slug;
  }

  const config: Record<string, string> = {};
  if (options.slug) config.slug = options.slug;
  if (options.name) config.name = options.name;

  saveProjectConfig(config);

  console.log(pc.green("Saved .samplex.config.json"));
  if (options.slug) {
    console.log(`  slug: ${pc.cyan(options.slug)}`);
    if (existing?.slug && existing.slug !== options.slug) {
      console.log(
        pc.yellow(`  (changed from "${existing.slug}" — next deploy will create a new site)`),
      );
    }
  }
  if (options.name) {
    console.log(`  name: ${options.name}`);
  }
}
