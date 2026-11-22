"""Router for AI-powered bug explanations, fix generation, diff patching, and regression test validation."""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.fixes import FindingFixResponse, FixGenerateRequest
from app.services.ai_fix_service import AIFixService

logger = logging.getLogger("code_fix_ai.routers.fixes")

router = APIRouter(prefix="/api/repositories", tags=["AI Bug Fix & Validation"])


@router.post(
    "/{repository_id}/findings/{finding_id}/fix",
    response_model=FindingFixResponse,
    summary="Generate AI explanation, fix patch, and regression test for a finding",
)
async def generate_finding_fix(
    repository_id: UUID,
    finding_id: UUID,
    body: Optional[FixGenerateRequest] = None,
    force: bool = Query(False, description="Force re-generation instead of returning cached fix"),
):
    """
    Orchestrate AI fix pipeline:
    1. Retrieve finding and semantic code context from Supabase pgvector.
    2. Prompt Google Gemini API for explanation, root-cause, patch, and regression test.
    3. Safely validate Python AST syntax and linter resolution.
    4. Store fix in Supabase and return structured response.
    """
    logger.info(
        "AI fix requested for finding %s (repo %s, force=%s)",
        finding_id,
        repository_id,
        force,
    )
    try:
        custom_instructions = body.custom_instructions if body else None
        fix_response = await AIFixService.get_or_generate_fix(
            repository_id=repository_id,
            finding_id=finding_id,
            custom_instructions=custom_instructions,
            force_regenerate=force,
        )
        return fix_response
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except Exception as exc:
        logger.error(
            "Failed generating fix for finding %s: %s",
            finding_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fix generation error: {str(exc)}",
        )


@router.get(
    "/{repository_id}/findings/{finding_id}/fix",
    response_model=FindingFixResponse,
    summary="Get previously generated fix for a finding",
)
async def get_finding_fix(
    repository_id: UUID,
    finding_id: UUID,
):
    """Retrieve existing cached fix without re-invoking the LLM."""
    try:
        fix = await AIFixService.get_or_generate_fix(
            repository_id=repository_id,
            finding_id=finding_id,
            force_regenerate=False,
        )
        return fix
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except Exception as exc:
        logger.error(
            "Error retrieving fix for finding %s: %s",
            finding_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve fix.",
        )

