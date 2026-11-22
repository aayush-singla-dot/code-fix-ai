"""Main FastAPI application entry point for Code-Fix AI."""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import health, auth, repositories, ingestion, analysis, fixes

# Configure structured logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("code_fix_ai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown procedures."""
    logger.info("Starting %s v%s...", settings.APP_NAME, settings.APP_VERSION)
    logger.info("Allowed CORS origins: %s", settings.CORS_ORIGINS)
    yield
    logger.info("Shutting down %s...", settings.APP_NAME)


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Backend API for Code-Fix AI autonomous software engineering platform",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Configure CORS Middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register route modules
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(repositories.router)
app.include_router(ingestion.router)
app.include_router(analysis.router)
app.include_router(fixes.router)


@app.get("/", tags=["Root"])
@app.get("/api", tags=["Root"])
async def root():
    """Root metadata discovery endpoint."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "online",
        "documentation": "/docs",
        "health": "/api/health",
        "db_check": "/api/db-check",
    }

