import { Command } from "commander";
import { JiraClient } from "../client/index.js";
import { loadConfig } from "../config.js";
import { formatSearch, type OutputFormat } from "../utils/output.js";

function getFormat(cmd: Command): OutputFormat {
  return cmd.optsWithGlobals().json ? "json" : "plain";
}

export function registerSearchCommand(program: Command): void {
  program
    .command("search")
    .description("Search issues using JQL")
    .requiredOption("-j, --jql <query>", "JQL query string")
    .option("--limit <n>", "Maximum results per page", "25")
    .option("--fields <fields>", "Comma-separated field names to return")
    .option("--next-page <token>", "Pagination token for next page")
    .action(async (opts: Record<string, unknown>, cmd: Command) => {
      const client = new JiraClient(loadConfig());
      const format = getFormat(cmd);

      const result = await client.search({
        jql: opts.jql as string,
        maxResults: parseInt(opts.limit as string, 10),
        fields: opts.fields
          ? (opts.fields as string).split(",")
          : undefined,
        nextPageToken: opts.nextPage as string | undefined,
      });

      console.log(formatSearch(result, format));

      // Show pagination hint in plain mode
      if (result.nextPageToken && format === "plain") {
        console.log(`\nNext page: --next-page ${result.nextPageToken}`);
      }
    });
}
