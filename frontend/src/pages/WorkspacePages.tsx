import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Compass, Inbox, LockKeyhole } from "lucide-react";
import { lazy, Suspense } from "react";
import { Link, useNavigate } from "react-router-dom";

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
        <div className="home-welcome-copy">
          <p className="eyebrow home-eyebrow">
            <span aria-hidden="true" className="home-eyebrow-mark" />
            A quieter way to think
          </p>
          <h1>
            {emptyVault ? (
              <>Start with a thought.<br /><span>See where it leads.</span></>
            ) : (
              <>Welcome back to<br /><span>your thinking.</span></>
            )}
          </h1>
          <p>
            {emptyVault
              ? "A calm space to capture ideas, connect them, and see what they become."
              : "Pick up a thread, or leave a new thought for later."}
          </p>
          <div className="home-welcome-footer">
            <Link className="home-brain-link" to="/brain">
              Explore your Brain <ArrowUpRight aria-hidden="true" size={15} />
            </Link>
            <span className="home-private-note">
              <LockKeyhole aria-hidden="true" size={13} />
              Your vault stays yours
            </span>
          </div>
        </div>
        <div aria-hidden="true" className="home-constellation">
          <svg className="constellation-lines" fill="none" viewBox="0 0 360 236">
            <path d="M66 151 132 93l75 44 83-75M132 93l17 91 58-47 60 59M207 137l83-75" />
            <path className="constellation-line-soft" d="m66 151 83 33 58-47 60 12" />
            <circle className="constellation-node constellation-node-main" cx="132" cy="93" r="7" />
            <circle className="constellation-node constellation-node-teal" cx="207" cy="137" r="5" />
            <circle className="constellation-node constellation-node-warm" cx="290" cy="62" r="5" />
            <circle className="constellation-node" cx="66" cy="151" r="4" />
            <circle className="constellation-node" cx="149" cy="184" r="4" />
            <circle className="constellation-node" cx="267" cy="197" r="4" />
            <circle className="constellation-node" cx="267" cy="59" r="3" />
            <circle className="constellation-node" cx="290" cy="183" r="3" />
            <circle className="constellation-halo" cx="207" cy="137" r="15" />
          </svg>
          <span className="constellation-tag constellation-tag--capture">Capture</span>
          <span className="constellation-tag constellation-tag--connect">Connect</span>
          <span className="constellation-tag constellation-tag--understand">Understand</span>
          <span className="constellation-caption">Ideas grow better together.</span>
        </div>
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
