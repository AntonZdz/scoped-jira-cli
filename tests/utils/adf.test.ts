import { describe, it, expect } from "vitest";
import { textToAdf, adfToText } from "../../src/utils/adf.js";
import type { AdfDocument } from "../../src/client/types.js";

describe("textToAdf", () => {
  it("converts a single line to one paragraph", () => {
    const result = textToAdf("Hello world");
    expect(result).toEqual({
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

  it("converts double newlines into separate paragraphs", () => {
    const result = textToAdf("First paragraph\n\nSecond paragraph");
    expect(result.content).toHaveLength(2);
    expect(result.content[0].content![0].text).toBe("First paragraph");
    expect(result.content[1].content![0].text).toBe("Second paragraph");
  });

  it("converts single newlines into hard breaks within a paragraph", () => {
    const result = textToAdf("Line one\nLine two");
    expect(result.content).toHaveLength(1);

    const nodes = result.content[0].content!;
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toEqual({ type: "text", text: "Line one" });
    expect(nodes[1]).toEqual({ type: "hardBreak" });
    expect(nodes[2]).toEqual({ type: "text", text: "Line two" });
  });

  it("handles empty string", () => {
    const result = textToAdf("");
    expect(result.content).toHaveLength(1);
    expect(result.content[0].content![0].text).toBe("");
  });
});

describe("adfToText", () => {
  it("extracts text from a simple paragraph", () => {
    const doc: AdfDocument = {
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    };
    expect(adfToText(doc)).toBe("Hello world");
  });

  it("handles multiple paragraphs", () => {
    const doc: AdfDocument = {
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "First" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Second" }],
        },
      ],
    };
    expect(adfToText(doc)).toBe("First\nSecond");
  });

  it("handles hard breaks", () => {
    const doc: AdfDocument = {
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Line one" },
            { type: "hardBreak" },
            { type: "text", text: "Line two" },
          ],
        },
      ],
    };
    expect(adfToText(doc)).toBe("Line one\nLine two");
  });

  it("handles bullet lists", () => {
    const doc: AdfDocument = {
      version: 1,
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Item A" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Item B" }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(adfToText(doc)).toBe("- Item A\n- Item B");
  });

  it("handles ordered lists", () => {
    const doc: AdfDocument = {
      version: 1,
      type: "doc",
      content: [
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "First" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Second" }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(adfToText(doc)).toBe("1. First\n2. Second");
  });

  it("handles code blocks", () => {
    const doc: AdfDocument = {
      version: 1,
      type: "doc",
      content: [
        {
          type: "codeBlock",
          content: [{ type: "text", text: "const x = 1;" }],
        },
      ],
    };
    expect(adfToText(doc)).toBe("```\nconst x = 1;```");
  });

  it("handles horizontal rules", () => {
    const doc: AdfDocument = {
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Above" }],
        },
        { type: "rule" },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Below" }],
        },
      ],
    };
    expect(adfToText(doc)).toBe("Above\n---\nBelow");
  });

  it("returns empty string for null/undefined", () => {
    expect(adfToText(null)).toBe("");
    expect(adfToText(undefined)).toBe("");
  });

  it("roundtrips simple text through textToAdf -> adfToText", () => {
    const original = "Hello world";
    const roundtripped = adfToText(textToAdf(original));
    expect(roundtripped).toBe(original);
  });

  it("roundtrips multiline text", () => {
    const original = "Line one\nLine two";
    const roundtripped = adfToText(textToAdf(original));
    expect(roundtripped).toBe(original);
  });
});
