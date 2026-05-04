interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  color?: "pink" | "mint" | "electric" | "amber";
}

export function MetricCard({ label, value, subtitle, color = "pink" }: MetricCardProps) {
  const borderClass = {
    pink: "border-pink/25",
    mint: "border-mint/25",
    electric: "border-electric/25",
    amber: "border-amber/25",
  }[color];

  const valueClass = {
    pink: "text-pink",
    mint: "text-mint",
    electric: "text-electric-soft",
    amber: "text-amber",
  }[color];

  return (
    <div className={`card ${borderClass} p-4`}>
      <p className="text-[11px] font-bold text-text-faint uppercase tracking-wider">{label}</p>
      <p className={`text-3xl font-black mt-1.5 tracking-tight ${valueClass}`}>{value}</p>
      {subtitle && <p className="text-xs text-text-faint mt-1">{subtitle}</p>}
    </div>
  );
}
