"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface Pipeline {
  pipeline_id: string;
  event_count: number;
  last_event: string;
}

function SdkSnippet({ apiKey }: { apiKey: string }) {
  const [copied, setCopied] = useState(false);

  const snippet = `from raibench import monitor

monitor.init(
    api_key="${apiKey}",
    pipeline="my-rag-bot",
    category="support-qa",
    api_url="https://raibench-api.fly.dev",
)

@monitor.trace(stage="retrieval", provider="pinecone")
async def search_docs(query: str):
    return await vector_db.search(query, top_k=5)

@monitor.trace(stage="generation", provider="openai", model="gpt-4o")
async def generate_answer(query: str, context: list):
    return await openai.chat.completions.create(...)`;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Quick Start</h3>
        <button
          onClick={() => {
            navigator.clipboard.writeText(snippet);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="text-xs px-3 py-1 bg-gray-800 text-gray-400 rounded hover:text-white transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-400 mb-2">1. Install the SDK</p>
        <code className="block bg-gray-950 text-green-400 px-4 py-2 rounded text-sm font-mono">
          pip install raibench
        </code>
      </div>

      <div>
        <p className="text-sm text-gray-400 mb-2">2. Add to your RAG pipeline</p>
        <pre className="bg-gray-950 text-gray-300 px-4 py-3 rounded text-sm font-mono overflow-x-auto whitespace-pre">
          {snippet}
        </pre>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-800">
        <p className="text-sm text-gray-400">
          Your API key:{" "}
          <code className="bg-gray-950 text-blue-400 px-2 py-0.5 rounded text-xs font-mono">
            {apiKey}
          </code>
        </p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [showSdk, setShowSdk] = useState(false);

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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Your Pipelines</h2>
        <button
          onClick={() => setShowSdk(!showSdk)}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
        >
          {showSdk ? "Hide Setup" : "SDK Setup"}
        </button>
      </div>

      {showSdk && <SdkSnippet apiKey={apiKey} />}

      {pipelines.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-lg text-gray-400">No events yet</p>
          <p className="text-gray-500 mt-2 mb-6">
            Install the SDK to start monitoring your AI pipelines
          </p>
          {!showSdk && (
            <button
              onClick={() => setShowSdk(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
            >
              Get Started
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 mt-4">
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
