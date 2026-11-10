import { parseRestrictedMarkdown, type MarkdownInline } from "@/modules/content/markdown";

function normalizeAboutSource(source: string): string {
  return source.replaceAll("\r\n", "\n").trim();
}

function firstBlockSource(source: string): string {
  return normalizeAboutSource(source).split(/\n{2,}/)[0] ?? "";
}

function firstBlockIsList(source: string): boolean {
  const block = parseRestrictedMarkdown(firstBlockSource(source))[0];
  return block?.type === "ul" || block?.type === "ol";
}

function isAbbreviation(token: string): boolean {
  const stripped = token.replace(/[*_[\]()]/g, "");
  return /^(?:Dra?|Sra?|Profa?)\.$/u.test(stripped);
}

function firstSentenceBoundary(source: string): number {
  let index = 0;
  while (index < source.length) {
    if (source.startsWith("](", index)) {
      const close = source.indexOf(")", index + 2);
      index = close === -1 ? source.length : close + 1;
      continue;
    }
    const character = source[index];
    if (character === "." || character === "!" || character === "?") {
      const token = source.slice(0, index + 1).match(/(\S+)$/)?.[1] ?? "";
      if (isAbbreviation(token)) {
        index += 1;
        continue;
      }
      let end = index + 1;
      while (end < source.length && /[.!?]/.test(source[end] ?? "")) end += 1;
      if (end < source.length && !/\s/.test(source[end] ?? "")) {
        index += 1;
        continue;
      }
      return end;
    }
    index += 1;
  }
  return source.length;
}

export function featuredAboutText(source: string): string {
  if (firstBlockIsList(source)) return "";
  const first = firstBlockSource(source);
  return openingText(
    first.slice(0, firstSentenceBoundary(first)),
    Number.MAX_SAFE_INTEGER,
  );
}

export function remainingAboutSource(source: string): string {
  const normalized = normalizeAboutSource(source);
  if (!normalized) return "";
  if (firstBlockIsList(normalized)) return normalized;
  const blocks = normalized.split(/\n{2,}/);
  const first = blocks[0] ?? "";
  const restOfFirst = first.slice(firstSentenceBoundary(first)).trim();
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
