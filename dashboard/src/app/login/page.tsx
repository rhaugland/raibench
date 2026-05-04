"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const code = searchParams.get("code");

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/v1/auth/github/callback?code=${code}`, { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        localStorage.setItem("raibench_api_key", data.api_key);
        localStorage.setItem("raibench_token", data.token);
        localStorage.setItem("raibench_username", data.username);
        router.push("/dashboard?welcome=1");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [code, router]);

  const handleLogin = async () => {
    const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/v1/auth/github`);
    const data = await resp.json();
    window.location.href = data.url;
  };

  if (loading) return <div className="h-40 card animate-shimmer rounded-2xl mt-20 max-w-sm mx-auto" />;

  return (
    <div className="max-w-sm mx-auto mt-24 text-center">
      <div className="orb border-pink text-pink text-xl w-16 h-16 mx-auto mb-6 animate-float">R</div>
      <h2 className="text-2xl font-black text-text-bright mb-1">
        RAIR<span className="text-pink">CADE</span>
      </h2>
      <p className="text-text-muted mb-10">Your AI pipelines, ranked and optimized.</p>
      <button onClick={handleLogin} className="btn btn-pink text-sm px-8 py-4">
        Sign in with GitHub
      </button>

      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border-subtle" /></div>
        <div className="relative flex justify-center"><span className="bg-bg-void px-4 text-xs text-text-faint uppercase tracking-wider">or</span></div>
      </div>

      <button onClick={() => router.push("/dashboard?demo=1")} className="text-sm text-text-muted hover:text-pink transition-colors">
        Try the demo &rarr;
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-40 card animate-shimmer rounded-2xl mt-20 max-w-sm mx-auto" />}>
      <LoginContent />
    </Suspense>
  );
}
