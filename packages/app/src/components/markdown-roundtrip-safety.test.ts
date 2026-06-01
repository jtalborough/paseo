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

  it("flags YAML frontmatter as unsafe", () => {
    const content = "---\ntitle: Note\ntags: [a, b]\n---\n\n# Body\n";
    expect(analyzeMarkdownSafety(content)).toEqual({ safe: false, reason: "frontmatter" });
  });

  it("flags GitHub tables as unsafe", () => {
    const content = "| a | b |\n| --- | --- |\n| 1 | 2 |\n";
    expect(analyzeMarkdownSafety(content)).toEqual({ safe: false, reason: "table" });
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
