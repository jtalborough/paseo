import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import type { MarkdownStorage } from "tiptap-markdown";
import { buildMarkdownExtensions } from "@/components/markdown-editor-extensions";

/**
 * Parse `markdown` into the editor and serialize it back out, the same path the
 * WYSIWYG editor's autosave takes. Needs a DOM, so this is a browser test.
 */
function roundtrip(markdown: string): string {
  const editor = new Editor({ extensions: buildMarkdownExtensions(), content: markdown });
  try {
    return (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown();
  } finally {
    editor.destroy();
  }
}

describe("markdown task list round-trip", () => {
  it("keeps a task list tight — no blank lines, no stray empty item", () => {
    const source = ["- [x] one", "- [ ] two", "- [x] three"].join("\n");

    const out = roundtrip(source).trim();
    const lines = out.split("\n");

    // Regression guard: taskList used to serialize loose (blank line between
    // every item), which re-parsed into broken separate lists plus a stray
    // empty `- [ ]`. Tight output is exactly the three original items.
    expect(lines).toEqual(["- [x] one", "- [ ] two", "- [x] three"]);
    expect(out).not.toMatch(/\n\s*\n/);
  });

  it("preserves checked/unchecked state and item count", () => {
    const source = ["- [ ] a", "- [x] b"].join("\n");

    const out = roundtrip(source).trim();

    expect(out.match(/^- \[[ x]\] /gm)).toHaveLength(2);
    expect(out).toContain("- [ ] a");
    expect(out).toContain("- [x] b");
  });
});
