"""Public SVG badges for pipeline health — embeddable in READMEs."""

from __future__ import annotations


def generate_badge(label: str, value: str, color: str) -> str:
    """Generate a shields.io-style SVG badge."""
    label_width = len(label) * 6.5 + 12
    value_width = len(value) * 6.5 + 12
    total_width = label_width + value_width

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{total_width}" height="20" role="img">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="{total_width}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="{label_width}" height="20" fill="#555"/>
    <rect x="{label_width}" width="{value_width}" height="20" fill="{color}"/>
    <rect width="{total_width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="{label_width/2}" y="14">{label}</text>
    <text x="{label_width + value_width/2}" y="14">{value}</text>
  </g>
</svg>"""


def success_rate_badge(pipeline_id: str, rate: float | None) -> str:
    if rate is None:
        return generate_badge(pipeline_id, "no data", "#9f9f9f")
    pct = f"{rate * 100:.0f}%"
    if rate >= 0.95:
        color = "#4cc71e"  # green
    elif rate >= 0.85:
        color = "#dfb317"  # yellow
    else:
        color = "#e05d44"  # red
    return generate_badge(pipeline_id, pct, color)


def latency_badge(pipeline_id: str, p50_ms: int | None) -> str:
    if p50_ms is None:
        return generate_badge(pipeline_id, "no data", "#9f9f9f")
    val = f"{p50_ms}ms"
    if p50_ms <= 500:
        color = "#4cc71e"
    elif p50_ms <= 2000:
        color = "#dfb317"
    else:
        color = "#e05d44"
    return generate_badge(pipeline_id, val, color)


def status_badge(pipeline_id: str, rate: float | None) -> str:
    if rate is None:
        return generate_badge(pipeline_id, "unknown", "#9f9f9f")
    if rate >= 0.95:
        return generate_badge(pipeline_id, "healthy", "#4cc71e")
    elif rate >= 0.85:
        return generate_badge(pipeline_id, "degraded", "#dfb317")
    else:
        return generate_badge(pipeline_id, "failing", "#e05d44")
