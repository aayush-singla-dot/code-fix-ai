"""Static analysis API router for Ruff and Semgrep findings."""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.analysis import (
    AnalysisSummary,
    AnalyzeRequest,
    FindingResponse,
    FindingsListResponse,
)
from app.services.analysis_service import AnalysisService

logger = logging.getLogger("code_fix_ai.routers.analysis")

router = APIRouter(prefix="/api/repositories", tags=["Static Code Analysis"])


@router.post(
    "/{repository_id}/analyze",
    response_model=FindingsListResponse,
    summary="Trigger static code analysis (Ruff + Semgrep)",
)
async def analyze_repository(
    repository_id: UUID,
    body: Optional[AnalyzeRequest] = None,
):
    """
    Run Ruff and Semgrep on repository source code, normalize findings,
    store them in Supabase, and return structured results with summary counts.
    """
    scanners = body.scanners if body else ["ruff", "semgrep"]
    logger.info("Triggering static analysis for repo %s with scanners: %s", repository_id, scanners)
    try:
        results = await AnalysisService.run_analysis(
            repository_id=repository_id,
            scanners=scanners,
        )
        return results
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except Exception as exc:
        logger.error("Static analysis execution failed for repo %s: %s", repository_id, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {str(exc)}",
        )


@router.get(
    "/{repository_id}/findings",
    response_model=FindingsListResponse,
    summary="List static analysis findings for a repository",
)
async def get_repository_findings(
    repository_id: UUID,
    scanner: Optional[str] = Query(None, description="Filter by scanner: 'ruff' or 'semgrep'"),
    severity: Optional[str] = Query(None, description="Filter by severity: 'critical', 'high', 'medium', 'low', 'informational'"),
):
    """Fetch stored static analysis findings with optional filtering by scanner and severity."""
    try:
        return await AnalysisService.get_findings(
            repository_id=repository_id,
            scanner=scanner,
            severity=severity,
        )
    except Exception as exc:
        logger.error("Failed to retrieve findings for repo %s: %s", repository_id, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve findings.",
        )


@router.get(
    "/{repository_id}/analysis-summary",
    response_model=AnalysisSummary,
    summary="Get analysis findings summary for a repository",
)
async def get_repository_analysis_summary(repository_id: UUID):
    """Fetch aggregated finding counts (total, critical, high, medium, low, info, scanners)."""
    try:
        return await AnalysisService.get_summary(repository_id)
    except Exception as exc:
        logger.error("Failed to retrieve summary for repo %s: %s", repository_id, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve analysis summary.",
        )


@router.get(
    "/{repository_id}/findings/{finding_id}",
    response_model=FindingResponse,
    summary="Get finding details by ID",
)
async def get_finding(repository_id: UUID, finding_id: UUID):
    """Fetch a single finding record by its UUID."""
    finding = await AnalysisService.get_finding_by_id(finding_id)
    if not finding or finding.repository_id != repository_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Finding not found.",
        )
    return finding

