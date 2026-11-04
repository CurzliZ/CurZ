import { create } from "zustand";
import type { GraphEdge } from "@/services/api";

export interface GraphClusterSummary {
  id: number;
  size: number;
  notes: string[];
  noteIds: number[];
}

export interface GraphBridgeSummary {
  noteId: number;
  title: string;
  clusterIds: number[];
}

interface WorkspaceUiState {
  selectedNoteId: number | null;
  selectionPinned: boolean;
  commandPaletteOpen: boolean;
  quickCaptureOpen: boolean;
  askOpen: boolean;
  graphClusters: GraphClusterSummary[];
  graphBridges: GraphBridgeSummary[];
  graphBridgesComplete: boolean;
  lensTab: "links" | "evidence" | "timeline";
  selectedGraphRelationship: GraphEdge | null;
  relationshipPulseId: number | null;
  evidenceTarget: { noteId: number; start: number; end: number; revision: number } | null;
  setSelectedNoteId: (id: number | null, pinned?: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setQuickCaptureOpen: (open: boolean) => void;
  setAskOpen: (open: boolean) => void;
  setGraphClusters: (clusters: GraphClusterSummary[]) => void;
  setGraphBridges: (bridges: GraphBridgeSummary[], complete: boolean) => void;
  setLensTab: (tab: "links" | "evidence" | "timeline") => void;
  setSelectedGraphRelationship: (relationship: GraphEdge | null) => void;
  setRelationshipPulseId: (id: number | null) => void;
  showEvidenceInNote: (noteId: number, start: number, end: number) => void;
}

export const useWorkspaceUi = create<WorkspaceUiState>((set) => ({
  selectedNoteId: null,
  selectionPinned: false,
  commandPaletteOpen: false,
  quickCaptureOpen: false,
  askOpen: false,
  graphClusters: [],
  graphBridges: [],
  graphBridgesComplete: false,
  lensTab: "links",
  selectedGraphRelationship: null,
  relationshipPulseId: null,
  evidenceTarget: null,
  setSelectedNoteId: (selectedNoteId, selectionPinned = false) =>
    set({ selectedNoteId, selectionPinned }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setQuickCaptureOpen: (quickCaptureOpen) => set({ quickCaptureOpen }),
  setAskOpen: (askOpen) => set({ askOpen }),
  setGraphClusters: (graphClusters) => set({ graphClusters }),
  setGraphBridges: (graphBridges, graphBridgesComplete) =>
    set({ graphBridges, graphBridgesComplete }),
  setLensTab: (lensTab) => set({ lensTab }),
  setSelectedGraphRelationship: (selectedGraphRelationship) => set({ selectedGraphRelationship }),
  setRelationshipPulseId: (relationshipPulseId) => set({ relationshipPulseId }),
  showEvidenceInNote: (noteId, start, end) =>
    set((state) => ({
      evidenceTarget: {
        noteId,
        start,
        end,
        revision: (state.evidenceTarget?.revision ?? 0) + 1,
      },
      selectedNoteId: noteId,
      selectionPinned: true,
    })),
}));
