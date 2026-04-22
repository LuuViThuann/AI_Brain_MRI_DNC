(function Brain3DUIControlsSimplified() {
  'use strict';

  // ===== QUẢN LÝ TRẠNG THÁI =====
  const state = {
    metricsVisible: false,
    diagnosisReady: false
  };

  // ===== KHỞI TẠO =====
  function init() {
    console.log('[UI Controls] 🔍 Khởi tạo nút Detail Analysis...');

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setup);
    } else {
      setup();
    }
  }

  function setup() {
    createMetricsToggle();
    setupEventListeners();
    // ✅ KHÔNG gọi loadSavedState nữa — panel luôn ẩn khi khởi động
    setupMetricsPanel();
    console.log('[UI Controls] ✅ Nút toggle sẵn sàng (panel ẩn mặc định)');
  }

  // ===== TẠO NÚT TOGGLE CHỈ SỐ =====
  function createMetricsToggle() {
    const viewerControls = document.querySelector('.viewer-controls');
    if (!viewerControls) {
      console.error('[UI Controls] ❌ Không tìm thấy viewer-controls');
      return;
    }

    if (document.getElementById('btnMetrics')) {
      console.log('[UI Controls] ⚠️ Nút đã tồn tại');
      return;
    }

    const btn = document.createElement('button');
    btn.id = 'btnMetrics';
    btn.className = 'ctrl-btn';
    btn.title = 'Hiển thị/Ẩn Phân Tích Chi Tiết (M)';
    // ✅ Bắt đầu ở trạng thái mờ/disabled cho đến khi có chẩn đoán
    btn.style.opacity = '0.4';
    btn.style.cursor = 'not-allowed';
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    `;

    btn.addEventListener('click', toggleMetricsPanel);

    const resetBtn = document.getElementById('btnReset');
    if (resetBtn) {
      viewerControls.insertBefore(btn, resetBtn);
    } else {
      viewerControls.appendChild(btn);
    }

    console.log('[UI Controls] ✅ Đã tạo nút Detail Analysis (disabled cho đến khi chẩn đoán)');
  }

  // ===== SHOW PANEL =====
  function _showPanel(panel) {
    panel.classList.add('metrics-open');
    // ✅ Gỡ bỏ display: none !important nếu có để class CSS có thể hoạt động
    panel.style.removeProperty('display');
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.animation = 'none';
    panel.offsetHeight; // Force reflow
    panel.style.animation = '';
    console.log('[UI Controls] 📊 Bảng chi tiết: HIỂN THỊ');
  }

  // ===== HIDE PANEL =====
  function _hidePanel(panel) {
    panel.style.animation = 'slideOutRight 0.25s ease-out forwards';
    setTimeout(() => {
      panel.classList.remove('metrics-open');
      // ✅ Ép buộc ẩn bằng !important để tránh mọi xung đột
      panel.style.setProperty('display', 'none', 'important');
      panel.style.animation = '';
    }, 250);
    console.log('[UI Controls] 📊 Bảng chi tiết: ẨN');
  }

  // ===== TOGGLE BẢNG CHỈ SỐ =====
  function toggleMetricsPanel() {
    // ✅ Chặn nếu chưa có kết quả chẩn đoán
    if (!state.diagnosisReady) {
      console.warn('[UI Controls] ⚠️ Chưa có kết quả chẩn đoán — không thể mở panel');
      _showNoDiagnosisHint();
      return;
    }

    state.metricsVisible = !state.metricsVisible;

    const panel = document.getElementById('tumorMetricsPanel');
    const btn = document.getElementById('btnMetrics');

    if (panel) {
      if (state.metricsVisible) {
        _showPanel(panel);
      } else {
        _hidePanel(panel);
      }
    }

    updateButtonState(btn, state.metricsVisible);
    // ✅ KHÔNG lưu localStorage nữa
  }

  // ===== HINT KHI CHƯA CÓ CHẨN ĐOÁN ===== 
  function _showNoDiagnosisHint() {
    const existing = document.getElementById('noDiagHint');
    if (existing) return;

    const hint = document.createElement('div');
    hint.id = 'noDiagHint';
    hint.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(10, 14, 26, 0.95);
      border: 1px solid #ff9100;
      border-radius: 10px;
      padding: 10px 20px;
      font-family: Consolas, monospace;
      font-size: 12px;
      color: #ffb74d;
      z-index: 9999;
      pointer-events: none;
      white-space: nowrap;
      box-shadow: 0 0 20px rgba(255, 145, 0, 0.3);
      animation: hintFadeIn 0.3s ease-out;
    `;
    hint.textContent = '⚠️ Hãy chạy chẩn đoán trước để xem phân tích chi tiết';
    document.body.appendChild(hint);

    setTimeout(() => {
      hint.style.opacity = '0';
      hint.style.transition = 'opacity 0.4s ease';
      setTimeout(() => hint.remove(), 400);
    }, 2200);
  }

  // ===== CẬP NHẬT TRẠNG THÁI NÚT =====
  function updateButtonState(btn, active) {
    if (!btn) return;

    if (active) {
      btn.classList.add('active');
      btn.style.background = 'rgba(0, 229, 255, 0.15)';
      btn.style.color = '#00e5ff';
      btn.style.borderColor = '#00e5ff';
    } else {
      btn.classList.remove('active');
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
    }
  }

  // ===== THIẾT LẬP BẢNG CHỈ SỐ =====
  // Trong Brain3DUIControlsSimplified — sửa setupMetricsPanel():
  function setupMetricsPanel() {
    const panel = document.getElementById('tumorMetricsPanel');
    if (!panel) {
      // Thử lại sau 1s nếu brain3d_new.js chưa kịp tạo panel
      setTimeout(setupMetricsPanel, 1000);
      return;
    }

    // ✅ Ép buộc ẩn hoàn toàn bằng !important — không cho phép override trừ khi có class metrics-open
    panel.style.setProperty('display', 'none', 'important');
    panel.classList.remove('metrics-open');
    panel.setAttribute('data-initialized', 'true');

    console.log('[UI Controls] ✅ Đã ép buộc ẩn bảng chi tiết khi khởi tạo');
  }

  // ===== THIẾT LẬP SỰ KIỆN =====
  function setupEventListeners() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'm' || e.key === 'M') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        toggleMetricsPanel();
      }
    });
    console.log('[UI Controls] ⌨️ Đã bật phím tắt: M');
  }

  // ===== ✅ GỌI KHI CHẨN ĐOÁN XONG — MỞ KHÓA NÚT =====
  function onDiagnosisReady() {
    state.diagnosisReady = true;
    state.metricsVisible = false; // Vẫn ẩn panel, chỉ mở khóa nút

    const btn = document.getElementById('btnMetrics');
    if (btn) {
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.title = 'Hiển thị Phân Tích Chi Tiết (M)';

      // ✅ Pulse animation để gợi ý user có thể click
      btn.style.animation = 'none';
      btn.offsetHeight;
      btn.style.animation = 'metricsBtnReady 0.5s ease 3';
    }

    // ✅ Tuyệt đối không tự động mở panel, chỉ kích hoạt nút
    const panel = document.getElementById('tumorMetricsPanel');
    if (panel) {
      panel.classList.remove('metrics-open');
      panel.style.setProperty('display', 'none', 'important');
    }

    console.log('[UI Controls] ✅ Chẩn đoán xong — nút Phân Tích Chi Tiết đã mở khóa');
  }

  // ===== XUẤT API CÔNG KHAI =====
  window.Brain3DUIControls = {
    toggleMetricsPanel,
    onDiagnosisReady,   // ✅ app.js gọi sau khi chẩn đoán xong
    isMetricsVisible: () => state.metricsVisible,
    isDiagnosisReady: () => state.diagnosisReady,

    showMetrics: () => {
      if (!state.diagnosisReady) return;
      state.metricsVisible = true;
      const panel = document.getElementById('tumorMetricsPanel');
      const btn = document.getElementById('btnMetrics');
      if (panel) _showPanel(panel);
      updateButtonState(btn, true);
    },

    hideMetrics: () => {
      state.metricsVisible = false;
      const panel = document.getElementById('tumorMetricsPanel');
      const btn = document.getElementById('btnMetrics');
      if (panel) _hidePanel(panel);
      updateButtonState(btn, false);
    },

    // ✅ Reset hoàn toàn khi upload ảnh mới
    reset: () => {
      state.metricsVisible = false;
      state.diagnosisReady = false;

      const panel = document.getElementById('tumorMetricsPanel');
      const btn = document.getElementById('btnMetrics');

      if (panel) {
        panel.style.display = 'none';
        panel.classList.remove('metrics-open');
      }
      if (btn) {
        btn.classList.remove('active');
        btn.style.background = '';
        btn.style.color = '';
        btn.style.borderColor = '';
        btn.style.opacity = '0.4';
        btn.style.cursor = 'not-allowed';
      }

      console.log('[UI Controls] 🔄 Reset — panel ẩn, nút disabled');
    }
  };

  window.toggleMetricsPanel = toggleMetricsPanel;

  // ===== TỰ ĐỘNG KHỞI ĐỘNG =====
  init();

})();

