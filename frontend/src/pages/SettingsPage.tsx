import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, LoaderCircle, PlugZap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { BrandLogo } from "@/components/BrandLogo";
import { SampleVaultSettings } from "@/components/SampleVaultSettings";
import { getAISettings, saveAISettings, testAIConnection } from "@/services/ai";
import type { AIHealth, AISettings } from "@/services/ai";
import { APP_NAME, APP_VERSION } from "@/lib/brand";

const initialSettings: Omit<AISettings, "provider"> = {
  ollama_url: "http://127.0.0.1:11434",
  chat_model: "",
  embedding_model: "",
  timeout_seconds: 120,
  demo_mode: false,
};

function ConnectionReport({ health }: { health: AIHealth }) {
  const modelStatus = (available: boolean, model: string) => {
    if (!model) return "Not configured. Enter a model name in Settings.";
    if (!health.reachable) return `Could not check “${model}” until Ollama is reachable.`;
    return available ? `“${model}” is installed.` : `Not found. Run: ollama pull ${model}`;
  };

  return (
    <section aria-live="polite" className={`ai-connection-report${health.mock ? " is-demo" : ""}`}>
      <div className="ai-report-heading">
        {health.reachable ? <Check aria-hidden="true" size={17} /> : <CircleAlert aria-hidden="true" size={17} />}
        <strong>
          {health.mock
            ? "Demo Mode is active. Responses are deterministic mock data."
            : health.reachable
              ? "Ollama is reachable."
              : "Ollama is not reachable."}
        </strong>
      </div>
      {health.mock ? (
        <p>Turn off Demo Mode to test your local Ollama installation.</p>
      ) : (
        <>
          <p>{health.error ?? "Connection checked against the configured Ollama URL."}</p>
          <ul>
            <li>Chat model: {modelStatus(health.chat_model_present, health.chat_model)}</li>
            <li>Embedding model: {modelStatus(health.embedding_model_present, health.embedding_model)}</li>
          </ul>
          {!health.reachable ? <p>Start Ollama, then check the URL and try again.</p> : null}
        </>
      )}
    </section>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["aiSettings"], queryFn: getAISettings });
  const [form, setForm] = useState(initialSettings);
  const [report, setReport] = useState<AIHealth | null>(null);
  const [connectionError, setConnectionError] = useState("");
  useEffect(() => {
    const settings = settingsQuery.data;
    if (settings) {
      setForm({
        ollama_url: settings.ollama_url,
        chat_model: settings.chat_model,
        embedding_model: settings.embedding_model,
        timeout_seconds: settings.timeout_seconds,
        demo_mode: settings.demo_mode,
      });
    }
  }, [settingsQuery.data]);

  const save = useMutation({
    mutationFn: saveAISettings,
    onSuccess: async (settings) => {
      setForm({
        ollama_url: settings.ollama_url,
        chat_model: settings.chat_model,
        embedding_model: settings.embedding_model,
        timeout_seconds: settings.timeout_seconds,
        demo_mode: settings.demo_mode,
      });
      await queryClient.invalidateQueries({ queryKey: ["aiSettings"] });
      await queryClient.invalidateQueries({ queryKey: ["aiHealth"] });
      setReport(null);
      toast.add({ title: "AI settings saved", type: "success" });
    },
  });
  const test = useMutation({
    mutationFn: async () => {
      await save.mutateAsync(form);
      return testAIConnection();
    },
    onSuccess: (health) => {
      setReport(health);
      setConnectionError("");
    },
    onError: (error: Error) => {
      setReport(null);
      setConnectionError(error.message);
    },
  });
  const setField = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [field]: value }));

  return (
    <div className="settings-page">
      <header className="settings-intro">
        <p className="eyebrow">Private by default</p>
        <h1>Local AI settings</h1>
        <p>AI is optional. Notes, search, explicit links, and the graph work without it.</p>
        <p className="ai-recovery-guidance">
          For a local connection, start Ollama and use <code>ollama list</code> to check installed models.
          The default address is <code>http://127.0.0.1:11434</code>.
        </p>
      </header>
      <section aria-labelledby="ai-provider-title" className="ai-settings-card">
        <div className="ai-settings-heading">
          <span className="ai-settings-icon"><PlugZap aria-hidden="true" size={18} /></span>
          <div>
            <h2 id="ai-provider-title">Provider</h2>
            <p>Connect to your own Ollama server, or use clearly labeled demo responses.</p>
            <p className="ai-provider-active">
              Active provider: <strong>{form.demo_mode ? "Demo Mode (mock)" : "Ollama"}</strong>
            </p>
          </div>
        </div>
        {settingsQuery.isError ? (
          <div className="ai-settings-error" role="alert">
            <p>{settingsQuery.error.message} Current settings could not be loaded.</p>
            <Button onClick={() => void settingsQuery.refetch()} size="sm" variant="outline">Retry loading settings</Button>
          </div>
        ) : null}
        {settingsQuery.isLoading ? (
          <div aria-busy="true" className="ai-settings-loading" role="status">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}
        <label className="ai-demo-switch">
          <input
            checked={form.demo_mode}
            onChange={(event) => setField("demo_mode", event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>Demo Mode (MockProvider)</strong>
            <small>Explicitly switch to deterministic mock responses. They are always labeled as mock.</small>
          </span>
        </label>
        <div className="ai-settings-fields">
          <label>
            Ollama URL
            <Input
              disabled={form.demo_mode || settingsQuery.isLoading || settingsQuery.isError}
              onChange={(event) => setField("ollama_url", event.target.value)}
              placeholder="http://127.0.0.1:11434"
              value={form.ollama_url}
            />
          </label>
          <label>
            Chat model
            <Input
              disabled={form.demo_mode || settingsQuery.isLoading || settingsQuery.isError}
              onChange={(event) => setField("chat_model", event.target.value)}
              placeholder="ollama pull <model>"
              value={form.chat_model}
            />
          </label>
          <label>
            Embedding model
            <Input
              disabled={form.demo_mode || settingsQuery.isLoading || settingsQuery.isError}
              onChange={(event) => setField("embedding_model", event.target.value)}
              placeholder="ollama pull <model>"
              value={form.embedding_model}
            />
          </label>
          <label>
            Request timeout (seconds)
            <Input
              disabled={form.demo_mode || settingsQuery.isLoading || settingsQuery.isError}
              max="120"
              min="0.1"
              onChange={(event) => setField("timeout_seconds", Number(event.target.value))}
              step="0.5"
              type="number"
              value={form.timeout_seconds}
            />
          </label>
        </div>
        {save.isError ? <p className="ai-form-error" role="alert">{save.error.message}</p> : null}
        <div className="ai-settings-actions">
          <Button
            disabled={save.isPending || settingsQuery.isLoading || settingsQuery.isError}
            onClick={() => save.mutate(form)}
            variant="default"
          >
            {save.isPending ? <LoaderCircle aria-hidden="true" className="ai-spinner" size={15} /> : null}
            Save settings
          </Button>
          <Button
            disabled={test.isPending || save.isPending || settingsQuery.isLoading || settingsQuery.isError}
            onClick={() => {
              setConnectionError("");
              test.mutate();
            }}
            variant="outline"
          >
            {test.isPending ? <LoaderCircle aria-hidden="true" className="ai-spinner" size={15} /> : null}
            Test connection
          </Button>
        </div>
        {connectionError ? <p className="ai-form-error" role="alert">{connectionError}</p> : null}
        {report ? <ConnectionReport health={report} /> : null}
      </section>
      <p className="ai-privacy-note" id="privacy">
        {APP_NAME} runs locally by default. AI requests send only the note or retrieved passages needed for the action you start.
      </p>
      <section aria-label={`About ${APP_NAME}`} className="about-card">
        <BrandLogo alt={APP_NAME} height={32} width={96} />
        <div className="about-copy">
          <h2>{APP_NAME}</h2>
          <p>Version {APP_VERSION}</p>
          <a href="#privacy">Privacy statement</a>
        </div>
      </section>
      <SampleVaultSettings />
    </div>
  );
}
