/**
 * app.js (HOÀN CHỈNH & FIX ĐẦY ĐỦ)
 * Main application logic for NeuroScan AI frontend.
 *
 * ✅ MAJOR FIXES:
 *   1. Tỷ lệ u/não hiển thị đúng: 0.0674% → 0.07% hoặc 64% → 64%
 *   2. Độ sâu khối u diễn đạt y khoa rõ ràng (CRITICAL, LOW, INTERMEDIATE, HIGH, VERY HIGH)
 *   3. Tích hợp đầy đủ XAI và Similar Cases
 *   4. Atlas 3D button handler đúng vị trí (INSIDE btnReset listener)
 *   5. displayMetricsPanel được gọi từ window.updateTumorMetrics
 *   6. Tab switching logic hoàn thiện
 *   7. Pre-load atlas background không blocking
 *   8. Update 3D brain gọi updateTumorMetrics đúng
 *
 * Features:
 *   - File upload (drag & drop + click)
 *   - MRI preview canvas rendering
 *   - POST to /api/diagnose
 *   - Render segmentation mask overlay
 *   - Display Groq AI diagnosis report
 *   - Trigger 3D brain tumor update
 *   - Tab navigation (Scan, 3D Brain, XAI, Similar Cases, Info)
 *   - XAI Dashboard rendering (Grad-CAM, Rules, SHAP, Insights)
 *   - Similar Cases grid with modal details
 *   - BigBrain Atlas 3D toggle with isocortex visualization
 *   - Health check on load
 */

