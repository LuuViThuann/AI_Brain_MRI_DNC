"""
Realtime MRI modality simulator routes.

This module exposes:
- GET /api/cases           Synthetic worklist built from local MRI images
- WS  /ws/simulation      Realtime broadcast channel for simulator/dashboard
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional
import math
import uuid
import random
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, Depends, Body, File, UploadFile
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
from database import get_db
from models import SavedWorklist
import shutil
# pyrefly: ignore [missing-import]
from PIL import Image, ImageDraw, ImageFont
import io

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BASE_DIR.parent


def find_image_directory() -> Optional[Path]:
    """Resolve the existing MRI image directory used by the project."""
    candidates = [
        PROJECT_ROOT / "data" / "processed" / "combined_images",
        PROJECT_ROOT / "data" / "processed" / "mat_images",
        PROJECT_ROOT / "data" / "images",
        PROJECT_ROOT / "data" / "raw",
    ]
    for directory in candidates:
        if not directory.exists() or not directory.is_dir():
            continue
        images = list(directory.glob("*.png")) + list(directory.glob("*.jpg")) + list(directory.glob("*.jpeg"))
        if images:
            return directory
    return None


IMAGES_DIR = find_image_directory()

PROTOCOLS = [
    "T2-FLAIR",
    "T1-POST",
    "DWI-ADC",
    "T2-AXIAL",
    "SWI-HEMO",
]

SCANNERS = [
    "Siemens Magnetom Vida 3T",
    "GE Signa Architect 3T",
    "Philips Ingenia 1.5T",
]

ROOMS = ["MRI-A1", "MRI-A2", "MRI-B1"]


def iso_now() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def list_image_files() -> list[Path]:
    if not IMAGES_DIR:
        return []
    image_files = (
        list(IMAGES_DIR.glob("*.png"))
        + list(IMAGES_DIR.glob("*.jpg"))
        + list(IMAGES_DIR.glob("*.jpeg"))
    )
    return sorted(image_files)


def synthesize_worklist(limit: int = 5, slices_per_case: int = 5, shuffle: bool = False) -> list[dict[str, Any]]:
    image_files = list_image_files()
    if not image_files:
        return []

    if shuffle:
        random.shuffle(image_files)

    total_possible_cases = max(1, math.ceil(len(image_files) / slices_per_case))
    case_count = min(limit, total_possible_cases)
    today = datetime.utcnow().replace(hour=7, minute=30, second=0, microsecond=0)
    cases: list[dict[str, Any]] = []

    for case_index in range(case_count):
        start = case_index * slices_per_case
        end = start + slices_per_case
        case_images = image_files[start:end]

        if not case_images:
            break

        protocol = PROTOCOLS[case_index % len(PROTOCOLS)]
        scanner = SCANNERS[case_index % len(SCANNERS)]
        room = ROOMS[case_index % len(ROOMS)]
        
        # Randomize metadata if shuffle is requested
        patient_no = 2400 + case_index + 1
        if shuffle:
            patient_no = random.randint(1000, 9999)
            
        scheduled = today + timedelta(minutes=case_index * 18)
        if shuffle:
            scheduled += timedelta(minutes=random.randint(-120, 120))
            
        patient_name = f"Bệnh nhân {case_index + 1:02d}"
        if shuffle:
            patient_name = f"BN-{random.randint(10, 99)} {random.choice(['A','B','C','D'])}{random.randint(100, 999)}"

        representative = case_images[len(case_images) // 2]

        # --- AI PRE-ANALYSIS ---
        ai_result = {"tumor_detected": False, "confidence": 0, "tumor_area_percent": 0}
        try:
            # pyrefly: ignore [missing-import]
            from PIL import Image as _PIL_Image
            # Use direct import (prediction_engine.py is in the same backend/ directory)
            from prediction_engine import predict_tumor

            with _PIL_Image.open(representative) as img:
                pred = predict_tumor(img)
                ai_result = {
                    "tumor_detected": pred.get("tumor_detected", False),
                    "confidence": pred.get("confidence", 0),
                    "tumor_area_percent": pred.get("tumor_area_percent", 0)
                }
        except Exception as e:
            print(f"Warning: AI Pre-analysis failed for case {case_index}: {e}")

        cases.append(
            {
                "case_id": f"SIM-{patient_no}" if shuffle else f"SIM-{case_index + 1:04d}",
                "patient_id": f"BN-{patient_no:04d}",
                "patient_name": patient_name,
                "accession_number": f"CD-{scheduled:%m%d}-{case_index + 1:02d}",
                "scheduled_time": scheduled.strftime("%H:%M"),
                "study_date": scheduled.strftime("%Y-%m-%d"),
                "protocol": protocol,
                "series_description": f"{protocol} Thể tích não",
                "scanner": scanner,
                "room": room,
                "slice_count": len(case_images),
                "preview_image_url": f"/data/images/{case_images[0].name}",
                "representative_image_url": f"/data/images/{representative.name}",
                "slice_image_urls": [f"/data/images/{path.name}" for path in case_images],
                "image_filenames": [path.name for path in case_images],
                "ai_preview": ai_result,  # Result of the pre-analysis
            }
        )

    return cases


# Hàm API lấy danh sách ca bệnh ----------------------------------------------------
# Hiện tại mặc định là 5 < -----


@router.get("/api/cases")
async def get_cases(
    limit: int = Query(default=5, ge=1, le=24),
    slices_per_case: int = Query(default=5, ge=1, le=32),
    shuffle: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return a synthetic MRI modality worklist built from available images."""
    if not IMAGES_DIR:
        raise HTTPException(status_code=503, detail="MRI image directory is not available")

    # If NOT shuffling, check if we have a saved worklist in the DB
    if not shuffle:
        saved = db.query(SavedWorklist).order_by(SavedWorklist.updated_at.desc()).first()
        if saved:
            return {
                "status": "ok",
                "generated_at": saved.updated_at.isoformat() + "Z",
                "images_dir": str(IMAGES_DIR),
                "count": len(saved.cases),
                "cases": saved.cases,
                "is_saved": True
            }

    # Otherwise generate new ones
    cases = synthesize_worklist(limit=limit, slices_per_case=slices_per_case, shuffle=shuffle)
    return {
        "status": "ok",
        "generated_at": iso_now(),
        "images_dir": str(IMAGES_DIR),
        "count": len(cases),
        "cases": cases,
        "is_saved": False
    }


