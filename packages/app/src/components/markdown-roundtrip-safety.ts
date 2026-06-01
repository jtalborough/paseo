/**
 * Decides whether a markdown document can be safely round-tripped through the
 * WYSIWYG editor (TipTap + tiptap-markdown). The editor models only core inline
 * formatting; constructs it does not understand are dropped or mangled when the
 * document is serialized back to markdown. Rather than risk silent data loss, a
 * file containing any such construct opens in the plain source editor instead.
 *
 * This is intentionally conservative: false (unsafe) is the safe answer, so we
 * only return true when the content is clearly within the supported subset.
 */

// `---` (or more) fence at the very top of the file = YAML/TOML frontmatter.
const FRONTMATTER = /^﻿?(?:---|\+\+\+)\r?\n/;
// A GitHub-style table needs a delimiter row of pipes and dashes.
const TABLE_DELIMITER_ROW = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/m;
// Footnote definition or reference, e.g. `[^1]`.
const FOOTNOTE = /\[\^[^\]]+\]/;
// A raw HTML block/tag (excluding autolink-style `<https://…>` and `<email@…>`).
const RAW_HTML = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?>/;
// Definition list (markdown-it style) — `term` then `: definition`.
const DEFINITION_LIST = /^\s*:\s+\S/m;

const UNSAFE_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "frontmatter", pattern: FRONTMATTER },
  { name: "table", pattern: TABLE_DELIMITER_ROW },
  { name: "footnote", pattern: FOOTNOTE },
  { name: "html", pattern: RAW_HTML },
  { name: "definitionList", pattern: DEFINITION_LIST },
];

export interface MarkdownSafetyResult {
  safe: boolean;
  /** The construct that made it unsafe, for the source-editor notice. */
  reason: string | null;
}

export function analyzeMarkdownSafety(content: string): MarkdownSafetyResult {
  for (const { name, pattern } of UNSAFE_PATTERNS) {
    if (pattern.test(content)) {
      return { safe: false, reason: name };
    }
  }
  return { safe: true, reason: null };
}

export function isLosslessMarkdown(content: string): boolean {
  return analyzeMarkdownSafety(content).safe;
}
