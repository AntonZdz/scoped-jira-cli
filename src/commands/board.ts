import { Command } from "commander";
import { JiraClient } from "../client/index.js";
import { loadConfig } from "../config.js";
import { formatBoards, type OutputFormat } from "../utils/output.js";

function getFormat(cmd: Command): OutputFormat {
  return cmd.optsWithGlobals().json ? "json" : "plain";
}

export function registerBoardCommands(program: Command): void {
  const board = program
    .command("board")
    .description("Manage JIRA boards");

  board
    .command("list")
    .description("List boards")
    .option("-p, --project <key>", "Filter by project key")
    .option("--limit <n>", "Maximum results", "50")
    .action(async (opts: Record<string, unknown>, cmd: Command) => {
      const client = new JiraClient(loadConfig());
      const format = getFormat(cmd);
      const result = await client.listBoards(
        opts.project as string | undefined,
        parseInt(opts.limit as string, 10),
      );
      console.log(formatBoards(result.values, format));
    });
}
