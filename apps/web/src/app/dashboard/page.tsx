"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Bug,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Database,
  FileCode,
  GitBranch,
  Info,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import {
  listRepositories,
  ingestRepository,
  searchChunks,
  getGitHubAuthStatus,
  triggerAnalysis,
  getFindings,
  generateFindingFix,
  getFindingFix,
  Repository,
  SearchResult,
  GitHubAuthStatusResponse,
  Finding,
  FindingFix,
  AnalysisSummary,
  SeverityLevel,
} from "@/lib/api";

// ── GitHub Icon SVG ─────────────────────────────────────────────────────────

function GithubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

// ── Status badge helper ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Repository["indexing_status"] }) {
  const map: Record<
    Repository["indexing_status"],
    { label: string; className: string; icon: React.ReactNode }
  > = {
    pending: {
      label: "Pending",
      className: "bg-slate-500/10 text-slate-400",
      icon: <Activity className="h-3 w-3" />,
    },
    indexing: {
      label: "Indexing…",
      className: "bg-amber-500/10 text-amber-400",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    completed: {
      label: "Indexed",
      className: "bg-emerald-500/10 text-emerald-400",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    failed: {
      label: "Failed",
      className: "bg-rose-500/10 text-rose-400",
      icon: <XCircle className="h-3 w-3" />,
    },
  };

  const { label, className, icon } = map[status] ?? map.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}

// ── Severity Badge ──────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: SeverityLevel }) {
  const map: Record<
    SeverityLevel,
    { label: string; className: string; icon: React.ReactNode }
  > = {
    critical: {
      label: "Critical",
      className: "bg-rose-500/15 text-rose-400 border-rose-500/30",
      icon: <AlertOctagon className="h-3 w-3" />,
    },
    high: {
      label: "High",
      className: "bg-orange-500/15 text-orange-400 border-orange-500/30",
      icon: <AlertTriangle className="h-3 w-3" />,
    },
    medium: {
      label: "Medium",
      className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      icon: <AlertTriangle className="h-3 w-3" />,
    },
    low: {
      label: "Low",
      className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
      icon: <Info className="h-3 w-3" />,
    },
    informational: {
      label: "Info",
      className: "bg-slate-500/15 text-slate-400 border-slate-500/30",
      icon: <Info className="h-3 w-3" />,
    },
  };

  const item = map[severity] ?? map.informational;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${item.className}`}
    >
      {item.icon}
      {item.label}
    </span>
  );
}

// ── Scanner Badge ───────────────────────────────────────────────────────────

function ScannerBadge({ scanner }: { scanner: string }) {
  const isRuff = scanner.toLowerCase() === "ruff";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-mono font-semibold ${
        isRuff
          ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      }`}
    >
      {isRuff ? "Ruff" : "Semgrep"}
    </span>
  );
}

// ── Chunk type color chip ────────────────────────────────────────────────────

function ChunkTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    function: "bg-blue-500/10 text-blue-400",
    class: "bg-purple-500/10 text-purple-400",
    method: "bg-cyan-500/10 text-cyan-400",
    module: "bg-orange-500/10 text-orange-400",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-mono font-medium ${
        colors[type] ?? "bg-slate-500/10 text-slate-400"
      }`}
    >
      {type}
    </span>
  );
}

// ── Unified Diff Patch Syntax Styler ─────────────────────────────────────────

function DiffViewer({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-relaxed">
      {lines.map((line, idx) => {
        let style = "text-slate-300";
        if (line.startsWith("+") && !line.startsWith("+++")) {
          style = "text-emerald-400 bg-emerald-500/10";
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          style = "text-rose-400 bg-rose-500/10";
        } else if (line.startsWith("@")) {
          style = "text-cyan-400 font-semibold";
        } else if (line.startsWith("---") || line.startsWith("+++")) {
          style = "text-slate-400 font-bold";
        }
        return (
          <div key={idx} className={`${style} px-1 rounded`}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}

// ── Main dashboard page ──────────────────────────────────────────────────────

export default function DashboardPage() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [reposError, setReposError] = useState<string | null>(null);

  const [githubStatus, setGithubStatus] =
    useState<GitHubAuthStatusResponse | null>(null);

  // Ingest form
  const [ingestUrl, setIngestUrl] = useState("");
  const [ingestBranch, setIngestBranch] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // Active view tab per selected repo
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"analysis" | "search">("analysis");

  // Semantic Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);

  // Static Analysis
  const [analyzingRepoId, setAnalyzingRepoId] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [findingsError, setFindingsError] = useState<string | null>(null);
  const [scannerFilter, setScannerFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null);

  // AI Bug Fixes & Verification
  const [fixes, setFixes] = useState<Record<string, FindingFix>>({});
  const [fixLoading, setFixLoading] = useState<Record<string, boolean>>({});
  const [fixError, setFixError] = useState<Record<string, string>>({});
  const [approvedFixes, setApprovedFixes] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleGenerateFix = async (findingId: string, force = false) => {
    if (!selectedRepoId) return;
    setFixLoading((prev) => ({ ...prev, [findingId]: true }));
    setFixError((prev) => ({ ...prev, [findingId]: "" }));
    try {
      const fix = await generateFindingFix(selectedRepoId, findingId, undefined, force);
      setFixes((prev) => ({ ...prev, [findingId]: fix }));
    } catch (err) {
      setFixError((prev) => ({
        ...prev,
        [findingId]: err instanceof Error ? err.message : "Failed to generate fix.",
      }));
    } finally {
      setFixLoading((prev) => ({ ...prev, [findingId]: false }));
    }
  };

  const handleApproveFix = (findingId: string) => {
    setApprovedFixes((prev) => ({ ...prev, [findingId]: !prev[findingId] }));
  };

  useEffect(() => {
    if (expandedFindingId && selectedRepoId && !fixes[expandedFindingId] && !fixLoading[expandedFindingId]) {
      getFindingFix(selectedRepoId, expandedFindingId)
        .then((fix) => {
          setFixes((prev) => ({ ...prev, [expandedFindingId]: fix }));
        })
        .catch(() => {
          // No fix yet
        });
    }
  }, [expandedFindingId, selectedRepoId]);

  // ── Load repositories ──────────────────────────────────────────────────────

  const loadRepos = useCallback(async () => {
    setReposLoading(true);
    setReposError(null);
    try {
      const data = await listRepositories();
      setRepos(data.repositories);
    } catch (err) {
      setReposError(
        err instanceof Error ? err.message : "Failed to load repositories."
      );
    } finally {
      setReposLoading(false);
    }
  }, []);

  // ── Load GitHub auth status ────────────────────────────────────────────────

  const loadGithubStatus = useCallback(async () => {
    try {
      const data = await getGitHubAuthStatus();
      setGithubStatus(data);
    } catch {
      // Non-critical — backend may not be running
    }
  }, []);

  useEffect(() => {
    loadRepos();
    loadGithubStatus();
  }, [loadRepos, loadGithubStatus]);

  // ── Load findings for selected repo ────────────────────────────────────────

  const loadFindings = useCallback(
    async (repoId: string, scanner?: string, severity?: string) => {
      setFindingsLoading(true);
      setFindingsError(null);
      try {
        const data = await getFindings(repoId, scanner, severity);
        setFindings(data.findings);
        setSummary(data.summary);
      } catch (err) {
        setFindingsError(
          err instanceof Error ? err.message : "Failed to load analysis findings."
        );
      } finally {
        setFindingsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedRepoId && activeTab === "analysis") {
      loadFindings(selectedRepoId, scannerFilter, severityFilter);
    }
  }, [selectedRepoId, activeTab, scannerFilter, severityFilter, loadFindings]);

  // ── Ingest repository ──────────────────────────────────────────────────────

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingestUrl.trim()) return;

    setIngesting(true);
    setIngestResult(null);
    setIngestError(null);

    try {
      const result = await ingestRepository(
        ingestUrl.trim(),
        ingestBranch.trim() || undefined
      );
      setIngestResult(result.message);
      setIngestUrl("");
      setIngestBranch("");
      await loadRepos();
      setSelectedRepoId(result.repository_id);
    } catch (err) {
      setIngestError(
        err instanceof Error ? err.message : "Ingestion failed."
      );
    } finally {
      setIngesting(false);
    }
  };

  // ── Trigger static analysis ────────────────────────────────────────────────

  const handleAnalyze = async (repoId: string) => {
    setAnalyzingRepoId(repoId);
    setFindingsError(null);
    try {
      const result = await triggerAnalysis(repoId);
      setFindings(result.findings);
      setSummary(result.summary);
      setSelectedRepoId(repoId);
      setActiveTab("analysis");
    } catch (err) {
      setFindingsError(
        err instanceof Error ? err.message : "Analysis run failed."
      );
    } finally {
      setAnalyzingRepoId(null);
    }
  };

  // ── Semantic search ────────────────────────────────────────────────────────

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepoId || !searchQuery.trim()) return;

    setSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const data = await searchChunks(selectedRepoId, searchQuery.trim());
      setSearchResults(data.results);
      if (data.results.length === 0) {
        setSearchError("No matching code chunks found.");
      }
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Search failed."
      );
    } finally {
      setSearching(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const completedRepos = repos.filter((r) => r.indexing_status === "completed");
  const selectedRepo = repos.find((r) => r.id === selectedRepoId);

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-10">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-300"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to home
            </Link>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">
              Code-Fix <span className="text-indigo-400">Dashboard</span>
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Repository ingestion, Tree-sitter vector search, and Ruff + Semgrep static code analysis.
            </p>
          </div>
          <button
            onClick={loadRepos}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${reposLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        {/* GitHub OAuth status banner */}
        {githubStatus && !githubStatus.configured && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
            <div className="flex items-start gap-3">
              <GithubIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <p className="text-sm font-medium text-amber-300">
                  GitHub OAuth not configured
                </p>
                <p className="mt-0.5 text-xs text-amber-400/70">
                  {githubStatus.message} You can still index public repositories
                  by URL below.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Two-column layout: Ingest form | Repo list */}
        <div className="grid gap-8 lg:grid-cols-5">
          {/* ── Ingest form (2/5) ──────────────────────────────────────────── */}
          <section className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
              <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                <GitBranch className="h-4 w-4 text-indigo-400" />
                Index a Repository
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Paste a public GitHub URL to clone, extract AST chunks, embed with FastEmbed, and prepare for static analysis.
              </p>

              <form onSubmit={handleIngest} className="mt-5 space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-400">
                    Repository URL
                  </label>
                  <input
                    type="text"
                    value={ingestUrl}
                    onChange={(e) => setIngestUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    disabled={ingesting}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-400">
                    Branch{" "}
                    <span className="text-slate-600">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={ingestBranch}
                    onChange={(e) => setIngestBranch(e.target.value)}
                    placeholder="main"
                    disabled={ingesting}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={ingesting || !ingestUrl.trim()}
                  className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {ingesting ? (
                    <span className="inline-flex items-center gap-2 justify-center">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Indexing…
                    </span>
                  ) : (
                    "Index Repository"
                  )}
                </button>
              </form>

              {ingestResult && (
                <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-300">
                  ✓ {ingestResult}
                </div>
              )}
              {ingestError && (
                <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-xs text-rose-300">
                  ✗ {ingestError}
                </div>
              )}
            </div>
          </section>

          {/* ── Repository list (3/5) ──────────────────────────────────────── */}
          <section className="lg:col-span-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50">
              <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
                <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                  <Database className="h-4 w-4 text-indigo-400" />
                  Indexed Repositories
                  {repos.length > 0 && (
                    <span className="ml-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-300">
                      {repos.length}
                    </span>
                  )}
                </h2>
              </div>

              {reposLoading && (
                <div className="flex items-center justify-center py-12 text-slate-500">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading repositories…
                </div>
              )}

              {!reposLoading && reposError && (
                <div className="px-6 py-8 text-center text-sm text-rose-400">
                  {reposError}
                </div>
              )}

              {!reposLoading && !reposError && repos.length === 0 && (
                <div className="px-6 py-12 text-center">
                  <Code2 className="mx-auto h-10 w-10 text-slate-700" />
                  <p className="mt-3 text-sm text-slate-500">
                    No repositories indexed yet.
                  </p>
                </div>
              )}

              {!reposLoading && repos.length > 0 && (
                <ul className="divide-y divide-slate-800">
                  {repos.map((repo) => (
                    <li
                      key={repo.id}
                      className={`px-6 py-4 transition ${
                        selectedRepoId === repo.id
                          ? "bg-indigo-500/5"
                          : "hover:bg-slate-800/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <GithubIcon className="h-4 w-4 shrink-0 text-slate-500" />
                            <span className="truncate text-sm font-semibold text-white">
                              {repo.full_name}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <GitBranch className="h-3 w-3" />
                              {repo.default_branch}
                            </span>
                            <span>{repo.chunk_count} code chunks</span>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <StatusBadge status={repo.indexing_status} />
                          {repo.indexing_status === "completed" && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleAnalyze(repo.id)}
                                disabled={analyzingRepoId === repo.id}
                                className="inline-flex items-center gap-1 rounded bg-indigo-600/90 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                              >
                                {analyzingRepoId === repo.id ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Analyzing…
                                  </>
                                ) : (
                                  <>
                                    <ShieldAlert className="h-3 w-3" />
                                    Analyze Code
                                  </>
                                )}
                              </button>

                              <button
                                onClick={() => {
                                  setSelectedRepoId(
                                    selectedRepoId === repo.id ? null : repo.id
                                  );
                                  setActiveTab("analysis");
                                }}
                                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
                              >
                                {selectedRepoId === repo.id
                                  ? "Close"
                                  : "View Details"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* ── Detail Panel: Static Analysis & Vector Search Tabs ────────────── */}
        {selectedRepo && (
          <section className="rounded-2xl border border-indigo-500/30 bg-slate-900/60 p-6 shadow-xl">
            {/* Header and Tab Selector */}
            <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                  <span>Repository:</span>
                  <span className="text-indigo-400">{selectedRepo.full_name}</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Switch between static code analysis findings and semantic vector retrieval.
                </p>
              </div>

              <div className="flex rounded-lg border border-slate-700 bg-slate-800 p-1">
                <button
                  onClick={() => setActiveTab("analysis")}
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    activeTab === "analysis"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Bug className="h-3.5 w-3.5" />
                  Static Analysis
                  {summary && summary.total_findings > 0 && (
                    <span className="rounded-full bg-slate-900/70 px-1.5 py-0.2 text-[10px] font-bold">
                      {summary.total_findings}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("search")}
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    activeTab === "search"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Search className="h-3.5 w-3.5" />
                  Semantic Search
                </button>
              </div>
            </div>

            {/* TAB 1: Static Code Analysis Findings */}
            {activeTab === "analysis" && (
              <div className="mt-6 space-y-6">
                {/* Re-analyze Button and Filters */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleAnalyze(selectedRepo.id)}
                      disabled={analyzingRepoId === selectedRepo.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {analyzingRepoId === selectedRepo.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Running Ruff &amp; Semgrep…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          Run Analysis Now
                        </>
                      )}
                    </button>
                    {summary?.last_run_at && (
                      <span className="text-xs text-slate-500">
                        Last scanned: {new Date(summary.last_run_at).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Filter Selectors */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-400">Scanner:</span>
                      <select
                        value={scannerFilter}
                        onChange={(e) => setScannerFilter(e.target.value)}
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white focus:outline-none"
                      >
                        <option value="all">All Scanners</option>
                        <option value="ruff">Ruff</option>
                        <option value="semgrep">Semgrep</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-400">Severity:</span>
                      <select
                        value={severityFilter}
                        onChange={(e) => setSeverityFilter(e.target.value)}
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white focus:outline-none"
                      >
                        <option value="all">All Severities</option>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                        <option value="informational">Informational</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Summary Metrics Grid */}
                {summary && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <span className="text-xs text-slate-500">Total Findings</span>
                      <p className="mt-1 text-2xl font-bold text-white">
                        {summary.total_findings}
                      </p>
                    </div>

                    <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
                      <span className="text-xs text-rose-400">Critical</span>
                      <p className="mt-1 text-2xl font-bold text-rose-300">
                        {summary.critical_count}
                      </p>
                    </div>

                    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3">
                      <span className="text-xs text-orange-400">High</span>
                      <p className="mt-1 text-2xl font-bold text-orange-300">
                        {summary.high_count}
                      </p>
                    </div>

                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                      <span className="text-xs text-amber-400">Medium</span>
                      <p className="mt-1 text-2xl font-bold text-amber-300">
                        {summary.medium_count}
                      </p>
                    </div>

                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
                      <span className="text-xs text-blue-400">Low</span>
                      <p className="mt-1 text-2xl font-bold text-blue-300">
                        {summary.low_count}
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
                      <span className="text-xs text-slate-400">Ruff / Semgrep</span>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {summary.ruff_count} / {summary.semgrep_count}
                      </p>
                    </div>
                  </div>
                )}

                {/* Findings List State */}
                {findingsLoading && (
                  <div className="flex items-center justify-center py-10 text-slate-500">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading static analysis findings…
                  </div>
                )}

                {findingsError && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-xs text-rose-300">
                    ✗ {findingsError}
                  </div>
                )}

                {!findingsLoading && findings.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-800 py-12 text-center">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
                    <p className="mt-2 text-sm font-medium text-white">
                      No issues detected
                    </p>
                    <p className="text-xs text-slate-500">
                      Click &ldquo;Run Analysis Now&rdquo; to scan this repository with Ruff and Semgrep.
                    </p>
                  </div>
                )}

                {!findingsLoading && findings.length > 0 && (
                  <ul className="space-y-3">
                    {findings.map((f) => (
                      <li
                        key={f.id}
                        className="rounded-xl border border-slate-800 bg-slate-950/70 transition hover:border-slate-700"
                      >
                        <button
                          onClick={() =>
                            setExpandedFindingId(
                              expandedFindingId === f.id ? null : f.id
                            )
                          }
                          className="flex w-full items-start justify-between gap-3 p-4 text-left"
                        >
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <ScannerBadge scanner={f.scanner} />
                              <SeverityBadge severity={f.severity} />
                              <span className="font-mono text-xs font-bold text-slate-300">
                                {f.rule_id}
                              </span>
                            </div>

                            <p className="text-sm font-semibold text-white">
                              {f.title}
                            </p>

                            <p className="font-mono text-xs text-slate-400">
                              {f.file_path}:{f.start_line}
                              {f.start_column ? `:${f.start_column}` : ""}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-2 pt-1">
                            {expandedFindingId === f.id ? (
                              <ChevronDown className="h-4 w-4 text-slate-400" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-400" />
                            )}
                          </div>
                        </button>

                        {expandedFindingId === f.id && (
                          <div className="border-t border-slate-800 px-4 py-4 space-y-4 bg-slate-900/40">
                            {f.description && (
                              <div className="text-xs text-slate-300 whitespace-pre-wrap">
                                {f.description}
                              </div>
                            )}

                            {f.code_snippet && (
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[11px] font-semibold uppercase text-slate-500">
                                    Offending Code Snippet
                                  </span>
                                  <button
                                    onClick={() => handleCopy(f.code_snippet!, `orig-${f.id}`)}
                                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition"
                                  >
                                    {copiedId === `orig-${f.id}` ? (
                                      <>
                                        <Check className="h-3 w-3 text-emerald-400" />
                                        <span className="text-emerald-400">Copied</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="h-3 w-3" />
                                        Copy
                                      </>
                                    )}
                                  </button>
                                </div>
                                <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-indigo-200">
                                  {f.code_snippet}
                                </pre>
                              </div>
                            )}

                            {/* ── AI Fix Generation Panel ── */}
                            <div className="pt-2 border-t border-slate-800/80">
                              {/* Trigger button when no fix exists yet */}
                              {!fixes[f.id] && !fixLoading[f.id] && (
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3.5">
                                  <div>
                                    <h4 className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
                                      <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                                      AI Autonomous Bug Fix &amp; Explanation
                                    </h4>
                                    <p className="mt-0.5 text-[11px] text-slate-400">
                                      Query Gemini with semantic AST context to diagnose root-cause, build diff patch, and write regression tests.
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleGenerateFix(f.id, false)}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500"
                                  >
                                    <Sparkles className="h-3.5 w-3.5" />
                                    Generate Fix &amp; Tests
                                  </button>
                                </div>
                              )}

                              {/* Loading State */}
                              {fixLoading[f.id] && (
                                <div className="flex items-center justify-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-6 text-center">
                                  <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                                  <div className="text-left">
                                    <p className="text-xs font-semibold text-indigo-200">
                                      Generating fix with Gemini &amp; pgvector context…
                                    </p>
                                    <p className="text-[11px] text-slate-400">
                                      Retrieving AST chunks, performing root-cause analysis, and validating Python syntax in isolated sandbox.
                                    </p>
                                  </div>
                                </div>
                              )}

                              {/* Error State */}
                              {fixError[f.id] && (
                                <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-300 flex items-center justify-between">
                                  <span>✗ {fixError[f.id]}</span>
                                  <button
                                    onClick={() => handleGenerateFix(f.id, true)}
                                    className="ml-2 font-semibold underline hover:text-white"
                                  >
                                    Retry
                                  </button>
                                </div>
                              )}

                              {/* Completed AI Fix Display */}
                              {fixes[f.id] && (
                                <div className="space-y-4">
                                  {/* Explanation & Root Cause Card */}
                                  <div className="rounded-xl border border-indigo-500/30 bg-slate-950 p-4 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                      <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-400">
                                        <Sparkles className="h-3.5 w-3.5" />
                                        Code-Fix AI Diagnostic
                                      </span>
                                      <button
                                        onClick={() => handleGenerateFix(f.id, true)}
                                        disabled={fixLoading[f.id]}
                                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition"
                                      >
                                        <RotateCcw className="h-3 w-3" />
                                        Regenerate
                                      </button>
                                    </div>
                                    <p className="text-xs text-slate-200 leading-relaxed">
                                      {fixes[f.id].explanation}
                                    </p>
                                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                                        Root Cause Analysis
                                      </span>
                                      <p className="mt-0.5 text-xs text-slate-300">
                                        {fixes[f.id].root_cause}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Before/After Diff Patch Viewer */}
                                  <div>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-400">
                                        <FileCode className="h-3.5 w-3.5 text-indigo-400" />
                                        Unified Diff Patch (Before vs After)
                                      </span>
                                      <button
                                        onClick={() => handleCopy(fixes[f.id].diff_patch, `diff-${f.id}`)}
                                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition"
                                      >
                                        {copiedId === `diff-${f.id}` ? (
                                          <>
                                            <Check className="h-3 w-3 text-emerald-400" />
                                            <span className="text-emerald-400">Copied Patch</span>
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="h-3 w-3" />
                                            Copy Diff
                                          </>
                                        )}
                                      </button>
                                    </div>
                                    <DiffViewer diff={fixes[f.id].diff_patch} />
                                  </div>

                                  {/* Proposed Corrected Code */}
                                  <div>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-[11px] font-semibold uppercase text-slate-400">
                                        Proposed Replacement Code
                                      </span>
                                      <button
                                        onClick={() => handleCopy(fixes[f.id].proposed_code, `code-${f.id}`)}
                                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition"
                                      >
                                        {copiedId === `code-${f.id}` ? (
                                          <>
                                            <Check className="h-3 w-3 text-emerald-400" />
                                            <span className="text-emerald-400">Copied</span>
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="h-3 w-3" />
                                            Copy Code
                                          </>
                                        )}
                                      </button>
                                    </div>
                                    <pre className="overflow-x-auto rounded-lg border border-emerald-500/20 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-emerald-300">
                                      {fixes[f.id].proposed_code}
                                    </pre>
                                  </div>

                                  {/* Regression Test Card */}
                                  <div>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-400">
                                        <Terminal className="h-3.5 w-3.5 text-amber-400" />
                                        Generated Regression Test (pytest)
                                      </span>
                                      <button
                                        onClick={() => handleCopy(fixes[f.id].regression_test, `test-${f.id}`)}
                                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition"
                                      >
                                        {copiedId === `test-${f.id}` ? (
                                          <>
                                            <Check className="h-3 w-3 text-emerald-400" />
                                            <span className="text-emerald-400">Copied Test</span>
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="h-3 w-3" />
                                            Copy Test
                                          </>
                                        )}
                                      </button>
                                    </div>
                                    <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-amber-200">
                                      {fixes[f.id].regression_test}
                                    </pre>
                                  </div>

                                  {/* Safe Execution Validation Banner */}
                                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                    <div className="flex items-start gap-2.5">
                                      <ShieldCheck className="h-4 w-4 mt-0.5 text-emerald-400 shrink-0" />
                                      <div>
                                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-emerald-300">
                                          {fixes[f.id].validation_status}
                                        </span>
                                        <p className="mt-1 text-xs text-emerald-200/90">
                                          {fixes[f.id].validation_message || "Python AST parsed and validated in isolated execution sandbox."}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Pull Request Approval Action */}
                                    <button
                                      onClick={() => handleApproveFix(f.id)}
                                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                        approvedFixes[f.id]
                                          ? "bg-emerald-600 text-white hover:bg-emerald-500"
                                          : "border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                                      }`}
                                    >
                                      {approvedFixes[f.id] ? (
                                        <>
                                          <Check className="h-3.5 w-3.5" />
                                          Approved for Pull Request
                                        </>
                                      ) : (
                                        <>
                                          <ThumbsUp className="h-3.5 w-3.5" />
                                          Approve Fix (Ready for PR)
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* TAB 2: Semantic Vector Search */}
            {activeTab === "search" && (
              <div className="mt-6 space-y-4">
                <form onSubmit={handleSearch} className="flex gap-3">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search code chunks by natural language (e.g., function that handles error responses)"
                    disabled={searching}
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={searching || !searchQuery.trim()}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {searching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Search"
                    )}
                  </button>
                </form>

                {searchError && (
                  <p className="mt-3 text-xs text-rose-400">{searchError}</p>
                )}

                {searchResults.length > 0 && (
                  <ul className="mt-4 space-y-3">
                    {searchResults.map((result) => (
                      <li
                        key={result.id}
                        className="rounded-xl border border-slate-800 bg-slate-950/60"
                      >
                        <button
                          onClick={() =>
                            setExpandedResult(
                              expandedResult === result.id ? null : result.id
                            )
                          }
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        >
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <ChunkTypeBadge type={result.chunk_type} />
                            <span className="truncate text-sm font-semibold text-white">
                              {result.symbol_name}
                            </span>
                            <span className="truncate text-xs text-slate-500">
                              {result.file_path}:{result.start_line}–
                              {result.end_line}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs font-mono text-indigo-300">
                              {(result.similarity * 100).toFixed(1)}%
                            </span>
                            {expandedResult === result.id ? (
                              <ChevronDown className="h-4 w-4 text-slate-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-500" />
                            )}
                          </div>
                        </button>

                        {expandedResult === result.id && (
                          <pre className="overflow-x-auto border-t border-slate-800 px-4 py-3 text-xs leading-relaxed text-slate-300">
                            {result.content}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        {/* Footer */}
        <footer className="flex items-center justify-between border-t border-slate-800 pt-5 text-xs text-slate-600">
          <span>Code-Fix AI — Automated Code Analysis, AI Bug Fixing &amp; Validation</span>
          <span>{completedRepos.length} repositories indexed</span>
        </footer>
      </div>
    </main>
  );
}
