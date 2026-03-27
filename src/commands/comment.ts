import { Command } from "commander";
import { JiraClient } from "../client/index.js";
import { loadConfig } from "../config.js";
import { textToAdf } from "../utils/adf.js";
import {
  formatComment,
  formatComments,
  type OutputFormat,
} from "../utils/output.js";

function getFormat(cmd: Command): OutputFormat {
  return cmd.optsWithGlobals().json ? "json" : "plain";
}

export function registerCommentCommands(program: Command): void {
  const comment = program
    .command("comment")
    .description("Manage issue comments");

  // ── sjira comment add ─────────────────────────────────────────

  comment
    .command("add <issueKey>")
    .description("Add a comment to an issue")
    .requiredOption("-b, --body <text>", "Comment text (plain text)")
    .action(async (issueKey: string, opts: Record<string, unknown>, cmd: Command) => {
      const client = new JiraClient(loadConfig());
      const format = getFormat(cmd);
      const result = await client.addComment(
        issueKey,
        textToAdf(opts.body as string),
      );

      if (format === "json") {
        console.log(formatComment(result, "json"));
      } else {
        console.log(`Comment added to ${issueKey} (id: ${result.id})`);
      }
    });

  // ── sjira comment list ────────────────────────────────────────

  comment
    .command("list <issueKey>")
    .description("List comments on an issue")
    .option("--limit <n>", "Maximum number of comments", "25")
    .action(async (issueKey: string, opts: Record<string, unknown>, cmd: Command) => {
      const client = new JiraClient(loadConfig());
      const format = getFormat(cmd);
      const result = await client.getComments(
        issueKey,
        0,
        parseInt(opts.limit as string, 10),
      );
      console.log(formatComments(result.comments, format));
    });
}
