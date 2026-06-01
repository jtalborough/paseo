import { FileEditor } from "@/components/file-editor";
import type { MarkdownEditorProps } from "@/components/markdown-editor-types";

/**
 * Native/base fallback: WYSIWYG markdown editing is web/Electron-only for now,
 * so native renders the plain source editor. Metro resolves markdown-editor.web.tsx
 * on web/Electron and this file on native.
 */
export function MarkdownEditor({
  client,
  cwd,
  path,
  initialContent,
  initialModifiedAt,
  onReload,
}: MarkdownEditorProps) {
  return (
    <FileEditor
      client={client}
      cwd={cwd}
      path={path}
      initialContent={initialContent}
      initialModifiedAt={initialModifiedAt}
      onReload={onReload}
    />
  );
}
