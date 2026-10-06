import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, blurEmails } from "./markdown";

describe("Markdown", () => {
  it("renders headings, lists, tables, and links", () => {
    const html = renderToStaticMarkup(
      <Markdown>
        {"# Title\n\n- one\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n[site](https://example.com)"}
      </Markdown>,
    );
    expect(html).toContain("<h1");
    expect(html).toContain("<li");
    expect(html).toContain("<table");
    expect(html).toContain('href="https://example.com"');
  });

  it("sends a mermaid fence to the diagram renderer", () => {
    const html = renderToStaticMarkup(<Markdown>{"```mermaid\ngraph TD\n  A-->B\n```"}</Markdown>);
    expect(html).toContain("data-mermaid");
    expect(html).not.toContain("<pre");
  });

  it("blurs an email address without removing it", () => {
    const html = renderToStaticMarkup(<p>{blurEmails("Write ada@example.com today")}</p>);
    expect(html).toContain("email-blur");
    expect(html).toContain("ada@example.com");
  });

  it("prints HTML tags until a tracker body asks to render them", () => {
    const notes = "<details><summary>Release notes</summary><p>0.87.1</p></details>";
    const printed = renderToStaticMarkup(<Markdown>{notes}</Markdown>);
    expect(printed).toContain("&lt;details&gt;");
    expect(printed).not.toContain("<details");
  });

  it("renders a tracker body's release notes and drops scripts", () => {
    const notes = "<details><summary>Release notes</summary><p>0.87.1</p></details>";
    const html = renderToStaticMarkup(<Markdown allowHtml>{notes}</Markdown>);
    expect(html).toContain("<details");
    expect(html).toContain("Release notes");
    expect(html).toContain("0.87.1");
    const hostile = renderToStaticMarkup(
      <Markdown allowHtml>{'<p onclick="steal()">text</p><script>steal()</script>'}</Markdown>,
    );
    expect(hostile).toContain("text");
    expect(hostile).not.toContain("<script");
    expect(hostile).not.toContain("onclick");
  });
});
