-- Migration 002: Make github_repo_id nullable to support URL-based public repository ingestion
ALTER TABLE repositories ALTER COLUMN github_repo_id DROP NOT NULL;

