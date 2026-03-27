import type {
  JiraIssue,
  JiraComment,
  JiraTransition,
  CreatedIssue,
  SearchResponse,
  JiraProjectDetail,
  JiraBoard,
  JiraSprint,
  JiraWorklog,
} from "../client/types.js";
import { adfToText } from "./adf.js";

export type OutputFormat = "json" | "plain";

// ── Issue formatting ──────────────────────────────────────────────

export function formatIssue(issue: JiraIssue, format: OutputFormat): string {
  if (format === "json") return JSON.stringify(issue, null, 2);

  const f = issue.fields;
  const lines = [
    `${issue.key}  ${f.summary}`,
    `Status:    ${f.status.name}`,
    `Type:      ${f.issuetype.name}`,
    `Priority:  ${f.priority?.name ?? "None"}`,
    `Assignee:  ${f.assignee?.displayName ?? "Unassigned"}`,
    `Reporter:  ${f.reporter?.displayName ?? "Unknown"}`,
    `Labels:    ${f.labels?.length ? f.labels.join(", ") : "None"}`,
    `Created:   ${f.created}`,
    `Updated:   ${f.updated}`,
  ];

  const description = adfToText(f.description);
  if (description) {
    lines.push("", "Description:", description);
  }

  return lines.join("\n");
}

export function formatIssueList(
  issues: JiraIssue[],
  format: OutputFormat,
): string {
  if (format === "json") return JSON.stringify(issues, null, 2);
  if (issues.length === 0) return "No issues found.";

  const header = "KEY\tSTATUS\tTYPE\tPRIORITY\tASSIGNEE\tSUMMARY";
  const rows = issues.map((issue) => {
    const f = issue.fields;
    return [
      issue.key,
      f.status.name,
      f.issuetype.name,
      f.priority?.name ?? "-",
      f.assignee?.displayName ?? "Unassigned",
      f.summary,
    ].join("\t");
  });

  return [header, ...rows].join("\n");
}

// ── Created issue ─────────────────────────────────────────────────

export function formatCreated(
  created: CreatedIssue,
  format: OutputFormat,
): string {
  if (format === "json") return JSON.stringify(created, null, 2);
  return `Created ${created.key}`;
}

// ── Transitions ───────────────────────────────────────────────────

export function formatTransitions(
  transitions: JiraTransition[],
  format: OutputFormat,
): string {
  if (format === "json") return JSON.stringify(transitions, null, 2);
  if (transitions.length === 0) return "No transitions available.";

  const header = "ID\tNAME\tTO STATUS";
  const rows = transitions.map((t) => `${t.id}\t${t.name}\t${t.to.name}`);
  return [header, ...rows].join("\n");
}

// ── Comments ──────────────────────────────────────────────────────

export function formatComment(
  comment: JiraComment,
  format: OutputFormat,
): string {
  if (format === "json") return JSON.stringify(comment, null, 2);

  return [
    `${comment.author.displayName}  ${comment.created}`,
    adfToText(comment.body),
  ].join("\n");
}

export function formatComments(
  comments: JiraComment[],
  format: OutputFormat,
): string {
  if (format === "json") return JSON.stringify(comments, null, 2);
  if (comments.length === 0) return "No comments.";
  return comments.map((c) => formatComment(c, "plain")).join("\n---\n");
}

// ── Search ────────────────────────────────────────────────────────

export function formatSearch(
  response: SearchResponse,
  format: OutputFormat,
): string {
  if (format === "json") return JSON.stringify(response, null, 2);
  return formatIssueList(response.issues, "plain");
}

// ── Projects ──────────────────────────────────────────────────────

export function formatProjects(
  projects: JiraProjectDetail[],
  format: OutputFormat,
): string {
  if (format === "json") return JSON.stringify(projects, null, 2);
  if (projects.length === 0) return "No projects found.";

  const header = "KEY\tNAME\tTYPE\tLEAD";
  const rows = projects.map((p) =>
    [p.key, p.name, p.projectTypeKey, p.lead?.displayName ?? "-"].join("\t"),
  );
  return [header, ...rows].join("\n");
}

// ── Boards ────────────────────────────────────────────────────────

export function formatBoards(
  boards: JiraBoard[],
  format: OutputFormat,
): string {
  if (format === "json") return JSON.stringify(boards, null, 2);
  if (boards.length === 0) return "No boards found.";

  const header = "ID\tNAME\tTYPE\tPROJECT";
  const rows = boards.map((b) =>
    [b.id, b.name, b.type, b.location?.projectKey ?? "-"].join("\t"),
  );
  return [header, ...rows].join("\n");
}

// ── Sprints ───────────────────────────────────────────────────────

export function formatSprints(
  sprints: JiraSprint[],
  format: OutputFormat,
): string {
  if (format === "json") return JSON.stringify(sprints, null, 2);
  if (sprints.length === 0) return "No sprints found.";

  const header = "ID\tNAME\tSTATE\tSTART\tEND";
  const rows = sprints.map((s) =>
    [s.id, s.name, s.state, s.startDate ?? "-", s.endDate ?? "-"].join("\t"),
  );
  return [header, ...rows].join("\n");
}

// ── Worklog ───────────────────────────────────────────────────────

export function formatWorklog(
  worklog: JiraWorklog,
  format: OutputFormat,
): string {
  if (format === "json") return JSON.stringify(worklog, null, 2);
  return `Logged ${worklog.timeSpent} (id: ${worklog.id})`;
}
