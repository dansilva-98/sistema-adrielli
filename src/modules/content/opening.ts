import { parseRestrictedMarkdown, type MarkdownInline } from "@/modules/content/markdown";

export function featuredAboutText(source: string): string {
  return openingText(source, Number.MAX_SAFE_INTEGER);
}

export function remainingAboutSource(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n{2,}/)
    .slice(1)
    .join("\n\n")
    .trim();
}

export function openingText(source: string, max = 240): string {
  const block = parseRestrictedMarkdown(source)[0];
  if (!block) return "";
  const text =
    block.type === "paragraph"
      ? inlineText(block.children)
      : inlineText(block.items[0] ?? []);
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max).trimEnd()}…`;
}

function inlineText(nodes: MarkdownInline[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return node.value;
      if (node.type === "br") return " ";
      if (node.type === "strong" || node.type === "em" || node.type === "link") {
        return inlineText(node.children);
      }
      return "";
    })
    .join("");
}
