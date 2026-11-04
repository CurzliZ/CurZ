import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Compass, Inbox } from "lucide-react";
import { lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QuickCaptureBox } from "@/components/QuickCapture";
import { HomeRevisit } from "@/components/HomeRevisit";
import { getInboxNotes, getRecentNotes } from "@/services/home-data";
import { useWorkspaceUi } from "@/stores/workspace-ui";

const NotesWorkspace = lazy(() =>
  import("@/pages/NotesWorkspace").then((module) => ({
    default: module.NotesWorkspace,
  })),
);

export function HomePage() {
  const navigate = useNavigate();
  const setSelectedNoteId = useWorkspaceUi((state) => state.setSelectedNoteId);
  const recent = useQuery({ queryKey: ["homeRecent"], queryFn: getRecentNotes });
  const inbox = useQuery({ queryKey: ["homeInbox"], queryFn: getInboxNotes });
  const emptyVault = recent.data?.total === 0 && inbox.data?.length === 0;

  const openNote = (id: number) => {
    setSelectedNoteId(id, true);
    navigate("/notes");
  };

  return (
    <div className="home-page">
      <header className="home-welcome">
        <p className="eyebrow">A quieter way to think</p>
        <h1>{emptyVault ? "Your vault is ready." : "Welcome back to your thinking."}</h1>
        <p>
          {emptyVault
            ? "Capture a first thought. It will be waiting here when you are ready to shape it."
            : "Pick up a thread, or leave a new thought for later."}
        </p>
      </header>
      <QuickCaptureBox />
      <HomeRevisit />
      {emptyVault && (
        <section aria-label="Empty vault" className="home-first-note">
          <span aria-hidden="true"><Compass size={22} /></span>
          <div>
            <h2>A blank page, full of possibility</h2>
            <p>Your notes stay in your vault as ordinary Markdown files.</p>
          </div>
        </section>
      )}
      <div className="home-data-grid">
        <section aria-labelledby="home-recent-title" className="home-data-card">
          <div className="home-section-heading">
            <Compass aria-hidden="true" size={18} />
            <h2 id="home-recent-title">Continue where you left off</h2>
          </div>
          {recent.isLoading ? (
            <div aria-busy="true" className="home-skeletons">
              <Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" />
            </div>
          ) : recent.isError ? (
            <div className="home-load-error" role="alert">
              <p>{recent.error.message}</p>
              <Button onClick={() => void recent.refetch()} size="sm" variant="outline">Retry</Button>
            </div>
          ) : recent.data?.items.length ? (
            <div className="home-note-list">
              {recent.data.items.map((note) => (
                <button className="home-note-row" key={note.id} onClick={() => openNote(note.id)} type="button">
                  <span className="home-note-copy">
                    <strong>{note.title || "Untitled"}</strong>
                    <small>{note.snippet || "No text yet"}</small>
                  </span>
                  <time dateTime={note.updated_at}>
                    {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(note.updated_at))}
                  </time>
                  <ArrowUpRight aria-hidden="true" size={15} />
                </button>
              ))}
            </div>
          ) : <p className="home-empty-copy">Recently edited notes will appear here.</p>}
        </section>
        <section aria-labelledby="home-inbox-title" className="home-data-card">
          <div className="home-section-heading">
            <Inbox aria-hidden="true" size={18} />
            <h2 id="home-inbox-title">Inbox</h2>
            {inbox.data?.length ? <span className="home-count">{inbox.data.length}</span> : null}
          </div>
          <p className="home-section-description">Thoughts waiting for a place in your notes.</p>
          {inbox.isLoading ? (
            <div aria-busy="true" className="home-skeletons">
              <Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" />
            </div>
          ) : inbox.isError ? (
            <div className="home-load-error" role="alert">
              <p>{inbox.error.message}</p>
              <Button onClick={() => void inbox.refetch()} size="sm" variant="outline">Retry</Button>
            </div>
          ) : inbox.data?.length ? (
            <div className="home-note-list">
              {inbox.data.map((note) => (
                <button className="home-note-row inbox-note-row" key={note.id} onClick={() => openNote(note.id)} type="button">
                  <span className="home-note-copy">
                    <strong>{note.title || "Inbox thought"}</strong>
                    <small>{note.path}</small>
                  </span>
                  <time dateTime={note.updated_at}>
                    {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(note.updated_at))}
                  </time>
                  <ArrowUpRight aria-hidden="true" size={15} />
                </button>
              ))}
            </div>
          ) : <p className="home-empty-copy">Nothing waiting in Inbox.</p>}
        </section>
      </div>
    </div>
  );
}

export function NotesPage() {
  return <Suspense fallback={<div aria-busy="true" className="notes-loading" />}><NotesWorkspace /></Suspense>;
}
