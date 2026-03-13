import chalk from "chalk";
import ora from "ora";
import { rpc } from "../lib/api.js";

export async function deleteCommand(slug: string): Promise<void> {
  const spinner = ora(`Deleting site ${slug}...`).start();

  try {
    await rpc("site.delete", { slug });
    spinner.succeed(chalk.green(`Site ${chalk.bold(slug)} deleted.`));
  } catch (error) {
    spinner.fail(`Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exit(1);
  }
}
