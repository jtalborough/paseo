import { describe, expect, it } from "vitest";
import { analyzeMarkdownSafety, isLosslessMarkdown } from "./markdown-roundtrip-safety";

describe("markdown round-trip safety", () => {
  it("treats core formatting as safe", () => {
    const content = [
      "# Heading",
      "",
      "Some **bold** and _italic_ and `code` and ~~strike~~.",
      "",
      "- bullet one",
      "- bullet two",
      "",
      "1. ordered",
      "2. list",
      "",
      "- [ ] a task",
      "- [x] done task",
      "",
      "> a quote",
      "",
      "```ts",
      "const x = 1;",
      "```",
      "",
      "[a link](https://example.com)",
      "",
      "---",
      "",
      "trailing text",
    ].join("\n");
    expect(isLosslessMarkdown(content)).toBe(true);
    expect(analyzeMarkdownSafety(content)).toEqual({ safe: true, reason: null });
  });

  it("treats YAML frontmatter as safe (preserved verbatim, scanned by body)", () => {
    const content = "---\ntitle: Note\ntags: [a, b]\n---\n\n# Body\n";
    expect(analyzeMarkdownSafety(content)).toEqual({ safe: true, reason: null });
  });

  it("scans only the body, ignoring frontmatter that looks like HTML", () => {
    const content = "---\ndescription: <b>hi</b>\n---\n\n# Body\n\nplain text\n";
    expect(isLosslessMarkdown(content)).toBe(true);
  });

  it("treats GitHub tables as safe (round-trip via table extensions)", () => {
    const content = "| a | b |\n| --- | --- |\n| 1 | 2 |\n";
    expect(analyzeMarkdownSafety(content)).toEqual({ safe: true, reason: null });
  });

  it("still flags raw HTML in the body even with frontmatter present", () => {
    const content = "---\ntitle: x\n---\n\n<div>body</div>\n";
    expect(analyzeMarkdownSafety(content)).toEqual({ safe: false, reason: "html" });
  });

  it("ignores HTML-looking placeholders inside fenced code blocks", () => {
    const content = [
      "# Docs",
      "",
      "```bash",
      "npx vitest run <file> --bail=1",
      "```",
      "",
      "text",
    ].join("\n");
    expect(analyzeMarkdownSafety(content)).toEqual({ safe: true, reason: null });
  });

  it("ignores HTML-looking placeholders inside inline code", () => {
    expect(isLosslessMarkdown("Pass `<id>` as the first argument.\n")).toBe(true);
  });

  it("ignores a colon line inside a code block (not a definition list)", () => {
    const content = ["```yaml", "key:", "  : nested", "```", "", "body"].join("\n");
    expect(analyzeMarkdownSafety(content)).toEqual({ safe: true, reason: null });
  });

  it("still flags real HTML outside code", () => {
    const content = 'intro\n\n<p align="center">logo</p>\n\n```\n<file>\n```\n';
    expect(analyzeMarkdownSafety(content)).toEqual({ safe: false, reason: "html" });
  });

  it("flags footnotes as unsafe", () => {
    const content = "Here is a note[^1].\n\n[^1]: the note\n";
    expect(analyzeMarkdownSafety(content)).toEqual({ safe: false, reason: "footnote" });
  });

  it("flags raw HTML as unsafe", () => {
    expect(analyzeMarkdownSafety("<div>hi</div>\n").safe).toBe(false);
    expect(analyzeMarkdownSafety("text with <br> inside\n").safe).toBe(false);
  });

  it("does not mistake autolinks for HTML", () => {
    expect(isLosslessMarkdown("see <https://example.com> for more\n")).toBe(true);
  });

  it("does not mistake an em dash separator for frontmatter mid-file", () => {
    expect(isLosslessMarkdown("# Title\n\nbody\n\n---\n\nmore\n")).toBe(true);
  });
});
