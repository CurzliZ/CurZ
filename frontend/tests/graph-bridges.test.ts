import { describe, expect, it } from "vitest";

import { findGraphClusters } from "../src/lib/graph-clusters";
import type { GraphEdge, GraphNode } from "../src/services/api";

describe("graph bridge detection", () => {
  it("finds a note whose edges span multiple Louvain communities", () => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const groups = [[1, 2, 3, 4], [11, 12, 13, 14], [21, 22, 23, 24]];
    for (const [groupIndex, group] of groups.entries()) {
      group.forEach((id) => nodes.push({
        id,
        title: `Note ${id}`,
        degree: group.length,
        created_at: "2026-01-01T00:00:00",
        x: null,
        y: null,
        position_saved: false,
      }));
      for (let first = 0; first < group.length; first += 1) {
        for (let second = first + 1; second < group.length; second += 1) {
          edges.push({ source: group[first], target: group[second], kind: "explicit" });
        }
      }
      edges.push({
        source: 99,
        target: group[groupIndex === 0 ? 0 : 1],
        kind: "explicit",
      });
    }
    nodes.push({
      id: 99,
      title: "Bridge note",
      degree: 3,
      created_at: "2026-01-01T00:00:00",
      x: null,
      y: null,
      position_saved: false,
    });

    const result = findGraphClusters(nodes, edges, ["var(--cluster-1)", "var(--cluster-2)"]);

    expect(result.bridges.some((bridge) => bridge.noteId === 99 && bridge.clusterIds.length >= 2)).toBe(true);
  });
});