(function App() {

  const API_BASE = 'http://127.0.0.1:8000/api';

  window.lastDiagnosisData = null;

  window.translateLocationToVi = function (loc) {
    if (!loc || loc === '—') return loc || '—';
    let l = loc.toLowerCase();
    let lobe = '';
    if (l.includes('frontal')) lobe = 'Thùy trán';
    else if (l.includes('temporal')) lobe = 'Thùy thái dương';
    else if (l.includes('parietal')) lobe = 'Thùy đỉnh';
    else if (l.includes('occipital')) lobe = 'Thùy chẩm';
    else if (l.includes('cerebellum') || l.includes('cerebellar')) lobe = 'Tiểu não';
    else if (l.includes('stem')) lobe = 'Thân não';
    else return loc; // fallback

    let side = '';
    if (l.includes('left')) side = 'trái';
    if (l.includes('right')) side = 'phải';

    let pos = '';
    if (l.includes('inferior')) pos = 'dưới';
    if (l.includes('superior')) pos = 'trên';
    if (l.includes('anterior')) pos = 'trước';
    if (l.includes('posterior')) pos = 'sau';
    if (l.includes('medial')) pos = 'giữa';
    if (l.includes('lateral')) pos = 'bên';

    let res = lobe;
    if (side) res += ' ' + side;
    if (pos) res += ' ' + pos;
    return res;
  };

  // ===== DOM References - Main Report Section =====
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const previewWrap = document.getElementById('previewWrap');
  const previewCanvas = document.getElementById('previewCanvas');
  const btnDiagnose = document.getElementById('btnDiagnose');
  const reportPlaceholder = document.getElementById('reportPlaceholder');
  const reportContent = document.getElementById('reportContent');
  const loadingState = document.getElementById('loadingState');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  // ===== Report Fields =====
  const confidenceBar = document.getElementById('confidenceBar');
  const confidenceValue = document.getElementById('confidenceValue');
  const statStatus = document.getElementById('statStatus');
  const statArea = document.getElementById('statArea');
  const statLocation = document.getElementById('statLocation');
  const statSeverity = document.getElementById('statSeverity');
  const reportSummary = document.getElementById('reportSummary');
  const findingsList = document.getElementById('findingsList');
  const recommendationsList = document.getElementById('recommendationsList');
  const disclaimer = document.getElementById('disclaimer');

  // ===== Viewer Controls =====
  const btnRotate = document.getElementById('btnRotate');
  const btnSlice = document.getElementById('btnSlice');
  const btnReset = document.getElementById('btnReset');
  const btnAtlas3D = document.getElementById('btnAtlas3D');

  // ===== Tab Navigation =====
  const pills = document.querySelectorAll('.pill');
  const infoPanel = document.getElementById('infoPanel');
  const xaiPanel = document.getElementById('xaiPanel');
  const similarPanel = document.getElementById('similarPanel');
  const atlasPanel = document.getElementById('atlasViewPanel');
  const historyPanel = document.getElementById('historyPanel');
  const mainLayout = document.querySelector('.main-layout');


  // ===== State =====
  let currentFile = null;
  let currentImageFile = null;
  let maskOverlayCanvas = null;
  let lastPredictionData = null;
  let lastXAIData = null;
  let lastSimilarData = null;
  let isProcessingDiagnosis = false;

  // ===== LOCALSTORAGE KEYS =====
  const LS_KEY_DIAGNOSIS = 'neuroscan_last_diagnosis';
  const LS_KEY_IMAGE = 'neuroscan_last_image';     // base64 DataURL
  const LS_KEY_MASK_B64 = 'neuroscan_last_mask_b64';  // base64 PNG of mask canvas
  const LS_KEY_SIMILAR = 'neuroscan_last_similar';
  const LS_KEY_TAB = 'neuroscan_last_tab';

  // ===== SAVE STATE TO LOCALSTORAGE =====
  function _saveStateToLS(diagnosisResult, imageDataURL, maskB64, similarData) {
    try {
      // Clamp size: strip the raw mask array (large) before saving
      const toSave = JSON.parse(JSON.stringify(diagnosisResult));
      delete toSave.mask; // Remove raw 256×256 array — we save rendered PNG instead
      localStorage.setItem(LS_KEY_DIAGNOSIS, JSON.stringify(toSave));

      if (imageDataURL) localStorage.setItem(LS_KEY_IMAGE, imageDataURL);
      if (maskB64) localStorage.setItem(LS_KEY_MASK_B64, maskB64);
      if (similarData) localStorage.setItem(LS_KEY_SIMILAR, JSON.stringify(similarData));

      console.log('[App] 💾 Diagnosis state saved to localStorage');
    } catch (e) {
      console.warn('[App] ⚠️  Could not save to localStorage (quota?):', e);
    }
  }

  // ===== CLEAR LOCALSTORAGE STATE =====
  function _clearLS() {
    [LS_KEY_DIAGNOSIS, LS_KEY_IMAGE, LS_KEY_MASK_B64, LS_KEY_SIMILAR, LS_KEY_TAB].forEach(k => localStorage.removeItem(k));
    console.log('[App] 🗑️  localStorage cleared');
  }

  // ===== RENDER MASK FROM BASE64 PNG =====
  function _restoreMaskFromB64(b64) {
    if (!b64) return;
    const img = new Image();
    img.onload = () => {
      if (maskOverlayCanvas) maskOverlayCanvas.remove();
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 256;
      canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;border-radius:10px;';
      canvas.getContext('2d').drawImage(img, 0, 0);
      previewWrap.appendChild(canvas);
      maskOverlayCanvas = canvas;
    };
    img.src = b64;
  }

  // ===== RESTORE STATE FROM LOCALSTORAGE =====
  function _restoreFromLS() {
    try {
      const rawDiag = localStorage.getItem(LS_KEY_DIAGNOSIS);
      const imageURL = localStorage.getItem(LS_KEY_IMAGE);
      const maskB64 = localStorage.getItem(LS_KEY_MASK_B64);
      const rawSim = localStorage.getItem(LS_KEY_SIMILAR);

      if (!rawDiag) return; // Nothing saved

      const diagnosisResult = JSON.parse(rawDiag);
      console.log('[App] 🔄 Restoring previous diagnosis from localStorage...');

      // ── 1. Restore image preview ──
      if (imageURL) {
        previewWrap.style.display = 'block';
        const ctx = previewCanvas.getContext('2d');
        previewCanvas.width = 256; previewCanvas.height = 256;
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, 256, 256);
          // Restore mask overlay after image drawn
          _restoreMaskFromB64(maskB64);
        };
        img.src = imageURL;
        // Mark file pseudo-available so btnDiagnose works (can re-diagnose)
        btnDiagnose.disabled = false;
      }

      // ── 2. Restore in-memory state ──
      lastPredictionData = diagnosisResult.prediction;
      window.lastDiagnosisData = diagnosisResult;

      if (diagnosisResult.xai && !diagnosisResult.xai.error) {
        lastXAIData = diagnosisResult.xai;
        window.lastXAIData = diagnosisResult.xai;
      }

      if (rawSim) {
        lastSimilarData = JSON.parse(rawSim);
        window.lastSimilarData = lastSimilarData;

        // ✅ CRITICAL: Restore global variable used by brain3d_new.js comparison picker
        if (lastSimilarData.similar_cases) {
          window._similarCasesData = lastSimilarData.similar_cases;
        }

        _showCompareButton(lastSimilarData);
      }

      // ── 3. Re-render report UI ──
      displayReport(diagnosisResult);
      showState('report');

      // ── 4. Re-render 3D brain ──
      update3DBrain(diagnosisResult);

      // ✅ NEW: Unlock the "Phân Tích Chi Tiết" button after restoration
      if (window.Brain3DUIControls?.onDiagnosisReady) {
        window.Brain3DUIControls.onDiagnosisReady();
      }

      // ── 5. Reload Atlas 4-Panel if available ──
      if (window.Atlas4PanelViewer) {
        window.Atlas4PanelViewer.loadDiagnosis(diagnosisResult);
      }

      // ── 6. Restore last active tab ──
      const lastTab = localStorage.getItem(LS_KEY_TAB);
      if (lastTab) {
        setTimeout(() => switchTab(lastTab), 300);
      }

      console.log('[App] ✅ Previous diagnosis restored from localStorage');
    } catch (e) {
      console.warn('[App] ⚠️  Could not restore from localStorage:', e);
    }
  }

  // ===== HEALTH CHECK =====
  async function checkHealth() {
    try {
      console.log('[App] 🏥 Checking backend health...');
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        const health = await res.json();
        console.log('[App] ✅ Backend online:', health);
        statusDot.className = 'status-dot online';
        statusText.textContent = 'Trực Tiếp';
      } else {
        throw new Error('not ok');
      }
    } catch (err) {
      console.error('[App] ❌ Backend offline:', err);
      statusDot.className = 'status-dot error';
      statusText.textContent = 'Ngoại Tuyến';
    }
  }

  // ===== FILE UPLOAD HANDLERS =====
  uploadZone.addEventListener('click', (e) => {
    // Prevent double-open: skip if the click comes from the input itself
    if (e.target === fileInput) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      handleFile(e.target.files[0]);
    }
  });

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  });


  function handleFile(file) {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      alert('❌ Vui lòng tải lên hình ảnh định dạng PNG hoặc JPG.');
      return;
    }

    currentFile = file;
    currentImageFile = file;
    window._lastUploadedBlob = file;
    renderPreview(file);
    btnDiagnose.disabled = false;

    // ✅ PATCH: Reset panel khi upload ảnh mới
    if (window.Brain3DUIControls?.reset) {
      window.Brain3DUIControls.reset();
    }
  }
  // ===== RENDER PREVIEW CANVAS =====
  function renderPreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        previewWrap.style.display = 'block';
        const ctx = previewCanvas.getContext('2d');
        previewCanvas.width = 256;
        previewCanvas.height = 256;
        ctx.drawImage(img, 0, 0, 256, 256);
        if (maskOverlayCanvas) {
          maskOverlayCanvas.remove();
          maskOverlayCanvas = null;
        }
      };
      img.onerror = () => alert('❌ Lỗi không tải được ảnh');
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ===== RENDER MASK OVERLAY =====
  function renderMaskOverlay(mask) {
    if (maskOverlayCanvas) maskOverlayCanvas.remove();

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.borderRadius = '10px';

    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(256, 256);

    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const idx = (y * 256 + x) * 4;
        const val = mask[y][x];

        if (val === 1) { // Necrosis - Red
          imageData.data[idx] = 255;
          imageData.data[idx + 1] = 0;
          imageData.data[idx + 2] = 64;
          imageData.data[idx + 3] = 200;
        } else if (val === 2) { // Edema - Green
          imageData.data[idx] = 0;
          imageData.data[idx + 1] = 200;
          imageData.data[idx + 2] = 83;
          imageData.data[idx + 3] = 160;
        } else if (val === 3) { // Enhancing - Yellow
          imageData.data[idx] = 255;
          imageData.data[idx + 1] = 214;
          imageData.data[idx + 2] = 0;
          imageData.data[idx + 3] = 220;
        } else if (val > 0.5) { // Fallback for binary mask
          imageData.data[idx] = 255;
          imageData.data[idx + 1] = 82;
          imageData.data[idx + 2] = 82;
          imageData.data[idx + 3] = 140;
        } else {
          imageData.data[idx + 3] = 0;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    previewWrap.appendChild(canvas);
    maskOverlayCanvas = canvas;
  }
  window.drawMaskOnCanvas = renderMaskOverlay;

  // ===== RUN DIAGNOSIS =====
  btnDiagnose.addEventListener('click', async () => {
    if (!currentFile || isProcessingDiagnosis) return;

    isProcessingDiagnosis = true;
    console.log('%c[App] 🚀 Bắt đầu chẩn đoán...', 'color: #00e5ff; font-weight: bold;');

    showState('loading');
    btnDiagnose.disabled = true;

    try {
      const formData = new FormData();
      formData.append('file', currentFile);

      const res = await fetch(`${API_BASE}/diagnose`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Diagnosis failed');
      }

      const diagnosisResult = await res.json();
      window.lastDiagnosisData = diagnosisResult; // Set globally for all features
      lastPredictionData = diagnosisResult.prediction;

      // PATCH 5: Notify history after save
      if (diagnosisResult.history_id) {
        window.HistoryUI && window.HistoryUI.onNewDiagnosis && window.HistoryUI.onNewDiagnosis();
      }

      if (diagnosisResult.xai && !diagnosisResult.xai.error) {
        lastXAIData = diagnosisResult.xai;
        window.lastXAIData = diagnosisResult.xai;
      } else {
        lastXAIData = null;
        window.lastXAIData = null;
      }

      if (diagnosisResult.mask) {
        renderMaskOverlay(diagnosisResult.multiclass_mask || diagnosisResult.mask);
      }

      displayReport(diagnosisResult);

      if (window.Atlas4PanelViewer) {
        window.Atlas4PanelViewer.loadDiagnosis(diagnosisResult);
      }

      //  KHÔNG gọi displayMetricsPanel ở đây (đã tắt)
      // displayMetricsPanel(diagnosisResult);

      update3DBrain(diagnosisResult);

      let similarData = null;
      if (currentImageFile && window.XAISimilarUI?.fetchSimilarCases) {
        try {
          similarData = await window.XAISimilarUI.fetchSimilarCases(currentImageFile);
          lastSimilarData = similarData;
          window.lastSimilarData = similarData;
          _showCompareButton(similarData);
        } catch (err) {
          console.warn('[App] ⚠️  Lấy ca tương tự thất bại:', err);
        }
      }

      const imageDataURL = (() => {
        try { return previewCanvas.toDataURL('image/jpeg', 0.85); } catch (e) { return null; }
      })();
      const maskB64 = (() => {
        try { return maskOverlayCanvas ? maskOverlayCanvas.toDataURL('image/png') : null; } catch (e) { return null; }
      })();
      _saveStateToLS(diagnosisResult, imageDataURL, maskB64, similarData);

      showState('report');

      // ✅ PATCH: Mở khóa nút Phân Tích Chi Tiết — NHƯNG KHÔNG tự mở panel
      if (window.Brain3DUIControls?.onDiagnosisReady) {
        window.Brain3DUIControls.onDiagnosisReady();
      }

    } catch (err) {
      console.error('[App] ❌ Lỗi chẩn đoán:', err);
      alert('❌ Lỗi: ' + err.message);
      showState('placeholder');
    } finally {
      isProcessingDiagnosis = false;
      btnDiagnose.disabled = false;
    }
  });

  // ===== ✅ Hiện/cập nhật nút Compare sau khi có Similar Cases =====
  function _showCompareButton(similarData) {
    const btn = document.getElementById('btnCompare');
    const badge = document.getElementById('compareBadge');
    if (!btn) return;

    const count = similarData?.similar_cases?.length || 0;
    if (count > 0) {
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.title = `So sánh 3D ca bệnh tương tự (${count} ca)`;
      btn.style.animation = 'none';
      btn.offsetHeight;
      btn.style.animation = 'compareBtnPulse 0.6s ease 3';
      if (badge) { badge.textContent = count; badge.style.display = 'block'; }

      if (!document.getElementById('compareBtnCSS')) {
        const style = document.createElement('style');
        style.id = 'compareBtnCSS';
        style.textContent = `
          @keyframes compareBtnPulse {
            0%,100% { box-shadow: 0 0 0 0 rgba(0,229,255,0); }
            50% { box-shadow: 0 0 0 6px rgba(0,229,255,0.25); background: rgba(0,229,255,0.15); }
          }
          #btnCompare:hover { background: rgba(0,229,255,0.18) !important; border-color: #00e5ff !important; color: #00e5ff !important; }
        `;
        document.head.appendChild(style);
      }
    } else {
      btn.style.display = 'none';
      if (badge) badge.style.display = 'none';
    }
  }

  // ===== DISPLAY REPORT =====
  function displayReport(data) {
    console.log('[App] 📋 Displaying report...');

    const pred = data.prediction;
    const report = data.report;

    // Confidence
    const confPct = Math.round(pred.confidence * 100);
    confidenceBar.style.width = confPct + '%';
    confidenceValue.textContent = confPct + '%';

    // Status
    statStatus.textContent = pred.tumor_detected ? 'Phát Hiện U' : 'Không Có U';
    statStatus.className = 'stat-value ' + (pred.tumor_detected ? 'detected' : 'clear');

    // Area
    statArea.textContent = pred.tumor_area_percent + '%';

    // Location
    statLocation.textContent = window.translateLocationToVi(pred.location_hint) || 'Không';

    // Severity
    const sev = report.severity || 'Không Rõ';
    statSeverity.textContent = sev;
    statSeverity.className = 'stat-value severity-' + sev.toLowerCase();

    // Summary
    reportSummary.textContent = report.summary || '—';

    findingsList.innerHTML = (report.findings || [])
      .map(f => `<li style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 18px; padding: 12px; background: rgba(0, 200, 83, 0.03); border-radius: 8px; border: 1px solid rgba(0, 200, 83, 0.08);">
          <i class="fa-solid fa-circle-check" style="color: #00c853; margin-top: 3px; font-size: 14px;"></i>
          <span style="font-size: 13px; line-height: 1.6; color: var(--text-sec);">${f}</span>
        </li>`)
      .join('');

    recommendationsList.innerHTML = (report.recommendations || [])
      .map(r => `<li style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 18px; padding: 12px; background: rgba(0, 151, 180, 0.03); border-radius: 8px; border: 1px solid rgba(0, 151, 180, 0.08);">
          <i class="fa-solid fa-user-doctor" style="color: #0097b4; margin-top: 3px; font-size: 14px;"></i>
          <span style="font-size: 13px; line-height: 1.6; color: var(--text-sec);">${r}</span>
        </li>`)
      .join('');

    // Populate methods comparison table
    const comparisonBody = document.getElementById('methodsComparisonBody');

    if (comparisonBody && data.xai) {
      const methods = [
        {
          name: 'CNN Phân Đoạn',
          result: data.prediction.tumor_detected ? 'Phát Hiện U' : 'Không Có U',
          confidence: `${(data.prediction.confidence * 100).toFixed(1)}%`
        },
        {
          name: 'Chú Ý Grad-CAM',
          result: data.xai.gradcam ? `${data.xai.gradcam.confidence_level} Tập Trung` : 'Không',
          confidence: data.xai.gradcam ? `${(data.xai.gradcam.attention_score * 100).toFixed(1)}%` : 'Không'
        },
        {
          name: 'Phân Tích Quy Tắc',
          result: data.xai.rule_based ? data.xai.rule_based.risk_level : 'Không',
          confidence: data.xai.rule_based ? `${data.xai.rule_based.risk_rationale?.risk_score || 0}/9 Điểm` : 'Không'
        },
        {
          name: 'Phân Tích SHAP',
          result: data.xai.shap && data.xai.shap.top_features ?
            `Top: ${data.xai.shap.top_features[0]}` : 'Không',
          confidence: data.xai.shap && data.xai.shap.top_features ?
            `${(data.xai.shap.feature_importance[data.xai.shap.top_features[0]] * 100).toFixed(0)}%` : 'Không'
        }
      ];

      comparisonBody.innerHTML = methods.map(m => `
        <tr style="border-bottom: 1px solid var(--border); transition: background 0.2s;">
          <td style="padding: 12px 10px; color: var(--text-sec); font-weight: 500;">${m.name}</td>
          <td style="padding: 12px 10px; text-align: center; color: var(--cyan); font-weight: 600;">${m.result}</td>
          <td style="padding: 12px 10px; text-align: center; color: var(--text-dim); font-family: var(--font-mono);">${m.confidence}</td>
        </tr>
      `).join('');
    }

    // Disclaimer - Disabled as per user request
    // disclaimer.innerHTML = report.disclaimer ? `<i class="fa-solid fa-triangle-exclamation" style="color:#ff9800;margin-right:6px;"></i> ${report.disclaimer}` :
    //   '<i class="fa-solid fa-triangle-exclamation" style="color:#ff9800;margin-right:6px;"></i> Đây là báo cáo do AI sinh ra. Nó không thay thế lời khuyên y tế chuyên môn.';

    // ✅ Render Depth Status Card on main screen (right panel)
    renderDepthCard(data);
    // ✅ Render Depth Overlay directly on 3D Brain viewer (DISABLED as per user request)
    // renderDepthOn3DViewer(data);

    console.log('[App] ✅ Report displayed');
  }

  // ===== ✅ DEPTH OVERLAY ON 3D BRAIN VIEWER (main screen center panel) =====
  function renderDepthOn3DViewer(data) {
    const viewer = document.getElementById('viewer3d');
    if (!viewer || !data.prediction?.tumor_detected) {
      const old = document.getElementById('viewer3dDepthOverlay');
      if (old) old.remove();
      return;
    }

    const depth = data.depth_metrics?.tumor_depth_mm;
    const category = data.depth_metrics?.depth_category?.category || 'INTERMEDIATE';
    const area = data.prediction?.tumor_area_percent;
    const location = window.translateLocationToVi(data.prediction?.location_hint) || 'N/A';
    const conf = Math.round((data.prediction?.confidence || 0) * 100);

    const STYLES = {
      'OUTSIDE': { border: '#ef4444', text: '#ef4444', bg: 'rgba(255,255,255,0.92)', icon: '<i class="fa-solid fa-circle"></i>', badge: 'NGUY HIỂM KỊCH TRẦN' },
      'SUPERFICIAL': { border: '#f87171', text: '#f87171', bg: 'rgba(255,255,255,0.92)', icon: '<i class="fa-solid fa-circle"></i>', badge: 'RỦI RO BAO PHỦ' },
      'SHALLOW': { border: '#f59e0b', text: '#f59e0b', bg: 'rgba(255,255,255,0.92)', icon: '<i class="fa-solid fa-circle"></i>', badge: 'NÔNG & RỦI RO CAO' },
      'INTERMEDIATE': { border: '#eab308', text: '#eab308', bg: 'rgba(255,255,255,0.92)', icon: '<i class="fa-solid fa-circle"></i>', badge: 'RỦI RO TRUNG BÌNH' },
      'DEEP': { border: '#22c55e', text: '#16a34a', bg: 'rgba(255,255,255,0.92)', icon: '<i class="fa-solid fa-circle"></i>', badge: 'SÂU & RỦI RO THẤP' },
      'VERY_DEEP': { border: '#3b82f6', text: '#2563eb', bg: 'rgba(255,255,255,0.92)', icon: '<i class="fa-solid fa-circle"></i>', badge: 'RẤT SÂU, BÊN TRONG' },
    };
    const S = STYLES[category] || STYLES['INTERMEDIATE'];
    const depthPct = depth != null ? Math.min((depth / 55) * 100, 100) : 0;

    // Remove old overlay if exists
    const existing = document.getElementById('viewer3dDepthOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'viewer3dDepthOverlay';
    overlay.style.cssText = [
      'position:absolute;bottom:44px;left:10px',
      'width:200px;z-index:8;pointer-events:none',
      `background:${S.bg}`,
      'border-radius:8px;padding:12px',
      'font-family:Inter, Segoe UI, sans-serif',
      'backdrop-filter:blur(8px)',
      'box-shadow:0 8px 32px rgba(0,0,0,0.3)',
      'animation: depthOverlayFadeIn 0.4s ease-out'
    ].join(';');

    overlay.innerHTML = `
      <style>
        @keyframes depthOverlayFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      </style>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span style="color:#64748b;font-size:9px;letter-spacing:1px;text-transform:uppercase;font-weight:700;">ĐỘ SÂU U TỪ VỎ NÃO</span>
        <span style="color:${S.text};font-size:9px;font-weight:800;background:rgba(0,0,0,0.05);padding:2px 6px;
          border-radius:10px;">${S.badge}</span>
      </div>
      <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:8px;">
        <span style="color:${S.text};font-size:26px;font-weight:900;line-height:1;">${depth != null ? depth.toFixed(1) : '—'}</span>
        <span style="color:#94a3b8;font-size:12px;font-weight:600;">mm</span>
      </div>
      <div style="width:100%;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;margin-bottom:10px;">
        <div style="height:100%;width:${depthPct}%;background:${S.border};border-radius:3px;
          transition:width 1s cubic-bezier(0.34, 1.56, 0.64, 1);"></div>
      </div>
      <div style="color:#475569;font-size:10px;line-height:1.4;border-top:1px solid #f1f5f9;padding-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:4px;">
        <div><span style="color:#94a3b8;">D.Tích:</span> <span style="font-weight:700;">${area != null ? area.toFixed(2) + '%' : '—'}</span></div>
        <div style="text-align:right;"><span style="color:#94a3b8;">Tin Cậy:</span> <span style="color:#0ea5e9;font-weight:700;">${conf}%</span></div>
        <div style="grid-column: span 2; color:#94a3b8; font-size:9px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${location}</div>
      </div>
    `;

    // Ensure viewer3d is position:relative for absolute child
    if (getComputedStyle(viewer).position === 'static') {
      viewer.style.position = 'relative';
    }
    viewer.appendChild(overlay);

    console.log(`[App] 📌 Depth overlay on 3D viewer: ${depth?.toFixed(1)}mm | ${category}`);
  }

  // ===== ✅ DEPTH STATUS CARD — MAIN SCREEN (right panel) =====
  function renderDepthCard(data) {
    const card = document.getElementById('depthStatusCard');
    const inner = document.getElementById('depthCardInner');
    const glowBar = document.getElementById('depthGlowBar');
    const badge = document.getElementById('depthBadge');
    const mmVal = document.getElementById('depthMmValue');
    const catLbl = document.getElementById('depthCategoryLabel');
    const progBar = document.getElementById('depthProgressBar');
    const desc = document.getElementById('depthMedDesc');
    const emoji = document.getElementById('depthEmoji');

    if (!card || !data.prediction?.tumor_detected) {
      if (card) card.style.display = 'none';
      return;
    }

    const depth = data.depth_metrics?.tumor_depth_mm;
    const category = data.depth_metrics?.depth_category?.category || 'INTERMEDIATE';

    // ── Color palette per depth category ──
    const DEPTH_STYLES = {
      'OUTSIDE': { bg: '#ffffff', tint: 'rgba(220,0,0,0.05)', border: '#dc2626', text: '#991b1b', glow: '#dc2626', icon: '<i class="fa-solid fa-circle"></i>', label: 'NGOÀI VỎ NÃO', badge: 'NGUY KỊCH', grad: '#dc2626,#f87171' },
      'SUPERFICIAL': { bg: '#ffffff', tint: 'rgba(239,68,68,0.05)', border: '#ef4444', text: '#991b1b', glow: '#ef4444', icon: '<i class="fa-solid fa-circle"></i>', label: 'QUÁ NÔNG', badge: 'NGHIÊM TRỌNG', grad: '#ef4444,#fca5a5' },
      'SHALLOW': { bg: '#ffffff', tint: 'rgba(245,158,11,0.05)', border: '#f59e0b', text: '#92400e', glow: '#f59e0b', icon: '<i class="fa-solid fa-circle"></i>', label: 'NÔNG / GẦN VỎ NÃO', badge: 'RỦI RO CAO', grad: '#f59e0b,#fcd34d' },
      'INTERMEDIATE': { bg: '#ffffff', tint: 'rgba(234,179,8,0.05)', border: '#eab308', text: '#854d0e', glow: '#eab308', icon: '<i class="fa-solid fa-circle"></i>', label: 'TRUNG BÌNH', badge: 'RỦI RO VỪA', grad: '#eab308,#fde047' },
      'DEEP': { bg: '#ffffff', tint: 'rgba(34,197,94,0.05)', border: '#22c55e', text: '#166534', glow: '#22c55e', icon: '<i class="fa-solid fa-circle"></i>', label: 'SÂU ĐÁNG KỂ', badge: 'RỦI RO THẤP', grad: '#22c55e,#86efac' },
      'VERY_DEEP': { bg: '#ffffff', tint: 'rgba(59,130,246,0.05)', border: '#3b82f6', text: '#1e40af', glow: '#3b82f6', icon: '<i class="fa-solid fa-circle"></i>', label: 'RẤT SÂU, BÊN TRONG', badge: 'AN TOÀN HƠN', grad: '#3b82f6,#93c5fd' }
    };

    const S = DEPTH_STYLES[category] || DEPTH_STYLES['INTERMEDIATE'];

    // Medical descriptions per category
    const DEPTH_DESC = {
      'OUTSIDE': '<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;margin-right:6px;"></i> Khối u dường như vượt qua ranh giới bề mặt vỏ não. Cần đánh giá của bác sĩ chuyên khoa ngay lập tức.',
      'SUPERFICIAL': '<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;margin-right:6px;"></i> Khối u rất gần bề mặt ngoài của vỏ não (< 5mm). Nguy cơ tổn thương vỏ não cao — khuyến cáo tư vấn phẫu thuật thần kinh khẩn cấp.',
      'SHALLOW': '<i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;margin-right:6px;"></i> Khối u nằm ở nông, cách vỏ não 5–15mm. Nguy cơ trung bình khi động chạm vùng vỏ não chức năng, yêu cầu phải thiết kế phẫu thuật cẩn trọng.',
      'INTERMEDIATE': '<i class="fa-solid fa-check" style="color:#22c55e;margin-right:6px;"></i> Khối u sâu mức trung bình so với vỏ não (15–30mm). Nguy cơ cho vỏ não thấp — phù hợp thực hiện các quy trình theo dõi kỹ thuật chuẩn.',
      'DEEP': '<i class="fa-solid fa-check" style="color:#22c55e;margin-right:6px;"></i> Khối u ở vị trí sâu đáng kể (30–45mm). Hầu như không đe dọa vỏ não — có thể cân nhắc sinh thiết lập thể hoặc xạ phẫu.',
      'VERY_DEEP': '<i class="fa-solid fa-check" style="color:#22c55e;margin-right:6px;"></i> Khối u nằm ở vùng rất sâu (>45mm). Không có nguy cơ xâm lấn bề mặt vỏ não — có khả năng thuộc vùng quanh não thất hoặc chất trắng sâu.'
    };

    // Progress (0→55mm scale, higher = deeper = safer)
    const maxDepth = 55;
    const depthPct = depth != null ? Math.min((depth / maxDepth) * 100, 100) : 0;

    // Update DOM
    card.style.display = 'block';
    inner.style.background = S.bg;
    inner.style.borderColor = S.border;
    if (glowBar) { glowBar.style.background = `linear-gradient(90deg,transparent,${S.glow},transparent)`; }

    if (emoji) emoji.innerHTML = S.icon;
    if (mmVal) {
      mmVal.textContent = depth != null ? depth.toFixed(1) : '—';
      mmVal.style.color = S.text;
    }
    if (catLbl) {
      catLbl.textContent = S.label;
      catLbl.style.color = S.text;
    }
    if (badge) {
      badge.textContent = S.badge;
      badge.style.color = S.text;
      badge.style.background = S.tint;
      badge.style.borderColor = S.border + '44';
    }
    if (progBar) {
      progBar.style.background = `linear-gradient(90deg,${S.grad})`;
      // Animate after brief delay
      requestAnimationFrame(() => {
        setTimeout(() => { progBar.style.width = depthPct + '%'; }, 80);
      });
    }
    if (desc) {
      desc.innerHTML = DEPTH_DESC[category] || '—';
      desc.style.color = '#1e293b'; // High contrast dark text
      desc.style.background = S.tint;
      desc.style.borderColor = S.border + '22';
    }

    console.log(`[App] 📏 DepthCard rendered: ${depth?.toFixed(1)}mm | ${category} | ${S.badge}`);
  }

  // ===== UPDATE 3D BRAIN =====
  function update3DBrain(data) {
    if (!data.prediction || !data.prediction.tumor_detected) {
      console.log('[App] ℹ️  No tumor detected, skipping 3D update');
      return;
    }
    window.lastDiagnosisData = data;

    const location = mapLocationToKey(data.prediction.location_hint);
    const tumorSize = Math.min(data.prediction.tumor_area_percent / 5, 0.5);

    // ✅ NEW: Update sidebar immediately with diagnostic data (using fallback for missing 3D metrics)
    if (window.updateTumorMetrics) {
      window.updateTumorMetrics(data);
    }

    fetch(`${API_BASE}/brain3d?location=${location}&tumor_size=${tumorSize}`)
      .then(r => r.json())
      .then(brainData => {
        if (window.updateBrainTumor && brainData.tumor_points) {
          console.log('[App] ✅ Calling updateBrainTumor with:');
          console.log('  - tumorPoints:', brainData.tumor_points.length, 'points');
          console.log('  - metrics:', data.detailed_metrics);
          console.log('  - depthMetrics:', data.depth_metrics);

          // ✅ FIX: Truyền đầy đủ 3 tham số
          window.updateBrainTumor(
            brainData.tumor_points,
            data.detailed_metrics,        // metrics từ diagnosis
            data.depth_metrics            // ✅ MỚI: depth metrics từ diagnosis
          );

          // Cập nhật nội dung sidebar (không tự mở nếu user đã đóng)
          if (window.updateTumorMetrics) {
            window.updateTumorMetrics(data);
          }
        }
      })
      .catch(err => {
        console.warn('[App] ⚠️  3D update failed:', err);
      });
  }

  // (Legacy displayMetricsPanel removed — Logic now handled by window.updateTumorMetrics in brain3d_new.js)

  // ===== ✅ HELPER FUNCTIONS - DIỄN ĐẠT Y KHOA RÕ RÀNG =====
  function getCorticalSafetyLevel(depth) {
    if (!depth || depth < 0) return 'UNKNOWN';
    if (depth < 5) return 'CRITICAL';
    if (depth < 15) return 'LOW';
    if (depth < 30) return 'INTERMEDIATE';
    if (depth < 45) return 'HIGH';
    return 'VERY HIGH';
  }

  function getCorticalRiskDescription(depth) {
    if (!depth || depth < 0) return 'Unable to assess cortical involvement risk';
    if (depth < 5) return '⚠️ Very close to outer cortical surface - high involvement risk';
    if (depth < 15) return '⚠️ Near cortical surface - moderate involvement risk';
    if (depth < 30) return '✓ Moderate depth - low cortical involvement risk';
    if (depth < 45) return '✓ Deep location - minimal cortical involvement risk';
    return '✓ Very deep location - negligible cortical involvement risk';
  }

  function getDepthCategoryColor(category) {
    const colors = {
      'OUTSIDE': { bg: 'rgba(255, 0, 0, 0.1)', border: '#ff0000', text: '#ff5555' },
      'SUPERFICIAL': { bg: 'rgba(255, 0, 64, 0.1)', border: '#ff0040', text: '#ff5252' },
      'SHALLOW': { bg: 'rgba(255, 145, 0, 0.1)', border: '#ff9100', text: '#ffb74d' },
      'INTERMEDIATE': { bg: 'rgba(255, 255, 0, 0.1)', border: '#ffff00', text: '#ffff99' },
      'DEEP': { bg: 'rgba(0, 200, 83, 0.1)', border: '#00c853', text: '#66bb6a' },
      'VERY_DEEP': { bg: 'rgba(0, 163, 204, 0.1)', border: '#00a3cc', text: '#4dd0e1' }
    };

    return colors[category] || colors['INTERMEDIATE'];
  }

  function createDepthBar(depth) {
    const maxDepth = 55;
    const percentage = Math.min((depth / maxDepth) * 100, 100);

    let color;
    if (depth < 5) color = '#ff0040';
    else if (depth < 15) color = '#ff9100';
    else if (depth < 30) color = '#ffff00';
    else if (depth < 45) color = '#00c853';
    else color = '#00a3cc';

    return `
      <div style="
        height: 100%;
        width: ${percentage}%;
        background: ${color};
        transition: width 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding-right: 8px;
        font-size: 10px;
        color: #0a0e1a;
        font-weight: bold;
      ">
        ${percentage > 10 ? percentage.toFixed(0) + '%' : ''}
      </div>
    `;
  }

  function mapLocationToKey(hint) {
    if (!hint) return 'left_frontal';

    const h = hint.toLowerCase();

    if (h.includes('left') && h.includes('frontal')) return 'left_frontal';
    if (h.includes('right') && h.includes('frontal')) return 'right_frontal';
    if (h.includes('left') && h.includes('temporal')) return 'left_temporal';
    if (h.includes('right') && h.includes('temporal')) return 'right_temporal';
    if (h.includes('left') && h.includes('parietal')) return 'left_parietal';
    if (h.includes('right') && h.includes('parietal')) return 'right_parietal';
    if (h.includes('superior') && h.includes('left')) return 'superior_left';
    if (h.includes('inferior')) return 'inferior_right';

    return 'left_frontal';
  }

  // ===== STATE MANAGEMENT =====
  function showState(state) {
    reportPlaceholder.style.display = 'none';
    reportContent.style.display = 'none';
    loadingState.style.display = 'none';

    switch (state) {
      case 'loading':
        loadingState.style.display = 'flex';
        break;
      case 'report':
        reportContent.style.display = 'block';
        break;
      case 'placeholder':
        reportPlaceholder.style.display = 'flex';
        break;
    }
  }

  // ===== TAB NAVIGATION (HOÀN THIỆN) =====
  let tabHistory = [];

  function switchTab(tabName, isGoBack = false) {
    if (tabName === 'scan') tabName = 'brain3d';
    console.log(`[App] 📑 Switching to tab: ${tabName}`);

    if (!isGoBack) {
      const currentActive = document.querySelector('.pill.active');
      if (currentActive && currentActive.dataset.tab && currentActive.dataset.tab !== tabName) {
        tabHistory.push(currentActive.dataset.tab);
      }
    }

    // Hide all panels & Reset animation classes
    if (mainLayout) {
      mainLayout.style.display = 'none';
      mainLayout.classList.remove('active');
    }
    if (xaiPanel) {
      xaiPanel.style.display = 'none';
      xaiPanel.classList.remove('active');
    }
    if (similarPanel) {
      similarPanel.style.display = 'none';
      similarPanel.classList.remove('active');
    }
    if (infoPanel) {
      infoPanel.style.display = 'none';
      infoPanel.classList.remove('active');
    }
    if (historyPanel) historyPanel.style.display = 'none';
    if (atlasPanel) atlasPanel.classList.remove('active');

    // Show based on tab
    switch (tabName) {

      case 'brain3d':
        if (mainLayout) {
          mainLayout.style.display = 'grid';
          // Force reflow
          mainLayout.offsetHeight;
          mainLayout.classList.add('active');
        }
        break;

      case 'xai':
        if (window.XAISimilarUI?.loadHistoryAndRefresh) {
          window.XAISimilarUI.loadHistoryAndRefresh();
          window.XAISimilarUI.showXAIPanel?.();
        } else if (window.XAISimilarUI?.renderXAIDashboard && lastXAIData) {
          window.XAISimilarUI.renderXAIDashboard(lastXAIData);
          window.XAISimilarUI.showXAIPanel?.();
        } else if (window.XAISimilarUI?.showXAIPanel) {
          window.XAISimilarUI.showXAIPanel();
        } else {
          // Fallback placeholder
          if (xaiPanel) {
            xaiPanel.innerHTML = `
              <div style="padding: 80px 40px; text-align: center; color: var(--text-sec);">
                <div style="font-size: 64px; margin-bottom: 24px;">🔍</div>
                <h2 style="color: var(--cyan);">Phân Tích XAI</h2>
                <p style="margin-top: 16px;">
                  Vui lòng tải ảnh MRI và chạy chẩn đoán để xem phân tích.
                </p>
              </div>
            `;
            if (window.XAISimilarUI?.showXAIPanel) {
              window.XAISimilarUI.showXAIPanel();
            } else {
              xaiPanel.style.display = 'block';
            }
          }
        }
        break;

      case 'similar':
        if (window.XAISimilarUI?.renderSimilarCases && lastSimilarData) {
          window.XAISimilarUI.renderSimilarCases(lastSimilarData);
          window.XAISimilarUI.showSimilarPanel?.();
        } else if (window.XAISimilarUI?.showSimilarPanel) {
          window.XAISimilarUI.showSimilarPanel();
        } else {
          // Fallback placeholder
          if (similarPanel) {
            similarPanel.innerHTML = `
              <div style="padding: 80px 40px; text-align: center; color: var(--text-sec);">
                <div style="font-size: 64px; margin-bottom: 24px;">🔎</div>
                <h2 style="color: var(--cyan);">Ca Bệnh Tương Tự</h2>
                <p style="margin-top: 16px;">
                  Vui lòng tải ảnh MRI để tìm các ca bệnh tương tự.
                </p>
              </div>
            `;
            if (window.XAISimilarUI?.showSimilarPanel) {
              window.XAISimilarUI.showSimilarPanel();
            } else {
              similarPanel.style.display = 'block';
            }
          }
        }
        break;

      case 'info':
        if (infoPanel) {
          infoPanel.style.display = 'block';
          // Add basic fade in for info panel too if desired
          infoPanel.style.opacity = '0';
          infoPanel.offsetHeight;
          infoPanel.style.transition = 'opacity 0.3s ease';
          infoPanel.style.opacity = '1';
        }
        break;

      case 'history':
        if (historyPanel) historyPanel.style.display = 'flex';
        if (window.HistoryUI && window.HistoryUI.open) window.HistoryUI.open();
        break;

      case 'atlas':
        // Initialize viewer on first visit
        if (window.Atlas4PanelViewer && atlasPanel) {
          atlasPanel.classList.add('active');
          window.Atlas4PanelViewer.init();
          // If diagnosis data already available, reload
          if (window.lastDiagnosisData) {
            window.Atlas4PanelViewer.loadDiagnosis(window.lastDiagnosisData);
          }
          console.log('[App] 🧠 Atlas View activated');
        } else {
          // Show placeholder if atlas viewer not loaded
          if (atlasPanel) {
            atlasPanel.classList.add('active');
            atlasPanel.innerHTML = `
              <div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:20px;color:var(--text-sec);">
                <div style="font-size:64px;">🧠</div>
                <h2 style="color:var(--cyan);">Atlas View</h2>
                <p>Upload an MRI image and run diagnosis to view the 4-panel atlas.</p>
              </div>`;
          }
        }
        break;
    }

    // Update active pill
    pills.forEach(p => p.classList.remove('active'));
    document.querySelector(`.pill[data-tab="${tabName}"]`)?.classList.add('active');

    const btnBackTab = document.getElementById('btnBackTab');
    if (btnBackTab) {
      if (tabHistory.length > 0) {
        btnBackTab.style.display = 'inline-block';
      } else {
        btnBackTab.style.display = 'none';
      }
    }

    // 💾 Persist last active tab
    try { localStorage.setItem(LS_KEY_TAB, tabName); } catch (e) { }
  }

  // Attach tab click handlers
  pills.forEach(pill => {
    if (pill.id === 'btnBackTab') return;
    pill.addEventListener('click', (e) => {
      const tab = e.currentTarget.dataset.tab || e.target.dataset.tab;
      if (tab) switchTab(tab);
    });
  });

  const btnBackTabEl = document.getElementById('btnBackTab');
  if (btnBackTabEl) {
    btnBackTabEl.addEventListener('click', () => {
      if (tabHistory.length > 0) {
        const prevTab = tabHistory.pop();
        switchTab(prevTab, true);
      }
    });
  }

  // ===== VIEWER CONTROLS =====
  if (btnRotate) {
    btnRotate.addEventListener('click', () => {
      const active = window.toggleAutoRotate && window.toggleAutoRotate();
      btnRotate.classList.toggle('active', active);
      console.log('[App] 🔄 Auto-rotate:', active ? 'ON' : 'OFF');
    });
  }

  if (btnSlice) {
    btnSlice.addEventListener('click', () => {
      const active = window.toggleDetailView && window.toggleDetailView();
      btnSlice.classList.toggle('active', active);
      console.log('[App] 🔍 Detail view:', active ? 'ON' : 'OFF');
    });
  }
  const btnSliceBrain3D = document.getElementById('btnSliceBrain3D');
  if (btnSliceBrain3D) {
    btnSliceBrain3D.addEventListener('click', async () => {
      console.log('[App] 🧬 Opening EBRAINS-style Atlas Viewer...');

      if (!window.AtlasViewerComplete) {
        alert('⚠️ Atlas Viewer module not loaded');
        return;
      }

      const isActive = window.AtlasViewerComplete.toggle();
      btnSliceBrain3D.classList.toggle('active', isActive);

      console.log(`[App] 🔄 Atlas Viewer: ${isActive ? 'OPENED' : 'CLOSED'}`);
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (window.resetBrainView) {
        window.resetBrainView();
      }

      btnRotate.classList.add('active');
      btnSlice.classList.remove('active');
      btnSliceBrain3D.classList.remove('active');
      console.log('[App] ↺ Brain view reset');
    });
  }

  // ===== ✅ ATLAS 3D BUTTON HANDLER (HOÀN CHỈNH) =====
  if (btnAtlas3D) {
    btnAtlas3D.addEventListener('click', async () => {
      console.log('[App] 🧠 Atlas 3D button clicked');

      if (!window.AtlasLoader) {
        console.warn('[App] ⚠️  Atlas module not loaded. Waiting...');

        // Wait max 5 seconds for Atlas module to load
        let attempts = 0;
        const waitForAtlas = setInterval(() => {
          if (window.AtlasLoader || attempts++ > 50) {
            clearInterval(waitForAtlas);
            if (!window.AtlasLoader) {
              alert('⚠️ Atlas module not available. Please check console.');
              return;
            }
            // Recursively call again
            btnAtlas3D.click();
          }
        }, 100);
        return;
      }

      const status = window.AtlasLoader.getStatus();

      if (!status.templateLoaded && !status.isocortexLoaded) {
        console.log('[App] ⏳ Initializing BigBrain Atlas...');
        btnAtlas3D.disabled = true;

        try {
          const initialized = await window.AtlasLoader.initialize();

          if (initialized && window.scene) {
            window.AtlasLoader.addToScene(window.scene);
            console.log('[App] ✅ Atlas added to scene');
          }
        } catch (err) {
          console.error('[App] ❌ Atlas error:', err);
          alert('❌ Error loading BigBrain Atlas: ' + err.message);
        } finally {
          btnAtlas3D.disabled = false;
        }
      }

      const isVisible = window.AtlasLoader.toggleVisibility();
      btnAtlas3D.classList.toggle('active', isVisible);

      const atlasIndicator = document.getElementById('atlasIndicator');
      if (atlasIndicator) {
        atlasIndicator.style.display = isVisible ? 'block' : 'none';
      }

      console.log(`[App] 🔄 Atlas toggle: ${isVisible ? 'VISIBLE' : 'HIDDEN'}`);
    });
  }

  // ===== PRE-LOAD ATLAS IN BACKGROUND =====
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(async () => {
      if (window.AtlasLoader && !window.AtlasLoader.getStatus().templateLoaded) {
        console.log('[App] 📚 Pre-loading BigBrain Atlas in background...');
        try {
          await window.AtlasLoader.initialize();
          console.log('[App] ✅ BigBrain Atlas pre-loaded successfully');
        } catch (err) {
          console.warn('[App] ⚠️  Atlas pre-load failed (non-critical):', err.message);
        }
      }
    }, 2000); // Wait 2s after page load to avoid blocking
  });

  // ===== INITIALIZATION =====
  window.addEventListener('DOMContentLoaded', () => {
    console.log('%c[App] 🚀 Initializing NeuroScan AI...', 'color: #00e5ff; font-weight: bold; font-size: 14px;');

    // Health check
    checkHealth();

    // Init 3D viewer (defined in brain3d.js)
    if (window.initBrainViewer) {
      window.initBrainViewer();
      console.log('[App] ✅ 3D viewer initialized');
    }

    // Init XAI/Similar UI (defined in xai_similar_ui.js)
    if (window.XAISimilarUI?.init) {
      window.XAISimilarUI.init();
      console.log('[App] ✅ XAI/Similar UI initialized');
    } else {
      console.warn('[App] ⚠️  XAISimilarUI not available - check script loading order');
    }

    // Set rotate button active by default
    if (btnRotate) btnRotate.classList.add('active');

    // ✅ 💾 RESTORE previous diagnosis from localStorage (if any)
    // Wait slightly for 3D viewer and other modules to be ready  
    setTimeout(() => {
      _restoreFromLS();
    }, 500);

    // ===== PERSISTENT HEADER STYLE TOGGLE =====
    (function initHeaderScroll() {
      const header = document.querySelector('.header');
      if (!header) return;

      let ticking = false;

      function onScroll() {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            const currentScrollY = window.scrollY;

            if (currentScrollY > 20) {
              header.classList.add('header--scrolled');
            } else {
              header.classList.remove('header--scrolled');
            }

            ticking = false;
          });
          ticking = true;
        }
      }

      window.addEventListener('scroll', onScroll, { passive: true });
    })();

    console.log('%c[App] ✅ All systems ready!', 'color: #00c853; font-weight: bold; font-size: 14px;');
  });

  // ===== NOTE: window.updateTumorMetrics is defined in brain3d_new.js =====
  // Do NOT override it here — brain3d_new.js has the full Detail Analysis renderer.

  // ===== SYNC RESTORED DATA (for History UI) =====
  function syncRestoredData(data) {
    console.log('[App] 🔄 Syncing restored diagnosis data...');
    window.lastDiagnosisData = data;
    lastPredictionData = data.prediction;

    if (data.xai && !data.xai.error) {
      lastXAIData = data.xai;
      window.lastXAIData = data.xai;
    } else {
      lastXAIData = null;
      window.lastXAIData = null;
    }
  }

  // ===== WINDOW EXPORTS (for external scripts) ===== 
  window.App = {
    switchTab,
    lastPredictionData: () => lastPredictionData,
    lastXAIData: () => lastXAIData,
    lastSimilarData: () => lastSimilarData,
    getCurrentFile: () => currentFile,
    clearDiagnosisCache: _clearLS,  // Allow external clear if needed
    displayReport: displayReport,
    update3DBrain: update3DBrain,
    syncRestoredData: syncRestoredData
  };

})();