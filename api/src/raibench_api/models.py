from typing import Any

from pydantic import BaseModel


class EventIn(BaseModel):
    pipeline_id: str
    stage: str
    provider: str | None = None
    model: str | None = None
    latency_ms: int
    token_count: int | None = None
    cost_cents: float | None = None
    success: bool
    task_category: str | None = None
    retrieval_chunks: int | None = None
    retrieval_score_avg: float | None = None
    metadata: dict[str, Any] | None = None


class IngestResponse(BaseModel):
    accepted: int


class AlertRuleIn(BaseModel):
    pipeline_id: str
    webhook_url: str
    channel: str = "slack"  # "slack" or "discord"
    metric: str  # "success_rate", "p50_latency_ms", "daily_cost_cents"
    operator: str = "lt"  # "lt" or "gt"
    threshold: float
