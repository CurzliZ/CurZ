import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, LoaderCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getNote } from "@/services/api";
import {
  extractNoteClaims,
  getAIHealth,
  getAITask,
  getNoteClaims,
  removeNoteClaim,
} from "@/services/ai";
import type { ClaimEvidence } from "@/services/ai";
import { useWorkspaceUi } from "@/stores/workspace-ui";

function EvidenceQuote({
  evidence,
  content,
  noteId,
}: {
  evidence: ClaimEvidence;
  content: string;
  noteId: number;
}) {
  const showEvidence = useWorkspaceUi((state) => state.showEvidenceInNote);
  const start = Math.max(0, Math.min(evidence.quote_start, content.length));
  const end = Math.max(start, Math.min(evidence.quote_end, content.length));
  const before = content.slice(Math.max(0, start - 56), start);
  const matched = content.slice(start, end);
  const after = content.slice(end, Math.min(content.length, end + 56));

  return (
    <div className="evidence-quote">
      {evidence.heading ? <p className="evidence-heading">{evidence.heading}</p> : null}
      {evidence.status === "verified" ? (
        <p className="evidence-context">
          {start > 56 ? "…" : ""}{before}<mark>{matched}</mark>{after}{end + 56 < content.length ? "…" : ""}
        </p>
      ) : (
        <>
          <p className="evidence-context evidence-context--stale">“{evidence.quote}”</p>
          <p className="evidence-stale-copy">This quote no longer appears in the note. Current text near its previous location:</p>
          <p className="evidence-context">{content.slice(Math.max(0, start - 32), Math.min(content.length, end + 32)) || "No text remains at this location."}</p>
        </>
      )}
      <Button
        className="evidence-show-in-note"
        onClick={() => showEvidence(noteId, start, end)}
        size="xs"
        variant="ghost"
      >
        Show in note
      </Button>
    </div>
  );
}

