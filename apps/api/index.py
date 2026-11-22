"""Vercel Serverless Function entrypoint for Code-Fix AI FastAPI backend.

This entrypoint exports the ASGI `app` instance for Vercel's Python runtime.
"""

import sys
from pathlib import Path

# Ensure the root of apps/api is in the Python search path
API_ROOT = Path(__file__).resolve().parent
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

# Export the initialized FastAPI application
from app.main import app  # noqa: E402, F401

