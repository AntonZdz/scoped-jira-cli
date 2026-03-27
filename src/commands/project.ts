import { Command } from "commander";
import { JiraClient } from "../client/index.js";
import { loadConfig } from "../config.js";
import { formatProjects, type OutputFormat } from "../utils/output.js";

function getFormat(cmd: Command): OutputFormat {
  return cmd.optsWithGlobals().json ? "json" : "plain";
}

export function registerProjectCommands(program: Command): void {
  const project = program
    .command("project")
    .description("Manage JIRA projects");

  project
    .command("list")
    .description("List projects")
    .option("--limit <n>", "Maximum results", "50")
    .action(async (opts: Record<string, unknown>, cmd: Command) => {
      const client = new JiraClient(loadConfig());
      const format = getFormat(cmd);
      const result = await client.listProjects(
        parseInt(opts.limit as string, 10),
      );
      console.log(formatProjects(result.values, format));
    });
}
