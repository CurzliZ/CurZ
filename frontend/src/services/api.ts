import { readAliases } from "@/lib/wikilinks";
import { APP_NAME } from "@/lib/brand";

export interface HealthResponse {
  status: "ok";
}

export interface VaultStatus {
  open: boolean;
  path: string | null;
}

export interface SampleVaultStatus {
  available: boolean;
  loaded: boolean;
  note_count: number;
  path: string | null;
}

export function getSampleVaultStatus(): Promise<SampleVaultStatus> {
  return request("/api/vault/sample/status");
}

export function loadSampleVault(): Promise<{ open: boolean; path: string; note_count: number }> {
  return request("/api/vault/sample/load", json("POST"));
}

export function removeSampleVault(confirm: boolean): Promise<{
  removed: number;
  preserved: number;
  active_vault: boolean;
}> {
  return request("/api/vault/sample/remove", json("POST", { confirm }));
}

export function getTrustReport(): Promise<{ available: boolean; report: TrustReport | null }> {
  return request("/api/trust-report");
}

export interface TrustMetric {
  rate: number | null;
  numerator: number;
  denominator: number;
}

export interface TrustReport {
  status: "completed" | "failed";
  date: string;
  config: {
    provider: string;
    model: string;
    embedding_model: string;
    timeout_seconds: number;
    ollama_host?: string;
  };
  mock: boolean;
  metrics: {
    raw_quote_fabrication: TrustMetric;
    post_verification_citation_validity: TrustMetric;
    relationship_precision: TrustMetric;
    relationship_recall: TrustMetric;
    ask_retrieval_hit_at_k: TrustMetric & { k: number };
    unanswerable_question_honesty: TrustMetric;
  } | null;
  counts?: Record<string, number>;
  error?: string;
}

export interface NoteSummary {
  id: number;
  path: string;
  title: string;
  content_hash: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  tags: string[];
}

export interface NoteDetail extends NoteSummary {
  content: string;
}

export interface NoteList {
  items: NoteSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface SearchResult extends NoteSummary {
  snippet: string;
}

export interface SearchResponse {
  items: SearchResult[];
  query: string;
}

export interface RescanResult {
  created: number;
  changed: number;
  deleted: number;
}

export interface TagItem {
  name: string;
  count: number;
}

export interface NoteLink {
  id: number;
  source_id: number;
  target_id: number | null;
  target_text: string | null;
  alias: string | null;
}

export interface NoteTarget {
  id: number;
  title: string;
  aliases: string[];
}

export interface GraphNode {
  id: number;
  title: string;
  degree: number;
  created_at: string;
  x: number | null;
  y: number | null;
  position_saved: boolean;
}

export interface GraphEdge {
  source: number;
  target: number;
  kind: "explicit" | "semantic" | "reasoned";
  score?: number | null;
  relationship_id?: number | null;
  relationship_type?: string | null;
  state?: "pending" | "accepted" | null;
  explanation?: string | null;
  source_title?: string | null;
  target_title?: string | null;
  evidence?: RelationshipEvidence[];
}

export interface RelationshipEvidence {
  note_id: number;
  note_title: string;
  quote: string;
  quote_start: number;
  quote_end: number;
  status: "verified" | "stale";
}

export interface Relationship {
  id: number;
  source_note_id: number;
  source_title: string;
  target_note_id: number;
  target_title: string;
  relationship_type: string;
  explanation: string;
  confidence: number | null;
  origin: "ai" | "manual";
  state: "pending" | "accepted" | "rejected" | "outdated";
  created_at: string;
  evidence: RelationshipEvidence[];
}

export interface GraphNeighborhood {
  center_id: number;
  depth: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
}

export interface GraphOverview {
  total_nodes: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
}

interface ApiErrorBody {
  error?: {
    code?: unknown;
    message?: unknown;
  };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") throw reason;
    throw new ApiError(
      `Could not reach the ${APP_NAME} backend. Confirm both servers are running, then retry.`,
      "backend_unreachable",
      0,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (!response.ok) {
      throw new ApiError(
        `The backend returned an empty response (${response.status}).`,
        "invalid_response",
        response.status,
      );
    }
    throw new ApiError("The backend returned invalid JSON.", "invalid_response", response.status);
  }

  if (!response.ok) {
    const error = (
      typeof body === "object" && body !== null ? body : {}
    ) as ApiErrorBody;
    throw new ApiError(
      typeof error.error?.message === "string"
        ? error.error.message
        : `The request failed (${response.status}).`,
      typeof error.error?.code === "string" ? error.error.code : "request_failed",
      response.status,
    );
  }

  return body as T;
}

function json(method: string, payload?: unknown): RequestInit {
  return {
    method,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  };
}

export function getHealth(): Promise<HealthResponse> {
  return request("/api/health");
}

export function getVaultStatus(): Promise<VaultStatus> {
  return request("/api/vault/status");
}

export function openVault(path: string): Promise<VaultStatus> {
  return request("/api/vault/open", json("POST", { path }));
}

export function createVault(path: string): Promise<VaultStatus> {
  return request("/api/vault/create", json("POST", { path }));
}

export function listNotes(options: {
  limit?: number;
  offset?: number;
  tag?: string;
  archived?: boolean;
  sort?: "updated_at" | "created_at" | "title";
} = {}): Promise<NoteList> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 50),
    offset: String(options.offset ?? 0),
    archived: String(options.archived ?? false),
    sort: options.sort ?? "updated_at",
  });
  if (options.tag) params.set("tag", options.tag);
  return request(`/api/notes?${params.toString()}`);
}

export function getNote(id: number): Promise<NoteDetail> {
  return request(`/api/notes/${id}`);
}

