"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface DataPoint { timestamp: string; success_rate: number; }

export function SuccessRateChart({ data }: { data: DataPoint[] }) {
  const formatted = data.map((d) => ({
    ...d,
    time: new Date(d.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    success_pct: Math.round(d.success_rate * 100),
  }));

  return (
    <div className="card border-mint/15 p-5">
      <h3 className="text-xs font-bold text-mint uppercase tracking-wider mb-4">Success Rate</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a3a" />
          <XAxis dataKey="time" stroke="#4a4570" fontSize={12} fontFamily="Inter" />
          <YAxis stroke="#4a4570" fontSize={12} fontFamily="Inter" unit="%" domain={[0, 100]} />
          <Tooltip contentStyle={{ backgroundColor: "#111128", border: "1px solid #3be8b0", borderRadius: 12, fontFamily: "Inter", fontSize: 13 }} />
          <Area type="monotone" dataKey="success_pct" stroke="#3be8b0" fill="rgba(59, 232, 176, 0.08)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
