import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerLinkCommands } from "../../src/commands/link.js";

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
  const program = new Command().exitOverride();
  registerLinkCommands(program);
  return program;
}

function parse(program: Command, args: string[]) {
  return program.parseAsync(["node", "sjira", ...args]);
}

describe("link add", () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = {
      createLink: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(JiraClient).mockImplementation(() => mockClient as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("sends link with type and both issue keys", async () => {
    const program = makeProgram();
    await parse(program, ["link", "add", "PROJ-1", "PROJ-2", "-t", "Blocks"]);

    expect(mockClient.createLink).toHaveBeenCalledOnce();
    const link = mockClient.createLink.mock.calls[0][0];
    expect(link.type).toEqual({ name: "Blocks" });
    expect(link.inwardIssue).toEqual({ key: "PROJ-1" });
    expect(link.outwardIssue).toEqual({ key: "PROJ-2" });
    expect(link.comment).toBeUndefined();
  });

  it("includes comment as ADF when provided", async () => {
    const program = makeProgram();
    await parse(program, [
      "link", "add", "PROJ-1", "PROJ-2",
      "-t", "Relates",
      "-c", "These are related",
    ]);

    const link = mockClient.createLink.mock.calls[0][0];
    expect(link.comment).toBeDefined();
    expect(link.comment.body.type).toBe("doc");
    expect(link.comment.body.content[0].content[0].text).toBe("These are related");
  });

  it("outputs confirmation message", async () => {
    const program = makeProgram();
    await parse(program, ["link", "add", "A-1", "B-2", "-t", "Duplicate"]);

    expect(logSpy).toHaveBeenCalledWith("Linked A-1 -> B-2 (Duplicate)");
  });
});
