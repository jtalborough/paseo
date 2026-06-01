import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";

/**
 * Theme tokens passed down from a caller that already reads them (file-pane's
 * existing `useUnistyles`), so the web markdown editor can style the ProseMirror
 * DOM without adding its own `useUnistyles()` call. See docs/unistyles.md.
 */
export interface MarkdownEditorThemeTokens {
  foreground: string;
  foregroundMuted: string;
  border: string;
  surface: string;
  codeSurface: string;
  accent: string;
  baseFontSize: number;
  codeFontFamily: string;
}

export interface MarkdownEditorProps {
  client: DaemonClient;
  cwd: string;
  /** Read-target relative path the file was loaded with. */
  path: string;
  initialContent: string;
  initialModifiedAt: string;
  /** Re-fetch the file from disk (used to recover after a conflict). */
  onReload: () => void;
  themeTokens: MarkdownEditorThemeTokens;
}
