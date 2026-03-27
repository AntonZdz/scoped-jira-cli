import { Command } from "commander";
import { JiraClient } from "../client/index.js";
import { loadConfig } from "../config.js";
import { formatSprints, type OutputFormat } from "../utils/output.js";

function getFormat(cmd: Command): OutputFormat {
  return cmd.optsWithGlobals().json ? "json" : "plain";
}

export function registerSprintCommands(program: Command): void {
  const sprint = program
    .command("sprint")
    .description("Manage sprints");

  sprint
    .command("list")
    .description("List sprints for a board")
    .requiredOption("-b, --board <id>", "Board ID (use 'sjira board list' to find)")
    .option("--state <states>", "Filter by state: active, closed, future (comma-separated)")
    .option("--limit <n>", "Maximum results", "50")
    .action(async (opts: Record<string, unknown>, cmd: Command) => {
      const client = new JiraClient(loadConfig());
      const format = getFormat(cmd);
      const result = await client.listSprints(
        opts.board as string,
        opts.state as string | undefined,
        parseInt(opts.limit as string, 10),
      );
      console.log(formatSprints(result.values, format));
    });

  sprint
    .command("add <sprintId> <issueKeys...>")
    .description("Add issues to a sprint")
    .action(async (sprintId: string, issueKeys: string[]) => {
      const client = new JiraClient(loadConfig());
      await client.addToSprint(sprintId, issueKeys);
      console.log(`Added ${issueKeys.join(", ")} to sprint ${sprintId}`);
    });
}
