import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerIssueCommands } from "../../src/commands/issue.js";

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
  registerIssueCommands(program);
  return program;
}

function parse(program: Command, args: string[]) {
  return program.parseAsync(["node", "sjira", ...args]);
}

describe("issue create", () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = {
      createIssue: vi.fn().mockResolvedValue({ id: "1", key: "PROJ-1", self: "..." }),
      getIssue: vi.fn(),
      updateIssue: vi.fn().mockResolvedValue(undefined),
      deleteIssue: vi.fn().mockResolvedValue(undefined),
      getTransitions: vi.fn(),
      transitionIssue: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(JiraClient).mockImplementation(() => mockClient as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("assembles basic fields correctly", async () => {
    const program = makeProgram();
    await parse(program, [
      "issue", "create",
      "-p", "PROJ", "-t", "Bug", "-s", "Title",
    ]);

    expect(mockClient.createIssue).toHaveBeenCalledOnce();
    const fields = mockClient.createIssue.mock.calls[0][0];
    expect(fields.project).toEqual({ key: "PROJ" });
    expect(fields.issuetype).toEqual({ name: "Bug" });
    expect(fields.summary).toBe("Title");
  });

  it("converts description to ADF", async () => {
    const program = makeProgram();
    await parse(program, [
      "issue", "create",
      "-p", "X", "-t", "Task", "-s", "T",
      "-d", "Hello world",
    ]);

    const fields = mockClient.createIssue.mock.calls[0][0];
    expect(fields.description).toEqual({
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    });
  });

  it("passes priority, assignee, labels, and components", async () => {
    const program = makeProgram();
    await parse(program, [
      "issue", "create",
      "-p", "X", "-t", "Task", "-s", "T",
      "--priority", "High",
      "--assignee", "abc123",
      "-l", "one", "two",
      "--component", "API", "UI",
    ]);

    const fields = mockClient.createIssue.mock.calls[0][0];
    expect(fields.priority).toEqual({ name: "High" });
    expect(fields.assignee).toEqual({ accountId: "abc123" });
    expect(fields.labels).toEqual(["one", "two"]);
    expect(fields.components).toEqual([{ name: "API" }, { name: "UI" }]);
  });

  it("parses custom field value as JSON when valid", async () => {
    const program = makeProgram();
    await parse(program, [
      "issue", "create",
      "-p", "X", "-t", "Task", "-s", "T",
      "-f", 'customfield_100={"name":"v1.0"}',
    ]);

    const fields = mockClient.createIssue.mock.calls[0][0];
    expect(fields.customfield_100).toEqual({ name: "v1.0" });
  });

  it("keeps custom field value as string when not valid JSON", async () => {
    const program = makeProgram();
    await parse(program, [
      "issue", "create",
      "-p", "X", "-t", "Task", "-s", "T",
      "-f", "customfield_200=just a string",
    ]);

    const fields = mockClient.createIssue.mock.calls[0][0];
    expect(fields.customfield_200).toBe("just a string");
  });

  it("outputs created key in plain mode", async () => {
    const program = makeProgram();
    await parse(program, [
      "issue", "create", "-p", "X", "-t", "Task", "-s", "T",
    ]);

    expect(logSpy).toHaveBeenCalledWith("Created PROJ-1");
  });

  it("outputs JSON in json mode", async () => {
    const program = makeProgram();
    await parse(program, [
      "--json", "issue", "create", "-p", "X", "-t", "Task", "-s", "T",
    ]);

    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.key).toBe("PROJ-1");
  });
});

