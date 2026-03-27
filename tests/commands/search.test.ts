import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerSearchCommand } from "../../src/commands/search.js";

vi.mock("../../src/client/index.js", () => ({
  JiraClient: vi.fn(),
}));

vi.mock("../../src/config.js", () => ({
  loadConfig: vi.fn().mockReturnValue({
    site: "test",
    email: "t@t.com",
    token: "tok",
  }),
}));

import { JiraClient } from "../../src/client/index.js";

function makeProgram() {
  const program = new Command().option("--json").exitOverride();
  registerSearchCommand(program);
  return program;
}

function parse(program: Command, args: string[]) {
  return program.parseAsync(["node", "sjira", ...args]);
}

const fakeSearchResponse = {
  issues: [
    {
      id: "1",
      key: "PROJ-10",
      self: "...",
      fields: {
        summary: "Found issue",
        status: { id: "1", name: "Open", statusCategory: { id: 1, key: "new", name: "To Do", colorName: "blue" } },
        issuetype: { id: "1", name: "Task", subtask: false },
        project: { id: "1", key: "PROJ", name: "Project" },
        priority: { id: "3", name: "Medium" },
        assignee: { accountId: "x", displayName: "Dev" },
        reporter: null,
        description: null,
        created: "2025-01-01T00:00:00.000+0000",
        updated: "2025-01-01T00:00:00.000+0000",
        labels: [],
      },
    },
  ],
  nextPageToken: null,
  isLast: true,
};

describe("search", () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = {
      search: vi.fn().mockResolvedValue(fakeSearchResponse),
    };
    vi.mocked(JiraClient).mockImplementation(() => mockClient as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("sends JQL query with default limit", async () => {
    const program = makeProgram();
    await parse(program, ["search", "-j", "project = PROJ"]);

    expect(mockClient.search).toHaveBeenCalledWith({
      jql: "project = PROJ",
      maxResults: 25,
      fields: undefined,
      nextPageToken: undefined,
    });
  });

  it("passes --limit and --fields", async () => {
    const program = makeProgram();
    await parse(program, [
      "search", "-j", "status = Open",
      "--limit", "10",
      "--fields", "summary,status",
    ]);

    expect(mockClient.search).toHaveBeenCalledWith({
      jql: "status = Open",
      maxResults: 10,
      fields: ["summary", "status"],
      nextPageToken: undefined,
    });
  });

  it("passes pagination token", async () => {
    const program = makeProgram();
    await parse(program, [
      "search", "-j", "project = X",
      "--next-page", "abc123token",
    ]);

    expect(mockClient.search).toHaveBeenCalledWith(
      expect.objectContaining({ nextPageToken: "abc123token" }),
    );
  });

  it("shows pagination hint when next page exists in plain mode", async () => {
    mockClient.search.mockResolvedValue({
      ...fakeSearchResponse,
      nextPageToken: "next-tok",
      isLast: false,
    });

    const program = makeProgram();
    await parse(program, ["search", "-j", "project = X"]);

    const allOutput = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(allOutput).toContain("--next-page next-tok");
  });

  it("does not show pagination hint in json mode", async () => {
    mockClient.search.mockResolvedValue({
      ...fakeSearchResponse,
      nextPageToken: "next-tok",
    });

    const program = makeProgram();
    await parse(program, ["--json", "search", "-j", "project = X"]);

    // Only one call — the JSON output, no pagination hint
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.nextPageToken).toBe("next-tok");
  });

  it("renders issue list in plain mode", async () => {
    const program = makeProgram();
    await parse(program, ["search", "-j", "project = PROJ"]);

    const output = logSpy.mock.calls[0][0];
    expect(output).toContain("PROJ-10");
    expect(output).toContain("Found issue");
    expect(output).toContain("KEY");
  });
});
