"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface DataPoint { timestamp: string; p50_latency_ms: number | null; }

export function LatencyChart({ data }: { data: DataPoint[] }) {
  const formatted = data.map((d) => ({
    ...d,
    time: new Date(d.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));

  return (
    <div className="card border-electric/15 p-5">
      <h3 className="text-xs font-bold text-electric-soft uppercase tracking-wider mb-4">Latency (p50)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a3a" />
          <XAxis dataKey="time" stroke="#4a4570" fontSize={12} fontFamily="Inter" />
          <YAxis stroke="#4a4570" fontSize={12} fontFamily="Inter" unit="ms" />
          <Tooltip contentStyle={{ backgroundColor: "#111128", border: "1px solid #4d7cff", borderRadius: 12, fontFamily: "Inter", fontSize: 13 }} />
          <Line type="monotone" dataKey="p50_latency_ms" stroke="#7da1ff" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
