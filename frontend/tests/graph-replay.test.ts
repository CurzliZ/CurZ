import { describe, expect, it } from "vitest";

import { buildReplayTimeline } from "../src/lib/graph-replay";

describe("graph replay timeline", () => {
  it("orders note and link appearances by creation time", () => {
    const steps = buildReplayTimeline(
      [
        { id: 2, title: "Later", degree: 1, created_at: "2024-02-01T00:00:00Z", x: null, y: null, position_saved: false },
        { id: 1, title: "Earlier", degree: 1, created_at: "2024-01-01T00:00:00Z", x: null, y: null, position_saved: false },
      ],
      [{ source: 1, target: 2, kind: "explicit" }],
    );

    expect(steps.map((step) => step.nodeIds)).toEqual([[1], [2]]);
    expect(steps[0].edges).toHaveLength(0);
    expect(steps[1].edges).toEqual([{ source: 1, target: 2, kind: "explicit" }]);
  });
});