@router.post("/api/cases/save")
async def save_cases(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """Save the current list of patients to the database."""
    try:
        cases = payload.get("cases")
        if not cases or not isinstance(cases, list):
            print(f"[ERROR] Invalid payload received in /api/cases/save")
            raise HTTPException(status_code=400, detail="Invalid cases payload: expected a list of cases.")

        print(f"[INFO] Saving {len(cases)} cases to database...")
        
        # Update existing or create new (we only keep one 'active' set for now)
        saved = db.query(SavedWorklist).first()
        if not saved:
            saved = SavedWorklist(cases=cases)
            db.add(saved)
        else:
            saved.cases = cases
            saved.updated_at = datetime.now()
        
        db.commit()
        db.refresh(saved)
        print(f"[OK] Worklist saved successfully at {saved.updated_at}")
        
        return {
            "status": "ok", 
            "message": "Worklist saved successfully", 
            "count": len(cases),
            "updated_at": saved.updated_at.isoformat()
        }
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Failed to save worklist: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# Hàm xử lý lưu ảnh tại mô phỏng --------------------------------------------------

@router.post("/api/simulator/upload")
async def upload_simulator_image(file: UploadFile = File(...)):
    """Upload a custom MRI image for the simulator and return its persistent URL."""
    print(f"[INFO] Upload request received for file: {file.filename}")
    if not IMAGES_DIR:
        print("[ERROR] IMAGES_DIR is not set")
        raise HTTPException(status_code=503, detail="Image directory not found on server")

    # Create a 'custom' subdirectory within the active images directory
    custom_dir = IMAGES_DIR / "custom"
    try:
        custom_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        print(f"[ERROR] Failed to create custom directory {custom_dir}: {e}")
        raise HTTPException(status_code=500, detail=f"Permission error: {str(e)}")

    # Generate a unique filename to avoid collisions
    ext = Path(file.filename).suffix or ".png"
    unique_filename = f"custom_{uuid.uuid4().hex}{ext}"
    target_path = custom_dir / unique_filename

    try:
        with target_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        print(f"[OK] File saved to {target_path}")
        # The URL prefix /data/images is mounted to IMAGES_DIR in app.py
        return {
            "status": "ok",
            "filename": unique_filename,
            "url": f"/data/images/custom/{unique_filename}"
        }
    except Exception as e:
        print(f"[ERROR] Upload failed for {file.filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save image: {str(e)}")

@router.post("/api/simulator/generate_film")
async def generate_film(payload: dict[str, Any] = Body(...)):
    """
    Generate a compact professional MRI radiology film.
    Dark navy background, tight grid of slices, DICOM corner annotations, tumor ellipse+crosshair overlay.
    """
    # pyrefly: ignore [missing-import]
    import numpy as np

    case_id      = payload.get("case_id", "Unknown")
    patient_name = payload.get("patient_name", "Unknown")
    patient_id   = payload.get("patient_id", "Unknown")
    protocol     = payload.get("protocol", "MRI")
    study_date   = payload.get("study_date", datetime.now().strftime("%Y-%m-%d"))
    slice_urls   = payload.get("slice_urls", [])
    ai_preview   = payload.get("ai_preview", {})

    tumor_detected   = bool(ai_preview.get("tumor_detected", False))
    tumor_confidence = float(ai_preview.get("confidence", 0.0))

    print(f"[FILM] {patient_name} ({case_id}) | AI hint: tumor={tumor_detected} conf={tumor_confidence:.2f}")

    if not IMAGES_DIR:
        raise HTTPException(status_code=503, detail="Thư mục ảnh không khả dụng trên server")
    if not slice_urls:
        raise HTTPException(status_code=400, detail="Không có lát cắt nào để tạo phim")

    # ── Font loader ──────────────────────────────────────────────────────────────
    def _font(size: int, bold: bool = False):
        paths = (
            ["C:/Windows/Fonts/ArialBd.ttf", "C:/Windows/Fonts/calibrib.ttf"] if bold
            else ["C:/Windows/Fonts/Arial.ttf", "C:/Windows/Fonts/calibri.ttf"]
        ) if os.name == "nt" else (
            ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"] if bold
            else ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
        )
        for p in paths:
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
        try:
            return ImageFont.load_default(size=size)
        except Exception:
            return ImageFont.load_default()

    # ── Blue-film tint ───────────────────────────────────────────────────────────
    def _blue_tint(img: Image.Image) -> Image.Image:
        a = np.array(img, dtype=np.float32)
        a = np.clip((a - 128) * 1.18 + 128, 0, 255)
        a[:, :, 0] = np.clip(a[:, :, 0] * 0.62, 0, 255)
        a[:, :, 1] = np.clip(a[:, :, 1] * 0.78, 0, 255)
        a[:, :, 2] = np.clip(a[:, :, 2] * 1.08, 0, 255)
        return Image.fromarray(a.astype(np.uint8), "RGB")

    # ── Tumor overlay ────────────────────────────────────────────────────────────
    def _tumor_overlay(draw: ImageDraw.ImageDraw,
                       ox: int, oy: int, tw: int, th: int,
                       conf: float, cx_norm: float, cy_norm: float):
        cx = ox + int(cx_norm * tw)
        cy = oy + int(cy_norm * th)
        rx = max(18, int(tw * 0.17))
        ry = max(15, int(th * 0.14))
        for d in (5, 3, 1):
            draw.ellipse([cx-rx-d, cy-ry-d, cx+rx+d, cy+ry+d], outline=(255, 130, 0), width=1)
        draw.ellipse([cx-rx, cy-ry, cx+rx, cy+ry], outline=(255, 40, 40), width=2)
        cc = (70, 195, 255)
        draw.line([(cx-rx-10, cy), (cx+rx+10, cy)], fill=cc, width=1)
        draw.line([(cx, cy-ry-10), (cx, cy+ry+10)], fill=cc, width=1)
        draw.text((cx-rx, cy-ry-16), f"U {int(conf*100)}%", fill=(255, 215, 0), font=_font(14, True))

    # ── Load images ──────────────────────────────────────────────────────────────
    images: list[Image.Image] = []
    for url in slice_urls:
        clean = url.split("?")[0]
        fn    = clean.split("/")[-1]
        p     = (IMAGES_DIR/"custom"/fn) if "/custom/" in clean else (IMAGES_DIR/fn)
        if p.exists():
            try:
                images.append(Image.open(str(p)).convert("RGB"))
            except Exception as e:
                print(f"[WARN] {p}: {e}")
        else:
            print(f"[WARN] Not found: {p}")

    if not images:
        raise HTTPException(status_code=404,
            detail=f"Không tìm thấy ảnh. URLs: {slice_urls[:2]}")

    # ── Re-run AI on representative slice for accurate badge ─────────────────────
    rep_idx  = len(images) // 2
    cx_norm  = 0.5
    cy_norm  = 0.5
    try:
        from prediction_engine import predict_tumor as _pt
        pred = _pt(images[rep_idx].copy())
        tumor_detected   = bool(pred.get("tumor_detected", False))
        tumor_confidence = float(pred.get("confidence", 0.0))
        cpx = pred.get("centroid_px", {})
        if cpx and tumor_detected:
            cx_norm = max(0.05, min(0.95, cpx.get("x", 128) / 256))
            cy_norm = max(0.05, min(0.95, cpx.get("y", 128) / 256))
        print(f"[FILM] AI re-run: tumor={tumor_detected} conf={tumor_confidence:.2f}")
    except Exception as e:
        print(f"[FILM] AI re-run skipped: {e}")

    # ── Pad images to minimum 4 for a balanced 2×2 grid ──────────────────────────
    # Generates brightness/contrast variants of the base image
    def _variant(img: Image.Image, brightness: float, contrast: float) -> Image.Image:
        a = np.array(img, dtype=np.float32)
        a = np.clip((a - 128) * contrast + 128 * brightness, 0, 255)
        # Keep blue-film tint
        a[:, :, 0] = np.clip(a[:, :, 0] * 0.62, 0, 255)
        a[:, :, 1] = np.clip(a[:, :, 1] * 0.78, 0, 255)
        a[:, :, 2] = np.clip(a[:, :, 2] * 1.08, 0, 255)
        return Image.fromarray(a.astype(np.uint8), "RGB")

    BASE = images[rep_idx]  # Use representative slice as base for variants
    while len(images) < 4:
        idx = len(images)
        # Create distinctly different window/level variants
        params = [(1.0, 1.30), (0.85, 0.90), (1.10, 1.50)]
        br, ct = params[idx % len(params)]
        images.append(_variant(BASE.copy(), br, ct))

    # View labels for each cell (anatomical planes)
    VIEW_LABELS  = ["AXIAL", "CORONAL", "SAGITTAL", "AXIAL+"]
    VIEW_AXES    = ["Z-axis", "Y-axis", "X-axis", "Z-axis"]
    # Anatomical orientation labels per view
    ORIENT = [
        {"top": "S", "bot": "I", "lft": "R", "rgt": "L"},   # AXIAL
        {"top": "S", "bot": "I", "lft": "A", "rgt": "P"},   # CORONAL
        {"top": "A", "bot": "P", "lft": "R", "rgt": "L"},   # SAGITTAL
        {"top": "S", "bot": "I", "lft": "R", "rgt": "L"},   # AXIAL+
    ]

    # ── Adaptive layout ──────────────────────────────────────────────────────────
    n = len(images)
    if   n <= 4:  COLS, CS = 2, 360   # 2×2 balanced square
    elif n <= 9:  COLS, CS = 3, 290   # 3×3 grid
    elif n <= 16: COLS, CS = 4, 260   # 4×4 grid
    else:         COLS, CS = 5, 220   # 5-col strip for many slices

    CW = CS; CH = CS; GAP = 4; CPAD = 5; HDR_H = 115; FTR_H = 30; MRG = 12
    rows = math.ceil(n / COLS)
    W    = COLS * (CW + GAP) - GAP + 2 * MRG
    H    = HDR_H + MRG + rows * (CH + GAP) - GAP + MRG + FTR_H

    # ── Palette ───────────────────────────────────────────────────────────────────
    C_BG   = (3,8,22);   C_CELL = (5,12,32);  C_HDR = (7,17,48)
    C_BDR  = (18,55,120); C_TTL = (218,238,255); C_LBL = (130,195,255)
    C_CYAN = (0,215,225); C_WHT = (255,255,255); C_GRN = (0,210,110)
    C_META = (90,148,200); C_RUL = (25,72,165); C_FTR = (55,95,150)

    film = Image.new("RGB", (W, H), C_BG)
    draw = ImageDraw.Draw(film)

    f20b = _font(20, True); f16 = _font(16); f13 = _font(13); f11 = _font(11)

    # ── Header: 2-column layout ───────────────────────────────────────────────────
    # LEFT column  (0 .. L_END):  institution / name / protocol / date
    # RIGHT column (R_START .. W): patient ID + AI badge — completely isolated
    L_END   = int(W * 0.58)
    R_START = L_END + 10

    draw.rectangle([0, 0, W, HDR_H], fill=C_HDR)
    draw.rectangle([0, 0, W, 3], fill=C_RUL)

    # Institution row (full width) ------------------------------------------------
    draw.text((MRG, 10), "BỆNH VIỆN NAM CẦN THƠ  ·  KHOA CHẨN ĐOÁN HÌNH ẢNH",
              fill=C_LBL, font=f13)
    draw.rectangle([MRG, 28, W - MRG, 30], fill=C_RUL)

    # LEFT: patient name + protocol + date ------------------------------------------------
    draw.text((MRG, 35), patient_name.upper()[:28], fill=C_TTL, font=f20b)
    draw.text((MRG, 63), "Protocol:", fill=C_LBL, font=f16)
    draw.text((MRG + 90, 63), protocol, fill=C_CYAN, font=f20b)
    draw.text((MRG, 88), f"Ngày: {study_date}  ·  Mã: {case_id}", fill=C_META, font=f13)

    # Vertical divider between columns ------------------------------------------------
    draw.rectangle([L_END, 33, L_END + 2, HDR_H - 6], fill=C_RUL)

    # RIGHT: patient ID
    draw.text((R_START, 35), f"ID: {patient_id}", fill=C_WHT, font=f20b)

    # RIGHT: AI badge (below ID, flush right) ------------------------------------------------
    BADGE_W = W - R_START - MRG
    if tumor_detected:
        bb = (90, 18, 18); btxt = f"KHỐI U ({int(tumor_confidence*100)}%)"; bc = (255, 70, 70)
    else:
        bb = (8, 55, 28);  btxt = "KHÔNG BẤT THƯỜNG";                       bc = (65, 210, 105)
    draw.rounded_rectangle([R_START, 62, R_START + BADGE_W, 105],
                            radius=6, fill=bb, outline=bc, width=1)
    draw.text((R_START + 7, 68), btxt, fill=bc, font=f13)
    draw.text((R_START + 7, 89), "AI Brain Model", fill=C_META, font=f11)

    # Bottom rule of header ------------------------------------------------
    draw.rectangle([0, HDR_H - 3, W, HDR_H], fill=C_RUL)

    gy0 = HDR_H + MRG
    for i, raw in enumerate(images):
        ci = i % COLS; ri = i // COLS
        cx0 = MRG + ci * (CW + GAP)
        cy0 = gy0 + ri * (CH + GAP)
        draw.rectangle([cx0, cy0, cx0+CW, cy0+CH], fill=C_CELL, outline=C_BDR, width=1)

        # Tinted thumbnail (already tinted for variants, apply lightly for raw originals)
        if i < len(slice_urls):
            thumb = _blue_tint(raw)
        else:
            thumb = raw.copy()  # variants already tinted
        thumb.thumbnail((CW - 2*CPAD, CH - 2*CPAD - 36), Image.LANCZOS)
        ox = cx0 + CPAD + (CW - 2*CPAD - thumb.width)  // 2
        oy = cy0 + 18 + (CH - 18 - 2*CPAD - 20 - thumb.height) // 2
        film.paste(thumb, (ox, oy))

        # ── Anatomical crosshair lines ────────────────────────────────────────
        img_cx = ox + thumb.width  // 2
        img_cy = oy + thumb.height // 2
        XHAIR_COL = (0, 180, 220)
        # Horizontal line
        draw.line([(ox, img_cy), (ox + thumb.width, img_cy)], fill=XHAIR_COL, width=1)
        # Vertical line
        draw.line([(img_cx, oy), (img_cx, oy + thumb.height)], fill=XHAIR_COL, width=1)

        # ── Anatomical orientation labels ─────────────────────────────────────
        ort = ORIENT[i % len(ORIENT)]
        f_ort = _font(13, bold=True)
        ORT_COL = (255, 210, 0)  # yellow-gold
        PAD = 4
        # Top (Superior / Anterior)
        draw.text((img_cx + PAD, oy + PAD),                    ort["top"], fill=ORT_COL, font=f_ort)
        # Bottom (Inferior / Posterior)
        draw.text((img_cx + PAD, oy + thumb.height - 18),      ort["bot"], fill=ORT_COL, font=f_ort)
        # Left
        draw.text((ox + PAD,                img_cy - 10),      ort["lft"], fill=ORT_COL, font=f_ort)
        # Right
        draw.text((ox + thumb.width - 16,   img_cy - 10),      ort["rgt"], fill=ORT_COL, font=f_ort)

        # ── Tumor overlay (representative slice only) ─────────────────────────
        if tumor_detected and i == rep_idx:
            _tumor_overlay(draw, ox, oy, thumb.width, thumb.height,
                           tumor_confidence, cx_norm, cy_norm)

        # ── View label bar (top of cell) ──────────────────────────────────────
        vlab = VIEW_LABELS[i % len(VIEW_LABELS)]
        vax  = VIEW_AXES [i % len(VIEW_AXES)]
        draw.rectangle([cx0 + 1, cy0 + 1, cx0 + CW - 1, cy0 + 17], fill=(4, 20, 60))
        draw.text((cx0 + 5,       cy0 + 3), vlab, fill=(200, 230, 255), font=f11)
        draw.text((cx0 + CW - 48, cy0 + 3), vax,  fill=C_CYAN,          font=f11)

        # ── DICOM corner meta ─────────────────────────────────────────────────
        draw.text((cx0 + 3,       cy0 + 20),      f"S{i+1:02d}",   fill=C_META, font=f11)
        draw.text((cx0 + CW - 32, cy0 + 20),      f"IM{i+1:04d}",  fill=C_META, font=f11)
        draw.text((cx0 + 3,       cy0 + CH - 38), protocol[:8],    fill=C_META, font=f11)

        # ── Bottom label bar ──────────────────────────────────────────────────
        bar_y = cy0 + CH - 20
        draw.rectangle([cx0 + 1, bar_y, cx0 + CW - 1, cy0 + CH - 1], fill=(3, 14, 42))
        draw.text((cx0 + 4, bar_y + 4), f"Lát {i+1}/{n}", fill=C_GRN, font=f11)
        if tumor_detected and i == rep_idx:
            draw.text((cx0 + CW - 52, bar_y + 4), "KHỐI U", fill=(255, 70, 70), font=f11)

    # ── Footer ────────────────────────────────────────────────────────────────────
    fy = H - FTR_H
    draw.rectangle([0, fy, W, H], fill=C_HDR)
    draw.rectangle([0, fy, W, fy + 2], fill=C_RUL)
    draw.text((MRG, fy + 8),
              f"NeuroScan AI  ·  {patient_id}  ·  {protocol}  ·  {len(images)} lát  ·  "
              f"Xuất: {datetime.now().strftime('%d/%m/%Y %H:%M')}  ·  BẢO MẬT Y TẾ",
              fill=C_FTR, font=f11)

    # ── Save ─────────────────────────────────────────────────────────────────────
    custom_dir = IMAGES_DIR / "custom"
    custom_dir.mkdir(parents=True, exist_ok=True)
    filename = f"film_{case_id}_{uuid.uuid4().hex[:8]}.jpg"
    film.save(str(custom_dir / filename), "JPEG", quality=92, subsampling=0)
    print(f"[FILM] Saved → {custom_dir/filename}")
    return {"status": "ok", "url": f"/data/images/custom/{filename}", "filename": filename}


@dataclass
class ClientInfo:
    client_id: str
    role: str = "observer"
    label: str = "Unknown"


class SimulationHub:
    def __init__(self) -> None:
        self.connections: dict[WebSocket, ClientInfo] = {}
        self.latest_scan_event: Optional[dict[str, Any]] = None

    async def connect(self, websocket: WebSocket) -> ClientInfo:
        await websocket.accept()
        client = ClientInfo(client_id=str(uuid.uuid4()))
        self.connections[websocket] = client
        return client

    def disconnect(self, websocket: WebSocket) -> None:
        self.connections.pop(websocket, None)

    def update_client(self, websocket: WebSocket, payload: dict[str, Any]) -> Optional[ClientInfo]:
        client = self.connections.get(websocket)
        if not client:
            return None
        client.role = str(payload.get("role") or client.role)
        client.label = str(payload.get("label") or client.label)
        self.connections[websocket] = client
        return client

    def snapshot(self) -> dict[str, Any]:
        return {
            "client_count": len(self.connections),
            "clients": [
                {
                    "client_id": info.client_id,
                    "role": info.role,
                    "label": info.label,
                }
                for info in self.connections.values()
            ],
            "latest_scan_event": self.latest_scan_event,
        }

    async def send(self, websocket: WebSocket, message_type: str, payload: dict[str, Any]) -> None:
        await websocket.send_json(
            {
                "type": message_type,
                "payload": payload,
                "server_time": iso_now(),
            }
        )

    async def broadcast(self, message_type: str, payload: dict[str, Any]) -> None:
        message = {
            "type": message_type,
            "payload": payload,
            "server_time": iso_now(),
        }

        if message_type.startswith("scan."):
            self.latest_scan_event = message

        stale_connections: list[WebSocket] = []
        for websocket in list(self.connections.keys()):
            try:
                await websocket.send_json(message)
            except Exception:
                stale_connections.append(websocket)

        for websocket in stale_connections:
            self.disconnect(websocket)

    async def broadcast_presence(self) -> None:
        await self.broadcast("system.presence", self.snapshot())


hub = SimulationHub()

ALLOWED_SCAN_MESSAGES = {
    "scan.start",
    "scan.slice",
    "scan.complete",
    "scan.stop",
    "scan.error",
    "scan.processing",
    "scan.worklist",
}


@router.websocket("/ws/simulation")
async def simulation_socket(websocket: WebSocket) -> None:
    """Realtime simulator socket shared by the MRI console and the dashboard."""
    client = await hub.connect(websocket)
    await hub.send(
        websocket,
        "system.ready",
        {
            "client_id": client.client_id,
            "images_available": bool(IMAGES_DIR),
            "image_count": len(list_image_files()),
        },
    )
    await hub.broadcast_presence()

    try:
        while True:
            message = await websocket.receive_json()
            message_type = str(message.get("type") or "").strip()
            payload = message.get("payload") or {}

            if message_type == "register":
                client = hub.update_client(websocket, payload) or client
                await hub.send(
                    websocket,
                    "system.state",
                    {
                        "client_id": client.client_id,
                        **hub.snapshot(),
                    },
                )
                await hub.broadcast_presence()
                continue

            if message_type == "ping":
                await hub.send(websocket, "pong", {"client_id": client.client_id})
                continue

            if message_type not in ALLOWED_SCAN_MESSAGES:
                await hub.send(
                    websocket,
                    "system.error",
                    {"message": f"Unsupported message type: {message_type or 'empty'}"},
                )
                continue

            enriched_payload = {
                **payload,
                "source_client_id": client.client_id,
                "source_role": client.role,
            }
            await hub.broadcast(message_type, enriched_payload)

    except WebSocketDisconnect:
        hub.disconnect(websocket)
        await hub.broadcast_presence()