export function createNote(title: string, content = "", path?: string): Promise<NoteDetail> {
  return request("/api/notes", json("POST", { title, content, ...(path ? { path } : {}) }));
}

export function searchNotes(query: string, signal?: AbortSignal): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query, limit: "50" });
  return request(`/api/search?${params.toString()}`, { signal });
}

export function rescanVault(): Promise<RescanResult> {
  return request("/api/vault/rescan", json("POST"));
}

export function updateNote(id: number, content: string): Promise<NoteDetail> {
  return request(`/api/notes/${id}`, json("PUT", { content }));
}

export function archiveNote(id: number): Promise<NoteSummary> {
  return request(`/api/notes/${id}/archive`, json("POST"));
}

export function restoreNote(id: number): Promise<NoteSummary> {
  return request(`/api/notes/${id}/restore`, json("POST"));
}

export function deleteNote(id: number): Promise<{ deleted: boolean }> {
  return request(`/api/notes/${id}`, json("DELETE"));
}

export function listTags(): Promise<TagItem[]> {
  return request("/api/tags");
}

export async function listTagsForMode(archived: boolean): Promise<TagItem[]> {
  if (!archived) return listTags();
  const counts = new Map<string, number>();
  let offset = 0;
  let fetched = 0;
  let total = Number.POSITIVE_INFINITY;
  while (fetched < total) {
    const page = await listNotes({ limit: 200, offset, archived: true });
    for (const note of page.items) {
      for (const tag of note.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    total = page.total;
    fetched += page.items.length;
    offset += page.items.length;
    if (!page.items.length) break;
  }
  return [...counts].map(([name, count]) => ({ name, count }));
}

export function getBacklinks(id: number): Promise<{ items: NoteSummary[] }> {
  return request(`/api/notes/${id}/backlinks`);
}

export function getNoteLinks(id: number): Promise<NoteLink[]> {
  return request(`/api/notes/${id}/links`);
}

export function getGraphNeighborhood(
  centerId: number,
  options: {
    depth?: 1 | 2 | 3;
    limit?: number;
    explicit?: boolean;
    semantic?: boolean;
    reasoned?: boolean;
    threshold?: number;
  } = {},
): Promise<GraphNeighborhood> {
  const params = new URLSearchParams({
    depth: String(options.depth ?? 2),
    limit: String(options.limit ?? 500),
    explicit: String(options.explicit ?? true),
    semantic: String(options.semantic ?? false),
    reasoned: String(options.reasoned ?? false),
    threshold: String(options.threshold ?? 0.25),
  });
  return request(`/api/graph/neighborhood/${centerId}?${params.toString()}`);
}

export function getGraphOverview(options: {
  limit?: number;
  explicit?: boolean;
  semantic?: boolean;
  reasoned?: boolean;
  threshold?: number;
} = {}): Promise<GraphOverview> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 5000),
    explicit: String(options.explicit ?? true),
    semantic: String(options.semantic ?? false),
    reasoned: String(options.reasoned ?? false),
    threshold: String(options.threshold ?? 0.25),
  });
  return request(`/api/graph/overview?${params.toString()}`);
}

export function saveGraphLayout(positions: Array<{ note_id: number; x: number; y: number }>): Promise<{ saved: number }> {
  return request("/api/graph/layout", json("POST", { positions }));
}

export function resetGraphLayout(): Promise<{ reset: boolean }> {
  return request("/api/graph/layout", json("DELETE"));
}

export async function listNoteTargets(): Promise<NoteTarget[]> {
  const notes: NoteSummary[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (notes.length < total) {
    const page = await listNotes({ limit: 200, offset });
    notes.push(...page.items);
    total = page.total;
    offset += page.items.length;
    if (page.items.length === 0) break;
  }

  const targets: NoteTarget[] = [];
  for (let start = 0; start < notes.length; start += 8) {
    const details = await Promise.all(
      notes.slice(start, start + 8).map((note) => getNote(note.id)),
    );
    targets.push(
      ...details.map((note) => ({
        id: note.id,
        title: note.title,
        aliases: readAliases(note.content),
      })),
    );
  }
  return targets;
}

export async function listExistingNotePaths(): Promise<string[]> {
  const paths: string[] = [];
  for (const archived of [false, true]) {
    let offset = 0;
    let fetched = 0;
    let total = Number.POSITIVE_INFINITY;
    while (fetched < total) {
      const page = await listNotes({ limit: 200, offset, archived });
      paths.push(...page.items.map((note) => note.path.toLocaleLowerCase()));
      total = page.total;
      offset += page.items.length;
      fetched += page.items.length;
      if (page.items.length === 0) break;
    }
  }
  return paths;
}

export async function createUntitledNote(): Promise<NoteDetail> {
  const paths = new Set(await listExistingNotePaths());
  let title = "Untitled";
  let suffix = 2;
  const slug = (value: string) =>
    value.trim().replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLocaleLowerCase();
  while (paths.has(`${slug(title)}.md`)) {
    title = `Untitled ${suffix}`;
    suffix += 1;
  }
  return createNote(title);
}

export async function createInboxCapture(
  thought: string,
  timestamp = new Date(),
): Promise<NoteDetail> {
  const existingPaths = new Set(await listExistingNotePaths());
  const timestampSlug = timestamp.toISOString().replace(/[-:.]/g, "");
  const title = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
  let path = `Inbox/${timestampSlug}.md`;
  let suffix = 2;
  while (existingPaths.has(path.toLocaleLowerCase())) {
    path = `Inbox/${timestampSlug}-${suffix}.md`;
    suffix += 1;
  }
  const content = `# ${title}\n\n${thought.trim()}\n`;
  return createNote(title, content, path);
}

export { request as apiRequest };
