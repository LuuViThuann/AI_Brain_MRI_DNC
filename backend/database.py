"""
database.py — SQLAlchemy engine + session configuration
Loads DATABASE_URL from environment / .env file
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:197004@localhost:5432/brain_mri_db"
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,         
    pool_size=5,
    max_overflow=10,
    echo=False,              
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


# ── Dependency for FastAPI routes ──────────────────────────────
def get_db():
    """Yield a DB session and close it after request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()