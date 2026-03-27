import { Command } from "commander";
import { JiraClient } from "../client/index.js";
import { loadConfig } from "../config.js";
import { textToAdf } from "../utils/adf.js";
import {
  formatIssue,
  formatCreated,
  formatTransitions,
  type OutputFormat,
} from "../utils/output.js";
import type { IssueCreateFields, FieldOperation } from "../client/types.js";

function getFormat(cmd: Command): OutputFormat {
  return cmd.optsWithGlobals().json ? "json" : "plain";
}

export function registerIssueCommands(program: Command): void {
  const issue = program.command("issue").description("Manage JIRA issues");

  // ── sjira issue create ────────────────────────────────────────

  issue
    .command("create")
    .description("Create a new issue")
    .requiredOption("-p, --project <key>", "Project key (e.g. PROJ)")
    .requiredOption("-t, --type <name>", "Issue type (e.g. Task, Bug, Story)")
    .requiredOption("-s, --summary <text>", "Issue summary")
    .option("-d, --description <text>", "Issue description (plain text)")
    .option("--priority <name>", "Priority (e.g. High, Medium, Low)")
    .option("--assignee <accountId>", "Assignee account ID")
    .option("-l, --label <labels...>", "Labels to add")
    .option("--component <names...>", "Component names")
    .option(
      "-f, --field <pairs...>",
      "Custom fields as key=value (value parsed as JSON if valid)",
    )
    .action(async (opts: Record<string, unknown>, cmd: Command) => {
      const client = new JiraClient(loadConfig());

      const fields: IssueCreateFields = {
        project: { key: opts.project as string },
        issuetype: { name: opts.type as string },
        summary: opts.summary as string,
      };

      if (opts.description) {
        fields.description = textToAdf(opts.description as string);
      }
      if (opts.priority) fields.priority = { name: opts.priority as string };
      if (opts.assignee) {
        fields.assignee = { accountId: opts.assignee as string };
      }
      if (opts.label) fields.labels = opts.label as string[];
      if (opts.component) {
        fields.components = (opts.component as string[]).map((n) => ({
          name: n,
        }));
      }

      if (opts.field) {
        for (const pair of opts.field as string[]) {
          const eqIdx = pair.indexOf("=");
          if (eqIdx === -1) continue;
          const key = pair.substring(0, eqIdx);
          const raw = pair.substring(eqIdx + 1);
          try {
            fields[key] = JSON.parse(raw);
          } catch {
            fields[key] = raw;
          }
        }
      }

      const result = await client.createIssue(fields);
      console.log(formatCreated(result, getFormat(cmd)));
    });

  // ── sjira issue get ───────────────────────────────────────────

  issue
    .command("get <issueKey>")
    .description("Get issue details")
    .option("--fields <fields>", "Comma-separated field names to return")
    .action(async (issueKey: string, opts: Record<string, unknown>, cmd: Command) => {
      const client = new JiraClient(loadConfig());
      const fields = opts.fields
        ? (opts.fields as string).split(",")
        : undefined;
      const result = await client.getIssue(issueKey, fields);
      console.log(formatIssue(result, getFormat(cmd)));
    });

  // ── sjira issue update ────────────────────────────────────────

  issue
    .command("update <issueKey>")
    .description("Update an issue")
    .option("-s, --summary <text>", "New summary")
    .option("-d, --description <text>", "New description (plain text)")
    .option("--priority <name>", "New priority")
    .option("--assignee <accountId>", "New assignee account ID")
    .option("--add-label <labels...>", "Labels to add")
    .option("--remove-label <labels...>", "Labels to remove")
    .option("--add-component <names...>", "Components to add")
    .option("--remove-component <names...>", "Components to remove")
    .option(
      "-f, --field <pairs...>",
      "Fields as key=value (value parsed as JSON if valid)",
    )
    .action(async (issueKey: string, opts: Record<string, unknown>) => {
      const client = new JiraClient(loadConfig());

      const fields: Record<string, unknown> = {};
      const update: Record<string, FieldOperation[]> = {};

      if (opts.summary) fields.summary = opts.summary;
      if (opts.description) {
        fields.description = textToAdf(opts.description as string);
      }
      if (opts.priority) fields.priority = { name: opts.priority };
      if (opts.assignee) fields.assignee = { accountId: opts.assignee };

      if (opts.field) {
        for (const pair of opts.field as string[]) {
          const eqIdx = pair.indexOf("=");
          if (eqIdx === -1) continue;
          const key = pair.substring(0, eqIdx);
          const raw = pair.substring(eqIdx + 1);
          try {
            fields[key] = JSON.parse(raw);
          } catch {
            fields[key] = raw;
          }
        }
      }

      const addLabel = opts.addLabel as string[] | undefined;
      const removeLabel = opts.removeLabel as string[] | undefined;
      if (addLabel || removeLabel) {
        update.labels = [
          ...(addLabel ?? []).map((l) => ({ add: l })),
          ...(removeLabel ?? []).map((l) => ({ remove: l })),
        ];
      }

      const addComp = opts.addComponent as string[] | undefined;
      const removeComp = opts.removeComponent as string[] | undefined;
      if (addComp || removeComp) {
        update.components = [
          ...(addComp ?? []).map((n) => ({ add: { name: n } })),
          ...(removeComp ?? []).map((n) => ({ remove: { name: n } })),
        ];
      }

      await client.updateIssue(issueKey, { fields, update });
      console.log(`Updated ${issueKey}`);
    });

  // ── sjira issue transition ────────────────────────────────────

  issue
    .command("transition <issueKey>")
    .description("Transition an issue to a new status")
    .option("--to <name>", "Target status or transition name")
    .option("--id <transitionId>", "Transition ID (use --list to discover)")
    .option("--list", "List available transitions")
    .action(async (issueKey: string, opts: Record<string, unknown>, cmd: Command) => {
      const client = new JiraClient(loadConfig());
      const format = getFormat(cmd);

      if (opts.list) {
        const result = await client.getTransitions(issueKey);
        console.log(formatTransitions(result.transitions, format));
        return;
      }

      if (opts.id) {
        await client.transitionIssue(issueKey, opts.id as string);
        console.log(`Transitioned ${issueKey}`);
        return;
      }

      if (!opts.to) {
        throw new Error(
          "One of --to <name>, --id <transitionId>, or --list is required",
        );
      }

      const { transitions } = await client.getTransitions(issueKey);
      const target = (opts.to as string).toLowerCase();

      // Match against transition name or target status name
      const match = transitions.find(
        (t) =>
          t.name.toLowerCase() === target ||
          t.to.name.toLowerCase() === target,
      );

      if (!match) {
        const available = transitions
          .map((t) => `${t.name} -> ${t.to.name}`)
          .join(", ");
        throw new Error(
          `No transition matching "${opts.to}". Available: ${available}`,
        );
      }

      await client.transitionIssue(issueKey, match.id);
      console.log(`Transitioned ${issueKey} to "${match.to.name}"`);
    });

  // ── sjira issue delete ────────────────────────────────────────

  issue
    .command("delete <issueKey>")
    .description("Delete an issue")
    .action(async (issueKey: string) => {
      const client = new JiraClient(loadConfig());
      await client.deleteIssue(issueKey);
      console.log(`Deleted ${issueKey}`);
    });
}
