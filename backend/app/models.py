from datetime import datetime

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Member(Base):
    """Searchable columns plus the original member object, kept without data loss."""

    __tablename__ = "members"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    state: Mapped[str] = mapped_column(String(120), default="", index=True)
    designation: Mapped[str] = mapped_column(String(255), default="", index=True)
    country: Mapped[str] = mapped_column(String(120), default="", index=True)
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    data: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
