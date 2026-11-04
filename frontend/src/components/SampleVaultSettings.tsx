import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { APP_NAME } from "@/lib/brand";
import { useWorkspaceUi } from "@/stores/workspace-ui";
import {
  getSampleVaultStatus,
  loadSampleVault,
  removeSampleVault,
} from "@/services/api";

export function SampleVaultSettings() {
  const queryClient = useQueryClient();
  const setSelectedNoteId = useWorkspaceUi((state) => state.setSelectedNoteId);
  const status = useQuery({
    queryKey: ["sampleVaultStatus"],
    queryFn: getSampleVaultStatus,
  });
  const load = useMutation({
    mutationFn: loadSampleVault,
    onSuccess: async () => {
      setSelectedNoteId(null);
      await queryClient.invalidateQueries();
      toast.add({ title: "Sample vault opened", description: "Your existing vault remains unchanged.", type: "success" });
    },
  });
  const remove = useMutation({
    mutationFn: () => removeSampleVault(true),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      toast.add({ title: "Sample files removed", type: "success" });
    },
  });
  const count = status.data?.note_count ?? 0;
  const confirmRemoval = () => {
    if (window.confirm(
      `Remove ${count} sample-marked Markdown files from the dedicated sample vault? ` +
      "Only files listed in its manifest are removed. Other files and folders are kept.",
    )) {
      remove.mutate();
    }
  };

  return (
    <section aria-labelledby="sample-vault-title" className="phase13-card">
      <div>
        <p className="eyebrow">Explore {APP_NAME}</p>
        <h2 id="sample-vault-title">Sample vault</h2>
        <p>
          Load an original 43-note workspace with clusters, a bridge, open questions,
          tensions, and a dated belief change. It opens in a dedicated folder and
          does not copy over your current vault.
        </p>
        {status.data?.loaded ? (
          <p className="phase13-status">
            {count} sample-marked notes remain in {status.data.path}.
            Removing the sample preserves any other Markdown files in that folder.
          </p>
        ) : null}
        {status.isError ? <p className="ai-form-error" role="alert">{status.error.message}</p> : null}
        {load.isError ? <p className="ai-form-error" role="alert">{load.error.message}</p> : null}
        {remove.isError ? <p className="ai-form-error" role="alert">{remove.error.message}</p> : null}
        {remove.data ? (
          <p className="phase13-status" role="status">
            Removed {remove.data.removed} sample files; preserved {remove.data.preserved} other Markdown files.
          </p>
        ) : null}
      </div>
      <div className="phase13-actions">
        <Button
          disabled={!status.data?.available || load.isPending || remove.isPending}
          onClick={() => load.mutate()}
          variant="default"
        >
          {status.data?.loaded ? "Open sample vault" : "Load sample vault"}
        </Button>
        <Button
          disabled={!status.data?.loaded || load.isPending || remove.isPending}
          onClick={confirmRemoval}
          variant="outline"
        >
          <Trash2 aria-hidden="true" size={15} /> Remove sample vault
        </Button>
        {!status.data?.loaded ? (
          <small>A sample vault must be loaded before it can be removed.</small>
        ) : null}
        <Link className="phase13-report-link" to="/trust">Open Trust Report</Link>
      </div>
    </section>
  );
}
