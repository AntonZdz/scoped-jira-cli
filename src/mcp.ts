import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { JiraClient } from "./client/index.js";
import { adfToText, textToAdf } from "./utils/adf.js";
import type { JiraIssue, SearchResponse, CommentsPage, TransitionsResponse } from "./client/types.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeClient(): JiraClient {
  return new JiraClient(loadConfig());
}

function ok(data: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function formatIssue(issue: JiraIssue) {
  const f = issue.fields;
  return {
    key: issue.key,
    summary: f.summary,
    status: f.status.name,
    type: f.issuetype.name,
    priority: f.priority?.name,
    assignee: f.assignee?.displayName ?? null,
    reporter: f.reporter?.displayName ?? null,
    labels: f.labels,
    description: adfToText(f.description),
    created: f.created,
    updated: f.updated,
  };
}

function formatIssueBrief(issue: JiraIssue) {
  return {
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
    type: issue.fields.issuetype.name,
    assignee: issue.fields.assignee?.displayName ?? null,
  };
}

// ── Server ───────────────────────────────────────────────────────────

const server = new McpServer({
  name: "sjira",
  version: "0.1.0",
});

// ── Tools ────────────────────────────────────────────────────────────

server.tool(
  "get_issue",
  "Get a JIRA issue by key",
  { issueKey: z.string().describe("e.g. PROJ-123") },
  async ({ issueKey }) => ok(formatIssue(await makeClient().getIssue(issueKey))),
);

server.tool(
  "search_issues",
  "Search issues with JQL",
  {
    jql: z.string(),
    maxResults: z.number().optional().describe("Default 20"),
  },
  async ({ jql, maxResults }) => {
    const res: SearchResponse = await makeClient().search({ jql, maxResults: maxResults ?? 20 });
    return ok({
      issues: res.issues.map(formatIssueBrief),
      hasMore: !res.isLast,
    });
  },
);

server.tool(
  "create_issue",
  "Create a new JIRA issue",
  {
    project: z.string().describe("Project key, e.g. PROJ"),
    type: z.string().describe("Issue type, e.g. Task, Bug, Story"),
    summary: z.string(),
    description: z.string().optional(),
    priority: z.string().optional(),
    labels: z.array(z.string()).optional(),
  },
  async ({ project, type, summary, description, priority, labels }) => {
    const fields: Record<string, unknown> = {
      project: { key: project },
      issuetype: { name: type },
      summary,
    };
    if (description) fields.description = textToAdf(description);
    if (priority) fields.priority = { name: priority };
    if (labels) fields.labels = labels;
    const created = await makeClient().createIssue(fields as any);
    return ok({ key: created.key, id: created.id });
  },
);

server.tool(
  "update_issue",
  "Update fields on a JIRA issue",
  {
    issueKey: z.string(),
    summary: z.string().optional(),
    description: z.string().optional(),
    priority: z.string().optional(),
    labels: z.array(z.string()).optional(),
    customFields: z.record(z.string(), z.unknown()).optional().describe("Additional fields as key-value pairs"),
  },
  async ({ issueKey, summary, description, priority, labels, customFields }) => {
    const fields: Record<string, unknown> = { ...customFields };
    if (summary) fields.summary = summary;
    if (description) fields.description = textToAdf(description);
    if (priority) fields.priority = { name: priority };
    if (labels) fields.labels = labels;
    await makeClient().updateIssue(issueKey, { fields });
    return ok({ updated: issueKey });
  },
);

server.tool(
  "transition_issue",
  "Move an issue to a new status",
  {
    issueKey: z.string(),
    transitionId: z.string().optional().describe("Transition ID — omit to list available transitions"),
  },
  async ({ issueKey, transitionId }) => {
    const client = makeClient();
    if (!transitionId) {
      const res: TransitionsResponse = await client.getTransitions(issueKey);
      return ok(res.transitions.map((t) => ({ id: t.id, name: t.name, to: t.to.name })));
    }
    await client.transitionIssue(issueKey, transitionId);
    return ok({ transitioned: issueKey });
  },
);

server.tool(
  "add_comment",
  "Add a comment to an issue",
  {
    issueKey: z.string(),
    body: z.string(),
  },
  async ({ issueKey, body }) => {
    const comment = await makeClient().addComment(issueKey, textToAdf(body));
    return ok({ id: comment.id, created: comment.created });
  },
);

server.tool(
  "get_comments",
  "List comments on an issue",
  {
    issueKey: z.string(),
    maxResults: z.number().optional().describe("Default 20"),
  },
  async ({ issueKey, maxResults }) => {
    const res: CommentsPage = await makeClient().getComments(issueKey, 0, maxResults ?? 20);
    return ok(res.comments.map((c) => ({
      id: c.id,
      author: c.author.displayName,
      body: adfToText(c.body),
      created: c.created,
    })));
  },
);

server.tool(
  "assign_issue",
  "Assign an issue to a user or unassign",
  {
    issueKey: z.string(),
    accountId: z.string().nullable().describe("User account ID, or null to unassign"),
  },
  async ({ issueKey, accountId }) => {
    await makeClient().assignIssue(issueKey, accountId);
    return ok({ assigned: issueKey, accountId });
  },
);

server.tool(
  "link_issues",
  "Create a link between two issues",
  {
    linkType: z.string().describe("e.g. Blocks, Duplicate, Relates"),
    inwardIssue: z.string().describe("Issue key"),
    outwardIssue: z.string().describe("Issue key"),
  },
  async ({ linkType, inwardIssue, outwardIssue }) => {
    await makeClient().createLink({
      type: { name: linkType },
      inwardIssue: { key: inwardIssue },
      outwardIssue: { key: outwardIssue },
    });
    return ok({ linked: true });
  },
);

server.tool(
  "list_projects",
  "List accessible JIRA projects",
  {},
  async () => {
    const res = await makeClient().listProjects();
    return ok(res.values.map((p) => ({ key: p.key, name: p.name })));
  },
);

server.tool(
  "list_sprints",
  "List sprints for a board",
  {
    boardId: z.string(),
    state: z.enum(["active", "future", "closed"]).optional(),
  },
  async ({ boardId, state }) => {
    const res = await makeClient().listSprints(boardId, state);
    return ok(res.values.map((s) => ({
      id: s.id,
      name: s.name,
      state: s.state,
      startDate: s.startDate,
      endDate: s.endDate,
      goal: s.goal,
    })));
  },
);

server.tool(
  "add_worklog",
  "Log time on an issue",
  {
    issueKey: z.string(),
    timeSpent: z.string().describe("e.g. 2h, 30m, 1d"),
    comment: z.string().optional(),
  },
  async ({ issueKey, timeSpent, comment }) => {
    const worklog = await makeClient().addWorklog(
      issueKey,
      timeSpent,
      comment ? textToAdf(comment) : undefined,
    );
    return ok({ id: worklog.id, timeSpent: worklog.timeSpent });
  },
);

// ── Start ────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
