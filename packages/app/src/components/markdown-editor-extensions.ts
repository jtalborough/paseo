import type { Extensions } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";

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
 * The TipTap extension set powering the WYSIWYG markdown editor. Lives in its
 * own module (no React) so the markdown round-trip can be tested headlessly with
 * a bare `new Editor({ extensions })`.
 */
export function buildMarkdownExtensions(): Extensions {
  return [
    StarterKit.configure({ link: { openOnClick: false } }),
    TightTaskList,
    TaskItem.configure({ nested: true }),
    Markdown.configure({ html: false, linkify: true, breaks: false, transformPastedText: true }),
  ];
}
