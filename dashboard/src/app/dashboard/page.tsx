"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { MetricCard } from "@/components/metric-card";

interface Pipeline {
  pipeline_id: string;
  event_count: number;
  last_event: string;
}

export default function DashboardPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("raibench_api_key");
    if (stored) {
      setApiKey(stored);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!apiKey) return;

    apiFetch<{ pipelines: Pipeline[] }>("/v1/pipelines", apiKey)
      .then((data) => setPipelines(data.pipelines))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiKey]);

  if (!apiKey) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <h2 className="text-xl font-bold mb-4">Connect your API key</h2>
        <input
          type="text"
          placeholder="Enter your RAI Bench API key"
          className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const val = (e.target as HTMLInputElement).value;
              localStorage.setItem("raibench_api_key", val);
              setApiKey(val);
            }
          }}
        />
        <p className="text-sm text-gray-500 mt-2">Press Enter to connect</p>
      </div>
    );
  }

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Your Pipelines</h2>

      {pipelines.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">No events yet</p>
          <p className="mt-2">Install the SDK and start sending telemetry</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {pipelines.map((p) => (
            <Link
              key={p.pipeline_id}
              href={`/dashboard/${p.pipeline_id}`}
              className="block bg-gray-900 border border-gray-800 rounded-lg p-6 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {p.pipeline_id}
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    {p.event_count.toLocaleString()} events
                  </p>
                </div>
                <p className="text-sm text-gray-500">
                  Last event: {new Date(p.last_event).toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
