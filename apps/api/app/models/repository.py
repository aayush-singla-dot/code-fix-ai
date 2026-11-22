"""SQLAlchemy model for connected GitHub repositories."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import BigInteger, Column, DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Repository(Base):
    __tablename__ = "repositories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(255), default="anonymous", nullable=True)
    github_repo_id = Column(BigInteger, nullable=True)
    owner = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    full_name = Column(String(255), unique=True, nullable=False)
    default_branch = Column(String(100), default="main", nullable=False)
    repository_url = Column(Text, nullable=False)
    indexed_commit_sha = Column(String(40), nullable=True)
    indexing_status = Column(String(50), default="pending", nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    chunks = relationship(
        "CodeChunk",
        back_populates="repository",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

