import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { GraphEdge, GraphNode } from "@/services/api";

const PAGE_SIZE = 100;
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

interface BrainTableProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onOpenNote: (id: number) => void;
}

function TablePagination({
  label,
  page,
  pages,
  total,
  onChange,
}: {
  label: string;
  page: number;
  pages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (total <= PAGE_SIZE) return null;
  const firstItem = page * PAGE_SIZE + 1;
  const lastItem = Math.min(firstItem + PAGE_SIZE - 1, total);

  return (
    <nav aria-label={`${label} table pagination`} className="brain-table-pagination">
      <span aria-live="polite">{label} {firstItem}–{lastItem} of {total}</span>
      <div>
        <Button
          disabled={page === 0}
          onClick={() => onChange(page - 1)}
          size="sm"
          variant="outline"
        >
          Previous {label.toLowerCase()}
        </Button>
        <Button
          disabled={page >= pages - 1}
          onClick={() => onChange(page + 1)}
          size="sm"
          variant="outline"
        >
          Next {label.toLowerCase()}
        </Button>
      </div>
    </nav>
  );
}

export function BrainTable({ nodes, edges, onOpenNote }: BrainTableProps) {
  const [nodePage, setNodePage] = useState(0);
  const [edgePage, setEdgePage] = useState(0);
  const nodePages = Math.max(1, Math.ceil(nodes.length / PAGE_SIZE));
  const edgePages = Math.max(1, Math.ceil(edges.length / PAGE_SIZE));
  const visibleNodePage = Math.min(nodePage, nodePages - 1);
  const visibleEdgePage = Math.min(edgePage, edgePages - 1);
  const titles = new Map(nodes.map((node) => [node.id, node.title || "Untitled"]));
  const visibleNodes = nodes.slice(visibleNodePage * PAGE_SIZE, (visibleNodePage + 1) * PAGE_SIZE);
  const visibleEdges = edges.slice(visibleEdgePage * PAGE_SIZE, (visibleEdgePage + 1) * PAGE_SIZE);

  return (
    <div aria-label="Brain graph data" className="brain-table-wrap" role="region">
      <table className="brain-table">
        <caption>Notes in this graph view. Use the note buttons to open a note.</caption>
        <thead>
          <tr><th scope="col">Note</th><th scope="col">Links</th><th scope="col">Created</th></tr>
        </thead>
        <tbody>
          {visibleNodes.map((node) => (
            <tr key={node.id}>
              <th scope="row">
                <button className="brain-table-note" onClick={() => onOpenNote(node.id)} type="button">
                  {node.title || "Untitled"}
                </button>
              </th>
              <td>{node.degree}</td>
              <td>{dateFormatter.format(new Date(node.created_at))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <TablePagination
        label="Notes"
        onChange={setNodePage}
        page={visibleNodePage}
        pages={nodePages}
        total={nodes.length}
      />
      <table className="brain-table brain-edges-table">
        <caption>Explicit links and reasoned connections in this graph view.</caption>
        <thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col">Kind</th></tr></thead>
        <tbody>
          {visibleEdges.map((edge, index) => (
            <tr key={`${edge.kind}-${edge.source}-${edge.target}-${edge.relationship_id ?? visibleEdgePage * PAGE_SIZE + index}`}>
              <td><button className="brain-table-note" onClick={() => onOpenNote(edge.source)} type="button">{titles.get(edge.source) ?? "Note"}</button></td>
              <td><button className="brain-table-note" onClick={() => onOpenNote(edge.target)} type="button">{titles.get(edge.target) ?? "Note"}</button></td>
              <td>
                {edge.kind === "reasoned"
                  ? `Reasoned · ${edge.relationship_type?.replaceAll("_", " ") ?? ""} (${edge.state ?? ""})`
                  : edge.kind === "semantic"
                    ? "Semantic"
                    : "Explicit"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <TablePagination
        label="Links"
        onChange={setEdgePage}
        page={visibleEdgePage}
        pages={edgePages}
        total={edges.length}
      />
    </div>
  );
}
