"""
utils/slice_generator.py  (v2 — 4-Mode Support)
Generate simulated MRI slice views (Axial, Coronal, Sagittal) from a 2D image.

Views:
  - Axial:    Original image (top-down view)
  - Coronal:  Simulated front view (flip + depth gradient)
  - Sagittal: Simulated side view (transpose + flip)

NEW in v2:
  - Each slice returns  `clean_b64`  (no tumor overlay) for Gray mode
  - Each slice returns  `mask_b64`   (RGBA mask) for frontend canvas compositing
  - Supports 4 frontend view modes: Gray / Tumor / Heatmap / Region Atlas
"""

import numpy as np
from PIL import Image, ImageFilter, ImageDraw
import io, base64


# ── helpers ──────────────────────────────────────────────────────────────────

def _pil_to_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return "data:image/png;base64," + base64.b64encode(buf.read()).decode()


def _to_gray_array(img: Image.Image, size: int = 256) -> np.ndarray:
    return np.array(img.convert('L').resize((size, size), Image.LANCZOS), dtype=np.float32)


def _gray_to_rgb(arr: np.ndarray) -> Image.Image:
    """Grayscale array → RGB PIL image (no overlay)."""
    base = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(np.stack([base, base, base], axis=-1), 'RGB')


def _overlay_mask(base_arr: np.ndarray,
                  mask_arr: np.ndarray,
                  color: tuple = (255, 50, 50),
                  alpha: float = 0.55) -> Image.Image:
    """Overlay binary/float mask on grayscale array → RGB PIL image."""
    h, w = base_arr.shape
    base_norm = np.clip(base_arr, 0, 255).astype(np.uint8)
    rgb = np.stack([base_norm, base_norm, base_norm], axis=-1)

    if mask_arr is not None and mask_arr.max() > 0:
        mask_resized = np.array(
            Image.fromarray(mask_arr.astype(np.float32)).resize((w, h), Image.BILINEAR)
        )
        tumor_pixels = mask_resized > 0.3
        for c_idx, c_val in enumerate(color):
            rgb[:, :, c_idx] = np.where(
                tumor_pixels,
                np.clip(rgb[:, :, c_idx] * (1 - alpha) + c_val * alpha, 0, 255),
                rgb[:, :, c_idx]
            ).astype(np.uint8)

    return Image.fromarray(rgb.astype(np.uint8), 'RGB')


def _mask_to_rgba_b64(mask_arr: np.ndarray, size: int,
                       r: int = 255, g: int = 50, b: int = 50,
                       alpha_val: int = 165) -> str:
    """
    Convert processed mask array (H×W float 0-1) → RGBA PNG base64.
    Used by frontend canvas compositing for mode switching.
    Returns None if no positive pixels.
    """
    if mask_arr is None or mask_arr.max() <= 0:
        return None
    h, w = mask_arr.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    tumor_px = mask_arr > 0.25
    rgba[tumor_px, 0] = r
    rgba[tumor_px, 1] = g
    rgba[tumor_px, 2] = b
    rgba[tumor_px, 3] = alpha_val
    img_rgba = Image.fromarray(rgba, 'RGBA')
    if w != size or h != size:
        img_rgba = img_rgba.resize((size, size), Image.BILINEAR)
    return _pil_to_b64(img_rgba)


def _multi_class_mask_to_rgba_b64(mc_mask_arr: np.ndarray, size: int) -> str:
    """
    Convert multi-class mask (0, 1, 2, 3) -> Color-coded RGBA PNG.
    Labels:
    - 1: Necrosis (NCR) -> Red (255, 50, 50)
    - 2: Edema (ED) -> Green (50, 255, 50)
    - 3: Enhancing (ET) -> Blue (50, 150, 255)
    """
    if mc_mask_arr is None or mc_mask_arr.max() <= 0:
        return None
        
    h, w = mc_mask_arr.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    
    # 1. Necrosis (Red)
    ncr = mc_mask_arr == 1
    rgba[ncr, 0] = 255
    rgba[ncr, 1] = 0
    rgba[ncr, 2] = 64
    rgba[ncr, 3] = 200
    
    # 2. Edema (Green)
    ed = mc_mask_arr == 2
    rgba[ed, 0] = 0
    rgba[ed, 1] = 200
    rgba[ed, 2] = 83
    rgba[ed, 3] = 160
    
    # 3. Enhancing (Yellow)
    et = mc_mask_arr == 3
    rgba[et, 0] = 255
    rgba[et, 1] = 214
    rgba[et, 2] = 0
    rgba[et, 3] = 220
    
    img_rgba = Image.fromarray(rgba, 'RGBA')
    if w != size or h != size:
        img_rgba = img_rgba.resize((size, size), Image.NEAREST)
    return _pil_to_b64(img_rgba)


