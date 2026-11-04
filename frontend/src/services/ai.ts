import { apiRequest } from "@/services/api";

export interface AISettings {
  provider: "ollama" | "mock";
  ollama_url: string;
  chat_model: string;
  embedding_model: string;
  timeout_seconds: number;
  demo_mode: boolean;
}

export interface AIHealth {
  provider: string;
  reachable: boolean;
  chat_model: string;
  chat_model_present: boolean;
  embedding_model: string;
  embedding_model_present: boolean;
  chat_model_error: string | null;
  embedding_model_error: string | null;
  mock: boolean;
  error: string | null;
}

export interface AITask {
  id: string;
  type: string;
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  provider: string;
  model: string;
  result: {
    mock?: boolean;
    raw_quotes?: number;
    verified_quotes?: number;
    discarded_quotes?: number;
  } | null;
  error: string | null;
}

export interface ClaimEvidence {
  id: number;
  heading: string | null;
  quote: string;
  quote_start: number;
  quote_end: number;
  source_hash: string;
  status: "verified" | "stale";
}

export interface NoteClaim {
  id: number;
  text: string;
  state: string;
  interpretation: boolean;
  mock: boolean;
  evidence: ClaimEvidence[];
}

export interface NoteClaims {
  note_id: number;
  claims: NoteClaim[];
  stats: { raw_quotes: number; verified_quotes: number } | null;
}

export function getAISettings(): Promise<AISettings> {
  return apiRequest("/api/ai/settings");
}

export function saveAISettings(settings: Omit<AISettings, "provider">): Promise<AISettings> {
  return apiRequest("/api/ai/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export function getAIHealth(): Promise<AIHealth> {
  return apiRequest("/api/ai/health");
}

export function testAIConnection(): Promise<AIHealth> {
  return apiRequest("/api/ai/test-connection", { method: "POST" });
}

export function getNoteClaims(noteId: number): Promise<NoteClaims> {
  return apiRequest(`/api/notes/${noteId}/claims`);
}

export function extractNoteClaims(noteId: number): Promise<AITask> {
  return apiRequest(`/api/notes/${noteId}/claims/extract`, { method: "POST" });
}

export function getAITask(taskId: string): Promise<AITask> {
  return apiRequest(`/api/ai/tasks/${taskId}`);
}

export function removeNoteClaim(noteId: number, claimId: number): Promise<void> {
  return apiRequest(`/api/notes/${noteId}/claims/${claimId}`, { method: "DELETE" });
}
