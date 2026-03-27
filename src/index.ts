import { Command } from "commander";
import { registerIssueCommands } from "./commands/issue.js";
import { registerCommentCommands } from "./commands/comment.js";
import { registerLinkCommands } from "./commands/link.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerProjectCommands } from "./commands/project.js";
import { registerBoardCommands } from "./commands/board.js";
import { registerSprintCommands } from "./commands/sprint.js";
import { registerEpicCommands } from "./commands/epic.js";
import { registerWorklogCommands } from "./commands/worklog.js";
import { ConfigError } from "./config.js";
import { JiraApiError, CloudIdError } from "./client/errors.js";

const program = new Command()
  .name("sjira")
  .description(
    "JIRA CLI with native support for Atlassian scoped access tokens.\n\n" +
      "Required environment variables:\n" +
      "  JIRA_SITE           Atlassian site subdomain (e.g. mycompany)\n" +
      "  JIRA_EMAIL          Email for authentication\n" +
      "  JIRA_SCOPED_TOKEN   Scoped access token\n\n" +
      "Optional:\n" +
      "  JIRA_CLOUD_ID       Cloud ID (auto-discovered if not set)\n\n" +
      "Token scopes needed: read:jira-work, write:jira-work",
  )
  .version("0.1.0")
  .option("--json", "Output in JSON format");

registerIssueCommands(program);
registerCommentCommands(program);
registerLinkCommands(program);
registerSearchCommand(program);
registerProjectCommands(program);
registerBoardCommands(program);
registerSprintCommands(program);
registerEpicCommands(program);
registerWorklogCommands(program);

async function main(): Promise<void> {
  try {
    await program.parseAsync();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`Configuration error: ${error.message}`);
      process.exitCode = 2;
      return;
    }
    if (error instanceof CloudIdError) {
      console.error(error.message);
      process.exitCode = 3;
      return;
    }
    if (error instanceof JiraApiError) {
      console.error(`JIRA API error (${error.status}): ${error.message}`);
      process.exitCode = 4;
      return;
    }
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    }
    process.exitCode = 1;
  }
}

main();
