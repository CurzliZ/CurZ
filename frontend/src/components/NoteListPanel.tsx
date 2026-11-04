import type { UseQueryResult } from "@tanstack/react-query";
import { FilePlus2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { HighlightedSnippet } from "@/components/HighlightedSnippet";
import type { SearchResult, TagItem } from "@/services/api";
import type { NoteListItem } from "@/services/note-list";

export type NoteSort = "updated_at" | "created_at" | "title";
export const NOTE_PAGE_SIZE = 50;

interface NoteListPanelProps {
  notes: UseQueryResult<{ items: NoteListItem[]; total: number }, Error>;
  tags: UseQueryResult<TagItem[], Error>;
  selectedNoteId: number | null;
  tag: string;
  archived: boolean;
  sort: NoteSort;
  offset: number;
  createPending: boolean;
  actionError: string | null;
  searchQuery: string;
  searchResults: SearchResult[];
  searchLoading: boolean;
  searchDebouncing: boolean;
  searchError: Error | null;
  onCreate: () => void;
  onSearchChange: (query: string) => void;
  onRetrySearch: () => void;
  onSelect: (id: number) => void;
  onTagChange: (tag: string) => void;
  onArchivedChange: (archived: boolean) => void;
  onSortChange: (sort: NoteSort) => void;
  onOffsetChange: (offset: number) => void;
}

function formatUpdated(date: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(date));
}

export function NoteListPanel({
  notes,
  tags,
  selectedNoteId,
  tag,
  archived,
  sort,
  offset,
  createPending,
  actionError,
  searchQuery,
  searchResults,
  searchLoading,
  searchDebouncing,
  searchError,
  onCreate,
  onSearchChange,
  onRetrySearch,
  onSelect,
  onTagChange,
  onArchivedChange,
  onSortChange,
  onOffsetChange,
}: NoteListPanelProps) {
  const searching = !archived && Boolean(searchQuery.trim());
  const items = searching
    ? searchResults.filter((note) => !tag || note.tags.includes(tag))
    : notes.data?.items ?? [];
  const total = notes.data?.total ?? 0;
  return (
    <aside aria-label="Notes list" className="notes-list-panel">
      <div className="notes-list-heading">
        <div>
          <p className="eyebrow">Your vault</p>
          <h1>Notes</h1>
        </div>
        <Button
          aria-label="Create a new note"
          disabled={createPending}
          onClick={onCreate}
          size="icon"
          title="New note"
        >
          <FilePlus2 aria-hidden="true" size={17} />
        </Button>
      </div>
      <label className="sr-only" htmlFor="notes-search">Search notes</label>
      <Input
        className="notes-search-input"
        disabled={archived}
        id="notes-search"
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={archived ? "Search is available for active notes" : "Search notes…"}
        type="search"
        value={searchQuery}
      />
      <div aria-label="Filter notes by tag" className="note-tag-filters" role="group">
        <button
          aria-pressed={!tag}
          className={`note-tag-filter${!tag ? " is-active" : ""}`}
          onClick={() => onTagChange("")}
          type="button"
        >
          All
        </button>
        {(tags.data ?? []).map((item) => (
          <button
            aria-pressed={tag === item.name}
            className={`note-tag-filter${tag === item.name ? " is-active" : ""}`}
            key={item.name}
            onClick={() => onTagChange(tag === item.name ? "" : item.name)}
            type="button"
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="note-list-controls">
        <label className="archive-filter">
          <input
            checked={archived}
            onChange={(event) => onArchivedChange(event.target.checked)}
            type="checkbox"
          />
          Archived
        </label>
        <label className="sr-only" htmlFor="note-sort">Sort notes</label>
        <select
          className="note-sort"
          id="note-sort"
          onChange={(event) => {
            const value = event.target.value;
            if (value === "title" || value === "created_at") onSortChange(value);
            else onSortChange("updated_at");
          }}
          value={sort}
        >
          <option value="updated_at">Recently updated</option>
          <option value="created_at">Created</option>
          <option value="title">Title</option>
        </select>
      </div>
      {!searching && notes.isError && (
        <div className="inline-error" role="alert">
          <p>{notes.error.message}</p>
          <Button onClick={() => void notes.refetch()} size="sm" variant="outline">Retry</Button>
        </div>
      )}
      {tags.isError && (
        <div className="inline-error" role="alert">
          <p>{tags.error.message} Tags could not be loaded.</p>
          <Button onClick={() => void tags.refetch()} size="sm" variant="outline">Retry tags</Button>
        </div>
      )}
      <div aria-busy={notes.isLoading} className="note-list">
        {!searching && notes.isLoading && Array.from({ length: 5 }, (_, index) => (
          <div className="note-skeleton" key={index}>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
        {searching && (searchDebouncing || searchLoading) && (
          <p className="note-list-message" role="status">Searching your notes…</p>
        )}
        {searching && searchError && (
          <div className="inline-error" role="alert">
            <p>{searchError.message}</p>
            <Button onClick={onRetrySearch} size="sm" variant="outline">Retry search</Button>
          </div>
        )}
        {items.map((note) => (
          <button
            aria-current={note.id === selectedNoteId ? "true" : undefined}
            className="note-list-item"
            key={note.id}
            onClick={() => onSelect(note.id)}
            type="button"
          >
            <span className="note-list-title">{note.title || "Untitled"}</span>
            <span className="note-list-snippet">
              {note.snippet ? <HighlightedSnippet snippet={note.snippet} /> : "No text yet"}
            </span>
            <span className="note-list-meta">
              <time dateTime={note.updated_at}>{formatUpdated(note.updated_at)}</time>
              {note.tags.slice(0, 2).map((item) => (
                <span className="note-list-tag" key={item}>{item}</span>
              ))}
            </span>
          </button>
        ))}
        {((searching && !searchDebouncing && !searchLoading && !searchError) ||
          (!searching && notes.isSuccess)) && items.length === 0 && (
          <div className="note-list-empty">
            <p>{searching
              ? (tag ? `No matching notes tagged “${tag}”.` : `No notes match “${searchQuery.trim()}”.`)
              : archived ? "No archived notes yet." : "Your vault is ready for a first note."}</p>
            {!searching && !archived && (
              <Button onClick={onCreate} size="sm">
                <FilePlus2 aria-hidden="true" /> Create a note
              </Button>
            )}
          </div>
        )}
      </div>
      {!searching && notes.data && total > NOTE_PAGE_SIZE && (
        <div className="note-pagination">
          <Button
            disabled={offset === 0}
            onClick={() => onOffsetChange(Math.max(0, offset - NOTE_PAGE_SIZE))}
            size="xs"
            variant="ghost"
          >
            Previous
          </Button>
          <span>{offset + 1}–{Math.min(offset + items.length, total)} of {total}</span>
          <Button
            disabled={offset + NOTE_PAGE_SIZE >= total}
            onClick={() => onOffsetChange(offset + NOTE_PAGE_SIZE)}
            size="xs"
            variant="ghost"
          >
            Next
          </Button>
        </div>
      )}
      {actionError && <p className="inline-error" role="alert">{actionError} Please retry.</p>}
    </aside>
  );
}
