import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, CircleAlert, Clock3, LoaderCircle, RotateCcw, Tag, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useAutosave } from "@/hooks/useAutosave";
import { useWorkspaceUi } from "@/stores/workspace-ui";
import { removeHashtag, readNoteTags, readNoteTitle, updateFrontmatterTags, updateNoteTitle } from "@/lib/note-markdown";
import { archiveNote, restoreNote, updateNote } from "@/services/api";
import type { NoteDetail, NoteTarget } from "@/services/api";

const MarkdownEditor = lazy(() =>
  import("@/components/MarkdownEditor").then((module) => ({
    default: module.MarkdownEditor,
  })),
);

interface NoteEditorPaneProps {
  note: NoteDetail;
  targets: NoteTarget[];
  availableTags: string[];
  onOpenNote: (id: number) => void;
  onDelete: () => void;
}

export function NoteEditorPane({
  note,
  targets,
  availableTags,
  onOpenNote,
  onDelete,
}: NoteEditorPaneProps) {
  const queryClient = useQueryClient();
  const evidenceTarget = useWorkspaceUi((state) => state.evidenceTarget);
  const evidenceRange = useMemo(
    () => evidenceTarget?.noteId === note.id
      ? { start: evidenceTarget.start, end: evidenceTarget.end, revision: evidenceTarget.revision }
      : null,
    [evidenceTarget, note.id],
  );
  const [newTag, setNewTag] = useState("");
  const [tagError, setTagError] = useState("");
  const saveMutation = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) => updateNote(id, content),
    onSuccess: async (updated) => {
      queryClient.setQueryData(["note", updated.id], updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notes"] }),
        queryClient.invalidateQueries({ queryKey: ["tags"] }),
        queryClient.invalidateQueries({ queryKey: ["noteTargets"] }),
        queryClient.invalidateQueries({ queryKey: ["noteLinks"] }),
        queryClient.invalidateQueries({ queryKey: ["backlinks"] }),
        queryClient.invalidateQueries({ queryKey: ["claims", updated.id] }),
        queryClient.invalidateQueries({ queryKey: ["search"] }),
      ]);
    },
  });
  const archiveMutation = useMutation({
    mutationFn: archiveNote,
    onSuccess: async (summary) => {
      queryClient.setQueryData<NoteDetail>(["note", summary.id], (current) =>
        current ? { ...current, ...summary } : current,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notes"] }),
        queryClient.invalidateQueries({ queryKey: ["tags"] }),
        queryClient.invalidateQueries({ queryKey: ["noteTargets"] }),
        queryClient.invalidateQueries({ queryKey: ["search"] }),
      ]);
      toast.add({ title: "Note archived", type: "success" });
    },
  });
  const restoreMutation = useMutation({
    mutationFn: restoreNote,
    onSuccess: async (summary) => {
      queryClient.setQueryData<NoteDetail>(["note", summary.id], (current) =>
        current ? { ...current, ...summary } : current,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notes"] }),
        queryClient.invalidateQueries({ queryKey: ["tags"] }),
        queryClient.invalidateQueries({ queryKey: ["noteTargets"] }),
        queryClient.invalidateQueries({ queryKey: ["search"] }),
      ]);
      toast.add({ title: "Note restored", type: "success" });
    },
  });
  const save = useCallback(
    (id: number, content: string) => saveMutation.mutateAsync({ id, content }),
    [saveMutation.mutateAsync],
  );
  const autosave = useAutosave({
    noteId: note.id,
    initialContent: note.content,
    save,
  });
  useEffect(() => {
    if (evidenceRange && evidenceRange.end > autosave.content.length) {
      useWorkspaceUi.getState().showEvidenceInNote(
        note.id,
        Math.min(evidenceRange.start, autosave.content.length),
        autosave.content.length,
      );
    }
  }, [autosave.content.length, evidenceRange, note.id]);
  const tags = readNoteTags(autosave.content);
  const title = readNoteTitle(autosave.content, note.title);
  const addTag = () => {
    const clean = newTag.trim().replace(/^#/, "");
    if (!/^[A-Za-z][\w/-]*$/.test(clean)) {
      setTagError("Tags start with a letter and may contain letters, numbers, /, or -.");
      return;
    }
    autosave.setContent(updateFrontmatterTags(autosave.content, [...tags, clean]));
    setNewTag("");
    setTagError("");
  };
  const removeTag = (tag: string) => {
    const next = updateFrontmatterTags(
      removeHashtag(autosave.content, tag),
      tags.filter((current) => current.toLocaleLowerCase() !== tag.toLocaleLowerCase()),
    );
    autosave.setContent(next);
  };
  const statusCopy = {
    saved: "Saved",
    saving: "Saving…",
    unsaved: "Unsaved changes",
    error: "Error",
  }[autosave.status];

  return (
    <section aria-label={`Editor: ${note.title}`} className="note-editor-pane">
      <div className="editor-toolbar">
        <div aria-live="polite" className={`save-state save-state--${autosave.status}`} role="status">
          {autosave.status === "error" ? <CircleAlert aria-hidden="true" size={14} /> :
            autosave.status === "saving" ? <LoaderCircle aria-hidden="true" className="save-spinner" size={14} /> :
              autosave.status === "unsaved" ? <Clock3 aria-hidden="true" size={14} /> :
                <Check aria-hidden="true" size={14} />}
          <span>{statusCopy}</span>
          {autosave.status === "error" && (
            <Button aria-label="Retry saving note" onClick={autosave.retry} size="xs" variant="outline">
              Retry
            </Button>
          )}
        </div>
        <div className="editor-actions">
          {note.archived_at ? (
            <Button
              disabled={restoreMutation.isPending}
              onClick={() => restoreMutation.mutate(note.id)}
              size="sm"
              variant="outline"
            >
              <RotateCcw aria-hidden="true" /> Restore
            </Button>
          ) : (
            <Button
              disabled={archiveMutation.isPending}
              onClick={() => archiveMutation.mutate(note.id)}
              size="sm"
              variant="outline"
            >
              <Archive aria-hidden="true" /> Archive
            </Button>
          )}
          <Button aria-label="Permanently delete note" onClick={onDelete} size="icon-sm" variant="ghost">
            <Trash2 aria-hidden="true" size={15} />
          </Button>
        </div>
      </div>
      {autosave.status === "error" && autosave.error && (
        <p className="editor-error" role="alert">
          {autosave.error.message} Your text is kept in this editor and in a local recovery copy.
        </p>
      )}
      {(archiveMutation.isError || restoreMutation.isError) && (
        <p className="editor-error" role="alert">
          {(archiveMutation.error ?? restoreMutation.error)?.message} Please retry the action.
        </p>
      )}
      <label className="sr-only" htmlFor="note-title">
        Note title
      </label>
      <Input
        className="note-title-input"
        id="note-title"
        onChange={(event) =>
          autosave.setContent(updateNoteTitle(autosave.content, event.target.value))
        }
        placeholder="Untitled note"
        value={title}
      />
      <div className="note-tag-editor">
        <Tag aria-hidden="true" size={15} />
        <div className="note-tag-list">
          {tags.map((tag) => (
            <button
              aria-label={`Remove tag ${tag}`}
              className="note-tag"
              key={tag}
              onClick={() => removeTag(tag)}
              title={`Remove ${tag}`}
              type="button"
            >
              {tag}<span aria-hidden="true"> ×</span>
            </button>
          ))}
        </div>
        <Input
          aria-label="Add a tag"
          className="tag-input"
          list="existing-note-tags"
          onChange={(event) => {
            setNewTag(event.target.value);
            setTagError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTag();
            }
          }}
          placeholder="Add tag…"
          value={newTag}
        />
        <datalist id="existing-note-tags">
          {availableTags.map((tag) => <option key={tag} value={tag} />)}
        </datalist>
        <Button
          disabled={!newTag.trim()}
          onClick={addTag}
          size="sm"
          variant="ghost"
        >
          Add
        </Button>
      </div>
      {tagError && <p className="tag-validation" role="alert">{tagError}</p>}
      <Suspense fallback={<div aria-busy="true" className="markdown-editor-loading" />}>
        <MarkdownEditor
          evidenceRange={evidenceRange}
          onChange={autosave.setContent}
          onOpenNote={onOpenNote}
          targets={targets}
          value={autosave.content}
        />
      </Suspense>
      <p className="editor-footnote">
        Markdown is saved to your vault as you write. Type <code>[[</code> to link a note.
      </p>
    </section>
  );
}
