import {
  parseRestrictedMarkdown,
  type MarkdownBlock,
  type MarkdownInline,
} from "@/modules/content/markdown";

export function RestrictedMarkdown({ source }: { source: string }) {
  const blocks = parseRestrictedMarkdown(source);
  return (
    <div>
      {blocks.map((block, index) => (
        <MarkdownBlockView block={block} key={index} />
      ))}
    </div>
  );
}

function MarkdownBlockView({ block }: { block: MarkdownBlock }) {
  if (block.type === "ul" || block.type === "ol") {
    const List = block.type;
    return (
      <List>
        {block.items.map((item, index) => (
          <li key={index}>
            <MarkdownInlineView nodes={item} />
          </li>
        ))}
      </List>
    );
  }
  return (
    <p>
      <MarkdownInlineView nodes={block.children} />
    </p>
  );
}

function MarkdownInlineView({ nodes }: { nodes: MarkdownInline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === "text") return <span key={index}>{node.value}</span>;
        if (node.type === "br") return <br key={index} />;
        if (node.type === "strong") {
          return (
            <strong key={index}>
              <MarkdownInlineView nodes={node.children} />
            </strong>
          );
        }
        if (node.type === "em") {
          return (
            <em key={index}>
              <MarkdownInlineView nodes={node.children} />
            </em>
          );
        }
        if (node.external) {
          return (
            <a href={node.href} key={index} rel="noopener noreferrer" target="_blank">
              <MarkdownInlineView nodes={node.children} />
            </a>
          );
        }
        return (
          <a href={node.href} key={index}>
            <MarkdownInlineView nodes={node.children} />
          </a>
        );
      })}
    </>
  );
}
