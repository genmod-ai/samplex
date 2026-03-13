import chalk from "chalk";
import { loadProjectConfig, saveProjectConfig } from "../lib/config.js";
import { validateSlug } from "../lib/validate.js";

export async function initCommand(options: { slug?: string; name?: string }): Promise<void> {
  const existing = loadProjectConfig();

  if (!options.slug && !options.name) {
    // Show current config
    if (existing) {
      console.log(chalk.bold("Current .samplex.config.json config:"));
      if (existing.slug) console.log(`  slug: ${chalk.cyan(existing.slug)}`);
      if (existing.name) console.log(`  name: ${existing.name}`);
    } else {
      console.log("No .samplex.config.json found in this directory.");
      console.log(
        `Run ${chalk.cyan("samplex init --slug <slug>")} to create one, or it will be created on first deploy.`,
      );
    }
    return;
  }

  if (options.slug) {
    const slug = options.slug.toLowerCase().trim();
    const error = validateSlug(slug);
    if (error) {
      console.error(chalk.red(`Invalid slug "${slug}": ${error}`));
      process.exit(1);
    }
    options.slug = slug;
  }

  const config: Record<string, string> = {};
  if (options.slug) config.slug = options.slug;
  if (options.name) config.name = options.name;

  saveProjectConfig(config);

  console.log(chalk.green("Saved .samplex.config.json"));
  if (options.slug) {
    console.log(`  slug: ${chalk.cyan(options.slug)}`);
    if (existing?.slug && existing.slug !== options.slug) {
      console.log(
        chalk.yellow(`  (changed from "${existing.slug}" — next deploy will create a new site)`),
      );
    }
  }
  if (options.name) {
    console.log(`  name: ${options.name}`);
  }
}
