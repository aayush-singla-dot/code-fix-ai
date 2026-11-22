"""Repository management router — list, fetch, and status endpoints."""

import logging
from uuid import UUID
from fastapi import APIRouter, HTTPException, status

from app.services.repository_service import RepositoryService

logger = logging.getLogger("code_fix_ai.routers.repositories")

router = APIRouter(prefix="/api/repositories", tags=["Repositories"])


@router.get("", summary="List all indexed repositories")
async def list_repositories():
    """Return all repositories with their indexing status and chunk counts."""
    try:
        repos = await RepositoryService.list_repositories()
        return {"repositories": repos, "count": len(repos)}
    except Exception as exc:
        logger.error("Failed to list repositories: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve repositories.",
        )


@router.get("/{repository_id}", summary="Get a repository by ID")
async def get_repository(repository_id: UUID):
    """Fetch a single repository record by its UUID."""
    try:
        repo = await RepositoryService.get_repository_by_id(repository_id)
        if repo is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Repository {repository_id} not found.",
            )
        return repo
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to fetch repository %s: %s", repository_id, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve repository.",
        )

