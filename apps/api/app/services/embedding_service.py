"""FastEmbed embedding generation service for semantic code search."""

import logging
import os
import tempfile
from pathlib import Path
from typing import List, Optional
import numpy as np
from fastembed import TextEmbedding

logger = logging.getLogger("code_fix_ai.embedding_service")

MODEL_NAME = "BAAI/bge-small-en-v1.5"
EXPECTED_DIMENSION = 384


class EmbeddingService:
    _instance: Optional["EmbeddingService"] = None
    _model: Optional[TextEmbedding] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EmbeddingService, cls).__new__(cls)
            cls._instance._initialize_model()
        return cls._instance

    def _initialize_model(self):
        """Load the FastEmbed ONNX model once, ensuring cache directory is writable in serverless."""
        try:
            cache_dir = os.environ.get(
                "FASTEMBED_CACHE_DIR",
                str(Path(tempfile.gettempdir()) / "fastembed_cache"),
            )
            logger.info("Initializing FastEmbed model: %s (cache: %s)", MODEL_NAME, cache_dir)
            self._model = TextEmbedding(model_name=MODEL_NAME, cache_dir=cache_dir)
            logger.info("FastEmbed model %s loaded successfully.", MODEL_NAME)
        except Exception as e:
            logger.error("Failed to load FastEmbed model %s: %s", MODEL_NAME, e)
            self._model = None

    def is_available(self) -> bool:
        """Check if model is initialized and ready."""
        return self._model is not None

    def embed_texts(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        """Generate 384-dimensional dense vectors for a list of text snippets."""
        if not self._model:
            raise RuntimeError("FastEmbed model is not initialized.")

        if not texts:
            return []

        # Replace empty strings with placeholder to prevent model crashes
        sanitized = [t if t.strip() else "<empty>" for t in texts]

        results: List[List[float]] = []
        try:
            embeddings_generator = self._model.embed(sanitized, batch_size=batch_size)
            for vec in embeddings_generator:
                vec_list = vec.tolist() if isinstance(vec, np.ndarray) else list(vec)
                # Validate vector dimension
                if len(vec_list) != EXPECTED_DIMENSION:
                    raise ValueError(
                        f"Unexpected embedding dimension: got {len(vec_list)}, expected {EXPECTED_DIMENSION}"
                    )
                results.append(vec_list)
        except Exception as e:
            logger.error("Error during embedding generation: %s", e)
            raise

        return results

    def embed_query(self, query: str) -> List[float]:
        """Embed a single query string for semantic vector search."""
        results = self.embed_texts([query])
        if not results:
            raise ValueError("Failed to generate embedding for query.")
        return results[0]


# Singleton helper
def get_embedding_service() -> EmbeddingService:
    return EmbeddingService()

