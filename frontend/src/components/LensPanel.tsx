import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Link2,
  MessageCircleQuestion,
  PanelRightClose,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EvidencePanel } from "@/components/EvidencePanel";
import { EvolutionPanel } from "@/components/EvolutionPanel";
import { ManualRelationshipForm } from "@/components/ManualRelationshipForm";
import { useWorkspaceUi } from "@/stores/workspace-ui";
import { getBacklinks, getNoteLinks, listNoteTargets } from "@/services/api";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface LensPanelProps {
  onCollapse?: () => void;
  showCollapse?: boolean;
}

function NoteLinks() {
  const noteId = useWorkspaceUi((state) => state.selectedNoteId);
  const selectNote = useWorkspaceUi((state) => state.setSelectedNoteId);
  const backlinks = useQuery({
    queryKey: ["backlinks", noteId],
    queryFn: () => getBacklinks(noteId!),
    enabled: noteId !== null,
  });
  const links = useQuery({
    queryKey: ["noteLinks", noteId],
    queryFn: () => getNoteLinks(noteId!),
    enabled: noteId !== null,
  });
  const targets = useQuery({
    queryKey: ["noteTargets"],
    queryFn: listNoteTargets,
    enabled: noteId !== null,
  });
  const titleById = new Map((targets.data ?? []).map((note) => [note.id, note.title]));

  if (noteId === null) {
    return <p className="lens-empty-copy">Select a note to see its links.</p>;
  }
  if (backlinks.isError || links.isError || targets.isError) {
    return (
      <p className="lens-empty-copy" role="alert">
        Links could not be loaded. Reopen the note or check the backend connection.
      </p>
    );
  }
  if (backlinks.isLoading || links.isLoading || targets.isLoading) {
    return <p className="lens-empty-copy">Loading note links…</p>;
  }

  const incoming = backlinks.data?.items ?? [];
  const outgoing = links.data ?? [];
  if (!incoming.length && !outgoing.length) {
    return (
      <div className="lens-links-wrap">
        <span className="lens-empty-icon"><Link2 aria-hidden="true" size={16} /></span>
        <h3 className="lens-empty-title">No links to follow yet</h3>
        <p className="lens-empty-copy">Type [[ in a note to connect ideas here.</p>
        <ManualRelationshipForm sourceId={noteId} />
      </div>
    );
  }
  return (
    <div className="lens-links-wrap">
      <div className="lens-links">
        {incoming.length > 0 && (
          <section>
            <h3>Backlinks <span>{incoming.length}</span></h3>
            {incoming.map((note) => (
              <button className="lens-link-item" key={note.id} onClick={() => selectNote(note.id, true)} type="button">
                <span>{note.title}</span>
                <small>links here</small>
              </button>
            ))}
          </section>
        )}
        {outgoing.length > 0 && (
          <section>
            <h3>Outgoing <span>{outgoing.length}</span></h3>
            {outgoing.map((link) => {
              const title = link.target_id === null ? null : titleById.get(link.target_id);
              return (
                <button
                  className={`lens-link-item${title ? "" : " is-unresolved"}`}
                  disabled={!title || link.target_id === null}
                  key={link.id}
                  onClick={() => link.target_id !== null && selectNote(link.target_id, true)}
                  type="button"
                >
                  <span>{title ?? link.target_text ?? "Unresolved link"}</span>
                  <small>{title ? "open note" : "not in this vault"}</small>
                </button>
              );
            })}
          </section>
        )}
      </div>
      <ManualRelationshipForm sourceId={noteId} />
    </div>
  );
}

function GraphClusters() {
  const navigate = useNavigate();
  const selectNote = useWorkspaceUi((state) => state.setSelectedNoteId);
  const clusters = useWorkspaceUi((state) => state.graphClusters);
  const bridges = useWorkspaceUi((state) => state.graphBridges);
  const bridgesComplete = useWorkspaceUi((state) => state.graphBridgesComplete);
  if (!clusters.length) {
    return <p className="lens-empty-copy">Clusters will appear when the graph has connected notes.</p>;
  }
  return (
    <div aria-label="Graph clusters" className="lens-graph-clusters">
      <p className="lens-empty-copy">Communities found in the visible graph.</p>
      {clusters.map((cluster, index) => (
        <section className="lens-graph-cluster" key={cluster.id}>
          <h3>
            <span aria-hidden="true" className={`cluster-swatch cluster-swatch-${(index % 5) + 1}`} />
            Cluster {index + 1}
            <span>{cluster.size}</span>
          </h3>
          <p>{cluster.notes.join(" · ")}</p>
        </section>
      ))}
      <section aria-label="Bridge notes" className="lens-bridge-list">
        <h3>Bridge notes</h3>
        {!bridgesComplete ? (
          <p className="lens-empty-copy">Show the graph overview to detect bridges across the whole vault.</p>
        ) : bridges.length ? (
          bridges.map((bridge) => (
            <button
              className="lens-link-item"
              key={bridge.noteId}
              onClick={() => {
                selectNote(bridge.noteId, true);
                navigate("/notes");
              }}
              type="button"
            >
              <span>{bridge.title}</span>
              <small>connects {bridge.clusterIds.length} communities</small>
            </button>
          ))
        ) : <p className="lens-empty-copy">No note currently connects multiple detected communities.</p>}
      </section>
    </div>
  );
}

function SelectedRelationship() {
  const selected = useWorkspaceUi((state) => state.selectedGraphRelationship);
  const selectNote = useWorkspaceUi((state) => state.setSelectedNoteId);
  const navigate = useNavigate();
  if (!selected?.relationship_id) return null;
  const openNote = (id: number) => {
    selectNote(id, true);
    navigate("/notes");
  };
  return (
    <section className="lens-selected-relationship" aria-label="Selected relationship details">
      <p className="eyebrow">{selected.state === "pending" ? "Pending proposal" : "Accepted relationship"}</p>
      <h3>{selected.relationship_type?.replaceAll("_", " ")}</h3>
      <p>{selected.explanation}</p>
      <div className="lens-relation-notes">
        {[selected.source, selected.target].map((id) => {
          const title = id === selected.source ? selected.source_title : selected.target_title;
          const proof = selected.evidence?.find((item) => item.note_id === id);
          return (
            <button key={id} onClick={() => openNote(id)} type="button">
              <strong>{title ?? `Note ${id}`}</strong>
              {proof ? <q>{proof.quote}</q> : <small>Evidence unavailable</small>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function LensPanel({ onCollapse, showCollapse = false }: LensPanelProps) {
  const tab = useWorkspaceUi((state) => state.lensTab);
  const setTab = useWorkspaceUi((state) => state.setLensTab);
  const isBrain = useLocation().pathname.startsWith("/brain");
  const setAskOpen = useWorkspaceUi((state) => state.setAskOpen);

  return (
    <>
      <div className="lens-heading">
        <div className="lens-heading-label">
          <FileText aria-hidden="true" className="text-muted-foreground" size={16} />
          <h2>Lens</h2>
        </div>
        <Button
          aria-label="Ask your notes"
          onClick={() => setAskOpen(true)}
          size="icon-sm"
          title="Ask your notes"
          variant="ghost"
        >
          <MessageCircleQuestion aria-hidden="true" size={16} />
        </Button>
        {showCollapse && onCollapse && (
          <Button
            aria-label="Collapse Lens panel"
            onClick={onCollapse}
            size="icon-sm"
            variant="ghost"
          >
            <PanelRightClose aria-hidden="true" size={16} />
          </Button>
        )}
      </div>
      <Tabs
        className="lens-tabs"
        onValueChange={(value) => setTab(value as "links" | "evidence" | "timeline")}
        value={tab}
      >
        <TabsList className="lens-tabs-list">
          <TabsTrigger className="lens-tabs-trigger" value="links">
            Links
          </TabsTrigger>
          <TabsTrigger className="lens-tabs-trigger" value="evidence">
            Evidence
          </TabsTrigger>
          <TabsTrigger className="lens-tabs-trigger" value="timeline">
            Timeline
          </TabsTrigger>
        </TabsList>
        {(["links", "evidence", "timeline"] as const).map((key) => {
          return (
            <TabsContent className="lens-tab-content" key={key} value={key}>
              {key === "links" ? (
                isBrain ? <><SelectedRelationship /><GraphClusters /></> : <NoteLinks />
              ) : key === "evidence" ? (
                <EvidencePanel />
              ) : (
                <EvolutionPanel />
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </>
  );
}
