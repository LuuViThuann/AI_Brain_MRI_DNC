"""
models.py — SQLAlchemy ORM models
DiagnosticHistory: stores every completed diagnosis for history tracking.
"""

import uuid
from datetime import datetime, timezone

# pyrefly: ignore [missing-import]
from sqlalchemy import Column, String, DateTime, Boolean, Float, Text, Integer
# pyrefly: ignore [missing-import]
from sqlalchemy.dialects.postgresql import UUID, JSONB

from database import Base


class DiagnosticHistory(Base):
    """
    One row per completed MRI diagnosis.

    Columns
    -------
    id               : UUID primary key (auto-generated)
    patient_name     : Optional label provided by clinician
    timestamp        : UTC time of diagnosis
    image_filename   : Original upload filename
    image_base64     : Full base64 PNG of MRI image (data URI)  ← for thumbnail
    tumor_detected   : Quick-lookup boolean
    confidence       : CNN confidence score 0–1
    tumor_area_pct   : % of scan occupied by tumor mask
    location_hint    : Human-readable location string from CNN
    severity         : low / medium / high
    prediction_data  : Full prediction JSON blob
    report_data      : Full AI report JSON blob
    xai_data         : XAI results (Grad-CAM, rules, SHAP) – may be large
    mask_data        : 256×256 segmentation mask (stored as nested list)
    processing_time  : Seconds taken on backend
    model_version    : e.g. "U-Net v1.0"
    notes            : Free-text clinician notes (editable post-save)
    """

    __tablename__ = "diagnostic_history"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    patient_name    = Column(String(120), nullable=True, default=None)
    timestamp       = Column(DateTime, default=datetime.now, index=True)
    image_filename  = Column(String(255), nullable=False)
    image_base64    = Column(Text, nullable=True)   

    # Quick-access columns (also embedded in prediction_data)
    tumor_detected  = Column(Boolean, nullable=False, default=False)
    confidence      = Column(Float,   nullable=False, default=0.0)
    tumor_area_pct  = Column(Float,   nullable=False, default=0.0)
    location_hint   = Column(String(200), nullable=True)
    severity        = Column(String(20),  nullable=True)

    # Heavy JSON blobs
    prediction_data = Column(JSONB, nullable=True)
    report_data     = Column(JSONB, nullable=True)
    xai_data        = Column(JSONB, nullable=True)
    mask_data       = Column(JSONB, nullable=True) 

    processing_time = Column(Float, nullable=True)
    model_version   = Column(String(50), nullable=True, default="U-Net v1.0")
    notes           = Column(Text, nullable=True, default="")

    def to_summary_dict(self) -> dict:
        """Lightweight dict for list views (no heavy blobs)."""
        return {
            "id":             str(self.id),
            "patient_name":   self.patient_name,
            "timestamp":      self.timestamp.isoformat() if self.timestamp else None,
            "image_filename": self.image_filename,
            "image_base64":   self.image_base64, 
            "tumor_detected": self.tumor_detected,
            "confidence":     round(self.confidence, 4),
            "tumor_area_pct": round(self.tumor_area_pct, 4),
            "location_hint":  self.location_hint,
            "severity":       self.severity,
            "processing_time":self.processing_time,
            "model_version":  self.model_version,
            "notes":          self.notes,
        }

    def to_full_dict(self) -> dict:
        """Full dict including heavy blobs — used for detail view."""
        d = self.to_summary_dict()
        d.update({
            "prediction_data": self.prediction_data,
            "report_data":     self.report_data,
            "xai_data":        self.xai_data,
            "mask_data":       self.mask_data,
        })
        return d


class SavedWorklist(Base):
    """
    Stores the currently 'active' or 'saved' patient worklist for the simulator.
    This allows users to persist a specific set of 5 patients.
    """
    __tablename__ = "saved_worklist"

    id = Column(Integer, primary_key=True, index=True)
    cases = Column(JSONB, nullable=False)  # List of case objects
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)