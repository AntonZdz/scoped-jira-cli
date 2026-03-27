import { describe, it, expect, vi, beforeEach } from "vitest";
import { JiraClient } from "../../src/client/index.js";
import { JiraApiError, CloudIdError } from "../../src/client/errors.js";
import type { Config } from "../../src/config.js";

const mockConfig: Config = {
  site: "testsite",
  email: "test@example.com",
  token: "scoped-token-123",
};

const mockConfigWithCloudId: Config = {
  ...mockConfig,
  cloudId: "cloud-uuid-abc",
};

function mockFetch(responses: Array<{ status: number; body?: unknown; text?: string }>) {
  let callIndex = 0;
  return vi.fn(async () => {
    const resp = responses[callIndex++] ?? responses[responses.length - 1];
    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      statusText: resp.status === 200 ? "OK" : "Error",
      text: async () =>
        resp.text ?? (resp.body !== undefined ? JSON.stringify(resp.body) : ""),
      json: async () => resp.body,
    };
  });
}

describe("JiraClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Cloud ID resolution", () => {
    it("auto-discovers Cloud ID from tenant_info endpoint", async () => {
      const fetchMock = mockFetch([
        { status: 200, body: { cloudId: "discovered-uuid" } },
        { status: 200, body: { id: "10000", key: "PROJ-1", self: "...", fields: {} } },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new JiraClient(mockConfig);
      await client.getIssue("PROJ-1");

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const firstCallUrl = fetchMock.mock.calls[0][0];
      expect(firstCallUrl).toBe("https://testsite.atlassian.net/_edge/tenant_info");

      const secondCallUrl = fetchMock.mock.calls[1][0];
      expect(secondCallUrl).toContain("discovered-uuid");
      expect(secondCallUrl).toContain("/rest/api/3/issue/PROJ-1");
    });

    it("uses provided Cloud ID without discovery", async () => {
      const fetchMock = mockFetch([
        { status: 200, body: { id: "10000", key: "PROJ-1", self: "...", fields: {} } },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new JiraClient(mockConfigWithCloudId);
      await client.getIssue("PROJ-1");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callUrl = fetchMock.mock.calls[0][0];
      expect(callUrl).toContain("cloud-uuid-abc");
    });

    it("caches Cloud ID across calls", async () => {
      const fetchMock = mockFetch([
        { status: 200, body: { cloudId: "cached-uuid" } },
        { status: 200, body: { id: "1", key: "AA-1", self: "...", fields: {} } },
        { status: 200, body: { id: "2", key: "AA-2", self: "...", fields: {} } },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new JiraClient(mockConfig);
      await client.getIssue("AA-1");
      await client.getIssue("AA-2");

      // tenant_info called once, then two API calls = 3 total
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("throws CloudIdError when resolution fails", async () => {
      const fetchMock = mockFetch([{ status: 404 }]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new JiraClient(mockConfig);
      await expect(client.getIssue("PROJ-1")).rejects.toThrow(CloudIdError);
    });
  });

  describe("gateway URL construction", () => {
    it("routes through api.atlassian.com gateway", async () => {
      const fetchMock = mockFetch([
        { status: 200, body: { id: "10000", key: "PROJ-1", self: "...", fields: {} } },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new JiraClient(mockConfigWithCloudId);
      await client.getIssue("PROJ-1");

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toBe(
        "https://api.atlassian.com/ex/jira/cloud-uuid-abc/rest/api/3/issue/PROJ-1",
      );
    });
  });

  describe("authentication", () => {
    it("sends Basic auth header with email:token", async () => {
      const fetchMock = mockFetch([
        { status: 200, body: { id: "10000", key: "PROJ-1", self: "...", fields: {} } },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new JiraClient(mockConfigWithCloudId);
      await client.getIssue("PROJ-1");

      const options = fetchMock.mock.calls[0][1] as RequestInit;
      const expected = Buffer.from("test@example.com:scoped-token-123").toString("base64");
      expect((options.headers as Record<string, string>).Authorization).toBe(
        `Basic ${expected}`,
      );
    });
  });

  describe("error handling", () => {
    it("throws JiraApiError with parsed error messages", async () => {
      const fetchMock = mockFetch([
        {
          status: 400,
          body: {
            errorMessages: ["Field 'summary' is required"],
            errors: { summary: "You must specify a summary." },
          },
        },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new JiraClient(mockConfigWithCloudId);
      try {
        await client.createIssue({
          project: { key: "PROJ" },
          issuetype: { name: "Task" },
          summary: "",
        });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(JiraApiError);
        const apiErr = err as JiraApiError;
        expect(apiErr.status).toBe(400);
        expect(apiErr.errorMessages).toContain("Field 'summary' is required");
        expect(apiErr.fieldErrors.summary).toBe("You must specify a summary.");
      }
    });

    it("handles 204 No Content responses", async () => {
      const fetchMock = mockFetch([{ status: 204 }]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new JiraClient(mockConfigWithCloudId);
      // updateIssue returns void (204)
      await expect(
        client.updateIssue("PROJ-1", { fields: { summary: "New" } }),
      ).resolves.toBeUndefined();
    });

    it("handles non-JSON error responses", async () => {
      const fetchMock = mockFetch([
        { status: 502, text: "Bad Gateway" },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new JiraClient(mockConfigWithCloudId);
      await expect(client.getIssue("PROJ-1")).rejects.toThrow(JiraApiError);
    });
  });

  describe("API methods", () => {
    it("createIssue sends POST with fields", async () => {
      const fetchMock = mockFetch([
        { status: 201, body: { id: "10001", key: "PROJ-1", self: "..." } },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new JiraClient(mockConfigWithCloudId);
      const result = await client.createIssue({
        project: { key: "PROJ" },
        issuetype: { name: "Bug" },
        summary: "Something broke",
      });

      expect(result.key).toBe("PROJ-1");
      const options = fetchMock.mock.calls[0][1] as RequestInit;
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body as string);
      expect(body.fields.summary).toBe("Something broke");
      expect(body.fields.issuetype.name).toBe("Bug");
    });

    it("search sends POST to /search/jql", async () => {
      const fetchMock = mockFetch([
        {
          status: 200,
          body: {
            issues: [{ id: "1", key: "PROJ-1", self: "...", fields: {} }],
            nextPageToken: null,
            isLast: true,
          },
        },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new JiraClient(mockConfigWithCloudId);
      const result = await client.search({
        jql: "project = PROJ",
        maxResults: 10,
      });

      expect(result.issues).toHaveLength(1);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("/search/jql");
    });

    it("transitionIssue sends transition ID", async () => {
      const fetchMock = mockFetch([{ status: 204 }]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new JiraClient(mockConfigWithCloudId);
      await client.transitionIssue("PROJ-1", "21");

      const options = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.transition.id).toBe("21");
    });

    it("addComment sends ADF body", async () => {
      const fetchMock = mockFetch([
        {
          status: 201,
          body: {
            id: "100",
            self: "...",
            author: { accountId: "abc", displayName: "Bot" },
            body: { version: 1, type: "doc", content: [] },
            created: "2025-01-01T00:00:00.000+0000",
            updated: "2025-01-01T00:00:00.000+0000",
          },
        },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new JiraClient(mockConfigWithCloudId);
      const adf = {
        version: 1 as const,
        type: "doc" as const,
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
        ],
      };
      const result = await client.addComment("PROJ-1", adf);

      expect(result.id).toBe("100");
      const options = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.body.type).toBe("doc");
    });

    it("createLink sends inward/outward keys and type", async () => {
      const fetchMock = mockFetch([{ status: 201, body: {} }]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new JiraClient(mockConfigWithCloudId);
      await client.createLink({
        type: { name: "Blocks" },
        inwardIssue: { key: "PROJ-1" },
        outwardIssue: { key: "PROJ-2" },
      });

      const options = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.type.name).toBe("Blocks");
      expect(body.inwardIssue.key).toBe("PROJ-1");
      expect(body.outwardIssue.key).toBe("PROJ-2");
    });
  });

  describe("input validation", () => {
    it("rejects issue key with path traversal", async () => {
      const client = new JiraClient(mockConfigWithCloudId);
      await expect(client.getIssue("x/../../../search/jql")).rejects.toThrow(
        /Invalid issue key format/,
      );
    });

    it("rejects issue key with slashes", async () => {
      const client = new JiraClient(mockConfigWithCloudId);
      await expect(client.getIssue("PROJ/1")).rejects.toThrow(
        /Invalid issue key format/,
      );
    });

    it("rejects issue key with URL-encoded characters", async () => {
      const client = new JiraClient(mockConfigWithCloudId);
      await expect(client.getIssue("PROJ%2F1")).rejects.toThrow(
        /Invalid issue key format/,
      );
    });

    it("rejects lowercase issue key", async () => {
      const client = new JiraClient(mockConfigWithCloudId);
      await expect(client.getIssue("proj-1")).rejects.toThrow(
        /Invalid issue key format/,
      );
    });

    it("accepts valid issue keys", async () => {
      const fetchMock = mockFetch([
        { status: 200, body: { id: "1", key: "PROJ-1", self: "...", fields: {} } },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new JiraClient(mockConfigWithCloudId);
      await client.getIssue("PROJ-123");

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("/issue/PROJ-123");
    });

    it("validates issue key across all methods", async () => {
      const client = new JiraClient(mockConfigWithCloudId);
      const bad = "x/../hack";

      await expect(client.getIssue(bad)).rejects.toThrow(/Invalid issue key/);
      await expect(client.updateIssue(bad, {})).rejects.toThrow(/Invalid issue key/);
      await expect(client.deleteIssue(bad)).rejects.toThrow(/Invalid issue key/);
      await expect(client.getTransitions(bad)).rejects.toThrow(/Invalid issue key/);
      await expect(client.transitionIssue(bad, "1")).rejects.toThrow(/Invalid issue key/);
      await expect(
        client.addComment(bad, { version: 1, type: "doc", content: [] }),
      ).rejects.toThrow(/Invalid issue key/);
      await expect(client.getComments(bad)).rejects.toThrow(/Invalid issue key/);
    });
  });
});
