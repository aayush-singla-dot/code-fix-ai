"""Repository orchestration service: cloning, AST parsing, and vector persistence."""

import logging
import shutil
import time
from typing import Dict, List, Optional
from uuid import UUID
from sqlalchemy import text
from app.database import get_engine
from app.services.github_service import GitHubService
from app.services.parser_service import PythonParserService
from app.services.vector_service import VectorService

logger = logging.getLogger("code_fix_ai.repository_service")


class RepositoryService:
    @classmethod
    async def get_or_create_repository(
        cls,
        full_name: str,
        repository_url: str,
        owner: str,
        name: str,
        default_branch: str = "main",
    ) -> dict:
        """Upsert repository record in Supabase."""
        engine = get_engine()
        async with engine.begin() as conn:
            res = await conn.execute(
                text("""
                    INSERT INTO repositories (
                        owner,
                        name,
                        full_name,
                        default_branch,
                        repository_url,
                        indexing_status
                    ) VALUES (
                        :owner,
                        :name,
                        :full_name,
                        :default_branch,
                        :repository_url,
                        'pending'
                    )
                    ON CONFLICT (full_name) DO UPDATE 
                    SET repository_url = EXCLUDED.repository_url,
                        default_branch = EXCLUDED.default_branch,
                        updated_at = NOW()
                    RETURNING id, owner, name, full_name, default_branch, repository_url, indexed_commit_sha, indexing_status, created_at, updated_at;
                """),
                {
                    "owner": owner,
                    "name": name,
                    "full_name": full_name,
                    "default_branch": default_branch,
                    "repository_url": repository_url,
                },
            )
            row = res.fetchone()

        return {
            "id": row.id,
            "owner": row.owner,
            "name": row.name,
            "full_name": row.full_name,
            "default_branch": row.default_branch,
            "repository_url": row.repository_url,
            "indexed_commit_sha": row.indexed_commit_sha,
            "indexing_status": row.indexing_status,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }

    @classmethod
    async def list_repositories(cls) -> List[dict]:
        """Fetch all repositories with their indexed chunk counts."""
        engine = get_engine()
        async with engine.connect() as conn:
            res = await conn.execute(
                text("""
                    SELECT 
                        r.id,
                        r.owner,
                        r.name,
                        r.full_name,
                        r.default_branch,
                        r.repository_url,
                        r.indexed_commit_sha,
                        r.indexing_status,
                        r.created_at,
                        r.updated_at,
                        COUNT(c.id)::int AS chunk_count
                    FROM repositories r
                    LEFT JOIN code_chunks c ON r.id = c.repository_id
                    GROUP BY r.id
                    ORDER BY r.updated_at DESC;
                """)
            )
            rows = res.fetchall()

        return [
            {
                "id": str(r.id),
                "owner": r.owner,
                "name": r.name,
                "full_name": r.full_name,
                "default_branch": r.default_branch,
                "repository_url": r.repository_url,
                "indexed_commit_sha": r.indexed_commit_sha,
                "indexing_status": r.indexing_status,
                "created_at": r.created_at,
                "updated_at": r.updated_at,
                "chunk_count": r.chunk_count,
            }
            for r in rows
        ]

    @classmethod
    async def get_repository_by_id(cls, repository_id: UUID) -> Optional[dict]:
        """Fetch a single repository record by UUID."""
        engine = get_engine()
        async with engine.connect() as conn:
            res = await conn.execute(
                text("""
                    SELECT 
                        r.id,
                        r.owner,
                        r.name,
                        r.full_name,
                        r.default_branch,
                        r.repository_url,
                        r.indexed_commit_sha,
                        r.indexing_status,
                        r.created_at,
                        r.updated_at,
                        COUNT(c.id)::int AS chunk_count
                    FROM repositories r
                    LEFT JOIN code_chunks c ON r.id = c.repository_id
                    WHERE r.id = CAST(:repo_id AS uuid)
                    GROUP BY r.id;
                """),
                {"repo_id": str(repository_id)},
            )
            r = res.fetchone()
            if not r:
                return None

        return {
            "id": str(r.id),
            "owner": r.owner,
            "name": r.name,
            "full_name": r.full_name,
            "default_branch": r.default_branch,
            "repository_url": r.repository_url,
            "indexed_commit_sha": r.indexed_commit_sha,
            "indexing_status": r.indexing_status,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
            "chunk_count": r.chunk_count,
        }

    @classmethod
    async def ingest_pipeline(
        cls,
        repository_url: str,
        branch: Optional[str] = None,
    ) -> dict:
        """Run complete ingestion: Git clone -> Python file discovery -> Tree-sitter parse -> Vector embeddings -> Supabase storage."""
        start_time = time.time()
        owner, name, full_name = GitHubService.parse_repo_url(repository_url)

        # 1. Upsert repository in database
        repo_data = await cls.get_or_create_repository(
            full_name=full_name,
            repository_url=repository_url,
            owner=owner,
            name=name,
            default_branch=branch or "main",
        )
        repo_id = repo_data["id"]

        # Update status to indexing
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.execute(
                text("UPDATE repositories SET indexing_status = 'indexing' WHERE id = CAST(:id AS uuid)"),
                {"id": str(repo_id)},
            )

        clone_path = None
        try:
            # 2. Shallow clone repository
            logger.info("Cloning repository %s (branch: %s)...", full_name, branch or "default")
            clone_path, commit_sha = GitHubService.clone_repository(
                repo_url=repository_url,
                branch=branch,
            )

            # 3. Discover Python source files
            py_files = GitHubService.collect_python_files(clone_path)
            logger.info("Found %d Python source files in %s", len(py_files), full_name)

            # 4. Parse files with Tree-sitter into structural code chunks
            all_chunks = []
            for file_path in py_files:
                chunks = PythonParserService.parse_file(
                    file_path=file_path,
                    repo_root=clone_path,
                    commit_sha=commit_sha,
                )
                all_chunks.extend(chunks)

            logger.info(
                "Parsed %d structural AST chunks across %d files in %s",
                len(all_chunks),
                len(py_files),
                full_name,
            )

            # 5. Generate embeddings and persist in Supabase pgvector
            created_count, reused_count = await VectorService.ingest_chunks(
                repository_id=repo_id,
                chunks=all_chunks,
                commit_sha=commit_sha,
            )

            # 6. Update repository status to completed
            async with engine.begin() as conn:
                await conn.execute(
                    text("""
                        UPDATE repositories 
                        SET indexing_status = 'completed',
                            indexed_commit_sha = :sha,
                            default_branch = COALESCE(:branch, default_branch),
                            updated_at = NOW()
                        WHERE id = CAST(:id AS uuid)
                    """),
                    {
                        "id": str(repo_id),
                        "sha": commit_sha,
                        "branch": branch,
                    },
                )

            elapsed = round(time.time() - start_time, 2)
            logger.info(
                "Ingestion completed for %s: %d chunks (%d new, %d reused) in %.2fs",
                full_name,
                len(all_chunks),
                created_count,
                reused_count,
                elapsed,
            )

            return {
                "repository_id": repo_id,
                "full_name": full_name,
                "commit_sha": commit_sha,
                "files_scanned": len(py_files),
                "chunks_extracted": len(all_chunks),
                "chunks_embedded": created_count,
                "status": "completed",
                "elapsed_seconds": elapsed,
                "message": f"Successfully indexed {len(all_chunks)} chunks across {len(py_files)} Python files in {elapsed}s",
            }

        except Exception as exc:
            logger.error("Ingestion failed for %s: %s", full_name, exc, exc_info=True)
            async with engine.begin() as conn:
                await conn.execute(
                    text("UPDATE repositories SET indexing_status = 'failed' WHERE id = CAST(:id AS uuid)"),
                    {"id": str(repo_id)},
                )
            raise

        finally:
            # 7. Clean up scratch clone directory
            if clone_path and clone_path.exists():
                logger.info("Cleaning up temporary clone directory: %s", clone_path)
                shutil.rmtree(clone_path, ignore_errors=True)

