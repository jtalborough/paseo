import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import type { MarkdownStorage } from "tiptap-markdown";
import { buildMarkdownEditorExtensions } from "@/components/markdown-editor-extensions";
import { joinFrontmatter, splitFrontmatter } from "@/components/markdown-frontmatter";

/**
 * Real-browser verification that the WYSIWYG editor's parse→serialize cycle does
 * not corrupt the constructs we promote out of the source-only fallback (tables
 * and, via splitting, frontmatter). The safety gate trusts this round-trip; this
 * test is what keeps that trust honest. Runs in Chromium because ProseMirror
 * needs a real DOM.
 */

const hosts: HTMLElement[] = [];

afterEach(() => {
  for (const host of hosts.splice(0)) {
    host.remove();
  }
});

/** Parse markdown through the shipping editor config and serialize it back. */
function roundTrip(markdown: string): string {
  const host = document.createElement("div");
  document.body.appendChild(host);
  hosts.push(host);
  const editor = new Editor({
    element: host,
    extensions: buildMarkdownEditorExtensions(),
    content: markdown,
  });
  const out = (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown();
  editor.destroy();
  return out;
}

describe("markdown editor round-trip", () => {
  it("preserves a GitHub table's cells and structure", () => {
    const table = "| Name | Role |\n| --- | --- |\n| Ada | Engineer |\n| Linus | Maintainer |";
    const out = roundTrip(table);
    expect(out).toContain("Name");
    expect(out).toContain("Role");
    expect(out).toContain("Ada");
    expect(out).toContain("Engineer");
    expect(out).toContain("Maintainer");
    // A GFM delimiter row must survive, or the table would degrade to paragraphs.
    expect(out).toMatch(/\|?\s*:?-{2,}:?\s*\|/);
  });

  it("is idempotent for a table (second pass equals the first)", () => {
    const table = "| a | b |\n| --- | --- |\n| 1 | 2 |";
    const once = roundTrip(table);
    expect(roundTrip(once)).toBe(once);
  });

  it("preserves core formatting through the cycle", () => {
    const doc = "# Title\n\nSome **bold** and *italic* and `code`.\n\n- one\n- two";
    const once = roundTrip(doc);
    expect(once).toContain("# Title");
    expect(once).toContain("**bold**");
    expect(once).toContain("`code`");
    expect(roundTrip(once)).toBe(once);
  });

  it("does not auto-link bare domain-like tokens (no linkify corruption)", () => {
    const doc = "# CLAUDE.md\n\nSee paseo.sh and run foo.md for details.";
    const out = roundTrip(doc);
    expect(out).not.toContain("](http");
    expect(out).toContain("# CLAUDE.md");
    expect(out).toContain("paseo.sh");
    expect(roundTrip(out)).toBe(out);
  });

  it("keeps frontmatter verbatim while round-tripping the body", () => {
    const full =
      "---\ntitle: Hello\ntags: [a, b]\n---\n\n# Body\n\n| x | y |\n| --- | --- |\n| 1 | 2 |";
    const { frontmatter, body } = splitFrontmatter(full);
    const rebuilt = joinFrontmatter(frontmatter, roundTrip(body));
    // Frontmatter is reproduced byte-for-byte (it never entered the editor).
    expect(rebuilt.startsWith("---\ntitle: Hello\ntags: [a, b]\n---\n")).toBe(true);
    expect(rebuilt).toContain("# Body");
    expect(rebuilt).toContain("| x");
  });
});