def _add_scale_bar(img: Image.Image, mm_per_pixel: float = 0.94) -> Image.Image:
    draw = ImageDraw.Draw(img)
    w, h = img.size
    bar_px = int(30 / mm_per_pixel)
    x0, y0 = 10, h - 22
    x1, y1 = x0 + bar_px, y0 + 4
    draw.rectangle([x0, y0, x1, y1], fill=(220, 220, 220))
    draw.rectangle([x0, y0 - 4, x0 + 1, y1 + 4], fill=(220, 220, 220))
    draw.rectangle([x1, y0 - 4, x1 + 1, y1 + 4], fill=(220, 220, 220))
    return img


def _add_axis_labels(img: Image.Image, labels: dict) -> Image.Image:
    draw = ImageDraw.Draw(img)
    w, h = img.size
    color = (0, 200, 255)
    positions = {
        'top':    (w // 2 - 4, 4),
        'bottom': (w // 2 - 4, h - 16),
        'left':   (4,          h // 2 - 6),
        'right':  (w - 12,     h // 2 - 6),
    }
    for side, text in labels.items():
        if side in positions:
            draw.text(positions[side], text, fill=color)
    return img


def _add_crosshair(img: Image.Image, cx: float, cy: float,
                   color=(0, 200, 255, 160)) -> Image.Image:
    w, h = img.size
    px, py = int(cx * w), int(cy * h)
    img = img.convert('RGBA')
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.line([(px, 0), (px, h)], fill=color, width=1)
    draw.line([(0, py), (w, py)], fill=color, width=1)
    return Image.alpha_composite(img, overlay).convert('RGB')


# ── main slice generators ─────────────────────────────────────────────────────

def generate_axial_slice(img: Image.Image,
                          mask_2d: np.ndarray,
                          mc_mask_2d: np.ndarray = None,
                          cx: float = 0.5,
                          cy: float = 0.5,
                          size: int = 512) -> dict:
    """
    Axial slice = original MRI image (top-down view).
    Returns { 'image_b64', 'clean_b64', 'mask_b64', 'segmentation_b64', 'view' }
    """
    arr = _to_gray_array(img, size)
    LABELS = {'top': 'A', 'bottom': 'P', 'left': 'R', 'right': 'L'}
    CH_COLOR = (0, 200, 255, 160)

    mask_arr = None
    mask_b64 = None
    if mask_2d is not None:
        mask_arr = np.array(
            Image.fromarray(mask_2d.astype(np.float32)).resize((size, size), Image.BILINEAR)
        )
        mask_b64 = _mask_to_rgba_b64(mask_arr, size, r=255, g=50, b=50)

    # Clean (no overlay)
    clean = _gray_to_rgb(arr)
    clean = _add_scale_bar(clean)
    clean = _add_axis_labels(clean, LABELS)
    clean = _add_crosshair(clean, cx, cy, CH_COLOR)

    # Tumor overlay
    tumor = _overlay_mask(arr, mask_arr, color=(255, 50, 50))
    tumor = _add_scale_bar(tumor)
    tumor = _add_axis_labels(tumor, LABELS)
    tumor = _add_crosshair(tumor, cx, cy, CH_COLOR)

    # Segmentation (multi-color)
    seg_b64 = None
    if mc_mask_2d is not None:
        mc_arr = np.array(
            Image.fromarray(mc_mask_2d.astype(np.uint8)).resize((size, size), Image.NEAREST)
        )
        seg_b64 = _multi_class_mask_to_rgba_b64(mc_arr, size)

    return {
        'image_b64': _pil_to_b64(tumor),
        'clean_b64': _pil_to_b64(clean),
        'mask_b64':  mask_b64,
        'segmentation_b64': seg_b64,
        'view': 'axial'
    }


def generate_coronal_slice(img: Image.Image,
                             mask_2d: np.ndarray,
                             mc_mask_2d: np.ndarray = None,
                             cx: float = 0.5,
                             cy: float = 0.5,
                             size: int = 512) -> dict:
    """
    Coronal slice = simulated front view (flip vertical + depth gradient).
    Returns { 'image_b64', 'clean_b64', 'mask_b64', 'segmentation_b64', 'view' }
    """
    arr = _to_gray_array(img, size)
    arr = np.flipud(arr)
    gradient = np.linspace(0.7, 1.0, size).reshape(-1, 1)
    arr = np.clip(arr * gradient, 0, 255)
    pil_gray = Image.fromarray(arr.astype(np.uint8), 'L')
    pil_gray = pil_gray.filter(ImageFilter.GaussianBlur(radius=0.4))
    arr = np.array(pil_gray, dtype=np.float32)

    LABELS = {'top': 'S', 'bottom': 'I', 'left': 'R', 'right': 'L'}
    CH_COLOR = (255, 80, 0, 160)

    mask_arr = None
    mask_b64 = None
    if mask_2d is not None:
        m = np.flipud(np.array(
            Image.fromarray(mask_2d.astype(np.float32)).resize((size, size), Image.BILINEAR)
        ))
        mask_arr = m
        mask_b64 = _mask_to_rgba_b64(mask_arr, size, r=255, g=100, b=50)

    clean = _gray_to_rgb(arr)
    clean = _add_scale_bar(clean)
    clean = _add_axis_labels(clean, LABELS)
    clean = _add_crosshair(clean, cx, cy, CH_COLOR)

    tumor = _overlay_mask(arr, mask_arr, color=(255, 100, 50))
    tumor = _add_scale_bar(tumor)
    tumor = _add_axis_labels(tumor, LABELS)
    tumor = _add_crosshair(tumor, cx, cy, CH_COLOR)

    # Segmentation (multi-color)
    seg_b64 = None
    if mc_mask_2d is not None:
        mc_arr = np.flipud(np.array(
            Image.fromarray(mc_mask_2d.astype(np.uint8)).resize((size, size), Image.NEAREST)
        ))
        seg_b64 = _multi_class_mask_to_rgba_b64(mc_arr, size)

    return {
        'image_b64': _pil_to_b64(tumor),
        'clean_b64': _pil_to_b64(clean),
        'mask_b64':  mask_b64,
        'segmentation_b64': seg_b64,
        'view': 'coronal'
    }


def generate_sagittal_slice(img: Image.Image,
                              mask_2d: np.ndarray,
                              mc_mask_2d: np.ndarray = None,
                              cx: float = 0.5,
                              cy: float = 0.5,
                              size: int = 512) -> dict:
    """
    Sagittal slice = simulated side view (transpose + flip).
    Returns { 'image_b64', 'clean_b64', 'mask_b64', 'segmentation_b64', 'view' }
    """
    arr = _to_gray_array(img, size)
    arr = arr.T
    arr = np.fliplr(arr)
    gradient = np.linspace(1.0, 0.75, size).reshape(1, -1)
    arr = np.clip(arr * gradient, 0, 255)

    LABELS = {'top': 'S', 'bottom': 'I', 'left': 'A', 'right': 'P'}
    CH_COLOR = (0, 180, 255, 160)

    mask_arr = None
    mask_b64 = None
    if mask_2d is not None:
        m_resized = np.array(
            Image.fromarray(mask_2d.astype(np.float32)).resize((size, size), Image.BILINEAR)
        )
        mask_arr = np.fliplr(m_resized.T)
        mask_b64 = _mask_to_rgba_b64(mask_arr, size, r=50, g=200, b=255)

    clean = _gray_to_rgb(arr)
    clean = _add_scale_bar(clean)
    clean = _add_axis_labels(clean, LABELS)
    clean = _add_crosshair(clean, cx, cy, CH_COLOR)

    tumor = _overlay_mask(arr, mask_arr, color=(50, 200, 255))
    tumor = _add_scale_bar(tumor)
    tumor = _add_axis_labels(tumor, LABELS)
    tumor = _add_crosshair(tumor, cx, cy, CH_COLOR)

    # Segmentation (multi-color)
    seg_b64 = None
    if mc_mask_2d is not None:
        mc_resized = np.array(
            Image.fromarray(mc_mask_2d.astype(np.uint8)).resize((size, size), Image.NEAREST)
        )
        mc_arr = np.fliplr(mc_resized.T)
        seg_b64 = _multi_class_mask_to_rgba_b64(mc_arr, size)

    return {
        'image_b64': _pil_to_b64(tumor),
        'clean_b64': _pil_to_b64(clean),
        'mask_b64':  mask_b64,
        'segmentation_b64': seg_b64,
        'view': 'sagittal'
    }


def generate_all_slices(img: Image.Image,
                        mask_2d: np.ndarray,
                        mc_mask_2d: np.ndarray = None,
                        cx: float = 0.5,
                        cy: float = 0.5,
                        size: int = 512) -> dict:
    """
    Generate all 3 slice views at once.
    """
    axial    = generate_axial_slice(img, mask_2d, mc_mask_2d, cx, cy, size)
    coronal  = generate_coronal_slice(img, mask_2d, mc_mask_2d, cx, cy, size)
    sagittal = generate_sagittal_slice(img, mask_2d, mc_mask_2d, cx, cy, size)

    return {
        'axial':    {'image_b64': axial['image_b64'],    'clean_b64': axial['clean_b64'],    'mask_b64': axial['mask_b64'],    'segmentation_b64': axial['segmentation_b64']},
        'coronal':  {'image_b64': coronal['image_b64'],  'clean_b64': coronal['clean_b64'],  'mask_b64': coronal['mask_b64'],  'segmentation_b64': coronal['segmentation_b64']},
        'sagittal': {'image_b64': sagittal['image_b64'], 'clean_b64': sagittal['clean_b64'], 'mask_b64': sagittal['mask_b64'], 'segmentation_b64': sagittal['segmentation_b64']},
    }
