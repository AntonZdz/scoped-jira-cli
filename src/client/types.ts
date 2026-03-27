// ── Atlassian Document Format ────────────────────────────────────────

export interface AdfDocument {
  version: 1;
  type: "doc";
  content: AdfNode[];
}

export interface AdfNode {
  type: string;
  content?: AdfNode[];
  text?: string;
  marks?: AdfMark[];
  attrs?: Record<string, unknown>;
}

export interface AdfMark {
  type: string;
  attrs?: Record<string, unknown>;
}

// ── Common entities ─────────────────────────────────────────────────

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
}

export interface JiraStatus {
  id: string;
  name: string;
  statusCategory: {
    id: number;
    key: string;
    name: string;
    colorName: string;
  };
}

export interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
  description?: string;
}

export interface JiraPriority {
  id: string;
  name: string;
}

export interface JiraComponent {
  id?: string;
  name: string;
}

// ── Issue ───────────────────────────────────────────────────────────

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: JiraIssueFields;
}

export interface JiraIssueFields {
  summary: string;
  status: JiraStatus;
  issuetype: JiraIssueType;
  project: JiraProject;
  priority?: JiraPriority;
  assignee?: JiraUser | null;
  reporter?: JiraUser | null;
  description?: AdfDocument | null;
  created: string;
  updated: string;
  labels: string[];
  components?: JiraComponent[];
  [key: string]: unknown;
}

export interface CreatedIssue {
  id: string;
  key: string;
  self: string;
}

// ── Issue create / update payloads ──────────────────────────────────

export interface IssueCreateFields {
  project: { key: string };
  issuetype: { name: string };
  summary: string;
  description?: AdfDocument;
  priority?: { name: string };
  assignee?: { accountId: string };
  labels?: string[];
  components?: { name: string }[];
  [key: string]: unknown;
}

export interface IssueUpdatePayload {
  fields?: Record<string, unknown>;
  update?: Record<string, FieldOperation[]>;
}

export interface FieldOperation {
  set?: unknown;
  add?: unknown;
  remove?: unknown;
}

// ── Transitions ─────────────────────────────────────────────────────

export interface JiraTransition {
  id: string;
  name: string;
  hasScreen: boolean;
  isGlobal: boolean;
  isAvailable: boolean;
  to: JiraStatus;
}

export interface TransitionsResponse {
  transitions: JiraTransition[];
}

// ── Comments ────────────────────────────────────────────────────────

export interface JiraComment {
  id: string;
  self: string;
  author: JiraUser;
  body: AdfDocument;
  created: string;
  updated: string;
}

export interface CommentsPage {
  startAt: number;
  maxResults: number;
  total: number;
  comments: JiraComment[];
}

// ── Search ──────────────────────────────────────────────────────────

export interface SearchRequest {
  jql: string;
  maxResults?: number;
  fields?: string[];
  nextPageToken?: string;
}

export interface SearchResponse {
  issues: JiraIssue[];
  nextPageToken?: string | null;
  isLast?: boolean;
}

// ── Links ───────────────────────────────────────────────────────────

export interface IssueLinkRequest {
  type: { name: string };
  inwardIssue: { key: string };
  outwardIssue: { key: string };
  comment?: { body: AdfDocument };
}

// ── Metadata ────────────────────────────────────────────────────────

export interface CreateMetaIssueType {
  id: string;
  name: string;
  subtask: boolean;
  description?: string;
}

export interface CreateMetaResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issueTypes: CreateMetaIssueType[];
}
