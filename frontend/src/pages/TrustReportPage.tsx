import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandLogo } from "@/components/BrandLogo";
import { APP_NAME } from "@/lib/brand";
import { useEffect } from "react";
import { getTrustReport } from "@/services/api";
import type { TrustMetric } from "@/services/api";

const metricDefinitions = [
  {
    key: "raw_quote_fabrication",
    title: "Raw quote fabrication",
    explanation: "Generated extraction quotes that did not match their source note, before the verifier discarded them.",
  },
  {
    key: "post_verification_citation_validity",
    title: "Verified citation validity",
    explanation: "Citations displayed after verification that still match their source. Invalid quotes are excluded before this stage.",
  },
  {
    key: "relationship_precision",
    title: "Relationship precision",
    explanation: "Predicted typed relationships that match the hand-labeled relation set.",
  },
  {
    key: "relationship_recall",
    title: "Relationship recall",
    explanation: "Hand-labeled relations found among the generated proposals.",
  },
  {
    key: "ask_retrieval_hit_at_k",
    title: "Ask retrieval hit@k",
    explanation: "Answerable questions whose expected supporting notes appeared in the top retrieved results.",
  },
  {
    key: "unanswerable_question_honesty",
    title: "Unanswerable-question honesty",
    explanation: "Questions with no labeled support for which Ask returned its explicit no-evidence response.",
  },
] as const;

function percentage(metric: TrustMetric): string {
  if (metric.rate === null) return "Not measured";
  return `${(metric.rate * 100).toFixed(1)}%`;
}

export function TrustReportPage() {
  const query = useQuery({ queryKey: ["trustReport"], queryFn: getTrustReport, retry: false });
  const report = query.data?.report;
  useEffect(() => {
    document.title = `Trust Report · ${APP_NAME}`;
  }, []);

  return (
    <main className="trust-report-page">
      <header className="trust-report-header">
        <Link className="trust-back-link" to="/settings">Settings</Link>
        <BrandLogo alt={APP_NAME} className="trust-brand-logo" height={24} width={72} />
        <p className="eyebrow">Measured, not promised</p>
        <h1>Trust Report</h1>
        <p>Evaluation results from the labeled {APP_NAME} evaluation vault.</p>
      </header>
      {query.isLoading ? (
        <div aria-busy="true" className="trust-loading" role="status">
          <Skeleton className="h-28 w-full" />
          <div className="trust-loading-grid">
            {Array.from({ length: 6 }, (_, index) => <Skeleton className="h-44 w-full" key={index} />)}
          </div>
        </div>
      ) : null}
      {query.isError ? (
        <div className="trust-empty-state" role="alert">
          <p>{query.error.message}</p>
          <Button onClick={() => void query.refetch()} variant="outline">
            <RefreshCw aria-hidden="true" size={15} /> Retry
          </Button>
        </div>
      ) : null}
      {!query.isLoading && !query.isError && !query.data?.available ? (
        <section className="trust-empty-state">
          <span className="trust-icon"><Activity aria-hidden="true" size={22} /></span>
          <h2>No evaluation report yet</h2>
          <p>Run the labeled evaluation suite to measure extraction, relationships, and grounded answers.</p>
          <code>npm run eval</code>
        </section>
      ) : null}
      {report ? (
        <>
          <section aria-label="Evaluation run" className="trust-run-summary">
            <div>
              <span>Run date</span>
              <strong>{new Date(report.date).toLocaleString()}</strong>
            </div>
            <div>
              <span>Provider</span>
              <strong>{report.mock ? "MockProvider (mock results)" : report.config.provider}</strong>
            </div>
            <div>
              <span>Model</span>
              <strong>{report.config.model || "Not configured"}</strong>
            </div>
            <div>
              <span>Embedding model</span>
              <strong>{report.config.embedding_model || "Not configured"}</strong>
            </div>
            <div>
              <span>Timeout</span>
              <strong>{report.config.timeout_seconds} seconds</strong>
            </div>
            {report.config.ollama_host ? (
              <div><span>Ollama host</span><strong>{report.config.ollama_host}</strong></div>
            ) : null}
          </section>
          {report.mock ? (
            <p className="trust-mock-banner">These are deterministic MockProvider results, not evidence of real-model performance.</p>
          ) : null}
          {report.status === "failed" ? (
            <section className="trust-empty-state" role="alert">
              <h2>Evaluation did not complete</h2>
              <p>{report.error ?? "The provider reported an evaluation error."}</p>
              <code>npm run eval</code>
            </section>
          ) : report.metrics ? (
            <section aria-label="Evaluation metrics" className="trust-metrics">
              {metricDefinitions.map(({ key, title, explanation }) => {
                const metric = report.metrics?.[key];
                if (!metric) return null;
                const label = key === "ask_retrieval_hit_at_k" && "k" in metric
                  ? `${title} (k=${metric.k})`
                  : title;
                return (
                  <article className="trust-metric-card" key={key}>
                    <div className="trust-metric-heading">
                      <ShieldCheck aria-hidden="true" size={17} />
                      <h2>{label}</h2>
                    </div>
                    <strong className="trust-metric-value">{percentage(metric)}</strong>
                    <p>{explanation}</p>
                    <small>{metric.numerator} / {metric.denominator} measured cases</small>
                    <small>Exact rate value: {metric.rate ?? "not measured"}</small>
                  </article>
                );
              })}
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
