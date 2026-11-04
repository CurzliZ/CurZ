import { apiRequest } from "@/services/api";
import type { AITask } from "@/services/ai";

export type AskScopeKind = "current_note" | "folder" | "tag" | "vault";

export interface AskScopeOptions {
  folders: string[];
  tags: string[];
}

export interface AskCitation {
  text: string;
  citation: number;
  note_id: number;
  title: string;
  path: string;
  heading: string;
  quote: string;
  quote_start: number;
  quote_end: number;
  source_hash: string;
  status: "verified";
}

export interface AskResult {
  answer: string;
  claims: AskCitation[];
  unsupported: string[];
  searched: {
    scope: AskScopeKind;
    scope_label: string;
    chunks_searched: number;
    retrieval_method: string;
    embedding_used: boolean;
  };
  mock: boolean;
}

export interface AskTask extends Omit<AITask, "result"> {
  result: AskResult | null;
}

export function getAskScopes(): Promise<AskScopeOptions> {
  return apiRequest<AskScopeOptions>("/api/ask/scopes");
}

export function startAsk(input: {
  question: string;
  scope:
    | { kind: "current_note"; note_id: number }
    | { kind: "folder"; folder: string }
    | { kind: "tag"; tag: string }
    | { kind: "vault" };
  turns: Array<{ question: string; answer: string }>;
}): Promise<AskTask> {
  return apiRequest<AskTask>("/api/ask", { method: "POST", body: JSON.stringify(input) });
}

export function getAskTask(taskId: string): Promise<AskTask> {
  return apiRequest<AskTask>(`/api/ai/tasks/${taskId}`);
}

export function cancelAskTask(taskId: string): Promise<AskTask> {
  return apiRequest<AskTask>(`/api/ai/tasks/${taskId}/cancel`, { method: "POST" });
}
