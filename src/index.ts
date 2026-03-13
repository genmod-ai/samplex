#!/usr/bin/env node
import { Command } from "commander";
import { loginCommand } from "./commands/login";
import { deployCommand } from "./commands/deploy";
import { listCommand } from "./commands/list";
import { deleteCommand } from "./commands/delete";
import { initCommand } from "./commands/init";
import { CLI_VERSION } from "./lib/version";
const program = new Command();

program
  .name("samplex")
  .description("Deploy frontend projects to shareable preview URLs")
  .version(CLI_VERSION, "-v, --version");

program.command("login").description("Authenticate with sample.app").action(loginCommand);

program
  .command("deploy [dir]")
  .description("Deploy a directory to a preview URL")
  .option("-s, --slug <slug>", "Site slug (used in URL, saved to .samplex.config.json)")
  .option("-n, --name <name>", "Display name for the site")
  .action(deployCommand);

program.command("list").description("List your deployed sites").action(listCommand);

program
  .command("delete <slug>")
  .description("Delete a deployed site by its slug")
  .action(deleteCommand);

program
  .command("init")
  .description("Initialize or view project config (.samplex.config.json)")
  .option("-s, --slug <slug>", "Set the site slug for this project")
  .option("-n, --name <name>", "Set a display name for the site")
  .action(initCommand);

program.parse();
