import chalk from "chalk";
import { rpc } from "../lib/api.js";

interface Site {
  siteSlug: string;
  bundleSizeBytes: number;
  viewCount: number;
  status: string;
}

export async function listCommand(): Promise<void> {
  try {
    const sites = await rpc<Site[]>("site.list");

    if (sites.length === 0) {
      console.log("No sites deployed yet. Run `samplex deploy` to get started.");
      return;
    }

    console.log(chalk.bold("\nYour sites:\n"));
    console.log(
      chalk.gray("  " + "SLUG".padEnd(25) + "SIZE".padEnd(10) + "VIEWS".padEnd(10) + "STATUS"),
    );
    console.log(chalk.gray("  " + "-".repeat(55)));

    for (const s of sites) {
      const size = `${(s.bundleSizeBytes / 1024).toFixed(0)}KB`;
      const status = s.status === "active" ? chalk.green("active") : chalk.red("disabled");
      console.log(
        `  ${s.siteSlug.padEnd(25)}${size.padEnd(10)}${String(s.viewCount).padEnd(10)}${status}`,
      );
    }
    console.log();
  } catch (error) {
    console.error(`Failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exit(1);
  }
}
