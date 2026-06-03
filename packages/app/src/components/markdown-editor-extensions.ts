import { StarterKit } from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Markdown } from "tiptap-markdown";
import type { Extensions } from "@tiptap/react";

// tiptap-markdown only registers its `tight` list attribute on bulletList and
// orderedList, so taskList nodes serialize loose — a blank line between every
// item, which markdown-it then re-parses into broken separate lists (and a
// stray empty item). Carry the same `tight: true` attribute on taskList so the
// markdown serializer keeps checkbox lists tight on round-trip. Covered by
// markdown-task-list-roundtrip.browser.test.ts.
export const TightTaskList = TaskList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      tight: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-tight") !== "false",
        renderHTML: (attributes) => (attributes.tight ? { "data-tight": "true" } : {}),
      },
    };
  },
});

/**
 * The TipTap extension set for the WYSIWYG markdown editor. Extracted so the
 * editor component and the round-trip browser test share one definition — the
 * test would be meaningless if it could drift from what ships. See
 * [[markdown-editor]] and markdown-roundtrip-safety.browser.test.
 */
export function buildMarkdownEditorExtensions(): Extensions {
  return [
    StarterKit.configure({ link: { openOnClick: false } }),
    TightTaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    // linkify is OFF: it rewrites bare domain-like tokens (e.g. `paseo.sh`,
    // `CLAUDE.md`) into links on save, corrupting plain prose. Explicit
    // `[text](url)` links still work.
    Markdown.configure({ html: false, linkify: false, breaks: false, transformPastedText: true }),
  ];
}
