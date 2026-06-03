import { useCallback, useEffect, useRef, useState } from "react";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";

const AUTOSAVE_DELAY_MS = 800;

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string }
  | { status: "conflict" };

interface UseAutosaveFileParams {
  client: DaemonClient;
  cwd: string;
  /** Read-target relative path the file was loaded with. */
  path: string;
  initialContent: string;
  initialModifiedAt: string;
}

export interface UseAutosaveFileResult {
  /** Latest editor content (the source of truth for what should be persisted). */
  content: string;
  /** Push new content from the editor; triggers debounced autosave. */
  setContent: (next: string) => void;
  saveState: SaveState;
  /** True once a conflict is detected — editors should go read-only until reload. */
  isConflicted: boolean;
}

/**
 * Debounced autosave for a single file. Writes carry the last-known mtime as
 * `expectedModifiedAt` so a change made on disk (e.g. by an agent) surfaces a
 * conflict instead of being silently clobbered — see CLAUDE.md. Shared by the
 * plain text editor and the markdown WYSIWYG editor so both behave identically.
 */
export function useAutosaveFile({
  client,
  cwd,
  path,
  initialContent,
  initialModifiedAt,
}: UseAutosaveFileParams): UseAutosaveFileResult {
  const [content, setContent] = useState(initialContent);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  // The mtime + content we last persisted. Refs because autosave reads the
  // latest values without re-arming the debounce on every keystroke.
  const savedModifiedAtRef = useRef(initialModifiedAt);
  const savedContentRef = useRef(initialContent);
  const conflictedRef = useRef(false);

  // Re-seed when the underlying file changes. A background refetch after an
  // autosave re-supplies the content we just saved (with a fresh mtime); fully
  // resetting then would discard characters typed inside the debounce window and
  // jump the cursor. So only re-seed on a genuine external change — a different
  // file (path change) or disk content we have not saved (reload after
  // conflict). For a post-save refetch, just adopt the new mtime.
  useEffect(() => {
    if (initialContent === savedContentRef.current) {
      savedModifiedAtRef.current = initialModifiedAt;
      return;
    }
    setContent(initialContent);
    setSaveState({ status: "idle" });
    savedModifiedAtRef.current = initialModifiedAt;
    savedContentRef.current = initialContent;
    conflictedRef.current = false;
  }, [initialContent, initialModifiedAt]);

  const save = useCallback(
    async (next: string) => {
      setSaveState({ status: "saving" });
      try {
        const result = await client.writeFile(cwd, path, next, {
          expectedModifiedAt: savedModifiedAtRef.current,
        });
        if (result.outcome === "conflict") {
          conflictedRef.current = true;
          setSaveState({ status: "conflict" });
          return;
        }
        if (result.error || !result.modifiedAt) {
          setSaveState({ status: "error", message: result.error ?? "Failed to save" });
          return;
        }
        savedModifiedAtRef.current = result.modifiedAt;
        savedContentRef.current = next;
        setSaveState({ status: "saved" });
      } catch (error) {
        setSaveState({
          status: "error",
          message: error instanceof Error ? error.message : "Failed to save",
        });
      }
    },
    [client, cwd, path],
  );

  // Debounced autosave: fire once the content has been idle for a moment and
  // differs from what is on disk. Stops once a conflict is detected. Only real
  // edits (content !== last-saved) trigger a write, so the parsed-on-load
  // content is never written back — important for the markdown editor, whose
  // serializer may normalize formatting.
  useEffect(() => {
    if (conflictedRef.current) {
      return;
    }
    if (content === savedContentRef.current) {
      return;
    }
    const timeout = setTimeout(() => {
      void save(content);
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [content, save]);

  return {
    content,
    setContent,
    saveState,
    isConflicted: saveState.status === "conflict",
  };
}
