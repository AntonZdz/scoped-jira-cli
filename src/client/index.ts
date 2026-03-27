import type { Config } from "../config.js";
import { JiraApiError, CloudIdError } from "./errors.js";
import type {
  JiraIssue,
  CreatedIssue,
  TransitionsResponse,
  JiraComment,
  CommentsPage,
  SearchRequest,
  SearchResponse,
  IssueCreateFields,
  IssueUpdatePayload,
  IssueLinkRequest,
  CreateMetaResponse,
  ProjectSearchResponse,
  BoardsResponse,
  SprintsResponse,
  JiraWorklog,
  AdfDocument,
} from "./types.js";

// ── Input validation ──────────────────────────────────────────────

const ISSUE_KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/;
const PROJECT_KEY_RE = /^[A-Z][A-Z0-9_]+$/;
const NUMERIC_ID_RE = /^\d+$/;

function validateIssueKey(key: string): string {
  if (!ISSUE_KEY_RE.test(key)) {
    throw new Error(`Invalid issue key format: "${key}". Expected format: PROJ-123`);
  }
  return encodeURIComponent(key);
}

function validateProjectKey(key: string): string {
  if (!PROJECT_KEY_RE.test(key)) {
    throw new Error(`Invalid project key format: "${key}". Expected format: PROJ`);
  }
  return encodeURIComponent(key);
}

function validateNumericId(id: string, label: string): string {
  if (!NUMERIC_ID_RE.test(id)) {
    throw new Error(`Invalid ${label}: "${id}". Expected a numeric ID.`);
  }
  return id;
}

export class JiraClient {
  private cloudId: string | null;
  private readonly authHeader: string;

  constructor(private readonly config: Config) {
    this.cloudId = config.cloudId ?? null;
    const credentials = Buffer.from(
      `${config.email}:${config.token}`,
    ).toString("base64");
    this.authHeader = `Basic ${credentials}`;
  }

  // ── Cloud ID resolution ─────────────────────────────────────────

