# We Instrumented Our RAG Pipeline. Here's What We Learned.

*3 lines of code. 5 minutes of setup. Months of assumptions shattered.*

---

Every team building with AI has the same conversation at some point: "Is our RAG pipeline actually good, or are we just vibes-checking it?"

We had that conversation. Then we built a tool to answer it.

## The Setup

We wrapped our production RAG pipeline with a lightweight SDK that captures metadata on every call: latency, success/failure, cost, and which components were used. No prompt content. No user data. Just the operational telemetry.

```python
from raibench import monitor

monitor.init(api_key="...", pipeline="support-bot", category="support-qa")

@monitor.trace(stage="retrieval", provider="pinecone")
async def search_docs(query: str):
    return await vector_db.search(query, top_k=5)

@monitor.trace(stage="generation", provider="openai", model="gpt-4o")
async def generate_answer(query: str, context: list):
    return await openai.chat.completions.create(...)
```

That's it. Three decorators and we had a live dashboard within minutes.

## What We Found (Week 1)

### 1. Our retrieval was the bottleneck, not the LLM

We assumed generation was the slow part. We were wrong.

| Stage | p50 Latency | p95 Latency | % of Total Time |
|-------|------------|------------|-----------------|
| Retrieval | 340ms | 890ms | 62% |
| Reranking | 85ms | 210ms | 15% |
| Generation | 120ms | 380ms | 23% |

Retrieval accounted for 62% of our total pipeline latency at p50. We'd been optimizing prompts for weeks when the real win was in our vector search configuration.

### 2. 8% of our calls were silently failing

Our success rate wasn't 99% like we assumed. It was 92%.

The failures weren't throwing exceptions. The LLM was returning responses, but they were hallucinated nonsense triggered by poor retrieval results. We only caught this because we added custom failure signals:

```python
@monitor.trace(stage="generation")
async def answer(query, context):
    result = await generate(query, context)
    if result.confidence < 0.6:
        monitor.mark_failure(reason="low_confidence")
    return result
```

Without instrumentation, those 8% of users were getting bad answers and we had no idea.

### 3. Cost varied 4x by query category

Not all queries are created equal. Our support bot handles everything from "how do I reset my password" to "explain the difference between plan tiers in detail."

| Query Category | Avg Tokens | Avg Cost | Success Rate |
|---------------|-----------|---------|-------------|
| Password/Auth | 1,200 | $0.003 | 98% |
| Billing Questions | 2,800 | $0.008 | 94% |
| Feature Comparison | 4,500 | $0.014 | 85% |
| Integration Help | 6,200 | $0.019 | 78% |

Integration help queries cost 6x more than password queries and succeed 20% less often. This told us exactly where to focus our RAG improvements.

### 4. Our Monday morning regression

Success rate dropped to 84% every Monday between 9-11am. After two weeks of data, the pattern was obvious on the dashboard.

The cause? A content team was publishing new help articles every Monday morning. Our vector index was stale until the daily re-index job ran at noon. Between 9am and noon, the retrieval was pulling outdated chunks for topics that had been rewritten.

We moved the re-index to 8am. Monday success rate went back to 95%.

## The Uncomfortable Truth

We'd been building AI features for months based on gut feel and cherry-picked examples. We tested with a handful of queries we knew worked well and assumed production was similar.

It wasn't.

Production is messy. Real queries are weird. Edge cases aren't edge cases when you have thousands of users. The only way to know if your AI feature works is to measure it in production, continuously, across every call.

## What We're Building

This experience convinced us that every team building with AI needs production intelligence, not just observability.

**RAI Bench** is the tool we built for ourselves and are now opening up:

- **Lightweight SDK** that wraps your AI calls in 3 lines of code
- **Personal dashboard** with success rates, latency percentiles, cost tracking, and regression alerts
- **Community benchmarks** (coming soon) that show how your stack compares to what's actually working in production across hundreds of deployments

The SDK is open-source. The personal dashboard is free. We believe that making real production data accessible will do for AI applications what Hugging Face did for models: give everyone access to what actually works.

## Try It

```bash
pip install raibench
```

Add three lines to your RAG pipeline. See your real performance in five minutes.

If you're building with AI and you're not measuring production performance, you're flying blind. We were too. Now we're not.

---

*RAI Bench is in early access. [Sign up](https://raibench.dev) to get your API key and join the community of developers who care about AI that actually works.*
