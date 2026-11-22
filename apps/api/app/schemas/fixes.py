"""Pydantic schemas for AI-powered fix generation, explanation, and test validation."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class FixGenerateRequest(BaseModel):
    custom_instructions: Optional[str] = Field(
        None,
        description="Optional developer guidance or constraints for fix generation",
    )


class FindingFixResponse(BaseModel):
    id: UUID
    finding_id: UUID
    repository_id: UUID
    explanation: str = Field(..., description="Plain-language breakdown of the issue and why it matters")
    root_cause: str = Field(..., description="Underlying architectural or syntactic root cause")
    original_code: Optional[str] = Field(None, description="Original offending code snippet")
    proposed_code: str = Field(..., description="Proposed replacement code resolving the finding")
    diff_patch: str = Field(..., description="Unified diff formatted patch for review")
    regression_test: str = Field(..., description="Pytest test case asserting proper behavior and regression prevention")
    validation_status: str = Field(..., description="Execution/AST verification status, e.g. 'verified_syntax_and_linter'")
    validation_message: Optional[str] = Field(None, description="Verification details from safe execution sandbox")
    relevant_chunks: Optional[List[Dict[str, Any]]] = Field(
        default=[],
        description="Code context chunks retrieved via semantic pgvector search",
    )
    created_at: datetime

    class Config:
        from_attributes = True

