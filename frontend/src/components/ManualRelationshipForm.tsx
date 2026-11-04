import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listNoteTargets } from "@/services/api";
import { createRelationship } from "@/services/relationships";
import { useWorkspaceUi } from "@/stores/workspace-ui";

const types = [
  "supports", "contradicts", "extends", "example_of", "depends_on",
  "applies_to", "inspired_by", "tension",
];

export function ManualRelationshipForm({ sourceId }: { sourceId: number }) {
  const queryClient = useQueryClient();
  const setRelationshipPulseId = useWorkspaceUi((state) => state.setRelationshipPulseId);
  const targets = useQuery({ queryKey: ["noteTargets"], queryFn: listNoteTargets });
  const [targetId, setTargetId] = useState("");
  const [type, setType] = useState("supports");
  const [explanation, setExplanation] = useState("");
  const [sourceQuote, setSourceQuote] = useState("");
  const [targetQuote, setTargetQuote] = useState("");
  const create = useMutation({
    mutationFn: createRelationship,
    onSuccess: async (created) => {
      setExplanation("");
      setSourceQuote("");
      setTargetQuote("");
      if (created?.id) setRelationshipPulseId(created.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["graphNeighborhood"] }),
        queryClient.invalidateQueries({ queryKey: ["graphOverview"] }),
        queryClient.invalidateQueries({ queryKey: ["relationshipReview"] }),
      ]);
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate({
      source_note_id: sourceId,
      target_note_id: Number(targetId),
      relationship_type: type,
      explanation,
      source_quote: sourceQuote,
      target_quote: targetQuote,
    });
  };

  return (
    <details className="manual-relationship">
      <summary><Plus aria-hidden="true" size={14} /> Add relationship</summary>
      <form onSubmit={submit}>
        <label>
          Related note
          <select onChange={(event) => setTargetId(event.target.value)} required value={targetId}>
            <option value="">Choose a note</option>
            {(targets.data ?? []).filter((note) => note.id !== sourceId).map((note) => (
              <option key={note.id} value={note.id}>{note.title}</option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select onChange={(event) => setType(event.target.value)} value={type}>
            {types.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label>Explanation<Input onChange={(event) => setExplanation(event.target.value)} required value={explanation} /></label>
        <label>Quote in this note<textarea onChange={(event) => setSourceQuote(event.target.value)} required value={sourceQuote} /></label>
        <label>Quote in related note<textarea onChange={(event) => setTargetQuote(event.target.value)} required value={targetQuote} /></label>
        {targets.isError && <p role="alert">Notes could not be loaded. Retry by reopening Lens.</p>}
        {create.isError && <p role="alert">{create.error.message}</p>}
        {create.isSuccess && <p role="status">Relationship added to the Brain.</p>}
        <Button disabled={create.isPending || !targetId} size="sm" type="submit">
          {create.isPending ? "Saving…" : "Add verified relationship"}
        </Button>
        <p className="manual-relationship-help">Both quotes are checked against their Markdown files before saving.</p>
      </form>
    </details>
  );
}
