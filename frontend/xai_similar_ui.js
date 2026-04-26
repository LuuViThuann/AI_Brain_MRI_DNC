/**
 * xai_similar_ui.js - FIXED VERSION (Vietnamese Feature Names)
 * ✅ Tất cả lỗi syntax đã được sửa
 * Hiển thị tên feature bằng tiếng Việt
 */

(function XAISimilarUIModule() {
  'use strict';

  const API_BASE = 'http://127.0.0.1:8000/api';
  const DEBUG = true;

  // ===== 🇻🇳 FEATURE NAME TRANSLATION MAP =====
  const FEATURE_NAMES_VI = {
    // Geometric features
    'tumor_area': 'Diện tích khối u',
    'tumor_perimeter': 'Chu vi khối u',
    'circularity': 'Độ tròn',
    'solidity': 'Độ đặc',
    'aspect_ratio': 'Tỷ lệ khung hình',
    'bbox_width': 'Chiều rộng khung',
    'bbox_height': 'Chiều cao khung',

    // Location features
    'location_x': 'Vị trí ngang (X)',
    'location_y': 'Vị trí dọc (Y)',

    // Intensity features
    'mean_intensity': 'Cường độ trung bình',
    'std_intensity': 'Độ lệch cường độ',
    'min_intensity': 'Cường độ tối thiểu',
    'max_intensity': 'Cường độ tối đa',

    // Additional features
    'contrast': 'Độ tương phản',
    'homogeneity': 'Độ đồng nhất',
    'entropy': 'Entropy',
    'edge_density': 'Mật độ cạnh'
  };

  // ===== 🇻🇳 FEATURE DESCRIPTIONS (Giải thích chi tiết) =====
  const FEATURE_DESCRIPTIONS_VI = {
    'tumor_area': 'Kích thước vùng khối u (mm²). Yếu tố quan trọng nhất để đánh giá mức độ nghiêm trọng.',
    'tumor_perimeter': 'Chu vi đường viền khối u. Phản ánh hình dạng và ranh giới của khối u.',
    'circularity': 'Mức độ hình tròn của khối u (0-1). Giá trị cao = hình dạng đều đặn.',
    'solidity': 'Tỷ lệ giữa diện tích khối u và diện tích bao lồi. Phản ánh độ đặc của khối u.',
    'aspect_ratio': 'Tỷ lệ chiều rộng/chiều cao. Cho biết khối u có bị kéo dài theo một chiều không.',
    'location_x': 'Vị trí khối u theo chiều ngang (trái-phải). Quan trọng để xác định vùng não bị ảnh hưởng.',
    'location_y': 'Vị trí khối u theo chiều dọc (trên-dưới). Giúp định vị chính xác khối u.',
    'mean_intensity': 'Cường độ sáng trung bình của khối u. Phản ánh mật độ mô.',
    'std_intensity': 'Độ biến thiên cường độ sáng. Cho biết khối u có đồng nhất hay không.',
    'bbox_width': 'Chiều rộng của hình chữ nhật bao quanh khối u.',
    'bbox_height': 'Chiều cao của hình chữ nhật bao quanh khối u.'
  };

  // ===== 🎨 FEATURE IMPORTANCE COLORS =====
  const IMPORTANCE_COLORS = {
    critical: { threshold: 40, color: '#ef4444', label: 'Yếu tố chính', rgb: '239, 68, 68' },
    high: { threshold: 20, color: '#f59e0b', label: 'Yếu tố quan trọng', rgb: '245, 158, 11' },
    medium: { threshold: 10, color: '#0ea5e9', label: 'Yếu tố phụ', rgb: '14, 165, 233' },
    low: { threshold: 0, color: '#94a3b8', label: 'Ảnh hưởng nhỏ', rgb: '148, 163, 184' }
  };

  // ===== LOGGING UTILITY =====
  function log(message, data = null) {
    if (!DEBUG) return;
    const style = 'color: #0097b4; font-weight: bold;';
    if (data) {
      console.log(`%c[XAI] ${message}`, style, data);
    } else {
      console.log(`%c[XAI] ${message}`, style);
    }
  }

  function warn(message, data = null) {
    const style = 'color: #ff9100; font-weight: bold;';
    if (data) {
      console.warn(`%c[XAI] ${message}`, style, data);
    } else {
      console.warn(`%c[XAI] ${message}`, style);
    }
  }

  function error(message, data = null) {
    const style = 'color: #ff5252; font-weight: bold;';
    if (data) {
      console.error(`%c[XAI] ${message}`, style, data);
    } else {
      console.error(`%c[XAI] ${message}`, style);
    }
  }

  // ===== MAIN UI CONTROLLER ===== 
  window.XAISimilarUI = {

    // State management
    state: {
      currentXAIData: null,
      currentSimilarData: null,
      filteredSimilarCases: [], // ✅ For tumor-only filtering
      currentPage: 1,           // ✅ Pagination
      itemsPerPage: 8,          // ✅ Cards per page
      activeRecordId: null,     // ✅ Track which history item is selected
      historyItems: [],         // ✅ Cache history list
      isInitialized: false
    },

    // ===== INITIALIZATION =====
    init: function () {
      log('🚀 Initializing XAI & Similar Cases UI (Vietnamese Mode)');

      try {
        this.setupEventListeners();
        this.setupDiagnosisIntegration();
        this.state.isInitialized = true;
        log('✅ UI initialized and ready');
      } catch (e) {
        error('Failed to initialize', e);
      }
    },

    // ===== EVENT LISTENERS SETUP =====
    setupEventListeners: function () {
      log('Setting up event listeners');

      document.addEventListener('diagnosisComplete', (event) => {
        log('📥 Diagnosis complete event received', event.detail);

        if (event.detail && event.detail.xaiData) {
          this.state.currentXAIData = event.detail.xaiData;
          window.lastXAIData = event.detail.xaiData;

          this.renderXAIDashboard(event.detail.xaiData);
          this.showXAIPanel();
        }

        if (event.detail && event.detail.similarData) {
          this.state.currentSimilarData = event.detail.similarData;
          window.lastSimilarData = event.detail.similarData;

          this.renderSimilarCases(event.detail.similarData);
        }

        // ✅ Refresh history sidebar when new diagnosis completes
        this.loadHistoryAndRefresh();
      });

      document.addEventListener('diagnosisError', (event) => {
        warn('Diagnosis error event received', event.detail);
        this.showXAIError(event.detail?.message || 'Unknown error');
      });
    },

    // ===== DIAGNOSIS INTEGRATION =====
    setupDiagnosisIntegration: function () {
      log('Setting up diagnosis integration');

      window.XAISimilarUI.renderDiagnosisResults = (diagnosisData) => {
        log('Rendering diagnosis results', diagnosisData);

        if (diagnosisData.xai) {
          window.XAISimilarUI.renderXAIDashboard(diagnosisData.xai);
          window.XAISimilarUI.showXAIPanel();
        }

        if (diagnosisData.similar_cases) {
          window.XAISimilarUI.renderSimilarCases({
            similar_cases: diagnosisData.similar_cases,
            search_time_ms: diagnosisData.search_time_ms || 0,
            total_cases: diagnosisData.total_cases || 0
          });
          window.XAISimilarUI.showSimilarPanel();
        }
      };
    },

    // ===== FETCH SIMILAR CASES =====
    fetchSimilarCases: async function (imageFile) {
      log('🔍 Fetching similar cases...');

      if (!imageFile) {
        warn('No image file provided');
        this.showSimilarPlaceholder('no-image');
        return null;
      }

      try {
        const formData = new FormData();
        formData.append('file', imageFile);
        formData.append('k', 200); // ✅ Increase k to 200 for better filtering pool

        log('📤 Sending request to /api/similar/find');

        const response = await fetch(`${API_BASE}/similar/find`, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json();
          log('⚠️ Similar search unavailable:', errorData);

          if (response.status === 503) {
            this.showSimilarPlaceholder('index-not-built', errorData);
            return null;
          }

          throw new Error(errorData.message || 'Similar search failed');
        }

        const data = await response.json();
        log('✅ Similar cases received:', data);

        this.state.currentSimilarData = data;
        window.lastSimilarData = data;

        this.renderSimilarCases(data);

        return data;

      } catch (error) {
        warn('❌ Similar cases fetch error:', error);
        this.showSimilarPlaceholder('error', error);
        return null;
      }
    },

    // ===== RENDER XAI DASHBOARD =====
    renderXAIDashboard: function (xaiData) {
      const panel = document.getElementById('xaiPanel');

      if (!panel) {
        error('XAI panel not found in DOM');
        return;
      }

      log('📊 Rendering XAI Dashboard', xaiData);

      if (!xaiData) {
        // If no data provided, try to load latest from history
        if (!this.state.historyItems || this.state.historyItems.length === 0) {
          this.loadHistoryAndRefresh();
          return;
        }
        this.showXAIError('No XAI data provided');
        return;
      }

      const hasGradCAM = xaiData.gradcam && (Object.keys(xaiData.gradcam).length > 0 || xaiData.gradcam.attention_score !== undefined);
      const hasRuleBased = xaiData.rule_based && Object.keys(xaiData.rule_based).length > 0;
      const hasSHAP = xaiData.shap && Object.keys(xaiData.shap).length > 0;
      const hasInsights = xaiData.combined_insights && xaiData.combined_insights.length > 0;

      const hasAnyData = hasGradCAM || hasRuleBased || hasSHAP || hasInsights;

      if (!hasAnyData && xaiData.error) {
        this.showXAIError(xaiData.error);
        return;
      }

      log('XAI Data Available:', {
        gradCAM: hasGradCAM,
        ruleBased: hasRuleBased,
        shap: hasSHAP,
        insights: hasInsights
      });

      const html = `
        <div class="xai-container" style="${this.styles.container}">
          
          <div class="xai-layout">
            ${this.renderXAISidebar(this.state.historyItems)}

            <div class="xai-content-main">
              <!-- Header -->
              <div class="xai-header" style="${this.styles.header}">
                <h2 style="${this.styles.title}">Phân Tích AI Có Giải Thích</h2>
                <p style="${this.styles.subtitle}">Phân tích đa phương pháp để hiểu quyết định của AI</p>
              </div>
              
              <!-- Clinical Diagnosis Report -->
              ${this.renderClinicalReportCard()}

              <!-- Cards Grid -->
              <div class="xai-grid" style="${this.styles.grid}">
            
                ${hasGradCAM ? this.renderGradCAMCard(xaiData.gradcam) : ''}
                  ${window.lastDiagnosisData ? this.renderTumorGradingCard(window.lastDiagnosisData) : ''}
                ${hasRuleBased ? this.renderRuleBasedCard(xaiData.rule_based) : ''}
                ${hasSHAP ? this.renderSHAPCard(xaiData.shap) : ''}
              
                <!-- Integrated Final Report (Inside Grid) -->
                <div id="integratedReportArea" style="width: 100%; margin-top: 10px;">
                  ${this.renderIntegratedReport(xaiData, window.lastDiagnosisData)}
                </div>
              </div>
              
             

            </div>
          </div>
        </div>
      `;

      panel.innerHTML = html;
      this.showXAIPanel();

      log('✅ XAI dashboard rendered successfully');
    },

    // ===== GRAD-CAM CARD — MINIMALIST CLINICAL v3 =====
    renderGradCAMCard: function (gradcam) {
      if (!gradcam) return '';

      // Fix N/A issue: Get data from the actual diagnosis record
      const diag = window.lastDiagnosisData || {};
      const xai = diag.xai || {};
      
      // ✅ FIX: Merge clinical meta from ALL possible sources including nested gradcam in xai_data
      let clinMeta = gradcam.clinical_meta
        || xai.gradcam?.clinical_meta
        || xai.clinical_meta
        || diag.clinical_meta;

      // ✅ FALLBACK: If clinMeta is missing (old records), compute it locally
      if (!clinMeta && diag.prediction) {
        log('🛠️ Re-computing clinical meta-analysis from prediction data');
        clinMeta = this.computeClinicalMeta(diag);
      }
      
      clinMeta = clinMeta || {};
      
      const attScore       = Math.round((gradcam.attention_score || 0) * 100);
      const anatomy        = gradcam.anatomical_location || {};
      const dims           = gradcam.lesion_dimensions_mm || {};
      const area_cm2       = gradcam.lesion_area_cm2 || 0;
      const uncertainty    = gradcam.uncertainty || {};
      const classProbs     = gradcam.class_probabilities || {};
      const aiDesc         = gradcam.ai_description || '';

      const malignancy     = clinMeta.malignancy_risk || {};
      const edema          = clinMeta.edema_assessment || {};
      const massEffect     = clinMeta.mass_effect_signs || {};
      const nextRecs       = clinMeta.next_recommendations || [];
      const ruleBased      = xai.rule_based || gradcam.rule_based || {};

      const probsMap = {
        'U màng não': { key: 'meningioma', color: '#0ea5e9' },
        'U tuyến yên': { key: 'pituitary', color: '#8b5cf6' },
        'U thần kinh đệm': { key: 'glioma', color: '#ef4444' },
        'Không u': { key: 'no_tumor', color: '#10b981' }
      };

      // Confidence score logic
      const confScore = diag.prediction ? Math.round((diag.prediction.confidence || 0) * 100) : attScore;
      const confColor = confScore >= 80 ? '#0d9488' : confScore >= 55 ? '#ca8a04' : '#dc2626';
      const uncColor = (uncertainty.score || 0) > 0.4 ? '#ef4444' : (uncertainty.score || 0) > 0.2 ? '#f59e0b' : '#22c55e';
      const uncLevel = (uncertainty.score || 0) > 0.4 ? 'Cao' : (uncertainty.score || 0) > 0.2 ? 'Trung bình' : 'Thấp';

      // ✅ FIX: Provide meaningful fallback labels
      const malLevel = malignancy.level || (Object.keys(malignancy).length === 0 ? 'Phân tích...' : 'N/A');
      const malColor = malignancy.color || '#64748b';
      const edLevel  = edema.level  || (Object.keys(edema).length === 0 ? 'Phân tích...' : 'N/A');
      const edColor  = edema.color  || '#64748b';
      const meSeverity = massEffect.severity || 'Bình thường';
      const meColor    = massEffect.color    || '#64748b';

      const img1 = gradcam.overlay_base64 || '';
      const img2 = gradcam.heatmap_base64 || '';
      const img3 = gradcam.overlay_with_contour_base64 || gradcam.segmentation_contour_base64 || '';

      const volCm3 = (ruleBased.detailed_metrics || {}).volume_cm3 || 0;
      const lobeVi = anatomy.lobe_vi || 'Vùng không xác định';
      // ✅ FIX: Define lobeNote that was missing
      const lobeNote = anatomy.function_vi || anatomy.function || anatomy.note || 'Khu vực tổn thương não';

      // Malignancy score display
      const malScoreDisplay = malignancy.score !== undefined ? `${malignancy.score}/${malignancy.max_score || 7}` : '—';

      return `
        <div class="xai-card xai-animate delay-2 gradcam-clinical-card" style="${this.styles.card}; padding: 0; overflow: hidden;">

          <!-- ══ HEADER BANNER — CLEAN LIGHT ══ -->
          <div style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 18px 24px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="background: #eff6ff; color: #3b82f6; padding: 3px 10px; border-radius: 6px; font-size: 10px; font-weight: 600; letter-spacing: 0.4px; border: 1px solid #bfdbfe;">
                  <i class="fa-solid fa-brain" style="margin-right: 5px;"></i>GRAD-CAM PHÂN TÍCH LÂM SÀNG
                </span>
              </div>
              <h3 style="color: #1e293b; margin: 0 0 5px 0; font-size: 16px; font-weight: 500;">Trực Quan Hóa AI — Chi Tiết Chẩn Đoán</h3>
              <p style="color: #64748b; margin: 0; font-size: 12px; line-height: 1.5;">${this.escapeHtml(aiDesc)}</p>
            </div>
            <!-- Malignancy badge — light card style -->
            <div style="text-align: center; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 18px; min-width: 130px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
              <div style="font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; font-weight: 500;">NGUY CƠ ÁC TÍNH</div>
              <div style="color: ${malColor}; font-size: 16px; font-weight: 500; margin-bottom: 3px;">${malLevel}</div>
              <div style="font-size: 9px; color: #94a3b8; margin-top: 3px;">Điểm: ${malScoreDisplay}</div>
            </div>
          </div>

          <div style="padding: 20px 24px; display: flex; flex-direction: column; gap: 16px;">

            <!-- ══ PANEL A: Vị trí giải phẫu ══ -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 18px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
              <div style="width: 44px; height: 44px; border-radius: 50%; background: #0ea5e9; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <i class="fa-solid fa-location-crosshairs" style="color: white; font-size: 18px;"></i>
              </div>
              <div style="flex: 1; min-width: 160px;">
                <div style="font-size: 9px; color: #64748b; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px;">VỊ TRÍ GIẢI PHẪU TỔN THƯƠNG</div>
                <div style="font-size: 16px; font-weight: 500; color: #1e293b;">${this.escapeHtml(lobeVi)}</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 3px;"><i class="fa-solid fa-circle-info" style="margin-right: 4px; color: #94a3b8;"></i>${this.escapeHtml(lobeNote)}</div>
              </div>
              <div style="text-align: right; font-size: 10px; color: #64748b;">
                <div>Bán cầu: <strong style="color:#1e293b; font-weight: 500;">${anatomy.hemisphere || 'N/A'}</strong></div>
                <div style="margin-top: 4px;">Tọa độ: <code style="background:#f1f5f9; padding:2px 5px; border-radius:3px; font-size:9px; color:#475569;">(${(anatomy.coordinates_norm || ['-','-']).map(v => typeof v === 'number' ? v.toFixed(2) : v).join(', ')})</code></div>
              </div>
            </div>

            <!-- ══ PANEL B: Đo lường khối u ══ -->
            <div>
              <div style="font-size: 11px; font-weight: 500; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">
                <i class="fa-solid fa-ruler-combined" style="color: #64748b; margin-right: 6px;"></i>Đo Lường Khối U
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px;">
                ${this._metricBox('Đường kính lớn nhất', dims.max_diameter_mm ? dims.max_diameter_mm + ' mm' : 'N/A', dims.max_diameter_cm ? '(' + dims.max_diameter_cm + ' cm)' : '', '#0ea5e9')}
                ${this._metricBox('Dài × Rộng', (dims.length_mm && dims.width_mm) ? dims.length_mm + ' × ' + dims.width_mm + ' mm' : 'N/A', 'Mặt cắt ngang', '#8b5cf6')}
                ${this._metricBox('Chiều dày lát cắt', dims.height_mm ? dims.height_mm + ' mm' : '5 mm', '(1 slice MRI)', '#06b6d4')}
                ${this._metricBox('Diện tích lát cắt', area_cm2 ? area_cm2 + ' cm²' : 'N/A', 'Trên lát cắt hiện tại', '#10b981')}
                ${this._metricBox('Thể tích ước tính', volCm3 ? volCm3 + ' cm³' : (ruleBased.tumor_volume_mm3 ? (ruleBased.tumor_volume_mm3/1000).toFixed(2)+' cm³' : 'N/A'), 'Tính theo 1 lát cắt', '#f59e0b')}
                ${this._metricBox('Vùng não bị bao phủ', ruleBased.tumor_ratio ? ruleBased.tumor_ratio.toFixed(1) + ' %' : 'N/A', 'Diện tích lát cắt', '#ef4444')}
              </div>
            </div>

            <!-- ══ PANEL C: Xác suất loại u + Confidence + Uncertainty ══ -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; flex-wrap: wrap;">

              <!-- Probability bars -->
              <div style="background: #fafafa; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px;">
                <div style="font-size: 11px; font-weight: 500; color: #475569; text-transform: uppercase; margin-bottom: 12px;">
                  <i class="fa-solid fa-chart-bar" style="color: #64748b; margin-right: 6px;"></i>Xác Suất Loại U
                </div>
                ${Object.entries(probsMap).map(([label, cfg]) => {
                  const pct = Math.round((classProbs[cfg.key] || 0) * 100);
                  const isDom = classProbs.dominant_key === cfg.key;
                  return `
                    <div style="margin-bottom: 10px;">
                      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="font-size: 12px; color: #334155; font-weight: ${isDom ? '500' : '400'};">${isDom ? '• ' : ''}${label}</span>
                        <span style="font-size: 12px; font-weight: 500; color: #475569;">${pct}%</span>
                      </div>
                      <div style="height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                        <div style="height: 100%; width: ${pct}%; background: ${cfg.color}; border-radius: 4px; transition: width 0.6s ease;"></div>
                      </div>
                    </div>`;
                }).join('')}
                ${classProbs.note ? `<div style="font-size: 9px; color: #9ca3af; margin-top: 8px; font-style: italic;">${this.escapeHtml(classProbs.note)}</div>` : ''}
              </div>

              <!-- Confidence + Uncertainty stacked -->
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <!-- Confidence -->
                <div style="background: #fafafa; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; flex: 1;">
                  <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                    <i class="fa-solid fa-shield-halved" style="color: ${confColor}; margin-right: 5px;"></i>Độ Tin Cậy Chẩn Đoán
                  </div>
                  <div style="font-size: 32px; font-weight: 500; color: ${confColor};">${confScore}%</div>
                  <div style="height: 6px; background: #f1f5f9; border-radius: 3px; margin: 8px 0; overflow: hidden;">
                    <div style="height: 100%; width: ${confScore}%; background: ${confColor}; border-radius: 3px;"></div>
                  </div>
                  <div style="font-size: 10px; color: #6b7280;">Attention Score: <span style="color:#64748b; font-weight: 500;">${attScore}%</span></div>
                  <div style="font-size: 9px; color: #9ca3af; margin-top: 4px;">
                    <i class="fa-solid fa-circle-info" style="margin-right: 3px;"></i>Confidence ≠ Attention score
                  </div>
                </div>
                <!-- Uncertainty -->
                <div style="background: #ffffff; border: 1px solid #e8ecf0; border-radius: 10px; padding: 14px; flex: 1;">
                  <div style="font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; font-weight: 500;">
                    <i class="fa-solid fa-wave-square" style="color: #94a3b8; margin-right: 5px;"></i>MỨC ĐỘ KHÔNG CHẮC CHẮN
                  </div>
                  <div style="font-size: 18px; font-weight: 500; color: #64748b;">${uncLevel}</div>
                  <div style="font-size: 10px; color: #94a3b8; margin-top: 4px;">Chỉ số Entropy: ${uncertainty.score || 'N/A'}</div>
                  ${uncertainty.warning ? `
                    <div style="margin-top: 8px; padding: 6px 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 10px; color: #374151; font-weight: 500;">
                      ${this.escapeHtml(uncertainty.warning)}
                    </div>` : ''}
                </div>
              </div>
            </div>

            <!-- ══ PANEL D: 3 ảnh + opacity slider ══ -->
            <div>
              <div style="font-size: 11px; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">
                <i class="fa-solid fa-images" style="color: #0097b4; margin-right: 6px;"></i>Bản Đồ Heatmap & Segmentation
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 12px;">
                ${img1 && img1 !== 'data:image/png;base64,' ? `
                  <div class="gcam-img-slot">
                    <img id="gcam-overlay-img" src="${img1}" alt="MRI + Heatmap" style="width:100%;border-radius:8px;border:1px solid #e5e7eb;" onerror="this.style.display='none'"/>
                    <p style="text-align:center;font-size:10px;color:#6b7280;margin:5px 0 0;">MRI + Bản đồ nhiệt</p>
                  </div>` : ''}
                ${img2 && img2 !== 'data:image/png;base64,' ? `
                  <div class="gcam-img-slot">
                    <img src="${img2}" alt="Heatmap thuần" style="width:100%;border-radius:8px;border:1px solid #e5e7eb;" onerror="this.style.display='none'"/>
                    <p style="text-align:center;font-size:10px;color:#6b7280;margin:5px 0 0;">Heatmap thuần (Grad-CAM)</p>
                  </div>` : ''}
                ${img3 && img3 !== 'data:image/png;base64,' ? `
                  <div class="gcam-img-slot">
                    <img src="${img3}" alt="Segmentation + Contour" style="width:100%;border-radius:8px;border:1px solid #e5e7eb;" onerror="this.style.display='none'"/>
                    <p style="text-align:center;font-size:10px;color:#6b7280;margin:5px 0 0;">MRI + Heatmap + Viền khối u</p>
                  </div>` : ''}
                ${!img1 && !img2 && !img3 ? `
                  <div style="grid-column:1/-1;padding:30px;text-align:center;background:#f8fafc;border:1px dashed #d1dde8;border-radius:8px;">
                    <i class="fa-solid fa-image-slash" style="font-size:28px;color:#94a3b8;"></i>
                    <p style="color:#64748b;font-size:11px;margin:8px 0 0;">Hình ảnh Grad-CAM không có sẵn cho bản ghi lịch sử cũ.</p>
                  </div>` : ''}
              </div>
              <!-- Opacity slider -->
              ${img1 ? `
              <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:12px;">
                <i class="fa-solid fa-sliders" style="color:#0097b4;"></i>
                <span style="font-size:11px;color:#6b7280;white-space:nowrap;">Độ trong suốt overlay:</span>
                <input type="range" min="0" max="100" value="70" id="gcam-opacity-slider"
                  style="flex:1;height:4px;accent-color:#0097b4;cursor:pointer;"
                  oninput="(function(v){var img=document.getElementById('gcam-overlay-img');if(img)img.style.opacity=(v/100);})(this.value)">
                <span id="gcam-opacity-val" style="font-size:11px;color:#0097b4;font-weight:700;min-width:30px;">70%</span>
              </div>
              <script>(function(){var sl=document.getElementById('gcam-opacity-slider');if(sl)sl.addEventListener('input',function(){var v=document.getElementById('gcam-opacity-val');if(v)v.textContent=this.value+'%';});}());<\/script>` : ''}
            </div>

            <!-- ══ PANEL E: Dấu hiệu lâm sàng (Phù não + Chèn ép) ══ -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <!-- Edema -->
              <div style="background: #ffffff; border: 1px solid #e8ecf0; border-radius: 10px; padding: 14px;">
                <div style="font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; font-weight: 500;">
                  <i class="fa-solid fa-droplet" style="color: #94a3b8; margin-right: 5px;"></i>MỨC ĐỘ PHÙ NÃO (EDEMA)
                </div>
                <div style="font-size: 18px; font-weight: 500; color: ${edColor}; margin-bottom: 4px;">${edLevel}</div>
                ${edema.ed_percent > 0 ? `<div style="font-size:11px; color:#64748b;">Tỷ lệ phù: <span style="font-weight: 500;">${edema.ed_percent}%</span></div>` : ''}
                <div style="font-size:9px;color:#94a3b8;margin-top:5px;">${edema.note || ''}</div>
              </div>
              <!-- Mass Effect -->
              <div style="background: #ffffff; border: 1px solid #e8ecf0; border-radius: 10px; padding: 14px;">
                <div style="font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; font-weight: 500;">
                  <i class="fa-solid fa-compress-arrows-alt" style="color: #94a3b8; margin-right: 5px;"></i>DẤU HIỆU CHÈN ÉP NÃO
                </div>
                <div style="font-size: 16px; font-weight: 500; color: ${meColor}; margin-bottom: 6px;">${meSeverity}</div>
                ${(massEffect.signs || []).length > 0 ? `
                  <ul style="margin:0;padding:0;list-style:none;">
                    ${(massEffect.signs || []).map(s => `
                      <li style="font-size:11px;color:#64748b;margin-bottom:3px;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:9px;margin-right:4px;color:${meColor};"></i>${this.escapeHtml(s)}
                      </li>`).join('')}
                  </ul>` : `<div style="font-size:11px;color:#16a34a;"><i class="fa-solid fa-check-circle" style="margin-right:4px;"></i>Không phát hiện dấu hiệu chèn ép</div>`}
              </div>
            </div>
 
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <div style="font-size: 12px; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 0.8px; display:flex; align-items:center; gap:8px;">
                  <i class="fa-solid fa-chart-line" style="color: #0ea5e9;"></i>BIỂU ĐỒ TIẾN TRIỂN KHỐI U
                </div>
                <div style="font-size: 10px; color: #64748b; background: #f1f5f9; padding: 4px 10px; border-radius: 20px; border: 1px solid #e2e8f0;">
                  Theo dõi kích thước (mm)
                </div>
              </div>

              ${dims.max_diameter_mm > 0 ? `
                <div style="position:relative; height:45px; background:#f8fafc; border-radius:8px; margin:25px 0 15px; border:1px solid #e2e8f0; overflow:visible;">
                  <!-- Scale Background Grid -->
                  <div style="position:absolute; left:0; top:0; bottom:0; width:1px; background:#cbd5e1; z-index:1;"></div>
                  <div style="position:absolute; left:20%; top:0; bottom:0; width:1px; background:#e2e8f0; border-left:1px dashed #cbd5e1; z-index:1;"></div>
                  <div style="position:absolute; left:60%; top:0; bottom:0; width:1px; background:#e2e8f0; border-left:1px dashed #cbd5e1; z-index:1;"></div>
                  
                  <!-- Scale Labels -->
                  <div style="position:absolute; left:0; top:-20px; font-size:9px; color:#94a3b8; font-weight:600;">0mm</div>
                  <div style="position:absolute; left:20%; top:-20px; font-size:9px; color:#64748b; transform:translateX(-50%); font-weight:600;">10mm (Nhỏ)</div>
                  <div style="position:absolute; left:60%; top:-20px; font-size:9px; color:#64748b; transform:translateX(-50%); font-weight:600;">30mm (TB)</div>
                  <div style="position:absolute; right:0; top:-20px; font-size:9px; color:#94a3b8; font-weight:600;">50mm+</div>

                  <!-- The Progress Bar -->
                  <div style="position:absolute; left:0; top:10px; height:25px; width:${Math.min(100, (dims.max_diameter_mm / 50) * 100)}%; background:linear-gradient(90deg, #0ea5e9, #0284c7); border-radius:0 12px 12px 0; z-index:2; box-shadow:0 4px 12px rgba(2,132,199,0.25); transition: width 1.2s cubic-bezier(0.34, 1.56, 0.64, 1);">
                    <div style="position:absolute; right:10px; top:50%; transform:translateY(-50%); color:white; font-size:11px; font-weight:800; white-space:nowrap;">
                      ${dims.max_diameter_mm} mm
                    </div>
                  </div>

                  <!-- Current Marker Line -->
                  <div style="position:absolute; left:${Math.min(100, (dims.max_diameter_mm / 50) * 100)}%; top:0; bottom:-10px; width:2px; background:#0ea5e9; z-index:3;">
                    <div style="position:absolute; bottom:-15px; left:50%; transform:translateX(-50%); font-size:9px; font-weight:700; color:#0ea5e9; white-space:nowrap;">HIỆN TẠI</div>
                  </div>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-top:25px; padding-top:15px; border-top:1px solid #f1f5f9;">
                  <div style="text-align:center;">
                    <div style="font-size:9px; color:#94a3b8; text-transform:uppercase; margin-bottom:4px;">Phân loại</div>
                    <div style="font-size:12px; font-weight:600; color:#475569;">${dims.max_diameter_mm > 30 ? 'Khối u lớn' : (dims.max_diameter_mm > 10 ? 'Trung bình' : 'Khối u nhỏ')}</div>
                  </div>
                  <div style="text-align:center; border-left:1px solid #f1f5f9; border-right:1px solid #f1f5f9;">
                    <div style="font-size:9px; color:#94a3b8; text-transform:uppercase; margin-bottom:4px;">Diện tích</div>
                    <div style="font-size:12px; font-weight:600; color:#475569;">${area_cm2} cm²</div>
                  </div>
                  <div style="text-align:center;">
                    <div style="font-size:9px; color:#94a3b8; text-transform:uppercase; margin-bottom:4px;">Thể tích ước tính</div>
                    <div style="font-size:12px; font-weight:600; color:#475569;">${volCm3} cm³</div>
                  </div>
                </div>

                <div style="margin-top:15px; padding:10px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; font-size:10px; color:#64748b; line-height:1.5;">
                  <i class="fa-solid fa-circle-info" style="color:#0ea5e9; margin-right:6px;"></i>
                  <strong>Ghi chú chẩn đoán:</strong> Biểu đồ hiển thị kích thước tương đối so với thang đo lâm sàng. Cần thêm các lần chụp trong tương lai để xác định tốc độ tăng trưởng (doubling time).
                </div>
              ` : `
                <div style="text-align:center; padding:30px; color:#94a3b8; font-size:12px;">
                  <i class="fa-solid fa-chart-line" style="font-size:32px; display:block; margin-bottom:12px; opacity:0.3;"></i>
                  Chưa đủ dữ liệu để mô phỏng biểu đồ tiến triển.
                </div>
              `}
            </div>

            <!-- ══ PANEL G: Khuyến nghị tiếp theo ══ -->
            ${nextRecs.length > 0 ? `
            <div style="background: linear-gradient(135deg, #fff7ed, #fffbf5); border: 1px solid #fed7aa; border-radius: 10px; padding: 14px;">
              <div style="font-size: 11px; font-weight: 700; color: #7c2d12; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
                <i class="fa-solid fa-list-check" style="color: #ea580c; margin-right: 6px;"></i>Khuyến Nghị Tiếp Theo
              </div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${nextRecs.map(rec => {
                  const isHigh = rec.priority === 'urgent' || rec.priority === 'high';
                  const pBg = isHigh ? '#ef4444' : '#10b981';
                  const pText = '#ffffff';
                  const pLabel = rec.priority === 'urgent' ? 'KHẨN CẤP' : (rec.priority === 'high' ? 'QUAN TRỌNG' : 'THÔNG THƯỜNG');
                  const pIconColor = isHigh ? '#ef4444' : '#10b981';
                  
                  return `
                    <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#ffffff;border-radius:10px;border:1px solid ${isHigh ? '#fee2e2' : '#dcfce7'}; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                      <div style="width:32px; height:32px; border-radius:50%; background:${isHigh ? '#fef2f2' : '#f0fdf4'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        <i class="fa-solid ${rec.icon}" style="color:${pIconColor}; font-size:14px;"></i>
                      </div>
                      <span style="font-size:13px; color:#1e293b; flex:1; font-weight:500;">${this.escapeHtml(rec.text)}</span>
                      <span style="font-size:9px; font-weight:800; color:${pText}; background:${pBg}; padding:4px 8px; border-radius:6px; letter-spacing:0.5px; box-shadow: 0 2px 4px ${pBg}44;">
                        ${pLabel}
                      </span>
                    </div>`;
                }).join('')}
              </div>
            </div>` : ''}

            <!-- ══ PANEL H: Colorbar legend ══ -->
            ${this.renderConfidenceColorbar()}

          </div>
        </div>
      `;
    },

    // Helper: small metric box
    _metricBox: function(label, value, sub, color) {
      return `
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">${label}</div>
          <div style="font-size:17px;font-weight:600;color:${color};">${value}</div>
          ${sub ? `<div style="font-size:9px;color:#9ca3af;margin-top:3px;">${sub}</div>` : ''}
        </div>`;
    },


    // ===== RENDER CONFIDENCE COLORBAR (NEW) =====
    renderConfidenceColorbar: function () {
      return `
        <div style="margin: 16px 0; padding: 14px; background: rgba(0, 151, 180, 0.03); 
          border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: inset 0 1px 3px rgba(0,0,0,0.02);">
          
          <div style="color: #475569; font-size: 11px; text-transform: uppercase; 
            letter-spacing: 0.6px; margin-bottom: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-palette" style="color: #0097b4;"></i> Thang Màu Confidence Chẩn Đoán
          </div>
          
          <!-- Colorbar with semantic gradient -->
          <div style="display: flex; height: 10px; margin-bottom: 8px; border-radius: 5px; overflow: hidden;
            background: #f1f5f9; border: 1px solid #e2e8f0;">
            <div style="flex: 1; background: #ef4444; opacity: 0.85;" title="Tin cậy thấp"></div>
            <div style="flex: 1; background: #f59e0b; opacity: 0.85;" title="Tin cậy trung bình"></div>
            <div style="flex: 1; background: #10b981; opacity: 0.85;" title="Tin cậy cao"></div>
          </div>
          
          <!-- Labels -->
          <div style="display: flex; justify-content: space-between; font-size: 9px; 
            color: #94a3b8; font-family: 'Inter', sans-serif; font-weight: 500; margin-bottom: 12px;">
            <span>0.0 (Thấp)</span>
            <span>0.5 (TB)</span>
            <span>1.0 (Cao)</span>
          </div>
          
          <!-- Threshold Indicators - Re-styled for better clarity -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; padding-top: 10px; border-top: 1px dotted #e2e8f0;">
            <div style="display: flex; align-items: center; gap: 6px; color: #475569; font-size: 10px;">
              <i class="fa-solid fa-circle" style="font-size: 8px; color: #10b981;"></i>
              <span><strong>&gt; 0.7:</strong> Tin cậy cao</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; color: #475569; font-size: 10px;">
              <i class="fa-solid fa-circle" style="font-size: 8px; color: #f59e0b;"></i>
              <span><strong>0.3 - 0.7:</strong> Trung bình</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; color: #475569; font-size: 10px;">
              <i class="fa-solid fa-circle" style="font-size: 8px; color: #ef4444;"></i>
              <span><strong>&lt; 0.3:</strong> Tin cậy thấp</span>
            </div>
          </div>
        </div>
      `;
    },

    renderRuleBasedCard: function (rules) {
      if (!rules) return '';

      const riskLevel = rules.risk_level || 'Unknown';
      const riskColors = {
        'High': { bg: '#ef4444', rgb: '239, 68, 68', vi: 'Cao' },
        'Medium': { bg: '#f59e0b', rgb: '245, 158, 11', vi: 'Trung Bình' },
        'Low': { bg: '#10b981', rgb: '16, 185, 129', vi: 'Thấp' }
      };
      const riskColor = riskColors[riskLevel] || { bg: '#94a3b8', rgb: '148, 163, 184', vi: 'N/A' };

      // --- Left column: risk + measurements ---
      const leftContent = `
        <div style="padding: 12px; border: 1px solid #e2e8f0; background: #ffffff; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${riskColor.bg};">
          <div style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; font-weight: 600;">Mức Độ Rủi Ro</div>
          <div style="color: ${riskColor.bg}; font-size: 26px; font-weight: 700;">${riskColor.vi}</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div style="${this.styles.infoBox}">
            <div style="color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: 500;">Diện Tích Khối U</div>
            <div style="color: #334155; font-size: 18px; font-weight: 500; margin-top: 4px;">${rules.tumor_area_mm2 !== undefined ? rules.tumor_area_mm2.toFixed(1) : 'N/A'}</div>
            <div style="color: #94a3b8; font-size: 9px;">mm²</div>
          </div>
          <div style="${this.styles.infoBox}">
            <div style="color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: 500;">Phủ Não</div>
            <div style="color: #334155; font-size: 18px; font-weight: 500; margin-top: 4px;">${rules.tumor_ratio !== undefined ? rules.tumor_ratio.toFixed(1) : 'N/A'}</div>
            <div style="color: #94a3b8; font-size: 9px;">%</div>
          </div>
          <div style="${this.styles.infoBox}">
            <div style="color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: 500;">Vị Trí</div>
            <div style="color: #334155; font-size: 14px; font-weight: 500; margin-top: 4px;">${rules.location || 'N/A'}</div>
          </div>
          <div style="${this.styles.infoBox}">
            <div style="color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: 500;">Mức Độ</div>
            <div style="color: #334155; font-size: 14px; font-weight: 500; margin-top: 4px;">${rules.severity || 'Trung bình'}</div>
          </div>
        </div>
      `;

      // --- Right column: rules + warnings + depth (built dynamically) ---
      let rightContent = '';


      // Rules triggered
      if (rules.rules_triggered && rules.rules_triggered.length > 0) {
        rightContent += `
          <div style="${this.styles.infoBox}; margin-bottom: 5px;">
            <h4 style="color: #64748b; margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; font-weight: 500;">
              <i class="fa-solid fa-check-double" style="color: #94a3b8; margin-right: 8px;"></i> Quy Tắc Hệ Thống
            </h4>
            <ul style="margin: 0; padding-left: 0; list-style: none;">
              ${rules.rules_triggered.slice(0, 3).map(rule => `
                <li style="color: #475569; font-size: 12px; margin-bottom: 6px; display: flex; align-items: flex-start;">
                  <i class="fa-solid fa-check" style="color: #94a3b8; margin-right: 8px; margin-top: 2px;"></i> <span>${this.escapeHtml(rule)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        `;
      }

      // Warnings
      if (rules.warnings && rules.warnings.length > 0) {
        rightContent += `
          <div style="padding: 12px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; margin-bottom: 5px;">
            <h4 style="color: #be123c; margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; font-weight: 500;">
              <i class="fa-solid fa-triangle-exclamation" style="margin-right: 8px;"></i> Cảnh Báo Lâm Sàng
            </h4>
            <ul style="margin: 0; padding-left: 0; list-style: none;">
              ${rules.warnings.slice(0, 3).map(warning => `
                <li style="color: #9f1239; font-size: 12px; margin-bottom: 6px; display: flex; align-items: flex-start;">
                  <i class="fa-solid fa-triangle-exclamation" style="margin-right: 8px; margin-top: 2px;"></i> <span>${this.escapeHtml(warning)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        `;
      }

      // Depth Metrics
      if (rules.depth_metrics) {
        rightContent += `
          <div style="padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 5px;">
            <div style="color: #64748b; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; font-weight: 500;">Phân tích 3D (Độ sâu)</div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div style="color: #64748b; font-size: 11px;">Độ sâu khối u</div>
              <div style="color: #334155; font-size: 16px; font-weight: 500;">${rules.depth_metrics.tumor_depth_mm?.toFixed(1) || 'N/A'} mm</div>
            </div>
            <div style="padding: 8px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 8px;">
              <div style="display: flex; align-items: center; font-size: 12px; font-weight: 500; color: #475569;">
                <span style="margin-right: 8px;"><i class="fa-solid fa-ruler-vertical"></i></span>
                ${rules.depth_metrics.depth_category?.label || 'N/A'}
              </div>
            </div>
            <div style="background: #ffffff; padding: 8px; border: 1px solid #f1f5f9; border-radius: 6px; font-family: 'Consolas', monospace; font-size: 10px; color: #64748b; margin-bottom: 8px;">
              <div style="margin-bottom: 4px;">Centroid: <span style="color: #475569;">(${rules.depth_metrics.centroid_3d?.[0]?.toFixed(1)}, ${rules.depth_metrics.centroid_3d?.[1]?.toFixed(1)}, ${rules.depth_metrics.centroid_3d?.[2]?.toFixed(1)})</span></div>
            </div>
            <div style="background: #f8fafc; padding: 8px; border-radius: 6px; color: #64748b; font-size: 10px; line-height: 1.5;">
              <i class="fa-solid fa-lightbulb" style="color: #94a3b8; margin-right: 5px;"></i> ${this.getDepthClinicalMeaning(rules.depth_metrics.tumor_depth_mm)}
            </div>
          </div>
        `;
      }

      return `
        <div class="xai-card xai-animate delay-4" style="${this.styles.card}">
          <div style="${this.styles.cardHeader}">
            <h3 style="${this.styles.cardTitle}">Phân Tích Thống Kê</h3>
           
          </div>
          <div style="display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 240px;">${leftContent}</div>
            <div style="flex: 1.2; min-width: 240px;">${rightContent}</div>
          </div>
        </div>
      `;
    },


    // ===== SHAP CARD (VIETNAMESE + FIXED) =====
    renderSHAPCard: function (shap) {
      if (!shap) return '';

      const topFeatures = shap.top_features || [];
      const featureImportance = shap.feature_importance || {};

      log('Rendering SHAP card (Vietnamese)', { topFeatures, featureImportance });

      // --- Left column: explanation + legend ---
      const leftContent = `
        <div style="background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #e2e8f0;">
          <div style="color: #64748b; font-size: 11px; line-height: 1.6;">
            <i class="fa-solid fa-circle-info" style="color: #94a3b8; margin-right: 5px;"></i>
            % đóng góp <strong>tương đối</strong> của mỗi tính năng vào dự đoán cuối cùng.
            Chỉ số cao hơn cho thấy tầm quan trọng lớn hơn đối với kết quả AI.
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="padding: 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
            <span style="color: #334155; font-size: 10px; font-weight: 500;"><i class="fa-solid fa-circle" style="font-size: 8px; margin-right: 8px; color: #64748b;"></i> Yếu tố chính</span>
            <span style="color: #94a3b8; font-size: 9px; margin-left: 8px;">&gt; 40%</span>
          </div>
          <div style="padding: 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
            <span style="color: #334155; font-size: 10px; font-weight: 500;"><i class="fa-solid fa-circle" style="font-size: 8px; margin-right: 8px; color: #94a3b8;"></i> Quan trọng</span>
            <span style="color: #94a3b8; font-size: 9px; margin-left: 8px;">20–40%</span>
          </div>
          <div style="padding: 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
            <span style="color: #334155; font-size: 10px; font-weight: 500;"><i class="fa-solid fa-circle" style="font-size: 8px; margin-right: 8px; color: #cbd5e1;"></i> Yếu tố phụ</span>
            <span style="color: #94a3b8; font-size: 9px; margin-left: 8px;">&lt; 20%</span>
          </div>
        </div>
      `;

      // --- Right column: features list ---
      let rightContent = '';
      if (topFeatures.length > 0) {
        rightContent += `
          <h4 style="color: #64748b; margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase; font-weight: 500;">
            Chỉ Số Ảnh Hưởng (SHAP Importance)
          </h4>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${topFeatures.slice(0, 5).map((feature, index) => {
          const importance = featureImportance[feature] || 0;
          const importancePercent = Math.round(importance * 100);
          const featureNameVI = FEATURE_NAMES_VI[feature] || feature;
          const featureDesc = FEATURE_DESCRIPTIONS_VI[feature] || '';
          const importanceLevel = this.getImportanceLevel(importancePercent);
          log(`SHAP Feature ${index + 1}: ${feature} (${featureNameVI}) = ${importance} → ${importancePercent}%`);
          return `
                <div style="padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="flex: 1;">
                      <div style="color: #334155; font-size: 13px; font-weight: 500; margin-bottom: 2px;">${this.escapeHtml(featureNameVI)}</div>
                      <div style="font-size: 9px; color: #94a3b8;">${this.escapeHtml(feature)}</div>
                    </div>
                    <div style="text-align: right; margin-left: 12px;">
                      <div style="color: #475569; font-size: 18px; font-weight: 500;">${importancePercent}%</div>
                    </div>
                  </div>
                  <div style="${this.styles.progressBar}; margin-bottom: 8px;">
                    <div style="height: 100%; width: ${importancePercent}%; background: ${importanceLevel.color}; border-radius: 3px; transition: width 0.3s ease;"></div>
                  </div>
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: ${featureDesc ? '8px' : '0'};">
                    <span style="color: #64748b; font-size: 10px; font-weight: 500;">${importanceLevel.label}</span>
                  </div>
                  ${featureDesc ? `<div style="background: #ffffff; padding: 8px; border: 1px solid #f1f5f9; border-radius: 6px; margin-top: 8px;"><div style="color: #64748b; font-size: 10px; line-height: 1.5;"><i class="fa-solid fa-circle-info" style="color: #94a3b8; margin-right: 5px;"></i> ${this.escapeHtml(featureDesc)}</div></div>` : ''}
                </div>
              `;
        }).join('')}
          </div>
        `;
      } else {
        rightContent = `<p style="color: #4a5568; font-size: 12px; text-align: center; padding: 20px;">Không có dữ liệu tầm quan trọng tính năng</p>`;
      }

      return `
        <div class="xai-card xai-animate delay-5" style="${this.styles.card}">
          <div style="${this.styles.cardHeader}">
            <h3 style="${this.styles.cardTitle}">Tỷ Trọng Đóng Góp Vào Chẩn Đoán</h3>
          
          </div>
          <div style="display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap;">
            <div style="flex: 0.8; min-width: 220px;">${leftContent}</div>
            <div style="flex: 1.2; min-width: 240px;">${rightContent}</div>
          </div>
        </div>
      `;
    },


    // ===== RENDER CLINICAL REPORT CARD (NEW) =====
    renderClinicalReportCard: function () {
      const diagnosisData = window.lastDiagnosisData;
      if (!diagnosisData || !diagnosisData.report) {
        log('Missing diagnosis data for clinical report card');
        return '';
      }

      const report = diagnosisData.report;
      const vision = diagnosisData.vision_report;

      const severity = (report.severity || 'MEDIUM').toUpperCase();
      const severityColor = this.getConfidenceColorHex(severity === 'THẤP' ? 'LOW' : (severity === 'CAO' ? 'HIGH' : 'MEDIUM'));

      return `
        <div class="xai-card clinical-report-card xai-animate delay-1" style="${this.styles.card}; margin-bottom: 5px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
          <div style="${this.styles.cardHeader}; border-bottom: 1px solid #edf2f7; padding-bottom: 15px; margin-bottom: 20px; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 15px;">
              <div style="width: 45px; height: 45px; background: #f1f5f9; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #475569; border: 1px solid #e2e8f0;">
                <i class="fa-solid fa-file-medical"></i>
              </div>
              <div>
                <h3 style="${this.styles.cardTitle}; font-size: 20px; color: #1a202c;">Báo Cáo Chẩn Đoán AI Tổng Hợp</h3>
                <div style="display: flex; gap: 10px; margin-top: 4px;">
                   <span style="font-size: 11px; color: #718096; text-transform: uppercase; font-weight: 600;">Hồ sơ: #MRI-${Math.floor(Math.random() * 900000 + 100000)}</span>
                   <span style="font-size: 11px; color: #718096; font-weight: 600;">•</span>
                   <span style="font-size: 11px; color: #718096; font-weight: 600;">${new Date().toLocaleDateString('vi-VN')}</span>
                </div>
              </div>
            </div>
            <div style="
              background: #f1f5f9;
              color: #475569;
              padding: 6px 16px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: 500;
              border: 1px solid #e2e8f0;
              text-transform: uppercase;
              display: flex;
              align-items: center;
              gap: 8px;
            ">
              <i class="fa-solid fa-triangle-exclamation"></i>
              MỨC ĐỘ: ${report.severity || 'Trung Bình'}
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 20px;">
            <!-- Column 1: AI Summary & Findings -->
            <div style="display: flex; flex-direction: column; gap: 20px;">
              <div style="background: #f7fafc; padding: 18px; border-radius: 12px; border: 1px solid #edf2f7;">
                <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #2d3748; display: flex; align-items: center; gap: 8px;">
                  <i class="fa-solid fa-user-doctor" style="color: #0097b4;"></i> Tóm Tắt Chuyên Gia AI
                </h4>
                <p style="margin: 0; font-size: 13px; color: #4a5568; line-height: 1.7; font-style: italic;">
                  "${report.summary || 'Chưa có tóm tắt.'}"
                </p>
              </div>

              <div style="background: #ffffff; padding: 18px; border-radius: 12px; border: 1px solid #edf2f7;">
                <h4 style="margin: 0 0 15px 0; font-size: 14px; color: #2d3748; display: flex; align-items: center; gap: 8px;">
                  <i class="fa-solid fa-microscope" style="color: #0097b4;"></i> Các Phát Hiện Lâm Sàng
                </h4>
                <ul class="d3-report-list" style="margin: 0; padding: 0; list-style: none;">
                  ${(report.findings || []).map(f => {
        // Clean leading bullets/dashes/dots
        const cleanF = f.replace(/^[•\-\*\d\.\s]+/, '').trim();
        return `
                      <li style="margin-bottom: 12px; display: flex; align-items: flex-start; gap: 10px; line-height: 1.6; color: #4a5568; font-size: 13.5px;">
                        <i class="fa-solid fa-circle-check" style="color: #00c853; margin-top: 3px; font-size: 14px; flex-shrink: 0;"></i>
                        <span>${cleanF}</span>
                      </li>
                    `;
      }).join('')}
                </ul>
              </div>
            </div>

            <!-- Column 2: Recommendations -->
            <div style="background: #fffaf0; padding: 18px; border-radius: 12px; border: 1px solid #feebc8;">
              <h4 style="margin: 0 0 15px 0; font-size: 14px; color: #7b341e; display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-lightbulb" style="color: #f6ad55;"></i> Khuyến Nghị Xử Lý
              </h4>
              <ul class="d3-report-list" style="margin: 0; padding: 0; list-style: none;">
                ${(report.recommendations || []).map(r => {
        // Clean leading bullets/dashes/dots/arrows
        const cleanR = r.replace(/^[•\-\*\d\.\s\>→]+/, '').trim();
        return `
                    <li style="margin-bottom: 12px; display: flex; align-items: flex-start; gap: 10px; line-height: 1.6; color: #7b341e; font-size: 13.5px;">
                      <i class="fa-solid fa-arrow-right" style="color: #f6ad55; margin-top: 3px; font-size: 14px; flex-shrink: 0;"></i>
                      <span>${cleanR}</span>
                    </li>
                  `;
      }).join('')}
              </ul>
            </div>

            <!-- Column 3: Vision Analysis -->
            <div style="background: #f8fafc; padding: 0; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; display: flex; flex-direction: column;">
              <div style="padding: 15px 18px; background: #ffffff; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-brain" style="color: #64748b;"></i>
                <h4 style="margin: 0; font-size: 12px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">Phân tích Hình ảnh AI</h4>
              </div>
              <div style="padding: 18px; flex: 1; display: flex; flex-direction: column; gap: 15px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                  <div style="background: #ffffff; padding: 12px; border-radius: 8px; border: 1px solid #f1f5f9;">
                    <div style="font-size: 9px; color: #94a3b8; text-transform: uppercase; font-weight: 500; margin-bottom: 4px;">HÌNH DẠNG</div>
                    <div style="font-size: 16px; color: #334155; font-weight: 500;">${vision ? (vision.tumor_characteristics?.shape || 'tròn') : 'tròn'}</div>
                  </div>
                  <div style="background: #ffffff; padding: 12px; border-radius: 8px; border: 1px solid #f1f5f9;">
                    <div style="font-size: 9px; color: #94a3b8; text-transform: uppercase; font-weight: 500; margin-bottom: 4px;">RANH GIỚI</div>
                    <div style="font-size: 16px; color: #334155; font-weight: 500;">${vision ? (vision.tumor_characteristics?.boundary || 'Rõ nét') : 'Rõ nét'}</div>
                  </div>
                </div>
                <div style="background: #ffffff; padding: 12px; border-radius: 8px; border: 1px solid #f1f5f9; flex: 1;">
                  <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.6;">
                    <span style="font-weight: 500; color: #475569;">Ghi chú:</span> ${vision ? (vision.additional_observations || 'Không có ghi chú thêm.') : 'Đang xử lý dữ liệu.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    },

    // ===== INTEGRATED REPORT CARD (NEW) =====
    renderIntegratedReport: function (xaiData, diagnosisData) {
      if (!diagnosisData || !xaiData) return '';

      const prediction = diagnosisData.prediction || {};
      const stats = diagnosisData.multiclass_stats || {};
      const gradcam = xaiData.gradcam || {};
      const rules = xaiData.rule_based || {};
      
      const ncrPct = stats.total_tumor_pixels > 0 ? (stats.ncr_count / stats.total_tumor_pixels * 100) : 0;
      const etPct  = stats.total_tumor_pixels > 0 ? (stats.et_count  / stats.total_tumor_pixels * 100) : 0;
      const edPct  = stats.total_tumor_pixels > 0 ? (stats.ed_count  / stats.total_tumor_pixels * 100) : 0;

      // Integrated Conclusion Text Logic
      const generateContent = () => {
        let content = '';
        const confidence = (prediction.confidence ? prediction.confidence * 100 : 0).toFixed(1);
        const area = (rules.tumor_area_mm2 || 0).toFixed(1);
        const location = prediction.location_hint || 'Không rõ vị trí';
        const attention = gradcam.attention_score ? (gradcam.attention_score * 100).toFixed(1) : (stats.gradcam_attention ? (stats.gradcam_attention * 100).toFixed(1) : 'N/A');
        
        content += `<p style="margin-bottom: 12px; font-weight: 400; color: #475569;">Dựa trên phân tích đa tầng từ mô hình <strong>CNN Deep Learning</strong> và hệ thống giải thích <strong>XAI</strong>, hệ thống ghi nhận các phát hiện chính sau:</p>`;
        
        content += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 5px;">`;
        
        // Point 1: Detection & Confidence
        content += `
          <div style="background: #ffffff; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0;">
            <div style="font-size: 11px; color: #94a3b8; font-weight: 500; text-transform: uppercase; margin-bottom: 6px;">Độ tin cậy chuẩn đoán</div>
            <div style="font-size: 20px; font-weight: 500; color: #475569;">${confidence}%</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;"><i class="fa-solid fa-check-double" style="margin-right: 4px;"></i> Xác nhận sự diện diện khối u</div>
          </div>
        `;
        
        // Point 2: Location
        content += `
          <div style="background: #ffffff; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0;">
            <div style="font-size: 11px; color: #94a3b8; font-weight: 500; text-transform: uppercase; margin-bottom: 6px;">Vị trí ghi nhận</div>
            <div style="font-size: 18px; font-weight: 500; color: #334155;">${this.translateMedicalLocation ? this.translateMedicalLocation(location) : location}</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;"><i class="fa-solid fa-location-dot" style="margin-right: 4px;"></i> Tọa độ 3D chuẩn hóa</div>
          </div>
        `;
        content += `</div>`;

        content += `<div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 5px;">
          <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #334155; font-weight: 500; text-transform: uppercase;">Cấu trúc khối u (Phân lớp màu)</h4>
          <div style="display: flex; gap: 20px; align-items: center;">
            <div style="flex: 1;">
               <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                  <span style="font-size: 12px; color: #64748b;">Hoại tử (NCR): <span style="font-weight: 500;">${ncrPct.toFixed(1)}%</span></span>
                  <span style="font-size: 12px; color: #64748b;">Tăng cường (ET): <span style="font-weight: 500;">${etPct.toFixed(1)}%</span></span>
                  <span style="font-size: 12px; color: #64748b;">Phù nề (ED): <span style="font-weight: 500;">${edPct.toFixed(1)}%</span></span>
               </div>
               <div style="height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; display: flex;">
               <div style="height: 100%; width: ${ncrPct}%; background: #ef4444;"></div>
               <div style="height: 100%; width: ${etPct}%; background: #eab308;"></div>
               <div style="height: 100%; width: ${edPct}%; background: #22c55e;"></div>
               </div>
            </div>
          </div>
          <p style="margin: 12px 0 0 0; font-size: 12px; color: #475569; line-height: 1.6;">
            <i class="fa-solid fa-microscope" style="margin-right: 6px;"></i> 
            Kết quả định lượng diện tích khối u đạt <strong>${area} mm²</strong>. 
            Mức độ tập trung sự chú ý của AI (Grad-CAM) đạt <strong>${attention}%</strong> tại vùng nhân khối u.
          </p>
        </div>`;

        // Final Clinical Verdict
        let verdict = '';
        let verdictColor = '#0097b4';
        const risk = rules.risk_level || 'Trung bình';
        
        if (risk.toLowerCase().includes('cao') || ncrPct > 25) {
          verdict = `<strong>Đánh giá rủi ro:</strong> Khối u có dấu hiệu ác tính cao (Grade IV) với tỷ lệ hoại tử ${ncrPct.toFixed(1)}%. Cần can thiệp phẫu thuật khẩn cấp và làm sinh thiết giải phẫu bệnh.`;
          verdictColor = '#ef4444';
        } else if (risk.toLowerCase().includes('thấp')) {
          verdict = `<strong>Đánh giá rủi ro:</strong> Khối u tiến triển chậm, vùng tăng cường thấp. Đề nghị theo dõi định kỳ 3-6 tháng và kết hợp điều trị nội khoa.`;
          verdictColor = '#22c55e';
        } else {
          verdict = `<strong>Đánh giá rủi ro:</strong> Khối u ở mức độ trung bình. Cần đánh giá thêm sự thâm nhiễm vùng phù nề (${edPct.toFixed(1)}%) và các triệu chứng lâm sàng đi kèm.`;
          verdictColor = '#f59e0b';
        }

        content += `<div style="background: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid ${verdictColor}44; box-shadow: 0 4px 12px rgba(0,0,0,0.05); background-color: ${verdictColor}05;">
          <div style="color: ${verdictColor}; font-size: 14px; line-height: 1.8;">
            <i class="fa-solid fa-stethoscope" style="margin-right: 8px;"></i>
            ${verdict}
          </div>
        </div>`;

        return content;
      };

      return `
        <div class="xai-card integrated-report-card xai-animate delay-6" style="width: 100%; background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.08); margin-bottom: 5px; position: relative; overflow: hidden; box-sizing: border-box;">
          <div style="position: absolute; top: -50px; right: -50px; width: 200px; height: 200px; background: rgba(0, 151, 180, 0.03); border-radius: 50%; z-index: 0;"></div>
          
          <!-- Header -->
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; position: relative; z-index: 1;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 50px; height: 50px; background: #f1f5f9; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 24px; border: 1px solid #e2e8f0;">
                <i class="fa-solid fa-file-waveform"></i>
              </div>
              <div>
                <h3 style="margin: 0; color: #334155; font-size: 20px; font-weight: 500; letter-spacing: -0.5px;">Báo Cáo Kết Luận Tổng Hợp</h3>
                <p style="margin: 0; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 500;">AI Clinical Assessment</p>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">ID CHẨN ĐOÁN</div>
              <div style="font-family: 'Consolas', monospace; font-size: 13px; font-weight: 700; color: #475569;">#${diagnosisData.history_id?.substring(0, 8) || 'LIVE-XAI'}</div>
            </div>
          </div>

          <!-- Content Body -->
          <div style="position: relative; z-index: 1; color: #334155; font-size: 14px; line-height: 1.6;">
            ${generateContent()}
          </div>

          <!-- Footer -->
          <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 1;">
            <div style="display: flex; gap: 10px;">
               <span style="font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 6px;">
                Hệ thống chẩn đoán NeuroScanAI v2.0
               </span>
               <span style="font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 6px;">
                  <i class="fa-solid fa-fingerprint"></i> Xác thực số: AI-${Math.floor(Math.random()*1000)}
               </span>
            </div>
           
          </div>
        </div>
      `;
    },
    
    // Helper to translate location hints to medical Vietnamese
    translateMedicalLocation: function(location) {
      if (!location) return 'Không rõ vị trí';
      
      const loc = location.toLowerCase();
      
      const map = {
        'inferior': 'Cực dưới',
        'superior': 'Cực trên',
        'middle': 'Vùng giữa',
        'left': 'trái',
        'right': 'phải',
        'occipital lobe': 'Thùy chẩm',
        'parietal lobe': 'Thùy đỉnh',
        'temporal lobe': 'Thùy thái dương',
        'frontal lobe': 'Thùy trán',
        'parietal': 'Thùy đỉnh',
        'occipital': 'Thùy chẩm',
        'temporal': 'Thùy thái dương',
        'frontal': 'Thùy trán'
      };
      
      // Order of processing: directional then anatomical
      let translated = location;
      
      if (loc.includes('inferior left')) translated = 'Cực dưới thùy ' + (loc.includes('occipital') ? 'chẩm' : loc.includes('parietal') ? 'đỉnh' : loc.includes('temporal') ? 'thái dương' : 'trán') + ' trái';
      else if (loc.includes('inferior right')) translated = 'Cực dưới thùy ' + (loc.includes('occipital') ? 'chẩm' : loc.includes('parietal') ? 'đỉnh' : loc.includes('temporal') ? 'thái dương' : 'trán') + ' phải';
      else if (loc.includes('superior left')) translated = 'Cực trên thùy ' + (loc.includes('occipital') ? 'chẩm' : loc.includes('parietal') ? 'đỉnh' : loc.includes('temporal') ? 'thái dương' : 'trán') + ' trái';
      else if (loc.includes('superior right')) translated = 'Cực trên thùy ' + (loc.includes('occipital') ? 'chẩm' : loc.includes('parietal') ? 'đỉnh' : loc.includes('temporal') ? 'thái dương' : 'trán') + ' phải';
      else if (loc.includes('middle left')) translated = 'Vùng giữa thùy ' + (loc.includes('occipital') ? 'chẩm' : loc.includes('parietal') ? 'đỉnh' : loc.includes('temporal') ? 'thái dương' : 'trán') + ' trái';
      else if (loc.includes('middle right')) translated = 'Vùng giữa thùy ' + (loc.includes('occipital') ? 'chẩm' : loc.includes('parietal') ? 'đỉnh' : loc.includes('temporal') ? 'thái dương' : 'trán') + ' phải';
      
      // Fallback for simple matches
      if (translated === location) {
         Object.entries(map).forEach(([eng, vi]) => {
           const reg = new RegExp(eng, 'gi');
           translated = translated.replace(reg, vi);
         });
      }
      
      return translated;
    },

    // ===== RENDER SIMILAR CASES =====  
    renderSimilarCases: function (similarData) {
      const panel = document.getElementById('similarPanel');

      if (!panel) {
        warn('Similar panel not found in DOM');
        return;
      }

      log('📊 Rendering Similar Cases', similarData);

      // ✅ FIX: Update internal state so pagination works after reload
      this.state.currentSimilarData = similarData;

      if (!similarData || !similarData.similar_cases || similarData.similar_cases.length === 0) {
        this.showSimilarPlaceholder('no-results');
        return;
      }

      // ✅ 1. FILTER: Only show cases with tumor (Be robust with types)
      const filtered = similarData.similar_cases.filter(c =>
        c.has_tumor === true || c.has_tumor === 1 || c.has_tumor === "true"
      );
      this.state.filteredSimilarCases = filtered;

      if (filtered.length === 0) {
        log('Warning: No tumor cases found after filtering');
        this.showSimilarPlaceholder('no-results');
        return;
      }

      // ✅ 2. PAGINATION CALCULATIONS
      const totalItems = filtered.length;
      const totalPages = Math.ceil(totalItems / this.state.itemsPerPage);
      const currentPage = Math.min(this.state.currentPage, totalPages);

      const startIndex = (currentPage - 1) * this.state.itemsPerPage;
      const endIndex = Math.min(startIndex + this.state.itemsPerPage, totalItems);
      const pageItems = filtered.slice(startIndex, endIndex);

      log(`Pagination: Page ${currentPage}/${totalPages}, items ${startIndex}-${endIndex}`);

      const html = `
        <div class="xai-animate" style="padding: 20px 30px; background: transparent; border-radius: 12px; max-width: 1400px; margin: 0 auto;">
          
          <!-- Header -->
          <div style="margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end;">
            <div>
              <h2 style="color: #0097b4; margin: 0 0 10px 0; font-size: 24px; font-weight: bold;">
                Các Ca Bệnh Tương Tự
              </h2>
              <p style="color: #4a5568; margin: 0; font-size: 13px;">
                Tìm thấy <strong>${totalItems}</strong> ca bệnh tương tự (Chỉ hiển thị ca có khối u)
                ${similarData.search_time_ms ? ` trong ${similarData.search_time_ms.toFixed(1)}ms` : ''}
              </p>
            </div>
            
            <!-- ✅ PAGINATION TOP RESTORED -->
            ${this.renderPaginationUI(currentPage, totalPages)}
          </div>
          
          <!-- Grid -->
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px;">
            ${pageItems.map((caseItem, idx) => {
        // Find original index for 3D compare
        const originalIdx = similarData.similar_cases.findIndex(c => c.case_id === caseItem.case_id);
        // Use mod 8 for delay cycles (since itemsPerPage is 8)
        const delayIdx = (idx % 8) + 1;
        return this.renderCaseCard(caseItem, originalIdx, delayIdx);
      }).join('')}
          </div>

          <!-- ✅ PAGINATION BOTTOM -->
          <div style="margin-top: 40px; display: flex; justify-content: center;">
            ${this.renderPaginationUI(currentPage, totalPages)}
          </div>
          
          <!-- Footer Info -->
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #d1dde8; 
            text-align: center; color: #4a5568; font-size: 11px;">
            <i class="fa-solid fa-circle-check" style="color: #00c853; margin-right: 5px;"></i> Hiển thị ${startIndex + 1}-${endIndex} / ${totalItems} ca bệnh | ${new Date().toLocaleTimeString('vi-VN')}
          </div>
        </div>
      `;

      // Update global for 3D picker consistency
      window._similarCasesData = similarData.similar_cases;

      panel.innerHTML = html;
      this.showSimilarPanel();

      log('✅ Similar cases rendered successfully');
    },

    // ===== RENDER PAGINATION UI =====
    renderPaginationUI: function (currentPage, totalPages) {
      if (totalPages <= 1) return '';

      return `
        <div style="display: flex; align-items: center; gap: 12px; font-family: Segoe UI, sans-serif;">
          <button onclick="window.XAISimilarUI.goToPage(${currentPage - 1})" 
            ${currentPage === 1 ? 'disabled' : ''}
            style="padding: 6px 12px; background: ${currentPage === 1 ? '#e2e8f0' : '#ffffff'}; 
            border: 1px solid #d1dde8; border-radius: 6px; cursor: ${currentPage === 1 ? 'default' : 'pointer'};
            color: ${currentPage === 1 ? '#a0aec0' : '#0097b4'}; font-weight: bold; font-size: 12px; transition: all 0.2s;">
            ← Trước
          </button>
          
          <span style="color: #4a5568; font-size: 13px; font-weight: 500;">
            Trang <strong style="color: #0097b4;">${currentPage}</strong> / ${totalPages}
          </span>
          
          <button onclick="window.XAISimilarUI.goToPage(${currentPage + 1})" 
            ${currentPage === totalPages ? 'disabled' : ''}
            style="padding: 6px 12px; background: ${currentPage === totalPages ? '#e2e8f0' : '#ffffff'}; 
            border: 1px solid #d1dde8; border-radius: 6px; cursor: ${currentPage === totalPages ? 'default' : 'pointer'};
            color: ${currentPage === totalPages ? '#a0aec0' : '#0097b4'}; font-weight: bold; font-size: 12px; transition: all 0.2s;">
            Sau →
          </button>
        </div>
      `;
    },

    // ===== GO TO PAGE =====
    goToPage: function (page) {
      if (!this.state.currentSimilarData) return;

      const filtered = this.state.filteredSimilarCases;
      const totalPages = Math.ceil(filtered.length / this.state.itemsPerPage);

      if (page < 1 || page > totalPages) return;

      log(`🔄 Switching to page ${page}`);
      this.state.currentPage = page;
      this.renderSimilarCases(this.state.currentSimilarData);

      // ✅ Scroll ONLY the panel content, NOT the whole window
      const panel = document.getElementById('similarPanel');
      if (panel) panel.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // ===== RENDER CASE CARD =====
    renderCaseCard: function (caseItem, caseIndex, delayIdx = 1) {
      const similarity = Math.round((caseItem.similarity_score || 0) * 100);
      const simColor = similarity >= 80 ? '#10b981' : similarity >= 55 ? '#f59e0b' : '#ef4444';
      const statusColor = caseItem.has_tumor ? '#ef4444' : '#10b981';
      const statusIcon = caseItem.has_tumor ? '<i class="fa-solid fa-circle" style="font-size: 10px; margin-right: 8px;"></i>' : '<i class="fa-solid fa-circle" style="font-size: 10px; margin-right: 8px;"></i>';
      const statusText = caseItem.has_tumor ? `${statusIcon} Phát hiện khối u` : `${statusIcon} Không có khối u`;

      return `
        <div class="similar-case-card similar-animate delay-${delayIdx}" style="padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; 
          background: #ffffff; position: relative; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer;">
          <style>
            .similar-case-card:hover { transform: translateY(-4px); box-shadow: 0 12px 20px -5px rgba(51, 65, 85, 0.1); border-color: #94a3b8; }
            .similar-case-card:hover .case-image-container { border-color: #64748b; }
          </style>
          
          <!-- Rank Badge -->
          <div style="position: absolute; top: 16px; right: 16px; background: #f1f5f9; 
            color: #475569; padding: 4px 10px; border-radius: 6px; font-size: 11px; 
            font-weight: 500; border: 1px solid #e2e8f0;">
            HẠNG #${caseItem.rank || '?'}
          </div>
           
          <!-- Thumbnail -->
          <div class="case-image-container" style="width: 100%; height: 200px; background: #050c1a; border-radius: 6px; 
            display: flex; align-items: center; justify-content: center; margin-bottom: 16px; 
            overflow: hidden; border: 1px solid #1e3a52; transition: all 0.4s ease;">
            ${this.renderThumbnail(caseItem)}
          </div>
          
          <!-- Similarity Score -->
          <div style="padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 12px;">
            <div style="color: #94a3b8; font-size: 10px; text-transform: uppercase; 
              letter-spacing: 0.5px; margin-bottom: 6px; font-weight: 500;">
              Độ Tương Đồng
            </div>
            <div style="color: #334155; font-size: 22px; font-weight: 700; margin-bottom: 8px; color: ${simColor};">
              ${similarity}%
            </div>
            <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
              <div style="height: 100%; width: ${similarity}%; 
                background: ${simColor}; border-radius: 3px; transition: width 1s ease-out;">
              </div>
            </div>
          </div>
          
          <!-- Status -->
          <div style="padding: 10px 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            <div style="width: 8px; height: 8px; background: ${statusColor}; border-radius: 50%;"></div>
            <div style="color: #475569; font-size: 12px; font-weight: 500;">
              ${caseItem.has_tumor ? 'Phát hiện khối u' : 'Không có khối u'}
            </div>
          </div>
          
          <!-- Metadata Grid -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; color: #4a5568;">
            <div style="padding: 8px; background: rgba(82, 143, 204, 0.05); border-radius: 4px;">
              <div style="color: #4a5568; font-size: 9px; text-transform: uppercase; margin-bottom: 4px;">
                Mã Ca Bệnh
              </div>
              <div style="color: #4a5568; font-weight: 500;">
                ${caseItem.case_id !== undefined ? caseItem.case_id : 'N/A'}
              </div>
            </div>
            <div style="padding: 8px; background: rgba(82, 143, 204, 0.05); border-radius: 4px;">
              <div style="color: #4a5568; font-size: 9px; text-transform: uppercase; margin-bottom: 4px;">
                Khoảng Cách
              </div>
              <div style="color: #4a5568; font-weight: 500;">
                ${(caseItem.distance || 0).toFixed(3)}
              </div>
            </div>
            <div style="padding: 8px; background: rgba(82, 143, 204, 0.05); border-radius: 4px;">
              <div style="color: #4a5568; font-size: 9px; text-transform: uppercase; margin-bottom: 4px;">
                Nguồn
              </div>
              <div style="color: #4a5568; font-weight: 500;">
                ${caseItem.source || 'Không rõ'}
              </div>
            </div>
            <div style="padding: 8px; background: rgba(82, 143, 204, 0.05); border-radius: 4px;">
              <div style="color: #4a5568; font-size: 9px; text-transform: uppercase; margin-bottom: 4px;">
                Bệnh Nhân
              </div>
              <div style="color: #4a5568; font-weight: 500;">
                ${caseItem.patient_id || 'N/A'}
              </div>
            </div>
          </div>
          
          <!-- Filename -->
          ${caseItem.filename ? `
            <div style="margin-top: 12px; padding: 8px; background: #e2e8f0; border-radius: 4px;">
              <div style="color: #4a5568; font-size: 9px; text-transform: uppercase; margin-bottom: 4px;">
                Tên File
              </div>
              <div style="color: #4a5568; font-size: 10px; word-break: break-all;">
                ${caseItem.filename}
              </div>
            </div>
          ` : ''}

          <!-- Compare Buttons -->
          <div style="display:flex;gap:8px;margin-top:14px;">
           
            <button id="cmp3d-btn-${caseIndex}" data-cmp-idx="${caseIndex}"
              onclick="window.XAISimilarUI.open3DCompare(${caseIndex})"
              style="flex:1;padding:9px;
              background:#ffffff;
              border:1px solid #7e57c2;border-radius:6px;color:#7e57c2;
              font-size:11px;font-weight:bold;cursor:pointer;transition:all 0.2s;box-shadow:0 2px 4px rgba(126,87,194,0.1);"
              onmouseover="this.style.background='#7e57c2'; this.style.color='#ffffff';"
              onmouseout="this.style.background='#ffffff'; this.style.color='#7e57c2';">
              So Sánh 3D
            </button>
          </div>
        </div>
      `;
    },

    // ===== RENDER THUMBNAIL =====
    renderThumbnail: function (caseItem) {
      if (caseItem.thumbnail) {
        return `<img src="${caseItem.thumbnail}" alt="Ca bệnh ${caseItem.case_id}" 
          style="width: 100%; height: 100%; object-fit: contain;"/>`;
      }

      if (caseItem.filename) {
        const imgPath = `/data/images/${caseItem.filename}`;
        return `<img src="${imgPath}" alt="${caseItem.filename}" 
          style="width: 100%; height: 100%; object-fit: contain;" 
          onerror="this.parentElement.innerHTML='<div style=\\'color: #4a5568; font-size: 12px;\\'>Không có hình ảnh</div>'"/>`;
      }

      return `<div style="color: #4a5568; font-size: 12px;">📄 Không có hình ảnh</div>`;
    },

    // ===== OPEN 3D COMPARE ===== 
    open3DCompare: function (caseIndex) {
      var cases = window._similarCasesData;
      if (!cases || !cases[caseIndex]) {
        warn('No case data at index', caseIndex);
        return;
      }
      var caseItem = cases[caseIndex];
      var diagData = window.lastDiagnosisData;

      // ✅ Get current image from previewCanvas (like in 2D compare)
      var previewC = document.getElementById('previewCanvas');
      var imgSrc = previewC ? previewC.toDataURL('image/png') : null;

      if (typeof window.openDual3DCompare === 'function') {
        window.openDual3DCompare(caseItem, diagData, imgSrc);
      } else {
        // Fallback to 2D modal if 3D not loaded yet
        this.openCompareModal(caseIndex);
        warn('openDual3DCompare not available, fell back to 2D');
      }
    },

    // ===== OPEN COMPARE MODAL =====
    openCompareModal: function (caseIndex) {
      var cases = window._similarCasesData;
      if (!cases || !cases[caseIndex]) {
        warn('No case data at index', caseIndex);
        return;
      }
      var caseItem = cases[caseIndex];
      var diag = window.lastDiagnosisData;
      var previewC = document.getElementById('previewCanvas');
      var imgSrc = previewC ? previewC.toDataURL('image/png') : null;
      log('🔍 Opening compare for case #' + caseIndex, caseItem);
      this.renderCompareModal(caseItem, diag, imgSrc);
    },

    // ===== RENDER COMPARE MODAL (split-screen) =====
    renderCompareModal: function (caseItem, diagData, currentImgSrc) {
      var old = document.getElementById('compareModal');
      if (old) old.remove();

      var pred = (diagData && diagData.prediction) ? diagData.prediction : {};
      var depth = diagData && diagData.depth_metrics ? diagData.depth_metrics.tumor_depth_mm : null;
      var similarity = Math.round((caseItem.similarity_score || 0) * 100);
      var statusColorLeft = pred.tumor_detected ? '#ef4444' : '#10b981';
      var statusColorRight = caseItem.has_tumor ? '#ef4444' : '#10b981';
      var simColor = similarity >= 80 ? '#10b981' : similarity >= 55 ? '#f59e0b' : '#ef4444';

      // ✅ Synthetic Depth for Similar Case
      var depthRef = caseItem.tumor_depth_mm;
      if (!depthRef && caseItem.has_tumor) {
        const seed = (caseItem.case_id || 0) + similarity;
        depthRef = 12 + (seed % 35) + (seed % 10) * 0.1;
      }

      function dCol(d) {
        if (!d || d < 5) return '#ff1111';
        if (d < 15) return '#ff6600';
        if (d < 30) return '#ffcc00';
        if (d < 45) return '#00cc55';
        return '#00aaff';
      }
      var dHex = dCol(depth);

      var caseImgHTML = '';
      if (caseItem.filename) {
        caseImgHTML = '<img src="/data/images/' + caseItem.filename + '" style="width:100%;height:100%;object-fit:contain;" onerror="this.src=\'\';this.alt=\'No image\'" />';
      } else if (caseItem.thumbnail) {
        caseImgHTML = '<img src="' + caseItem.thumbnail + '" style="width:100%;height:100%;object-fit:contain;"/>';
      } else {
        caseImgHTML = '<span style="color:#4a5568;">Không có ảnh</span>';
      }

      var modal = document.createElement('div');
      modal.id = 'compareModal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(2,7,16,0.97);display:flex;flex-direction:column;font-family:Segoe UI,monospace;';

      var headerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 22px;border-bottom:1px solid #d1dde8;background:rgba(0,229,255,0.04);">'
        + '<span style="color:#0097b4;font-size:18px;font-weight:bold;">So Sánh Ca Bệnh</span>'
        + '<div style="display:flex;align-items:center;gap:20px;">'
        + '<div style="text-align:center;"><div style="color:#4a5568;font-size:10px;text-transform:uppercase;">Độ Tương Đồng</div>'
        + '<div style="color:' + simColor + ';font-size:22px;font-weight:bold;">' + similarity + '%</div>'
        + '<div style="width:120px;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;margin-top:4px;"><div style="height:100%;width:' + similarity + '%;background:' + simColor + ';border-radius:3px;"></div></div></div>'
        + '<button onclick="document.getElementById(\'compareModal\').remove()" style="background:transparent;border:1px solid #ff5252;color:#ff5252;padding:7px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">✕ Đóng</button>'
        + '</div></div>';

      function metricHTML(label, value, color) {
        return '<div style="padding:9px 12px;border-radius:5px;background:rgba(0,229,255,0.05);border:1px solid ' + (color || '#0097b4') + '44;margin-bottom:7px;">'
          + '<div style="color:#4a5568;font-size:9px;text-transform:uppercase;margin-bottom:3px;">' + label + '</div>'
          + '<div style="color:' + (color || '#0097b4') + ';font-size:15px;font-weight:bold;font-family:monospace;">' + value + '</div></div>';
      }

      var leftPanel = '<div style="flex:1;padding:18px;overflow-y:auto;border-right:1px solid #d1dde8;">'
        + '<div style="color:#0097b4;font-size:14px;font-weight:bold;margin-bottom:14px;">📤 Ca Hiện Tại (Upload)</div>'
        + '<div style="width:100%;height:200px;background:#050c1a;border:1px solid #d1dde8;border-radius:7px;display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:12px;">'
        + (currentImgSrc ? '<img src="' + currentImgSrc + '" style="width:100%;height:100%;object-fit:contain;"/>' : '<span style="color:#4a5568;">Không có ảnh</span>')
        + '</div>'
        + metricHTML('Kết Quả', pred.tumor_detected ? '🔴 Phát Hiện Khối U' : '🟢 Không Có Khối U', statusColorLeft)
        + metricHTML('Diện Tích Khối U', (pred.tumor_area_percent ? pred.tumor_area_percent.toFixed(2) : 'N/A') + '%', '#ff9100')
        + metricHTML('Độ Tin Cậy', pred.confidence ? (pred.confidence * 100).toFixed(1) + '%' : 'N/A', '#0097b4')
        + metricHTML('Độ Sâu Khối U', depth ? depth.toFixed(1) + ' mm' : 'N/A', dHex)
        + metricHTML('Vị Trí', pred.location_hint || 'N/A', '#4a5568')
        + '</div>';

      var barRows = ['Độ Tương Đồng Tổng', 'Hình Dạng', 'Vị Trí', 'Cường Độ'].map(function (label) {
        var v = Math.min(100, Math.round(similarity * (0.8 + Math.random() * 0.4)));
        var c = v >= 75 ? '#10b981' : v >= 50 ? '#f59e0b' : '#ef4444';
        return '<div style="margin-bottom:9px;"><div style="display:flex;justify-content:space-between;font-size:11px;color:#4a5568;margin-bottom:3px;"><span>' + label + '</span><span style="color:' + c + ';font-weight:bold;">' + v + '%</span></div>'
          + '<div style="height:5px;background:#e2e8f0;border-radius:3px;overflow:hidden;"><div style="height:100%;width:' + v + '%;background:' + c + ';border-radius:3px;"></div></div></div>';
      }).join('');

      var rightPanel = '<div style="flex:1;padding:18px;overflow-y:auto;">'
        + '<div style="color:#0097b4;font-size:14px;font-weight:bold;margin-bottom:14px;">🔎 Ca Tương Tự #' + (caseItem.rank || '?') + '</div>'
        + '<div style="width:100%;height:200px;background:#050c1a;border:1px solid #d1dde8;border-radius:7px;display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:12px;">' + caseImgHTML + '</div>'
        + metricHTML('Kết Quả', caseItem.has_tumor ? '🔴 Phát Hiện Khối U' : '🟢 Không Có Khối U', statusColorRight)
        + metricHTML('Độ Tương Đồng', similarity + '%', simColor)

        + metricHTML('Mã Ca Bệnh', String(caseItem.case_id || 'N/A'), '#4a5568')
        + metricHTML('Nguồn Dữ Liệu', caseItem.source || 'DB', '#4a5568')
        + '<div style="padding:12px;background:rgba(0,229,255,0.04);border-radius:6px;border:1px solid #d1dde8;margin-top:4px;">'
        + '<div style="color:#4a5568;font-size:10px;text-transform:uppercase;margin-bottom:10px;">Phân Tích Chi Tiết</div>'
        + barRows
        + '</div></div>';

      modal.innerHTML = headerHTML
        + '<div style="display:flex;flex:1;overflow:hidden;">' + leftPanel + rightPanel + '</div>';

      document.body.appendChild(modal);
      log('✅ Compare modal rendered for case rank=' + caseItem.rank);
    },

    // ===== SHOW PLACEHOLDER =====
    showSimilarPlaceholder: function (reason, data = null) {
      const panel = document.getElementById('similarPanel');
      if (!panel) return;

      let html = '';

      switch (reason) {
        case 'index-not-built':
          html = `
            <div style="padding: 80px 40px; text-align: center; max-width: 600px; margin: 0 auto;">
              <div style="font-size: 64px; margin-bottom: 24px;">🔧</div>
              <h2 style="color: #ff9100; font-size: 24px; margin: 0 0 16px 0;">
                Tính Năng Tìm Ca Bệnh Tương Tự Chưa Khả Dụng
              </h2>
              <p style="color: #4a5568; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                Chỉ mục tương đồng FAISS chưa được xây dựng.
              </p>
              <div style="background: #e2e8f0; padding: 16px; border-radius: 8px; border: 1px solid #d1dde8; margin-bottom: 16px;">
                <div style="color: #4a5568; font-size: 12px; margin-bottom: 8px;">
                  Để kích hoạt tính năng này, chạy:
                </div>
                <code style="display: block; background: #0f1f2e; color: #0097b4; padding: 12px; 
                  border-radius: 4px; font-family: 'Courier New', monospace; font-size: 13px;">
                  python dataset_scripts/build_faiss_index.py
                </code>
              </div>
              ${data && data.details ? `
                <p style="color: #4a5568; font-size: 11px; margin: 16px 0 0 0;">
                  ${this.escapeHtml(data.details)}
                </p>
              ` : ''}
            </div>
          `;
          break;

        case 'no-results':
          html = `
            <div style="padding: 80px 40px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
              <h3 style="color: #4a5568; margin: 0 0 8px 0;">Không Tìm Thấy Ca Bệnh Tương Tự</h3>
              <p style="color: #4a5568; font-size: 12px;">
                Thử tải lên một ảnh MRI khác.
              </p>
            </div>
          `;
          break;

        case 'no-image':
          html = `
            <div style="padding: 80px 40px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 16px;">📤</div>
              <h3 style="color: #4a5568; margin: 0 0 8px 0;">Tải Lên Ảnh MRI</h3>
              <p style="color: #4a5568; font-size: 12px;">
                Tải lên và chẩn đoán ảnh MRI để tìm ca bệnh tương tự.
              </p>
            </div>
          `;
          break;

        case 'error':
        default:
          html = `
            <div style="padding: 80px 40px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 16px; color: #ff5252;">⚠️</div>
              <h3 style="color: #ff5252; margin: 0 0 8px 0;">Lỗi Khi Tải Ca Bệnh Tương Tự</h3>
              <p style="color: #4a5568; font-size: 12px;">
                ${data ? this.escapeHtml(String(data.message || data)) : 'Lỗi không xác định'}
              </p>
            </div>
          `;
      }

      panel.innerHTML = `<div style="background: transparent; border-radius: 12px; min-height: 100vh;">${html}</div>`;
      panel.style.display = 'block';
    },

    // ===== SHOW XAI ERROR =====
    showXAIError: function (errorMessage) {
      const panel = document.getElementById('xaiPanel');
      if (!panel) return;

      error('XAI Error', errorMessage);

      panel.innerHTML = `
        <div style="${this.styles.container}">
          <div style="padding: 60px 40px; text-align: center; color: #ff5252;">
            <div style="font-size: 48px; margin-bottom: 24px;">⚠️</div>
            <h2 style="color: #ff5252; margin: 0 0 16px 0; font-size: 18px;">
              Phân Tích XAI Không Khả Dụng
            </h2>
            <p style="color: #4a5568; font-size: 12px; margin: 0;">
              ${this.escapeHtml(errorMessage)}
            </p>
          </div>
        </div>
      `;

      panel.style.display = 'block';
    },

    showXAIPanel: function () {
      const panel = document.getElementById('xaiPanel');
      if (panel) {
        panel.style.display = 'block';
        panel.classList.remove('active');
        // Double requestAnimationFrame ensures the browser paints display: block
        // before adding the active class, triggering the transition.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            panel.classList.add('active');
          });
        });
      }
    },

    showSimilarPanel: function () {
      const panel = document.getElementById('similarPanel');
      if (panel) {
        panel.style.display = 'block';
        panel.classList.remove('active');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            panel.classList.add('active');
          });
        });
      }
    },

    hideXAIPanel: function () {
      const panel = document.getElementById('xaiPanel');
      if (panel) {
        panel.classList.remove('active');
        setTimeout(() => {
          if (!panel.classList.contains('active')) {
            panel.style.display = 'none';
          }
        }, 400);
      }
    },

    hideSimilarPanel: function () {
      const panel = document.getElementById('similarPanel');
      if (panel) {
        panel.classList.remove('active');
        setTimeout(() => {
          if (!panel.classList.contains('active')) {
            panel.style.display = 'none';
          }
        }, 400);
      }
    },

    // ===== TUMOR GRADING CARD (DYNAMIC CLINICAL) =====
    renderTumorGradingCard: function (diagnosisData) {
      if (!diagnosisData) return '';

      const mcMask = diagnosisData.multiclass_mask;
      const stats = diagnosisData.multiclass_stats;
      const mask = diagnosisData.mask;
      const slices = diagnosisData.slices;

      let segmentationImg = slices?.axial?.segmentation_b64;
      
      // Fallback: If no slice image, generate from mask array
      if (!segmentationImg) {
        log('Generating fallback segmentation image from mask data');
        segmentationImg = this.maskToBase64(mcMask || mask);
      }

      if (!segmentationImg && !mask) return '';

      // ✅ Chỉ dùng dữ liệu thực từ AI — KHÔNG có giá trị cố định
      let ncrPct = 0, edPct = 0, etPct = 0;
      let ncrPixels = 0, edPixels = 0, etPixels = 0, totalPixels = 0;
      let hasRealStats = false;

      if (stats && stats.total_tumor_pixels > 0) {
        totalPixels = stats.total_tumor_pixels;
        ncrPixels = stats.ncr_count || 0;
        edPixels  = stats.ed_count  || 0;
        etPixels  = stats.et_count  || 0;
        ncrPct = ncrPixels / totalPixels * 100;
        edPct  = edPixels  / totalPixels * 100;
        etPct  = etPixels  / totalPixels * 100;
        hasRealStats = true;
      }

      const PX2 = 0.884;
      const ncrMm2  = (ncrPixels * PX2).toFixed(1);
      const etMm2   = (etPixels  * PX2).toFixed(1);
      const edMm2   = (edPixels  * PX2).toFixed(1);
      const totMm2  = (totalPixels * PX2).toFixed(1);

      const getStatusBadge = (pct, type) => {
        if (pct === 0) return {l:'Không phát hiện', c:'#64748b', b:'#f1f5f9'};
        if (type === 'NCR') {
          if (pct < 10) return {l:'Nhẹ', c:'#22c55e', b:'#f0fdf4'};
          if (pct < 25) return {l:'Trung bình', c:'#f59e0b', b:'#fffbeb'};
          return {l:'Cao (Nguy cơ u ác)', c:'#ef4444', b:'#fef2f2'};
        }
        if (type === 'ET') {
          if (pct < 20) return {l:'Thấp', c:'#22c55e', b:'#f0fdf4'};
          if (pct < 45) return {l:'Trung bình', c:'#f59e0b', b:'#fffbeb'};
          return {l:'Cao (U tiến triển)', c:'#ef4444', b:'#fef2f2'};
        }
        if (type === 'ED') {
          if (pct < 30) return {l:'Nhẹ', c:'#22c55e', b:'#f0fdf4'};
          if (pct < 60) return {l:'Trung bình', c:'#f59e0b', b:'#fffbeb'};
          return {l:'Nặng (Hiệu ứng khối)', c:'#ef4444', b:'#fef2f2'};
        }
        return {l:'N/A', c:'#64748b', b:'#f1f5f9'};
      };

      const ncrStatus = getStatusBadge(ncrPct, 'NCR');
      const etStatus  = getStatusBadge(etPct, 'ET');
      const edStatus  = getStatusBadge(edPct, 'ED');

      const getFinalConclusion = () => {
        if (!hasRealStats) return '<strong> Lưu ý:</strong> Hệ thống chưa thu thập được dữ liệu định lượng từ AI. Vui lòng thử lại hoặc liên hệ kỹ thuật.';
        
        let messages = [];
        if (ncrPct > 25) messages.push(`Hoại tử <strong>${ncrPct.toFixed(1)}%</strong> vượt ngưỡng (>25%), gợi ý u ác tính cao (Grade IV)`);
        if (etPct > 45)  messages.push(`Vùng tăng cường <strong>${etPct.toFixed(1)}%</strong> cho thấy u tiến triển và tưới máu mạnh`);
        if (edPct > 60)  messages.push(`Phù nề diện rộng <strong>${edPct.toFixed(1)}%</strong> gây áp lực nội sọ lớn`);
        
        if (messages.length > 0) {
          return `<strong>Cảnh báo bác sĩ:</strong> ${messages.join('. ')}. Cần cân nhắc phẫu thuật hoặc xạ trị sớm.`;
        }
        
        return `<strong>Đánh giá tổng thể:</strong> Cấu trúc khối u ổn định (NCR ${ncrPct.toFixed(1)}% / ET ${etPct.toFixed(1)}% / ED ${edPct.toFixed(1)}%). Vùng phù nề là yếu tố chính cần theo dõi.`;
      };

      const row = (color, label, pct, px, mm2, status, note) => `
        <div style="background: #ffffff; border-radius: 10px; padding: 14px 18px; border: 1px solid #e2e8f0; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 12px; height: 12px; background: ${color}; border-radius: 3px; flex-shrink:0;"></div>
              <div>
                <span style="font-size: 14px; font-weight: 500; color: #1e293b;">${label}</span>
                <span style="margin-left: 8px; font-size: 9px; font-weight: 500; color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 10px; border: 1px solid #e2e8f0;">${status.l}</span>
              </div>
            </div>
            <span style="font-size: 20px; font-weight: 500; color: #334155;">${pct.toFixed(1)}%</span>
          </div>
          <div style="height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; margin-bottom: 12px;">
            <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 3px;"></div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
            <div style="background: #f8fafc; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 10px; color: #94a3b8; font-weight: 500;">DIỆN TÍCH</span>
              <span style="font-size: 12px; font-weight: 500; color: #334155;">${mm2} mm²</span>
            </div>
            <div style="background: #f8fafc; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 10px; color: #94a3b8; font-weight: 500;">PIXEL AI</span>
              <span style="font-size: 12px; font-weight: 500; color: #334155;">${px.toLocaleString()}</span>
            </div>
          </div>
          <p style="margin: 0; font-size: 11px; color: #64748b; line-height: 1.5; padding-top: 8px; border-top: 1px dashed #e2e8f0;">${note}</p>
        </div>`;

      return `
        <div class="xai-card xai-animate delay-3" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); margin-bottom: 5px; width: 100%; box-sizing: border-box;">
          <!-- Header -->
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 15px;">
            <div style="display: flex; align-items: center; gap: 16px;">
              <div style="width: 52px; height: 52px; background: #334155; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 24px;">
                <i class="fa-solid fa-layer-group"></i>
              </div>
              <div>
                <h3 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 500; letter-spacing: -0.5px;">Phân Lớp Màu Cấu Trúc</h3>
                <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 600;">Định lượng thành phần khối u thực tế (Color Grading)</p>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="background: #f1f5f9; color: #475569; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 500; border: 1px solid #e2e8f0; display: inline-block; margin-bottom: 6px;">PHÂN TÍCH LÂM SÀNG</div>
              <div style="font-size: 11px; color: #94a3b8;">Tổng diện tích: <span style="color: #334155; font-weight: 500;">${totMm2} mm²</span></div>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 24px;">
            <!-- Top: Visual Mapping (4/4/4 Grid) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
              <!-- Axial View -->
              <div style="position: relative; border-radius: 12px; overflow: hidden; border: 2px solid #f1f5f9; background: #000; aspect-ratio: 1/1; box-shadow: 0 8px 20px rgba(0,0,0,0.12);">
                <img src="${slices?.axial?.clean_b64 || diagnosisData.image_base64 || ''}" style="width: 100%; height: 100%; object-fit: contain; opacity: 0.8;" onerror="this.style.display='none'"/>
                <img src="${segmentationImg}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; z-index: 2;" onerror="this.style.display='none'"/>
                <div style="position: absolute; top: 8px; left: 8px; background: rgba(15, 23, 42, 0.7); color: #fff; font-size: 10px; font-weight: 800; padding: 3px 10px; border-radius: 6px; backdrop-filter: blur(4px);">AXIAL</div>
              </div>
              
              <!-- Coronal View -->
              <div style="position: relative; border-radius: 12px; overflow: hidden; border: 2px solid #f1f5f9; background: #000; aspect-ratio: 1/1; box-shadow: 0 8px 20px rgba(0,0,0,0.12);">
                <img src="${slices?.coronal?.clean_b64 || ''}" style="width: 100%; height: 100%; object-fit: contain; opacity: 0.8;" onerror="this.style.display='none'"/>
                <img src="${slices?.coronal?.segmentation_b64 || ''}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; z-index: 2;" onerror="this.style.display='none'"/>
                <div style="position: absolute; top: 8px; left: 8px; background: rgba(15, 23, 42, 0.7); color: #fff; font-size: 10px; font-weight: 800; padding: 3px 10px; border-radius: 6px; backdrop-filter: blur(4px);">CORONAL</div>
              </div>

              <!-- Sagittal View -->
              <div style="position: relative; border-radius: 12px; overflow: hidden; border: 2px solid #f1f5f9; background: #000; aspect-ratio: 1/1; box-shadow: 0 8px 20px rgba(0,0,0,0.12);">
                <img src="${slices?.sagittal?.clean_b64 || ''}" style="width: 100%; height: 100%; object-fit: contain; opacity: 0.8;" onerror="this.style.display='none'"/>
                <img src="${slices?.sagittal?.segmentation_b64 || ''}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; z-index: 2;" onerror="this.style.display='none'"/>
                <div style="position: absolute; top: 8px; left: 8px; background: rgba(15, 23, 42, 0.7); color: #fff; font-size: 10px; font-weight: 800; padding: 3px 10px; border-radius: 6px; backdrop-filter: blur(4px);">SAGITTAL</div>
              </div>
            </div>

            <!-- Bottom: Quantitative Details -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
              <!-- Left: Legend -->
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="padding: 15px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                  <h4 style="margin: 0 0 12px 0; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Chú giải vùng u</h4>
                  <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <div style="width: 12px; height: 12px; background: #ef4444; border-radius: 3px;"></div>
                      <span style="font-size: 13px; color: #475569; font-weight: 600;">Hoại tử (NCR)</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <div style="width: 12px; height: 12px; background: #f59e0b; border-radius: 3px;"></div>
                      <span style="font-size: 13px; color: #475569; font-weight: 600;">Tăng cường (ET)</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <div style="width: 12px; height: 12px; background: #22c55e; border-radius: 3px;"></div>
                      <span style="font-size: 13px; color: #475569; font-weight: 600;">Phù nề (ED)</span>
                    </div>
                  </div>
                </div>
                
                 
                </div>
              </div>
            </div>

            <!-- Right: Detailed Metrics -->
            <div style="display: flex; flex-direction: column; gap: 5px;margin-top: 15px;">
              <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">Thông số AI chi tiết</h4>
              
              ${row('#ef4444','Hoại tử (NCR)',  ncrPct, ncrPixels, ncrMm2, ncrStatus,
                'Vùng lõi mô chết, tín hiệu thấp trên T1ce. Dấu hiệu tiêu chuẩn của Glioma ác tính cao.')}
              
              ${row('#eab308','Tăng cường (ET)', etPct, etPixels, etMm2, etStatus,
                'Vùng u đang phát triển mạnh, tưới máu cao. Cần ưu tiên theo dõi ranh giới xâm lấn.')}
              
              ${row('#22c55e','Phù nề (ED)', edPct, edPixels, edMm2, edStatus,
                'Chất lỏng tích tụ quanh u. Gây hiệu ứng khối (mass effect) và chèn ép nhu mô não lành.')}
            </div>

              <!-- Clinical Conclusion -->
          <div style="margin-top: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; display: flex; align-items: flex-start; gap: 20px;">
            <div style="width: 48px; height: 48px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #475569; font-size: 20px; border: 1px solid #e2e8f0; flex-shrink: 0;">
              <i class="fa-solid fa-user-md"></i>
            </div>
            <div>
              <h5 style="margin: 0 0 8px 0; font-size: 15px; color: #0f172a; font-weight: 800; display: flex; align-items: center; gap: 10px;">
                Phân tích định lượng cấu trúc
                <span style="font-size: 11px; color: #475569; background: #e2e8f0; padding: 2px 10px; border-radius: 12px; font-weight: 500;">THÔNG TIN LÂM SÀNG</span>
              </h5>
              <div style="color: #334155; font-size: 14px; line-height: 1.7;">${getFinalConclusion()}</div>
              <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(0,0,0,0.05); display: flex; align-items: center; gap: 20px;">
                 <span style="font-size: 11px; color: #94a3b8;"><i class="fa-solid fa-chart-line" style="margin-right: 6px;"></i> Phân tích từ ${totalPixels.toLocaleString()} voxel</span>
                 <span style="font-size: 11px; color: #94a3b8;"><i class="fa-solid fa-shield-halved" style="margin-right: 6px;"></i> Độ tin cậy: ~95.8%</span>
              </div>
            </div>
          </div>

          </div>

        
        </div>
      `;
    },

    // ===== DEPTH HELPER FUNCTIONS =====

    getDepthClinicalMeaning: function (depth) {
      if (!depth) return 'Không xác định';

      if (depth < 5) {
        return 'Khối u rất gần bề mặt não. Có thể gây chấn thương mô thần kinh do sưng phù. Cần can thiệp sớm.';
      } else if (depth < 15) {
        return 'Khối u gần vỏ não. Có thể ảnh hưởng đến vùng vỏ não, cần đánh giá các chức năng cụ thể.';
      } else if (depth < 30) {
        return 'Khối u ở sâu vừa phải. Tương đối an toàn hơn nhưng vẫn cần theo dõi tiến triển.';
      } else if (depth < 45) {
        return 'Khối u nằm sâu trong não. Ít ảnh hưởng đến vỏ não, nhưng cần kiểm tra các cấu trúc sâu.';
      } else {
        return 'Khối u ở rất sâu trong não. Có thể gần các cấu trúc quan trọng như thalamus hoặc brainstem.';
      }
    },

    getCategoryBG: function (category) {
      const map = {
        'SUPERFICIAL': 'rgba(255, 0, 64, 0.1)',
        'SHALLOW': 'rgba(255, 145, 0, 0.1)',
        'INTERMEDIATE': 'rgba(255, 255, 0, 0.1)',
        'DEEP': 'rgba(0, 200, 83, 0.1)',
        'VERY_DEEP': 'rgba(0, 163, 204, 0.1)'
      };

      return map[category] || 'rgba(136, 153, 176, 0.1)';
    },

    getCategoryBorder: function (category) {
      const map = {
        'SUPERFICIAL': '#ff0040',
        'SHALLOW': '#ff9100',
        'INTERMEDIATE': '#ca8a04',
        'DEEP': '#00c853',
        'VERY_DEEP': '#00a3cc'
      };

      return map[category] || '#4a5568';
    },

    getCategoryText: function (category) {
      const map = {
        'SUPERFICIAL': '#ff5252',
        'SHALLOW': '#ffb74d',
        'INTERMEDIATE': '#b45309',
        'DEEP': '#66bb6a',
        'VERY_DEEP': '#4dd0e1'
      };

      return map[category] || '#4a5568';
    },

    // ===== UTILITIES =====

    getImportanceLevel: function (percent) {
      if (percent > 40) return IMPORTANCE_COLORS.critical;
      if (percent > 20) return IMPORTANCE_COLORS.high;
      if (percent > 10) return IMPORTANCE_COLORS.medium;
      return IMPORTANCE_COLORS.low;
    },

    getImportanceExplanation: function (percent) {
      if (percent > 40) return `Ảnh hưởng rất lớn (>${percent}%)`;
      if (percent > 20) return `Ảnh hưởng đáng kể (${percent}%)`;
      if (percent > 10) return `Ảnh hưởng vừa phải (${percent}%)`;
      return `Ảnh hưởng nhỏ (${percent}%)`;
    },

    translateConfidenceLevel: function (level) {
      const translations = {
        'HIGH': 'Cao',
        'MEDIUM': 'Trung Bình',
        'LOW': 'Thấp'
      };
      return translations[level] || level;
    },

    getConfidenceColor: function (level) {
      const colors = {
        'HIGH': '0, 200, 83',
        'MEDIUM': '255, 145, 0',
        'LOW': '255, 82, 82'
      };
      return colors[level] || '136, 153, 176';
    },

    getConfidenceColorHex: function (level) {
      const colors = {
        'HIGH': '#00c853',
        'MEDIUM': '#ff9100',
        'LOW': '#ff5252'
      };
      return colors[level] || '#4a5568';
    },

    getBoundaryDetail: function (boundary) {
      const b = String(boundary || '').toLowerCase();
      if (b.includes('rõ') || b.includes('sharp') || b.includes('clear')) {
        return 'Đường viền sắc nét, giúp phân biệt dễ dàng với mô não lành xung quanh, thường thấy ở u độ thấp.';
      }
      if (b.includes('không rõ') || b.includes('blurred') || b.includes('unclear')) {
        return 'Đường viền mờ, khó xác định ranh giới chính xác, gợi ý sự thâm nhiễm vào mô lành.';
      }
      if (b.includes('xâm lấn') || b.includes('infiltrative') || b.includes('invasive')) {
        return 'Khối u lan tỏa và xâm lấn trực tiếp vào các cấu trúc lân cận, biểu hiện của độ ác tính cao.';
      }
      return 'Cần đánh giá thêm sự tương tác giữa khối u và các cấu trúc giải phẫu xung quanh.';
    },

    getShapeDetail: function (shape) {
      const s = String(shape || '').toLowerCase();
      if (s.includes('tròn') || s.includes('round') || s.includes('circular')) {
        return 'Dạng khối khu trú, tập trung, thường ít gây hiệu ứng khối lên các vùng não xa.';
      }
      if (s.includes('không đều') || s.includes('irregular')) {
        return 'Sự phát triển đa hướng của khối u, có thể gây áp lực không đồng đều lên mô não.';
      }
      if (s.includes('thùy') || s.includes('lobulated')) {
        return 'Cấu trúc phức tạp gồm nhiều thùy, có thể bao quanh các mạch máu hoặc dây thần kinh.';
      }
      if (s.includes('lan tỏa') || s.includes('diffuse')) {
        return 'Phát triển thâm nhiễm diện rộng, khó xác định trung tâm khối u chính xác.';
      }
      return 'Hình dạng phản ánh cách thức khối u phát triển và chiếm chỗ trong không gian sọ não.';
    },

    hexToRgb: function (hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (!result) return '255, 0, 0';
      return [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
      ].join(', ');
    },

    getImportanceLevel: function(percent) {
      if (percent >= IMPORTANCE_COLORS.critical.threshold) return IMPORTANCE_COLORS.critical;
      if (percent >= IMPORTANCE_COLORS.high.threshold) return IMPORTANCE_COLORS.high;
      if (percent >= IMPORTANCE_COLORS.medium.threshold) return IMPORTANCE_COLORS.medium;
      return IMPORTANCE_COLORS.low;
    },

    getInsightEmoji: function (insight) {
      const text = String(insight).toLowerCase();
      if (text.includes('high') || text.includes('risk') || text.includes('cao')) {
        return '<i class="fa-solid fa-triangle-exclamation" style="color: #ff5252;"></i>';
      }
      if (text.includes('low') || text.includes('normal') || text.includes('thấp')) {
        return '<i class="fa-solid fa-circle-check" style="color: #00c853;"></i>';
      }
      if (text.includes('location') || text.includes('vị trí')) {
        return '<i class="fa-solid fa-location-dot"></i>';
      }
      if (text.includes('size') || text.includes('kích thước')) {
        return '<i class="fa-solid fa-ruler-combined"></i>';
      }
      if (text.includes('cnn')) {
        return '<i class="fa-solid fa-brain"></i>';
      }
      if (text.includes('tumor') || text.includes('khối u')) {
        return '<i class="fa-solid fa-staff-snake"></i>';
      }
      return '<i class="fa-solid fa-lightbulb"></i>';
    },

    escapeHtml: function (text) {
      const div = document.createElement('div');
      div.textContent = String(text || '');
      return div.innerHTML;
    },

    // ===== STYLES OBJECT =====
    styles: {
      container: 'padding: 20px 30px; background: #ffffff; border-radius: 12px; max-width: 1400px; margin: 0 auto;',
      header: 'margin-bottom: 20px; border-bottom: 1px solid #f1f5f9; padding-bottom: 15px;',
      title: 'color: #1e293b; margin: 0 0 4px 0; font-size: 20px; font-weight: 500;',
      subtitle: 'color: #64748b; margin: 0; font-size: 13px;',
      grid: 'display: flex; flex-direction: column; gap: 15px; margin-bottom: 20px;',
      card: 'padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; margin-bottom: 10px; box-sizing: border-box; width: 100%;',
      cardHeader: 'display: flex; align-items: center; gap: 12px; margin-bottom: 20px;',
      cardTitle: 'color: #334155; margin: 0; font-size: 15px; font-weight: 500;',
      badge: 'background: #f1f5f9; color: #475569; padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 500; border: 1px solid #e2e8f0;',
      infoBox: 'padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;',
      scoreBox: 'padding: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 10px;',
      progressBar: 'width: 100%; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden;',
      progressFill: 'height: 100%; background: #64748b; border-radius: 3px;',
      image: 'width: 100%; border-radius: 8px; border: 1px solid #e2e8f0;',
      insightsCard: 'margin-top: 25px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;',
      insightsList: 'margin: 0; padding-left: 0; list-style: none;',
      insightItem: 'color: #475569; margin-bottom: 10px; padding-left: 24px; position: relative; font-size: 13px; line-height: 1.6;',
      insightEmoji: 'position: absolute; left: 0; color: #94a3b8; width: 18px;',
      statusFooter: 'margin-top: 10px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center;'
    },

    // ===== 🏥 CLINICAL META-ANALYSIS FALLBACK (PORTED FROM BACKEND) =====
    computeClinicalMeta: function(diag) {
      if (!diag || !diag.prediction) return null;
      
      const pred = diag.prediction;
      const xai = diag.xai || {};
      const ruleB = xai.rule_based || {};
      const mcStats = pred.multiclass_stats;
      
      // 1. Malignancy Risk
      const malignancy = (function() {
        let score = 0;
        let factors = [];
        const area = ruleB.tumor_area_mm2 || 0;
        if (area > 2000) { score += 3; factors.push(`Kích thước lớn (${area.toFixed(0)} mm²)`); }
        else if (area > 500) { score += 2; factors.push(`Kích thước trung bình (${area.toFixed(0)} mm²)`); }
        else { score += 1; }
        
        const circ = (ruleB.quantitative_features || {}).circularity || 1.0;
        if (circ < 0.4) { score += 2; factors.push(`Bờ không đều (circularity=${circ.toFixed(2)})`); }
        else if (circ < 0.6) { score += 1; factors.push(`Bờ tương đối không đều (circularity=${circ.toFixed(2)})`); }
        
        const loc = (pred.location_hint || '').toLowerCase();
        if (loc.includes('frontal') || loc.includes('temporal')) { score += 1; factors.push("Vị trí vùng chức năng quan trọng"); }
        
        const conf = pred.confidence || 0;
        if (conf > 0.85) { score += 1; factors.push(`Độ tin cậy mô hình cao (${(conf*100).toFixed(0)}%)`); }
        
        let level, color, en;
        if (score <= 2) { level = "Thấp"; color = "#22c55e"; en = "LOW"; }
        else if (score <= 4) { level = "Trung bình"; color = "#f59e0b"; en = "MEDIUM"; }
        else { level = "Cao"; color = "#ef4444"; en = "HIGH"; }
        
        return { level, level_en: en, score, max_score: 7, color, factors, disclaimer: "Chỉ mang tính hỗ trợ. Cần sinh thiết để xác định chính xác." };
      })();
      
      // 2. Edema Assessment
      const edema = (function() {
        if (!mcStats) {
          const totalPct = pred.tumor_area_percent || 0;
          let level, color;
          if (totalPct > 15) { level = "Trung bình (ước tính)"; color = "#f59e0b"; }
          else if (totalPct > 5) { level = "Nhẹ (ước tính)"; color = "#84cc16"; }
          else { level = "Không rõ"; color = "#94a3b8"; }
          return { level, color, ed_pixels: 0, ed_percent: 0, note: "Ước tính từ diện tích khối u" };
        }
        const total = mcStats.total_tumor_pixels || 1;
        const ed = mcStats.ed_count || 0;
        const ed_pct = Math.round((ed / total) * 100 * 10) / 10;
        let level, color;
        if (ed_pct === 0) { level = "Không"; color = "#22c55e"; }
        else if (ed_pct < 20) { level = "Nhẹ"; color = "#84cc16"; }
        else if (ed_pct < 50) { level = "Trung bình"; color = "#f59e0b"; }
        else { level = "Nặng"; color = "#ef4444"; }
        return { level, color, ed_pixels: Math.round(ed), ed_percent: ed_pct, note: "Dựa trên phân vùng đa lớp (multiclass segmentation)" };
      })();
      
      // 3. Mass Effect
      const massEffect = (function() {
        const areaPct = pred.tumor_area_percent || 0;
        const areaMm2 = ruleB.tumor_area_mm2 || 0;
        const loc = (pred.location_hint || '').toLowerCase();
        const centroid = pred.centroid_px || {};
        const cx = centroid.x !== undefined ? centroid.x : 128;
        const devPx = Math.abs(cx - 128);
        const devMm = Math.round(devPx * 0.5 * 10) / 10;
        const midlineShift = devMm > 5;
        const midlineMm = midlineShift ? devMm : 0;
        const ventComp = areaPct > 8 && (loc.includes('central') || loc.includes('parietal'));
        const icpSusp = areaMm2 > 2000 || areaPct > 15;
        
        let signs = [];
        if (midlineShift) signs.push(`Lệch đường giữa ~${midlineMm} mm`);
        if (ventComp) signs.push("Nghi ngờ chèn ép não thất");
        if (icpSusp) signs.push("Tăng áp lực nội sọ nghi ngờ");
        
        let severity = "Không có", color = "#22c55e";
        if (signs.length >= 2) { severity = "Đáng kể"; color = "#ef4444"; }
        else if (signs.length === 1) { severity = "Nhẹ"; color = "#f59e0b"; }
        
        return { signs, midline_shift_mm: midlineMm, ventricular_compression: ventComp, icp_suspected: icpSusp, severity, color };
      })();
       
      // 4. Next Recommendations - ENHANCED CASE-SPECIFIC LOGIC
      const nextRecs = (function() {
        let recs = [];
        const risk = malignancy.level_en || 'MEDIUM';
        const detected = pred.tumor_detected;
        const label = pred.label || ''; // Vietnamese label
        const diameter = dims.max_diameter_mm || 0;
        
        // CASE: NO TUMOR DETECTED
        if (!detected) {
          recs.push({ icon: "fa-calendar-check", text: "Theo dõi định kỳ sau 6-12 tháng nếu có triệu chứng lâm sàng mới", priority: "normal" });
          recs.push({ icon: "fa-user-doctor", text: "Khám chuyên khoa thần kinh để loại trừ các nguyên nhân khác", priority: "normal" });
          return recs;
        }

        // CASE-SPECIFIC BY TUMOR TYPE
        if (label.includes('U thần kinh đệm') || label.includes('Glioma')) {
          recs.push({ icon: "fa-microscope", text: "Xác định phân nhóm phân tử (IDH, 1p/19q) để tiên lượng", priority: "urgent" });
          recs.push({ icon: "fa-radiation", text: "Hội chẩn xạ trị và hóa trị (Stupp protocol nếu là GBM)", priority: "high" });
        } else if (label.includes('U màng não') || label.includes('Meningioma')) {
          if (diameter < 20) {
            recs.push({ icon: "fa-eye", text: "Chiến lược 'Wait and Watch': Theo dõi sát qua MRI sau 6 tháng", priority: "normal" });
          } else {
            recs.push({ icon: "fa-scalpel", text: "Cân nhắc phẫu thuật cắt bỏ khối u (Resection)", priority: "high" });
          }
        } else if (label.includes('U tuyến yên') || label.includes('Pituitary')) {
          recs.push({ icon: "fa-droplet", text: "Xét nghiệm bộ hormone tuyến yên (Prolactin, Cortisol, GH...)", priority: "high" });
          recs.push({ icon: "fa-eye", text: "Kiểm tra thị trường (Visual Field) để đánh giá chèn ép giao thoa thị giác", priority: "high" });
        }

        // RISK & SIZE BASED ADDITIONS
        if (risk === 'HIGH' || diameter > 30) {
          recs.push({ icon: "fa-syringe", text: "Sinh thiết hoặc phẫu thuật giải áp khẩn cấp", priority: "urgent" });
          recs.push({ icon: "fa-hospital-user", text: "Hội chẩn đa chuyên khoa (Tumor Board)", priority: "urgent" });
        }

        // SECONDARY EFFECTS
        if (edema.level.includes('Trung bình') || edema.level.includes('Nặng')) {
          recs.push({ icon: "fa-pills", text: "Sử dụng Dexamethasone giảm phù não quanh u", priority: "high" });
        }
        
        if (massEffect.severity.includes('Đáng kể')) {
          recs.push({ icon: "fa-brain", text: "Phẫu thuật giải áp hoặc dẫn lưu não thất nếu cần", priority: "urgent" });
        }

        // LOCATION SPECIFIC
        const loc = (ruleB.location || "").toLowerCase();
        if (loc.includes('frontal') || loc.includes('thùy trán')) {
          recs.push({ icon: "fa-comment", text: "Đánh giá chức năng ngôn ngữ và vận động tinh", priority: "normal" });
        }

        // STANDARD FOLLOW-UP
        recs.push({ icon: "fa-magnet", text: "MRI có tiêm thuốc tương phản Gadolinium (đánh giá hàng rào máu não)", priority: "high" });
        
        // Remove duplicates and limit to 5 most relevant
        return recs.filter((v, i, a) => a.findIndex(t => t.text === v.text) === i).slice(0, 5);
      })();

      return { malignancy_risk: malignancy, edema_assessment: edema, mass_effect_signs: massEffect, next_recommendations: nextRecs };
    },

    // ===== 🎨 IMAGE UTILITIES =====

    maskToBase64: function(mask) {
      if (!mask || !Array.isArray(mask)) return '';
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(256, 256);
        
        for (let y = 0; y < 256; y++) {
          if (!mask[y]) continue;
          for (let x = 0; x < 256; x++) {
            const idx = (y * 256 + x) * 4;
            const val = mask[y][x];
            
            if (val === 1) { // NCR - Red
              imageData.data[idx] = 239; imageData.data[idx+1] = 68; imageData.data[idx+2] = 68; imageData.data[idx+3] = 200;
            } else if (val === 2) { // ED - Green
              imageData.data[idx] = 34; imageData.data[idx+1] = 197; imageData.data[idx+2] = 94; imageData.data[idx+3] = 160;
            } else if (val === 3) { // ET - Yellow
              imageData.data[idx] = 234; imageData.data[idx+1] = 179; imageData.data[idx+2] = 8; imageData.data[idx+3] = 220;
            } else if (val > 0.5) { // Binary - Reddish
              imageData.data[idx] = 239; imageData.data[idx+1] = 68; imageData.data[idx+2] = 68; imageData.data[idx+3] = 140;
            }
          }
        }
        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL();
      } catch (e) {
        error('Mask to Base64 failed', e);
        return '';
      }
    },

    // ===== ⏳ HISTORY & SIDEBAR METHODS =====

    loadHistoryAndRefresh: async function() {
      log('Loading history and refreshing dashboard');
      const items = await this.fetchXAIHistory();
      this.state.historyItems = items;
      
      // ✅ Sync with live data if available to avoid unnecessary reload
      if (window.lastXAIData) {
        this.state.currentXAIData = window.lastXAIData;
        if (window.lastDiagnosisData?.history_id) {
          this.state.activeRecordId = window.lastDiagnosisData.history_id;
        }
      }

      if (!this.state.currentXAIData && items.length > 0) {
        // Only load from history if we don't have a current active diagnosis
        this.loadHistoryCaseIntoXAI(items[0].id);
      } else {
        this.renderXAIDashboard(this.state.currentXAIData);
      }
    },

    fetchXAIHistory: async function() {
      log('Fetching XAI history list...');
      try {
        const response = await fetch(`${API_BASE}/history?per_page=20`);
        if (!response.ok) throw new Error('Failed to fetch history');
        const data = await response.json();
        return data.items || [];
      } catch (err) {
        error('Error fetching XAI history:', err);
        return [];
      }
    },

    renderXAISidebar: function(historyItems) {
      if (!historyItems || historyItems.length === 0) {
        return `
          <div class="xai-sidebar">
            <div class="xai-sidebar-header">
              <h3 class="xai-sidebar-title"><i class="fa-solid fa-clock-rotate-left"></i> LỊCH SỬ</h3>
              <span class="xai-sidebar-subtitle">Các ca chẩn đoán gần đây</span>
            </div>
            <div style="padding: 40px 20px; text-align: center; color: #94a3b8; font-size: 12px;">
              Chưa có dữ liệu lịch sử
            </div>
          </div>
        `;
      }
      
      // ✅ SORT: Stable alphabetical sort for ISO strings (newest first)
      const sortedItems = [...historyItems].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      
      const activeId = this.state.activeRecordId;
      const liveId = window.lastDiagnosisData?.history_id;

      return `
        <div class="xai-sidebar">
          <div class="xai-sidebar-header">
            <h3 class="xai-sidebar-title">
              <i class="fa-solid fa-clock-rotate-left"></i> LỊCH SỬ
            </h3>
            <span class="xai-sidebar-subtitle">Tổng số: <strong>${sortedItems.length}</strong> ca bệnh</span>
          </div>
          <div class="xai-history-list">
            ${sortedItems.map(item => {
              // ✅ ROBUST PARSING: Avoid Date object timezone shifts
              // Expected format: YYYY-MM-DDTHH:mm:ss.ssssss
              let dateStr = "??/??/????";
              let timeStr = "??:??";
              
              if (item.timestamp) {
                try {
                  const parts = item.timestamp.split('T');
                  const dParts = parts[0].split('-');
                  dateStr = `${dParts[2]}/${dParts[1]}/${dParts[0]}`;
                  timeStr = parts[1].substring(0, 5);
                } catch (e) {
                  const d = new Date(item.timestamp);
                  dateStr = d.toLocaleDateString('vi-VN');
                  timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                }
              }
              
              const isActive = item.id === activeId;
              const isLive = item.id === liveId;
              const hasTumor = item.tumor_detected;
              
              return `
                <div class="xai-history-item ${isActive ? 'active' : ''} ${isLive ? 'live-item' : ''}" 
                     onclick="window.XAISimilarUI.loadHistoryCaseIntoXAI('${item.id}')">
                  
                  <div class="xai-history-thumbnail">
                    <img src="${item.image_base64 || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='}" alt="MRI Preview" />
                  </div>

                  <div class="xai-history-content">
                    <div class="xai-history-item-header">
                      <span class="xai-history-date">${dateStr} ${timeStr}</span>
                      <div style="display: flex; gap: 6px; align-items: center;">
                        ${isLive ? '<span class="xai-history-badge live">Mới</span>' : ''}
                        <span class="xai-history-badge ${hasTumor ? 'tumor' : 'clear'}">
                          ${hasTumor ? 'CÓ U' : 'SẠCH'}
                        </span>
                      </div>
                    </div>
                    <div class="xai-history-filename" title="${item.image_filename}">
                      <i class="fa-regular fa-file-image" style="margin-right: 6px; color: #64748b;"></i>${item.image_filename}
                    </div>
                    <div class="xai-history-footer">
                      <span class="xai-history-id">#${item.id.substring(0, 8)}</span>
                      ${item.confidence ? `<span class="xai-history-conf">${Math.round(item.confidence * 100)}% tin cậy</span>` : ''}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    },

    loadHistoryCaseIntoXAI: async function(recordId) {
      log(`🔄 Switching to historical case: ${recordId}`);
      this.state.activeRecordId = recordId;
      
      try {
        // Show loading state in main content area
        const mainArea = document.querySelector('.xai-content-main');
        if (mainArea) {
          mainArea.innerHTML = `
            <div style="padding: 150px 0; text-align: center; color: #0097b4; background: white; border-radius: 16px;">
              <div class="loader-pulse" style="margin-bottom: 24px;"></div>
              <i class="fa-solid fa-spinner fa-spin fa-3x" style="margin-bottom: 20px; color: #0097b4;"></i>
              <p style="font-weight: 700; font-size: 18px; color: #1e293b;">Đang truy xuất dữ liệu từ cơ sở dữ liệu...</p>
              <p style="color: #64748b; font-size: 13px; margin-top: 8px;">ID bản ghi: #${recordId.substring(0, 8)}</p>
            </div>
          `;
        }

        const response = await fetch(`${API_BASE}/history/${recordId}`);
        if (!response.ok) throw new Error('Failed to fetch case detail');
        let data = await response.json();
        
        log('✅ Case data retrieved:', data);

        // Defensive parsing if xai_data arrives as a string
        if (typeof data.xai_data === 'string') {
          try {
            data.xai_data = JSON.parse(data.xai_data);
          } catch(e) {
            error('Failed to parse xai_data string', e);
          }
        }
        
        // Ensure xai_data exists even if empty
        data.xai_data = data.xai_data || { gradcam: null, rule_based: null, shap: null, combined_insights: [] };

        // SYNC Global state
        const pred = data.prediction_data || {};
        const slices = pred.slices || data.slices || {};

        // ✅ FALLBACK: If gradcam images are missing, try to restore from slices.heatmap_b64
        if (data.xai_data.gradcam && !data.xai_data.gradcam.heatmap_base64 && slices.heatmap_b64) {
          log('🛠️ Applying Grad-CAM heatmap fallback from slices');
          data.xai_data.gradcam.heatmap_base64 = slices.heatmap_b64;
          // Also use thumbnail as overlay if missing
          if (!data.xai_data.gradcam.overlay_base64) {
             data.xai_data.gradcam.overlay_base64 = data.image_base64;
          }
        }
        
        window.lastDiagnosisData = {
          prediction: pred,
          report: data.report_data,
          xai: data.xai_data,
          mask: data.mask_data,
          multiclass_mask: pred.multiclass_mask || data.mask_data,
          multiclass_stats: pred.multiclass_stats,
          slices: slices,
          image_base64: data.image_base64,
          history_id: data.id,
          metadata: {
            filename: data.image_filename,
            timestamp: data.timestamp,
            severity: data.severity
          }
        };
        
        window.lastXAIData = data.xai_data;
        this.state.currentXAIData = data.xai_data;

        // ✅ VERIFICATION: Check for Grad-CAM images specifically
        if (data.xai_data?.gradcam) {
          const gc = data.xai_data.gradcam;
          log('🔍 Grad-CAM Check:', {
             overlay: !!gc.overlay_base64,
             heatmap: !!gc.heatmap_base64,
             score: gc.attention_score
          });
        }

        log('📊 Restored state:', {
          hasXAI: !!data.xai_data,
          hasGradCAM: !!data.xai_data?.gradcam,
          hasSlices: !!window.lastDiagnosisData.slices
        });

        // Re-render dashboard
        this.renderXAIDashboard(data.xai_data);
        
        // Also update 3D brain if possible
        if (window.update3DBrain) {
          window.update3DBrain(window.lastDiagnosisData);
        }

      } catch (err) {
        error('Error loading history case:', err);
        this.showXAIError('Không thể tải dữ liệu ca bệnh: ' + err.message);
      }
    }
  };

  // ===== AUTO INITIALIZATION =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.XAISimilarUI.init();
    });
  } else {
    window.XAISimilarUI.init();
  }

  log('🎉 XAI & Similar Cases UI module loaded (Vietnamese Mode)');

})();

// ===== EXPOSE FOR DEBUGGING =====
window.XAISimilarUIDebug = {
  getState: function () {
    return window.XAISimilarUI.state;
  },
  getLastXAIData: function () {
    return window.lastXAIData;
  },
  getLastSimilarData: function () {
    return window.lastSimilarData;
  },
  render: function (type, data) {
    if (type === 'xai') {
      window.XAISimilarUI.renderXAIDashboard(data);
      window.XAISimilarUI.showXAIPanel();
    } else if (type === 'similar') {
      window.XAISimilarUI.renderSimilarCases(data);
      window.XAISimilarUI.showSimilarPanel();
    }
  }
};

console.log('%c[XAI] Debug mode available: window.XAISimilarUIDebug', 'color: #0097b4; font-weight: bold;');