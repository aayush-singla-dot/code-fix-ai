"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Code2,
  Database,
  ExternalLink,
  GitBranch,
  LayoutDashboard,
  RefreshCw,
  Server,
  Shield,
  Sparkles,
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

    setLastChecked(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  };

  useEffect(() => {
    runStatusCheck();
  }, []);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Navigation */}
      <nav className="border-b border-slate-800/80 bg-[#0c1220]/70 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
              <Code2 className="h-5 w-5" />
            </div>
            <span className="text-base font-bold tracking-tight text-white">
              Code-Fix <span className="text-indigo-400">AI</span>
            </span>
            <span className="hidden sm:inline-flex rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-slate-400">
              v1.0 MVP
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={runStatusCheck}
              title="Re-probe API & DB health"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${backendStatus === "checking" ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Probe Services</span>
            </button>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span>Launch Dashboard</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative border-b border-slate-800/60 bg-gradient-to-b from-[#0c1220] to-[#090d16] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-300">
            <Shield className="h-3.5 w-3.5 text-indigo-400" />
            Autonomous Code Reliability &amp; Repair Engine
          </div>

          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            Static Analysis Meets <br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-indigo-200 bg-clip-text text-transparent">
              Autonomous AI Bug Remediation
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base text-slate-400 sm:text-lg leading-relaxed">
            Directly connect your GitHub repository to index AST chunks into Supabase pgvector, scan vulnerabilities via Ruff and Semgrep, and synthesize verified unified diffs with Gemini.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500"
            >
              Analyze a Repository
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#pipeline"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              Explore Architecture
            </a>
          </div>
        </div>
      </header>

      {/* Live System Diagnostics Grid */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between pb-4">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Live System Infrastructure Diagnostics
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Continuous runtime health probes across Next.js, FastAPI, and Supabase</p>
          </div>
          {lastChecked && (
            <span className="text-[11px] font-mono text-slate-500">
              Probed at: {lastChecked}
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Frontend Web Status */}
          <div className="rounded-xl border border-slate-800/80 bg-[#0d1424] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Frontend Layer</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="h-3 w-3" />
                Operational
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xl font-bold text-white">Next.js 16.3</span>
              <span className="text-xs text-slate-500 font-mono">React 19 / Tailwind 4</span>
            </div>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              Serving client routes, responsive dashboard views, and diff patch viewers.
            </p>
          </div>

          {/* FastAPI Backend Status */}
          <div className="rounded-xl border border-slate-800/80 bg-[#0d1424] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">FastAPI Gateway</span>
              {backendStatus === "connected" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="h-3 w-3" />
                  Online
                </span>
              )}
              {backendStatus === "checking" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/20">
                  <Activity className="h-3 w-3 animate-pulse" />
                  Connecting
                </span>
              )}
              {backendStatus === "error" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-400 border border-rose-500/20">
                  <XCircle className="h-3 w-3" />
                  Offline
                </span>
              )}
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xl font-bold text-white">
                {backendData ? `FastAPI v${backendData.version}` : "FastAPI Engine"}
              </span>
              <span className="text-xs text-slate-500 font-mono">Python 3.13</span>
            </div>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              {backendStatus === "connected"
                ? `Active router handling Ruff, Semgrep, and Gemini orchestrations.`
                : errorMessage || "Awaiting FastAPI worker connection on /api/health"}
            </p>
          </div>

          {/* Supabase pgvector Status */}
          <div className="rounded-xl border border-slate-800/80 bg-[#0d1424] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Vector Storage</span>
              {dbStatus === "connected" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="h-3 w-3" />
                  Handshake OK
                </span>
              )}
              {dbStatus === "checking" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/20">
                  <Activity className="h-3 w-3 animate-pulse" />
                  Testing
                </span>
              )}
              {dbStatus === "error" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-400 border border-rose-500/20">
                  <XCircle className="h-3 w-3" />
                  Unreachable
                </span>
              )}
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xl font-bold text-white">PostgreSQL</span>
              <span className="text-xs text-slate-500 font-mono">pgvector / asyncpg</span>
            </div>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              {dbStatus === "connected"
                ? `Supabase database SELECT 1 query and vector schema verified.`
                : "PostgreSQL query pending or credentials unavailable."}
            </p>
          </div>
        </div>
      </section>

      {/* Autonomous Pipeline Walkthrough */}
      <section id="pipeline" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 border-t border-slate-800/60">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">Engine Workflow</span>
          <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">End-to-End Autonomous Repair Loop</h2>
          <p className="mt-2 text-sm text-slate-400">
            From raw GitHub source files to verified unified pull requests without manual debugging fatigue.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-[#0c1220]/60 p-5 hover:border-slate-700 transition">
            <div className="flex items-center gap-2 text-indigo-400">
              <GitBranch className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Phase 01</span>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-white">AST Semantic Ingestion</h3>
            <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
              Clones public repositories, builds syntax trees via Tree-sitter, chunks functions and classes, and embeds via FastEmbed into pgvector.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0c1220]/60 p-5 hover:border-slate-700 transition">
            <div className="flex items-center gap-2 text-indigo-400">
              <Terminal className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Phase 02</span>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-white">Dual Static Analysis</h3>
            <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
              Orchestrates Ruff for sub-millisecond Python linting and Semgrep for deep semantic vulnerability and security rule validation.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0c1220]/60 p-5 hover:border-slate-700 transition">
            <div className="flex items-center gap-2 text-indigo-400">
              <Sparkles className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Phase 03</span>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-white">AI Diagnostics &amp; Patch</h3>
            <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
              Gemini diagnoses the root cause using surrounding vector chunks, generates unified git diffs, and writes targeted regression tests.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0c1220]/60 p-5 hover:border-slate-700 transition">
            <div className="flex items-center gap-2 text-indigo-400">
              <Server className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Phase 04</span>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-white">Sandbox Validation</h3>
            <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
              Verifies Python syntax safety in an isolated execution sandbox before human approval triggers the pull-request synthesis.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#080c14] py-8 text-xs text-slate-500">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} Code-Fix AI — Autonomous Code Reliability Platform</p>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <ExternalLink className="h-3 w-3" />
              API Gateway: {API_BASE_URL || "/api (Same-Domain)"}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
