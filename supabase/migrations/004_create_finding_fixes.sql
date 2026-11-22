-- Migration 004: Create Finding Fixes and AI Verification Table

CREATE TABLE IF NOT EXISTS finding_fixes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    finding_id UUID NOT NULL REFERENCES analysis_findings(id) ON DELETE CASCADE,
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    explanation TEXT NOT NULL,
    root_cause TEXT NOT NULL,
    original_code TEXT,
    proposed_code TEXT NOT NULL,
    diff_patch TEXT NOT NULL,
    regression_test TEXT NOT NULL,
    validation_status VARCHAR(50) NOT NULL DEFAULT 'unverified',
    validation_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finding_fixes_finding_id ON finding_fixes(finding_id);
CREATE INDEX IF NOT EXISTS idx_finding_fixes_repo_id ON finding_fixes(repository_id);

ALTER TABLE finding_fixes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finding_fixes' AND policyname = 'allow_read_fixes') THEN
        CREATE POLICY allow_read_fixes ON finding_fixes FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finding_fixes' AND policyname = 'allow_all_fixes_service') THEN
        CREATE POLICY allow_all_fixes_service ON finding_fixes FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

