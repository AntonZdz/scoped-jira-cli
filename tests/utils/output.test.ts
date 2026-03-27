import { describe, it, expect } from "vitest";
import {
  formatIssue,
  formatIssueList,
  formatCreated,
  formatTransitions,
  formatComment,
  formatComments,
} from "../../src/utils/output.js";
import type {
  JiraIssue,
  JiraComment,
  JiraTransition,
  CreatedIssue,
} from "../../src/client/types.js";

function makeIssue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    id: "10001",
    key: "PROJ-123",
    self: "https://test.atlassian.net/rest/api/3/issue/10001",
    fields: {
      summary: "Test issue",
      status: {
        id: "1",
        name: "To Do",
        statusCategory: { id: 2, key: "new", name: "To Do", colorName: "blue-gray" },
      },
      issuetype: { id: "10001", name: "Task", subtask: false },
      project: { id: "10000", key: "PROJ", name: "Project" },
      priority: { id: "3", name: "Medium" },
      assignee: { accountId: "abc123", displayName: "Jane Doe" },
      reporter: { accountId: "def456", displayName: "John Smith" },
      description: null,
      created: "2025-01-15T10:00:00.000+0000",
      updated: "2025-01-16T14:00:00.000+0000",
      labels: ["backend", "urgent"],
    },
    ...overrides,
  };
}

describe("formatIssue", () => {
  it("formats as JSON", () => {
    const issue = makeIssue();
    const result = formatIssue(issue, "json");
    const parsed = JSON.parse(result);
    expect(parsed.key).toBe("PROJ-123");
    expect(parsed.fields.summary).toBe("Test issue");
  });

  it("formats as plain text with key fields", () => {
    const issue = makeIssue();
    const result = formatIssue(issue, "plain");
    expect(result).toContain("PROJ-123");
    expect(result).toContain("Test issue");
    expect(result).toContain("To Do");
    expect(result).toContain("Task");
    expect(result).toContain("Medium");
    expect(result).toContain("Jane Doe");
    expect(result).toContain("backend, urgent");
  });

  it("shows Unassigned when assignee is null", () => {
    const issue = makeIssue();
    issue.fields.assignee = null;
    const result = formatIssue(issue, "plain");
    expect(result).toContain("Unassigned");
  });
});

describe("formatIssueList", () => {
  it("formats empty list", () => {
    expect(formatIssueList([], "plain")).toBe("No issues found.");
  });

  it("formats list with header row", () => {
    const issues = [makeIssue()];
    const result = formatIssueList(issues, "plain");
    const lines = result.split("\n");
    expect(lines[0]).toContain("KEY");
    expect(lines[0]).toContain("STATUS");
    expect(lines[1]).toContain("PROJ-123");
    expect(lines[1]).toContain("To Do");
  });

  it("formats as JSON array", () => {
    const issues = [makeIssue()];
    const result = formatIssueList(issues, "json");
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].key).toBe("PROJ-123");
  });
});

describe("formatCreated", () => {
  const created: CreatedIssue = {
    id: "10001",
    key: "PROJ-456",
    self: "https://test.atlassian.net/rest/api/3/issue/10001",
  };

  it("formats as plain text", () => {
    expect(formatCreated(created, "plain")).toBe("Created PROJ-456");
  });

  it("formats as JSON", () => {
    const result = formatCreated(created, "json");
    const parsed = JSON.parse(result);
    expect(parsed.key).toBe("PROJ-456");
  });
});

describe("formatTransitions", () => {
  const transitions: JiraTransition[] = [
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
  ];

  it("formats empty list", () => {
    expect(formatTransitions([], "plain")).toBe("No transitions available.");
  });

  it("formats with header and rows", () => {
    const result = formatTransitions(transitions, "plain");
    expect(result).toContain("ID\tNAME\tTO STATUS");
    expect(result).toContain("21\tStart Progress\tIn Progress");
  });
});

describe("formatComment / formatComments", () => {
  const comment: JiraComment = {
    id: "100",
    self: "https://test.atlassian.net/rest/api/3/comment/100",
    author: { accountId: "abc", displayName: "Alice" },
    body: {
      version: 1,
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Looks good!" }] },
      ],
    },
    created: "2025-03-01T12:00:00.000+0000",
    updated: "2025-03-01T12:00:00.000+0000",
  };

  it("formats single comment in plain", () => {
    const result = formatComment(comment, "plain");
    expect(result).toContain("Alice");
    expect(result).toContain("Looks good!");
  });

  it("formats empty comments list", () => {
    expect(formatComments([], "plain")).toBe("No comments.");
  });

  it("separates comments with dividers", () => {
    const result = formatComments([comment, comment], "plain");
    expect(result).toContain("---");
  });
});
