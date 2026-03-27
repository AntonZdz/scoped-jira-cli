import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerCommentCommands } from "../../src/commands/comment.js";

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
  registerCommentCommands(program);
  return program;
}

function parse(program: Command, args: string[]) {
  return program.parseAsync(["node", "sjira", ...args]);
}

describe("comment add", () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = {
      addComment: vi.fn().mockResolvedValue({
        id: "500",
        self: "...",
        author: { accountId: "a", displayName: "Bot" },
        body: { version: 1, type: "doc", content: [] },
        created: "2025-01-01T00:00:00.000+0000",
        updated: "2025-01-01T00:00:00.000+0000",
      }),
      getComments: vi.fn(),
    };
    vi.mocked(JiraClient).mockImplementation(() => mockClient as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("converts body text to ADF and sends it", async () => {
    const program = makeProgram();
    await parse(program, ["comment", "add", "PROJ-1", "-b", "Nice work"]);

    expect(mockClient.addComment).toHaveBeenCalledOnce();
    const [issueKey, adf] = mockClient.addComment.mock.calls[0];
    expect(issueKey).toBe("PROJ-1");
    expect(adf.type).toBe("doc");
    expect(adf.content[0].content[0].text).toBe("Nice work");
  });

  it("outputs confirmation in plain mode", async () => {
    const program = makeProgram();
    await parse(program, ["comment", "add", "PROJ-1", "-b", "Hello"]);

    expect(logSpy).toHaveBeenCalledWith("Comment added to PROJ-1 (id: 500)");
  });

  it("outputs full comment JSON in json mode", async () => {
    const program = makeProgram();
    await parse(program, ["--json", "comment", "add", "PROJ-1", "-b", "Hello"]);

    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.id).toBe("500");
    expect(output.author.displayName).toBe("Bot");
  });
});

describe("comment list", () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = {
      addComment: vi.fn(),
      getComments: vi.fn().mockResolvedValue({
        startAt: 0,
        maxResults: 25,
        total: 1,
        comments: [
          {
            id: "100",
            self: "...",
            author: { accountId: "a", displayName: "Alice" },
            body: {
              version: 1,
              type: "doc",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "A comment" }] },
              ],
            },
            created: "2025-03-01T00:00:00.000+0000",
            updated: "2025-03-01T00:00:00.000+0000",
          },
        ],
      }),
    };
    vi.mocked(JiraClient).mockImplementation(() => mockClient as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("fetches comments with default limit", async () => {
    const program = makeProgram();
    await parse(program, ["comment", "list", "PROJ-1"]);

    expect(mockClient.getComments).toHaveBeenCalledWith("PROJ-1", 0, 25);
  });

  it("respects --limit flag", async () => {
    const program = makeProgram();
    await parse(program, ["comment", "list", "PROJ-1", "--limit", "5"]);

    expect(mockClient.getComments).toHaveBeenCalledWith("PROJ-1", 0, 5);
  });

  it("renders comment content in plain mode", async () => {
    const program = makeProgram();
    await parse(program, ["comment", "list", "PROJ-1"]);

    const output = logSpy.mock.calls[0][0];
    expect(output).toContain("Alice");
    expect(output).toContain("A comment");
  });
});
