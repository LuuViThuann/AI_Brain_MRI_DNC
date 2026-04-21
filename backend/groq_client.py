"""
groq_client.py
Groq AI integration — text report generation + Vision multi-model MRI analysis.
Vision models tried in priority order until one succeeds.
"""

import os
import json
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# Vision-capable models, in priority order (newest / largest first)
GROQ_VISION_MODELS = [
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "llama-3.2-90b-vision-preview",
    "llama-3.2-11b-vision-preview",
]

client = Groq(api_key=GROQ_API_KEY)


# ───────────────────────────────────────────────────────────
# TEXT-BASED REPORT (unchanged)
# ───────────────────────────────────────────────────────────

def generate_diagnosis_report(
    confidence: float,
    tumor_detected: bool,
    tumor_area_percent: float,
    location_hint: str = "frontal lobe"
) -> dict:
    """
    Generate a structured medical diagnosis report using a fast Groq text model.
    Returns a dict with 'summary', 'findings', 'recommendations', 'severity', etc.
    """

    prompt = f"""
Bạn là trợ lý AI chuyên khoa thần kinh phóng xạ. Dựa trên kết quả phân tích MRI sau đây,
hãy tạo một báo cáo y tế có cấu trúc BẰNG TIẾNG VIỆT.

--- Kết Quả Phân Tích MRI ---
Phát hiện khối u: {"Có" if tumor_detected else "Không"}
Độ tin cậy phát hiện: {confidence * 100:.1f}%
Diện tích khối u: {tumor_area_percent:.2f}% lát cắt não
Vị trí ước tính: {location_hint}
Loại khối u (nếu có): U thần kinh đệm độ thấp (LGG)
--- Kết Thúc Kết Quả ---

Tạo phản hồi CHỈ JSON (không markdown, không văn bản thêm) với các khóa sau:
{{
  "summary": "Tóm tắt tổng quan 1-2 câu bằng tiếng Việt",
  "findings": ["phát hiện 1", "phát hiện 2", "phát hiện 3"],
  "severity": "Thấp | Trung bình | Cao",
  "recommendations": ["khuyến nghị 1", "khuyến nghị 2", "khuyến nghị 3"],
  "disclaimer": "Tuyên bố từ chối trách nhiệm y tế chuẩn bằng tiếng Việt"
}}

Hãy chính xác, chuyên nghiệp và chính xác về mặt lâm sàng. Viết TOÀN BỘ bằng tiếng Việt.
"""

    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "Bạn là trợ lý AI y tế phiên giải kết quả hình ảnh tự động. "
                    "Bạn KHÔNG chẩn đoán — bạn tổng hợp kết quả AI cho các chuyên gia y tế. "
                    "Luôn nhấn mạnh vai trò của chuyên môn con người. "
                    "Phản hồi TOÀN BỘ bằng tiếng Việt và CHỈ với JSON hợp lệ."
                )
            },
            {"role": "user", "content": prompt}
        ],
        max_tokens=1000,
        temperature=0.3
    )

    raw = response.choices[0].message.content.strip()

    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        report = json.loads(raw)
    except json.JSONDecodeError:
        report = {
            "summary": raw[:200],
            "findings": ["Không thể phân tích báo cáo có cấu trúc."],
            "severity": "Không xác định",
            "recommendations": ["Vui lòng tham khảo ý kiến chuyên gia."],
            "disclaimer": "Báo cáo do AI tạo ra. Không thay thế lời khuyên y tế chuyên nghiệp."
        }

    # Enrich with standard metadata
    report.setdefault('ai_methods_used', [
        "U-Net CNN (phân đoạn khối u)",
        "Grad-CAM (trực quan hóa điểm chú ý)",
        "Phân tích dựa trên quy tắc (đo lường)",
        "SHAP (tầm quan trọng đặc trưng)",
    ])
    report.setdefault('confidence_interpretation', (
        f"Độ tin cậy {confidence * 100:.1f}% đại diện cho xác suất được hiệu chỉnh "
        f"từ mô hình CNN. Đây KHÔNG phải là sự chắc chắn lâm sàng."
    ))
    report.setdefault('limitations', [
        "Phân tích lát cắt 2D đơn (không phải toàn bộ khối 3D)",
        "Mô hình AI được huấn luyện trên bộ dữ liệu cụ thể (LGG MRI)",
        "Không có xác nhận mô bệnh học",
        "Cần xác nhận của bác sĩ X-quang chuyên khoa",
    ])

    return report


