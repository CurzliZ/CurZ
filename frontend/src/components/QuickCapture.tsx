import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Inbox, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { createInboxCapture } from "@/services/api";
import { useWorkspaceUi } from "@/stores/workspace-ui";

function QuickCaptureForm({
  autoFocus = false,
  onCaptured,
}: {
  autoFocus?: boolean;
  onCaptured?: () => void;
}) {
  const [thought, setThought] = useState("");
  const queryClient = useQueryClient();
  const capture = useMutation({
    mutationFn: (value: string) => createInboxCapture(value),
    onSuccess: (note) => {
      queryClient.setQueryData(["note", note.id], note);
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      void queryClient.invalidateQueries({ queryKey: ["search"] });
      void queryClient.invalidateQueries({ queryKey: ["homeInbox"] });
      void queryClient.invalidateQueries({ queryKey: ["homeRecent"] });
      void queryClient.invalidateQueries({ queryKey: ["noteTargets"] });
      setThought("");
      onCaptured?.();
      toast.add({
        title: "Saved to Inbox",
        description: "Your thought is ready to organize from Home.",
        type: "success",
      });
    },
  });

  return (
    <form
      className="quick-capture-form"
      onSubmit={(event) => {
        event.preventDefault();
        const value = thought.trim();
        if (value && !capture.isPending) capture.mutate(value);
      }}
    >
      <textarea
        aria-label="Quick capture thought"
        autoFocus={autoFocus}
        onChange={(event) => setThought(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder="Catch a thought before it slips away…"
        rows={3}
        value={thought}
      />
      {capture.isError && (
        <p className="quick-capture-error" role="alert">
          {capture.error.message} Your thought is still here; retry when the backend is available.
        </p>
      )}
      <div className="quick-capture-footer">
        <span>Enter to save · Shift+Enter for a new line</span>
        <Button disabled={!thought.trim() || capture.isPending} size="sm" type="submit">
          <Send aria-hidden="true" />
          {capture.isPending ? "Saving…" : "Save to Inbox"}
        </Button>
      </div>
    </form>
  );
}

export function QuickCaptureBox() {
  return (
    <section aria-labelledby="quick-capture-title" className="home-capture-card">
      <div className="home-section-heading">
        <Inbox aria-hidden="true" size={18} />
        <h2 id="quick-capture-title">Quick capture</h2>
        <span className="capture-shortcut">Ctrl+Shift+N</span>
      </div>
      <QuickCaptureForm />
    </section>
  );
}

export function QuickCaptureDialog() {
  const open = useWorkspaceUi((state) => state.quickCaptureOpen);
  const setOpen = useWorkspaceUi((state) => state.setQuickCaptureOpen);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent className="quick-capture-dialog">
        <span aria-hidden="true" className="capture-dialog-icon">
          <Inbox size={18} />
        </span>
        <DialogTitle>Quick capture</DialogTitle>
        <DialogDescription>
          Save a thought now; organize it later from Home.
        </DialogDescription>
        <QuickCaptureForm autoFocus onCaptured={() => setOpen(false)} />
        <button
          className="capture-dialog-home-link"
          onClick={() => setOpen(false)}
          type="button"
        >
          <ArrowUpRight aria-hidden="true" size={14} />
          Keep capturing on Home
        </button>
      </DialogContent>
    </Dialog>
  );
}
