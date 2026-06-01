/**
 * Decides whether a markdown document can be safely round-tripped through the
 * WYSIWYG editor (TipTap + tiptap-markdown). The editor models only core inline
 * formatting; constructs it does not understand are dropped or mangled when the
 * document is serialized back to markdown. Rather than risk silent data loss, a
 * file containing any such construct opens in the plain source editor instead.
 *
 * This is intentionally conservative: false (unsafe) is the safe answer, so we
 * only return true when the content is clearly within the supported subset.
 *
 * Frontmatter and GitHub tables are NOT listed here: frontmatter is split off
 * and preserved verbatim ([[markdown-frontmatter]]) and tables round-trip via
 * the TipTap table extensions + tiptap-markdown serializer ([[markdown-editor]]).
 */

import { splitFrontmatter } from "@/components/markdown-frontmatter";

// Footnote definition or reference, e.g. `[^1]`.
const FOOTNOTE = /\[\^[^\]]+\]/;
// A raw HTML block/tag (excluding autolink-style `<https://…>` and `<email@…>`).
const RAW_HTML = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?>/;
// Definition list (markdown-it style) — `term` then `: definition`.
const DEFINITION_LIST = /^\s*:\s+\S/m;

const UNSAFE_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "footnote", pattern: FOOTNOTE },
  { name: "html", pattern: RAW_HTML },
  { name: "definitionList", pattern: DEFINITION_LIST },
];

/**
 * Blanks out fenced and inline code so their contents never trigger the unsafe
 * patterns. Code routinely contains literal `<file>`-style placeholders and
 * `: value` lines that are not HTML or definition lists — TipTap round-trips
 * code verbatim, so it must be excluded from the scan.
 */
function stripCodeRegions(markdown: string): string {
  const kept: string[] = [];
  let fence: string | null = null;
  for (const line of markdown.split("\n")) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }
    kept.push(line);
  }
  // Inline code: matched backtick runs (handles `code` and ``a`b``).
  return kept.join("\n").replace(/(`+)(?:(?!\1).)*?\1/gs, " ");
}

export interface MarkdownSafetyResult {
  safe: boolean;
  /** The construct that made it unsafe, for the source-editor notice. */
  reason: string | null;
}

export function analyzeMarkdownSafety(content: string): MarkdownSafetyResult {
  // Frontmatter is preserved verbatim and never passes through TipTap, so scan
  // only the body — otherwise a `<...>` or `: x` in YAML would force a fallback.
  const { body } = splitFrontmatter(content);
  // Code regions round-trip verbatim, so a `<file>` placeholder inside a fenced
  // block is not the HTML we care about — exclude code before scanning.
  const scannable = stripCodeRegions(body);
  for (const { name, pattern } of UNSAFE_PATTERNS) {
    if (pattern.test(scannable)) {
      return { safe: false, reason: name };
    }
  }
  return { safe: true, reason: null };
}

export function isLosslessMarkdown(content: string): boolean {
  return analyzeMarkdownSafety(content).safe;
}

/** Human-facing names for the constructs that force the plain source editor. */
const FALLBACK_REASON_LABELS: Record<string, string> = {
  footnote: "footnotes",
  html: "embedded HTML",
  definitionList: "a definition list",
};

/** A user-facing label for a fallback reason, or null when there is none. */
export function markdownFallbackLabel(reason: string | null): string | null {
  if (!reason) {
    return null;
  }
  return FALLBACK_REASON_LABELS[reason] ?? "formatting";
}
