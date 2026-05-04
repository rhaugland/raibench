"use client";

import Link from "next/link";
import { useState } from "react";

const FEATURES = [
  {
    icon: "⚡",
    color: "pink",
    title: "3-Line Setup",
    desc: "Auto-patch OpenAI & Anthropic with one function call. No decorators, no config files.",
    code: `from raibench import monitor, patch

monitor.init(api_key="...", pipeline="my-app")
patch()  # Every AI call is now traced`,
  },
  {
    icon: "📊",
    color: "electric",
    title: "Real-Time Metrics",
    desc: "Success rates, latency percentiles, cost tracking, and token usage — all in one dashboard.",
    code: null,
  },
  {
    icon: "🤖",
    color: "mint",
    title: "AI-Powered Suggestions",
    desc: "Claude analyzes your pipeline metrics and gives you copy-paste Python code to fix issues.",
    code: null,
  },
  {
    icon: "🔔",
    color: "amber",
    title: "Slack & Discord Alerts",
    desc: "Set thresholds, get notified instantly when success rate drops or costs spike.",
    code: null,
  },
  {
    icon: "🏆",
    color: "lavender",
    title: "Pipeline Leaderboard",
    desc: "Rank your pipelines by accuracy, speed, and cost. Find your weakest link fast.",
    code: null,
  },
  {
    icon: "🛡️",
    color: "coral",
    title: "README Badges",
    desc: "Embed live health badges in your repo. Green/yellow/red — updated every 5 minutes.",
    code: `![status](https://raibench-api.fly.dev/badge/YOUR_KEY/my-pipeline)`,
  },
];

const STEPS = [
  { num: "1", label: "Install", cmd: "pip install raibench", color: "pink" },
  { num: "2", label: "Patch", cmd: 'patch()  # auto-instruments OpenAI & Anthropic', color: "electric" },
  { num: "3", label: "Ship", cmd: "# metrics flow into your dashboard instantly", color: "mint" },
];

const COMPARISONS = [
  { metric: "Setup time", raircade: "30 seconds", others: "Hours of config" },
  { metric: "Code changes", raircade: "3 lines", others: "Wrap every call" },
  { metric: "AI suggestions", raircade: "Built-in", others: "Not available" },
  { metric: "Cost tracking", raircade: "Automatic", others: "Manual tagging" },
  { metric: "Price", raircade: "Free (open source)", others: "$99-999/mo" },
];

