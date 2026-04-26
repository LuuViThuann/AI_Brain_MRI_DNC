"""
gradcam.py - ENHANCED CLINICAL VERSION
Grad-CAM visualization + Clinical Analysis for Brain MRI.

ENHANCEMENTS (v2):
1. Anatomical location detection (lobe + hemisphere)
2. Lesion dimensions in mm (length x width x max_diameter)
3. Lesion area in cm²
4. Segmentation contour overlay
5. Uncertainty assessment (entropy-based)
6. MRI + Heatmap + Contour combined overlay
7. Auto AI text description (Vietnamese)
"""

# ============================================================================
# CRITICAL FIX: Matplotlib backend - MUST be FIRST
# ============================================================================
import os
os.environ['MPLBACKEND'] = 'Agg'

import matplotlib
matplotlib.use('Agg', force=True)
import matplotlib.pyplot as plt
plt.ioff()

# ============================================================================
import numpy as np
import tensorflow as tf
from PIL import Image
import cv2
import io
import base64


# ============================================================================
# CONSTANTS: Anatomy mapping (256x256 image space)
# ============================================================================
ANATOMY_REGIONS = {
    # (y_min, y_max, x_min, x_max): (lobe_vi, lobe_en, functional_note)
    "superior_left_frontal":   {"y": (0, 0.38), "x": (0, 0.50), "lobe_vi": "Thùy trán trái",    "lobe_en": "Left frontal",    "note": "Kiểm soát vận động, ngôn ngữ (Broca)"},
    "superior_right_frontal":  {"y": (0, 0.38), "x": (0.50, 1), "lobe_vi": "Thùy trán phải",   "lobe_en": "Right frontal",   "note": "Kiểm soát vận động, chức năng điều hành"},
    "left_parietal":           {"y": (0.25, 0.60), "x": (0.15, 0.50), "lobe_vi": "Thùy đỉnh trái",  "lobe_en": "Left parietal",   "note": "Xử lý cảm giác, nhận thức không gian"},
    "right_parietal":          {"y": (0.25, 0.60), "x": (0.50, 0.85), "lobe_vi": "Thùy đỉnh phải", "lobe_en": "Right parietal",  "note": "Xử lý cảm giác, nhận thức không gian"},
    "left_temporal":           {"y": (0.40, 0.75), "x": (0, 0.35),  "lobe_vi": "Thùy thái dương trái", "lobe_en": "Left temporal",  "note": "Trí nhớ, ngôn ngữ (Wernicke), thính giác"},
    "right_temporal":          {"y": (0.40, 0.75), "x": (0.65, 1),  "lobe_vi": "Thùy thái dương phải","lobe_en": "Right temporal", "note": "Trí nhớ, nhận thức âm nhạc"},
    "left_occipital":          {"y": (0.65, 1),    "x": (0, 0.50),  "lobe_vi": "Thùy chẩm trái",   "lobe_en": "Left occipital",  "note": "Xử lý thị giác"},
    "right_occipital":         {"y": (0.65, 1),    "x": (0.50, 1),  "lobe_vi": "Thùy chẩm phải",  "lobe_en": "Right occipital", "note": "Xử lý thị giác"},
    "central":                 {"y": (0.35, 0.65), "x": (0.35, 0.65),"lobe_vi": "Vùng trung tâm",  "lobe_en": "Central",         "note": "Não thất, tuyến yên, vùng đồi"},
}

PIXEL_TO_MM = 0.5   # 1 pixel = 0.5 mm (typical brain MRI)
SLICE_THICKNESS_MM = 5.0


