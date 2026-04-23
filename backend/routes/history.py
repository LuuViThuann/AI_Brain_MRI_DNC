"""
routes/history.py — Diagnostic History API
Endpoints:
  GET    /api/history            → paginated list
  GET    /api/history/{id}       → full detail
  PATCH  /api/history/{id}       → update notes / patient_name
  DELETE /api/history/{id}       → soft delete (removes row)
  DELETE /api/history            → clear all history
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from typing import Optional
import uuid

from database import get_db
from models import DiagnosticHistory

router = APIRouter()


# ── Pydantic schemas ───────────────────────────────────────────

class HistoryUpdateRequest(BaseModel):
    patient_name: Optional[str] = None
    notes:        Optional[str] = None


# ── Endpoints ──────────────────────────────────────────────────

@router.get("/history")
def list_history(
    page:     int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Return paginated diagnostic history, newest first.
    Supports optional search filter on patient_name and image_filename.
    """
    query = db.query(DiagnosticHistory)
    
    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            (DiagnosticHistory.patient_name.ilike(search_filter)) |
            (DiagnosticHistory.image_filename.ilike(search_filter))
        )

    total  = query.count()
    offset = (page - 1) * per_page
    rows   = (
        query.order_by(desc(DiagnosticHistory.timestamp))
        .offset(offset)
        .limit(per_page)
        .all()
    )

    return {
        "total":  total,
        "page":   page,
        "pages":  max(1, -(-total // per_page)),   # ceil division
        "items":  [r.to_summary_dict() for r in rows],
    }


@router.get("/history/{record_id}")
def get_history_record(record_id: str, db: Session = Depends(get_db)):
    """Return full detail for a single diagnostic record (includes blobs)."""
    try:
        uid = uuid.UUID(record_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    row = db.query(DiagnosticHistory).filter(DiagnosticHistory.id == uid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")

    return row.to_full_dict()


@router.patch("/history/{record_id}")
def update_history_record(
    record_id: str,
    body: HistoryUpdateRequest,
    db: Session = Depends(get_db),
):
    """Update editable metadata (patient_name, notes) on a record."""
    try:
        uid = uuid.UUID(record_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    row = db.query(DiagnosticHistory).filter(DiagnosticHistory.id == uid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")

    if body.patient_name is not None:
        row.patient_name = body.patient_name
    if body.notes is not None:
        row.notes = body.notes

    db.commit()
    db.refresh(row)
    return {"status": "updated", "id": str(row.id)}


@router.delete("/history/{record_id}")
def delete_history_record(record_id: str, db: Session = Depends(get_db)):
    """Permanently delete one diagnostic record."""
    try:
        uid = uuid.UUID(record_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    row = db.query(DiagnosticHistory).filter(DiagnosticHistory.id == uid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")

    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": record_id}


@router.delete("/history")
def clear_all_history(db: Session = Depends(get_db)):
    """Delete ALL diagnostic history records."""
    count = db.query(DiagnosticHistory).count()
    db.query(DiagnosticHistory).delete()
    db.commit()
    return {"status": "cleared", "deleted_count": count}