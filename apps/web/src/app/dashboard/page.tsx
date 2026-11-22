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
  ExternalLink,
  FileCode,
  Filter,
  GitBranch,
  Info,
  Layers,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
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

// ── GitHub SVG Icon (explicit dimensions and flex-shrink protection) ──────────

function GithubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`${className} shrink-0`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: "1rem", height: "1rem" }}
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
      className: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
      icon: <Activity className="h-3 w-3 shrink-0" />,
    },
    indexing: {
      label: "Indexing…",
      className: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
      icon: <Loader2 className="h-3 w-3 shrink-0 animate-spin" />,
    },
    completed: {
      label: "Indexed",
      className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
      icon: <CheckCircle2 className="h-3 w-3 shrink-0" />,
    },
    failed: {
      label: "Failed",
      className: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
      icon: <XCircle className="h-3 w-3 shrink-0" />,
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
      className: "bg-rose-500/15 text-rose-300 border-rose-500/30",
      icon: <AlertOctagon className="h-3 w-3 shrink-0" />,
    },
    high: {
      label: "High",
      className: "bg-orange-500/15 text-orange-300 border-orange-500/30",
      icon: <AlertTriangle className="h-3 w-3 shrink-0" />,
    },
    medium: {
      label: "Medium",
      className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      icon: <AlertTriangle className="h-3 w-3 shrink-0" />,
    },
    low: {
      label: "Low",
      className: "bg-blue-500/15 text-blue-300 border-blue-500/30",
      icon: <Info className="h-3 w-3 shrink-0" />,
    },
    informational: {
      label: "Info",
      className: "bg-slate-500/15 text-slate-300 border-slate-500/30",
      icon: <Info className="h-3 w-3 shrink-0" />,
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
    function: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
    class: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
    method: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
    module: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-mono font-medium ${
        colors[type] ?? "bg-slate-500/10 text-slate-400 border border-slate-500/20"
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
    <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-[#060911] p-3 font-mono text-xs leading-relaxed">
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

// ── Main Dashboard Page ──────────────────────────────────────────────────────

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
          // No fix cached yet
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
      // Automatically select first repo if none selected
      if (!selectedRepoId && data.repositories.length > 0) {
        setSelectedRepoId(data.repositories[0].id);
      }
    } catch (err) {
      setReposError(
        err instanceof Error ? err.message : "Failed to load repositories."
      );
    } finally {
      setReposLoading(false);
    }
  }, [selectedRepoId]);

  // ── Load GitHub auth status ────────────────────────────────────────────────

  const loadGithubStatus = useCallback(async () => {
    try {
      const data = await getGitHubAuthStatus();
      setGithubStatus(data);
    } catch {
      // Backend may be offline
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
        setSearchError("No matching code chunks found for this query.");
      }
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Search failed."
      );
    } finally {
      setSearching(false);
    }
  };

  // ── Selected Repository Pointer ────────────────────────────────────────────

  const selectedRepo = repos.find((r) => r.id === selectedRepoId);
  const completedRepos = repos.filter((r) => r.indexing_status === "completed");

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Application Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0c1220]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </Link>
            <div className="h-4 w-[1px] bg-slate-800" />
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
                <Code2 className="h-4 w-4" />
              </div>
              <h1 className="text-sm font-bold tracking-tight text-white">
                Code-Fix <span className="text-indigo-400">Dashboard</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadRepos}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reposLoading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* GitHub OAuth Alert Banner */}
        {githubStatus && !githubStatus.configured && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-300">
              <GithubIcon className="h-4 w-4 text-amber-400" />
              <span>
                <strong>GitHub OAuth Optional:</strong> Public repositories can be ingested directly by URL below without OAuth credentials.
              </span>
            </div>
            <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] text-amber-300 uppercase">
              Public Mode
            </span>
          </div>
        )}

        {/* Top Split Section: Repo Ingestion & Repositories Selector */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Ingest Repository Box (5 cols) */}
          <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0d1424] p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                  <GitBranch className="h-4 w-4 text-indigo-400" />
                  Index Repository
                </h2>
                <span className="text-[11px] font-mono text-slate-500">AST + pgvector</span>
              </div>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Enter any public GitHub Python repository URL to extract syntax nodes, compute FastEmbed vectors, and enable automated code fixes.
              </p>

              <form onSubmit={handleIngest} className="mt-4 space-y-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
                    GitHub URL
                  </label>
                  <input
                    type="text"
                    value={ingestUrl}
                    onChange={(e) => setIngestUrl(e.target.value)}
                    placeholder="https://github.com/psf/requests"
                    disabled={ingesting}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-[#080d1a] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
                    Branch <span className="text-slate-600">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={ingestBranch}
                    onChange={(e) => setIngestBranch(e.target.value)}
                    placeholder="main"
                    disabled={ingesting}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-[#080d1a] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={ingesting || !ingestUrl.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {ingesting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Parsing AST &amp; Indexing…
                    </>
                  ) : (
                    <>
                      <Database className="h-3.5 w-3.5" />
                      Clone &amp; Index Repository
                    </>
                  )}
                </button>
              </form>
            </div>

            {ingestResult && (
              <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
                ✓ {ingestResult}
              </div>
            )}
            {ingestError && (
              <div className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
                ✗ {ingestError}
              </div>
            )}
          </div>

          {/* Active Repositories List (7 cols) */}
          <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#0d1424] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-indigo-400" />
                <h2 className="text-sm font-bold text-white">Indexed Repositories</h2>
                <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.2 text-[11px] font-mono font-semibold text-indigo-300">
                  {repos.length}
                </span>
              </div>
              <span className="text-[11px] text-slate-500">Select to inspect &amp; run fixes</span>
            </div>

            <div className="p-4 flex-1 overflow-y-auto max-h-[260px] space-y-2">
              {reposLoading && (
                <div className="flex items-center justify-center py-10 text-xs text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-400" />
                  Loading repositories from Supabase…
                </div>
              )}

              {!reposLoading && reposError && (
                <div className="py-6 text-center text-xs text-rose-400">
                  {reposError}
                </div>
              )}

              {!reposLoading && !reposError && repos.length === 0 && (
                <div className="py-10 text-center">
                  <Code2 className="mx-auto h-8 w-8 text-slate-700" />
                  <p className="mt-2 text-xs font-medium text-slate-400">
                    No repositories indexed yet.
                  </p>
                  <p className="text-[11px] text-slate-600">
                    Enter a public GitHub repository URL on the left to begin.
                  </p>
                </div>
              )}

              {!reposLoading &&
                repos.map((repo) => {
                  const isSelected = selectedRepoId === repo.id;
                  return (
                    <div
                      key={repo.id}
                      onClick={() => setSelectedRepoId(repo.id)}
                      className={`cursor-pointer rounded-lg border p-3 transition flex items-center justify-between gap-3 ${
                        isSelected
                          ? "border-indigo-500/60 bg-indigo-500/10 shadow-sm"
                          : "border-slate-800/80 bg-[#0a0f1d] hover:border-slate-700 hover:bg-[#0c1326]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <GithubIcon className="h-4 w-4 text-slate-400" />
                          <span className="truncate text-xs font-semibold text-white">
                            {repo.full_name}
                          </span>
                          {isSelected && (
                            <span className="rounded bg-indigo-600 px-1.5 py-0.2 text-[10px] font-bold text-white uppercase tracking-wider">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <GitBranch className="h-3 w-3 text-slate-500" />
                            {repo.default_branch}
                          </span>
                          <span>{repo.chunk_count} code chunks</span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge status={repo.indexing_status} />
                        {repo.indexing_status === "completed" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAnalyze(repo.id);
                            }}
                            disabled={analyzingRepoId === repo.id}
                            className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                          >
                            {analyzingRepoId === repo.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ShieldAlert className="h-3 w-3" />
                            )}
                            <span className="hidden sm:inline">Analyze</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* ── Main Detail Workspace (Selected Repository) ────────────────── */}
        {selectedRepo ? (
          <div className="rounded-xl border border-slate-800 bg-[#0d1424] shadow-xl overflow-hidden">
            {/* Repository Context Bar */}
            <div className="border-b border-slate-800 bg-[#0a0f1d] px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400">Active Repository:</span>
                  <span className="text-sm font-bold text-white">{selectedRepo.full_name}</span>
                  <a
                    href={selectedRepo.repository_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-400 hover:text-white transition"
                    title="Open on GitHub"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1 font-mono text-[11px]">
                    <GitBranch className="h-3 w-3 text-slate-500" />
                    {selectedRepo.default_branch}
                  </span>
                  <span>•</span>
                  <span>{selectedRepo.chunk_count} vector chunks</span>
                  {selectedRepo.indexed_commit_sha && (
                    <>
                      <span>•</span>
                      <span className="font-mono text-[11px] text-slate-500">
                        SHA: {selectedRepo.indexed_commit_sha.slice(0, 7)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* View Switcher Tabs */}
              <div className="flex rounded-lg border border-slate-800 bg-[#070b16] p-1 self-start sm:self-auto">
                <button
                  onClick={() => setActiveTab("analysis")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    activeTab === "analysis"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Bug className="h-3.5 w-3.5" />
                  Static Analysis &amp; AI Fixes
                  {summary && summary.total_findings > 0 && (
                    <span className="rounded-full bg-slate-900/80 px-1.5 py-0.2 text-[10px] font-bold text-indigo-300">
                      {summary.total_findings}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("search")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    activeTab === "search"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Search className="h-3.5 w-3.5" />
                  Semantic Vector Search
                </button>
              </div>
            </div>

            {/* TAB 1: Static Analysis Findings & AI Fixes */}
            {activeTab === "analysis" && (
              <div className="p-5 space-y-6">
                {/* Control Bar: Analyze Action + Filters */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleAnalyze(selectedRepo.id)}
                      disabled={analyzingRepoId === selectedRepo.id}
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {analyzingRepoId === selectedRepo.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Running Ruff &amp; Semgrep…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          Run Analysis Engine
                        </>
                      )}
                    </button>
                    {summary?.last_run_at && (
                      <span className="text-[11px] text-slate-500">
                        Last scanned: {new Date(summary.last_run_at).toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  {/* Filter Controls */}
                  <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-slate-500" />
                    <select
                      value={scannerFilter}
                      onChange={(e) => setScannerFilter(e.target.value)}
                      className="rounded-lg border border-slate-800 bg-[#0a0f1d] px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="all">All Scanners</option>
                      <option value="ruff">Ruff</option>
                      <option value="semgrep">Semgrep</option>
                    </select>

                    <select
                      value={severityFilter}
                      onChange={(e) => setSeverityFilter(e.target.value)}
                      className="rounded-lg border border-slate-800 bg-[#0a0f1d] px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
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

                {/* Summary Metrics Cards */}
                {summary && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                    <div className="rounded-lg border border-slate-800 bg-[#0a0f1d] p-3">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Total Findings
                      </span>
                      <p className="mt-1 text-2xl font-bold text-white">
                        {summary.total_findings}
                      </p>
                    </div>

                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                      <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">
                        Critical
                      </span>
                      <p className="mt-1 text-2xl font-bold text-rose-300">
                        {summary.critical_count}
                      </p>
                    </div>

                    <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
                      <span className="text-[11px] font-semibold text-orange-400 uppercase tracking-wider">
                        High
                      </span>
                      <p className="mt-1 text-2xl font-bold text-orange-300">
                        {summary.high_count}
                      </p>
                    </div>

                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                      <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                        Medium
                      </span>
                      <p className="mt-1 text-2xl font-bold text-amber-300">
                        {summary.medium_count}
                      </p>
                    </div>

                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                      <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">
                        Low
                      </span>
                      <p className="mt-1 text-2xl font-bold text-blue-300">
                        {summary.low_count}
                      </p>
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-[#0a0f1d] p-3">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Ruff / Semgrep
                      </span>
                      <p className="mt-1 text-xl font-bold text-white">
                        {summary.ruff_count} <span className="text-slate-500">/</span> {summary.semgrep_count}
                      </p>
                    </div>
                  </div>
                )}

                {/* Findings List State */}
                {findingsLoading && (
                  <div className="flex items-center justify-center py-12 text-xs text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-400" />
                    Querying Ruff &amp; Semgrep findings…
                  </div>
                )}

                {findingsError && (
                  <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-xs text-rose-300">
                    ✗ {findingsError}
                  </div>
                )}

                {!findingsLoading && findings.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-800 py-12 text-center">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
                    <p className="mt-2 text-sm font-semibold text-white">
                      No issues detected matching current filters
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Click &ldquo;Run Analysis Engine&rdquo; above to execute static analysis on this repository.
                    </p>
                  </div>
                )}

                {!findingsLoading && findings.length > 0 && (
                  <div className="space-y-3">
                    {findings.map((f) => {
                      const isExpanded = expandedFindingId === f.id;
                      const fix = fixes[f.id];
                      const isLoadingFix = fixLoading[f.id];
                      const errFix = fixError[f.id];
                      const isApproved = approvedFixes[f.id];

                      return (
                        <div
                          key={f.id}
                          className="rounded-lg border border-slate-800/80 bg-[#0a0f1d] transition hover:border-slate-700 overflow-hidden"
                        >
                          {/* Finding Header Summary */}
                          <div
                            onClick={() =>
                              setExpandedFindingId(isExpanded ? null : f.id)
                            }
                            className="p-4 cursor-pointer flex items-start justify-between gap-3"
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
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-slate-400" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-slate-400" />
                              )}
                            </div>
                          </div>

                          {/* Expanded Finding Detail */}
                          {isExpanded && (
                            <div className="border-t border-slate-800 bg-[#070b16] p-5 space-y-5">
                              {/* Description */}
                              {f.description && (
                                <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                                  {f.description}
                                </div>
                              )}

                              {/* Source Code Snippet */}
                              {f.code_snippet && (
                                <div>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
                                      Flagged Source Snippet
                                    </span>
                                    <button
                                      onClick={() => handleCopy(f.code_snippet!, `orig-${f.id}`)}
                                      className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition"
                                    >
                                      {copiedId === `orig-${f.id}` ? (
                                        <>
                                          <Check className="h-3 w-3 text-emerald-400" />
                                          <span className="text-emerald-400">Copied</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="h-3 w-3" />
                                          Copy Snippet
                                        </>
                                      )}
                                    </button>
                                  </div>
                                  <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-[#040711] p-3 font-mono text-xs leading-relaxed text-indigo-200">
                                    {f.code_snippet}
                                  </pre>
                                </div>
                              )}

                              {/* ── AI Autonomous Bug Fix Section ── */}
                              <div className="border-t border-slate-800/80 pt-4">
                                {/* Trigger button when no fix yet */}
                                {!fix && !isLoadingFix && (
                                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-4">
                                    <div>
                                      <h4 className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                                        <Sparkles className="h-4 w-4 text-indigo-400" />
                                        Synthesize AI Fix &amp; Regression Test
                                      </h4>
                                      <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                                        Leverages Gemini and retrieved AST chunks from pgvector to build unified diffs, root-cause diagnosis, and regression tests.
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => handleGenerateFix(f.id, false)}
                                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500"
                                    >
                                      <Sparkles className="h-3.5 w-3.5" />
                                      Generate Fix
                                    </button>
                                  </div>
                                )}

                                {/* Loading state */}
                                {isLoadingFix && (
                                  <div className="flex items-center justify-center gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-6 text-center">
                                    <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                                    <div className="text-left">
                                      <p className="text-xs font-semibold text-indigo-200">
                                        Generating patch with Gemini &amp; pgvector context…
                                      </p>
                                      <p className="text-[11px] text-slate-400">
                                        Extracting AST chunks, computing unified diffs, and verifying Python syntax.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* Error state */}
                                {errFix && (
                                  <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-300 flex items-center justify-between">
                                    <span>✗ {errFix}</span>
                                    <button
                                      onClick={() => handleGenerateFix(f.id, true)}
                                      className="ml-2 font-semibold underline hover:text-white"
                                    >
                                      Retry
                                    </button>
                                  </div>
                                )}

                                {/* Rendered AI Fix */}
                                {fix && (
                                  <div className="space-y-4">
                                    {/* Explanation & Root Cause Card */}
                                    <div className="rounded-lg border border-indigo-500/30 bg-[#090e1c] p-4 space-y-3">
                                      <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                                          <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                                          Code-Fix AI Diagnosis
                                        </span>
                                        <button
                                          onClick={() => handleGenerateFix(f.id, true)}
                                          disabled={isLoadingFix}
                                          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition"
                                        >
                                          <RotateCcw className="h-3 w-3" />
                                          Regenerate
                                        </button>
                                      </div>
                                      <p className="text-xs text-slate-200 leading-relaxed">
                                        {fix.explanation}
                                      </p>
                                      <div className="rounded border border-slate-800 bg-[#050811] p-3">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                                          Root Cause Analysis
                                        </span>
                                        <p className="mt-1 text-xs text-slate-300">
                                          {fix.root_cause}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Unified Diff Patch */}
                                    <div>
                                      <div className="flex items-center justify-between mb-1.5">
                                        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
                                          <FileCode className="h-3.5 w-3.5 text-indigo-400" />
                                          Unified Diff Patch (Before vs After)
                                        </span>
                                        <button
                                          onClick={() => handleCopy(fix.diff_patch, `diff-${f.id}`)}
                                          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition"
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
                                      <DiffViewer diff={fix.diff_patch} />
                                    </div>

                                    {/* Proposed Corrected Code */}
                                    <div>
                                      <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
                                          Proposed Replacement Code
                                        </span>
                                        <button
                                          onClick={() => handleCopy(fix.proposed_code, `code-${f.id}`)}
                                          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition"
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
                                      <pre className="overflow-x-auto rounded-lg border border-emerald-500/20 bg-[#050811] p-3 font-mono text-xs leading-relaxed text-emerald-300">
                                        {fix.proposed_code}
                                      </pre>
                                    </div>

                                    {/* Regression Test */}
                                    <div>
                                      <div className="flex items-center justify-between mb-1.5">
                                        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
                                          <Terminal className="h-3.5 w-3.5 text-amber-400" />
                                          Synthesized Regression Test (pytest)
                                        </span>
                                        <button
                                          onClick={() => handleCopy(fix.regression_test, `test-${f.id}`)}
                                          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition"
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
                                      <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-[#050811] p-3 font-mono text-xs leading-relaxed text-amber-200">
                                        {fix.regression_test}
                                      </pre>
                                    </div>

                                    {/* Safe Execution Validation Banner & PR Button */}
                                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                      <div className="flex items-start gap-2.5">
                                        <ShieldCheck className="h-4 w-4 mt-0.5 text-emerald-400 shrink-0" />
                                        <div>
                                          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-emerald-300">
                                            {fix.validation_status}
                                          </span>
                                          <p className="mt-1 text-xs text-emerald-200/90 leading-relaxed">
                                            {fix.validation_message || "Python AST parsed and validated in isolated execution sandbox."}
                                          </p>
                                        </div>
                                      </div>

                                      <button
                                        onClick={() => handleApproveFix(f.id)}
                                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                                          isApproved
                                            ? "bg-emerald-600 text-white hover:bg-emerald-500"
                                            : "border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                                        }`}
                                      >
                                        {isApproved ? (
                                          <>
                                            <Check className="h-3.5 w-3.5" />
                                            Approved for PR
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Semantic Vector Search */}
            {activeTab === "search" && (
              <div className="p-5 space-y-4">
                <form onSubmit={handleSearch} className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search code chunks by natural language (e.g. error handling wrapper or token validation)"
                    disabled={searching}
                    className="flex-1 rounded-lg border border-slate-800 bg-[#080d1a] px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={searching || !searchQuery.trim()}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {searching ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Search"
                    )}
                  </button>
                </form>

                {searchError && (
                  <p className="text-xs text-rose-400">{searchError}</p>
                )}

                {searchResults.length > 0 && (
                  <div className="space-y-2 mt-4">
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        className="rounded-lg border border-slate-800 bg-[#0a0f1d] overflow-hidden"
                      >
                        <div
                          onClick={() =>
                            setExpandedResult(
                              expandedResult === result.id ? null : result.id
                            )
                          }
                          className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800/40"
                        >
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <ChunkTypeBadge type={result.chunk_type} />
                            <span className="truncate text-xs font-semibold text-white">
                              {result.symbol_name}
                            </span>
                            <span className="truncate font-mono text-[11px] text-slate-500">
                              {result.file_path}:{result.start_line}–{result.end_line}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded-full bg-indigo-500/15 border border-indigo-500/20 px-2 py-0.5 text-xs font-mono text-indigo-300">
                              {(result.similarity * 100).toFixed(1)}% match
                            </span>
                            {expandedResult === result.id ? (
                              <ChevronDown className="h-4 w-4 text-slate-400" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-400" />
                            )}
                          </div>
                        </div>

                        {expandedResult === result.id && (
                          <pre className="overflow-x-auto border-t border-slate-800 bg-[#050811] p-3 text-xs font-mono leading-relaxed text-slate-300">
                            {result.content}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-800 p-12 text-center">
            <Layers className="mx-auto h-8 w-8 text-slate-700" />
            <h3 className="mt-2 text-sm font-semibold text-white">No Repository Selected</h3>
            <p className="mt-1 text-xs text-slate-500">
              Select an indexed repository above or enter a new GitHub URL to view static analysis and AI fixes.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-slate-800/80 bg-[#080c14] py-6 text-xs text-slate-500">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <span>Code-Fix AI — Autonomous Code Analysis, AI Bug Fixing &amp; Validation</span>
          <span>{completedRepos.length} repositories indexed</span>
        </div>
      </footer>
    </div>
  );
}
