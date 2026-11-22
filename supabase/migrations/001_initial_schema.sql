-- Migration 001: Initial Schema & Non-destructive Migration for Repositories and Code Chunks

-- 1. Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Repositories Table & Column Evolution
CREATE TABLE IF NOT EXISTS repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    owner VARCHAR(255) NOT NULL,
    default_branch VARCHAR(100) DEFAULT 'main'
);

ALTER TABLE repositories ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'anonymous';
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS repository_url TEXT;
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS indexed_commit_sha VARCHAR(40);
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS indexing_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill full_name and repository_url for any existing rows
UPDATE repositories 
SET full_name = owner || '/' || name 
WHERE full_name IS NULL;

UPDATE repositories 
SET repository_url = 'https://github.com/' || owner || '/' || name 
WHERE repository_url IS NULL;

-- Enforce unique constraint on full_name
CREATE UNIQUE INDEX IF NOT EXISTS idx_repositories_full_name ON repositories(full_name);

-- 3. Code Chunks Table & Column Evolution
CREATE TABLE IF NOT EXISTS code_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    chunk_type VARCHAR(50) NOT NULL,
    symbol_name TEXT,
    start_line INT NOT NULL,
    end_line INT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(384),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE code_chunks ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);
ALTER TABLE code_chunks ADD COLUMN IF NOT EXISTS commit_sha VARCHAR(40);

-- Backfill content_hash for any existing chunks
UPDATE code_chunks 
SET content_hash = md5(content) 
WHERE content_hash IS NULL;

-- 4. Standard Indexes for High-Performance Queries
CREATE INDEX IF NOT EXISTS idx_code_chunks_repo_id ON code_chunks(repository_id);
CREATE INDEX IF NOT EXISTS idx_code_chunks_file_path ON code_chunks(file_path);
CREATE INDEX IF NOT EXISTS idx_code_chunks_content_hash ON code_chunks(content_hash);
CREATE INDEX IF NOT EXISTS idx_code_chunks_symbol_name ON code_chunks(symbol_name);

-- 5. HNSW Vector Index for Sub-millisecond Cosine Retrieval
CREATE INDEX IF NOT EXISTS idx_code_chunks_embedding_hnsw 
ON code_chunks USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_chunks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'repositories' AND policyname = 'allow_read_repos') THEN
        CREATE POLICY allow_read_repos ON repositories FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'repositories' AND policyname = 'allow_all_repos_service') THEN
        CREATE POLICY allow_all_repos_service ON repositories FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'code_chunks' AND policyname = 'allow_read_chunks') THEN
        CREATE POLICY allow_read_chunks ON code_chunks FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'code_chunks' AND policyname = 'allow_all_chunks_service') THEN
        CREATE POLICY allow_all_chunks_service ON code_chunks FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 7. Repository-Scoped Vector Similarity Search RPC Function
CREATE OR REPLACE FUNCTION match_code_chunks (
    query_embedding vector(384),
    filter_repo_id UUID,
    match_threshold FLOAT DEFAULT 0.0,
    match_count INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    repository_id UUID,
    file_path TEXT,
    chunk_type VARCHAR(50),
    symbol_name TEXT,
    start_line INT,
    end_line INT,
    content TEXT,
    similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
    SELECT
        c.id,
        c.repository_id,
        c.file_path,
        c.chunk_type,
        c.symbol_name,
        c.start_line,
        c.end_line,
        c.content,
        ROUND((1 - (c.embedding <=> query_embedding))::numeric, 4)::float AS similarity
    FROM code_chunks c
    WHERE c.repository_id = filter_repo_id
      AND c.embedding IS NOT NULL
      AND (1 - (c.embedding <=> query_embedding)) >= match_threshold
    ORDER BY c.embedding <=> query_embedding ASC
    LIMIT match_count;
$$;

