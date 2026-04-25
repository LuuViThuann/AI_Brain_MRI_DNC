"""
routes/diagnosis.py (COMPLETE INTEGRATED VERSION WITH XAI)
POST /api/diagnose — Upload MRI image, get CNN prediction + Groq AI report + XAI analysis.

FIXES APPLIED:
✅ XAI data properly integrated into diagnosis response
✅ Consistent response structure
✅ Non-blocking error handling for optional components
✅ Clear data structure documentation
"""

import sys
import os
import tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from PIL import Image
import io
import traceback
import time
import numpy as np
import base64

from utils.mni_registration import register_to_mni
from utils.atlas_loader import load_julich_atlas, get_region_at_voxel
from utils.slice_generator import generate_all_slices
from prediction_engine import predict_tumor, load_model, preprocess_image
from groq_client import generate_diagnosis_report, analyze_mri_with_vision
from xai.gradcam import GradCAMExplainer
from xai.rule_based import RuleBasedAnalyzer
from xai.shap_explain import SHAPExplainer, extract_features_for_shap

from database import SessionLocal
from models import DiagnosticHistory

router = APIRouter()


# ===== HELPER FUNCTIONS =====

def validate_image_file(file: UploadFile) -> None:
    """Validate uploaded file is a valid image."""
    allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/bmp"]
    
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type}. "
                   f"Allowed types: PNG, JPG, JPEG, BMP"
        )
    
    if hasattr(file, 'size') and file.size > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="File too large. Maximum size: 10MB"
        )


def map_location_to_3d_key(location_hint: str) -> str:
    """Map CNN location hint to 3D brain location key."""
    location_lower = location_hint.lower()
    
    if "left" in location_lower:
        hemisphere = "left"
    elif "right" in location_lower:
        hemisphere = "right"
    else:
        hemisphere = "left"
    
    if "frontal" in location_lower:
        lobe = "frontal"
    elif "temporal" in location_lower:
        lobe = "temporal"
    elif "parietal" in location_lower:
        lobe = "parietal"
    elif "occipital" in location_lower:
        lobe = "occipital"
    else:
        lobe = "frontal"
    
    if "superior" in location_lower and hemisphere == "left":
        return "superior_left"
    elif "inferior" in location_lower and hemisphere == "right":
        return "inferior_right"
    
    return f"{hemisphere}_{lobe}"


def image_to_base64(img: Image.Image) -> str:
    """Convert PIL Image to base64 string."""
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    img_base64 = base64.b64encode(buffer.read()).decode()
    return f"data:image/png;base64,{img_base64}"


def generate_combined_insights(gradcam, rules, shap) -> list:
    """Generate combined insights from all XAI methods in Vietnamese."""
    insights = []
    
    # Grad-CAM insights
    if gradcam and gradcam.get('attention_score', 0) > 0.7:
        insights.append("Độ tin cậy: CNN cho thấy độ tin cậy cao đối với vùng u được xác định")
    elif gradcam and gradcam.get('attention_score', 0) < 0.3:
        insights.append("Cảnh báo: Sự tập trung của CNN bị phân tán - dự đoán có thể không chắc chắn")
    
    # Rule-based insights
    if rules:
        risk = rules.get('risk_level', 'Unknown')
        if risk == 'High':
            insights.append(
                f"Rủi ro: Phân loại rủi ro CAO: Phát hiện u kích thước {rules.get('tumor_area_mm2', 'không xác định')}mm²"
            )
        elif risk == 'Low':
            insights.append(
                f"Thông tin: Phân loại rủi ro THẤP: Khối u nhỏ ({rules.get('tumor_area_mm2', 'không xác định')}mm²)"
            )
        
        # Location insights
        location = rules.get('location', '').lower()
        if 'frontal' in location:
            insights.append("Vị trí: Vị trí thùy trán có thể ảnh hưởng đến chức năng vận động")
        elif 'temporal' in location:
            insights.append("Vị trí: Vị trí thùy thái dương có thể ảnh hưởng đến trí nhớ/ngôn ngữ")
        
        # Warnings
        warnings = rules.get('warnings', [])
        if warnings:
            # Try to translate common warnings on the fly or just use them
            for w in warnings[:2]:
                w_vn = w.replace("⚠ Very large tumor detected", "⚠ Phát hiện khối u rất lớn") \
                        .replace("⚠ Extensive brain involvement", "⚠ Sự xâm lấn não diện rộng") \
                        .replace("⚠ Frontal lobe involvement", "⚠ Liên quan thùy trán") \
                        .replace("⚠ Temporal lobe involvement", "⚠ Liên quan thùy thái dương") \
                        .replace("⚠ Highly irregular shape detected", "⚠ Phát hiện hình dạng không đều") \
                        .replace("⚠ Irregular boundaries suggest infiltrative growth", "⚠ Ranh giới không đều gợi ý sự phát triển xâm lấn")
                insights.append(w_vn)
    
    # SHAP insights
    if shap:
        top_feature = shap.get('top_features', [None])[0] if shap.get('top_features') else None
        if top_feature:
            importance = shap.get('feature_importance', {}).get(top_feature, 0)
            # Map feature names to Vietnamese if possible
            feature_map = {
                "tumor_area": "diện tích khối u",
                "circularity": "độ tròn",
                "solidity": "độ đặc",
                "perimeter": "chu vi",
                "mean_intensity": "cường độ trung bình"
            }
            top_feature_vn = feature_map.get(top_feature, top_feature)
            insights.append(
                f"Đặc trưng: Đặc trưng quan trọng nhất: {top_feature_vn} (độ quan trọng: {importance:.3f})"
            )
    
    return insights


