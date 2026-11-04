import Graph from "graphology";
import louvain from "graphology-communities-louvain";

import type { GraphEdge, GraphNode } from "@/services/api";
import type { GraphBridgeSummary, GraphClusterSummary } from "@/stores/workspace-ui";

export interface GraphClusterResult {
  communities: Record<string, number>;
  colors: Map<number, string>;
  summaries: GraphClusterSummary[];
  bridges: GraphBridgeSummary[];
}

export interface GraphClusterWorkerInput {
  nodes: GraphNode[];
  edges: GraphEdge[];
  palette: string[];
}

export interface GraphClusterWorkerOutput {
  communities: Record<string, number>;
  colors: Array<[number, string]>;
  summaries: GraphClusterSummary[];
  bridges: GraphBridgeSummary[];
}

export function findGraphClusters(
  nodes: GraphNode[],
  edges: GraphEdge[],
  palette: string[],
): GraphClusterResult {
  const graph = new Graph({ type: "undirected", multi: false });
  nodes.forEach((node) => graph.addNode(String(node.id)));
  const weights = new Map<string, { source: string; target: string; weight: number }>();

  edges.forEach((edge) => {
    const source = String(edge.source);
    const target = String(edge.target);
    if (!graph.hasNode(source) || !graph.hasNode(target) || source === target) return;
    const key = [source, target].sort().join(":");
    const weight = edge.kind === "semantic" ? edge.score ?? 0.5 : 1;
    const current = weights.get(key);
    if (current) current.weight += weight;
    else weights.set(key, { source, target, weight });
  });
  weights.forEach(({ source, target, weight }) => graph.addEdge(source, target, { weight }));

  const communities = graph.size
    ? louvain(graph, {
        resolution: 0.8,
        rng: (() => {
          let state = 1;
          return () => {
            state = (state * 16807) % 2147483647;
            return state / 2147483647;
          };
        })(),
      })
    : {};
  const members = new Map<number, GraphNode[]>();
  nodes.forEach((node) => {
    const community = communities[String(node.id)] ?? node.id;
    const group = members.get(community) ?? [];
    group.push(node);
    members.set(community, group);
  });
  const ordered = [...members.entries()].sort(
    (left, right) => right[1].length - left[1].length || left[0] - right[0],
  );
  const colors = new Map<number, string>();
  const summaries = ordered.map(([id, members], index) => {
    const color = palette[index % palette.length];
    if (color) colors.set(id, color);
    return {
      id,
      size: members.length,
      notes: members.slice(0, 4).map((node) => node.title || "Untitled"),
      noteIds: members.map((node) => node.id),
    };
  });

  const bridgeNeighbors = new Map<number, Set<number>>();
  const addBridgeNeighbor = (noteId: number, communityId: number) => {
    let neighboringCommunities = bridgeNeighbors.get(noteId);
    if (!neighboringCommunities) {
      neighboringCommunities = new Set<number>();
      bridgeNeighbors.set(noteId, neighboringCommunities);
    }
    neighboringCommunities.add(communityId);
  };
  edges.forEach((edge) => {
    if (!graph.hasNode(String(edge.source)) || !graph.hasNode(String(edge.target))) return;
    const sourceCommunity = communities[String(edge.source)] ?? edge.source;
    const targetCommunity = communities[String(edge.target)] ?? edge.target;
    if (sourceCommunity === targetCommunity) return;
    addBridgeNeighbor(edge.source, targetCommunity);
    addBridgeNeighbor(edge.target, sourceCommunity);
  });
  const titles = new Map(nodes.map((node) => [node.id, node.title || "Untitled"]));
  const bridges = [...bridgeNeighbors.entries()]
    .filter(([, clusterIds]) => clusterIds.size >= 2)
    .map(([noteId, clusterIds]) => ({
      noteId,
      title: titles.get(noteId) ?? "Untitled",
      clusterIds: [...clusterIds],
    }))
    .sort((left, right) => right.clusterIds.length - left.clusterIds.length || left.noteId - right.noteId);

  return { communities, colors, summaries, bridges };
}
