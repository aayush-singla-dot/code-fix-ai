"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  Database,
  ExternalLink,
  GitBranch,
  LayoutDashboard,
  RefreshCw,
  Server,
  Shield,
  Terminal,
  XCircle,
} from "lucide-react";
import { checkHealth, checkDatabase, HealthResponse, DbCheckResponse, API_BASE_URL } from "@/lib/api";

export default function Home() {
  const [backendStatus, setBackendStatus] = useState<"checking" | "connected" | "error">("checking");
  const [dbStatus, setDbStatus] = useState<"checking" | "connected" | "error">("checking");
  const [backendData, setBackendData] = useState<HealthResponse | null>(null);
  const [dbData, setDbData] = useState<DbCheckResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string>("");

  const runStatusCheck = async () => {
    setBackendStatus("checking");
    setDbStatus("checking");
    setErrorMessage(null);

    // 1. Check FastAPI Backend Health
    try {
      const health = await checkHealth();
      setBackendStatus("connected");
      setBackendData(health);
    } catch (err: unknown) {
      setBackendStatus("error");
      const message = err instanceof Error ? err.message : "Backend unreachable";
      setErrorMessage(message);
    }

    // 2. Check Supabase DB Connectivity via FastAPI
    try {
      const dbCheck = await checkDatabase();
      setDbStatus(dbCheck.status === "ok" ? "connected" : "error");
      setDbData(dbCheck);
    } catch {
      setDbStatus("error");
    }

    setLastChecked(new Date().toLocaleTimeString());
  };

  useEffect(() => {
    runStatusCheck();
  }, []);

  return (
    <main className="min-h-screen px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-10">
        {/* Header Section */}
        <header className="border-b border-slate-800 pb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-400">
                <Shield className="h-3.5 w-3.5" />
                Autonomous Code Reliability Platform
              </div>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
                Code-Fix <span className="text-indigo-400">AI</span>
              </h1>
              <p className="mt-2 text-base text-slate-400 sm:text-lg">
                Automated bug detection, semantic code understanding, regression testing, and pull-request synthesis.
              </p>
            </div>

            <div className="flex items-center gap-3 self-start">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                <LayoutDashboard className="h-4 w-4" />
                Open Dashboard
              </Link>
              <button
                onClick={runStatusCheck}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 hover:text-white"
              >
                <RefreshCw className={`h-4 w-4 ${backendStatus === "checking" ? "animate-spin" : ""}`} />
                Re-test Services
              </button>
            </div>
          </div>
        </header>

        {/* Milestone Status Indicators */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              System Architecture Status (Milestone 1)
            </h2>
            {lastChecked && (
              <span className="text-xs text-slate-500">Last probe: {lastChecked}</span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {/* Frontend Status */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-400">Frontend Web</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Active
                </span>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <p className="text-2xl font-bold text-white">Next.js 16</p>
                <span className="text-xs text-slate-500">React 19 / TS 5.9</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Client runtime verified with App Router and Tailwind CSS 4.
              </p>
            </div>

            {/* Backend FastAPI Status */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-400">FastAPI Core</span>
                {backendStatus === "connected" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Online
                  </span>
                )}
                {backendStatus === "checking" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                    <Activity className="h-3.5 w-3.5 animate-pulse" />
                    Probing
                  </span>
                )}
                {backendStatus === "error" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-400">
                    <XCircle className="h-3.5 w-3.5" />
                    Offline
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <p className="text-2xl font-bold text-white">
                  {backendData ? `v${backendData.version}` : "FastAPI"}
                </p>
                <span className="text-xs text-slate-500">Python 3.13</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {backendStatus === "connected"
                  ? `API gateway connected (${API_BASE_URL})`
                  : errorMessage || "Waiting for FastAPI worker process"}
              </p>
            </div>

            {/* Supabase Connectivity */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-400">Supabase pgvector</span>
                {dbStatus === "connected" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Connected
                  </span>
                )}
                {dbStatus === "checking" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                    <Activity className="h-3.5 w-3.5 animate-pulse" />
                    Checking
                  </span>
                )}
                {dbStatus === "error" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-400">
                    <XCircle className="h-3.5 w-3.5" />
                    Unreachable
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <p className="text-2xl font-bold text-white">PostgreSQL</p>
                <span className="text-xs text-slate-500">asyncpg / vector</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {dbStatus === "connected"
                  ? "PostgreSQL database handshake verified via backend"
                  : "Database query pending or backend offline"}
              </p>
            </div>
          </div>
        </section>

        {/* Project Introduction & Pipeline Overview */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 sm:p-8">
          <h3 className="text-lg font-semibold text-white">Autonomous Engineering Pipeline</h3>
          <p className="mt-1 text-sm text-slate-400">
            Code-Fix AI bridges static code inspection, vector retrieval, and LLM reasoning to generate and prove bug fixes.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center gap-2 text-indigo-400">
                <GitBranch className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase">Stage 1</span>
              </div>
              <h4 className="mt-2 text-sm font-semibold text-white">Repo Ingestion</h4>
              <p className="mt-1 text-xs text-slate-400">
                Tree-sitter parses CST nodes into semantic chunks indexed into Supabase pgvector.
              </p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center gap-2 text-indigo-400">
                <Terminal className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase">Stage 2</span>
              </div>
              <h4 className="mt-2 text-sm font-semibold text-white">Static Analysis</h4>
              <p className="mt-1 text-xs text-slate-400">
                Ruff and Semgrep detect bugs, security flaws, and performance regressions.
              </p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center gap-2 text-indigo-400">
                <Server className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase">Stage 3</span>
              </div>
              <h4 className="mt-2 text-sm font-semibold text-white">LangGraph Agent</h4>
              <p className="mt-1 text-xs text-slate-400">
                Gemini diagnoses root causes, generates unified diffs, and synthesizes regression tests.
              </p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center gap-2 text-indigo-400">
                <Database className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase">Stage 4 & 5</span>
              </div>
              <h4 className="mt-2 text-sm font-semibold text-white">Sandbox & PR</h4>
              <p className="mt-1 text-xs text-slate-400">
                Tests run in isolated execution sandbox. Human approval triggers automatic GitHub PR.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-6 text-xs text-slate-500 sm:flex-row">
          <p>Code-Fix AI — B.Tech Capstone Project (AI/ML)</p>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1 text-slate-400">
              <ExternalLink className="h-3 w-3" />
              API: {API_BASE_URL || "Same-Domain (/api)"}
            </span>
          </div>
        </footer>
      </div>
    </main>
  );
}

