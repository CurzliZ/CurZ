import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, Maximize2, RotateCcw, Search, Table2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { BrainGraphCanvas } from "@/components/brain/BrainGraphCanvas";
import { BrainInsights } from "@/components/brain/BrainInsights";
import { BrainReplayControls } from "@/components/brain/BrainReplayControls";
import { BrainTable } from "@/components/brain/BrainTable";
import { Button } from "@/components/ui/button";
import { buildReplayTimeline } from "@/lib/graph-replay";
import {
  getGraphNeighborhood,
  getGraphOverview,
  listNotes,
  resetGraphLayout,
  searchNotes,
} from "@/services/api";
import type { GraphEdge, GraphNode, SearchResult } from "@/services/api";
import { useWorkspaceUi } from "@/stores/workspace-ui";

const GRAPH_OVERVIEW_LIMIT = 5000;

export function BrainPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const savedNoteId = useWorkspaceUi((state) => state.selectedNoteId);
  const setSelectedNoteId = useWorkspaceUi((state) => state.setSelectedNoteId);
  const setSelectedGraphRelationship = useWorkspaceUi((state) => state.setSelectedGraphRelationship);
  const relationshipPulseId = useWorkspaceUi((state) => state.relationshipPulseId);
  const setRelationshipPulseId = useWorkspaceUi((state) => state.setRelationshipPulseId);
  const setGraphClusters = useWorkspaceUi((state) => state.setGraphClusters);
  const setGraphBridges = useWorkspaceUi((state) => state.setGraphBridges);
  const graphBridgesComplete = useWorkspaceUi((state) => state.graphBridgesComplete);
  const [centerId, setCenterId] = useState<number | null>(savedNoteId);
  const [overviewMode, setOverviewMode] = useState(false);
  const [tableMode, setTableMode] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [explicitEnabled, setExplicitEnabled] = useState(true);
  const [semanticEnabled, setSemanticEnabled] = useState(true);
  const [reasonedEnabled, setReasonedEnabled] = useState(false);
  const [threshold, setThreshold] = useState(0.25);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchItems, setSearchItems] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const [layoutError, setLayoutError] = useState("");
  const [replayMode, setReplayMode] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(false);

  const firstNote = useQuery({
    queryKey: ["brainFirstNote"],
    queryFn: () => listNotes({ limit: 1, sort: "updated_at" }),
    enabled: centerId === null,
  });
  useEffect(() => {
    if (centerId === null && firstNote.data?.items[0]) {
      setCenterId(firstNote.data.items[0].id);
    }
  }, [centerId, firstNote.data]);

  const graphOptions = {
    explicit: explicitEnabled,
    semantic: semanticEnabled,
    reasoned: reasonedEnabled,
    threshold,
  };
  const neighborhood = useQuery({
    queryKey: ["graphNeighborhood", centerId, graphOptions],
    queryFn: () => getGraphNeighborhood(centerId!, { depth: 2, limit: 500, ...graphOptions }),
    enabled: centerId !== null && !overviewMode,
  });
  const overview = useQuery({
    queryKey: ["graphOverview", GRAPH_OVERVIEW_LIMIT, graphOptions],
    queryFn: () => getGraphOverview({ limit: GRAPH_OVERVIEW_LIMIT, ...graphOptions }),
    enabled: overviewMode,
  });
  const graphSummary = useQuery({
    queryKey: ["notes", "graphSummary"],
    queryFn: () => listNotes({ limit: 1 }),
  });
  const graphData = overviewMode ? overview.data : neighborhood.data;
  const nodes: GraphNode[] = graphData?.nodes ?? [];
  const edges: GraphEdge[] = graphData?.edges ?? [];
  const totalNodes = graphSummary.data?.total ?? 0;
  const replaySteps = useMemo(() => buildReplayTimeline(nodes, edges), [edges, nodes]);
  const replayStep = replayMode ? replaySteps[replayIndex] : undefined;
  const replayAt = replayMode ? replayStep?.timestamp ?? null : null;
  const selectedNote = useMemo(
    () => nodes.find((node) => node.id === centerId),
    [centerId, nodes],
  );

  useEffect(() => {
    if (!replayMode && replaySteps.length) setReplayIndex(replaySteps.length - 1);
  }, [replayMode, replaySteps.length]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!playing || reducedMotion) return;
    const lastIndex = Math.max(replaySteps.length - 1, 0);
    const timeout = window.setTimeout(() => {
      setReplayIndex((current) => {
        if (current >= lastIndex) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 900 / speed);
    return () => window.clearTimeout(timeout);
  }, [playing, reducedMotion, replayIndex, replaySteps.length, speed]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 180);
    return () => window.clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    if (!debouncedSearch) {
      setSearchItems([]);
      setSearchError("");
      return;
    }
    const controller = new AbortController();
    void searchNotes(debouncedSearch, controller.signal)
      .then((response) => {
        setSearchItems(response.items);
        setSearchError("");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSearchError(error instanceof Error ? error.message : "Note search failed.");
      });
    return () => controller.abort();
  }, [debouncedSearch]);
  useEffect(() => () => {
    setGraphClusters([]);
    setGraphBridges([], false);
    setSelectedGraphRelationship(null);
  }, [setGraphBridges, setGraphClusters, setSelectedGraphRelationship]);
  useEffect(() => {
    if (tableMode) setGraphBridges([], false);
  }, [setGraphBridges, tableMode]);
  useEffect(() => {
    if (relationshipPulseId === null) return;
    const timeout = window.setTimeout(() => setRelationshipPulseId(null), 1400);
    return () => window.clearTimeout(timeout);
  }, [relationshipPulseId, setRelationshipPulseId]);

  const focusNote = useCallback((id: number) => {
    setOverviewMode(false);
    setCenterId(id);
    setSelectedNoteId(id);
    setSearch("");
  }, [setSelectedNoteId]);
  const openNote = useCallback((id: number) => {
    setSelectedNoteId(id, true);
    navigate("/notes");
  }, [navigate, setSelectedNoteId]);
  const publishClusters = useCallback(
    (clusters: Parameters<typeof setGraphClusters>[0]) => setGraphClusters(clusters),
    [setGraphClusters],
  );
  const publishBridges = useCallback(
    (bridges: Parameters<typeof setGraphBridges>[0], complete: boolean) =>
      setGraphBridges(bridges, complete),
    [setGraphBridges],
  );
  const selectGraphRelationship = useCallback(
    (relationship: GraphEdge | null) => setSelectedGraphRelationship(relationship),
    [setSelectedGraphRelationship],
  );
  const resetGraph = useCallback(() => {
    setOverviewMode(false);
    setCenterId(savedNoteId ?? nodes[0]?.id ?? null);
    setResetToken((token) => token + 1);
  }, [nodes, savedNoteId]);
  const relayout = async () => {
    setLayoutError("");
    try {
      await resetGraphLayout();
      await queryClient.invalidateQueries({ queryKey: ["graphNeighborhood"] });
      await queryClient.invalidateQueries({ queryKey: ["graphOverview"] });
      setResetToken((token) => token + 1);
    } catch (error) {
      setLayoutError(error instanceof Error ? error.message : "Could not reset the graph layout.");
    }
  };
  const togglePlayback = (next: boolean) => {
    if (next && replayIndex >= replaySteps.length - 1) setReplayIndex(0);
    setReplayMode(true);
    setPlaying(next);
  };

  return (
    <div className="brain-page">
      <header className="brain-header">
        <div>
          <p className="eyebrow">A map of your thinking</p>
          <h1>Brain</h1>
          <p>Explicit links, local topic similarity, and human-reviewed AI proposals.</p>
        </div>
        <div className="brain-header-actions">
          <Button onClick={() => setTableMode((value) => !value)} variant="outline">
            <Table2 aria-hidden="true" size={16} />
            {tableMode ? "Graph view" : "List view"}
          </Button>
          <Button onClick={() => void relayout()} variant="outline">
            <RotateCcw aria-hidden="true" size={16} />
            Re-layout
          </Button>
          <Button aria-label="Reset graph view" onClick={resetGraph} variant="outline">
            <Maximize2 aria-hidden="true" size={16} />
            Reset
          </Button>
        </div>
      </header>

      <div className="brain-toolbar">
        <div className="brain-search">
          <Search aria-hidden="true" size={17} />
          <input
            aria-label="Find a note in the graph"
            autoComplete="off"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a note to focus…"
            role="combobox"
            aria-expanded={Boolean(search)}
            value={search}
          />
          {search ? <button aria-label="Clear search" className="brain-clear-search" onClick={() => setSearch("")} type="button"><X size={15} /></button> : null}
          {search ? (
            <div className="brain-search-results" role="listbox" aria-label="Note search results">
              {searchError ? <p role="alert">{searchError}</p> : null}
              {!searchError && !searchItems.length ? <p>{debouncedSearch ? "No matching notes." : "Searching notes…"}</p> : null}
              {searchItems.map((item) => (
                <button key={item.id} onClick={() => focusNote(item.id)} role="option" type="button">
                  <strong>{item.title || "Untitled"}</strong>
                  <span>{item.snippet.replace(/<[^>]*>/g, "")}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="brain-layer-controls" aria-label="Graph layers">
          <label><input checked={explicitEnabled} onChange={(event) => setExplicitEnabled(event.target.checked)} type="checkbox" /> Explicit</label>
          <label><input checked={semanticEnabled} onChange={(event) => setSemanticEnabled(event.target.checked)} type="checkbox" /> Semantic</label>
          <label><input checked={reasonedEnabled} onChange={(event) => setReasonedEnabled(event.target.checked)} type="checkbox" /> Reasoned</label>
          {semanticEnabled ? (
            <label className="brain-threshold">
              Similarity <strong>{threshold.toFixed(2)}</strong>
              <input
                aria-label="Similarity threshold"
                max="0.8"
                min="0.05"
                onChange={(event) => setThreshold(Number(event.target.value))}
                step="0.05"
                type="range"
                value={threshold}
              />
            </label>
          ) : null}
        </div>
        <span className="brain-view-status">
          <ArrowDownUp aria-hidden="true" size={14} />
          {overviewMode ? "Overview" : selectedNote?.title || "Local neighborhood"}
          <span>{nodes.length.toLocaleString()} notes · {edges.length.toLocaleString()} links</span>
        </span>
      </div>

      <section aria-label="Explicit, semantic and reasoned note connections" className="brain-visual">
        {nodes.length === 0 && !neighborhood.isLoading && !overview.isLoading && !firstNote.isLoading ? (
          <div className="brain-empty">
            <span className="brain-empty-orbit" aria-hidden="true"><i /><i /><i /></span>
            <p className="eyebrow">A map made by you</p>
            <h2>No links yet</h2>
            <p>Open a note and type <code>[[</code> to create an explicit connection, or enable Semantic.</p>
            <Button onClick={() => navigate("/notes")}>Open a note</Button>
          </div>
        ) : tableMode ? (
          <BrainTable edges={edges} nodes={nodes} onOpenNote={openNote} />
        ) : nodes.length > 0 ? (
          <BrainGraphCanvas
            key={resetToken}
            centerId={overviewMode ? null : centerId}
            data={graphData!}
            explicitEnabled={explicitEnabled}
            onClusters={publishClusters}
            onBridges={publishBridges}
            complete={overviewMode && !graphData?.truncated}
            onLayoutError={setLayoutError}
            onOpenNote={openNote}
            onSelectRelationship={selectGraphRelationship}
            replayAt={replayAt}
            replayStep={replayStep}
            reasonedEnabled={reasonedEnabled}
            reducedMotion={reducedMotion}
            relationshipPulseId={relationshipPulseId}
            semanticEnabled={semanticEnabled}
          />
        ) : (
          <div aria-busy="true" className="brain-loading"><span /> Mapping your notes…</div>
        )}
      </section>

      <BrainInsights
        onOpenNote={openNote}
        onShowOverview={() => {
          setOverviewMode(true);
          setTableMode(false);
        }}
        bridgesReady={graphBridgesComplete}
        overviewReady={overviewMode}
        truncated={Boolean(graphData?.truncated)}
      />

      <BrainReplayControls
        index={Math.min(replayIndex, Math.max(replaySteps.length - 1, 0))}
        onIndexChange={(index) => {
          setReplayMode(true);
          setReplayIndex(index);
        }}
        onPlayingChange={togglePlayback}
        onReplayExit={() => {
          setReplayMode(false);
          setPlaying(false);
        }}
        onReplayStart={() => {
          setReplayMode(true);
          setReplayIndex(0);
          setPlaying(!reducedMotion);
        }}
        onSpeedChange={setSpeed}
        playing={playing}
        replayMode={replayMode}
        reducedMotion={reducedMotion}
        speed={speed}
        steps={replaySteps}
      />
      {totalNodes > 0 && edges.length === 0 ? (
        <p className="brain-no-links-hint">No links meet this similarity threshold in the current view.</p>
      ) : null}
      <footer className="brain-footer">
        {graphData?.truncated ? <span>Graph data is capped for responsiveness.</span> : <span>Drag to pan · scroll to zoom · double-click a note to open it</span>}
        {!overviewMode ? (
          <Button disabled={overview.isFetching} onClick={() => setOverviewMode(true)} size="sm" variant="outline">
            {overview.isFetching ? "Loading overview…" : "Show more"}
          </Button>
        ) : (
          <Button onClick={() => setOverviewMode(false)} size="sm" variant="outline">Back to neighborhood</Button>
        )}
      </footer>
      {totalNodes > 2000 ? (
        <p className="brain-performance-warning" role="note">
          This vault has {totalNodes.toLocaleString()} notes. Showing the full overview (up to {GRAPH_OVERVIEW_LIMIT.toLocaleString()} nodes) may reduce responsiveness.
        </p>
      ) : null}
      {layoutError ? <p className="brain-error" role="alert">{layoutError}</p> : null}
      {firstNote.isError ? <p className="brain-error" role="alert">{firstNote.error.message}</p> : null}
      {neighborhood.isError ? <p className="brain-error" role="alert">{neighborhood.error.message}</p> : null}
      {overview.isError ? <p className="brain-error" role="alert">{overview.error.message}</p> : null}
    </div>
  );
}