class GradCAMExplainer:
    """
    Enhanced Grad-CAM with full clinical metadata.
    Thread-safe (matplotlib Agg backend).
    """

    def __init__(self, model, layer_name=None):
        self.model = model
        if layer_name is None:
            layer_name = self._find_last_conv_layer()
        self.layer_name = layer_name
        self.grad_model = self._build_grad_model()
        self.layer_info = {
            "layer_name": self.layer_name,
            "layer_type": "Conv2D",
            "position": "Encoder bottleneck (last downsampling layer)",
            "feature_dimension": None
        }
        print(f"[GradCAM] Initialized with matplotlib backend: {matplotlib.get_backend()}")

    def _find_last_conv_layer(self):
        for layer in reversed(self.model.layers):
            if 'conv' in layer.name.lower():
                return layer.name
        raise ValueError("No convolutional layer found in model")

    def _build_grad_model(self):
        return tf.keras.models.Model(
            inputs=self.model.inputs,
            outputs=[
                self.model.get_layer(self.layer_name).output,
                self.model.output
            ]
        )

    # =========================================================================
    # MAIN ENTRY POINT
    # =========================================================================
    def generate_gradcam(self, img_array):
        """
        Generate Grad-CAM + full clinical analysis.
        Returns dict with all 15 clinical fields.
        """
        if len(img_array.shape) == 3:
            img_array = np.expand_dims(img_array, axis=0)
        if not isinstance(img_array, tf.Tensor):
            img_array = tf.constant(img_array, dtype=tf.float32)

        # --- Warm-up ---
        if self.layer_info["feature_dimension"] is None:
            with tf.GradientTape() as tape:
                conv_outputs, predictions = self.grad_model(img_array)
            self.layer_info["feature_dimension"] = conv_outputs.shape[-1]

        # --- Grad-CAM core ---
        with tf.GradientTape() as tape:
            conv_outputs, predictions = self.grad_model(img_array)
            loss = tf.reduce_mean(predictions)
        grads = tape.gradient(loss, conv_outputs)
        pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))

        conv_outputs_np = conv_outputs[0].numpy()
        pooled_grads_np = pooled_grads.numpy()

        weighted_features = np.zeros_like(conv_outputs_np)
        for i in range(pooled_grads_np.shape[-1]):
            weighted_features[:, :, i] = conv_outputs_np[:, :, i] * pooled_grads_np[i]

        heatmap = np.mean(weighted_features, axis=-1)
        heatmap = np.maximum(heatmap, 0)
        if heatmap.max() > 0:
            heatmap = heatmap / heatmap.max()

        heatmap_resized = cv2.resize(heatmap, (256, 256))

        # --- Original image ---
        if isinstance(img_array, tf.Tensor):
            original_img = img_array.numpy()[0, :, :, 0]
        else:
            original_img = img_array[0, :, :, 0]

        # --- Attention stats ---
        high_attention = heatmap_resized[heatmap_resized > 0.5]
        attention_score = float(np.mean(high_attention)) if len(high_attention) > 0 else 0.0

        attention_stats = {
            "mean_attention": float(np.mean(heatmap_resized)),
            "max_attention": float(np.max(heatmap_resized)),
            "attention_coverage": float(np.sum(heatmap_resized > 0.5) / heatmap_resized.size),
            "focused_regions_count": 0  # filled below
        }

        focused_regions = self._find_focused_regions(heatmap_resized)
        attention_stats["focused_regions_count"] = len(focused_regions)

        # --- Overlays ---
        overlay = self._create_overlay(original_img, heatmap_resized)

        # =====================================================================
        # CLINICAL ENHANCEMENTS
        # =====================================================================
        # 1. Anatomical location
        anatomical_location = self._compute_anatomical_location(heatmap_resized)

        # 2. Lesion dimensions
        lesion_dims = self._compute_lesion_dimensions(heatmap_resized)

        # 3. Lesion area cm²
        lesion_area_cm2 = self._compute_lesion_area_cm2(heatmap_resized)

        # 4. Segmentation contour image
        seg_contour_b64 = self._create_segmentation_contour(original_img, heatmap_resized)

        # 5. MRI + Heatmap + Contour combined
        overlay_with_contour_b64 = self._create_overlay_with_contour(original_img, heatmap_resized)

        # 6. Uncertainty
        uncertainty = self._compute_uncertainty(heatmap_resized, attention_score)

        # 7. AI description (Vietnamese)
        ai_description = self._generate_ai_description(
            anatomical_location, lesion_dims, lesion_area_cm2, attention_score, uncertainty
        )

        interpretation = self._interpret_attention_score(attention_score)

        return {
            "heatmap": heatmap_resized,
            "overlay": overlay,
            "attention_score": attention_score,
            "focused_regions": focused_regions,
            "technical_info": {
                **self.layer_info,
                "aggregation_method": "2D spatial (single slice)",
                "gradient_method": "Grad-CAM (Gradient-weighted Class Activation Mapping)",
                "normalization": "ReLU + max normalization"
            },
            "attention_statistics": attention_stats,
            "interpretation": interpretation,
            "confidence_level": self._get_confidence_level(attention_score),
            "slice_info": {
                "type": "axial",
                "layer_applied": self.layer_name,
                "resolution": "256x256"
            },
            # ===== CLINICAL FIELDS =====
            "anatomical_location": anatomical_location,
            "lesion_dimensions_mm": lesion_dims,
            "lesion_area_cm2": lesion_area_cm2,
            "segmentation_contour_base64": seg_contour_b64,
            "overlay_with_contour_base64": overlay_with_contour_b64,
            "uncertainty": uncertainty,
            "ai_description": ai_description,
        }

    # =========================================================================
    # CLINICAL ANALYSIS METHODS
    # =========================================================================

    def _compute_anatomical_location(self, heatmap: np.ndarray) -> dict:
        """Map heatmap attention peak to anatomical brain region."""
        threshold = 0.6
        high_mask = heatmap > threshold
        if not np.any(high_mask):
            high_mask = heatmap > 0.4

        if not np.any(high_mask):
            return {
                "lobe_vi": "Không xác định",
                "lobe_en": "Unknown",
                "hemisphere": "N/A",
                "note": "Vùng chú ý phân tán, không xác định được vị trí cụ thể",
                "coordinates_norm": [0.5, 0.5]
            }

        ys, xs = np.where(high_mask)
        cy_norm = float(np.mean(ys)) / 256.0
        cx_norm = float(np.mean(xs)) / 256.0

        # Match to anatomy regions
        best_region = None
        for key, region in ANATOMY_REGIONS.items():
            y_min, y_max = region["y"]
            x_min, x_max = region["x"]
            if y_min <= cy_norm <= y_max and x_min <= cx_norm <= x_max:
                best_region = region
                break

        if best_region is None:
            # Fallback: hemisphere + vertical
            hemisphere = "trái" if cx_norm < 0.5 else "phải"
            if cy_norm < 0.4:
                lobe_vi = f"Thùy trán {hemisphere}"
                lobe_en = f"{'Left' if cx_norm < 0.5 else 'Right'} frontal"
                note = "Kiểm soát vận động, chức năng điều hành"
            elif cy_norm > 0.7:
                lobe_vi = f"Thùy chẩm {hemisphere}"
                lobe_en = f"{'Left' if cx_norm < 0.5 else 'Right'} occipital"
                note = "Xử lý thị giác"
            else:
                lobe_vi = f"Thùy đỉnh {hemisphere}"
                lobe_en = f"{'Left' if cx_norm < 0.5 else 'Right'} parietal"
                note = "Xử lý cảm giác, nhận thức không gian"
            best_region = {"lobe_vi": lobe_vi, "lobe_en": lobe_en, "note": note}

        hemisphere = "Trái" if cx_norm < 0.5 else "Phải"
        return {
            "lobe_vi": best_region["lobe_vi"],
            "lobe_en": best_region["lobe_en"],
            "hemisphere": hemisphere,
            "note": best_region["note"],
            "coordinates_norm": [round(cx_norm, 3), round(cy_norm, 3)]
        }

    def _compute_lesion_dimensions(self, heatmap: np.ndarray, threshold: float = 0.5) -> dict:
        """Compute bounding box dimensions of attention region in mm."""
        binary = (heatmap > threshold).astype(np.uint8)
        if np.sum(binary) == 0:
            binary = (heatmap > 0.3).astype(np.uint8)

        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return {"length_mm": 0, "width_mm": 0, "max_diameter_mm": 0, "max_diameter_cm": 0, "status": "no_lesion"}

        largest = max(contours, key=cv2.contourArea)
        x, y, w, h = cv2.boundingRect(largest)

        # Rotated rect for true length/width
        if len(largest) >= 5:
            rect = cv2.minAreaRect(largest)
            (rw, rh) = rect[1]
            length_px = max(rw, rh)
            width_px = min(rw, rh)
        else:
            length_px = float(max(w, h))
            width_px = float(min(w, h))

        length_mm = round(length_px * PIXEL_TO_MM, 1)
        width_mm = round(width_px * PIXEL_TO_MM, 1)
        max_diam_mm = round(length_mm, 1)

        return {
            "length_mm": length_mm,
            "width_mm": width_mm,
            "height_mm": round(SLICE_THICKNESS_MM, 1),   # 1 slice
            "max_diameter_mm": max_diam_mm,
            "max_diameter_cm": round(max_diam_mm / 10, 2),
            "bbox_px": [int(x), int(y), int(w), int(h)],
            "status": "calculated"
        }

    def _compute_lesion_area_cm2(self, heatmap: np.ndarray, threshold: float = 0.5) -> float:
        """Area of attention region in cm²."""
        binary = (heatmap > threshold).astype(np.uint8)
        pixel_count = int(np.sum(binary))
        area_mm2 = pixel_count * (PIXEL_TO_MM ** 2)
        return round(area_mm2 / 100.0, 3)   # mm² → cm²

    def _create_segmentation_contour(self, original_img: np.ndarray, heatmap: np.ndarray) -> str:
        """Draw contour of high-attention region on grayscale MRI."""
        img_rgb = np.stack([original_img] * 3, axis=-1)
        img_rgb = (img_rgb * 255).astype(np.uint8)

        binary = (heatmap > 0.5).astype(np.uint8)
        # Morphological cleanup
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        result = img_rgb.copy()
        if contours:
            # Yellow contour
            cv2.drawContours(result, contours, -1, (255, 220, 0), 2)
            # Fill with semi-transparent yellow
            mask_fill = np.zeros_like(img_rgb)
            cv2.fillPoly(mask_fill, contours, (255, 220, 0))
            result = cv2.addWeighted(result, 1.0, mask_fill, 0.25, 0)

        pil_img = Image.fromarray(result)
        return self._pil_to_base64(pil_img)

    def _create_overlay_with_contour(self, original_img: np.ndarray, heatmap: np.ndarray) -> str:
        """MRI + JET heatmap + yellow contour combined."""
        img_rgb = np.stack([original_img] * 3, axis=-1)
        img_rgb = (img_rgb * 255).astype(np.uint8)

        # Heatmap
        heatmap_colored = cv2.applyColorMap((heatmap * 255).astype(np.uint8), cv2.COLORMAP_JET)
        heatmap_colored = cv2.cvtColor(heatmap_colored, cv2.COLOR_BGR2RGB)
        blended = cv2.addWeighted(img_rgb, 0.60, heatmap_colored, 0.40, 0)

        # Contour
        binary = (heatmap > 0.5).astype(np.uint8)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            cv2.drawContours(blended, contours, -1, (255, 255, 0), 2)

        pil_img = Image.fromarray(blended)
        return self._pil_to_base64(pil_img)

    def _compute_uncertainty(self, heatmap: np.ndarray, attention_score: float) -> dict:
        """Entropy-based uncertainty estimation."""
        # Spatial entropy of heatmap distribution
        flat = heatmap.flatten()
        flat = flat / (flat.sum() + 1e-9)
        entropy = -np.sum(flat * np.log(flat + 1e-9))
        max_entropy = np.log(len(flat))
        normalized_entropy = float(entropy / max_entropy) if max_entropy > 0 else 0.0

        # Spatial spread (std of attention mass)
        ys, xs = np.where(heatmap > 0.4)
        if len(ys) > 0:
            spread = float(np.std(ys) + np.std(xs)) / 256.0
        else:
            spread = 1.0

        # Combined uncertainty score
        uncertainty_score = round((normalized_entropy * 0.6 + spread * 0.4), 3)

        if uncertainty_score < 0.35 and attention_score > 0.55:
            level = "Thấp"
            level_en = "LOW"
            color = "#22c55e"
            warning = None
        elif uncertainty_score < 0.55:
            level = "Trung bình"
            level_en = "MEDIUM"
            color = "#f59e0b"
            warning = "Mức độ chắc chắn trung bình. Khuyến nghị xem xét lại thủ công."
        else:
            level = "Cao"
            level_en = "HIGH"
            color = "#ef4444"
            warning = "⚠️ Mô hình không chắc chắn cao. Cần xem lại thủ công bởi chuyên gia."

        return {
            "level": level,
            "level_en": level_en,
            "score": uncertainty_score,
            "entropy": round(normalized_entropy, 3),
            "spatial_spread": round(spread, 3),
            "color": color,
            "warning": warning
        }

    def _generate_ai_description(self, anatomy: dict, dims: dict, area_cm2: float,
                                   attention_score: float, uncertainty: dict) -> str:
        """Generate Vietnamese clinical text description."""
        lobe = anatomy.get("lobe_vi", "vùng không xác định")
        max_d = dims.get("max_diameter_mm", 0)
        att_pct = round(attention_score * 100, 1)
        unc = uncertainty.get("level", "trung bình")

        size_desc = ""
        if max_d > 0:
            if max_d < 10:
                size_desc = f"kích thước nhỏ ({max_d} mm)"
            elif max_d < 30:
                size_desc = f"kích thước trung bình ({max_d} mm)"
            else:
                size_desc = f"kích thước lớn ({max_d} mm)"
        else:
            size_desc = "kích thước không rõ"

        conf_desc = "mạnh" if att_pct > 65 else ("vừa" if att_pct > 40 else "yếu")

        desc = (
            f"AI tập trung {conf_desc} (điểm tập trung {att_pct}%) vào vùng {lobe}, "
            f"phát hiện tổn thương {size_desc} (diện tích ~{area_cm2} cm²). "
            f"Mức độ không chắc chắn: {unc}. "
            f"{anatomy.get('note', '')}."
        )
        return desc

    # =========================================================================
    # EXISTING HELPERS (unchanged)
    # =========================================================================

    def _interpret_attention_score(self, score: float) -> str:
        if score > 0.8:
            return "High confidence: CNN shows strong, focused attention on identified region"
        elif score > 0.6:
            return "Moderate-high confidence: CNN attention is concentrated but with some diffusion"
        elif score > 0.4:
            return "Moderate confidence: CNN shows distributed attention across multiple regions"
        elif score > 0.2:
            return "Low-moderate confidence: CNN attention is diffuse, prediction may be uncertain"
        else:
            return "Low confidence: CNN attention is highly diffuse, high uncertainty in prediction"

    def _get_confidence_level(self, score: float) -> str:
        if score > 0.7:
            return "HIGH"
        elif score > 0.4:
            return "MEDIUM"
        else:
            return "LOW"

    def _create_overlay(self, original_img, heatmap, alpha=0.4):
        img_rgb = np.stack([original_img] * 3, axis=-1)
        img_rgb = (img_rgb * 255).astype(np.uint8)
        heatmap_colored = cv2.applyColorMap((heatmap * 255).astype(np.uint8), cv2.COLORMAP_JET)
        heatmap_colored = cv2.cvtColor(heatmap_colored, cv2.COLOR_BGR2RGB)
        overlay = cv2.addWeighted(img_rgb, 1 - alpha, heatmap_colored, alpha, 0)
        return Image.fromarray(overlay)

    def _find_focused_regions(self, heatmap, threshold=0.6):
        binary = (heatmap > threshold).astype(np.uint8) * 255
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        regions = []
        for contour in contours:
            if cv2.contourArea(contour) > 100:
                x, y, w, h = cv2.boundingRect(contour)
                regions.append({
                    "bbox": (x, y, x + w, y + h),
                    "area": w * h,
                    "attention": float(np.mean(heatmap[y:y+h, x:x+w]))
                })
        regions.sort(key=lambda r: r['attention'], reverse=True)
        return regions[:5]

    def compare_with_mask(self, heatmap, ground_truth_mask):
        heatmap_binary = (heatmap > 0.5).astype(np.float32)
        mask_binary = (ground_truth_mask > 0.5).astype(np.float32)
        intersection = np.sum(heatmap_binary * mask_binary)
        union = np.sum(np.maximum(heatmap_binary, mask_binary))
        iou = intersection / union if union > 0 else 0
        tp = intersection
        fp = np.sum(heatmap_binary) - intersection
        fn = np.sum(mask_binary) - intersection
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        return {
            "iou": float(iou),
            "precision": float(precision),
            "recall": float(recall),
            "overlap_percentage": float(intersection / np.sum(mask_binary) * 100) if np.sum(mask_binary) > 0 else 0
        }

    # =========================================================================
    # UTILITY
    # =========================================================================
    @staticmethod
    def _pil_to_base64(img: Image.Image) -> str:
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        return "data:image/png;base64," + base64.b64encode(buf.read()).decode()

    def __del__(self):
        try:
            plt.close('all')
        except:
            pass