# ===== MAIN ENDPOINT =====

@router.post("/diagnose")
async def diagnose(file: UploadFile = File(...)):
    """
    Upload an MRI image → CNN segmentation → Groq AI report → XAI analysis.
    
    Response Structure:
    {
        "status": "success",
        "prediction": {
            "tumor_detected": bool,
            "confidence": float,
            "tumor_area_percent": float,
            "location_hint": str,
            "location_3d_key": str,
            "mask_shape": [int, int]
        },
        "report": {
            "summary": str,
            "findings": [str],
            "recommendations": [str],
            "severity": str,
            "disclaimer": str
        },
        "mask": [[float]],  // 256x256 binary mask
        "xai": {
            "gradcam": {
                "attention_score": float,
                "overlay_base64": str,
                "heatmap_base64": str,
                "focused_regions": [...]
            },
            "rule_based": {
                "tumor_area_mm2": float,
                "risk_level": str,
                "rules_triggered": [str],
                "warnings": [str]
            },
            "shap": {
                "top_features": [str],
                "feature_importance": {str: float},
                "shap_values": {str: float}
            },
            "combined_insights": [str]
        },
        "visualization": {...},
        "metadata": {...}
    }
    """
    start_time = time.time()
    
    try:
        # ===== STEP 1: VALIDATE FILE =====
        print(f"\n📥 Received file: {file.filename}")
        validate_image_file(file)
        
        # ===== STEP 2: READ AND LOAD IMAGE =====
        try:
            data = await file.read()
            img = Image.open(io.BytesIO(data))
            print(f"   ✅ Image loaded: {img.size} {img.mode}")
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to read image: {str(e)}"
            )
        
        # ===== STEP 3: CNN TUMOR PREDICTION =====
        print(f"   🔬 Running CNN tumor segmentation...")
        try:
            prediction = predict_tumor(img)
            print(f"   ✅ Prediction complete:")
            print(f"      • Tumor detected: {prediction['tumor_detected']}")
            print(f"      • Confidence: {prediction['confidence']:.2%}")
            print(f"      • Area: {prediction['tumor_area_percent']:.2f}%")
            print(f"      • Location: {prediction['location_hint']}")
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"CNN prediction failed: {str(e)}"
            )
        
        # ===== STEP 4: GROQ AI REPORT GENERATION =====
        print(f"   🤖 Generating Groq AI diagnosis report...")
        try:
            report = generate_diagnosis_report(
                confidence=prediction["confidence"],
                tumor_detected=prediction["tumor_detected"],
                tumor_area_percent=prediction["tumor_area_percent"],
                location_hint=prediction["location_hint"]
            )
            print(f"   ✅ Report generated successfully")
        except Exception as e:
            print(f"   ⚠️  Groq API warning: {str(e)}")
            report = {
                "summary": "Automated analysis completed",
                "findings": f"{'Tumor detected' if prediction['tumor_detected'] else 'No tumor detected'} "
                           f"with {prediction['confidence']:.1%} confidence.",
                "recommendations": [
                    "Consult with a radiologist for professional interpretation",
                    "Consider additional imaging if needed"
                ],
                "severity": "medium" if prediction["tumor_detected"] else "low",
                "disclaimer": "This is an AI-generated report. Not a substitute for professional medical advice."
            }
                # ===== STEP 4b: GROQ VISION ANALYSIS =====
        vision_report = None
        try:
            print(f"   🔭 Sending MRI to GROQ Vision models...")
            img_b64 = image_to_base64(img)
            vision_report = analyze_mri_with_vision(
                image_base64=img_b64,
                cnn_prediction=prediction
            )
            if vision_report.get('vision_analysis'):
                # Enrich text report findings with vision insights
                v_findings = vision_report.get('visual_findings', [])
                if v_findings and isinstance(report.get('findings'), list):
                    report['findings'] = report['findings'] + [
                        f"Vision: {f}" for f in v_findings[:2]
                    ]
                report['vision_model'] = vision_report.get('model_used', 'unknown')
                print(f"   ✅ Vision analysis merged (model: {vision_report.get('model_used')})")
            else:
                print(f"   ⚠️  Vision: {vision_report.get('error', 'failed')}")
        except Exception as e:
            print(f"   ⚠️  Vision analysis error: {e}")
            vision_report = None

        xai_result = {
            "error": None,
            "gradcam": None,
            "rule_based": None,
            "shap": None,
            "combined_insights": []
        }
        
        try:
            print(f"   🔍 Running XAI analysis...")
            
            model = load_model()
            img_array = preprocess_image(img)
            mask = np.array(prediction["mask"])
            mri_array = np.array(img.convert('L').resize((256, 256)))
            
            # 1. Grad-CAM
            try:
                print(f"      • Grad-CAM...")
                gradcam_explainer = GradCAMExplainer(model)
                gradcam_result = gradcam_explainer.generate_gradcam(img_array)
                
                # Convert to base64
                gradcam_result['overlay_base64'] = image_to_base64(gradcam_result['overlay'])
                del gradcam_result['overlay']
                
                heatmap_img = Image.fromarray((gradcam_result['heatmap'] * 255).astype(np.uint8))
                gradcam_result['heatmap_base64'] = image_to_base64(heatmap_img)
                del gradcam_result['heatmap']
                
                xai_result['gradcam'] = gradcam_result
                print(f"      ✅ Grad-CAM complete")
            except Exception as e:
                print(f"      ⚠️  Grad-CAM failed: {str(e)}")
            
            # 2. Rule-based analysis
            try:
                print(f"      • Rule-based...")
                rule_analyzer = RuleBasedAnalyzer()
                rule_result = rule_analyzer.analyze(mask, mri_array)
                xai_result['rule_based'] = rule_result
                
                if 'severity' not in report or not report['severity']:
                    report['severity'] = rule_result.get('risk_level', 'medium').lower()
                
                print(f"      ✅ Rule-based complete")
            except Exception as e:
                print(f"      ⚠️  Rule-based failed: {str(e)}")
            
            # 3. SHAP explanation
            try:
                print(f"      • SHAP...")
                features = extract_features_for_shap(mask, mri_array)
                shap_explainer = SHAPExplainer()
                shap_result = shap_explainer.explain_prediction(features)
                xai_result['shap'] = shap_result
                print(f"      ✅ SHAP complete")
            except Exception as e:
                print(f"      ⚠️  SHAP failed: {str(e)}")
            
            # 4. Combined insights
            combined_insights = generate_combined_insights(
                xai_result['gradcam'],
                xai_result['rule_based'],
                xai_result['shap']
            )
            xai_result['combined_insights'] = combined_insights
            
            print(f"   ✅ XAI analysis complete")
            
        except Exception as e:
            print(f"   ⚠️  XAI analysis failed: {str(e)}")
            xai_result['error'] = str(e)
        
        # ===== STEP 6: MNI REGISTRATION (OPTIONAL) =====
        try:
            # ✅ FIX Windows: use tempfile instead of /tmp/
            tmp_dir = tempfile.mkdtemp(prefix='neuroscan_')
            temp_mri  = os.path.join(tmp_dir, 'patient_mri.npy')
            temp_mask_path = os.path.join(tmp_dir, 'tumor_mask.npy')
            np.save(temp_mri, img_array)
            np.save(temp_mask_path, mask)

            # Register to MNI
            mni_result = register_to_mni(temp_mri, temp_mask_path)

            # Load atlas
            atlas = load_julich_atlas()

            # Find tumor location in atlas
            tumor_coords = np.argwhere(mni_result['tumor_mni'] > 0.5)
            if len(tumor_coords) > 0:
                centroid = tumor_coords.mean(axis=0).astype(int)
                region_name = get_region_at_voxel(*centroid, atlas)
                prediction['atlas_region'] = region_name

            # Add to response
            mni_data = {
                'mri': mni_result['mri_mni'].tolist(),
                'tumor': mni_result['tumor_mni'].tolist(),
                'atlas_region': prediction.get('atlas_region', 'Unknown')
            }

        except Exception as e:
            print(f"⚠️ MNI registration failed: {e}")
            mni_data = None

        # ===== STEP 6b: GENERATE 3-VIEW MRI SLICES =====
        slices_data = None
        try:
            print(f"   🔪 Generating multi-plane slices...")
            mask_np = np.array(prediction['mask'], dtype=np.float32)
            # Centroid for crosshair default position
            tumor_pixels = np.argwhere(mask_np > 0.5)
            if len(tumor_pixels) > 0:
                cy_px, cx_px = tumor_pixels.mean(axis=0)
                cx_norm = float(cx_px) / mask_np.shape[1]
                cy_norm = float(cy_px) / mask_np.shape[0]
            else:
                cx_norm, cy_norm = 0.5, 0.5

            # NEW: Multiclass mask for color grading
            mc_mask_np = np.array(prediction.get('multiclass_mask'), dtype=np.uint8) if prediction.get('multiclass_mask') else None

            slices_data = generate_all_slices(
                img=img,
                mask_2d=mask_np,
                mc_mask_2d=mc_mask_np,
                cx=cx_norm,
                cy=cy_norm,
                size=512
            )
            slices_data['crosshair'] = {'cx': cx_norm, 'cy': cy_norm}
            print(f"   ✅ Slices generated (crosshair at {cx_norm:.2f}, {cy_norm:.2f})")

            # ✅ NEW: attach Grad-CAM heatmap for frontend Heatmap mode
            if xai_result.get('gradcam') and xai_result['gradcam'].get('heatmap_base64'):
                slices_data['heatmap_b64'] = xai_result['gradcam']['heatmap_base64']
        except Exception as e:
            print(f"   ⚠️  Slice generation failed: {e}")
            slices_data = None
        
        # ===== STEP 7: MAP LOCATION FOR 3D VISUALIZATION =====
        location_3d_key = map_location_to_3d_key(prediction["location_hint"])
        tumor_size_3d = min(prediction["tumor_area_percent"] / 100.0 * 3, 1.0)
        
        # ===== STEP 8: EXTRACT DETAILED METRICS =====
        detailed_metrics = None
        if xai_result.get('rule_based'):
            detailed_metrics = xai_result['rule_based'].get('detailed_metrics')
        
        depth_metrics = None
        if xai_result.get('rule_based'):
            depth_metrics = xai_result['rule_based'].get('depth_metrics')
        
        # ===== STEP 9: BUILD COMPLETE RESPONSE =====
        processing_time = time.time() - start_time
        
        response = {
            "status": "success",
            "prediction": {
                "tumor_detected": prediction["tumor_detected"],
                "confidence": prediction["confidence"],
                "tumor_area_percent": prediction["tumor_area_percent"],
                "location_hint": prediction["location_hint"],
                "location_3d_key": location_3d_key,
                "mask_shape": [256, 256],
                "centroid_px": prediction.get("centroid_px"),
                "centroid_normalized": prediction.get("centroid_normalized"),
            },
            "detailed_metrics": detailed_metrics,
            "depth_metrics": depth_metrics,
            "report": report,
            "mask": prediction["mask"],
            "multiclass_mask": prediction.get("multiclass_mask"),
            "multiclass_stats": prediction.get("multiclass_stats"),
            "xai": xai_result,
            "visualization": {
                "brain3d_url": f"/api/brain3d?location={location_3d_key}&tumor_size={tumor_size_3d:.2f}",
                "tumor_location": location_3d_key,
                "tumor_size": round(tumor_size_3d, 2)
            },
            "metadata": {
                "filename": file.filename,
                "processing_time": round(processing_time, 3),
                "model_version": "U-Net v1.0",
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "xai_enabled": xai_result.get('error') is None,
                "vision_enabled": vision_report is not None and vision_report.get('vision_analysis', False)
            }
        }
        
        try:
            db = SessionLocal()
            try:
                # Thumbnail: reuse the small preview — resize to 128×128 to save space
                thumb_b64 = None
                try:
                    thumb = img.copy().convert("RGB")
                    thumb.thumbnail((128, 128))
                    import io as _io, base64 as _b64
                    buf = _io.BytesIO()
                    thumb.save(buf, format="PNG")
                    thumb_b64 = "data:image/png;base64," + _b64.b64encode(buf.getvalue()).decode()
                except Exception:
                    pass

                # Build the XAI blob — KEEP base64 images for history restoration
                xai_for_db = {}
                if xai_result:
                    # Use a deep copy or ensure we don't have non-serializable objects
                    # xai_result should already be a dict with base64 strings instead of PIL images
                    xai_for_db = {
                        "gradcam": xai_result.get("gradcam"),
                        "rule_based": xai_result.get("rule_based"),
                        "shap": xai_result.get("shap"),
                        "combined_insights": xai_result.get("combined_insights", []),
                        "error": xai_result.get("error")
                    }

                record = DiagnosticHistory(
                    image_filename  = file.filename,
                    image_base64    = thumb_b64,
                    tumor_detected  = prediction["tumor_detected"],
                    confidence      = prediction["confidence"],
                    tumor_area_pct  = prediction["tumor_area_percent"],
                    location_hint   = prediction["location_hint"],
                    severity        = report.get("severity"),
                    prediction_data = {
                        "tumor_detected":     prediction["tumor_detected"],
                        "confidence":         prediction["confidence"],
                        "tumor_area_percent": prediction["tumor_area_percent"],
                        "location_hint":      prediction["location_hint"],
                        "location_3d_key":    location_3d_key,
                        "centroid_px":        prediction.get("centroid_px"),
                        "centroid_normalized": prediction.get("centroid_normalized"),
                        "multiclass_stats":   prediction.get("multiclass_stats"),
                        "multiclass_mask":    prediction.get("multiclass_mask"),
                        "slices":             slices_data,  # ✅ SAVE SLICES FOR HISTORY
                    },
                    report_data     = report,
                    xai_data        = xai_for_db,
                    mask_data       = prediction["mask"],    # 256×256 nested list
                    processing_time = processing_time,
                    model_version   = "U-Net v1.0",
                )
                db.add(record)
                db.commit()

                # Attach the new record ID to the response so frontend can link directly
                response["history_id"] = str(record.id)
                print(f"   💾 Saved to history: {record.id}")
                print(f"      • XAI items: {list(xai_for_db.keys()) if xai_for_db else 'None'}")
                if xai_for_db and xai_for_db.get('gradcam'):
                    has_img = 'overlay_base64' in xai_for_db['gradcam']
                    print(f"      • Grad-CAM images: {'YES' if has_img else 'NO'}")

            finally:
                db.close()

        except Exception as e:
            # History save failure must NEVER break the diagnosis response
            print(f"   ⚠️  History save failed (non-fatal): {e}")

        # Add MNI data if available
        if mni_data:
            response['mni_data'] = mni_data

        # Add vision report if available
        if vision_report:
            response['vision_report'] = vision_report

        # Add slice views (always available)
        if slices_data:
            response['slices'] = slices_data

        print(f"   ✅ Diagnosis complete in {processing_time:.3f}s\n")

        return JSONResponse(content=response)
    
    # ===== ERROR HANDLING =====
    except HTTPException:
        raise
    
    except Exception as e:
        print(f"\n❌ Error in /api/diagnose:")
        print(f"   {type(e).__name__}: {str(e)}")
        print(traceback.format_exc())
        
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Internal server error",
                "message": str(e),
                "type": type(e).__name__
            }
        )


# ===== ADDITIONAL ENDPOINTS =====

@router.get("/model-info")
def get_model_info():
    """Get information about the diagnosis model."""
    return {
        "model_name": "U-Net Brain Tumor Segmentation",
        "version": "1.0.0",
        "architecture": "U-Net",
        "input_size": [256, 256, 1],
        "output_size": [256, 256, 1],
        "framework": "TensorFlow/Keras",
        "trained_on": "Brain MRI dataset",
        "classes": ["background", "tumor"],
        "capabilities": [
            "Tumor detection",
            "Tumor segmentation",
            "Location estimation",
            "Size quantification",
            "XAI analysis (Grad-CAM, Rules, SHAP)"
        ]
    }


@router.get("/supported-formats")
def get_supported_formats():
    """Get list of supported image formats."""
    return {
        "supported_formats": ["PNG", "JPG", "JPEG", "BMP"],
        "max_file_size_mb": 10,
        "recommended_format": "PNG",
        "color_modes": ["Grayscale", "RGB"],
        "min_resolution": [128, 128],
        "recommended_resolution": [256, 256]
    }