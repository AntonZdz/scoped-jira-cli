import { Command } from "commander";
import { JiraClient } from "../client/index.js";
import { loadConfig } from "../config.js";

export function registerEpicCommands(program: Command): void {
  const epic = program
    .command("epic")
    .description("Manage epics");

  epic
    .command("add <epicKey> <issueKeys...>")
    .description("Add issues to an epic")
    .action(async (epicKey: string, issueKeys: string[]) => {
      const client = new JiraClient(loadConfig());
      await client.addToEpic(epicKey, issueKeys);
      console.log(`Added ${issueKeys.join(", ")} to epic ${epicKey}`);
    });
}
