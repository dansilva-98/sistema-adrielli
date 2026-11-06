import { parseRestrictedMarkdown, type MarkdownInline } from "@/modules/content/markdown";

function normalizeAboutSource(source: string): string {
  return source.replaceAll("\r\n", "\n").trim();
}

function firstSentence(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  const match = compact.match(/^.+?[.!?]+(?=\s|$)/);
  return (match?.[0] ?? compact).trim();
}

function firstBlockSource(source: string): string {
  return normalizeAboutSource(source).split(/\n{2,}/)[0] ?? "";
}

export function featuredAboutText(source: string): string {
  return firstSentence(openingText(firstBlockSource(source), Number.MAX_SAFE_INTEGER));
}

export function remainingAboutSource(source: string): string {
  const normalized = normalizeAboutSource(source);
  if (!normalized) return "";
  const blocks = normalized.split(/\n{2,}/);
  const first = blocks[0] ?? "";
  const featured = featuredAboutText(first);
  const firstPlain = openingText(first, Number.MAX_SAFE_INTEGER);
  const restOfFirst =
    featured && firstPlain.startsWith(featured)
      ? firstPlain.slice(featured.length).trim()
      : "";
  return [restOfFirst, ...blocks.slice(1)].filter(Boolean).join("\n\n");
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
