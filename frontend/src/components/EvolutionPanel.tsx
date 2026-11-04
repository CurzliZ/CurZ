import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { getAIHealth } from "@/services/ai";
import { getEvolution, getEvolutionTask, summarizeEvolution } from "@/services/phase12";
import { listTags } from "@/services/api";
import { useWorkspaceUi } from "@/stores/workspace-ui";

export function EvolutionPanel() {
  const navigate = useNavigate();
  const noteId = useWorkspaceUi((state) => state.selectedNoteId);
  const selectNote = useWorkspaceUi((state) => state.setSelectedNoteId);
  const showQuote = useWorkspaceUi((state) => state.showEvidenceInNote);
  const [scope, setScope] = useState("current");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [processedTaskId, setProcessedTaskId] = useState<string | null>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getEvolutionTask>>["result"]>(null);
  const tags = useQuery({ queryKey: ["tags"], queryFn: listTags });
  const tag = scope.startsWith("tag:") ? scope.slice(4) : undefined;
  const timeline = useQuery({
    queryKey: ["evolution", noteId, tag],
    queryFn: () => getEvolution(tag ? { tag } : { noteId: noteId! }),
    enabled: tag !== undefined || noteId !== null,
    retry: false,
  });
  const health = useQuery({ queryKey: ["aiHealth"], queryFn: getAIHealth, retry: false });
  const task = useQuery({
    queryKey: ["evolutionTask", taskId],
    queryFn: () => getEvolutionTask(taskId!),
    enabled: taskId !== null,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" || query.state.data?.status === "running" ? 800 : false,
    retry: false,
  });
  const aiAvailable = Boolean(health.data?.mock || (health.data?.reachable && health.data.chat_model_present));
  const mutation = useMutation({
    mutationFn: summarizeEvolution,
    onSuccess: (started) => setTaskId(started.id),
  });

  useEffect(() => {
    if (scope === "current" && noteId === null) setScope("vault-tag");
  }, [noteId, scope]);
  useEffect(() => {
    if (!task.data || task.data.status !== "succeeded" || task.data.id === processedTaskId) return;
    setSummary(task.data.result);
    setProcessedTaskId(task.data.id);
  }, [processedTaskId, task.data]);

  const currentTimeline = timeline.data;
  const running = task.data?.status === "pending" || task.data?.status === "running";
  const canSummarize = Boolean(
    currentTimeline?.has_enough_history && aiAvailable && !running && !mutation.isPending,
  );
  const summarize = () => {
    if (!canSummarize) return;
    mutation.mutate(tag ? { tag } : { noteId: noteId! });
  };
  const openQuote = (item: NonNullable<typeof currentTimeline>["items"][number]) => {
    selectNote(item.note_id, true);
    showQuote(item.note_id, item.quote_start, item.quote_end);
    navigate("/notes");
  };

  return (
    <div aria-label="Evolution timeline" className="evolution-panel">
      <label className="evolution-scope">
        Timeline scope
        <select
          aria-label="Timeline scope"
          onChange={(event) => {
            setScope(event.target.value);
            setSummary(null);
            setTaskId(null);
          }}
          value={scope}
        >
          <option disabled={noteId === null} value="current">Current note</option>
          <option disabled value="vault-tag">Choose a tag below</option>
          {(tags.data ?? []).map((item) => (
            <option key={item.name} value={`tag:${item.name}`}>{`#${item.name}`}</option>
          ))}
        </select>
      </label>
      {timeline.isError ? (
        <div className="evolution-error-state" role="alert">
          <p>{timeline.error.message}</p>
          <Button onClick={() => void timeline.refetch()} size="sm" variant="outline">Retry timeline</Button>
        </div>
      ) : null}
      {health.isError ? (
        <div className="evolution-error-state" role="status">
          <p>AI availability could not be checked. Timeline history is still available.</p>
          <Button onClick={() => void health.refetch()} size="sm" variant="outline">Retry AI status</Button>
        </div>
      ) : null}
      {timeline.isLoading ? (
        <div aria-busy="true" className="evolution-loading" role="status">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {!timeline.isLoading && !timeline.isError && !currentTimeline?.items.length ? (
        <p className="lens-empty-copy">No verified claims are available in this scope yet. Extract claims from a note to start a timeline.</p>
      ) : null}
      {currentTimeline && currentTimeline.items.length > 0 ? (
        <>
          <p className="lens-empty-copy">{currentTimeline.scope_label} · verified claims only</p>
          <div className="evolution-timeline">
            {currentTimeline.items.map((item, index) => (
              <article className="evolution-card" key={`${item.id}-${index}`}>
                <time dateTime={item.timestamp}>
                  {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(item.timestamp))}
                </time>
                <p>{item.text}</p>
                <blockquote>{item.quote}</blockquote>
                <Button onClick={() => openQuote(item)} size="sm" variant="outline">
                  <ShieldCheck aria-hidden="true" size={14} /> Show in note
                </Button>
                {item.mock ? <small>Demo Mode · Mock extraction</small> : null}
              </article>
            ))}
          </div>
          <section aria-label="Evolution summary" className="evolution-summary">
            <div className="evolution-summary-title"><Sparkles aria-hidden="true" size={15} /> <strong>How thinking changed</strong></div>
            {!currentTimeline.has_enough_history ? (
              <p>There isn't enough verified claim history across different dates to summarize a change yet.</p>
            ) : null}
            {!aiAvailable && currentTimeline.has_enough_history ? (
              <p>Connect a chat model or enable Demo Mode in Settings to summarize this timeline.</p>
            ) : null}
            <Button disabled={!canSummarize} onClick={summarize} size="sm" variant="outline">
              <Clock3 aria-hidden="true" size={14} />
              {running || mutation.isPending ? "Summarizing…" : "Summarize change"}
            </Button>
            {mutation.isError ? <p className="evolution-error" role="alert">{mutation.error.message}</p> : null}
            {task.isError || task.data?.status === "failed" ? (
              <p className="evolution-error" role="alert">{task.data?.error ?? task.error?.message}</p>
            ) : null}
            {summary ? (
              <div className="evolution-interpretation">
                <p className="evolution-ai-label">AI interpretation{summary.mock ? " · Demo Mode (mock)" : ""}</p>
                <p>{summary.summary}</p>
                {summary.changes.map((change, index) => (
                  <div className="evolution-change" key={`${change.from_claim_id}-${change.to_claim_id}-${index}`}>
                    <blockquote>{change.from_quote}</blockquote>
                    <p>{change.description}</p>
                    <blockquote>{change.to_quote}</blockquote>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
