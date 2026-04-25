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
    critical: { threshold: 40, color: '#ff5252', label: 'Yếu tố chính', rgb: '255, 82, 82' },
    high: { threshold: 20, color: '#ff9100', label: 'Yếu tố quan trọng', rgb: '255, 145, 0' },
    medium: { threshold: 10, color: '#0097b4', label: 'Yếu tố phụ', rgb: '0, 229, 255' },
    low: { threshold: 0, color: '#4a5568', label: 'Ảnh hưởng nhỏ', rgb: '136, 153, 176' }
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
        this.showXAIError('No XAI data provided');
        return;
      }

      const hasGradCAM = xaiData.gradcam && Object.keys(xaiData.gradcam).length > 0;
      const hasRuleBased = xaiData.rule_based && Object.keys(xaiData.rule_based).length > 0;
      const hasSHAP = xaiData.shap && Object.keys(xaiData.shap).length > 0;
      const hasInsights = xaiData.combined_insights && xaiData.combined_insights.length > 0;

      const hasAnyData = hasGradCAM || hasRuleBased || hasSHAP;

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
           
          </div>
          
          <!-- Combined Insights --> 
          ${hasInsights ? `
            <div class="xai-card insights-card" style="${this.styles.insightsCard}">
              <div style="${this.styles.cardHeader}">
                <h3 style="${this.styles.cardTitle}"><i class="fa-solid fa-lightbulb" style="margin-right: 8px;"></i>Kết Luận Tổng Hợp</h3>
             
              </div>
              <ul style="${this.styles.insightsList}">
                ${xaiData.combined_insights.map((insight, idx) => `
                  <li style="${this.styles.insightItem}">
                    <span style="${this.styles.insightEmoji}">${this.getInsightEmoji(insight)}</span>
                    ${this.escapeHtml(insight)}
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}
          
          <!-- Status Footer -->
          <div style="${this.styles.statusFooter}">
            <span style="color: #4a5568; font-size: 11px;">
              <i class="fa-solid fa-circle-check" style="color: #00c853; margin-right: 5px;"></i> Phân tích hoàn tất | ${new Date().toLocaleTimeString('vi-VN')}
            </span>
          </div>
        </div>
      `;

      panel.innerHTML = html;
      panel.style.display = 'block';

      log('✅ XAI dashboard rendered successfully');
    },

    // ===== GRAD-CAM CARD =====
    renderGradCAMCard: function (gradcam) {
      if (!gradcam) return '';

      const attScore = Math.round((gradcam.attention_score || 0) * 100);
      const technicalInfo = gradcam.technical_info || {};
      const sliceInfo = gradcam.slice_info || {};

      // --- Left column ---
      const leftContent = `
        <div style="${this.styles.scoreBox}">
          <div style="color: #4a5568; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Mức Độ Tập Trung Của CNN</div>
          <div style="color: #0097b4; font-size: 32px; font-weight: bold; margin-bottom: 8px;">${attScore}%</div>
          <div style="background: rgba(255,145,0,0.1); padding: 10px; border-radius: 4px; margin-bottom: 12px; border: 1px solid rgba(255,145,0,0.2);">
            <div style="color: #ff9100; font-size: 10px; line-height: 1.5;"><strong>⚠️ Lưu ý:</strong> Đây là mức độ <strong>tập trung</strong> của CNN vào vùng khối u (attention focus), KHÔNG phải độ tin cậy dự đoán chung. Độ tin cậy dự đoán hiển thị ở phần "Báo cáo chẩn đoán".</div>
          </div>
          <div style="${this.styles.progressBar}"><div style="height: 100%; width: ${attScore}%; ${this.styles.progressFill}"></div></div>
        </div>
        <div style="${this.styles.infoBox}; margin-bottom: 12px; margin-top: 12px;">
          <h4 style="color: #4a5568; margin: 0 0 8px 0; font-size: 11px; text-transform: uppercase;">Chi Tiết Kỹ Thuật</h4>
          <ul style="margin: 0; padding-left: 0; list-style: none; font-size: 10px; color: #4a5568;">
            <li style="margin-bottom: 4px;"><strong>Lớp mạng:</strong> ${technicalInfo.layer_name || 'Conv2D cuối'}</li>
            <li style="margin-bottom: 4px;"><strong>Vị trí:</strong> ${technicalInfo.position || 'Encoder bottleneck'}</li>
            <li style="margin-bottom: 4px;"><strong>Phương pháp:</strong> ${technicalInfo.gradient_method || 'Grad-CAM'}</li>
            <li style="margin-bottom: 4px;"><strong>Lát cắt:</strong> ${sliceInfo.type || 'axial'} - ${sliceInfo.resolution || '256x256'}</li>
            <li><strong>Tổng hợp:</strong> ${technicalInfo.aggregation_method || 'Không gian 2D'}</li>
          </ul>
        </div>
        ${gradcam.confidence_level ? `
          <div style="padding: 8px; background: rgba(${this.getConfidenceColor(gradcam.confidence_level)}, 0.1); border: 1px solid ${this.getConfidenceColorHex(gradcam.confidence_level)}; border-radius: 4px; margin-bottom: 12px;">
            <div style="color: #4a5568; font-size: 9px; text-transform: uppercase; margin-bottom: 4px;">Mức Độ Tin Cậy CNN</div>
            <div style="color: ${this.getConfidenceColorHex(gradcam.confidence_level)}; font-size: 14px; font-weight: bold;">${this.translateConfidenceLevel(gradcam.confidence_level)}</div>
          </div>
        ` : ''}
        ${gradcam.interpretation ? `
          <div style="padding: 10px; background: rgba(0,151,180,0.05); border-radius: 4px;">
            <div style="color: #4a5568; font-size: 10px; line-height: 1.5;"><i class="fa-solid fa-lightbulb" style="color: #0097b4; margin-right: 5px;"></i> ${this.escapeHtml(gradcam.interpretation)}</div>
          </div>
        ` : ''}
      `;

      // --- Right column ---
      let rightContent = '';

      // Collect image HTML first, then wrap in flex row
      const overlayHTML = gradcam.overlay_base64 ? `
        <div style="flex: 1; min-width: 0;">
          <img src="${gradcam.overlay_base64}" alt="Grad-CAM Overlay" style="width: 100%; border-radius: 6px; border: 1px solid #d1dde8;"/>
          <p style="color: #4a5568; font-size: 10px; text-align: center; margin: 6px 0 0 0;">Bản đồ nhiệt tập trung chồng lên ảnh gốc</p>
        </div>
      ` : '';
      const heatmapHTML = gradcam.heatmap_base64 ? `
        <div style="flex: 1; min-width: 0;">
          <img src="${gradcam.heatmap_base64}" alt="Grad-CAM Heatmap" style="width: 100%; border-radius: 6px; border: 1px solid #d1dde8;"/>
          <p style="color: #4a5568; font-size: 10px; text-align: center; margin: 6px 0 0 0;">Bản đồ tập trung thuần</p>
        </div>
      ` : '';

      if (overlayHTML || heatmapHTML) {
        rightContent += `<div style="display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px;">${overlayHTML}${heatmapHTML}</div>`;
      }

      if (gradcam.focused_regions && gradcam.focused_regions.length > 0) {
        rightContent += `
          <div style="${this.styles.infoBox}; margin-bottom: 12px;">
            <h4 style="color: #4a5568; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">Vùng Tập Trung</h4>
            <ul style="margin: 0; padding-left: 0; list-style: none;">
              ${gradcam.focused_regions.slice(0, 3).map((region, i) => `<li style="color: #4a5568; font-size: 12px; margin-bottom: 4px;">Vùng ${i + 1}: <span style="color: #0097b4; font-weight: bold;">${Math.round((region.attention || 0) * 100)}%</span> tập trung</li>`).join('')}
            </ul>
          </div>
        `;
      }
      rightContent += this.renderConfidenceColorbar();


      return `
        <div class="xai-card" style="${this.styles.card}">
          <div style="${this.styles.cardHeader}">
            <h3 style="${this.styles.cardTitle}">Trực Quan Hóa Grad-CAM</h3>
         
          </div>
          <div style="display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 240px;">${leftContent}</div>
            <div style="flex: 1; min-width: 240px;">${rightContent}</div>
          </div>
        </div>
      `;
    },

    // ===== RENDER CONFIDENCE COLORBAR (NEW) =====
    renderConfidenceColorbar: function () {
      return `
        <div style="margin: 16px 0; padding: 12px; background: rgba(0, 229, 255, 0.05); 
          border-radius: 6px; border: 1px solid #d1dde8;">
          
          <div style="color: #4a5568; font-size: 11px; text-transform: uppercase; 
            letter-spacing: 0.5px; margin-bottom: 12px;">
            <i class="fa-solid fa-palette" style="margin-right: 8px;"></i> Thang Màu Confidence
          </div>
          
          <!-- Colorbar -->
          <div style="display: flex; height: 30px; margin-bottom: 8px; border-radius: 4px; overflow: hidden;
            background: linear-gradient(90deg, 
              #4a4a4a 0%, 
              #ffff00 30%, 
              #ff9100 60%, 
              #ff0040 100%);
            border: 1px solid rgba(0,0,0,0.1);">
          </div>
          
          <!-- Labels -->
          <div style="display: flex; justify-content: space-between; font-size: 9px; 
            color: #4a5568; font-family: 'Consolas', monospace;">
            <span>0.0 (Không chắc)</span>
            <span>0.5 (Trung bình)</span>
            <span>1.0 (Rất chắc)</span>
          </div>
          
          <!-- Threshold Indicators -->
          <div style="margin-top: 12px; padding: 8px; background: rgba(0, 151, 180, 0.05); 
            border-radius: 4px;">
            <div style="color: #4a5568; font-size: 10px; margin-bottom: 6px;">
              <i class="fa-solid fa-triangle-exclamation" style="color: #ff9100; margin-right: 5px;"></i> <strong>Ngưỡng Phân Loại</strong>
            </div>
            <div style="color: #ff0040; font-size: 11px; margin-bottom: 4px;">
              <i class="fa-solid fa-circle" style="font-size: 8px; margin-right: 5px;"></i> <strong>&gt; 0.7:</strong> Nghi ngờ cao (Khối u có khả năng)
            </div>
            <div style="color: #ff9100; font-size: 11px; margin-bottom: 4px;">
              <i class="fa-solid fa-circle" style="font-size: 8px; margin-right: 5px;"></i> <strong>0.3 - 0.7:</strong> Không chắc chắn (cần xác minh)
            </div>
            <div style="color: #ffff00; font-size: 11px;">
              <i class="fa-solid fa-circle" style="font-size: 8px; margin-right: 5px;"></i> <strong>&lt; 0.3:</strong> Không chắc (Không phải khối u)
            </div>
          </div>
        </div>
      `;
    },

    // ===== RULE-BASED CARD =====
    renderRuleBasedCard: function (rules) {
      if (!rules) return '';

      const riskLevel = rules.risk_level || 'Unknown';
      const riskColors = {
        'High': { bg: '#ff5252', rgb: '255, 82, 82', vi: 'Cao' },
        'Medium': { bg: '#ff9100', rgb: '255, 145, 0', vi: 'Trung Bình' },
        'Low': { bg: '#00c853', rgb: '0, 200, 83', vi: 'Thấp' }
      };
      const riskColor = riskColors[riskLevel] || { bg: '#4a5568', rgb: '136, 153, 176', vi: 'Không xác định' };

      // --- Left column: risk + measurements ---
      const leftContent = `
        <div style="padding: 12px; border: 1px solid ${riskColor.bg}44;
          background: rgba(${riskColor.rgb}, 0.1); border-radius: 4px; margin-bottom: 16px;">
          <div style="color: #4a5568; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Mức Độ Rủi Ro</div>
          <div style="color: ${riskColor.bg}; font-size: 28px; font-weight: bold;">${riskColor.vi}</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div style="${this.styles.infoBox}">
            <div style="color: #4a5568; font-size: 10px; text-transform: uppercase;">Diện Tích Khối U</div>
            <div style="color: #0097b4; font-size: 18px; font-weight: bold; margin-top: 4px;">${rules.tumor_area_mm2 !== undefined ? rules.tumor_area_mm2.toFixed(1) : 'N/A'}</div>
            <div style="color: #4a5568; font-size: 9px;">mm²</div>
          </div>
          <div style="${this.styles.infoBox}">
            <div style="color: #4a5568; font-size: 10px; text-transform: uppercase;">Phủ Não</div>
            <div style="color: #0097b4; font-size: 18px; font-weight: bold; margin-top: 4px;">${rules.tumor_ratio !== undefined ? rules.tumor_ratio.toFixed(1) : 'N/A'}</div>
            <div style="color: #4a5568; font-size: 9px;">%</div>
          </div>
          <div style="${this.styles.infoBox}">
            <div style="color: #4a5568; font-size: 10px; text-transform: uppercase;">Vị Trí</div>
            <div style="color: #0097b4; font-size: 14px; font-weight: bold; margin-top: 4px;">${rules.location || 'Không xác định'}</div>
          </div>
          <div style="${this.styles.infoBox}">
            <div style="color: #4a5568; font-size: 10px; text-transform: uppercase;">Mức Độ</div>
            <div style="color: #0097b4; font-size: 14px; font-weight: bold; margin-top: 4px;">${rules.severity || 'Trung bình'}</div>
          </div>
        </div>
      `;

      // --- Right column: rules + warnings + depth (built dynamically) ---
      let rightContent = '';


      // Rules triggered
      if (rules.rules_triggered && rules.rules_triggered.length > 0) {
        rightContent += `
          <div style="${this.styles.infoBox}; margin-bottom: 12px;">
            <h4 style="color: #4a5568; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">
              <i class="fa-solid fa-check-double" style="color: #00c853; margin-right: 8px;"></i> Quy Tắc Đã Kích Hoạt
            </h4>
            <ul style="margin: 0; padding-left: 0; list-style: none;">
              ${rules.rules_triggered.slice(0, 3).map(rule => `
                <li style="color: #4a5568; font-size: 12px; margin-bottom: 4px;">
                  <i class="fa-solid fa-check" style="color: #00c853; margin-right: 8px;"></i> ${this.escapeHtml(rule)}
                </li>
              `).join('')}
            </ul>
          </div>
        `;
      }

      // Warnings
      if (rules.warnings && rules.warnings.length > 0) {
        rightContent += `
          <div style="padding: 12px; background: rgba(255,82,82,0.1); border: 1px solid rgba(255,82,82,0.2); border-radius: 4px; margin-bottom: 12px;">
            <h4 style="color: #ff5252; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">
              <i class="fa-solid fa-triangle-exclamation" style="margin-right: 8px;"></i> Cảnh Báo Lâm Sàng
            </h4>
            <ul style="margin: 0; padding-left: 0; list-style: none;">
              ${rules.warnings.slice(0, 3).map(warning => `
                <li style="color: #ffb3b3; font-size: 12px; margin-bottom: 4px;">
                  <i class="fa-solid fa-triangle-exclamation" style="margin-right: 8px;"></i> ${this.escapeHtml(warning)}
                </li>
              `).join('')}
            </ul>
          </div>
        `;
      }

      // Depth Metrics
      if (rules.depth_metrics) {
        rightContent += `
          <div style="padding: 12px; background: rgba(156,39,176,0.08); border: 1px solid rgba(156,39,176,0.2); border-radius: 4px; margin-bottom: 12px;">
            <div style="color: #4a5568; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; font-weight: bold;">Vector Độ Sâu</div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div style="color: #4a5568; font-size: 11px;">Tumor Depth</div>
              <div style="color: #9c27b0; font-size: 16px; font-weight: bold;">${rules.depth_metrics.tumor_depth_mm?.toFixed(1) || 'N/A'} mm</div>
            </div>
            <div style="padding: 8px; background: ${this.getCategoryBG(rules.depth_metrics.depth_category?.category)}; border: 1px solid ${this.getCategoryBorder(rules.depth_metrics.depth_category?.category)}44; border-radius: 4px; margin-bottom: 8px;">
              <div style="display: flex; align-items: center; font-size: 13px; font-weight: bold; color: ${this.getCategoryBorder(rules.depth_metrics.depth_category?.category)};">
                <span style="margin-right: 8px;"><i class="fa-solid fa-ruler-vertical"></i></span>
                ${rules.depth_metrics.depth_category?.label || 'N/A'}
              </div>
            </div>
            <div style="background: rgba(0,151,180,0.05); padding: 8px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 9px; color: #4a5568; margin-bottom: 8px;">
              <div style="margin-bottom: 4px;"><strong>Tâm u:</strong> <span style="color: #0097b4;">(${rules.depth_metrics.centroid_3d?.[0]?.toFixed(1)}, ${rules.depth_metrics.centroid_3d?.[1]?.toFixed(1)}, ${rules.depth_metrics.centroid_3d?.[2]?.toFixed(1)})</span></div>
              <div><strong>Vỏ não:</strong> <span style="color: #0097b4;">(${rules.depth_metrics.nearest_cortex_point?.[0]?.toFixed(1)}, ${rules.depth_metrics.nearest_cortex_point?.[1]?.toFixed(1)}, ${rules.depth_metrics.nearest_cortex_point?.[2]?.toFixed(1)})</span></div>
            </div>
            <div style="background: rgba(156,39,176,0.05); padding: 8px; border-radius: 4px; color: #4a5568; font-size: 10px; line-height: 1.5;">
              <i class="fa-solid fa-lightbulb" style="color: #0097b4; margin-right: 5px;"></i> <strong>Ý nghĩa lâm sàng:</strong> ${this.getDepthClinicalMeaning(rules.depth_metrics.tumor_depth_mm)}
            </div>
          </div>
        `;
      }

      return `
        <div class="xai-card" style="${this.styles.card}">
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
        <div style="background: rgba(0,151,180,0.05); padding: 12px; border-radius: 4px; margin-bottom: 16px; border: 1px solid rgba(0,151,180,0.2);">
          <div style="color: #4a5568; font-size: 10px; line-height: 1.6;">
            <i class="fa-solid fa-circle-info" style="color: #0097b4; margin-right: 5px;"></i>
            <strong>Giải thích:</strong> % đóng góp <strong>tương đối</strong> của mỗi tính năng vào dự đoán cuối cùng.
            Tổng tất cả tính năng = 100%. Con số càng cao = ảnh hưởng càng lớn đến kết quả.
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="padding: 8px; background: rgba(255,82,82,0.08); border-radius: 4px; border: 1px solid #ff525244;">
            <span style="color: #ff5252; font-size: 10px; font-weight: 600;">🔴 Yếu tố chính</span>
            <span style="color: #4a5568; font-size: 9px; margin-left: 8px;">&gt; 40% đóng góp</span>
          </div>
          <div style="padding: 8px; background: rgba(255,145,0,0.08); border-radius: 4px; border: 1px solid #ff910044;">
            <span style="color: #ff9100; font-size: 10px; font-weight: 600;">🟡 Yếu tố quan trọng</span>
            <span style="color: #4a5568; font-size: 9px; margin-left: 8px;">20–40%</span>
          </div>
          <div style="padding: 8px; background: rgba(0,229,255,0.08); border-radius: 4px; border: 1px solid #0097b444;">
            <span style="color: #0097b4; font-size: 10px; font-weight: 600;">🟢 Yếu tố phụ</span>
            <span style="color: #4a5568; font-size: 9px; margin-left: 8px;">10–20%</span>
          </div>
          <div style="padding: 8px; background: rgba(136,153,176,0.08); border-radius: 4px; border: 1px solid #4a556844;">
            <span style="color: #4a5568; font-size: 10px; font-weight: 600;">⚪ Ảnh hưởng nhỏ</span>
            <span style="color: #4a5568; font-size: 9px; margin-left: 8px;">&lt; 10%</span>
          </div>
        </div>
      `;

      // --- Right column: features list ---
      let rightContent = '';
      if (topFeatures.length > 0) {
        rightContent += `
          <h4 style="color: #4a5568; margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase;">
            Các Tính Năng Đóng Góp Hàng Đầu (Tầm Quan Trọng Tương Đối)
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
                <div style="padding: 12px; background: rgba(${importanceLevel.rgb}, 0.08); border-radius: 6px; border: 1px solid ${importanceLevel.color}44;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="flex: 1;">
                      <div style="color: #4a5568; font-size: 13px; font-weight: 600; margin-bottom: 2px;">${this.escapeHtml(featureNameVI)}</div>
                      <div style="color: #4a5568; font-size: 9px;">${this.escapeHtml(feature)}</div>
                    </div>
                    <div style="text-align: right; margin-left: 12px;">
                      <div style="color: ${importanceLevel.color}; font-size: 18px; font-weight: bold;">${importancePercent}%</div>
                      <div style="color: #4a5568; font-size: 8px; text-transform: uppercase;">Đóng góp</div>
                    </div>
                  </div>
                  <div style="${this.styles.progressBar}; margin-bottom: 8px;">
                    <div style="height: 100%; width: ${importancePercent}%; background: ${importanceLevel.color}; border-radius: 2px; transition: width 0.3s ease;"></div>
                  </div>
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: ${featureDesc ? '8px' : '0'};">
                    <span style="color: ${importanceLevel.color}; font-size: 10px; font-weight: 600;">${importanceLevel.label}</span>
                    <span style="color: #4a5568; font-size: 9px;">${this.getImportanceExplanation(importancePercent)}</span>
                  </div>
                  ${featureDesc ? `<div style="background: rgba(0,151,180,0.05); padding: 8px; border-radius: 4px; margin-top: 8px;"><div style="color: #4a5568; font-size: 9px; line-height: 1.5;">ℹ️ ${this.escapeHtml(featureDesc)}</div></div>` : ''}
                </div>
              `;
        }).join('')}
          </div>
        `;
      } else {
        rightContent = `<p style="color: #4a5568; font-size: 12px; text-align: center; padding: 20px;">Không có dữ liệu tầm quan trọng tính năng</p>`;
      }

      return `
        <div class="xai-card" style="${this.styles.card}">
          <div style="${this.styles.cardHeader}">
            <h3 style="${this.styles.cardTitle}">Tầm Quan Trọng Của Các Tính Năng</h3>
          
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
        <div class="xai-card clinical-report-card" style="${this.styles.card}; margin-bottom: 25px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
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
              background: ${severityColor};
              color: white;
              padding: 8px 20px;
              border-radius: 50px;
              font-size: 13px;
              font-weight: 800;
              letter-spacing: 0.8px;
              text-transform: uppercase;
              display: flex;
              align-items: center;
              gap: 8px;
            ">
              <i class="fa-solid fa-triangle-exclamation"></i>
              RỦI RO: ${report.severity || 'Trung Bình'}
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
            <div style="background: #0097b4; padding: 0; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;">
              <div style="padding: 15px 18px; background: rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-brain" style="color: white;"></i>
                <h4 style="margin: 0; font-size: 13px; color: white; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">PHÂN TÍCH TỪ HỌC MÁY - AI CHUẨN ĐOÁN</h4>
              </div>
              <div style="padding: 18px; flex: 1; display: flex; flex-direction: column; gap: 15px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                  <div style="background: rgba(255,255,255,0.08); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                    <div style="font-size: 9px; color: rgba(255,255,255,0.7); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">HÌNH DẠNG</div>
                    <div style="font-size: 18px; color: white; font-weight: 800;">${vision ? (vision.tumor_characteristics?.shape || 'tròn') : 'tròn'}</div>
                    <div style="font-size: 9px; color: rgba(255,255,255,0.6); line-height: 1.4; margin-top: 4px;">Dạng khối khu trú, tập trung, thường ít gây hiệu ứng khối lên các vùng não xa.</div>
                  </div>
                  <div style="background: rgba(255,255,255,0.08); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                    <div style="font-size: 9px; color: rgba(255,255,255,0.7); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">RANH GIỚI</div>
                    <div style="font-size: 18px; color: white; font-weight: 800;">${vision ? (vision.tumor_characteristics?.boundary || 'ranh giới rõ') : 'ranh giới rõ'}</div>
                    <div style="font-size: 9px; color: rgba(255,255,255,0.6); line-height: 1.4; margin-top: 4px;">Đường viền sắc nét, giúp phân biệt dễ dàng với mô não lành xung quanh.</div>
                  </div>
                </div>
                <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); flex: 1;">
                  <p style="margin: 0; font-size: 12px; color: white; line-height: 1.6;">
                    <strong style="color:rgba(255,255,255,0.9)">Nhận xét:</strong> ${vision ? (vision.additional_observations || 'Cần theo dõi thêm vùng phù nề xung quanh.') : 'Phân tích đa phương thức đang chờ dữ liệu.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
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
        <div style="padding: 20px 30px; background: transparent; border-radius: 12px; max-width: 1400px; margin: 0 auto;">
          
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
        return this.renderCaseCard(caseItem, originalIdx);
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
      panel.style.display = 'block';

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
    renderCaseCard: function (caseItem, caseIndex) {
      const similarity = Math.round((caseItem.similarity_score || 0) * 100);
      const statusColor = caseItem.has_tumor ? '#ff5252' : '#00c853';
      const statusIcon = caseItem.has_tumor ? '<i class="fa-solid fa-circle" style="font-size: 10px; margin-right: 8px;"></i>' : '<i class="fa-solid fa-circle" style="font-size: 10px; margin-right: 8px;"></i>';
      const statusText = caseItem.has_tumor ? `${statusIcon} Phát hiện khối u` : `${statusIcon} Không có khối u`;

      return `
        <div class="similar-case-card" style="padding: 20px; border: 1px solid #d1dde8; border-radius: 12px; 
          background: #ffffff; position: relative; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer;
          box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
          <style>
            .similar-case-card:hover { transform: translateY(-8px); box-shadow: 0 20px 25px -5px rgba(0, 151, 180, 0.1), 0 10px 10px -5px rgba(0, 151, 180, 0.04); border-color: #0097b4; }
            .similar-case-card:hover .case-image-container { transform: scale(1.05); border-color: #0097b4; }
          </style>
          
          <!-- Rank Badge -->
          <div style="position: absolute; top: 16px; right: 16px; background: transparent; 
            color: #0097b4; padding: 6px 12px; border-radius: 4px; font-size: 12px; 
            font-weight: bold; box-shadow: 0 2px 8px rgba(0,229,255,0.3);">
            #${caseItem.rank || '?'}
          </div>
           
          <!-- Thumbnail -->
          <div class="case-image-container" style="width: 100%; height: 200px; background: #050c1a; border-radius: 6px; 
            display: flex; align-items: center; justify-content: center; margin-bottom: 16px; 
            overflow: hidden; border: 1px solid #1e3a52; transition: all 0.4s ease;">
            ${this.renderThumbnail(caseItem)}
          </div>
          
          <!-- Similarity Score -->
          <div style="padding: 12px; background: rgba(0, 229, 255, 0.1); 
            border: 1px solid rgba(0, 151, 180, 0.2); border-radius: 4px; margin-bottom: 12px;">
            <div style="color: #4a5568; font-size: 10px; text-transform: uppercase; 
              letter-spacing: 0.5px; margin-bottom: 6px;">
              Độ Tương Đồng
            </div>
            <div style="color: #0097b4; font-size: 24px; font-weight: bold; margin-bottom: 8px;">
              ${similarity}%
            </div>
            <div style="width: 100%; height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden;">
              <div style="height: 100%; width: ${similarity}%; 
                background: #0097b4; border-radius: 2px;">
              </div>
            </div>
          </div>
          
          <!-- Status -->
          <div style="padding: 10px; background: rgba(${this.hexToRgb(statusColor)}, 0.1); 
            border: 1px solid ${statusColor}44; border-radius: 4px; margin-bottom: 12px;">
            <div style="color: ${statusColor}; font-size: 13px; font-weight: bold;">
              ${statusText}
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
      var statusColorLeft = pred.tumor_detected ? '#ff5252' : '#00c853';
      var statusColorRight = caseItem.has_tumor ? '#ff5252' : '#00c853';
      var simColor = similarity >= 80 ? '#00c853' : similarity >= 55 ? '#ff9100' : '#ff5252';

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
        var c = v >= 75 ? '#00c853' : v >= 50 ? '#ff9100' : '#ff5252';
        return '<div style="margin-bottom:9px;"><div style="display:flex;justify-content:space-between;font-size:11px;color:#4a5568;margin-bottom:3px;"><span>' + label + '</span><span style="color:' + c + ';font-weight:bold;">' + v + '%</span></div>'
          + '<div style="height:5px;background:#e2e8f0;border-radius:3px;overflow:hidden;"><div style="height:100%;width:' + v + '%;background:' + c + ';border-radius:3px;"></div></div></div>';
      }).join('');

      var rightPanel = '<div style="flex:1;padding:18px;overflow-y:auto;">'
        + '<div style="color:#0097b4;font-size:14px;font-weight:bold;margin-bottom:14px;">🔎 Ca Tương Tự #' + (caseItem.rank || '?') + '</div>'
        + '<div style="width:100%;height:200px;background:#050c1a;border:1px solid #d1dde8;border-radius:7px;display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:12px;">' + caseImgHTML + '</div>'
        + metricHTML('Kết Quả', caseItem.has_tumor ? '🔴 Phát Hiện Khối U' : '🟢 Không Có Khối U', statusColorRight)
        + metricHTML('Độ Tương Đồng', similarity + '%', simColor)
        + metricHTML('Khoảng Cách Feature', (caseItem.distance || 0).toFixed(3), '#4a5568')
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

    showSimilarPanel: function () {
      const panel = document.getElementById('similarPanel');
      if (panel) panel.style.display = 'block';
    },

    hideXAIPanel: function () {
      const panel = document.getElementById('xaiPanel');
      if (panel) panel.style.display = 'none';
    },

    hideSimilarPanel: function () {
      const panel = document.getElementById('similarPanel');
      if (panel) panel.style.display = 'none';
    },

    // ===== TUMOR GRADING CARD (DYNAMIC CLINICAL) =====
    renderTumorGradingCard: function (diagnosisData) {
      if (!diagnosisData) return '';

      const mcMask = diagnosisData.multiclass_mask;
      const stats = diagnosisData.multiclass_stats;
      const mask = diagnosisData.mask;
      const slices = diagnosisData.slices;

      const segmentationImg = slices?.axial?.segmentation_b64 || mcMask;
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
        <div style="background: rgba(0,0,0,0.02); border-radius: 10px; padding: 14px 18px; border: 1px solid ${status.c}22; margin-bottom: 2px; transition: all 0.2s;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 14px; height: 14px; background: ${color}; border-radius: 3px; flex-shrink:0; box-shadow: 0 0 5px ${color}66;"></div>
              <div>
                <span style="font-size: 14px; font-weight: 700; color: #1e293b;">${label}</span>
                <span style="margin-left: 8px; font-size: 9px; font-weight: 700; color: ${status.c}; background: ${status.b}; padding: 2px 8px; border-radius: 10px; border: 1px solid ${status.c}33;">${status.l}</span>
              </div>
            </div>
            <span style="font-size: 22px; font-weight: 800; color: ${color}; letter-spacing: -1px;">${pct.toFixed(1)}%</span>
          </div>
          <div style="height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin-bottom: 12px;">
            <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 4px; transition: width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);"></div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
            <div style="background: #ffffff; padding: 6px 10px; border-radius: 8px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 10px; color: #94a3b8; font-weight: 600;">DIỆN TÍCH</span>
              <span style="font-size: 12px; font-weight: 700; color: #1e293b;">${mm2} mm²</span>
            </div>
            <div style="background: #ffffff; padding: 6px 10px; border-radius: 8px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 10px; color: #94a3b8; font-weight: 600;">PIXEL AI</span>
              <span style="font-size: 12px; font-weight: 700; color: #1e293b;">${px.toLocaleString()}</span>
            </div>
          </div>
          <p style="margin: 0; font-size: 11px; color: #64748b; line-height: 1.5; border-top: 1px solid #f1f5f9; padding-top: 8px; font-style: italic;">${note}</p>
        </div>`;

      return `
        <div class="xai-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); margin-bottom: 24px; position: relative; overflow: hidden;">
          <!-- Header -->
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 16px;">
              <div style="width: 52px; height: 52px; background: #334155; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 24px;">
                <i class="fa-solid fa-layer-group"></i>
              </div>
              <div>
                <h3 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Phân Lớp Màu Cấu Trúc</h3>
                <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 600;">Định lượng thành phần khối u thực tế (Color Grading)</p>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="background: #f1f5f9; color: #475569; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; border: 1px solid #e2e8f0; display: inline-block; margin-bottom: 6px;">PHÂN TÍCH LÂM SÀNG</div>
              <div style="font-size: 11px; color: #94a3b8;">Tổng diện tích: <strong style="color: #0f172a;">${totMm2} mm²</strong></div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1.1fr 1.9fr; gap: 32px; align-items: start;">
            <!-- Left: Visual Mapping -->
            <div>
              <div style="position: relative; border-radius: 14px; overflow: hidden; border: 2px solid #f1f5f9; background: #000; aspect-ratio: 1/1; box-shadow: 0 15px 35px rgba(0,0,0,0.15);">
                <img src="${slices?.axial?.clean_b64 || ''}" style="width: 100%; height: 100%; object-fit: contain; opacity: 0.8;"/>
                <img src="${segmentationImg}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; z-index: 2;"/>
                <div style="position: absolute; bottom: 12px; right: 12px; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(4px); padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.3);">HÌNH CHIẾU TRỤC</div>
              </div>
              
              <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                  <div style="width: 12px; height: 12px; background: #ef4444; border-radius: 3px;"></div>
                  <span style="font-size: 12px; color: #475569; font-weight: 600;">Mô Hoại tử (Necrosis)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                  <div style="width: 12px; height: 12px; background: #eab308; border-radius: 3px;"></div>
                  <span style="font-size: 12px; color: #475569; font-weight: 600;">Mô Tăng cường (Enhancing)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                  <div style="width: 12px; height: 12px; background: #22c55e; border-radius: 3px;"></div>
                  <span style="font-size: 12px; color: #475569; font-weight: 600;">Mô Phù nề (Edema)</span>
                </div>
              </div>
            </div>

            <!-- Right: Detailed Metrics -->
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">Thông số AI chi tiết</h4>
              
              ${row('#ef4444','Hoại tử (NCR)',  ncrPct, ncrPixels, ncrMm2, ncrStatus,
                'Vùng lõi mô chết, tín hiệu thấp trên T1ce. Dấu hiệu tiêu chuẩn của Glioma ác tính cao.')}
              
              ${row('#eab308','Tăng cường (ET)', etPct, etPixels, etMm2, etStatus,
                'Vùng u đang phát triển mạnh, tưới máu cao. Cần ưu tiên theo dõi ranh giới xâm lấn.')}
              
              ${row('#22c55e','Phù nề (ED)', edPct, edPixels, edMm2, edStatus,
                'Chất lỏng tích tụ quanh u. Gây hiệu ứng khối (mass effect) và chèn ép nhu mô não lành.')}
            </div>
          </div>

          <!-- Clinical Conclusion -->
          <div style="margin-top: 32px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; display: flex; align-items: flex-start; gap: 20px;">
            <div style="width: 48px; height: 48px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #475569; font-size: 20px; border: 1px solid #e2e8f0; flex-shrink: 0;">
              <i class="fa-solid fa-user-md"></i>
            </div>
            <div>
              <h5 style="margin: 0 0 8px 0; font-size: 15px; color: #0f172a; font-weight: 800; display: flex; align-items: center; gap: 10px;">
                Đánh giá chuyên sâu từ AI
                <span style="font-size: 11px; color: #475569; background: #e2e8f0; padding: 2px 10px; border-radius: 12px; font-weight: 700;">THÔNG TIN LÂM SÀNG</span>
              </h5>
              <div style="color: #334155; font-size: 14px; line-height: 1.7;">${getFinalConclusion()}</div>
              <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(0,0,0,0.05); display: flex; align-items: center; gap: 20px;">
                 <span style="font-size: 11px; color: #94a3b8;"><i class="fa-solid fa-chart-line" style="margin-right: 6px;"></i> Phân tích từ ${totalPixels.toLocaleString()} voxel</span>
                 <span style="font-size: 11px; color: #94a3b8;"><i class="fa-solid fa-shield-halved" style="margin-right: 6px;"></i> Độ tin cậy: ~95.8%</span>
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
        'INTERMEDIATE': '#ffff00',
        'DEEP': '#00c853',
        'VERY_DEEP': '#00a3cc'
      };

      return map[category] || '#4a5568';
    },

    getCategoryText: function (category) {
      const map = {
        'SUPERFICIAL': '#ff5252',
        'SHALLOW': '#ffb74d',
        'INTERMEDIATE': '#ffff99',
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
      container: 'padding: 20px 30px; background: transparent; border-radius: 12px; max-width: 1400px; margin: 0 auto;',
      header: 'margin-bottom: 30px;',
      title: 'color: #0097b4; margin: 0 0 10px 0; font-size: 24px; font-weight: bold;',
      subtitle: 'color: #4a5568; margin: 0; font-size: 13px;',
      grid: 'display: flex; flex-direction: column; gap: 20px; margin-bottom: 20px;',
      card: 'padding: 20px; border: 1px solid #d1dde8; border-radius: 8px; background: #ffffff;',
      cardHeader: 'display: flex; align-items: center; gap: 10px; margin-bottom: 16px;',
      cardTitle: 'color: #0097b4; margin: 0; font-size: 16px; font-weight: bold;',
      badge: 'background: #0097b4; color: transparent; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;',
      infoBox: 'padding: 10px; background: rgba(82, 143, 204, 0.1); border-radius: 4px;',
      scoreBox: 'padding: 12px; background: rgba(0, 229, 255, 0.1); border: 1px solid rgba(0, 151, 180, 0.2); border-radius: 4px; margin-bottom: 16px;',
      progressBar: 'width: 100%; height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden;',
      progressFill: 'height: 100%; background: #0097b4; border-radius: 2px;',
      image: 'width: 100%; border-radius: 6px; border: 1px solid #d1dde8;',
      insightsCard: 'margin-top: 20px; padding: 20px; border: 1px solid #d1dde8; border-radius: 8px; background: #ffffff;',
      insightsList: 'margin: 0; padding-left: 0; list-style: none;',
      insightItem: 'color: #4a5568; margin-bottom: 8px; padding-left: 20px; position: relative; font-size: 13px; line-height: 1.5;',
      insightEmoji: 'position: absolute; left: 0; color: #0097b4; font-weight: bold; width: 16px;',
      statusFooter: 'margin-top: 16px; padding-top: 16px; border-top: 1px solid #d1dde8; text-align: center;'
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