describe("issue get", () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  const fakeIssue = {
    id: "1",
    key: "PROJ-5",
    self: "...",
    fields: {
      summary: "Test",
      status: { id: "1", name: "Open", statusCategory: { id: 1, key: "new", name: "To Do", colorName: "blue" } },
      issuetype: { id: "1", name: "Task", subtask: false },
      project: { id: "1", key: "PROJ", name: "Project" },
      priority: { id: "3", name: "Medium" },
      assignee: null,
      reporter: null,
      description: null,
      created: "2025-01-01T00:00:00.000+0000",
      updated: "2025-01-01T00:00:00.000+0000",
      labels: [],
    },
  };

  beforeEach(() => {
    mockClient = {
      createIssue: vi.fn(),
      getIssue: vi.fn().mockResolvedValue(fakeIssue),
      updateIssue: vi.fn(),
      deleteIssue: vi.fn(),
      getTransitions: vi.fn(),
      transitionIssue: vi.fn(),
    };
    vi.mocked(JiraClient).mockImplementation(() => mockClient as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("calls getIssue with the key", async () => {
    const program = makeProgram();
    await parse(program, ["issue", "get", "PROJ-5"]);

    expect(mockClient.getIssue).toHaveBeenCalledWith("PROJ-5", undefined);
  });

  it("passes field filter when --fields is set", async () => {
    const program = makeProgram();
    await parse(program, ["issue", "get", "PROJ-5", "--fields", "summary,status"]);

    expect(mockClient.getIssue).toHaveBeenCalledWith("PROJ-5", ["summary", "status"]);
  });
});

describe("issue update", () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = {
      createIssue: vi.fn(),
      getIssue: vi.fn(),
      updateIssue: vi.fn().mockResolvedValue(undefined),
      deleteIssue: vi.fn(),
      getTransitions: vi.fn(),
      transitionIssue: vi.fn(),
    };
    vi.mocked(JiraClient).mockImplementation(() => mockClient as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("sets fields for summary, description, priority, assignee", async () => {
    const program = makeProgram();
    await parse(program, [
      "issue", "update", "PROJ-1",
      "-s", "New title",
      "-d", "New desc",
      "--priority", "Low",
      "--assignee", "user123",
    ]);

    const payload = mockClient.updateIssue.mock.calls[0][1];
    expect(payload.fields.summary).toBe("New title");
    expect(payload.fields.description.type).toBe("doc");
    expect(payload.fields.priority).toEqual({ name: "Low" });
    expect(payload.fields.assignee).toEqual({ accountId: "user123" });
  });

  it("builds label add/remove operations", async () => {
    const program = makeProgram();
    await parse(program, [
      "issue", "update", "PROJ-1",
      "--add-label", "new-label",
      "--remove-label", "old-label",
    ]);

    const payload = mockClient.updateIssue.mock.calls[0][1];
    expect(payload.update.labels).toEqual([
      { add: "new-label" },
      { remove: "old-label" },
    ]);
  });

  it("builds component add/remove operations", async () => {
    const program = makeProgram();
    await parse(program, [
      "issue", "update", "PROJ-1",
      "--add-component", "Backend",
      "--remove-component", "Frontend",
    ]);

    const payload = mockClient.updateIssue.mock.calls[0][1];
    expect(payload.update.components).toEqual([
      { add: { name: "Backend" } },
      { remove: { name: "Frontend" } },
    ]);
  });

  it("parses custom fields with JSON fallback", async () => {
    const program = makeProgram();
    await parse(program, [
      "issue", "update", "PROJ-1",
      "-f", "customfield_1=42", "-f", "customfield_2=plain",
    ]);

    const payload = mockClient.updateIssue.mock.calls[0][1];
    expect(payload.fields.customfield_1).toBe(42); // parsed as JSON number
    expect(payload.fields.customfield_2).toBe("plain"); // kept as string
  });

  it("outputs confirmation message", async () => {
    const program = makeProgram();
    await parse(program, ["issue", "update", "PROJ-1", "-s", "X"]);

    expect(logSpy).toHaveBeenCalledWith("Updated PROJ-1");
  });
});

describe("issue transition", () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  const fakeTransitions = {
    transitions: [
      {
        id: "21",
        name: "Start Progress",
        hasScreen: false,
        isGlobal: false,
        isAvailable: true,
        to: {
          id: "3",
          name: "In Progress",
          statusCategory: { id: 4, key: "indeterminate", name: "In Progress", colorName: "yellow" },
        },
      },
      {
        id: "31",
        name: "Done",
        hasScreen: false,
        isGlobal: false,
        isAvailable: true,
        to: {
          id: "5",
          name: "Done",
          statusCategory: { id: 3, key: "done", name: "Done", colorName: "green" },
        },
      },
    ],
  };

  beforeEach(() => {
    mockClient = {
      createIssue: vi.fn(),
      getIssue: vi.fn(),
      updateIssue: vi.fn(),
      deleteIssue: vi.fn(),
      getTransitions: vi.fn().mockResolvedValue(fakeTransitions),
      transitionIssue: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(JiraClient).mockImplementation(() => mockClient as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("--list displays available transitions", async () => {
    const program = makeProgram();
    await parse(program, ["issue", "transition", "PROJ-1", "--list"]);

    expect(mockClient.getTransitions).toHaveBeenCalledWith("PROJ-1");
    const output = logSpy.mock.calls[0][0];
    expect(output).toContain("Start Progress");
    expect(output).toContain("In Progress");
    expect(output).toContain("Done");
  });

  it("--to matches by transition name", async () => {
    const program = makeProgram();
    await parse(program, ["issue", "transition", "PROJ-1", "--to", "Start Progress"]);

    expect(mockClient.transitionIssue).toHaveBeenCalledWith("PROJ-1", "21");
  });

  it("--to matches by target status name", async () => {
    const program = makeProgram();
    await parse(program, ["issue", "transition", "PROJ-1", "--to", "In Progress"]);

    expect(mockClient.transitionIssue).toHaveBeenCalledWith("PROJ-1", "21");
  });

  it("--to matching is case-insensitive", async () => {
    const program = makeProgram();
    await parse(program, ["issue", "transition", "PROJ-1", "--to", "done"]);

    expect(mockClient.transitionIssue).toHaveBeenCalledWith("PROJ-1", "31");
  });

  it("--to throws when no transition matches", async () => {
    const program = makeProgram();
    await expect(
      parse(program, ["issue", "transition", "PROJ-1", "--to", "Nonexistent"]),
    ).rejects.toThrow(/No transition matching "Nonexistent"/);
  });

  it("--id uses the transition ID directly", async () => {
    const program = makeProgram();
    await parse(program, ["issue", "transition", "PROJ-1", "--id", "21"]);

    expect(mockClient.transitionIssue).toHaveBeenCalledWith("PROJ-1", "21");
    // Should not fetch transitions when ID is provided
    expect(mockClient.getTransitions).not.toHaveBeenCalled();
  });

  it("throws when neither --to, --id, nor --list is provided", async () => {
    const program = makeProgram();
    await expect(
      parse(program, ["issue", "transition", "PROJ-1"]),
    ).rejects.toThrow(/--to.*--id.*--list/);
  });
});

describe("issue delete", () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = {
      createIssue: vi.fn(),
      getIssue: vi.fn(),
      updateIssue: vi.fn(),
      deleteIssue: vi.fn().mockResolvedValue(undefined),
      getTransitions: vi.fn(),
      transitionIssue: vi.fn(),
    };
    vi.mocked(JiraClient).mockImplementation(() => mockClient as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("calls deleteIssue and confirms", async () => {
    const program = makeProgram();
    await parse(program, ["issue", "delete", "PROJ-99"]);

    expect(mockClient.deleteIssue).toHaveBeenCalledWith("PROJ-99");
    expect(logSpy).toHaveBeenCalledWith("Deleted PROJ-99");
  });
});
