import { apiRequest } from "@/services/api";
import type { AITask } from "@/services/ai";

export interface EvolutionClaim {
  id: number;
  note_id: number;
  note_title: string;
  note_path: string;
  note_created_at: string;
  note_updated_at: string;
  text: string;
  quote: string;
  quote_start: number;
  quote_end: number;
  heading: string | null;
  timestamp: string;
  mock: boolean;
}

export interface EvolutionTimeline {
  scope_label: string;
  items: EvolutionClaim[];
  has_enough_history: boolean;
}

export interface EvolutionSummary {
  summary: string;
  changes: Array<{
    from_quote: string;
    to_quote: string;
    description: string;
    from_claim_id: number;
    to_claim_id: number;
  }>;
  interpretation: true;
  mock: boolean;
  insufficient_history: boolean;
}

export type EvolutionTask = Omit<AITask, "result"> & { result: EvolutionSummary | null };

export interface GapItem {
  note_id: number;
  title: string;
  path: string;
  text: string;
  kind: "orphan" | "open_question";
}

export interface Gaps {
  orphans: GapItem[];
  open_questions: GapItem[];
  truncated: boolean;
}

export interface RevisitItem {
  note_id: number;
  title: string;
  path: string;
  reason: string;
  reason_code:
    | "saved_for_later"
    | "related_to_current"
    | "linked_to_recent"
    | "new_connection"
    | "unresolved_review"
    | "valuable_untouched";
  state: "saved" | null;
}

export function getEvolution(input: { noteId?: number; tag?: string }): Promise<EvolutionTimeline> {
  const params = new URLSearchParams();
  if (input.noteId !== undefined) params.set("note_id", String(input.noteId));
  if (input.tag) params.set("tag", input.tag);
  return apiRequest(`/api/evolution?${params.toString()}`);
}

export function summarizeEvolution(input: { noteId?: number; tag?: string }): Promise<EvolutionTask> {
  return apiRequest("/api/evolution/summarize", {
    method: "POST",
    body: JSON.stringify({
      ...(input.noteId !== undefined ? { note_id: input.noteId } : {}),
      ...(input.tag ? { tag: input.tag } : {}),
    }),
  });
}

export function getEvolutionTask(id: string): Promise<EvolutionTask> {
  return apiRequest(`/api/ai/tasks/${id}`);
}

export function getGaps(): Promise<Gaps> {
  return apiRequest("/api/insights/gaps");
}

export function getRevisit(currentNoteId: number | null): Promise<{ items: RevisitItem[] }> {
  const params = new URLSearchParams();
  if (currentNoteId !== null) params.set("current_note_id", String(currentNoteId));
  return apiRequest(`/api/revisit?${params.toString()}`);
}

export function setRevisitPreference(
  noteId: number,
  state: "saved" | "dismissed",
): Promise<{ note_id: number; state: "saved" | "dismissed"; updated_at: string }> {
  return apiRequest(`/api/revisit/${noteId}`, {
    method: "PUT",
    body: JSON.stringify({ state }),
  });
}
