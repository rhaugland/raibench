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
    fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/v1/auth/github/callback?code=${code}`,
      { method: "POST" }
    )
      .then((res) => res.json())
      .then((data) => {
        localStorage.setItem("raibench_api_key", data.api_key);
        localStorage.setItem("raibench_token", data.token);
        localStorage.setItem("raibench_username", data.username);
        router.push("/dashboard");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [code, router]);

  const handleLogin = async () => {
    const resp = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/v1/auth/github`
    );
    const data = await resp.json();
    window.location.href = data.url;
  };

  if (loading) return <p className="text-gray-400 text-center mt-20">Signing in...</p>;

  return (
    <div className="max-w-md mx-auto mt-20 text-center">
      <h2 className="text-3xl font-bold mb-4">RAI Bench</h2>
      <p className="text-gray-400 mb-8">
        Production intelligence for your AI applications
      </p>
      <button
        onClick={handleLogin}
        className="px-6 py-3 bg-white text-gray-900 font-medium rounded-lg hover:bg-gray-200 transition-colors"
      >
        Sign in with GitHub
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="text-gray-400 text-center mt-20">Loading...</p>}>
      <LoginContent />
    </Suspense>
  );
}
