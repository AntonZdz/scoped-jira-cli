import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerIssueCommands } from "../../src/commands/issue.js";
import { registerProjectCommands } from "../../src/commands/project.js";
import { registerBoardCommands } from "../../src/commands/board.js";
import { registerSprintCommands } from "../../src/commands/sprint.js";
import { registerEpicCommands } from "../../src/commands/epic.js";
import { registerWorklogCommands } from "../../src/commands/worklog.js";

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

function parse(program: Command, args: string[]) {
  return program.parseAsync(["node", "sjira", ...args]);
}

// ── Issue assign ────────────────────────────────────────────────

describe("issue assign", () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = {
      assignIssue: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(JiraClient).mockImplementation(() => mockClient as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("assigns to an account ID", async () => {
    const program = new Command().exitOverride();
    registerIssueCommands(program);
    await parse(program, ["issue", "assign", "PROJ-1", "abc123"]);

    expect(mockClient.assignIssue).toHaveBeenCalledWith("PROJ-1", "abc123");
    expect(logSpy).toHaveBeenCalledWith("Assigned PROJ-1 to abc123");
  });

  it("unassigns when no accountId given", async () => {
    const program = new Command().exitOverride();
    registerIssueCommands(program);
    await parse(program, ["issue", "assign", "PROJ-1"]);

    expect(mockClient.assignIssue).toHaveBeenCalledWith("PROJ-1", null);
    expect(logSpy).toHaveBeenCalledWith("Unassigned PROJ-1");
  });
});

// ── Issue clone ─────────────────────────────────────────────────

describe("issue clone", () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  const fakeIssue = {
    id: "1",
    key: "PROJ-10",
    self: "...",
    fields: {
      summary: "Original issue",
      status: { id: "1", name: "Open", statusCategory: { id: 1, key: "new", name: "To Do", colorName: "blue" } },
      issuetype: { id: "1", name: "Task", subtask: false },
      project: { id: "1", key: "PROJ", name: "Project" },
      priority: { id: "3", name: "Medium" },
      assignee: null,
      reporter: null,
      description: null,
      created: "2025-01-01T00:00:00.000+0000",
      updated: "2025-01-01T00:00:00.000+0000",
      labels: ["backend"],
      components: [{ name: "API" }],
    },
  };

  beforeEach(() => {
    mockClient = {
      getIssue: vi.fn().mockResolvedValue(fakeIssue),
      createIssue: vi.fn().mockResolvedValue({ id: "2", key: "PROJ-11", self: "..." }),
      createLink: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(JiraClient).mockImplementation(() => mockClient as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("clones an issue with fields from original", async () => {
    const program = new Command().option("--json").exitOverride();
    registerIssueCommands(program);
    await parse(program, ["issue", "clone", "PROJ-10"]);

    expect(mockClient.getIssue).toHaveBeenCalledWith("PROJ-10");
    const fields = mockClient.createIssue.mock.calls[0][0];
    expect(fields.project).toEqual({ key: "PROJ" });
    expect(fields.issuetype).toEqual({ name: "Task" });
    expect(fields.summary).toBe("Clone of Original issue");
    expect(fields.labels).toEqual(["backend"]);
    expect(fields.components).toEqual([{ name: "API" }]);
  });

  it("links clone to original by default", async () => {
    const program = new Command().option("--json").exitOverride();
    registerIssueCommands(program);
    await parse(program, ["issue", "clone", "PROJ-10"]);

    expect(mockClient.createLink).toHaveBeenCalledWith({
      type: { name: "Cloners" },
      inwardIssue: { key: "PROJ-11" },
      outwardIssue: { key: "PROJ-10" },
    });
  });

  it("respects --summary override", async () => {
    const program = new Command().option("--json").exitOverride();
    registerIssueCommands(program);
    await parse(program, ["issue", "clone", "PROJ-10", "-s", "Custom name"]);

    const fields = mockClient.createIssue.mock.calls[0][0];
    expect(fields.summary).toBe("Custom name");
  });

  it("skips link with --no-link", async () => {
    const program = new Command().option("--json").exitOverride();
    registerIssueCommands(program);
    await parse(program, ["issue", "clone", "PROJ-10", "--no-link"]);

    expect(mockClient.createLink).not.toHaveBeenCalled();
  });

  it("outputs created key", async () => {
    const program = new Command().option("--json").exitOverride();
    registerIssueCommands(program);
    await parse(program, ["issue", "clone", "PROJ-10"]);

    expect(logSpy).toHaveBeenCalledWith("Created PROJ-11");
  });
});

// ── Project list ────────────────────────────────────────────────

describe("project list", () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = {
      listProjects: vi.fn().mockResolvedValue({
        startAt: 0,
        maxResults: 50,
        total: 1,
        values: [
          { id: "1", key: "PROJ", name: "My Project", projectTypeKey: "software", lead: { accountId: "x", displayName: "Alice" } },
        ],
      }),
    };
    vi.mocked(JiraClient).mockImplementation(() => mockClient as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("lists projects in plain format", async () => {
    const program = new Command().option("--json").exitOverride();
    registerProjectCommands(program);
    await parse(program, ["project", "list"]);

    expect(mockClient.listProjects).toHaveBeenCalledWith(50);
    const output = logSpy.mock.calls[0][0];
    expect(output).toContain("PROJ");
    expect(output).toContain("My Project");
  });
});

// ── Board list ──────────────────────────────────────────────────

describe("board list", () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = {
      listBoards: vi.fn().mockResolvedValue({
        maxResults: 50,
        startAt: 0,
        total: 1,
        isLast: true,
        values: [
          { id: 42, name: "PROJ board", type: "scrum", location: { projectId: 1, projectKey: "PROJ", projectName: "My Project" } },
        ],
      }),
    };
    vi.mocked(JiraClient).mockImplementation(() => mockClient as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("lists boards", async () => {
    const program = new Command().option("--json").exitOverride();
    registerBoardCommands(program);
    await parse(program, ["board", "list"]);

    expect(mockClient.listBoards).toHaveBeenCalledWith(undefined, 50);
    const output = logSpy.mock.calls[0][0];
    expect(output).toContain("42");
    expect(output).toContain("PROJ board");
    expect(output).toContain("scrum");
  });

  it("filters by project", async () => {
    const program = new Command().option("--json").exitOverride();
    registerBoardCommands(program);
    await parse(program, ["board", "list", "-p", "PROJ"]);

    expect(mockClient.listBoards).toHaveBeenCalledWith("PROJ", 50);
  });
});

// ── Sprint list / add ───────────────────────────────────────────

describe("sprint", () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = {
      listSprints: vi.fn().mockResolvedValue({
        maxResults: 50,
        startAt: 0,
        isLast: true,
        values: [
          { id: 100, name: "Sprint 1", state: "active", startDate: "2025-01-01", endDate: "2025-01-14" },
          { id: 101, name: "Sprint 2", state: "future" },
        ],
      }),
      addToSprint: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(JiraClient).mockImplementation(() => mockClient as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("lists sprints for a board", async () => {
    const program = new Command().option("--json").exitOverride();
    registerSprintCommands(program);
    await parse(program, ["sprint", "list", "-b", "42"]);

    expect(mockClient.listSprints).toHaveBeenCalledWith("42", undefined, 50);
    const output = logSpy.mock.calls[0][0];
    expect(output).toContain("Sprint 1");
    expect(output).toContain("active");
  });

  it("filters sprints by state", async () => {
    const program = new Command().option("--json").exitOverride();
    registerSprintCommands(program);
    await parse(program, ["sprint", "list", "-b", "42", "--state", "active"]);

    expect(mockClient.listSprints).toHaveBeenCalledWith("42", "active", 50);
  });

  it("adds issues to a sprint", async () => {
    const program = new Command().exitOverride();
    registerSprintCommands(program);
    await parse(program, ["sprint", "add", "100", "PROJ-1", "PROJ-2"]);

    expect(mockClient.addToSprint).toHaveBeenCalledWith("100", ["PROJ-1", "PROJ-2"]);
    expect(logSpy).toHaveBeenCalledWith("Added PROJ-1, PROJ-2 to sprint 100");
  });
});

// ── Epic add ────────────────────────────────────────────────────

describe("epic add", () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = {
      addToEpic: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(JiraClient).mockImplementation(() => mockClient as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("adds issues to an epic", async () => {
    const program = new Command().exitOverride();
    registerEpicCommands(program);
    await parse(program, ["epic", "add", "PROJ-100", "PROJ-1", "PROJ-2"]);

    expect(mockClient.addToEpic).toHaveBeenCalledWith("PROJ-100", ["PROJ-1", "PROJ-2"]);
    expect(logSpy).toHaveBeenCalledWith("Added PROJ-1, PROJ-2 to epic PROJ-100");
  });
});

// ── Worklog add ─────────────────────────────────────────────────

describe("worklog add", () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = {
      addWorklog: vi.fn().mockResolvedValue({
        id: "900",
        self: "...",
        author: { accountId: "x", displayName: "Bot" },
        timeSpent: "2h",
        timeSpentSeconds: 7200,
        created: "2025-01-01T00:00:00.000+0000",
        updated: "2025-01-01T00:00:00.000+0000",
        started: "2025-01-01T00:00:00.000+0000",
      }),
    };
    vi.mocked(JiraClient).mockImplementation(() => mockClient as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("logs time with required --time flag", async () => {
    const program = new Command().option("--json").exitOverride();
    registerWorklogCommands(program);
    await parse(program, ["worklog", "add", "PROJ-1", "-t", "2h"]);

    expect(mockClient.addWorklog).toHaveBeenCalledWith("PROJ-1", "2h", undefined);
    expect(logSpy).toHaveBeenCalledWith("Logged 2h (id: 900)");
  });

  it("includes comment when provided", async () => {
    const program = new Command().option("--json").exitOverride();
    registerWorklogCommands(program);
    await parse(program, ["worklog", "add", "PROJ-1", "-t", "1h", "-c", "Fixed the bug"]);

    const [, , comment] = mockClient.addWorklog.mock.calls[0];
    expect(comment).toBeDefined();
    expect(comment.type).toBe("doc");
  });

  it("outputs JSON when --json is set", async () => {
    const program = new Command().option("--json").exitOverride();
    registerWorklogCommands(program);
    await parse(program, ["--json", "worklog", "add", "PROJ-1", "-t", "30m"]);

    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.id).toBe("900");
    expect(output.timeSpent).toBe("2h");
  });
});
