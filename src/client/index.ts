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
  AdfDocument,
} from "./types.js";

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

  private async gatewayUrl(path: string): Promise<string> {
    const cloudId = await this.resolveCloudId();
    return `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3${path}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = await this.gatewayUrl(path);

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
    const params = fields?.length ? `?fields=${fields.join(",")}` : "";
    return this.request<JiraIssue>("GET", `/issue/${issueKey}${params}`);
  }

  async updateIssue(
    issueKey: string,
    payload: IssueUpdatePayload,
  ): Promise<void> {
    return this.request<void>("PUT", `/issue/${issueKey}`, payload);
  }

  async deleteIssue(issueKey: string): Promise<void> {
    return this.request<void>("DELETE", `/issue/${issueKey}`);
  }

  // ── Transitions ─────────────────────────────────────────────────

  async getTransitions(issueKey: string): Promise<TransitionsResponse> {
    return this.request<TransitionsResponse>(
      "GET",
      `/issue/${issueKey}/transitions`,
    );
  }

  async transitionIssue(
    issueKey: string,
    transitionId: string,
    fields?: Record<string, unknown>,
  ): Promise<void> {
    return this.request<void>("POST", `/issue/${issueKey}/transitions`, {
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
      `/issue/${issueKey}/comment`,
      { body },
    );
  }

  async getComments(
    issueKey: string,
    startAt = 0,
    maxResults = 50,
  ): Promise<CommentsPage> {
    return this.request<CommentsPage>(
      "GET",
      `/issue/${issueKey}/comment?startAt=${startAt}&maxResults=${maxResults}&orderBy=-created`,
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
      `/issue/createmeta/${projectKey}/issuetypes`,
    );
  }
}
