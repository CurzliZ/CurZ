import { useEffect, useState } from "react";
import {
  ArchiveRestore,
  ArrowRight,
  Brain,
  Command as CommandIcon,
  Clock3,
  FilePlus2,
  FileText,
  House,
  Inbox,
  Moon,
  MessageCircleQuestion,
  PanelLeft,
  PanelRight,
  RefreshCw,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { Command } from "cmdk";

import { HighlightedSnippet } from "@/components/HighlightedSnippet";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useNoteSearch } from "@/hooks/useNoteSearch";
import { useTheme } from "@/hooks/useTheme";
import type { SearchResult } from "@/services/api";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewNote: () => void;
  onQuickCapture: () => void;
  onNavigate: (path: string) => void;
  onToggleLens: () => void;
  onToggleRail: () => void;
  onRescan: () => void;
  onOpenNote: (id: number) => void;
  onAsk: () => void;
  onOpenEvolution: () => void;
}

function SearchPreview({ note }: { note: SearchResult | undefined }) {
  if (!note) {
    return (
      <div className="palette-preview palette-preview-empty">
        <Search aria-hidden="true" size={20} />
        <p>Search note titles and full text</p>
        <span>Results are ranked by relevance from your vault.</span>
      </div>
    );
  }
  return (
    <div className="palette-preview">
      <p className="eyebrow">Note preview</p>
      <h2>{note.title || "Untitled"}</h2>
      <p className="palette-preview-path">{note.path}</p>
      <p className="palette-preview-snippet"><HighlightedSnippet snippet={note.snippet} /></p>
      <span className="palette-preview-open"><ArrowRight aria-hidden="true" size={14} /> Enter to open</span>
    </div>
  );
}

export function CommandPalette({
  open,
  onOpenChange,
  onNewNote,
  onQuickCapture,
  onNavigate,
  onToggleLens,
  onToggleRail,
  onRescan,
  onOpenNote,
  onAsk,
  onOpenEvolution,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const { theme, toggleTheme } = useTheme();
  const search = useNoteSearch(query);
  const selectedNote = search.results.find((note) => `note-${note.id}` === selectedValue)
    ?? search.results[0];

  useEffect(() => {
    if (open) return;
    setQuery("");
    setSelectedValue("");
  }, [open]);

  useEffect(() => {
    if (search.results.length) setSelectedValue(`note-${search.results[0].id}`);
  }, [search.results]);

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="command-palette-dialog" showCloseButton={false}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command
          aria-label="Search notes and commands"
          className="command-palette"
          loop
          onValueChange={setSelectedValue}
          shouldFilter={false}
          value={selectedValue}
        >
          <div className="palette-search-row">
            <Search aria-hidden="true" size={18} />
            <Command.Input
              autoFocus
              onValueChange={setQuery}
              placeholder="Search notes or run a command…"
              value={query}
            />
            <kbd>ESC</kbd>
          </div>
          <div className="palette-content">
            <Command.List className="palette-list">
              {!query.trim() ? (
                <>
                  <Command.Group heading="Create">
                    <Command.Item onSelect={() => run(onNewNote)} value="new-note">
                      <FilePlus2 aria-hidden="true" /><span>New note</span><kbd>Enter</kbd>
                    </Command.Item>
                    <Command.Item onSelect={() => run(onQuickCapture)} value="quick-capture">
                      <Inbox aria-hidden="true" /><span>Quick capture</span><kbd>Ctrl+Shift+N</kbd>
                    </Command.Item>
                  </Command.Group>
                  <Command.Group heading="Think">
                    <Command.Item onSelect={() => run(onAsk)} value="ask-notes">
                      <MessageCircleQuestion aria-hidden="true" /><span>Ask your notes</span>
                    </Command.Item>
                    <Command.Item onSelect={() => run(onOpenEvolution)} value="evolution">
                      <Clock3 aria-hidden="true" /><span>Evolution timeline</span>
                    </Command.Item>
                  </Command.Group>
                  <Command.Group heading="Go to">
                    <Command.Item onSelect={() => run(() => onNavigate("/"))} value="home">
                      <House aria-hidden="true" /><span>Home</span>
                    </Command.Item>
                    <Command.Item onSelect={() => run(() => onNavigate("/notes"))} value="notes">
                      <FileText aria-hidden="true" /><span>Notes</span>
                    </Command.Item>
                    <Command.Item onSelect={() => run(() => onNavigate("/brain"))} value="brain">
                      <Brain aria-hidden="true" /><span>Brain</span>
                    </Command.Item>
                    <Command.Item onSelect={() => run(() => onNavigate("/review"))} value="review">
                      <ArchiveRestore aria-hidden="true" /><span>Review</span>
                    </Command.Item>
                    <Command.Item onSelect={() => run(() => onNavigate("/settings"))} value="settings">
                      <Settings aria-hidden="true" /><span>Settings</span>
                    </Command.Item>
                  </Command.Group>
                  <Command.Group heading="Workspace">
                    <Command.Item
                      onSelect={() => run(toggleTheme)}
                      value="toggle-theme"
                    >
                      {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
                      <span>Toggle theme</span>
                    </Command.Item>
                    <Command.Item onSelect={() => run(onToggleLens)} value="toggle-lens">
                      <PanelRight aria-hidden="true" /><span>Toggle Lens</span>
                    </Command.Item>
                    <Command.Item onSelect={() => run(onToggleRail)} value="toggle-rail">
                      <PanelLeft aria-hidden="true" /><span>Toggle rail</span><kbd>Ctrl+B</kbd>
                    </Command.Item>
                    <Command.Item onSelect={() => run(onRescan)} value="rescan-vault">
                      <RefreshCw aria-hidden="true" /><span>Rescan vault</span>
                    </Command.Item>
                  </Command.Group>
                  <Command.Empty>No commands found.</Command.Empty>
                </>
              ) : (
                <>
                  {search.isDebouncing || search.isFetching ? (
                    <div className="palette-search-state">Searching your notes…</div>
                  ) : search.isError ? (
                    <div className="palette-search-state palette-search-error" role="alert">
                      {search.error.message}
                    </div>
                  ) : search.results.length ? (
                    <Command.Group heading="Notes">
                      {search.results.map((note) => (
                        <Command.Item
                          key={note.id}
                          onSelect={() => run(() => onOpenNote(note.id))}
                          value={`note-${note.id}`}
                        >
                          <FileText aria-hidden="true" />
                          <span className="palette-result-copy">
                            <strong>{note.title || "Untitled"}</strong>
                            <small><HighlightedSnippet snippet={note.snippet} /></small>
                          </span>
                          <kbd>Enter</kbd>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : (
                    <div className="palette-search-state">No notes match “{query.trim()}”.</div>
                  )}
                </>
              )}
            </Command.List>
            <SearchPreview note={query.trim() ? selectedNote : undefined} />
          </div>
          <div className="palette-footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
            <span><kbd>Enter</kbd> to select</span>
            <span><CommandIcon aria-hidden="true" size={13} /> Ctrl+K to open</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
