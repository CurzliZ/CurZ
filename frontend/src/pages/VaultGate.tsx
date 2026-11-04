import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, FolderPlus, RefreshCw } from "lucide-react";
import { Outlet } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandLogo } from "@/components/BrandLogo";
import { APP_NAME } from "@/lib/brand";
import { useWorkspaceUi } from "@/stores/workspace-ui";
import {
  ApiError,
  createVault,
  getSampleVaultStatus,
  getVaultStatus,
  loadSampleVault,
  openVault,
  removeSampleVault,
} from "@/services/api";

function isAbsolutePath(path: string): boolean {
  return (
    /^[a-zA-Z]:[\\/]/.test(path) ||
    /^\\\\[^\\]+\\[^\\]+/.test(path) ||
    /^\/(?:[^/]+\/?)*$/.test(path)
  );
}

function recoveryMessage(error: unknown, creating: boolean): string {
  if (!(error instanceof ApiError)) {
    return "Check that the backend is running, then retry. Your folder has not been changed.";
  }
  if (error.code === "vault_not_found") {
    return "That folder does not exist. Choose an existing folder or use Create new vault.";
  }
  if (error.code === "vault_not_directory") {
    return "The path is a file, not a folder. Choose a folder instead.";
  }
  if (error.code === "vault_path_invalid" || error.code === "path_outside_vault") {
    return "Use a valid absolute folder path, such as C:\\Users\\you\\Notes.";
  }
  return creating
    ? `${error.message} Check that you can create folders at this location, then retry.`
    : `${error.message} Check the folder path and permissions, then retry.`;
}

