import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Compass, Network } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getGaps } from "@/services/phase12";
import { useWorkspaceUi } from "@/stores/workspace-ui";

interface BrainInsightsProps {
  overviewReady: boolean;
  bridgesReady: boolean;
  truncated: boolean;
  onShowOverview: () => void;
  onOpenNote: (id: number) => void;
}

export function BrainInsights({
  overviewReady,
  bridgesReady,
  truncated,
  onShowOverview,
  onOpenNote,
}: BrainInsightsProps) {
  const [view, setView] = useState<"bridges" | "gaps">("bridges");
  const bridges = useWorkspaceUi((state) => state.graphBridges);
  const clusters = useWorkspaceUi((state) => state.graphClusters);
  const gaps = useQuery({
    queryKey: ["insightGaps"],
    queryFn: getGaps,
    enabled: view === "gaps",
    retry: false,
  });
  const thinClusters = clusters.filter((cluster) => cluster.size <= 2);

  return (
    <section aria-label="Structural insights" className="brain-insights">
      <header className="brain-insights-header">
        <div>
          <p className="eyebrow">Structural insights</p>
          <h2>Bridges &amp; gaps</h2>
        </div>
        <div aria-label="Insight type" className="brain-insight-tabs" role="group">
          <Button
            aria-pressed={view === "bridges"}
            onClick={() => setView("bridges")}
            size="sm"
            variant={view === "bridges" ? "default" : "outline"}
          >
            <Network aria-hidden="true" size={14} /> Bridges
          </Button>
          <Button
            aria-pressed={view === "gaps"}
            onClick={() => setView("gaps")}
            size="sm"
            variant={view === "gaps" ? "default" : "outline"}
          >
            <Compass aria-hidden="true" size={14} /> Gaps
          </Button>
        </div>
      </header>
      {view === "bridges" ? (
        !overviewReady ? (
          <div className="brain-insight-empty">
            <p>Bridge detection needs communities across the graph, not just this local neighborhood.</p>
            <Button onClick={onShowOverview} size="sm" variant="outline">Show graph overview</Button>
          </div>
        ) : !bridgesReady ? (
          <div className="brain-insight-empty">
            <p>Bridge communities are not available in the current list view or capped graph data.</p>
            <Button onClick={onShowOverview} size="sm" variant="outline">Compute graph bridges</Button>
          </div>
        ) : (
          <>
            {truncated ? <p className="brain-insight-note">The overview is capped; bridges cover only the displayed graph.</p> : null}
            {bridges.length ? (
              <div className="brain-insight-list">
                {bridges.map((bridge) => (
                  <button key={bridge.noteId} onClick={() => onOpenNote(bridge.noteId)} type="button">
                    <strong>{bridge.title}</strong>
                    <span>Connects {bridge.clusterIds.length} other communities.</span>
                  </button>
                ))}
              </div>
            ) : <p className="brain-insight-empty">No notes currently connect multiple detected communities.</p>}
            <section className="brain-thin-clusters">
              <h3>Thin clusters</h3>
              {thinClusters.length ? (
                thinClusters.map((cluster, index) => (
                  <p key={cluster.id}>Cluster {index + 1} has {cluster.size} note{cluster.size === 1 ? "" : "s"}: {cluster.notes.join(", ")}</p>
                ))
              ) : <p>No small clusters in this graph view.</p>}
            </section>
          </>
        )
      ) : (
        <>
          {gaps.isLoading ? <p className="brain-insight-empty">Checking for orphans and open questions…</p> : null}
          {gaps.isError ? <p className="brain-error" role="alert">{gaps.error.message}</p> : null}
          {gaps.data?.truncated ? <p className="brain-insight-note">Results are capped for responsiveness.</p> : null}
          {gaps.data ? (
            <div className="brain-insight-list">
              {[...gaps.data.orphans, ...gaps.data.open_questions].map((item, index) => (
                <button key={`${item.kind}-${item.note_id}-${index}`} onClick={() => onOpenNote(item.note_id)} type="button">
                  <strong>{item.title} · {item.kind === "orphan" ? "Orphan note" : "Open question"}</strong>
                  <span>{item.text}</span>
                </button>
              ))}
              {!gaps.data.orphans.length && !gaps.data.open_questions.length ? (
                <p className="brain-insight-empty">No orphan notes or unmentioned open questions found.</p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
