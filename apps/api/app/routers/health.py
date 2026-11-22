"""Health and system probe endpoints for Code-Fix AI."""

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from app.config import settings
from app.database import check_db_connection

router = APIRouter(tags=["Health & Diagnostics"])


class HealthResponse(BaseModel):
    status: str
    version: str
    service: str
    timestamp: str


class DbCheckResponse(BaseModel):
    status: str
    database: str
    timestamp: str
    message: str


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Verify that the FastAPI service is running and responsive."""
    return HealthResponse(
        status="ok",
        version=settings.APP_VERSION,
        service=settings.APP_NAME,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/db-check", response_model=DbCheckResponse)
async def db_check():
    """Verify active connectivity to Supabase PostgreSQL without leaking credentials."""
    is_connected, message = await check_db_connection()
    timestamp = datetime.now(timezone.utc).isoformat()

    if not is_connected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "error",
                "database": "disconnected",
                "timestamp": timestamp,
                "message": message,
            },
        )

    return DbCheckResponse(
        status="ok",
        database="connected",
        timestamp=timestamp,
        message=message,
    )