export function EvidencePanel() {
  const noteId = useWorkspaceUi((state) => state.selectedNoteId);
  const queryClient = useQueryClient();
  const [taskId, setTaskId] = useState<string | null>(null);
  const claims = useQuery({
    queryKey: ["claims", noteId],
    queryFn: () => getNoteClaims(noteId!),
    enabled: noteId !== null,
  });
  const note = useQuery({
    queryKey: ["note", noteId],
    queryFn: () => getNote(noteId!),
    enabled: noteId !== null,
  });
  const aiHealth = useQuery({
    queryKey: ["aiHealth"],
    queryFn: getAIHealth,
    retry: false,
  });
  const task = useQuery({
    queryKey: ["aiTask", taskId],
    queryFn: () => getAITask(taskId!),
    enabled: taskId !== null,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" || query.state.data?.status === "running"
        ? 750
        : false,
    retry: false,
  });
  const extractionEnabled = Boolean(
    aiHealth.data?.mock ||
    (aiHealth.data?.reachable && aiHealth.data.chat_model_present),
  );
  const extract = useMutation({
    mutationFn: () => extractNoteClaims(noteId!),
    onSuccess: (started) => {
      setTaskId(started.id);
    },
  });
  const remove = useMutation({
    mutationFn: (claimId: number) => removeNoteClaim(noteId!, claimId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["claims", noteId] });
    },
  });

  useEffect(() => {
    if (task.data?.status === "succeeded") {
      void queryClient.invalidateQueries({ queryKey: ["claims", noteId] });
    }
  }, [noteId, queryClient, task.data?.status, task.data?.id]);

  if (noteId === null) return <p className="lens-empty-copy">Select a note to inspect its evidence.</p>;
  if (claims.isError || note.isError) {
    return (
      <div className="evidence-panel-error" role="alert">
        <p>{claims.error?.message ?? note.error?.message}</p>
        <Button
          onClick={() => {
            void claims.refetch();
            void note.refetch();
          }}
          size="sm"
          variant="outline"
        >
          Retry loading evidence
        </Button>
      </div>
    );
  }
  if (claims.isLoading || note.isLoading) {
    return (
      <div aria-busy="true" className="evidence-loading" role="status">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const running = task.data?.status === "pending" || task.data?.status === "running";
  const disabledReason = aiHealth.isError
    ? "AI status could not be loaded. Check Settings or retry the connection."
    : !aiHealth.data
      ? "Checking whether AI is available…"
      : aiHealth.data.mock
        ? null
        : !aiHealth.data.reachable
          ? "Connect Ollama in Settings to extract claims."
          : !aiHealth.data.chat_model_present
            ? aiHealth.data.chat_model_error ?? "Choose an installed chat model in Settings."
            : null;

  return (
    <div className="evidence-panel">
      <div className="evidence-actions">
        <Button
          disabled={!extractionEnabled || running || extract.isPending}
          onClick={() => extract.mutate()}
          size="sm"
          title={disabledReason ?? "Extract claims from this note only"}
          variant="default"
        >
          {running || extract.isPending ? (
            <LoaderCircle aria-hidden="true" className="ai-spinner" size={14} />
          ) : null}
          {running ? "Extracting…" : "Extract claims"}
        </Button>
        {disabledReason ? <p className="evidence-disabled-reason">{disabledReason}</p> : null}
      </div>
      {aiHealth.data?.mock ? (
        <p className="evidence-demo-notice">Demo Mode: any generated output is labeled as mock.</p>
      ) : null}
      {extract.isError ? <p className="evidence-error" role="alert">{extract.error.message}</p> : null}
      {task.isError ? <p className="evidence-error" role="alert">{task.error.message}</p> : null}
      {task.data?.status === "failed" ? (
        <p className="evidence-error" role="alert">Extraction failed: {task.data.error ?? "The provider did not return usable claims."} The note was not changed.</p>
      ) : null}
      {task.data?.status === "succeeded" && task.data.result?.mock ? (
        <p className="evidence-demo-notice">Mock extraction complete. This output is demo data, not a real analysis.</p>
      ) : null}
      {claims.data?.stats ? (
        <section aria-label="Trust report" className="evidence-trust-report">
          <h3>Trust report</h3>
          <p>
            Verified {claims.data.stats.verified_quotes} of {claims.data.stats.raw_quotes} quotes
            {claims.data.stats.raw_quotes > claims.data.stats.verified_quotes
              ? `; discarded ${claims.data.stats.raw_quotes - claims.data.stats.verified_quotes} unverified.`
              : "."}
          </p>
        </section>
      ) : null}
      {claims.data?.claims.length ? (
        <div className="evidence-claims">
          {claims.data.claims.map((claim) => (
            <article className="evidence-claim" key={claim.id}>
              <div className="evidence-claim-heading">
                <span
                  className={`evidence-proof-chip${claim.interpretation ? " is-interpretation" : claim.evidence.some((proof) => proof.status === "stale") ? " is-stale" : ""}`}
                >
                  {claim.interpretation
                    ? "Interpretation"
                    : claim.evidence.some((proof) => proof.status === "stale")
                      ? "Stale"
                      : <><Check aria-hidden="true" size={12} /> Verified</>}
                </span>
                <Button
                  aria-label="Remove claim"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(claim.id)}
                  size="icon-xs"
                  title="Remove claim"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" size={13} />
                </Button>
              </div>
              <p className="evidence-claim-text">{claim.text}</p>
              {claim.mock ? <p className="evidence-demo-notice">Mock output</p> : null}
              {claim.evidence.map((proof) => (
                <details className="evidence-proof" key={proof.id}>
                  <summary>
                    <CircleAlert aria-hidden="true" size={13} />
                    {proof.status === "verified" ? "View verified quote" : "View stale quote"}
                  </summary>
                  <EvidenceQuote content={note.data?.content ?? ""} evidence={proof} noteId={noteId} />
                </details>
              ))}
              {claim.interpretation ? (
                <p className="evidence-interpretation-note">No quote from this note verified this claim.</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="lens-empty-copy">No claims yet. Extract claims from this note to see verified evidence.</p>
      )}
    </div>
  );
}
