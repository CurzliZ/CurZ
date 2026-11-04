import { apiRequest } from "@/services/api";
import type { Relationship } from "@/services/api";

export interface RelationshipTask {
  id: string;
  type: string;
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  result: {
    mock?: boolean;
    candidate_count?: number;
    proposed_count?: number;
    discarded_count?: number;
  } | null;
  error: string | null;
}

export function generateRelationships(): Promise<RelationshipTask> {
  return apiRequest("/api/relationships/generate", { method: "POST" });
}

export function getRelationshipTask(taskId: string): Promise<RelationshipTask> {
  return apiRequest(`/api/ai/tasks/${taskId}`);
}

export function getReviewRelationships(
  view: "relations" | "tensions" | "stale",
): Promise<{ items: Relationship[] }> {
  return apiRequest(`/api/relationships/review?view=${view}`);
}

export function decideRelationship(
  id: number,
  input: {
    action: "accept" | "edit" | "dismiss" | "defer";
    relationship_type?: string;
    explanation?: string;
    source_quote?: string;
    target_quote?: string;
  },
): Promise<Relationship> {
  return apiRequest(`/api/relationships/${id}/decision`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createRelationship(input: {
  source_note_id: number;
  target_note_id: number;
  relationship_type: string;
  explanation: string;
  source_quote: string;
  target_quote: string;
}): Promise<Relationship> {
  return apiRequest("/api/relationships", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
