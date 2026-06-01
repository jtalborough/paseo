import type { MarkdownEditorThemeTokens } from "@/components/markdown-editor-types";

/** Class scoping the ProseMirror DOM so the injected CSS doesn't leak. */
export const PROSE_SCOPE_CLASS = "paseo-md-editor";

/**
 * Builds a scoped stylesheet for the TipTap/ProseMirror DOM from theme tokens.
 * Theming uses explicit token values (passed from a caller that already reads
 * the theme) plus relative sizing, so no `useUnistyles()` is needed here and the
 * styles still update when the theme changes (the caller re-renders with new
 * tokens). See docs/unistyles.md.
 */
export function buildProseMirrorCss(t: MarkdownEditorThemeTokens): string {
  const s = `.${PROSE_SCOPE_CLASS}`;
  const mono = t.codeFontFamily.replace(/"/g, "'");
  return `
${s} .ProseMirror {
  color: ${t.foreground};
  font-size: ${t.baseFontSize}px;
  line-height: 1.6;
  padding: 16px 20px;
  outline: none;
  min-height: 100%;
  box-sizing: border-box;
  caret-color: ${t.foreground};
  -webkit-font-smoothing: antialiased;
}
${s} .ProseMirror > * { margin: 0 0 0.75em 0; }
${s} .ProseMirror > *:last-child { margin-bottom: 0; }
${s} .ProseMirror h1 { font-size: 1.8em; font-weight: 700; line-height: 1.25; margin: 0.6em 0 0.4em; }
${s} .ProseMirror h2 { font-size: 1.45em; font-weight: 700; line-height: 1.3; margin: 0.6em 0 0.35em; }
${s} .ProseMirror h3 { font-size: 1.2em; font-weight: 600; margin: 0.55em 0 0.3em; }
${s} .ProseMirror h4 { font-size: 1.05em; font-weight: 600; margin: 0.5em 0 0.3em; }
${s} .ProseMirror h5, ${s} .ProseMirror h6 { font-size: 1em; font-weight: 600; margin: 0.5em 0 0.3em; }
${s} .ProseMirror strong { font-weight: 700; }
${s} .ProseMirror em { font-style: italic; }
${s} .ProseMirror s, ${s} .ProseMirror del { text-decoration: line-through; }
${s} .ProseMirror a { color: ${t.accent}; text-decoration: underline; cursor: pointer; }
${s} .ProseMirror code {
  font-family: ${mono};
  font-size: 0.875em;
  background: ${t.codeSurface};
  padding: 0.15em 0.35em;
  border-radius: 4px;
}
${s} .ProseMirror pre {
  font-family: ${mono};
  font-size: 0.875em;
  background: ${t.codeSurface};
  padding: 12px 14px;
  border-radius: 6px;
  overflow-x: auto;
  white-space: pre;
}
${s} .ProseMirror pre code { background: none; padding: 0; font-size: inherit; }
${s} .ProseMirror blockquote {
  border-left: 3px solid ${t.border};
  padding-left: 12px;
  color: ${t.foregroundMuted};
  margin-left: 0;
}
${s} .ProseMirror ul, ${s} .ProseMirror ol { padding-left: 1.4em; }
/* Discrete markers per nesting depth. Markdown only encodes ordered-vs-bullet,
   so these markers are display-only and never change the serialized source. */
${s} .ProseMirror ol { list-style-type: decimal; }
${s} .ProseMirror ol ol { list-style-type: lower-alpha; }
${s} .ProseMirror ol ol ol { list-style-type: lower-roman; }
${s} .ProseMirror ol ol ol ol { list-style-type: decimal; }
${s} .ProseMirror ol ol ol ol ol { list-style-type: lower-alpha; }
${s} .ProseMirror ul { list-style-type: disc; }
${s} .ProseMirror ul ul { list-style-type: circle; }
${s} .ProseMirror ul ul ul { list-style-type: square; }
${s} .ProseMirror ul ul ul ul { list-style-type: disc; }
${s} .ProseMirror li { margin: 0.2em 0; }
${s} .ProseMirror li > p { margin: 0; }
${s} .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0.2em; }
${s} .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; }
${s} .ProseMirror ul[data-type="taskList"] li > label { margin-top: 0.2em; user-select: none; }
${s} .ProseMirror ul[data-type="taskList"] li > div { flex: 1 1 auto; min-width: 0; }
${s} .ProseMirror table {
  border-collapse: collapse;
  width: auto;
  max-width: 100%;
  margin: 0 0 0.75em 0;
  overflow: hidden;
}
${s} .ProseMirror th, ${s} .ProseMirror td {
  border: 1px solid ${t.border};
  padding: 0.4em 0.6em;
  text-align: left;
  vertical-align: top;
}
${s} .ProseMirror th {
  background: ${t.codeSurface};
  font-weight: 600;
}
${s} .ProseMirror th > p, ${s} .ProseMirror td > p { margin: 0; }
${s} .ProseMirror .selectedCell { background: ${t.codeSurface}; }
${s} .ProseMirror hr {
  border: none;
  border-top: 1px solid ${t.border};
  margin: 1em 0;
}
${s} .ProseMirror:focus { outline: none; }
`;
}
