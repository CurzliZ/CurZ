import { findGraphClusters } from "@/lib/graph-clusters";
import type { GraphClusterWorkerInput, GraphClusterWorkerOutput } from "@/lib/graph-clusters";

self.addEventListener("message", (event: MessageEvent<GraphClusterWorkerInput>) => {
  const result = findGraphClusters(event.data.nodes, event.data.edges, event.data.palette);
  const output: GraphClusterWorkerOutput = {
    communities: result.communities,
    colors: [...result.colors],
    summaries: result.summaries,
    bridges: result.bridges,
  };
  self.postMessage(output);
});
