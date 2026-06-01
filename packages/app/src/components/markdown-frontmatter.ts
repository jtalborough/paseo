/**
 * Splits a leading YAML (`---`) or TOML (`+++`) frontmatter block off a markdown
 * document so the WYSIWYG editor only ever sees the body. The TipTap editor has
 * no frontmatter node — feeding it the raw fences would render them as a stray
 * heading/thematic break and mangle them on save. Instead we preserve the block
 * verbatim and re-attach it on serialize ([[markdown-editor]]).
 *
 * The block is matched only at the very top of the file (an optional BOM aside),
 * with a matching closing fence of the same type. An unterminated opening fence
 * is treated as ordinary body, never swallowed.
 */

export interface SplitFrontmatter {
  /** The frontmatter block including both fences and its trailing newline, or "" when absent. */
  frontmatter: string;
  /** Everything after the frontmatter block (the whole document when absent). */
  body: string;
}

const OPEN_FENCE = /^(﻿?)(---|\+\+\+)[ \t]*\r?\n/;

export function splitFrontmatter(content: string): SplitFrontmatter {
  const open = OPEN_FENCE.exec(content);
  if (!open) {
    return { frontmatter: "", body: content };
  }
  const fence = open[2];
  const afterOpen = open[0].length;
  const rest = content.slice(afterOpen);
  // Closing fence of the same type, at the start of the file-after-open or on its own line.
  const closeFence = fence === "+++" ? "\\+\\+\\+" : "---";
  const close = new RegExp(`(?:^|\\r?\\n)${closeFence}[ \\t]*(?:\\r?\\n|$)`).exec(rest);
  if (!close) {
    return { frontmatter: "", body: content };
  }
  const end = afterOpen + close.index + close[0].length;
  return { frontmatter: content.slice(0, end), body: content.slice(end) };
}

export function joinFrontmatter(frontmatter: string, body: string): string {
  return frontmatter + body;
}
