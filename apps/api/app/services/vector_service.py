"""Supabase vector store ingestion, deduplication, and semantic retrieval service."""

import logging
import time
from typing import List, Tuple
from uuid import UUID
from sqlalchemy import text
from app.database import get_engine
from app.services.embedding_service import get_embedding_service
from app.services.parser_service import ParsedChunk

logger = logging.getLogger("code_fix_ai.vector_service")


class VectorService:
    @staticmethod
    def _format_vector(embedding: List[float]) -> str:
        """Format Python float list into PostgreSQL vector literal '[v1, v2, ...]'."""
        return "[" + ",".join(str(round(v, 6)) for v in embedding) + "]"

    @classmethod
    async def ingest_chunks(
        cls,
        repository_id: UUID,
        chunks: List[ParsedChunk],
        commit_sha: str,
    ) -> Tuple[int, int]:
        """Store code chunks and embeddings in Supabase with deduplication and stale chunk pruning.

        Returns (chunks_created, chunks_reused).
        """
        if not chunks:
            return 0, 0

        engine = get_engine()
        embedder = get_embedding_service()

        async with engine.connect() as conn:
            # 1. Fetch existing chunk hashes for this repository to avoid duplicate embeddings
            res = await conn.execute(
                text(
                    "SELECT content_hash FROM code_chunks WHERE repository_id = CAST(:repo_id AS uuid)"
                ),
                {"repo_id": str(repository_id)},
            )
            existing_hashes = {row[0] for row in res.fetchall()}

        active_hashes = {c.content_hash for c in chunks}
        new_chunks = [c for c in chunks if c.content_hash not in existing_hashes]
        reused_count = len(chunks) - len(new_chunks)

        logger.info(
            "Repository %s: %d total chunks, %d existing (reused), %d new chunks to embed",
            repository_id,
            len(chunks),
            reused_count,
            len(new_chunks),
        )

        # 2. Generate embeddings for new chunks in batches
        if new_chunks:
            chunk_texts = [f"# {c.symbol_name} ({c.chunk_type})\n{c.content}" for c in new_chunks]
            embeddings = embedder.embed_texts(chunk_texts, batch_size=32)

            # 3. Batch insert new chunks
            async with engine.begin() as conn:
                for c, emb in zip(new_chunks, embeddings):
                    vec_str = cls._format_vector(emb)
                    await conn.execute(
                        text("""
                            INSERT INTO code_chunks (
                                repository_id,
                                file_path,
                                chunk_type,
                                symbol_name,
                                start_line,
                                end_line,
                                content,
                                embedding,
                                content_hash,
                                commit_sha
                            ) VALUES (
                                CAST(:repo_id AS uuid),
                                :file_path,
                                :chunk_type,
                                :symbol_name,
                                :start_line,
                                :end_line,
                                :content,
                                CAST(:embedding AS vector),
                                :content_hash,
                                :commit_sha
                            )
                            ON CONFLICT DO NOTHING;
                        """),
                        {
                            "repo_id": str(repository_id),
                            "file_path": c.file_path,
                            "chunk_type": c.chunk_type,
                            "symbol_name": c.symbol_name,
                            "start_line": c.start_line,
                            "end_line": c.end_line,
                            "content": c.content,
                            "embedding": vec_str,
                            "content_hash": c.content_hash,
                            "commit_sha": commit_sha,
                        },
                    )

        # 4. Remove stale chunks that no longer exist in the repository
        #    Use unnest() to avoid SQLAlchemy tuple binding issues with NOT IN
        async with engine.begin() as conn:
            if active_hashes:
                await conn.execute(
                    text("""
                        DELETE FROM code_chunks
                        WHERE repository_id = CAST(:repo_id AS uuid)
                          AND content_hash NOT IN (
                              SELECT unnest(CAST(:hashes AS text[]))
                          )
                    """),
                    {
                        "repo_id": str(repository_id),
                        "hashes": list(active_hashes),
                    },
                )
            else:
                # No active chunks means the repo is empty — delete all
                await conn.execute(
                    text(
                        "DELETE FROM code_chunks WHERE repository_id = CAST(:repo_id AS uuid)"
                    ),
                    {"repo_id": str(repository_id)},
                )

        return len(new_chunks), reused_count

    @classmethod
    async def semantic_search(
        cls,
        repository_id: UUID,
        query: str,
        top_k: int = 5,
        threshold: float = 0.0,
    ) -> List[dict]:
        """Perform repository-scoped cosine similarity search using the Supabase RPC function."""
        engine = get_engine()
        embedder = get_embedding_service()

        query_vec = embedder.embed_query(query)
        vec_str = cls._format_vector(query_vec)

        async with engine.connect() as conn:
            res = await conn.execute(
                text("""
                    SELECT 
                        id,
                        repository_id,
                        file_path,
                        chunk_type,
                        symbol_name,
                        start_line,
                        end_line,
                        content,
                        similarity
                    FROM match_code_chunks(
                        CAST(:vec AS vector),
                        CAST(:repo_id AS uuid),
                        :threshold,
                        :top_k
                    );
                """),
                {
                    "vec": vec_str,
                    "repo_id": str(repository_id),
                    "threshold": float(threshold),
                    "top_k": int(top_k),
                },
            )
            rows = res.fetchall()

        return [
            {
                "id": str(row.id),
                "repository_id": str(row.repository_id),
                "file_path": row.file_path,
                "chunk_type": row.chunk_type,
                "symbol_name": row.symbol_name,
                "start_line": row.start_line,
                "end_line": row.end_line,
                "content": row.content,
                "similarity": float(row.similarity),
            }
            for row in rows
        ]