  async resolveCloudId(): Promise<string> {
    if (this.cloudId) return this.cloudId;

    const url = `https://${this.config.site}.atlassian.net/_edge/tenant_info`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as { cloudId: string };
      if (!data.cloudId) {
        throw new Error("Response missing cloudId field");
      }
      this.cloudId = data.cloudId;
      return this.cloudId;
    } catch (err) {
      throw new CloudIdError(
        this.config.site,
        err instanceof Error ? err : undefined,
      );
    }
  }

  // ── HTTP primitives ─────────────────────────────────────────────

  private async buildUrl(path: string, apiBase = "/rest/api/3"): Promise<string> {
    const cloudId = await this.resolveCloudId();
    return `https://api.atlassian.com/ex/jira/${cloudId}${apiBase}${path}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    return this.executeRequest<T>(method, path, body, "/rest/api/3");
  }

  private async requestAgile<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    return this.executeRequest<T>(method, path, body, "/rest/agile/1.0");
  }

  private async executeRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    apiBase?: string,
  ): Promise<T> {
    const url = await this.buildUrl(path, apiBase);

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // 204 No Content — success with no body
    if (res.status === 204) {
      return undefined as T;
    }

    const text = await res.text();
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = JSON.parse(text);
    } catch {
      // non-JSON response
    }

    if (!res.ok) {
      if (parsed) {
        throw new JiraApiError(
          res.status,
          (parsed.errorMessages as string[]) ?? [],
          (parsed.errors as Record<string, string>) ?? {},
        );
      }
      throw new JiraApiError(res.status, [text || res.statusText], {});
    }

    return (parsed ?? undefined) as T;
  }

  // ── Issue operations ────────────────────────────────────────────

  async createIssue(fields: IssueCreateFields): Promise<CreatedIssue> {
    return this.request<CreatedIssue>("POST", "/issue", { fields });
  }

  async getIssue(issueKey: string, fields?: string[]): Promise<JiraIssue> {
    const safeKey = validateIssueKey(issueKey);
    const params = fields?.length ? `?fields=${fields.join(",")}` : "";
    return this.request<JiraIssue>("GET", `/issue/${safeKey}${params}`);
  }

  async updateIssue(
    issueKey: string,
    payload: IssueUpdatePayload,
  ): Promise<void> {
    return this.request<void>("PUT", `/issue/${validateIssueKey(issueKey)}`, payload);
  }

  async deleteIssue(issueKey: string): Promise<void> {
    return this.request<void>("DELETE", `/issue/${validateIssueKey(issueKey)}`);
  }

  // ── Transitions ─────────────────────────────────────────────────

  async getTransitions(issueKey: string): Promise<TransitionsResponse> {
    return this.request<TransitionsResponse>(
      "GET",
      `/issue/${validateIssueKey(issueKey)}/transitions`,
    );
  }

  async transitionIssue(
    issueKey: string,
    transitionId: string,
    fields?: Record<string, unknown>,
  ): Promise<void> {
    return this.request<void>("POST", `/issue/${validateIssueKey(issueKey)}/transitions`, {
      transition: { id: transitionId },
      ...(fields && { fields }),
    });
  }

  // ── Comments ────────────────────────────────────────────────────

  async addComment(
    issueKey: string,
    body: AdfDocument,
  ): Promise<JiraComment> {
    return this.request<JiraComment>(
      "POST",
      `/issue/${validateIssueKey(issueKey)}/comment`,
      { body },
    );
  }

  async getComments(
    issueKey: string,
    startAt = 0,
    maxResults = 50,
  ): Promise<CommentsPage> {
    const safeKey = validateIssueKey(issueKey);
    return this.request<CommentsPage>(
      "GET",
      `/issue/${safeKey}/comment?startAt=${startAt}&maxResults=${maxResults}&orderBy=-created`,
    );
  }

  // ── Links ───────────────────────────────────────────────────────

  async createLink(link: IssueLinkRequest): Promise<void> {
    return this.request<void>("POST", "/issueLink", link);
  }

  // ── Search ──────────────────────────────────────────────────────

  async search(request: SearchRequest): Promise<SearchResponse> {
    return this.request<SearchResponse>("POST", "/search/jql", request);
  }

  // ── Metadata ────────────────────────────────────────────────────

  async getCreateMeta(projectKey: string): Promise<CreateMetaResponse> {
    return this.request<CreateMetaResponse>(
      "GET",
      `/issue/createmeta/${validateProjectKey(projectKey)}/issuetypes`,
    );
  }

  // ── Assign ──────────────────────────────────────────────────────

  async assignIssue(
    issueKey: string,
    accountId: string | null,
  ): Promise<void> {
    return this.request<void>(
      "PUT",
      `/issue/${validateIssueKey(issueKey)}/assignee`,
      { accountId },
    );
  }

  // ── Worklog ─────────────────────────────────────────────────────

  async addWorklog(
    issueKey: string,
    timeSpent: string,
    comment?: AdfDocument,
  ): Promise<JiraWorklog> {
    return this.request<JiraWorklog>(
      "POST",
      `/issue/${validateIssueKey(issueKey)}/worklog`,
      { timeSpent, ...(comment && { comment }) },
    );
  }

  // ── Projects ────────────────────────────────────────────────────

  async listProjects(maxResults = 50): Promise<ProjectSearchResponse> {
    return this.request<ProjectSearchResponse>(
      "GET",
      `/project/search?maxResults=${maxResults}`,
    );
  }

  // ── Boards (Agile) ─────────────────────────────────────────────

  async listBoards(
    projectKeyOrId?: string,
    maxResults = 50,
  ): Promise<BoardsResponse> {
    const params = new URLSearchParams({ maxResults: String(maxResults) });
    if (projectKeyOrId) params.set("projectKeyOrId", projectKeyOrId);
    return this.requestAgile<BoardsResponse>("GET", `/board?${params}`);
  }

  // ── Sprints (Agile) ────────────────────────────────────────────

  async listSprints(
    boardId: string,
    state?: string,
    maxResults = 50,
  ): Promise<SprintsResponse> {
    const safeId = validateNumericId(boardId, "board ID");
    const params = new URLSearchParams({ maxResults: String(maxResults) });
    if (state) params.set("state", state);
    return this.requestAgile<SprintsResponse>(
      "GET",
      `/board/${safeId}/sprint?${params}`,
    );
  }

  async addToSprint(sprintId: string, issueKeys: string[]): Promise<void> {
    const safeId = validateNumericId(sprintId, "sprint ID");
    issueKeys.forEach((k) => validateIssueKey(k));
    return this.requestAgile<void>("POST", `/sprint/${safeId}/issue`, {
      issues: issueKeys,
    });
  }

  // ── Epics (Agile) ──────────────────────────────────────────────

  async addToEpic(epicKey: string, issueKeys: string[]): Promise<void> {
    const safeKey = validateIssueKey(epicKey);
    issueKeys.forEach((k) => validateIssueKey(k));
    return this.requestAgile<void>("POST", `/epic/${safeKey}/issue`, {
      issues: issueKeys,
    });
  }
}
