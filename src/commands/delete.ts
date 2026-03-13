import pc from "picocolors";
import { Spinner } from "picospinner";
import { rpc } from "../lib/api.js";

export async function deleteCommand(slug: string): Promise<void> {
  const spinner = new Spinner(`Deleting site ${slug}...`);
  spinner.start();

  try {
    await rpc("site.delete", { slug });
    spinner.succeed(pc.green(`Site ${pc.bold(slug)} deleted.`));
  } catch (error) {
    spinner.fail(`Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exit(1);
  }
}