export function VaultGate() {
  useEffect(() => {
    document.title = `Open a vault · ${APP_NAME}`;
  }, []);
  const queryClient = useQueryClient();
  const setSelectedNoteId = useWorkspaceUi((state) => state.setSelectedNoteId);
  const vault = useQuery({
    queryKey: ["vault", "status"],
    queryFn: getVaultStatus,
  });
  const sampleStatus = useQuery({
    queryKey: ["sampleVaultStatus"],
    queryFn: getSampleVaultStatus,
  });
  const [path, setPath] = useState("");
  const [validation, setValidation] = useState("");
  const [createMode, setCreateMode] = useState(false);
  const operation = useMutation({
    mutationFn: ({ folder, create }: { folder: string; create: boolean }) =>
      create ? createVault(folder) : openVault(folder),
    onSuccess: async () => {
      setValidation("");
      await queryClient.invalidateQueries({ queryKey: ["vault", "status"] });
      await queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
  const sample = useMutation({
    mutationFn: loadSampleVault,
    onSuccess: async () => {
      setSelectedNoteId(null);
      await queryClient.invalidateQueries({ queryKey: ["vault", "status"] });
      await queryClient.invalidateQueries({ queryKey: ["sampleVaultStatus"] });
      await queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
  const removeSample = useMutation({
    mutationFn: () => removeSampleVault(true),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sampleVaultStatus"] });
      await queryClient.invalidateQueries({ queryKey: ["vault", "status"] });
    },
  });

  if (vault.isLoading) {
    return (
      <main aria-label="Checking vault" className="vault-gate">
        <div aria-busy="true" className="vault-loading">
          <BrandLogo alt={APP_NAME} className="vault-loading-logo" height={56} width={168} />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-12 w-full max-w-lg" />
        </div>
      </main>
    );
  }

  if (vault.data?.open) return <Outlet />;

  const submit = (create: boolean) => {
    const folder = path.trim();
    if (!folder) {
      setValidation("Enter the full path to a folder.");
      return;
    }
    if (!isAbsolutePath(folder)) {
      setValidation("Enter an absolute folder path, such as C:\\Users\\you\\Notes.");
      return;
    }
    setValidation("");
    setCreateMode(create);
    operation.mutate({ folder, create });
  };

  const failed = operation.isError || vault.isError;
  const error = operation.error ?? vault.error;
  const recovery = vault.isError
    ? `The backend did not return vault status. Check that the ${APP_NAME} API is running, then retry the connection.`
    : recoveryMessage(operation.error, createMode);

  return (
    <main className="vault-gate">
      <section aria-labelledby="vault-title" className="vault-card">
        <BrandLogo alt={APP_NAME} className="vault-brand" height={80} width={240} />
        <span aria-hidden="true" className="vault-mark">
          <FolderOpen size={22} />
        </span>
        <p className="eyebrow">Your notes stay yours</p>
        <h1 className="vault-title" id="vault-title">
          Open a vault folder
        </h1>
        <p className="vault-description">
          {APP_NAME} works directly with Markdown files in a folder you control.
          Nothing is copied to a cloud service.
        </p>
        <label className="vault-path-label" htmlFor="vault-path">
          Folder path
        </label>
        <Input
          aria-describedby={validation ? "vault-validation" : undefined}
          aria-invalid={Boolean(validation)}
          autoComplete="off"
          id="vault-path"
          onChange={(event) => {
            setPath(event.target.value);
            setValidation("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit(false);
          }}
          placeholder="C:\Users\you\Documents\Notes"
          value={path}
        />
        {validation && (
          <p className="vault-validation" id="vault-validation" role="alert">
            {validation}
          </p>
        )}
        {failed && (
          <div className="vault-error" role="alert">
            <strong>{error instanceof Error ? error.message : "Could not connect to the vault."}</strong>
            <p>{recovery}</p>
            {vault.isError && (
              <Button
                onClick={() => void vault.refetch()}
                size="sm"
                variant="outline"
              >
                <RefreshCw aria-hidden="true" /> Retry connection
              </Button>
            )}
          </div>
        )}
        <div className="vault-actions">
          <Button
            disabled={operation.isPending}
            onClick={() => submit(false)}
            size="lg"
          >
            <FolderOpen aria-hidden="true" />
            Open folder
          </Button>
          <Button
            disabled={operation.isPending}
            onClick={() => submit(true)}
            size="lg"
            variant="outline"
          >
            <FolderPlus aria-hidden="true" />
            Create new vault
          </Button>
        </div>
        <div className="sample-vault-gate">
          <p>Want to explore a ready-made workspace first?</p>
          <Button
            disabled={sample.isPending || removeSample.isPending || operation.isPending}
            onClick={() => sample.mutate()}
            size="lg"
            variant="outline"
          >
            {sample.isPending ? "Loading sample vault…" : "Load sample vault"}
          </Button>
          {sample.isError ? (
            <p className="vault-error" role="alert">
              {sample.error.message} Your existing folders were not changed.
            </p>
          ) : null}
          {sampleStatus.isError ? (
            <p className="vault-error" role="alert">{sampleStatus.error.message}</p>
          ) : null}
          {removeSample.data ? (
            <p role="status">
              Removed {removeSample.data.removed} sample files; preserved {removeSample.data.preserved} other Markdown files.
            </p>
          ) : null}
          <small>The sample is copied to a dedicated folder; your own vault is left untouched.</small>
          <Button
            disabled={!sampleStatus.data?.loaded || sample.isPending || removeSample.isPending}
            onClick={() => {
              const count = sampleStatus.data?.note_count ?? 0;
              if (window.confirm(
                `Remove ${count} sample-marked Markdown files from the dedicated sample vault? ` +
                "Only listed sample files are removed; all other files and folders are kept.",
              )) {
                removeSample.mutate();
              }
            }}
            size="sm"
            variant="ghost"
          >
            Remove sample vault
          </Button>
          {!sampleStatus.data?.loaded ? (
            <small>A sample vault must be loaded before it can be removed.</small>
          ) : null}
          {removeSample.isError ? (
            <p className="vault-error" role="alert">{removeSample.error.message}</p>
          ) : null}
        </div>
        {operation.isPending && (
          <p aria-live="polite" className="vault-pending">
            Checking your folder…
          </p>
        )}
      </section>
    </main>
  );
}
