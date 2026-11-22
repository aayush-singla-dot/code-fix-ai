/**
 * Code-Fix AI - API Client
 * Typed client for communicating with the FastAPI backend.
 */

/**
 * Resolves the API base URL.
 * In production Vercel Multi-Service, frontend and backend share the same domain,
 * so same-domain relative paths (e.g. "" + "/api/...") are used.
 * In local development, defaults to the dedicated FastAPI dev server (http://127.0.0.1:8000).
 * Can be explicitly overridden with NEXT_PUBLIC_API_URL.
 */
function resolveBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL !== undefined) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    return "";
  }
  return "http://127.0.0.1:8000";
}

export const API_BASE_URL = resolveBaseUrl();

// ── Core response types ──────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
}

export interface DbCheckResponse {
  status: string;
  database: string;
  timestamp: string;
  detail?: string;
}

export interface Repository {
  id: string;
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
  repository_url: string;
  indexed_commit_sha: string | null;
  indexing_status: "pending" | "indexing" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  chunk_count: number;
}

export interface ListRepositoriesResponse {
  repositories: Repository[];
  count: number;
}

export interface IngestResponse {
  repository_id: string;
  full_name: string;
  commit_sha: string;
  files_scanned: number;
  chunks_extracted: number;
  chunks_embedded: number;
  status: string;
  elapsed_seconds: number;
  message: string;
}

export interface SearchResult {
  id: string;
  repository_id: string;
  file_path: string;
  chunk_type: string;
  symbol_name: string;
  start_line: number;
  end_line: number;
  content: string;
  similarity: number;
}

export interface SearchResponse {
  repository_id: string;
  query: string;
  results: SearchResult[];
  count: number;
}

export interface GitHubAuthStatusResponse {
  configured: boolean;
  authenticated: boolean;
  username: string | null;
  login_url: string | null;
  client_id_configured: boolean;
  message: string;
}

// ── Milestone 3: Static Analysis types ───────────────────────────────────────

export type SeverityLevel =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "informational";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface Finding {
  id: string;
  repository_id: string;
  scanner: "ruff" | "semgrep";
  rule_id: string;
  title: string;
  description: string | null;
  severity: SeverityLevel;
  confidence: ConfidenceLevel | null;
  file_path: string;
  start_line: number;
  end_line: number;
  start_column: number | null;
  end_column: number | null;
  code_snippet: string | null;
  fingerprint: string;
  created_at: string;
}

export interface AnalysisSummary {
  repository_id: string;
  total_findings: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  ruff_count: number;
  semgrep_count: number;
  last_run_at: string | null;
}

export interface FindingsListResponse {
  repository_id: string;
  findings: Finding[];
  count: number;
  summary: AnalysisSummary;
}

// ── Milestone 4: AI Bug Fix & Validation types ───────────────────────────────

export interface FindingFix {
  id: string;
  finding_id: string;
  repository_id: string;
  explanation: string;
  root_cause: string;
  original_code: string | null;
  proposed_code: string;
  diff_patch: string;
  regression_test: string;
  validation_status: string;
  validation_message: string | null;
  relevant_chunks?: SearchResult[];
  created_at: string;
}

// ── Generic fetch helper ─────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    cache: "no-store",
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody.detail ||
        `Request to ${path} failed with status ${response.status}`
    );
  }

  return response.json() as Promise<T>;
}

// ── Milestone 1 endpoints ────────────────────────────────────────────────────

export async function checkHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/api/health");
}

export async function checkDatabase(): Promise<DbCheckResponse> {
  return apiFetch<DbCheckResponse>("/api/db-check");
}

// ── Milestone 2: Repository endpoints ───────────────────────────────────────

export async function listRepositories(): Promise<ListRepositoriesResponse> {
  return apiFetch<ListRepositoriesResponse>("/api/repositories");
}

export async function getRepository(repoId: string): Promise<Repository> {
  return apiFetch<Repository>(`/api/repositories/${repoId}`);
}

export async function ingestRepository(
  repositoryUrl: string,
  branch?: string
): Promise<IngestResponse> {
  return apiFetch<IngestResponse>("/api/ingest", {
    method: "POST",
    body: JSON.stringify({ repository_url: repositoryUrl, branch: branch ?? null }),
  });
}

export async function searchChunks(
  repoId: string,
  query: string,
  topK = 5,
  threshold = 0.0
): Promise<SearchResponse> {
  return apiFetch<SearchResponse>(`/api/repositories/${repoId}/search`, {
    method: "POST",
    body: JSON.stringify({ query, top_k: topK, threshold }),
  });
}

// ── Milestone 2: GitHub Auth endpoint ───────────────────────────────────────

export async function getGitHubAuthStatus(): Promise<GitHubAuthStatusResponse> {
  return apiFetch<GitHubAuthStatusResponse>("/api/auth/github/status");
}

// ── Milestone 3: Static Analysis endpoints ──────────────────────────────────

export async function triggerAnalysis(
  repoId: string,
  scanners: string[] = ["ruff", "semgrep"]
): Promise<FindingsListResponse> {
  return apiFetch<FindingsListResponse>(`/api/repositories/${repoId}/analyze`, {
    method: "POST",
    body: JSON.stringify({ scanners }),
  });
}

export async function getFindings(
  repoId: string,
  scanner?: string,
  severity?: string
): Promise<FindingsListResponse> {
  const params = new URLSearchParams();
  if (scanner && scanner !== "all") params.append("scanner", scanner);
  if (severity && severity !== "all") params.append("severity", severity);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<FindingsListResponse>(
    `/api/repositories/${repoId}/findings${qs}`
  );
}

export async function getAnalysisSummary(
  repoId: string
): Promise<AnalysisSummary> {
  return apiFetch<AnalysisSummary>(
    `/api/repositories/${repoId}/analysis-summary`
  );
}

// ── Milestone 4: AI Bug Fix & Validation endpoints ──────────────────────────

export async function generateFindingFix(
  repoId: string,
  findingId: string,
  customInstructions?: string,
  force = false
): Promise<FindingFix> {
  const qs = force ? "?force=true" : "";
  return apiFetch<FindingFix>(
    `/api/repositories/${repoId}/findings/${findingId}/fix${qs}`,
    {
      method: "POST",
      body: JSON.stringify({ custom_instructions: customInstructions ?? null }),
    }
  );
}

export async function getFindingFix(
  repoId: string,
  findingId: string
): Promise<FindingFix> {
  return apiFetch<FindingFix>(
    `/api/repositories/${repoId}/findings/${findingId}/fix`
  );
}
