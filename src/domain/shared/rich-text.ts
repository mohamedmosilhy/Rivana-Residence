import { z } from "zod";

import type { RichTextDocument } from "@/domain/shared/types";

// The portable document is deliberately small: paragraphs, headings 2–4,
// bulleted and numbered lists, and line breaks. Every node is strict, so
// unknown node types, attributes, marks, or raw HTML are rejected rather than
// stored for a renderer to trip over later. Bold, italic, and links are
// deferred until a structured editor needs them.

const MAX_TEXT = 5000;

const textNode = z
  .object({
    type: z.literal("text"),
    text: z.string().min(1).max(MAX_TEXT),
  })
  .strict();

const hardBreakNode = z.object({ type: z.literal("hardBreak") }).strict();

const inlineContent = z.array(z.union([textNode, hardBreakNode])).max(200);

const paragraphNode = z
  .object({
    type: z.literal("paragraph"),
    content: inlineContent.optional(),
  })
  .strict();

const headingNode = z
  .object({
    type: z.literal("heading"),
    attrs: z
      .object({ level: z.union([z.literal(2), z.literal(3), z.literal(4)]) })
      .strict(),
    content: inlineContent.optional(),
  })
  .strict();

const listItemNode = z
  .object({
    type: z.literal("listItem"),
    content: z.array(paragraphNode).min(1).max(5),
  })
  .strict();

const listNode = z
  .object({
    type: z.enum(["bulletList", "orderedList"]),
    content: z.array(listItemNode).min(1).max(50),
  })
  .strict();

export const richTextDocumentSchema = z
  .object({
    type: z.literal("doc"),
    content: z.array(z.union([paragraphNode, headingNode, listNode])).max(100),
  })
  .strict();

export type PortableDocument = z.infer<typeof richTextDocumentSchema>;

type Inline = z.infer<typeof inlineContent>;

function inlineFromText(text: string): Inline {
  const nodes: Inline = [];
  text.split("\n").forEach((line, index) => {
    if (index > 0) nodes.push({ type: "hardBreak" });
    if (line) nodes.push({ type: "text", text: line });
  });
  return nodes;
}

function textFromInline(content: Inline | undefined) {
  return (content ?? [])
    .map((node) => (node.type === "text" ? node.text : "\n"))
    .join("");
}

const HEADING = /^(#{2,4}) +(.*)$/;
const BULLET = /^[-*] +(.*)$/;
const NUMBERED = /^\d+[.)] +(.*)$/;

/**
 * Converts the editor's plain-text format into a document.
 *
 * - A blank line separates blocks.
 * - `## `, `### `, or `#### ` starts a heading.
 * - A block whose every line starts with `- ` is a bulleted list; `1. ` a
 *   numbered list.
 * - Any other block is a paragraph; single line breaks are kept.
 *
 * Nothing is interpreted as HTML.
 */
export function richTextFromEditorText(value: string): PortableDocument {
  const blocks = value
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n")
        .trim(),
    )
    .filter(Boolean);

  const content = blocks.map((block): PortableDocument["content"][number] => {
    const lines = block.split("\n");
    const heading = lines.length === 1 ? HEADING.exec(block) : null;
    if (heading) {
      return {
        type: "heading" as const,
        attrs: { level: heading[1]!.length as 2 | 3 | 4 },
        content: inlineFromText(heading[2]!.trim()),
      };
    }
    for (const [pattern, type] of [
      [BULLET, "bulletList"],
      [NUMBERED, "orderedList"],
    ] as const) {
      if (lines.every((line) => pattern.test(line))) {
        return {
          type,
          content: lines.map((line) => ({
            type: "listItem" as const,
            content: [
              {
                type: "paragraph" as const,
                content: inlineFromText(pattern.exec(line)![1]!.trim()),
              },
            ],
          })),
        };
      }
    }
    return { type: "paragraph" as const, content: inlineFromText(block) };
  });

  return { type: "doc", content };
}

/** The inverse of `richTextFromEditorText` for any valid document. */
export function editorTextFromRichText(document: unknown): string {
  const parsed = richTextDocumentSchema.safeParse(document);
  if (!parsed.success) return "";
  return parsed.data.content
    .map((block) => {
      if (block.type === "paragraph") return textFromInline(block.content);
      if (block.type === "heading") {
        return `${"#".repeat(block.attrs.level)} ${textFromInline(block.content)}`;
      }
      return block.content
        .map((item, index) => {
          const marker = block.type === "bulletList" ? "-" : `${index + 1}.`;
          const text = item.content
            .map((paragraph) => textFromInline(paragraph.content))
            .join(" ");
          return `${marker} ${text}`;
        })
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

/** True when the document has any visible text. */
export function hasRichTextContent(document: RichTextDocument) {
  return editorTextFromRichText(document).trim().length > 0;
}
