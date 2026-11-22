-- Migration 003: Create Analysis Runs and Findings tables for Ruff and Semgrep

-- 1. Analysis Runs Table
CREATE TABLE IF NOT EXISTS analysis_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
    scanners TEXT[] NOT NULL DEFAULT ARRAY['ruff', 'semgrep'],
    total_findings INT NOT NULL DEFAULT 0,
    critical_count INT NOT NULL DEFAULT 0,
    high_count INT NOT NULL DEFAULT 0,
    medium_count INT NOT NULL DEFAULT 0,
    low_count INT NOT NULL DEFAULT 0,
    info_count INT NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 2. Analysis Findings Table
CREATE TABLE IF NOT EXISTS analysis_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    scanner VARCHAR(50) NOT NULL, -- 'ruff', 'semgrep'
    rule_id VARCHAR(100) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    severity VARCHAR(20) NOT NULL, -- 'critical', 'high', 'medium', 'low', 'informational'
    confidence VARCHAR(20), -- 'high', 'medium', 'low', NULL
    file_path TEXT NOT NULL,
    start_line INT NOT NULL,
    end_line INT NOT NULL,
    start_column INT,
    end_column INT,
    code_snippet TEXT,
    fingerprint VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_repo_scanner_fingerprint UNIQUE (repository_id, scanner, fingerprint)
);

-- 3. Lookup Performance Indexes
CREATE INDEX IF NOT EXISTS idx_analysis_runs_repo_id ON analysis_runs(repository_id);
CREATE INDEX IF NOT EXISTS idx_analysis_findings_repo_id ON analysis_findings(repository_id);
CREATE INDEX IF NOT EXISTS idx_analysis_findings_scanner ON analysis_findings(scanner);
CREATE INDEX IF NOT EXISTS idx_analysis_findings_severity ON analysis_findings(severity);
CREATE INDEX IF NOT EXISTS idx_analysis_findings_fingerprint ON analysis_findings(fingerprint);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_findings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'analysis_runs' AND policyname = 'allow_read_runs') THEN
        CREATE POLICY allow_read_runs ON analysis_runs FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'analysis_runs' AND policyname = 'allow_all_runs_service') THEN
        CREATE POLICY allow_all_runs_service ON analysis_runs FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'analysis_findings' AND policyname = 'allow_read_findings') THEN
        CREATE POLICY allow_read_findings ON analysis_findings FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'analysis_findings' AND policyname = 'allow_all_findings_service') THEN
        CREATE POLICY allow_all_findings_service ON analysis_findings FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