# ───────────────────────────────────────────────────────────
# VISION-BASED MRI ANALYSIS (NEW)
# ───────────────────────────────────────────────────────────

def analyze_mri_with_vision(
    image_base64: str,          # "data:image/png;base64,..."
    cnn_prediction: dict,
) -> dict:
    """
    Send the raw MRI image to a GROQ Vision model for direct visual analysis.
    Tries models in GROQ_VISION_MODELS order until one succeeds.

    Returns dict with:
        vision_analysis  : bool  — True if successful
        model_used       : str
        visual_findings  : [str]
        tumor_characteristics : {shape, boundary, signal_intensity}
        additional_observations : str
        vision_confidence : "High"|"Medium"|"Low"
        error            : str (only if vision_analysis=False)
    """
    loc   = cnn_prediction.get('location_hint', 'unknown')
    conf  = cnn_prediction.get('confidence', 0)
    det   = "detected" if cnn_prediction.get('tumor_detected') else "not detected"

    system_msg = (
        "Bạn là trợ lý bác sĩ X-quang thần kinh chuyên gia. "
        "Bạn phân tích hình ảnh MRI não và mô tả phát hiện theo cách có cấu trúc, lâm sàng BẰNG TIẾNG VIỆT. "
        "Chỉ phản hồi bằng JSON hợp lệ — không markdown, không văn bản ngoài JSON."
    )

    user_prompt = f"""Phân tích hình ảnh MRI não này một cách cẩn thận.

Bối cảnh phân tích CNN (chỉ để tham khảo — tin vào đánh giá thị giác của bạn):
- Khối u: {det}
- Độ tin cậy CNN: {conf:.1%}
- Vị trí ước tính: {loc}

Chỉ phản hồi với cấu trúc JSON này (TOÀN BỘ bằng tiếng Việt):
{{
  "visual_findings": [
    "Phát hiện 1 (cụ thể về những gì bạn thấy)",
    "Phát hiện 2",
    "Phát hiện 3"
  ],
  "tumor_characteristics": {{
    "visible": true | false,
    "shape": "tròn | không đều | thùy | lan tỏa",
    "boundary": "ranh giới rõ | ranh giới không rõ | xâm lấn",
    "signal_intensity": "tăng tín hiệu | giảm tín hiệu | đồng tín hiệu | hỗn hợp",
    "estimated_size": "nhỏ (<2cm) | trung bình (2-4cm) | lớn (>4cm) | không đo được"
  }},
  "surrounding_tissue": "mô tả phù nề, hiệu ứng khối, dịch chuyển đường giữa (nếu có)",
  "additional_observations": "các đặc điểm đáng chú ý khác",
  "vision_confidence": "Cao | Trung bình | Thấp",
  "differential_considerations": ["khả năng 1", "khả năng 2"]
}}"""

    for model in GROQ_VISION_MODELS:
        try:
            print(f"      🔭 Trying vision model: {model}")
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_msg},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": image_base64}
                            },
                            {
                                "type": "text",
                                "text": user_prompt
                            }
                        ]
                    }
                ],
                max_tokens=900,
                temperature=0.2
            )

            raw = response.choices[0].message.content.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.rsplit("```", 1)[0]

            result = json.loads(raw)
            result['vision_analysis'] = True
            result['model_used']      = model
            print(f"      ✅ Vision analysis complete with {model}")
            return result

        except json.JSONDecodeError as e:
            print(f"      ⚠️  {model} — JSON parse error: {e}")
            continue
        except Exception as e:
            err_str = str(e)
            print(f"      ⚠️  {model} failed: {err_str[:120]}")
            # Don't retry on auth / quota issues for all models
            if "401" in err_str or "403" in err_str:
                break
            continue

    return {
        "vision_analysis": False,
        "error": "Tất cả mô hình thị giác GROQ đều thất bại hoặc khóa API chưa được cấu hình",
        "visual_findings": [],
        "model_used": None,
    }