import { Command } from "commander";
import { JiraClient } from "../client/index.js";
import { loadConfig } from "../config.js";
import { textToAdf } from "../utils/adf.js";
import type { IssueLinkRequest } from "../client/types.js";

export function registerLinkCommands(program: Command): void {
  const link = program.command("link").description("Manage issue links");

  // ── sjira link add ────────────────────────────────────────────

  link
    .command("add <inwardIssue> <outwardIssue>")
    .description("Link two issues together")
    .requiredOption(
      "-t, --type <name>",
      "Link type (e.g. Blocks, Relates, Duplicate, Cloners)",
    )
    .option("-c, --comment <text>", "Optional comment on the link")
    .action(
      async (
        inwardIssue: string,
        outwardIssue: string,
        opts: Record<string, unknown>,
      ) => {
        const client = new JiraClient(loadConfig());
        const linkRequest: IssueLinkRequest = {
          type: { name: opts.type as string },
          inwardIssue: { key: inwardIssue },
          outwardIssue: { key: outwardIssue },
        };
        if (opts.comment) {
          linkRequest.comment = { body: textToAdf(opts.comment as string) };
        }
        await client.createLink(linkRequest);
        console.log(
          `Linked ${inwardIssue} -> ${outwardIssue} (${opts.type})`,
        );
      },
    );
}
