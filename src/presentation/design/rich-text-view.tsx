import { richTextDocumentSchema } from "@/domain/shared/rich-text";

type Inline = readonly (
  | Readonly<{ type: "text"; text: string }>
  | Readonly<{ type: "hardBreak" }>
)[];

function InlineContent({ content }: Readonly<{ content: Inline | undefined }>) {
  return (content ?? []).map((node, index) =>
    node.type === "text" ? node.text : <br key={index} />,
  );
}

// Renders the portable document through a fixed node map. Text is always
// rendered as React text, never as HTML; a document that fails the schema
// renders nothing rather than guessing.
export function RichTextView({
  document,
  className,
}: Readonly<{ document: unknown; className?: string }>) {
  const parsed = richTextDocumentSchema.safeParse(document);
  if (!parsed.success || parsed.data.content.length === 0) return null;

  return (
    <div className={className}>
      {parsed.data.content.map((block, index) => {
        switch (block.type) {
          case "paragraph":
            return (
              <p key={index}>
                <InlineContent content={block.content} />
              </p>
            );
          case "heading": {
            const Tag = `h${block.attrs.level}` as const;
            return (
              <Tag key={index}>
                <InlineContent content={block.content} />
              </Tag>
            );
          }
          default: {
            const List = block.type === "bulletList" ? "ul" : "ol";
            return (
              <List key={index}>
                {block.content.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    {item.content.map((paragraph, paragraphIndex) => (
                      <InlineContent
                        key={paragraphIndex}
                        content={paragraph.content}
                      />
                    ))}
                  </li>
                ))}
              </List>
            );
          }
        }
      })}
    </div>
  );
}
