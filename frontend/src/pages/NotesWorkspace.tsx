import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { NoteListPanel, NOTE_PAGE_SIZE } from "@/components/NoteListPanel";
import type { NoteSort } from "@/components/NoteListPanel";
import { NoteEditorPane } from "@/components/NoteEditorPane";
import { useWorkspaceUi } from "@/stores/workspace-ui";
import { createUntitledNote, deleteNote, listNoteTargets, listTagsForMode } from "@/services/api";
import { getNote } from "@/services/api";
import { listNotesWithSnippets } from "@/services/note-list";
import { useNoteSearch } from "@/hooks/useNoteSearch";

export function NotesWorkspace() {
  const queryClient = useQueryClient();
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<NoteSort>("updated_at");
  const [archived, setArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const selectedNoteId = useWorkspaceUi((state) => state.selectedNoteId);
  const selectionPinned = useWorkspaceUi((state) => state.selectionPinned);
  const setSelectedNoteId = useWorkspaceUi((state) => state.setSelectedNoteId);
  const notes = useQuery({
    queryKey: ["notes", { tag, sort, archived, offset }],
    queryFn: () =>
      listNotesWithSnippets({
        limit: NOTE_PAGE_SIZE,
        offset,
        ...(tag ? { tag } : {}),
        sort,
        archived,
      }),
  });
  const tags = useQuery({
    queryKey: ["tags", archived],
    queryFn: () => listTagsForMode(archived),
  });
  const targets = useQuery({ queryKey: ["noteTargets"], queryFn: listNoteTargets });
  const search = useNoteSearch(archived ? "" : searchQuery);
  const selectedNote = useQuery({
    queryKey: ["note", selectedNoteId],
    queryFn: () => getNote(selectedNoteId!),
    enabled: selectedNoteId !== null,
  });
  const items = notes.data?.items ?? [];

  useEffect(() => {
    if (selectionPinned) return;
    const items = notes.data?.items ?? [];
    if (items.length && !items.some((note) => note.id === selectedNoteId)) {
      setSelectedNoteId(items[0].id);
    } else if (!items.length && notes.isSuccess) {
      setSelectedNoteId(null);
    }
  }, [notes.data, notes.isSuccess, selectedNoteId, selectionPinned, setSelectedNoteId]);

  const invalidateNoteData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notes"] }),
      queryClient.invalidateQueries({ queryKey: ["tags"] }),
      queryClient.invalidateQueries({ queryKey: ["noteTargets"] }),
      queryClient.invalidateQueries({ queryKey: ["noteLinks"] }),
      queryClient.invalidateQueries({ queryKey: ["backlinks"] }),
      queryClient.invalidateQueries({ queryKey: ["search"] }),
    ]);
  }, [queryClient]);
  const createMutation = useMutation({
    mutationFn: createUntitledNote,
    onSuccess: async (note) => {
      queryClient.setQueryData(["note", note.id], note);
      setArchived(false);
      setTag("");
      setOffset(0);
      setSelectedNoteId(note.id, true);
      await invalidateNoteData();
      toast.add({ title: "New note created", type: "success" });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteNote,
    onSuccess: (_result, id) => {
      setDeleteOpen(false);
      setSelectedNoteId(null, false);
      queryClient.removeQueries({ queryKey: ["note", id] });
      void invalidateNoteData();
      toast.add({ title: "Note permanently deleted", type: "success" });
    },
  });
  const openNote = useCallback((id: number) => setSelectedNoteId(id, true), [setSelectedNoteId]);

  return (
    <div className="notes-layout">
      <NoteListPanel
        actionError={(createMutation.error ?? deleteMutation.error)?.message ?? null}
        archived={archived}
        createPending={createMutation.isPending}
        searchQuery={searchQuery}
        searchResults={search.results}
        searchLoading={search.isFetching}
        searchDebouncing={search.isDebouncing}
        searchError={search.isError ? search.error : null}
        onSearchChange={setSearchQuery}
        onRetrySearch={() => void search.refetch()}
        onArchivedChange={(value) => {
          setArchived(value);
          setOffset(0);
          setSelectedNoteId(null, false);
        }}
        onCreate={() => createMutation.mutate()}
        onOffsetChange={(value) => {
          setOffset(value);
          setSelectedNoteId(null, false);
        }}
        onSelect={(id) => setSelectedNoteId(id, false)}
        onSortChange={setSort}
        onTagChange={(value) => {
          setTag(value);
          setOffset(0);
          setSelectedNoteId(null, false);
        }}
        offset={offset}
        notes={notes}
        selectedNoteId={selectedNoteId}
        sort={sort}
        tag={tag}
        tags={tags}
      />
      <div className="notes-editor-area">
        {selectedNote.isLoading && <div className="editor-loading"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-72 w-full" /></div>}
        {selectedNote.isError && (
          <div className="editor-empty">
            <p role="alert">{selectedNote.error.message}</p>
            <Button onClick={() => void selectedNote.refetch()} variant="outline">Retry loading note</Button>
          </div>
        )}
        {selectedNote.data && (
          <NoteEditorPane
            availableTags={(tags.data ?? []).map((item) => item.name)}
            key={selectedNote.data.id}
            note={selectedNote.data}
            onDelete={() => setDeleteOpen(true)}
            onOpenNote={openNote}
            targets={targets.data ?? []}
          />
        )}
        {!selectedNoteId && notes.isSuccess && items.length === 0 && (
          <div className="editor-empty">
            {archived ? <RotateCcw aria-hidden="true" /> : <FilePlus2 aria-hidden="true" />}
            <p>{archived ? "Archived notes will appear here." : "Create a note to begin writing."}</p>
          </div>
        )}
        {targets.isError && (
          <p className="inline-error editor-hint" role="status">
            Wikilink suggestions could not be loaded. You can still type any [[note title]].
          </p>
        )}
      </div>
      <Dialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <DialogContent>
          <DialogTitle>Permanently delete this note?</DialogTitle>
          <DialogDescription>
            This removes the Markdown file from your vault and cannot be undone.
          </DialogDescription>
          <DialogFooter>
            <Button onClick={() => setDeleteOpen(false)} variant="outline">Cancel</Button>
            <Button
              disabled={deleteMutation.isPending || selectedNoteId === null}
              onClick={() => selectedNoteId !== null && deleteMutation.mutate(selectedNoteId)}
              variant="destructive"
            >
              <Trash2 aria-hidden="true" /> Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
