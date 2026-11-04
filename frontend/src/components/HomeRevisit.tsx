import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Bookmark, Link2, ShieldCheck, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { getRevisit, setRevisitPreference } from "@/services/phase12";
import { useWorkspaceUi } from "@/stores/workspace-ui";

export function HomeRevisit() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const currentNoteId = useWorkspaceUi((state) => state.selectedNoteId);
  const setSelectedNoteId = useWorkspaceUi((state) => state.setSelectedNoteId);
  const setLensTab = useWorkspaceUi((state) => state.setLensTab);
  const query = useQuery({
    queryKey: ["revisit", currentNoteId],
    queryFn: () => getRevisit(currentNoteId),
    retry: false,
  });
  const preference = useMutation({
    mutationFn: ({ noteId, state }: { noteId: number; state: "saved" | "dismissed" }) =>
      setRevisitPreference(noteId, state),
    onSuccess: () => client.invalidateQueries({ queryKey: ["revisit"] }),
  });

  const open = (noteId: number, tab?: "links" | "evidence") => {
    setSelectedNoteId(noteId, true);
    if (tab) setLensTab(tab);
    navigate("/notes");
  };

  return (
    <section aria-labelledby="home-revisit-title" className="home-data-card home-revisit-card">
      <div className="home-section-heading">
        <Bookmark aria-hidden="true" size={18} />
        <h2 id="home-revisit-title">Why now?</h2>
      </div>
      <p className="home-section-description">A few grounded threads worth revisiting. No streaks or reminders.</p>
      {query.isLoading ? <p className="home-empty-copy">Finding useful connections…</p> : null}
      {query.isError ? (
        <div className="home-load-error" role="alert">
          <p>{query.error.message}</p>
          <Button onClick={() => void query.refetch()} size="sm" variant="outline">Retry</Button>
        </div>
      ) : null}
      {!query.isLoading && !query.isError && !query.data?.items.length ? (
        <p className="home-empty-copy">Nothing needs your attention right now.</p>
      ) : null}
      {query.data?.items.map((item) => (
        <article className="revisit-item" key={item.note_id}>
          <div className="revisit-item-copy">
            <h3>{item.title || "Untitled"}</h3>
            <p>{item.reason}</p>
            {item.state === "saved" ? <span className="revisit-saved-label">Saved for later</span> : null}
          </div>
          <div className="revisit-actions">
            <Button onClick={() => open(item.note_id)} size="sm" variant="outline">
              <ArrowUpRight aria-hidden="true" size={14} /> Open
            </Button>
            <Button onClick={() => open(item.note_id, "evidence")} size="sm" variant="ghost">
              <ShieldCheck aria-hidden="true" size={14} /> Review evidence
            </Button>
            <Button onClick={() => open(item.note_id, "links")} size="sm" variant="ghost">
              <Link2 aria-hidden="true" size={14} /> Create connection
            </Button>
            <Button
              disabled={preference.isPending}
              onClick={() => preference.mutate({ noteId: item.note_id, state: "saved" })}
              size="sm"
              variant="ghost"
            >
              <Bookmark aria-hidden="true" size={14} /> Save for later
            </Button>
            <Button
              aria-label={`Dismiss ${item.title}`}
              disabled={preference.isPending}
              onClick={() => preference.mutate({ noteId: item.note_id, state: "dismissed" })}
              size="icon-sm"
              title="Dismiss"
              variant="ghost"
            >
              <X aria-hidden="true" size={14} />
            </Button>
          </div>
        </article>
      ))}
      {preference.isError ? <p className="home-load-error" role="alert">{preference.error.message}</p> : null}
    </section>
  );
}
