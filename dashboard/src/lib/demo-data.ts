// Realistic demo data for RAIRCADE — no API key needed

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

export const DEMO_PIPELINES = [
  { pipeline_id: "support-bot", event_count: 12_847, last_event: hoursAgo(0.5) },
  { pipeline_id: "legal-qa", event_count: 3_291, last_event: hoursAgo(2) },
  { pipeline_id: "product-search", event_count: 8_503, last_event: hoursAgo(1) },
  { pipeline_id: "code-reviewer", event_count: 1_764, last_event: hoursAgo(6) },
];

export const DEMO_METRICS: Record<string, {
  pipeline_id: string;
  total_events: number;
  success_rate: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  total_cost_cents: number;
}> = {
  "support-bot": {
    pipeline_id: "support-bot",
    total_events: 12_847,
    success_rate: 0.974,
    p50_latency_ms: 420,
    p95_latency_ms: 1_180,
    total_cost_cents: 3_841,
  },
  "legal-qa": {
    pipeline_id: "legal-qa",
    total_events: 3_291,
    success_rate: 0.891,
    p50_latency_ms: 2_340,
    p95_latency_ms: 5_600,
    total_cost_cents: 4_927,
  },
  "product-search": {
    pipeline_id: "product-search",
    total_events: 8_503,
    success_rate: 0.962,
    p50_latency_ms: 180,
    p95_latency_ms: 450,
    total_cost_cents: 1_275,
  },
  "code-reviewer": {
    pipeline_id: "code-reviewer",
    total_events: 1_764,
    success_rate: 0.847,
    p50_latency_ms: 3_800,
    p95_latency_ms: 8_200,
    total_cost_cents: 7_056,
  },
};

function generateTimeseries(
  baseSuccess: number,
  baseLatency: number,
  baseCost: number,
  baseEvents: number,
): { timestamp: string; event_count: number; success_rate: number; p50_latency_ms: number; total_cost_cents: number }[] {
  const buckets = [];
  for (let i = 23; i >= 0; i--) {
    const jitter = () => (Math.random() - 0.5) * 0.08;
    const eventJitter = Math.round(baseEvents * (0.6 + Math.random() * 0.8));
    buckets.push({
      timestamp: hoursAgo(i),
      event_count: eventJitter,
      success_rate: Math.min(1, Math.max(0.5, baseSuccess + jitter())),
      p50_latency_ms: Math.round(baseLatency * (0.7 + Math.random() * 0.6)),
      total_cost_cents: Math.round(baseCost * (0.6 + Math.random() * 0.8) * 100) / 100,
    });
  }
  return buckets;
}

export const DEMO_TIMESERIES: Record<string, ReturnType<typeof generateTimeseries>> = {
  "support-bot": generateTimeseries(0.974, 420, 12.8, 535),
  "legal-qa": generateTimeseries(0.891, 2340, 62.5, 137),
  "product-search": generateTimeseries(0.962, 180, 6.3, 354),
  "code-reviewer": generateTimeseries(0.847, 3800, 167, 74),
};
