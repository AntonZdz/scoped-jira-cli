import type { AdfDocument, AdfNode } from "../client/types.js";

/**
 * Convert plain text into a minimal ADF document.
 * Double newlines become paragraph breaks; single newlines become hard breaks.
 */
export function textToAdf(text: string): AdfDocument {
  const paragraphs = text.split(/\n{2,}/);

  return {
    version: 1,
    type: "doc",
    content: paragraphs.map((para) => ({
      type: "paragraph" as const,
      content: para.split("\n").flatMap((line, i, arr): AdfNode[] => {
        const nodes: AdfNode[] = [{ type: "text", text: line }];
        if (i < arr.length - 1) {
          nodes.push({ type: "hardBreak" });
        }
        return nodes;
      }),
    })),
  };
}

/**
 * Extract readable plain text from an ADF document.
 * Handles common block and inline node types.
 */
export function adfToText(doc: AdfDocument | null | undefined): string {
  if (!doc?.content) return "";
  return renderNodes(doc.content).trimEnd();
}

function renderNodes(nodes: AdfNode[]): string {
  return nodes.map(renderNode).join("");
}

function renderNode(node: AdfNode): string {
  switch (node.type) {
    case "text":
      return node.text ?? "";

    case "hardBreak":
      return "\n";

    case "paragraph":
      return (node.content ? renderNodes(node.content) : "") + "\n";

    case "heading":
      return (node.content ? renderNodes(node.content) : "") + "\n";

    case "bulletList":
      return node.content
        ? node.content
            .map(
              (item) =>
                "- " + (item.content ? renderNodes(item.content).trim() : ""),
            )
            .join("\n") + "\n"
        : "";

    case "orderedList":
      return node.content
        ? node.content
            .map(
              (item, i) =>
                `${i + 1}. ` +
                (item.content ? renderNodes(item.content).trim() : ""),
            )
            .join("\n") + "\n"
        : "";

    case "listItem":
      return node.content ? renderNodes(node.content) : "";

    case "codeBlock":
      return (
        "```\n" + (node.content ? renderNodes(node.content) : "") + "```\n"
      );

    case "blockquote":
      return node.content
        ? renderNodes(node.content)
            .split("\n")
            .map((l) => "> " + l)
            .join("\n") + "\n"
        : "";

    case "rule":
      return "---\n";

    default:
      return node.content ? renderNodes(node.content) : "";
  }
}
