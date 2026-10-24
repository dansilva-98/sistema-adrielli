export type MarkdownInline =
  | { type: "text"; value: string }
  | { type: "strong"; children: MarkdownInline[] }
  | { type: "em"; children: MarkdownInline[] }
  | { type: "br" }
  | { type: "link"; href: string; external: boolean; children: MarkdownInline[] };

export type MarkdownBlock =
  | { type: "paragraph"; children: MarkdownInline[] }
  | { type: "ul"; items: MarkdownInline[][] }
  | { type: "ol"; items: MarkdownInline[][] };

const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)/;

export function parseRestrictedMarkdown(source: string): MarkdownBlock[] {
  const chunks = source
    .replaceAll("\r\n", "\n")
    .trim()
    .split(/\n{2,}/);
  const blocks: MarkdownBlock[] = [];
  for (const block of chunks) {
    const lines = block.split("\n");
    if (lines.every((line) => /^[-*] /.test(line.trim()))) {
      blocks.push({
        type: "ul",
        items: lines.map((line) => parseInline(line.trim().slice(2))),
      });
      continue;
    }
    if (lines.every((line) => /^\d+\. /.test(line.trim()))) {
      blocks.push({
        type: "ol",
        items: lines.map((line) => parseInline(line.trim().replace(/^\d+\. /, ""))),
      });
      continue;
    }
    blocks.push({ type: "paragraph", children: parseInline(block) });
  }
  return blocks;
}

export function parseInline(source: string): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  let index = 0;
  let text = "";

  const flush = () => {
    if (text) nodes.push({ type: "text", value: text });
    text = "";
  };

  while (index < source.length) {
    const rest = source.slice(index);
    if (rest.startsWith("**")) {
      const end = rest.indexOf("**", 2);
      if (end > 2) {
        flush();
        nodes.push({ type: "strong", children: parseInline(rest.slice(2, end)) });
        index += end + 2;
        continue;
      }
    }
    if (rest.startsWith("*")) {
      const end = rest.indexOf("*", 1);
      if (end > 1) {
        flush();
        nodes.push({ type: "em", children: parseInline(rest.slice(1, end)) });
        index += end + 1;
        continue;
      }
    }
    const link = LINK.exec(rest);
    if (link) {
      const href = allowedHref(link[2] ?? "");
      flush();
      if (href) {
        nodes.push({
          type: "link",
          href: href.href,
          external: href.external,
          children: parseInline(link[1] ?? ""),
        });
      } else {
        nodes.push({ type: "text", value: link[0] });
      }
      index += link[0].length;
      continue;
    }
    if (rest.startsWith("\n")) {
      flush();
      nodes.push({ type: "br" });
      index += 1;
      continue;
    }
    text += source[index];
    index += 1;
  }
  flush();
  return nodes;
}

function allowedHref(value: string): { href: string; external: boolean } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol === "https:") return { href: url.toString(), external: true };
  if (url.protocol === "mailto:" || url.protocol === "tel:") {
    return { href: url.toString(), external: false };
  }
  return null;
}
