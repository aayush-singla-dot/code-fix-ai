"""Database connection and health verification for Supabase PostgreSQL."""

import logging
import re
import ssl
from typing import Optional, Tuple
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from app.config import settings

logger = logging.getLogger("code_fix_ai.database")


def get_async_db_url(raw_url: str) -> str:
    """Normalize connection URL to use SQLAlchemy's asyncpg driver."""
    if not raw_url:
        return ""
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql+asyncpg://", 1)
    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return raw_url


def mask_credentials(text_str: str) -> str:
    """Mask credentials in strings and URLs for safe logging."""
    if not text_str:
        return "<empty>"
    # Mask password pattern :password@
    masked = re.sub(r":([^@/]+)@", ":****@", text_str)
    return masked


_engine: Optional[AsyncEngine] = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


def get_engine() -> Optional[AsyncEngine]:
    """Lazy initialize and return the async SQLAlchemy engine."""
    global _engine, _session_factory
    if _engine is not None:
        return _engine

    raw_url = settings.SUPABASE_DB_URL
    if not raw_url:
        logger.warning("SUPABASE_DB_URL is not set.")
        return None

    async_url = get_async_db_url(raw_url)
    connect_args = {}

    # Supabase cloud pooler/direct connections require SSL
    if "supabase.co" in async_url or "supabase.com" in async_url:
        # Create standard SSL context
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
        connect_args["ssl"] = ssl_ctx

    try:
        # Serverless-friendly pool limits to prevent Supabase connection exhaustion
        _engine = create_async_engine(
            async_url,
            echo=False,
            pool_pre_ping=True,
            pool_size=2,
            max_overflow=3,
            pool_recycle=300,
            connect_args=connect_args,
        )
        _session_factory = async_sessionmaker(
            bind=_engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
        logger.info(
            "SQLAlchemy async engine initialized successfully for %s",
            mask_credentials(async_url),
        )
        return _engine
    except Exception as exc:
        logger.error(
            "Error creating database engine: %s",
            mask_credentials(str(exc)),
        )
        return None


async def check_db_connection() -> Tuple[bool, str]:
    """Execute a lightweight probe query against Supabase PostgreSQL.

    Guarantees no credentials or secrets are leaked in results or exceptions.
    """
    engine = get_engine()
    if engine is None:
        return False, "Database engine is not initialized (check SUPABASE_DB_URL in .env)"

    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            row = result.scalar()
            if row == 1:
                return True, "Supabase PostgreSQL connected successfully (handshake verified)"
            return False, "Unexpected database probe response"
    except Exception as exc:
        err_msg = mask_credentials(str(exc))
        logger.error("Supabase probe failed: %s", err_msg)
        return False, f"Database handshake failed: {type(exc).__name__}"

