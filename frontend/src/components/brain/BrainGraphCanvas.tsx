import { useEffect, useRef } from "react";
import Graph from "graphology";
import FA2LayoutSupervisor from "graphology-layout-forceatlas2/worker";
import Sigma from "sigma";
import { layerDashed, pathCurved, pathLine } from "sigma/rendering";

import type { GraphReplayStep } from "@/lib/graph-replay";
import type { GraphClusterWorkerOutput } from "@/lib/graph-clusters";
import type { GraphEdge, GraphNeighborhood, GraphOverview } from "@/services/api";
import { saveGraphLayout } from "@/services/api";
import type { GraphBridgeSummary, GraphClusterSummary } from "@/stores/workspace-ui";

type GraphPayload = GraphNeighborhood | GraphOverview;

interface BrainGraphCanvasProps {
  data: GraphPayload;
  centerId: number | null;
  explicitEnabled: boolean;
  semanticEnabled: boolean;
  reasonedEnabled: boolean;
  relationshipPulseId: number | null;
  reducedMotion: boolean;
  replayAt: number | null;
  replayStep: GraphReplayStep | undefined;
  onOpenNote: (id: number) => void;
  onClusters: (clusters: GraphClusterSummary[]) => void;
  onBridges: (bridges: GraphBridgeSummary[], complete: boolean) => void;
  complete: boolean;
  onLayoutError: (message: string) => void;
  onSelectRelationship: (relationship: GraphEdge | null) => void;
}

function withinTwoHops(graph: Graph, center: string): Set<string> {
  const reached = new Set([center]);
  let frontier = new Set([center]);
  for (let distance = 0; distance < 2; distance += 1) {
    const next = new Set<string>();
    for (const node of frontier) {
      for (const neighbor of graph.neighbors(node)) {
        if (!reached.has(neighbor)) {
          reached.add(neighbor);
          next.add(neighbor);
        }
      }
    }
    frontier = next;
  }
  return reached;
}

