import { lazy, Suspense, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { QuickCaptureDialog } from "@/components/QuickCapture";
import { AskPanel } from "@/components/AskPanel";
import { toast } from "@/components/ui/toast";
import { createUntitledNote, rescanVault } from "@/services/api";
import { useWorkspaceUi } from "@/stores/workspace-ui";

const CommandPalette = lazy(() =>
  import("@/components/CommandPalette").then((module) => ({
    default: module.CommandPalette,
  })),
);

interface WorkspaceCommandLayerProps {
  onToggleLens: () => void;
  onToggleRail: () => void;
}

export function WorkspaceCommandLayer({
  onToggleLens,
  onToggleRail,
}: WorkspaceCommandLayerProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const commandPaletteOpen = useWorkspaceUi((state) => state.commandPaletteOpen);
  const setCommandPaletteOpen = useWorkspaceUi((state) => state.setCommandPaletteOpen);
  const setQuickCaptureOpen = useWorkspaceUi((state) => state.setQuickCaptureOpen);
  const setAskOpen = useWorkspaceUi((state) => state.setAskOpen);
  const setSelectedNoteId = useWorkspaceUi((state) => state.setSelectedNoteId);
  const setLensTab = useWorkspaceUi((state) => state.setLensTab);

  const newNote = useMutation({
    mutationFn: createUntitledNote,
    onSuccess: async (note) => {
      queryClient.setQueryData(["note", note.id], note);
      setSelectedNoteId(note.id, true);
      navigate("/notes");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notes"] }),
        queryClient.invalidateQueries({ queryKey: ["search"] }),
        queryClient.invalidateQueries({ queryKey: ["noteTargets"] }),
        queryClient.invalidateQueries({ queryKey: ["homeRecent"] }),
      ]);
    },
    onError: (error) => toast.add({
      title: "Could not create a note",
      description: error.message,
      type: "error",
    }),
  });
  const rescan = useMutation({
    mutationFn: rescanVault,
    onSuccess: (result) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notes"] }),
        queryClient.invalidateQueries({ queryKey: ["tags"] }),
        queryClient.invalidateQueries({ queryKey: ["noteTargets"] }),
        queryClient.invalidateQueries({ queryKey: ["homeRecent"] }),
        queryClient.invalidateQueries({ queryKey: ["homeInbox"] }),
        queryClient.invalidateQueries({ queryKey: ["search"] }),
        queryClient.invalidateQueries({ queryKey: ["claims"] }),
      ]);
      toast.add({
        title: "Vault rescanned",
        description: `${result.created} created, ${result.changed} changed, ${result.deleted} removed.`,
        type: "success",
      });
    },
    onError: (error) => toast.add({
      title: "Could not rescan vault",
      description: error.message,
      type: "error",
    }),
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuickCaptureOpen(false);
        setCommandPaletteOpen(true);
        return;
      }
      if (
        event.ctrlKey &&
        event.shiftKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key.toLowerCase() === "n"
      ) {
        event.preventDefault();
        setCommandPaletteOpen(false);
        setQuickCaptureOpen(true);
        return;
      }
      const target = event.target;
      if (
        event.ctrlKey &&
        !event.altKey &&
        event.key.toLowerCase() === "b" &&
        !(target instanceof HTMLElement &&
          (target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(target.tagName)))
      ) {
        event.preventDefault();
        onToggleRail();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onToggleRail, setCommandPaletteOpen, setQuickCaptureOpen]);

  return (
    <>
      <Suspense fallback={null}>
        {commandPaletteOpen && (
          <CommandPalette
            onNewNote={() => newNote.mutate()}
            onNavigate={navigate}
            onOpenChange={setCommandPaletteOpen}
            onOpenNote={(id) => {
              setSelectedNoteId(id, true);
              navigate("/notes");
            }}
            onAsk={() => setAskOpen(true)}
            onOpenEvolution={() => {
              setLensTab("timeline");
              navigate("/notes");
            }}
            onQuickCapture={() => setQuickCaptureOpen(true)}
            onRescan={() => rescan.mutate()}
            onToggleLens={onToggleLens}
            onToggleRail={onToggleRail}
            open
          />
        )}
      </Suspense>
      <QuickCaptureDialog />
      <AskPanel />
    </>
  );
}
