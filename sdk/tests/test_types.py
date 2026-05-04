from raibench.types import Event


def test_event_creation_with_required_fields():
    event = Event(
        pipeline_id="support-bot",
        stage="generation",
        latency_ms=1240,
        success=True,
    )
    assert event.pipeline_id == "support-bot"
    assert event.stage == "generation"
    assert event.latency_ms == 1240
    assert event.success is True
    assert event.provider is None
    assert event.model is None
    assert event.token_count is None
    assert event.cost_cents is None
    assert event.task_category is None
    assert event.retrieval_chunks is None
    assert event.retrieval_score_avg is None


def test_event_creation_with_all_fields():
    event = Event(
        pipeline_id="legal-qa",
        stage="retrieval",
        provider="openai",
        model="text-embedding-3-large",
        latency_ms=320,
        token_count=1500,
        cost_cents=0.02,
        success=True,
        task_category="legal-qa",
        retrieval_chunks=5,
        retrieval_score_avg=0.82,
        metadata={"version": "2.1"},
    )
    assert event.provider == "openai"
    assert event.cost_cents == 0.02
    assert event.retrieval_chunks == 5
    assert event.metadata == {"version": "2.1"}


def test_event_serialization():
    event = Event(
        pipeline_id="support-bot",
        stage="generation",
        latency_ms=500,
        success=True,
    )
    data = event.model_dump(exclude_none=True)
    assert "pipeline_id" in data
    assert "provider" not in data
