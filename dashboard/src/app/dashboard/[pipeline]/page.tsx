"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, apiDownload } from "@/lib/api";
import { MetricCard } from "@/components/metric-card";
import { LatencyChart } from "@/components/latency-chart";
import { SuccessRateChart } from "@/components/success-rate-chart";
import { CostChart } from "@/components/cost-chart";

interface Metrics {
  pipeline_id: string;
  total_events: number;
  success_rate: number;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  total_cost_cents: number;
  stages?: StageMetrics[];
}

interface StageMetrics {
  stage: string;
  total_events: number;
  success_rate: number;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  total_cost_cents: number;
}

interface Bucket {
  timestamp: string;
  event_count: number;
  success_rate: number;
  p50_latency_ms: number | null;
  total_cost_cents: number;
}

interface Suggestion {
  title: string;
  description: string;
  code?: string;
  impact: string;
  difficulty: "easy" | "medium" | "hard";
  category?: string;
}

export default function PipelineDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pipelineId = params.pipeline as string;
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [timeseries, setTimeseries] = useState<Bucket[]>([]);
  const [period, setPeriod] = useState("24h");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sugLoading, setSugLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const apiKey =
    typeof window !== "undefined"
      ? localStorage.getItem("raibench_api_key") || ""
      : "";

  const badgeUrl = `https://raibench-api.fly.dev/badge/${apiKey}/${pipelineId}`;

  useEffect(() => {
    if (!apiKey) return;

    apiFetch<Metrics>(
      `/v1/pipelines/${pipelineId}/metrics?period=${period}&group_by=stage`,
      apiKey,
    ).then(setMetrics);

    apiFetch<{ buckets: Bucket[] }>(
      `/v1/pipelines/${pipelineId}/timeseries?period=${period}&bucket=1h`,
      apiKey,
    ).then((data) => setTimeseries(data.buckets));
  }, [pipelineId, period, apiKey]);

  // Load AI suggestions once
  useEffect(() => {
    if (!apiKey || sugLoading || suggestions.length > 0) return;
    setSugLoading(true);
    apiFetch<{ suggestions: Suggestion[] }>(
      `/v1/pipelines/${pipelineId}/suggestions`,
      apiKey,
    )
      .then((d) => setSuggestions(d.suggestions))
      .catch(() => {})
      .finally(() => setSugLoading(false));
  }, [apiKey, pipelineId, sugLoading, suggestions.length]);

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const diffStyle: Record<string, string> = {
    easy: "bg-mint/10 text-mint border-mint/20",
    medium: "bg-amber/10 text-amber border-amber/20",
    hard: "bg-coral/10 text-coral border-coral/20",
  };

  if (!metrics) {
    return <div className="h-40 card animate-shimmer rounded-2xl mt-10 max-w-lg mx-auto" />;
  }

  const stageColors: Record<string, "pink" | "electric" | "mint" | "amber"> = {
    retrieval: "electric",
    generation: "pink",
    embedding: "lavender" as "pink",
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-text-faint hover:text-pink transition-colors text-sm font-bold"
          >
            &larr; Back
          </button>
          <div>
            <h2 className="text-2xl font-black text-text-bright">{pipelineId}</h2>
            <p className="text-text-faint text-xs">
              {metrics.total_events.toLocaleString()} events &middot; {period} window
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {["1h", "24h", "7d", "30d"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-xs font-bold px-4 py-2 rounded-lg transition-all ${
                period === p
                  ? "bg-pink/15 text-pink border border-pink/30"
                  : "text-text-faint border border-border-subtle hover:text-pink hover:border-pink/20"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Overall metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <MetricCard label="Events" value={metrics.total_events.toLocaleString()} color="pink" />
        <MetricCard
          label="Success Rate"
          value={`${Math.round(metrics.success_rate * 100)}%`}
          color="mint"
        />
        <MetricCard
          label="p50 Latency"
          value={metrics.p50_latency_ms ? `${metrics.p50_latency_ms}ms` : "\u2014"}
          color="electric"
        />
        <MetricCard
          label="p95 Latency"
          value={metrics.p95_latency_ms ? `${metrics.p95_latency_ms}ms` : "\u2014"}
          color="electric"
        />
        <MetricCard
          label="Total Cost"
          value={`$${(metrics.total_cost_cents / 100).toFixed(2)}`}
          color="amber"
        />
      </div>

      {/* Stage breakdown */}
      {metrics.stages && metrics.stages.length > 1 && (
        <div className="mb-8">
          <h3 className="text-sm font-black text-text-bright uppercase tracking-wider mb-4">
            By Stage
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {metrics.stages.map((s) => {
              const color = stageColors[s.stage] || "pink";
              return (
                <div key={s.stage} className={`card border-${color}/20 p-5`}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`pill bg-${color}/10 text-${color} border-${color}/20 text-[9px]`}>
                      {s.stage}
                    </span>
                    <span className="text-text-faint text-xs">
                      {s.total_events.toLocaleString()} events
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-[10px] text-text-faint uppercase">Hit%</p>
                      <p className={`text-lg font-black ${s.success_rate >= 0.95 ? "text-mint" : s.success_rate >= 0.8 ? "text-amber" : "text-coral"}`}>
                        {Math.round(s.success_rate * 100)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-text-faint uppercase">p50</p>
                      <p className="text-lg font-black text-electric-soft">
                        {s.p50_latency_ms ? `${s.p50_latency_ms}ms` : "\u2014"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-text-faint uppercase">Cost</p>
                      <p className="text-lg font-black text-amber">
                        ${(s.total_cost_cents / 100).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 mb-10">
        <SuccessRateChart data={timeseries} />
        <LatencyChart data={timeseries} />
        <CostChart data={timeseries} />
      </div>

      {/* Error Drill-Down */}
      <ErrorDrilldown pipelineId={pipelineId} apiKey={apiKey} successRate={metrics.success_rate} />

      {/* AI Suggestions */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-sm font-black text-text-bright uppercase tracking-wider">
            AI Power-Ups
          </h3>
          {suggestions.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-pink uppercase tracking-wider">AI-Powered</span>
              <span className="w-1.5 h-1.5 rounded-full bg-pink animate-pulse-soft" />
            </span>
          )}
        </div>
        {sugLoading ? (
          <div className="flex items-center gap-3 p-4 card-inset rounded-xl">
            <div className="w-4 h-4 border-2 border-pink/40 border-t-pink rounded-full animate-spin" />
            <p className="text-xs text-text-muted">AI is analyzing this pipeline...</p>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="card border-border-subtle p-6 text-center">
            <p className="text-text-faint text-sm">No suggestions available yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suggestions.map((tip, i) => (
              <div key={i} className="card border-pink/15 p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h4 className="text-sm font-bold text-pink-soft">{tip.title}</h4>
                  <span className={`pill ${diffStyle[tip.difficulty] || ""} text-[9px] shrink-0`}>
                    {tip.difficulty}
                  </span>
                </div>
                <p className="text-text-muted text-sm leading-relaxed mb-2">
                  {tip.description}
                </p>
                {tip.code && (
                  <div className="relative mt-3">
                    <button
                      onClick={() => copy(tip.code!, `sug-${i}`)}
                      className="absolute top-2 right-2 text-[10px] font-bold text-pink hover:opacity-70"
                    >
                      {copied === `sug-${i}` ? "Copied!" : "Copy"}
                    </button>
                    <pre className="card-inset p-3 text-xs font-mono text-text-muted overflow-x-auto whitespace-pre">
                      {tip.code}
                    </pre>
                  </div>
                )}
                <p className="text-xs mt-3">
                  <span className="font-bold text-pink">Impact:</span>{" "}
                  <span className="text-text-normal">{tip.impact}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Export */}
      <div className="card border-border-subtle p-5 mb-6">
        <h3 className="text-sm font-black text-text-bright uppercase tracking-wider mb-3">
          Export Data
        </h3>
        <p className="text-text-muted text-sm mb-4">Download events for this pipeline.</p>
        <div className="flex gap-3">
          <button
            onClick={() => apiDownload(`/v1/pipelines/${pipelineId}/export?format=json`, apiKey, `${pipelineId}-events.json`)}
            className="btn btn-pink text-xs px-5 py-2.5"
          >
            Export JSON
          </button>
          <button
            onClick={() => apiDownload(`/v1/pipelines/${pipelineId}/export?format=csv`, apiKey, `${pipelineId}-events.csv`)}
            className="btn text-xs px-5 py-2.5 border-border-subtle text-text-muted hover:text-pink hover:border-pink/30 transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Badge embed */}
      <div className="card border-border-subtle p-5">
        <h3 className="text-sm font-black text-text-bright uppercase tracking-wider mb-3">
          Embed Badge
        </h3>
        <div className="flex items-center gap-4 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${badgeUrl}?metric=status`} alt="status" height={20} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${badgeUrl}?metric=success_rate`} alt="success" height={20} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${badgeUrl}?metric=latency`} alt="latency" height={20} />
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 card-inset text-text-muted px-3 py-2 text-xs font-mono overflow-x-auto">
            {`![${pipelineId} status](${badgeUrl}?metric=status)`}
          </code>
          <button
            onClick={() => copy(`![${pipelineId} status](${badgeUrl}?metric=status)`, "badge")}
            className="btn btn-pink text-[10px] px-3 shrink-0"
          >
            {copied === "badge" ? "Done!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── ERROR DRILL-DOWN ─── */

interface ErrorEvent {
  stage: string;
  provider: string | null;
  model: string | null;
  latency_ms: number;
  error: string;
  created_at: string;
}

function ErrorDrilldown({ pipelineId, apiKey, successRate }: { pipelineId: string; apiKey: string; successRate: number }) {
  const [errors, setErrors] = useState<ErrorEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    apiFetch<{ errors: ErrorEvent[] }>(`/v1/pipelines/${pipelineId}/errors?limit=30`, apiKey)
      .then((d) => setErrors(d.errors))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pipelineId, apiKey]);

  if (loading) return null;
  if (!errors.length) return null;

  // Group by error type
  const grouped: Record<string, { count: number; latest: string; sample: ErrorEvent }> = {};
  for (const e of errors) {
    const key = e.error.slice(0, 80);
    if (!grouped[key]) grouped[key] = { count: 0, latest: e.created_at, sample: e };
    grouped[key].count++;
  }
  const sorted = Object.entries(grouped).sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-black text-text-bright uppercase tracking-wider">
            Recent Errors
          </h3>
          <span className="pill bg-coral/10 text-coral border-coral/20 text-[9px]">
            {errors.length} failures
          </span>
        </div>
        {sorted.length > 3 && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs font-bold text-text-faint hover:text-pink transition-colors">
            {expanded ? "Show less" : `Show all ${sorted.length}`}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {(expanded ? sorted : sorted.slice(0, 3)).map(([key, { count, latest, sample }]) => (
          <div key={key} className="card border-coral/15 bg-coral/[0.02] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-mono text-coral truncate">{key}</p>
                <p className="text-xs text-text-faint mt-1">
                  {sample.provider && <span className="text-text-muted">{sample.provider}</span>}
                  {sample.model && <span className="text-text-muted"> / {sample.model}</span>}
                  {" · "}{sample.stage} · {sample.latency_ms}ms
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-black text-coral">{count}x</p>
                <p className="text-[10px] text-text-faint">{_timeAgo(latest)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function _timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}
