"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
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
}

interface Bucket {
  timestamp: string;
  event_count: number;
  success_rate: number;
  p50_latency_ms: number | null;
  total_cost_cents: number;
}

export default function PipelineDetailPage() {
  const params = useParams();
  const pipelineId = params.pipeline as string;
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [timeseries, setTimeseries] = useState<Bucket[]>([]);
  const [period, setPeriod] = useState("24h");

  const apiKey =
    typeof window !== "undefined"
      ? localStorage.getItem("raibench_api_key") || ""
      : "";

  useEffect(() => {
    if (!apiKey) return;

    apiFetch<Metrics>(
      `/v1/pipelines/${pipelineId}/metrics?period=${period}`,
      apiKey
    ).then(setMetrics);

    apiFetch<{ buckets: Bucket[] }>(
      `/v1/pipelines/${pipelineId}/timeseries?period=${period}&bucket=1h`,
      apiKey
    ).then((data) => setTimeseries(data.buckets));
  }, [pipelineId, period, apiKey]);

  if (!metrics) return <p className="text-gray-400">Loading...</p>;

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard" className="text-gray-400 hover:text-white">
          &larr; Back
        </Link>
        <h2 className="text-2xl font-bold">{pipelineId}</h2>
        <div className="ml-auto flex gap-2">
          {["1h", "24h", "7d", "30d"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded text-sm ${
                period === p
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard label="Total Events" value={metrics.total_events.toLocaleString()} />
        <MetricCard
          label="Success Rate"
          value={`${Math.round(metrics.success_rate * 100)}%`}
        />
        <MetricCard
          label="p50 Latency"
          value={metrics.p50_latency_ms ? `${metrics.p50_latency_ms}ms` : "\u2014"}
        />
        <MetricCard
          label="Total Cost"
          value={`$${(metrics.total_cost_cents / 100).toFixed(2)}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <SuccessRateChart data={timeseries} />
        <LatencyChart data={timeseries} />
        <CostChart data={timeseries} />
      </div>
    </div>
  );
}
