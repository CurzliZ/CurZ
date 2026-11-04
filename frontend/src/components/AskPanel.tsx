import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageCircleQuestion, Send, ShieldCheck, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getAIHealth } from "@/services/ai";
import type { AskCitation, AskResult, AskScopeKind } from "@/services/ask";
import { cancelAskTask, getAskScopes, getAskTask, startAsk } from "@/services/ask";
import { useWorkspaceUi } from "@/stores/workspace-ui";

interface ConversationItem {
  question: string;
  result: AskResult;
}

function Citation({
  item,
  onOpen,
}: {
  item: AskCitation;
  onOpen: (item: AskCitation) => void;
}) {
  return (
    <div className="ask-citation">
      <button
        aria-label={`Open citation ${item.citation}: ${item.title}`}
        className="ask-citation-link"
        onClick={() => onOpen(item)}
        type="button"
      >
        [{item.citation}] {item.title}{item.heading ? ` · ${item.heading}` : ""}
      </button>
      <span className="ask-proof-chip is-verified"><ShieldCheck aria-hidden="true" size={12} /> Verified quote</span>
      <blockquote>{item.quote}</blockquote>
    </div>
  );
}

export function AskPanel() {
  const navigate = useNavigate();
  const open = useWorkspaceUi((state) => state.askOpen);
  const setOpen = useWorkspaceUi((state) => state.setAskOpen);
  const noteId = useWorkspaceUi((state) => state.selectedNoteId);
  const showEvidence = useWorkspaceUi((state) => state.showEvidenceInNote);
  const [kind, setKind] = useState<AskScopeKind>(noteId === null ? "vault" : "current_note");
  const [folder, setFolder] = useState("");
  const [tag, setTag] = useState("");
  const [question, setQuestion] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [processedTaskId, setProcessedTaskId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const scopes = useQuery({ queryKey: ["askScopes"], queryFn: getAskScopes, enabled: open });
  const health = useQuery({ queryKey: ["aiHealth"], queryFn: getAIHealth, retry: false });
  const task = useQuery({
    queryKey: ["askTask", taskId],
    queryFn: () => getAskTask(taskId!),
    enabled: taskId !== null,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" || query.state.data?.status === "running" ? 750 : false,
    retry: false,
  });
  const aiAvailable = Boolean(health.data?.mock || (health.data?.reachable && health.data.chat_model_present));
  const running = task.data?.status === "pending" || task.data?.status === "running";
  const ask = useMutation({
    mutationFn: startAsk,
    onSuccess: (started) => setTaskId(started.id),
  });
  const cancel = useMutation({
    mutationFn: cancelAskTask,
    onSuccess: (updated) => {
      if (updated.status === "cancelled") {
        setTaskId(null);
        setPendingQuestion("");
      }
    },
  });

  useEffect(() => {
    if (open) setKind(noteId === null ? "vault" : "current_note");
  }, [noteId, open]);

  useEffect(() => {
    const data = task.data;
    if (!data || data.status !== "succeeded" || !data.result || data.id === processedTaskId) return;
    setConversation((items) => [...items, { question: pendingQuestion, result: data.result! }]);
    setProcessedTaskId(data.id);
    setPendingQuestion("");
    setQuestion("");
  }, [pendingQuestion, processedTaskId, task.data]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || !aiAvailable || running || !scopes.data) return;
    const scope =
      kind === "current_note" && noteId !== null
        ? { kind, note_id: noteId } as const
        : kind === "folder" && folder
          ? { kind, folder } as const
          : kind === "tag" && tag
            ? { kind, tag } as const
            : kind === "vault"
              ? { kind } as const
              : null;
    if (!scope) return;
    setPendingQuestion(trimmed);
    ask.mutate({
      question: trimmed,
      scope,
      turns: conversation.slice(-4).map(({ question: previous, result }) => ({
        question: previous,
        answer: result.answer,
      })),
    });
  };

  const openCitation = (item: AskCitation) => {
    showEvidence(item.note_id, item.quote_start, item.quote_end);
    setOpen(false);
    navigate("/notes");
  };
  const retryState = scopes.isError || health.isError || task.isError || ask.isError;
  const disabled = !question.trim() || !aiAvailable || running || ask.isPending || !scopes.data;
  const scopeSummary =
    kind === "current_note" ? "Current note" :
      kind === "folder" ? `Folder: ${folder || "Choose a folder"}` :
        kind === "tag" ? `Tag: ${tag ? `#${tag}` : "Choose a tag"}` :
          "Whole vault";

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent className="ask-dialog">
        <header className="ask-heading">
          <div className="ask-heading-icon"><MessageCircleQuestion aria-hidden="true" size={18} /></div>
          <div>
            <DialogTitle>Ask your notes</DialogTitle>
            <DialogDescription>Answers use only retrieved notes, with quotes you can verify.</DialogDescription>
          </div>
        </header>
        <div className="ask-scope-row">
          <label htmlFor="ask-scope-kind">Search scope</label>
          <select
            id="ask-scope-kind"
            onChange={(event) => setKind(event.target.value as AskScopeKind)}
            value={kind}
          >
            <option disabled={noteId === null} value="current_note">Current note</option>
            <option value="folder">Folder</option>
            <option value="tag">Tag</option>
            <option value="vault">Whole vault</option>
          </select>
          {kind === "folder" && (
            <select aria-label="Ask within folder" onChange={(event) => setFolder(event.target.value)} value={folder}>
              <option value="">Choose folder</option>
              {(scopes.data?.folders ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          )}
          {kind === "tag" && (
            <select aria-label="Ask within tag" onChange={(event) => setTag(event.target.value)} value={tag}>
              <option value="">Choose tag</option>
              {(scopes.data?.tags ?? []).map((item) => <option key={item} value={item}>{`#${item}`}</option>)}
            </select>
          )}
        </div>
        <p className="ask-scope-summary" aria-live="polite">
          Visible scope: <strong>{scopeSummary}</strong>. The answer task receives retrieved chunks only.
        </p>
        {!aiAvailable && (
          <p className="ask-status-message" role="status">
            {health.isError
              ? "AI status could not be checked. Retry Settings or check the backend."
              : "Ask is unavailable until a chat model is connected or Demo Mode is enabled. Notes and search remain available."}
          </p>
        )}
        {scopes.isError && <p className="ask-error" role="alert">{scopes.error.message}</p>}
        {ask.isError && <p className="ask-error" role="alert">{ask.error.message}</p>}
        {task.isError && <p className="ask-error" role="alert">{task.error.message}</p>}
        {task.data?.status === "failed" && (
          <p className="ask-error" role="alert">{task.data.error ?? "The answer task failed."}</p>
        )}
        <div aria-live="polite" className="ask-conversation">
          {conversation.map((item, index) => (
            <article className="ask-answer" key={`${index}-${item.question}`}>
              <p className="ask-question">{item.question}</p>
              {item.result.mock && <p className="ask-mock-label">Demo Mode · Mock response</p>}
              <p className="ask-answer-copy">
                {item.result.answer === "I couldn't find support for this in your notes"
                  ? <><span className="ask-proof-chip is-empty">No evidence found</span> {item.result.answer}</>
                  : item.result.claims.map((claim) => (
                    <span className="ask-supported-claim" key={claim.citation}>
                      {claim.text} <button onClick={() => openCitation(claim)} type="button">[{claim.citation}]</button>
                    </span>
                  ))}
              </p>
              {item.result.claims.map((claim) => <Citation item={claim} key={`proof-${claim.citation}`} onOpen={openCitation} />)}
              {item.result.unsupported.length > 0 && (
                <div className="ask-unsupported">
                  <h3>Not included as supported answers</h3>
                  {item.result.unsupported.map((statement, itemIndex) => (
                    <p key={`${itemIndex}-${statement}`}>
                      <span className="ask-proof-chip is-interpretation">Interpretation</span>
                      <span className="ask-proof-chip is-unverified">Needs verification</span>
                      {statement}
                    </p>
                  ))}
                </div>
              )}
              <p className="ask-retrieval-receipt">
                Searched {item.result.searched.scope_label} · {item.result.searched.chunks_searched} chunks · {item.result.searched.retrieval_method}
              </p>
            </article>
          ))}
          {running && (
            <div className="ask-running" role="status">
              <span>Searching {scopeSummary} and preparing a cited answer…</span>
              <Button disabled={cancel.isPending} onClick={() => taskId && cancel.mutate(taskId)} size="sm" variant="outline">
                <X aria-hidden="true" /> Cancel
              </Button>
            </div>
          )}
          {task.data?.status === "cancelled" && <p className="ask-status-message">Ask was cancelled.</p>}
          {retryState && <Button onClick={() => void Promise.all([scopes.refetch(), health.refetch(), task.refetch()])} size="sm" variant="outline">Retry</Button>}
          {conversation.length === 0 && !running && <p className="ask-first-hint">Ask a question to retrieve relevant passages and citations.</p>}
        </div>
        <form className="ask-question-form" onSubmit={submit}>
          <Input
            aria-label="Question about your notes"
            maxLength={2000}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What would you like to understand?"
            value={question}
          />
          <Button aria-label="Ask question" disabled={disabled} type="submit"><Send aria-hidden="true" /></Button>
        </form>
        <p className="ask-turn-limit">Follow-ups include the last 4 question-and-answer turns. Note text is never added to conversation history.</p>
      </DialogContent>
    </Dialog>
  );
}
