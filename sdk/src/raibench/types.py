from typing import Any, Dict, Optional

from pydantic import BaseModel


class Event(BaseModel):
    pipeline_id: str
    stage: str
    provider: Optional[str] = None
    model: Optional[str] = None
    latency_ms: int
    token_count: Optional[int] = None
    cost_cents: Optional[float] = None
    success: bool
    task_category: Optional[str] = None
    retrieval_chunks: Optional[int] = None
    retrieval_score_avg: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None
