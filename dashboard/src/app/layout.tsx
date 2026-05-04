import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAIRCADE",
  description: "Your AI pipelines, ranked and optimized",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen relative z-10">
        <nav className="border-b border-border-subtle px-6 py-4 bg-bg-surface/70 backdrop-blur-md">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="orb border-pink text-pink text-base">
                R
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight text-text-bright">
                  RAIR<span className="text-pink">CADE</span>
                </h1>
              </div>
            </div>
            <p className="text-xs font-semibold text-text-faint tracking-widest uppercase hidden sm:block">
              AI Pipeline Arcade
            </p>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
