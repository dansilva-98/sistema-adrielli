import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { RestrictedMarkdown } from "@/modules/content/markdown-view";
import { parseRestrictedMarkdown } from "@/modules/content/markdown";

describe("markdown restrito", () => {
  it("não executa HTML nem links javascript ou data", () => {
    const html = renderToStaticMarkup(
      RestrictedMarkdown({
        source: [
          "<script>alert(1)</script>",
          "<img src=x onerror=alert(1)>",
          "[clique](javascript:alert(1))",
          "[clique](data:text/html,hi)",
          "Texto **negrito** e *itálico*",
          "[site](https://adrielli.example/sobre)",
        ].join("\n\n"),
      }),
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="data:');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).toContain("<strong>");
    expect(html).toContain("<em>");
    expect(html).toContain('href="https://adrielli.example/sobre"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it("aceita mailto e tel e mantém listas", () => {
    const blocks = parseRestrictedMarkdown(
      [
        "- um",
        "- dois",
        "",
        "1. três",
        "",
        "[mail](mailto:a@b.c)",
        "",
        "[fone](tel:+5511999999999)",
      ].join("\n"),
    );
    expect(blocks.map((block) => block.type)).toEqual([
      "ul",
      "ol",
      "paragraph",
      "paragraph",
    ]);
    const html = renderToStaticMarkup(
      RestrictedMarkdown({
        source: "[mail](mailto:a@b.c)\n\n[fone](tel:+5511999999999)",
      }),
    );
    expect(html).toContain('href="mailto:a@b.c"');
    expect(html).toContain('href="tel:+5511999999999"');
    expect(html).not.toContain('target="_blank"');
  });
});
