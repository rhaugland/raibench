"""Email digest delivery via Resend API."""

import os

import httpx

from raibench_api.db import get_pool
from raibench_api.metrics import get_weekly_digest

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "RAIRCADE <digest@raircade.dev>")


def _render_digest_html(digest: dict, username: str) -> str:
    tw = digest["this_week"]
    ch = digest["changes"]
    pipelines = digest["pipelines"]

    ev_arrow = "&#9650;" if ch["events_delta"] > 0 else "&#9660;" if ch["events_delta"] < 0 else ""
    sr_arrow = "&#9650;" if ch["success_delta"] > 0 else "&#9660;" if ch["success_delta"] < 0 else ""
    cost_arrow = "&#9650;" if ch["cost_delta"] > 0 else "&#9660;" if ch["cost_delta"] < 0 else ""

    pipeline_rows = ""
    for p in pipelines[:10]:
        sr = round(p["success_rate"] * 100)
        sr_color = "#4ade80" if sr >= 95 else "#fbbf24" if sr >= 80 else "#f87171"
        latency = f'{p["p50_latency_ms"]}ms' if p["p50_latency_ms"] else "&mdash;"
        cost = f'${p["cost_cents"] / 100:.2f}'
        pipeline_rows += f"""
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #2a2a3e;color:#e0e0f0;font-weight:600">{p["pipeline_id"]}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #2a2a3e;text-align:right;color:#a0a0c0">{p["events"]:,}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #2a2a3e;text-align:right;color:{sr_color};font-weight:700">{sr}%</td>
            <td style="padding:8px 12px;border-bottom:1px solid #2a2a3e;text-align:right;color:#7dd3fc">{latency}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #2a2a3e;text-align:right;color:#fbbf24">{cost}</td>
        </tr>"""

    return f"""
    <div style="background:#0a0a1a;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      <div style="max-width:600px;margin:0 auto">
        <div style="text-align:center;margin-bottom:32px">
          <h1 style="color:#e0e0f0;font-size:24px;margin:0">
            RAIR<span style="color:#ff6b9d">CADE</span> Weekly Digest
          </h1>
          <p style="color:#a0a0c0;font-size:13px;margin-top:4px">Hey {username}, here's your pipeline performance this week.</p>
        </div>

        <div style="display:flex;gap:12px;margin-bottom:24px">
          <div style="flex:1;background:#12122a;border:1px solid #2a2a3e;border-radius:12px;padding:16px;text-align:center">
            <p style="color:#a0a0c0;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px">Events</p>
            <p style="color:#ff6b9d;font-size:28px;font-weight:900;margin:0">{tw["events"]:,}</p>
            <p style="color:#a0a0c0;font-size:11px;margin:4px 0 0">{ev_arrow} {ch["events_delta"]:+,}</p>
          </div>
          <div style="flex:1;background:#12122a;border:1px solid #2a2a3e;border-radius:12px;padding:16px;text-align:center">
            <p style="color:#a0a0c0;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px">Success Rate</p>
            <p style="color:#4ade80;font-size:28px;font-weight:900;margin:0">{round(tw["success_rate"] * 100)}%</p>
            <p style="color:#a0a0c0;font-size:11px;margin:4px 0 0">{sr_arrow} {ch["success_delta"] * 100:+.1f}%</p>
          </div>
          <div style="flex:1;background:#12122a;border:1px solid #2a2a3e;border-radius:12px;padding:16px;text-align:center">
            <p style="color:#a0a0c0;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px">Cost</p>
            <p style="color:#fbbf24;font-size:28px;font-weight:900;margin:0">${tw["cost_cents"] / 100:.2f}</p>
            <p style="color:#a0a0c0;font-size:11px;margin:4px 0 0">{cost_arrow} ${ch["cost_delta"] / 100:+.2f}</p>
          </div>
        </div>

        <div style="background:#12122a;border:1px solid #2a2a3e;border-radius:12px;overflow:hidden;margin-bottom:24px">
          <div style="padding:12px 16px;border-bottom:1px solid #2a2a3e">
            <p style="color:#e0e0f0;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin:0">Pipeline Breakdown</p>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="border-bottom:1px solid #2a2a3e">
                <th style="padding:8px 12px;text-align:left;color:#a0a0c0;font-size:10px;text-transform:uppercase">Pipeline</th>
                <th style="padding:8px 12px;text-align:right;color:#a0a0c0;font-size:10px;text-transform:uppercase">Events</th>
                <th style="padding:8px 12px;text-align:right;color:#a0a0c0;font-size:10px;text-transform:uppercase">Hit%</th>
                <th style="padding:8px 12px;text-align:right;color:#a0a0c0;font-size:10px;text-transform:uppercase">p50</th>
                <th style="padding:8px 12px;text-align:right;color:#a0a0c0;font-size:10px;text-transform:uppercase">Cost</th>
              </tr>
            </thead>
            <tbody>{pipeline_rows}</tbody>
          </table>
        </div>

        <div style="text-align:center;margin-top:32px">
          <a href="https://dashboard-virid-tau-33.vercel.app/dashboard" style="display:inline-block;background:#ff6b9d;color:#0a0a1a;padding:12px 32px;border-radius:10px;font-weight:700;text-decoration:none;font-size:13px">View Dashboard</a>
        </div>

        <p style="text-align:center;color:#666;font-size:11px;margin-top:24px">
          RAIRCADE &middot; Production intelligence for AI pipelines
        </p>
      </div>
    </div>
    """


async def send_digest_email(user_id: str) -> bool:
    """Send weekly digest email to a user. Returns True on success."""
    if not RESEND_API_KEY:
        return False

    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT github_username, email FROM users WHERE id = $1", user_id
    )
    if not row or not row["email"]:
        return False

    digest = await get_weekly_digest(user_id)
    if digest["this_week"]["events"] == 0:
        return False

    html = _render_digest_html(digest, row["github_username"] or "there")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": FROM_EMAIL,
                "to": [row["email"]],
                "subject": f"RAIRCADE Weekly Digest — {digest['this_week']['events']:,} events this week",
                "html": html,
            },
        )
        return resp.status_code == 200


async def send_all_digests() -> dict:
    """Send digest to all users with email addresses. Called by cron."""
    pool = await get_pool()
    users = await pool.fetch("SELECT id FROM users WHERE email IS NOT NULL")

    sent = 0
    failed = 0
    for u in users:
        try:
            ok = await send_digest_email(str(u["id"]))
            if ok:
                sent += 1
            else:
                failed += 1
        except Exception:
            failed += 1

    return {"sent": sent, "failed": failed, "total": len(users)}