export function BrainGraphCanvas({
  data,
  centerId,
  explicitEnabled,
  semanticEnabled,
  reasonedEnabled,
  relationshipPulseId,
  reducedMotion,
  replayAt,
  replayStep,
  onOpenNote,
  onClusters,
  onBridges,
  complete,
  onLayoutError,
  onSelectRelationship,
}: BrainGraphCanvasProps) {
  const explicitRef = useRef<HTMLDivElement>(null);
  const semanticRef = useRef<HTMLDivElement>(null);
  const reasonedRef = useRef<HTMLDivElement>(null);
  const renderersRef = useRef<Sigma[]>([]);
  const pulseRef = useRef(false);
  const viewRef = useRef({
    explicitEnabled,
    semanticEnabled,
    reasonedEnabled,
    replayAt,
    replayStep,
    relationshipPulseId,
  });
  viewRef.current = {
    explicitEnabled,
    semanticEnabled,
    reasonedEnabled,
    replayAt,
    replayStep,
    relationshipPulseId,
  };

  useEffect(() => {
    const container = explicitRef.current;
    if (!container || !data.nodes.length) return;

    const graph = new Graph({ type: "directed", multi: true });
    const size = Math.sqrt(data.nodes.length);
    data.nodes.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(data.nodes.length, 1);
      graph.addNode(String(node.id), {
        x: node.x ?? Math.cos(angle) * size,
        y: node.y ?? Math.sin(angle) * size,
        label: node.title || "Untitled",
        size: Math.min(11, 2.4 + Math.sqrt(node.degree) * 1.4),
        createdAt: Date.parse(node.created_at),
      });
    });
    const rootStyles = getComputedStyle(document.documentElement);
    const primary = rootStyles.getPropertyValue("--primary").trim();
    const selectedColor = rootStyles.getPropertyValue("--graph-node-selected").trim();
    const dimNodeColor = rootStyles.getPropertyValue("--graph-node-dim").trim();
    const nodeBackdrop = rootStyles.getPropertyValue("--graph-node-backdrop").trim();
    const nodeGlow = rootStyles.getPropertyValue("--graph-node-glow").trim();
    const explicitEdgeColor = rootStyles.getPropertyValue("--graph-edge-explicit").trim();
    const transparentEdgeColor = rootStyles.getPropertyValue("--graph-edge-transparent").trim();
    const semanticEdgeColor = rootStyles.getPropertyValue("--graph-edge-semantic").trim();
    const dimEdgeColor = rootStyles.getPropertyValue("--graph-edge-dim").trim();
    const relationshipColors: Record<string, string> = {
      supports: rootStyles.getPropertyValue("--relationship-supports").trim(),
      contradicts: rootStyles.getPropertyValue("--relationship-tension").trim(),
      extends: rootStyles.getPropertyValue("--relationship-extends").trim(),
      example_of: rootStyles.getPropertyValue("--relationship-example").trim(),
      depends_on: rootStyles.getPropertyValue("--relationship-depends").trim(),
      applies_to: primary,
      inspired_by: rootStyles.getPropertyValue("--relationship-inspired").trim(),
      tension: rootStyles.getPropertyValue("--relationship-tension").trim(),
    };

    data.edges.forEach((edge, index) => {
      const source = String(edge.source);
      const target = String(edge.target);
      if (!graph.hasNode(source) || !graph.hasNode(target)) return;
      const isExplicit = edge.kind === "explicit";
      const isReasoned = edge.kind === "reasoned";
      const type = edge.relationship_type ?? "";
      const isPending = edge.state === "pending";

      let dashSize = 4;
      let gapSize = 3;
      let gapColor = transparentEdgeColor;

      if (isExplicit) {
        gapColor = explicitEdgeColor;
      } else if (isReasoned) {
        const typeColor = relationshipColors[type] || primary;
        if (isPending) {
          dashSize = 5;
          gapSize = 4;
          gapColor = transparentEdgeColor;
        } else if (type === "example_of") {
          dashSize = 5;
          gapSize = 3;
          gapColor = transparentEdgeColor;
        } else if (type === "inspired_by") {
          dashSize = 2;
          gapSize = 4;
          gapColor = transparentEdgeColor;
        } else {
          gapColor = typeColor;
        }
      }

      graph.addEdgeWithKey(`${edge.kind}-${source}-${target}-${index}`, source, target, {
        kind: edge.kind,
        score: edge.score ?? 1,
        weight: edge.kind === "explicit" ? 1 : edge.score ?? 0.5,
        relationshipId: edge.relationship_id ?? null,
        relationshipType: edge.relationship_type ?? "",
        relationshipState: edge.state ?? "",
        explanation: edge.explanation ?? "",
        evidence: edge.evidence ?? [],
        sourceTitle: edge.source_title ?? "",
        targetTitle: edge.target_title ?? "",
        dashSize,
        gapSize,
        gapColor,
      });
    });

    const palette = ["--cluster-1", "--cluster-2", "--cluster-3", "--cluster-4", "--cluster-5"]
      .map((name) => rootStyles.getPropertyValue(name).trim());
    const clusterWorker = new Worker(new URL("../../lib/graph-clusters.worker.ts", import.meta.url), {
      type: "module",
    });
    clusterWorker.onmessage = (event: MessageEvent<GraphClusterWorkerOutput>) => {
      const { communities, colors, summaries, bridges } = event.data;
      const colorMap = new Map(colors);
      clusterRank = new Map(summaries.map((cluster, index) => [cluster.id, index]));
      data.nodes.forEach((node) => {
        const communityId = communities[String(node.id)] ?? node.id;
        graph.mergeNodeAttributes(String(node.id), {
          communityId,
          color: colorMap.get(communityId) ?? primary,
        });
      });
      onClusters(summaries);
      onBridges(bridges, complete);
      renderersRef.current.forEach((renderer) => renderer.refresh({ skipIndexation: true }));
    };
    clusterWorker.onerror = () => {
      onLayoutError("Community analysis failed. The graph is still available without cluster colors.");
    };
    clusterWorker.postMessage({ nodes: data.nodes, edges: data.edges, palette });

    let hoveredId: string | null = null;
    let selectedId = centerId === null ? null : String(centerId);
    let focusNodes = selectedId && graph.hasNode(selectedId)
      ? withinTwoHops(graph, selectedId)
      : null;
    let clusterRank = new Map<number, number>();
    let cameraRatio = 1;
    let layout: FA2LayoutSupervisor | null = null;
    let layoutTimeout = 0;
    let layoutRefreshInterval = 0;
    let persistTimeout = 0;
    const foreground = rootStyles.getPropertyValue("--foreground").trim();

    const makeRenderer = (
      target: HTMLDivElement,
      renderLayer: "explicit" | "semantic",
    ): Sigma => {
      const hiddenNodeLayer = renderLayer !== "explicit";
      const renderer = new Sigma(graph, target, {
        settings: {
          renderLabels: !hiddenNodeLayer,
          labelRenderedSizeThreshold: 8,
          itemSizesReference: "screen",
          autoRescaleContent: "positions",
          minCameraRatio: 0.1,
          maxCameraRatio: 8,
        },
        nodeReducer: (key, attrs) => {
          if (hiddenNodeLayer) {
            return {
              ...attrs,
              color: "transparent",
              size: 0.01,
              labelVisibility: "hidden",
              backdropVisibility: "hidden",
            };
          }
          const view = viewRef.current;
          const nodeData = graph.getNodeAttributes(key);
          const future = view.replayAt !== null && Number(nodeData.createdAt) > view.replayAt;
          const emphasize = key === hoveredId || key === selectedId;
          const visible = !focusNodes || focusNodes.has(key);
          const community = Number(nodeData.communityId);
          const rank = clusterRank.get(community) ?? 0;
          return {
            ...attrs,
            color: future
              ? "transparent"
              : visible
                ? emphasize ? selectedColor : attrs.color
                : dimNodeColor,
            size: emphasize ? Number(attrs.size) * 1.7 : Number(attrs.size),
            opacity: future ? 0 : visible ? 1 : 0.28,
            visibility: future ? "hidden" : "visible",
            labelVisibility: emphasize ? "visible" : cameraRatio < 0.18 ? "auto" : "hidden",
            labelColor: foreground,
            labelFont: "Inter Variable, sans-serif",
            backdropVisibility: "visible",
            backdropColor: nodeBackdrop,
            backdropShadowColor: nodeGlow,
            backdropShadowBlur: 5,
            backdropPadding: 1.5,
            backdropArea: "node",
            zIndex: rank,
          };
        },
        edgeReducer: (key, attrs) => {
          const source = graph.source(key);
          const target = graph.target(key);
          const kind = graph.getEdgeAttribute(key, "kind");
          const view = viewRef.current;
          const shown = renderLayer === "semantic"
            ? kind === "semantic" && view.semanticEnabled
            : (kind === "explicit" && view.explicitEnabled) ||
              (kind === "reasoned" && view.reasonedEnabled);
          const date = Math.max(
            Number(graph.getNodeAttribute(source, "createdAt")),
            Number(graph.getNodeAttribute(target, "createdAt")),
          );
          const future = view.replayAt !== null && date > view.replayAt;
          if (!shown || future) return { ...attrs, visibility: "hidden", opacity: 0 };
          const nearFocus = !focusNodes || focusNodes.has(source) || focusNodes.has(target);
          const relationshipType = String(graph.getEdgeAttribute(key, "relationshipType") ?? "");
          const relationshipState = String(graph.getEdgeAttribute(key, "relationshipState") ?? "");
          const relationshipId = graph.getEdgeAttribute(key, "relationshipId");
          const viewRelationshipPulseId = view.relationshipPulseId;
          const layerColor = kind === "semantic"
            ? semanticEdgeColor
            : kind === "reasoned"
              ? relationshipColors[relationshipType] ?? primary
              : explicitEdgeColor;
          return {
            ...attrs,
            visibility: "visible",
            color: nearFocus ? layerColor : dimEdgeColor,
            opacity: nearFocus
              ? relationshipState === "pending"
                ? 0.48
                : kind === "reasoned" && relationshipId === viewRelationshipPulseId && pulseRef.current
                  ? 1
                  : 0.8
              : 0.35,
            size: kind === "semantic" ? 1.8 : kind === "reasoned"
              ? relationshipId === viewRelationshipPulseId && pulseRef.current ? 4 : 1.5
              : 0.85,
            path: kind === "reasoned" && ["extends", "contradicts", "tension", "applies_to"].includes(relationshipType)
              ? "curved"
              : "line",
          };
        },
        primitives: {
          edges: {
            paths: [pathLine(), pathCurved({ segments: 12, curvature: 0.12 })],
            layers: [
              ...(renderLayer === "semantic"
                ? [
                    layerDashed({
                      dashSize: { value: 3, mode: "pixels" },
                      gapSize: { value: 2, mode: "pixels" },
                      cap: "round",
                    }),
                  ]
                : [
                    layerDashed({
                      dashSize: { attribute: "dashSize", default: 4, mode: "pixels" },
                      gapSize: { attribute: "gapSize", default: 3, mode: "pixels" },
                      gapColor: {
                        attribute: "gapColor",
                        default: rootStyles.getPropertyValue("--graph-edge-transparent").trim(),
                      },
                      cap: "round",
                    }),
                  ]),
            ],
          },
        },
      });
      const camera = renderer.getCamera();
      cameraRatio = camera.ratio;
      camera.on("updated", (state) => {
        cameraRatio = state.ratio;
      });
      return renderer;
    };

    const resize = () => {
      if (renderersRef.current.length || !container.clientWidth || !container.clientHeight) return;
      const explicitRenderer = makeRenderer(container, "explicit");
      const semanticContainer = semanticRef.current;
      const semanticRenderer = semanticContainer && data.edges.some((edge) => edge.kind === "semantic")
        ? makeRenderer(semanticContainer, "semantic")
        : null;
      renderersRef.current = [
        explicitRenderer,
        ...(semanticRenderer ? [semanticRenderer] : []),
      ];
      if (semanticRenderer) {
        const camera = semanticRenderer.getCamera();
        explicitRenderer.getCamera().on("updated", (state) => camera.setState(state));
      }
      explicitRenderer.on("enterNode", handleEnter);
      explicitRenderer.on("leaveNode", handleLeave);
      explicitRenderer.on("clickNode", handleClick);
      explicitRenderer.on("doubleClickNode", handleDoubleClick);
      explicitRenderer.on("clickEdge", handleEdgeClick);
      explicitRenderer.on("nodeDragEnd", persistSoon);
      if (data.nodes.every((node) => !node.position_saved)) {
        const supervisor = new FA2LayoutSupervisor(graph, {
          settings: { gravity: 0.08, scalingRatio: 8, slowDown: 2 },
        });
        layout = supervisor;
        supervisor.start();
        layoutRefreshInterval = window.setInterval(() => {
          renderersRef.current.forEach((instance) => instance.refresh({ skipIndexation: true }));
        }, 250);
        layoutTimeout = window.setTimeout(() => {
          supervisor.stop();
          window.clearInterval(layoutRefreshInterval);
          renderersRef.current.forEach((instance) => instance.refresh({ skipIndexation: true }));
          persistLayout();
        }, 8000);
      }
    };
    const persistLayout = () => {
      const positions: Array<{ note_id: number; x: number; y: number }> = [];
      graph.forEachNode((node, attrs) => {
        positions.push({ note_id: Number(node), x: Number(attrs.x), y: Number(attrs.y) });
      });
      void saveGraphLayout(positions).catch((error: unknown) => {
        onLayoutError(error instanceof Error ? error.message : "Could not save graph layout.");
      });
    };
    const persistSoon = () => {
      window.clearTimeout(persistTimeout);
      persistTimeout = window.setTimeout(persistLayout, 450);
    };
    const handleEnter = ({ node }: { node: string }) => {
      hoveredId = node;
      renderersRef.current.forEach((renderer) => renderer.refresh({ skipIndexation: true }));
    };
    const handleLeave = () => {
      hoveredId = null;
      renderersRef.current.forEach((renderer) => renderer.refresh({ skipIndexation: true }));
    };
    const handleClick = ({ node }: { node: string }) => {
      onSelectRelationship(null);
      selectedId = node;
      focusNodes = withinTwoHops(graph, node);
      const renderer = renderersRef.current[0];
      const display = renderer?.getNodeDisplayData(node);
      if (display && renderer) {
        const camera = renderer.getCamera();
        const state = { x: display.x, y: display.y, ratio: Math.min(camera.ratio, 0.45) };
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) camera.setState(state);
        else void camera.animate(state, { duration: 260 });
      }
      renderersRef.current.forEach((renderer) => renderer.refresh({ skipIndexation: true }));
    };
    const handleDoubleClick = ({ node }: { node: string }) => onOpenNote(Number(node));
    const handleEdgeClick = ({ edge }: { edge: string }) => {
      const relationshipId = graph.getEdgeAttribute(edge, "relationshipId");
      const selected = data.edges.find(
        (item) => item.relationship_id === relationshipId && item.kind === "reasoned",
      );
      onSelectRelationship(selected ?? null);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    return () => {
      resizeObserver.disconnect();
      window.clearTimeout(layoutTimeout);
      window.clearInterval(layoutRefreshInterval);
      window.clearTimeout(persistTimeout);
      layout?.kill();
      clusterWorker.terminate();
      renderersRef.current.forEach((renderer) => renderer.kill());
      renderersRef.current = [];
    };
  }, [centerId, complete, data, onBridges, onClusters, onLayoutError, onOpenNote, onSelectRelationship]);

  useEffect(() => {
    renderersRef.current.forEach((renderer) => renderer.refresh({ skipIndexation: true }));
  }, [explicitEnabled, semanticEnabled, reasonedEnabled, replayAt, replayStep]);

  useEffect(() => {
    if (relationshipPulseId === null || reducedMotion) return;
    pulseRef.current = true;
    renderersRef.current.forEach((renderer) => renderer.refresh({ skipIndexation: true }));
    const interval = window.setInterval(() => {
      pulseRef.current = !pulseRef.current;
      renderersRef.current.forEach((renderer) => renderer.refresh({ skipIndexation: true }));
    }, 180);
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      pulseRef.current = false;
      renderersRef.current.forEach((renderer) => renderer.refresh({ skipIndexation: true }));
    }, 1100);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      pulseRef.current = false;
    };
  }, [relationshipPulseId, reducedMotion]);

  return (
    <div aria-label="Interactive explicit and semantic links graph" className="brain-graph-canvas">
      <div className="brain-graph-explicit" ref={explicitRef} />
      <div aria-hidden="true" className="brain-graph-semantic" ref={semanticRef} />
      <div className="brain-graph-reasoned" ref={reasonedRef} />
    </div>
  );
}
