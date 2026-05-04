"""Alert rules: webhook dispatch to Slack/Discord when thresholds are crossed."""

from __future__ import annotations

import json
from typing import Any

import httpx

from raibench_api.db import get_pool


async def get_alert_rules(user_id: str, pipeline_id: str | None = None) -> list[dict]:
    pool = await get_pool()
    if pipeline_id:
        rows = await pool.fetch(
            "SELECT * FROM alert_rules WHERE user_id = $1 AND pipeline_id = $2 ORDER BY created_at",
            user_id, pipeline_id,
        )
    else:
        rows = await pool.fetch(
            "SELECT * FROM alert_rules WHERE user_id = $1 ORDER BY created_at",
            user_id,
        )
    return [dict(r) for r in rows]


async def create_alert_rule(
    user_id: str,
    pipeline_id: str,
    webhook_url: str,
    channel: str,
    metric: str,
    operator: str,
    threshold: float,
) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO alert_rules (user_id, pipeline_id, webhook_url, channel, metric, operator, threshold)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        """,
        user_id, pipeline_id, webhook_url, channel, metric, operator, threshold,
    )
    return dict(row)


async def delete_alert_rule(user_id: str, rule_id: str) -> bool:
    pool = await get_pool()
    result = await pool.execute(
        "DELETE FROM alert_rules WHERE id = $1::uuid AND user_id = $2",
        rule_id, user_id,
    )
    return "DELETE 1" in result


async def check_and_fire_alerts(user_id: str, pipeline_id: str, metrics: dict[str, Any]) -> list[dict]:
    """Check all rules for a pipeline and fire alerts if thresholds are crossed."""
    pool = await get_pool()
    rules = await pool.fetch(
        "SELECT * FROM alert_rules WHERE user_id = $1 AND pipeline_id = $2 AND enabled = true",
        user_id, pipeline_id,
    )

    fired = []
    for rule in rules:
        metric_val = metrics.get(rule["metric"])
        if metric_val is None:
            continue

        threshold = float(rule["threshold"])
        triggered = False

        if rule["operator"] == "lt" and float(metric_val) < threshold:
            triggered = True
        elif rule["operator"] == "gt" and float(metric_val) > threshold:
            triggered = True

        if triggered:
            # Rate limit: don't fire more than once per hour
            if rule["last_triggered_at"]:
                from datetime import datetime, timezone, timedelta
                last = rule["last_triggered_at"]
                if last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) - last < timedelta(hours=1):
                    continue

            success = await _send_webhook(
                rule["webhook_url"],
                rule["channel"],
                pipeline_id,
                rule["metric"],
                metric_val,
                threshold,
                rule["operator"],
            )

            if success:
                await pool.execute(
                    "UPDATE alert_rules SET last_triggered_at = NOW() WHERE id = $1",
                    rule["id"],
                )
                fired.append({"rule_id": str(rule["id"]), "metric": rule["metric"], "value": metric_val})

    return fired


async def send_test_webhook(webhook_url: str, channel: str) -> bool:
    """Send a test message to verify webhook URL works."""
    if channel == "discord":
        payload = {"content": "🕹️ **RAIRCADE** test alert — your webhook is connected!"}
    else:
        payload = {
            "text": "🕹️ *RAIRCADE* test alert — your webhook is connected!",
            "blocks": [{
                "type": "section",
                "text": {"type": "mrkdwn", "text": "🕹️ *RAIRCADE* test alert — your webhook is connected! You'll receive alerts here when your pipeline metrics cross your configured thresholds."},
            }],
        }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook_url, json=payload)
            return resp.status_code < 300
    except Exception:
        return False


async def _send_webhook(
    webhook_url: str,
    channel: str,
    pipeline_id: str,
    metric: str,
    value: Any,
    threshold: float,
    operator: str,
) -> bool:
    """Send alert to Slack or Discord webhook."""
    direction = "below" if operator == "lt" else "above"
    metric_label = metric.replace("_", " ").title()

    if isinstance(value, float):
        val_str = f"{value:.2f}"
    else:
        val_str = str(value)

    if channel == "discord":
        payload = {
            "embeds": [{
                "title": f"⚠️ Alert: {pipeline_id}",
                "description": f"**{metric_label}** is {direction} threshold\n\nCurrent: `{val_str}`\nThreshold: `{threshold}`",
                "color": 16727390,  # pink
            }],
        }
    else:
        payload = {
            "blocks": [
                {
                    "type": "header",
                    "text": {"type": "plain_text", "text": f"⚠️ RAIRCADE Alert: {pipeline_id}"},
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*Metric:*\n{metric_label}"},
                        {"type": "mrkdwn", "text": f"*Status:*\n{direction.capitalize()} threshold"},
                        {"type": "mrkdwn", "text": f"*Current:*\n`{val_str}`"},
                        {"type": "mrkdwn", "text": f"*Threshold:*\n`{threshold}`"},
                    ],
                },
            ],
        }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook_url, json=payload)
            return resp.status_code < 300
    except Exception:
        return False
