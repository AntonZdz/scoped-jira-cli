import { Command } from "commander";
import { JiraClient } from "../client/index.js";
import { loadConfig } from "../config.js";
import { textToAdf } from "../utils/adf.js";
import { formatWorklog, type OutputFormat } from "../utils/output.js";

function getFormat(cmd: Command): OutputFormat {
  return cmd.optsWithGlobals().json ? "json" : "plain";
}

export function registerWorklogCommands(program: Command): void {
  const worklog = program
    .command("worklog")
    .description("Manage work logs");

  worklog
    .command("add <issueKey>")
    .description("Log time against an issue")
    .requiredOption(
      "-t, --time <timeSpent>",
      "Time spent (e.g. '2h 30m', '1d', '45m')",
    )
    .option("-c, --comment <text>", "Work description")
    .action(async (issueKey: string, opts: Record<string, unknown>, cmd: Command) => {
      const client = new JiraClient(loadConfig());
      const format = getFormat(cmd);
      const comment = opts.comment
        ? textToAdf(opts.comment as string)
        : undefined;
      const result = await client.addWorklog(
        issueKey,
        opts.time as string,
        comment,
      );
      console.log(formatWorklog(result, format));
    });
}
