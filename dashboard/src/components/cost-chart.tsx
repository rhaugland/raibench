"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface DataPoint { timestamp: string; total_cost_cents: number; }

export function CostChart({ data }: { data: DataPoint[] }) {
  const formatted = data.map((d) => ({
    ...d,
    time: new Date(d.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    cost: Number(d.total_cost_cents.toFixed(2)),
  }));

  return (
    <div className="card border-amber/15 p-5">
      <h3 className="text-xs font-bold text-amber uppercase tracking-wider mb-4">Cost (cents)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a3a" />
          <XAxis dataKey="time" stroke="#4a4570" fontSize={12} fontFamily="Inter" />
          <YAxis stroke="#4a4570" fontSize={12} fontFamily="Inter" />
          <Tooltip contentStyle={{ backgroundColor: "#111128", border: "1px solid #ffb020", borderRadius: 12, fontFamily: "Inter", fontSize: 13 }} />
          <Bar dataKey="cost" fill="#ffb020" radius={[6, 6, 0, 0]} fillOpacity={0.8} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
