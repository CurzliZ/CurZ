import type { GraphEdge, GraphNode } from "@/services/api";

export interface GraphReplayStep {
  timestamp: number;
  nodeIds: number[];
  edges: GraphEdge[];
}

export function buildReplayTimeline(
  nodes: GraphNode[],
  edges: GraphEdge[],
): GraphReplayStep[] {
  const steps = new Map<number, GraphReplayStep>();
  const getStep = (timestamp: number) => {
    let step = steps.get(timestamp);
    if (!step) {
      step = { timestamp, nodeIds: [], edges: [] };
      steps.set(timestamp, step);
    }
    return step;
  };
  const createdAt = new Map<number, number>();

  for (const node of nodes) {
    const timestamp = Date.parse(node.created_at);
    if (!Number.isFinite(timestamp)) continue;
    createdAt.set(node.id, timestamp);
    getStep(timestamp).nodeIds.push(node.id);
  }

  for (const edge of edges) {
    const sourceDate = createdAt.get(edge.source);
    const targetDate = createdAt.get(edge.target);
    if (sourceDate === undefined || targetDate === undefined) continue;
    getStep(Math.max(sourceDate, targetDate)).edges.push(edge);
  }

  return [...steps.values()].sort((left, right) => left.timestamp - right.timestamp);
}