// ===== CSS =====
const style = document.createElement('style');
style.textContent = `
  /* Panel chỉ hiển thị khi có class metrics-open */
  #tumorMetricsPanel.metrics-open {
    display: flex !important;
    flex-direction: column !important;
  }

  /* metricsContent scroll */
  #metricsContent {
    flex: 1 1 0 !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    -webkit-overflow-scrolling: touch;
    min-height: 0 !important;
    overscroll-behavior: contain;
  }

  /* Slide in từ phải */
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(100%); }
    to   { opacity: 1; transform: translateX(0); }
  }

  /* Slide out sang phải */
  @keyframes slideOutRight {
    from { opacity: 1; transform: translateX(0); }
    to   { opacity: 0; transform: translateX(100%); }
  }

  /* Animation khi panel mở */
  #tumorMetricsPanel.metrics-open {
    animation: slideInRight 0.35s cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Pulse nút khi chẩn đoán xong */
  @keyframes metricsBtnReady {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0, 229, 255, 0); }
    50%       { box-shadow: 0 0 0 6px rgba(0, 229, 255, 0.30); background: rgba(0, 229, 255, 0.12); }
  }

  /* Hint fade in */
  @keyframes hintFadeIn {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  /* Nút active */
  #btnMetrics.active {
    background: rgba(0, 229, 255, 0.15) !important;
    color: #00e5ff !important;
    border-color: #00e5ff !important;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.3) !important;
  }

  #btnMetrics:not([style*="not-allowed"]):hover {
    background: rgba(0, 229, 255, 0.08);
    border-color: #00b8d0;
    color: #00b8d0;
  }

  /* Scrollbar */
  #tumorMetricsPanel::-webkit-scrollbar,
  #metricsContent::-webkit-scrollbar { width: 4px; }
  #tumorMetricsPanel::-webkit-scrollbar-track,
  #metricsContent::-webkit-scrollbar-track { background: rgba(30,58,82,0.3); border-radius: 4px; }
  #tumorMetricsPanel::-webkit-scrollbar-thumb,
  #metricsContent::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.35); border-radius: 4px; }
  #tumorMetricsPanel::-webkit-scrollbar-thumb:hover,
  #metricsContent::-webkit-scrollbar-thumb:hover { background: rgba(0,229,255,0.65); }

  @media (max-width: 768px) {
    #tumorMetricsPanel { max-width: calc(100vw - 80px) !important; font-size: 11px !important; }
    #btnMetrics { width: 36px !important; height: 36px !important; font-size: 18px !important; }
  }
`;
document.head.appendChild(style);

console.log('%c[UI Controls] 📊 Đã tải — Panel ẩn mặc định, mở khóa sau chẩn đoán', 'color: #00e5ff; font-weight: bold;');