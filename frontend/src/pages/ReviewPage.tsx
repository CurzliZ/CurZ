import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, ListChecks, RefreshCw, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { getAIHealth } from "@/services/ai";
import type { Relationship } from "@/services/api";
import {
  decideRelationship,
  generateRelationships,
  getRelationshipTask,
  getReviewRelationships,
} from "@/services/relationships";
import { useWorkspaceUi } from "@/stores/workspace-ui";

type ReviewView = "relations" | "tensions" | "stale";
type Decision = Parameters<typeof decideRelationship>[1];

const relationshipTypes = [
  "supports", "contradicts", "extends", "example_of", "depends_on",
  "applies_to", "inspired_by", "tension",
];

function relationshipQuote(item: Relationship, noteId: number): string {
  return item.evidence.find((proof) => proof.note_id === noteId)?.quote ?? "";
}

function ProposalCard({
  item,
  view,
  disabled,
  onOpenNote,
  onDecide,
}: {
  item: Relationship;
  view: ReviewView;
  disabled: boolean;
  onOpenNote: (noteId: number) => void;
  onDecide: (id: number, decision: Decision) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState(item.relationship_type);
  const [explanation, setExplanation] = useState(item.explanation);
  const [sourceQuote, setSourceQuote] = useState(relationshipQuote(item, item.source_note_id));
  const [targetQuote, setTargetQuote] = useState(relationshipQuote(item, item.target_note_id));
  const tension = item.relationship_type === "tension";

  const edit = () => onDecide(item.id, {
    action: "edit",
    relationship_type: type,
    explanation,
    source_quote: sourceQuote,
    target_quote: targetQuote,
  });

  return (
    <article className={`review-card${tension ? " is-tension" : ""}${view === "stale" ? " is-outdated" : ""}`}>
      {tension ? (
        <div className="review-tension-pair">
          <div>
            <button className="review-source-link" onClick={() => onOpenNote(item.source_note_id)} type="button">
              {item.source_title}
            </button>
            <blockquote>{relationshipQuote(item, item.source_note_id) || "Source quote needs refreshing."}</blockquote>
          </div>
          <span aria-hidden="true" className="review-tension-connector" />
          <div>
            <button className="review-source-link" onClick={() => onOpenNote(item.target_note_id)} type="button">
              {item.target_title}
            </button>
            <blockquote>{relationshipQuote(item, item.target_note_id) || "Source quote needs refreshing."}</blockquote>
          </div>
        </div>
      ) : (
        <header className="review-card-heading">
          <div>
            <button className="review-source-link" onClick={() => onOpenNote(item.source_note_id)} type="button">
              {item.source_title}
            </button>
            <span aria-hidden="true"> → </span>
            <button className="review-source-link" onClick={() => onOpenNote(item.target_note_id)} type="button">
              {item.target_title}
            </button>
          </div>
          <span className="review-type">{item.relationship_type.replaceAll("_", " ")}</span>
        </header>
      )}
      {tension ? (
        <>
          <h3 className="review-tension-label">What seems to conflict</h3>
          <p>{item.explanation}</p>
          <h3 className="review-tension-label">Why both could be true</h3>
          <p className="review-context-note">
            They may describe different contexts or conditions. Check both notes before deciding.
          </p>
        </>
      ) : (
        <>
          <p className="review-explanation">{item.explanation}</p>
          {!item.evidence.length && <p className="review-warning">No source quotes are available.</p>}
          {item.evidence.map((proof) => (
            <p className={`review-proof${proof.status === "stale" ? " is-stale" : ""}`} key={proof.note_id}>
              <span>{proof.status === "verified" ? "Verified" : "Stale"} · {proof.note_title}</span>
              <q>{proof.quote}</q>
            </p>
          ))}
        </>
      )}
      {item.origin === "ai" && <span className="review-origin">AI suggestion · human review required</span>}
      {editing && (
        <div className="review-edit-form">
          <label>
            Relationship type
            <select onChange={(event) => setType(event.target.value)} value={type}>
              {relationshipTypes.map((option) => (
                <option key={option} value={option}>{option.replaceAll("_", " ")}</option>
              ))}
            </select>
          </label>
          <label>Explanation<Input onChange={(event) => setExplanation(event.target.value)} value={explanation} /></label>
          <label>Quote from {item.source_title}<textarea onChange={(event) => setSourceQuote(event.target.value)} value={sourceQuote} /></label>
          <label>Quote from {item.target_title}<textarea onChange={(event) => setTargetQuote(event.target.value)} value={targetQuote} /></label>
          <div className="review-card-actions">
            <Button disabled={disabled || !explanation.trim() || !sourceQuote.trim() || !targetQuote.trim()} onClick={edit} size="sm">
              <Check aria-hidden="true" /> Save &amp; accept
            </Button>
            <Button onClick={() => setEditing(false)} size="sm" variant="ghost">Cancel</Button>
          </div>
        </div>
      )}
      {!editing && (
        <footer className="review-card-actions">
          <Button disabled={disabled || item.evidence.some((proof) => proof.status !== "verified") || new Set(item.evidence.map((proof) => proof.note_id)).size !== 2} onClick={() => onDecide(item.id, { action: "accept" })} size="sm">
            <Check aria-hidden="true" /> Accept
          </Button>
          <Button disabled={disabled} onClick={() => setEditing(true)} size="sm" variant="outline">Edit</Button>
          <Button disabled={disabled} onClick={() => onDecide(item.id, { action: "dismiss" })} size="sm" variant="ghost">
            <X aria-hidden="true" /> Dismiss
          </Button>
          <Button disabled={disabled} onClick={() => onDecide(item.id, { action: "defer" })} size="sm" variant="ghost">
            <Clock3 aria-hidden="true" /> Defer
          </Button>
        </footer>
      )}
    </article>
  );
}

export function ReviewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setSelectedNoteId = useWorkspaceUi((state) => state.setSelectedNoteId);
  const setRelationshipPulseId = useWorkspaceUi((state) => state.setRelationshipPulseId);
  const [view, setView] = useState<ReviewView>("relations");
  const [taskId, setTaskId] = useState<string | null>(null);
  const health = useQuery({ queryKey: ["aiHealth"], queryFn: getAIHealth, retry: false });
  const items = useQuery({
    queryKey: ["relationshipReview", view],
    queryFn: () => getReviewRelationships(view),
  });
  const task = useQuery({
    queryKey: ["relationshipTask", taskId],
    queryFn: () => getRelationshipTask(taskId!),
    enabled: taskId !== null,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" || query.state.data?.status === "running" ? 750 : false,
    retry: false,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["relationshipReview"] }),
      queryClient.invalidateQueries({ queryKey: ["graphNeighborhood"] }),
      queryClient.invalidateQueries({ queryKey: ["graphOverview"] }),
    ]);
  };
  const generate = useMutation({
    mutationFn: generateRelationships,
    onSuccess: (started) => setTaskId(started.id),
  });
  const decision = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Decision }) => decideRelationship(id, input),
    onSuccess: async (updated) => {
      if (updated.state === "accepted") setRelationshipPulseId(updated.id);
      await refresh();
      toast.add({
        title: updated.state === "accepted" ? "Relationship accepted" :
          updated.state === "rejected" ? "Suggestion dismissed" : "Review updated",
        description: updated.state === "outdated"
          ? "The evidence changed; this relationship needs another look."
          : undefined,
        type: "success",
      });
    },
  });
  const openNote = (id: number) => {
    setSelectedNoteId(id, true);
    navigate("/notes");
  };
  const aiAvailable = Boolean(health.data?.mock || (health.data?.reachable && health.data.chat_model_present));
  const generating = task.data?.status === "pending" || task.data?.status === "running";
  const taskResult = task.data?.result;

  return (
    <main className="review-page">
      <header className="review-header">
        <div>
          <p className="eyebrow">Human judgment, always</p>
          <h1>Review relationships</h1>
          <p>AI suggestions stay pending until you decide what belongs in your Brain.</p>
        </div>
        <Button
          disabled={!aiAvailable || generate.isPending || generating}
          onClick={() => generate.mutate()}
        >
          <RefreshCw aria-hidden="true" /> {generating ? "Finding candidates…" : "Find suggestions"}
        </Button>
      </header>
      {!aiAvailable && (
        <p className="review-hint" role="status">
          Relationship generation needs a connected chat model or explicit Demo Mode. Existing notes and links continue to work.
        </p>
      )}
      {health.isError && <p className="review-error" role="alert">AI status could not be checked. Retry in Settings.</p>}
      {generate.isError && <p className="review-error" role="alert">{generate.error.message}</p>}
      {task.isError && <p className="review-error" role="alert">{task.error.message}</p>}
      {task.data?.status === "failed" && <p className="review-error" role="alert">{task.data.error ?? "Relationship generation failed."}</p>}
      {task.data?.status === "succeeded" && taskResult && (
        <p className="review-hint" role="status">
          {taskResult.mock ? "Demo Mode · " : ""}
          Checked {taskResult.candidate_count ?? 0} shortlisted pairs; proposed {taskResult.proposed_count ?? 0}; discarded {taskResult.discarded_count ?? 0}.
        </p>
      )}
      {decision.isError && <p className="review-error" role="alert">{decision.error.message}</p>}
      <Tabs onValueChange={(value) => setView(value as ReviewView)} value={view}>
        <TabsList className="review-tabs">
          <TabsTrigger value="relations">Relations</TabsTrigger>
          <TabsTrigger value="tensions">Tensions</TabsTrigger>
          <TabsTrigger value="stale">Stale evidence</TabsTrigger>
        </TabsList>
        {(["relations", "tensions", "stale"] as const).map((tab) => (
          <TabsContent className="review-list" key={tab} value={tab}>
            {items.isLoading ? (
              <div aria-busy="true" className="review-loading" role="status">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : null}
            {items.isError && (
              <div className="review-error-state" role="alert">
                <p>{items.error.message}</p>
                <Button onClick={() => void items.refetch()} size="sm" variant="outline">Retry loading suggestions</Button>
              </div>
            )}
            {!items.isLoading && !items.isError && !items.data?.items.length && (
              <div className="review-empty-state">
                <ListChecks aria-hidden="true" size={24} />
                <h2>{tab === "stale" ? "Evidence is current" : "Nothing to review"}</h2>
                <p>{tab === "stale" ? "Changed or missing quotes will appear here." : "Generate suggestions from a small, deterministic shortlist of notes."}</p>
              </div>
            )}
            {items.data?.items.map((item) => (
              <ProposalCard
                disabled={decision.isPending}
                item={item}
                key={item.id}
                onDecide={(id, input) => decision.mutate({ id, input })}
                onOpenNote={openNote}
                view={tab}
              />
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </main>
  );
}
