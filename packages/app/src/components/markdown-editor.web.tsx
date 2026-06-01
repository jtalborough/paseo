import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { MarkdownStorage } from "tiptap-markdown";
import { buildMarkdownEditorExtensions } from "@/components/markdown-editor-extensions";
import { useAutosaveFile } from "@/components/use-autosave-file";
import { FileSaveStatusBar } from "@/components/file-save-status-bar";
import type { MarkdownEditorProps } from "@/components/markdown-editor-types";
import { buildProseMirrorCss, PROSE_SCOPE_CLASS } from "@/components/markdown-editor-styles";
import { joinFrontmatter, splitFrontmatter } from "@/components/markdown-frontmatter";

/**
 * WYSIWYG markdown editor for `.md` files on web/Electron. Renders rendered
 * formatting (headings, bold/italic, lists, checkboxes, code, quotes, links)
 * via TipTap/ProseMirror and serializes back to markdown on every edit, driving
 * the shared debounced autosave + conflict plumbing ([[use-autosave-file]]).
 *
 * Native falls back to the plain source editor — see markdown-editor.tsx.
 */
export function MarkdownEditor({
  client,
  cwd,
  path,
  initialContent,
  initialModifiedAt,
  onReload,
  themeTokens,
}: MarkdownEditorProps) {
  const { content, setContent, saveState, isConflicted } = useAutosaveFile({
    client,
    cwd,
    path,
    initialContent,
    initialModifiedAt,
  });

  const [mode, setMode] = useState<"rich" | "source">("rich");

  // Guards a feedback loop: when we programmatically reseed the editor (mount,
  // reload, or source→rich), the resulting onUpdate must not be treated as a
  // user edit.
  const seedingRef = useRef(false);
  // The editor models only the document body; any leading frontmatter block is
  // held verbatim here and re-attached on serialize so it survives untouched.
  const frontmatterRef = useRef(splitFrontmatter(initialContent).frontmatter);

  const editor = useEditor({
    extensions: buildMarkdownEditorExtensions(),
    editable: !isConflicted,
    content: splitFrontmatter(initialContent).body,
    onUpdate: ({ editor: ed }) => {
      if (seedingRef.current) {
        return;
      }
      setContent(joinFrontmatter(frontmatterRef.current, getEditorMarkdown(ed)));
    },
  });

  // Seed the editor body from a full document, capturing its frontmatter.
  const seedFrom = useCallback(
    (full: string) => {
      if (!editor) {
        return;
      }
      const { frontmatter, body } = splitFrontmatter(full);
      frontmatterRef.current = frontmatter;
      seedingRef.current = true;
      editor.commands.setContent(body);
      seedingRef.current = false;
    },
    [editor],
  );

  // Reseed when the underlying file changes (new file / reload after conflict).
  useEffect(() => {
    seedFrom(initialContent);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- modifiedAt marks a fresh load
  }, [seedFrom, initialContent, initialModifiedAt]);

  useEffect(() => {
    editor?.setEditable(!isConflicted);
  }, [editor, isConflicted]);

  const enterRich = useCallback(() => {
    // Re-parse any raw edits made in source mode (including frontmatter) before
    // showing the rendered view.
    seedFrom(content);
    setMode("rich");
  }, [seedFrom, content]);

  const enterSource = useCallback(() => setMode("source"), []);

  const css = useMemo(() => buildProseMirrorCss(themeTokens), [themeTokens]);

  return (
    <View style={styles.container}>
      <FileSaveStatusBar
        saveState={saveState}
        onReload={onReload}
        actionLabel={mode === "rich" ? "View source" : "View rendered"}
        onAction={mode === "rich" ? enterSource : enterRich}
      />
      {/* Scoped, theme-derived styles for the ProseMirror DOM (web only). */}
      <style>{css}</style>
      {mode === "rich" ? (
        <View style={styles.editorScroll}>
          <div className={PROSE_SCOPE_CLASS} style={proseHostStyle}>
            <EditorContent editor={editor} />
          </div>
        </View>
      ) : (
        <TextInput
          value={content}
          onChangeText={setContent}
          editable={!isConflicted}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          textAlignVertical="top"
          style={styles.source}
          testID="workspace-markdown-source"
        />
      )}
    </View>
  );
}

const proseHostStyle = { height: "100%", overflow: "auto" } as const;

// tiptap-markdown attaches its storage under `markdown` but doesn't augment the
// editor's Storage type, so read it through a typed view.
function getEditorMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown();
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  editorScroll: {
    flex: 1,
    minHeight: 0,
  },
  source: {
    flex: 1,
    minHeight: 0,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface0,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    lineHeight: theme.fontSize.code * 1.45,
    padding: theme.spacing[4],
  },
}));
