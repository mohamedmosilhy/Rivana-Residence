import { describe, expect, it } from "vitest";

import {
  editorTextFromRichText,
  hasRichTextContent,
  richTextDocumentSchema,
  richTextFromEditorText,
} from "@/domain/shared/rich-text";

const text = (value: string) => ({ type: "text", text: value });

describe("rich text editor format", () => {
  it("builds paragraphs, headings, lists, and line breaks", () => {
    expect(
      richTextFromEditorText(
        "Intro line\nsecond line\n\n## Rooms\n\n- King bed\n- Balcony\n\n1. Arrive\n2. Relax",
      ),
    ).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            text("Intro line"),
            { type: "hardBreak" },
            text("second line"),
          ],
        },
        { type: "heading", attrs: { level: 2 }, content: [text("Rooms")] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [text("King bed")] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [text("Balcony")] }],
            },
          ],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [text("Arrive")] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [text("Relax")] }],
            },
          ],
        },
      ],
    });
  });

  it("round-trips through the editor text", () => {
    const source =
      "Welcome to Rivana.\nBy the river.\n\n### Dining\n\n- Breakfast\n- Dinner\n\n1. One\n2. Two";
    expect(editorTextFromRichText(richTextFromEditorText(source))).toBe(source);
  });

  it("treats HTML as literal text", () => {
    const doc = richTextFromEditorText("<script>alert(1)</script>");
    expect(doc.content[0]).toEqual({
      type: "paragraph",
      content: [text("<script>alert(1)</script>")],
    });
  });

  it("ignores extra blank lines, trailing spaces, and Windows line endings", () => {
    expect(
      richTextFromEditorText("\r\n\r\nOne  \r\n\r\n\r\n\r\nTwo\r\n"),
    ).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [text("One")] },
        { type: "paragraph", content: [text("Two")] },
      ],
    });
    expect(richTextFromEditorText("   ")).toEqual({ type: "doc", content: [] });
  });

  it("keeps a lone # or a mixed list block as a paragraph", () => {
    expect(
      richTextFromEditorText("# Not a level-1 heading").content[0]?.type,
    ).toBe("paragraph");
    expect(richTextFromEditorText("- one\nplain").content[0]?.type).toBe(
      "paragraph",
    );
  });

  it("reports whether a document has text", () => {
    expect(hasRichTextContent({ type: "doc", content: [] })).toBe(false);
    expect(hasRichTextContent(richTextFromEditorText("Hello"))).toBe(true);
  });
});

describe("rich text schema", () => {
  it.each([
    [
      "an unknown node",
      { type: "doc", content: [{ type: "html", value: "<b>x</b>" }] },
    ],
    [
      "a mark",
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "x", marks: [{ type: "link" }] }],
          },
        ],
      },
    ],
    [
      "a level-1 heading",
      {
        type: "doc",
        content: [{ type: "heading", attrs: { level: 1 }, content: [] }],
      },
    ],
    [
      "an extra attribute",
      {
        type: "doc",
        content: [{ type: "paragraph", attrs: { style: "color:red" } }],
      },
    ],
    [
      "an empty text node",
      { type: "doc", content: [{ type: "paragraph", content: [text("")] }] },
    ],
    [
      "an empty list",
      { type: "doc", content: [{ type: "bulletList", content: [] }] },
    ],
  ])("rejects %s", (_, document) => {
    expect(richTextDocumentSchema.safeParse(document).success).toBe(false);
  });

  it("accepts the documents stored by earlier phases", () => {
    expect(
      richTextDocumentSchema.safeParse({ type: "doc", content: [] }).success,
    ).toBe(true);
    expect(
      richTextDocumentSchema.safeParse({
        type: "doc",
        content: [{ type: "paragraph" }],
      }).success,
    ).toBe(true);
  });

  it("renders an invalid document as empty editor text", () => {
    expect(
      editorTextFromRichText({ type: "doc", content: [{ type: "html" }] }),
    ).toBe("");
  });
});
