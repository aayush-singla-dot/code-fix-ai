"""Ingestion and semantic search router."""

import logging
from uuid import UUID
from fastapi import APIRouter, HTTPException, BackgroundTasks, status
from pydantic import BaseModel, HttpUrl, field_validator
from typing import Optional

from app.services.repository_service import RepositoryService
from app.services.vector_service import VectorService

logger = logging.getLogger("code_fix_ai.routers.ingestion")

router = APIRouter(prefix="/api", tags=["Ingestion & Search"])


# ── Request / Response schemas ──────────────────────────────────────────────

class IngestRequest(BaseModel):
    repository_url: str
    branch: Optional[str] = None

    @field_validator("repository_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("repository_url must not be empty.")
        if "github.com" not in v and "/" not in v:
            raise ValueError(
                "repository_url must be a GitHub URL (https://github.com/owner/repo) "
                "or short form (owner/repo)."
            )
        return v


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    threshold: float = 0.0

    @field_validator("query")
    @classmethod
    def validate_query(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("query must not be empty.")
        return v

    @field_validator("top_k")
    @classmethod
    def validate_top_k(cls, v: int) -> int:
        if not (1 <= v <= 50):
            raise ValueError("top_k must be between 1 and 50.")
        return v


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/ingest", summary="Ingest a GitHub repository into the vector store")
async def ingest_repository(body: IngestRequest, background_tasks: BackgroundTasks):
    """
    Clone a public GitHub repository, parse Python source files with Tree-sitter,
    generate FastEmbed embeddings, and store code chunks in Supabase pgvector.

    Runs synchronously (may take 30–120 seconds for large repos).
    """
    logger.info("Ingest request received for: %s (branch=%s)", body.repository_url, body.branch)
    try:
        result = await RepositoryService.ingest_pipeline(
            repository_url=body.repository_url,
            branch=body.branch,
        )
        return result
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    except RuntimeError as exc:
        logger.error("Ingestion runtime error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion failed: {str(exc)}",
        )
    except Exception as exc:
        logger.error("Unexpected ingestion error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during ingestion.",
        )


@router.post(
    "/repositories/{repository_id}/search",
    summary="Semantic code search within an indexed repository",
)
async def search_repository(repository_id: UUID, body: SearchRequest):
    """
    Embed the query string with FastEmbed and perform cosine similarity search
    against code chunks stored in Supabase pgvector for the given repository.
    """
    try:
        results = await VectorService.semantic_search(
            repository_id=repository_id,
            query=body.query,
            top_k=body.top_k,
            threshold=body.threshold,
        )
        return {
            "repository_id": str(repository_id),
            "query": body.query,
            "results": results,
            "count": len(results),
        }
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    except Exception as exc:
        logger.error(
            "Semantic search failed for repo %s: %s", repository_id, exc, exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Semantic search failed.",
        )