export default function LandingPage() {
  const [copied, setCopied] = useState(false);
  const installCmd = "pip install raibench";
  const copy = () => { navigator.clipboard.writeText(installCmd); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="-mt-8">
      {/* ─── HERO ─── */}
      <section className="text-center pt-16 pb-20 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-pink/[0.04] to-transparent pointer-events-none" />
        <div className="relative">
          <div className="orb border-pink text-pink text-3xl w-20 h-20 mx-auto mb-8 animate-float">R</div>
          <h1 className="text-5xl md:text-6xl font-black text-text-bright tracking-tight mb-4">
            RAIR<span className="text-pink">CADE</span>
          </h1>
          <p className="text-xl md:text-2xl text-text-muted max-w-2xl mx-auto mb-3">
            Production intelligence for AI applications.
          </p>
          <p className="text-base text-text-faint max-w-lg mx-auto mb-10">
            Know when your LLM pipelines break, why they&apos;re slow, and where you&apos;re burning money. Three lines of Python. Zero config.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Link href="/dashboard?demo=1" className="btn btn-pink text-sm px-8 py-4">
              Try the Demo
            </Link>
            <Link href="/login" className="btn btn-electric text-sm px-8 py-4">
              Sign in with GitHub
            </Link>
          </div>

          <div className="flex items-center justify-center gap-3 max-w-md mx-auto">
            <code className="flex-1 card-inset text-pink px-4 py-3 font-mono text-sm text-center">{installCmd}</code>
            <button onClick={copy} className="btn btn-pink text-[10px] px-4 py-3 shrink-0">
              {copied ? "Done!" : "Copy"}
            </button>
          </div>
        </div>
      </section>

      {/* ─── PROBLEM → SOLUTION ─── */}
      <section className="py-16 border-t border-border-subtle">
        <div className="max-w-3xl mx-auto text-center mb-14">
          <h2 className="text-3xl font-black text-text-bright mb-4">
            Your AI pipeline is a <span className="text-coral">black box</span>
          </h2>
          <p className="text-text-muted text-lg">
            You shipped a RAG bot. It works... sometimes. You don&apos;t know your success rate. You don&apos;t know your P95 latency. You definitely don&apos;t know you&apos;re spending $400/month on a prompt that could be $40. RAIRCADE makes all of this visible in 30 seconds.
          </p>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="py-16 border-t border-border-subtle">
        <h2 className="text-3xl font-black text-text-bright text-center mb-12">
          Three steps. Thirty seconds.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-10">
          {STEPS.map((s) => {
            const orbClass = s.color === "pink" ? "border-pink text-pink" : s.color === "electric" ? "border-electric text-electric-soft" : "border-mint text-mint";
            return (
              <div key={s.num} className="card border-border-subtle p-6 text-center">
                <div className={`orb ${orbClass} text-lg mx-auto mb-4`}>{s.num}</div>
                <h3 className="text-base font-black text-text-bright mb-2">{s.label}</h3>
                <code className="text-xs text-text-muted font-mono">{s.cmd}</code>
              </div>
            );
          })}
        </div>
        <div className="max-w-2xl mx-auto">
          <pre className="card-inset text-text-muted px-6 py-5 font-mono text-sm overflow-x-auto whitespace-pre">{`from raibench import monitor, patch

monitor.init(
    api_key="rb_xxxxxxxx",
    pipeline="my-rag-bot",
)
patch()

# That's it. Every OpenAI & Anthropic call is now traced.
# Success rates, latency, cost — all in your dashboard.`}</pre>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section className="py-16 border-t border-border-subtle">
        <h2 className="text-3xl font-black text-text-bright text-center mb-12">
          Everything you need to ship with confidence
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {FEATURES.map((f) => {
            const borderClass = `border-${f.color}/20`;
            return (
              <div key={f.title} className={`card ${borderClass} p-6`}>
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="text-base font-black text-text-bright mb-2">{f.title}</h3>
                <p className="text-sm text-text-muted leading-relaxed mb-3">{f.desc}</p>
                {f.code && (
                  <code className="block card-inset text-xs text-text-faint font-mono px-3 py-2 overflow-x-auto">{f.code}</code>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── COMPARISON ─── */}
      <section className="py-16 border-t border-border-subtle">
        <h2 className="text-3xl font-black text-text-bright text-center mb-4">
          RAIRCADE vs. doing it yourself
        </h2>
        <p className="text-text-muted text-center mb-10">Or vs. paying $500/month for an enterprise observability tool.</p>
        <div className="max-w-2xl mx-auto card border-pink/15 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left px-5 py-3 text-[10px] font-bold text-text-faint uppercase tracking-wider">Metric</th>
                <th className="text-center px-5 py-3 text-[10px] font-bold text-pink uppercase tracking-wider">RAIRCADE</th>
                <th className="text-center px-5 py-3 text-[10px] font-bold text-text-faint uppercase tracking-wider">Others</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISONS.map((c) => (
                <tr key={c.metric} className="border-b border-border-subtle/50">
                  <td className="px-5 py-3 font-bold text-text-bright">{c.metric}</td>
                  <td className="px-5 py-3 text-center text-mint font-bold">{c.raircade}</td>
                  <td className="px-5 py-3 text-center text-text-faint">{c.others}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── WHO IT'S FOR ─── */}
      <section className="py-16 border-t border-border-subtle">
        <h2 className="text-3xl font-black text-text-bright text-center mb-10">
          Built for teams shipping AI
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {[
            { title: "Solo devs", desc: "You shipped a GPT wrapper and need to know if it's actually working. RAIRCADE tells you in 30 seconds.", color: "pink" },
            { title: "Startups", desc: "Your AI feature is live but you're flying blind on cost and reliability. Get dashboards before your users complain.", color: "electric" },
            { title: "ML teams", desc: "You have 5 pipelines across 3 providers. Rank them, find the bottleneck, get AI-powered fix suggestions.", color: "mint" },
          ].map((p) => {
            const borderClass = `border-${p.color}/20`;
            const textClass = `text-${p.color}`;
            return (
              <div key={p.title} className={`card ${borderClass} p-6`}>
                <h3 className={`text-base font-black ${textClass} mb-2`}>{p.title}</h3>
                <p className="text-sm text-text-muted leading-relaxed">{p.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-20 border-t border-border-subtle text-center">
        <div className="orb border-pink text-pink text-2xl w-16 h-16 mx-auto mb-6 animate-float">R</div>
        <h2 className="text-3xl font-black text-text-bright mb-3">
          Stop guessing. Start measuring.
        </h2>
        <p className="text-text-muted mb-8 max-w-md mx-auto">
          Three lines of Python. Real-time metrics. AI-powered optimization. Free.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/dashboard?demo=1" className="btn btn-pink text-sm px-8 py-4">
            Try the Demo
          </Link>
          <Link href="/login" className="btn btn-electric text-sm px-8 py-4">
            Get Started Free
          </Link>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-border-subtle py-8 text-center">
        <p className="text-text-faint text-xs">
          RAIR<span className="text-pink">CADE</span> &middot; Open source AI pipeline intelligence &middot; Built by{" "}
          <a href="https://github.com/ryanhaugland" className="text-text-muted hover:text-pink transition-colors">@ryanhaugland</a>
        </p>
      </footer>
    </div>
  );
}
