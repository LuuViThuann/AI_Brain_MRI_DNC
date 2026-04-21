(function Brain3DUIControlsSimplified() {
  'use strict';

  // ===== QUẢN LÝ TRẠNG THÁI =====
  const state = {
    metricsVisible: false
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
    loadSavedState();
    setupMetricsPanel();
    console.log('[UI Controls] ✅ Nút toggle sẵn sàng');
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
    btn.title = 'Hiển thị/Ẩn Detail Analysis (M)';
    btn.innerHTML = '🔍';

    btn.addEventListener('click', toggleMetricsPanel);

    const resetBtn = document.getElementById('btnReset');
    if (resetBtn) {
      viewerControls.insertBefore(btn, resetBtn);
    } else {
      viewerControls.appendChild(btn);
    }

    console.log('[UI Controls] ✅ Đã tạo nút Detail Analysis');
  }

  // ===== SHOW PANEL (tách riêng để tái sử dụng) =====
  function _showPanel(panel) {
    // FIX: Xóa animation cũ trước, force reflow, rồi mới chạy lại
    // Tránh animation lần 2 ghi đè flex-direction
    panel.classList.add('metrics-open');
    panel.style.display = 'flex';         // Explicit flex instead of empty
    panel.style.flexDirection = 'column';   // Explicit column instead of empty
    panel.style.animation = 'none';   // Reset animation
    panel.offsetHeight;               // Force reflow (bắt buộc để animation chạy lại)
    panel.style.animation = '';       // Xóa override → CSS animation chạy
    console.log('[UI Controls] 📊 Bảng chỉ số HIỂN THỊ');
  }

  // ===== HIDE PANEL =====
  function _hidePanel(panel) {
    panel.style.animation = 'slideOutRight 0.3s ease-out forwards';
    setTimeout(() => {
      panel.classList.remove('metrics-open');
      panel.style.display = 'none';
      panel.style.animation = '';
    }, 300);
    console.log('[UI Controls] 📊 Bảng chỉ số ẨN');
  }

  // ===== TOGGLE BẢNG CHỈ SỐ =====
  function toggleMetricsPanel() {
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
    saveState();
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
  function setupMetricsPanel() {
    const panel = document.getElementById('tumorMetricsPanel');
    if (!panel) {
      console.warn('[UI Controls] ⚠️ Bảng chỉ số chưa được tạo (sẽ tạo sau)');
      return;
    }

    // Ẩn ban đầu — dùng inline style để chắc chắn class chưa can thiệp
    panel.style.display = 'none';
    panel.classList.remove('metrics-open');

    console.log('[UI Controls] ✅ Đã cấu hình bảng chỉ số (ẩn mặc định)');
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

  // ===== LƯU/TẢI TRẠNG THÁI =====
  function saveState() {
    try {
      localStorage.setItem('brain3d_metrics_visible', JSON.stringify(state.metricsVisible));
    } catch (e) {
      console.warn('[UI Controls] Không thể lưu trạng thái:', e);
    }
  }

  function loadSavedState() {
    try {
      const saved = localStorage.getItem('brain3d_metrics_visible');
      if (saved !== null) {
        state.metricsVisible = JSON.parse(saved);

        if (state.metricsVisible) {
          setTimeout(() => {
            const panel = document.getElementById('tumorMetricsPanel');
            const btn = document.getElementById('btnMetrics');
            if (panel) {
              _showPanel(panel);
              updateButtonState(btn, true);
            }
          }, 500);
        }

        console.log('[UI Controls] 💾 Đã khôi phục trạng thái:', state.metricsVisible ? 'HIỂN THỊ' : 'ẨN');
      }
    } catch (e) {
      console.warn('[UI Controls] Không thể tải trạng thái:', e);
    }
  }

  // ===== XUẤT API CÔNG KHAI =====
  window.Brain3DUIControls = {
    toggleMetricsPanel,
    isMetricsVisible: () => state.metricsVisible,
    showMetrics: () => {
      if (!state.metricsVisible) {
        state.metricsVisible = true;
        const panel = document.getElementById('tumorMetricsPanel');
        const btn = document.getElementById('btnMetrics');
        if (panel) _showPanel(panel);
        updateButtonState(btn, true);
        saveState();
      }
    },
    hideMetrics: () => {
      if (state.metricsVisible) {
        state.metricsVisible = false;
        const panel = document.getElementById('tumorMetricsPanel');
        const btn = document.getElementById('btnMetrics');
        if (panel) _hidePanel(panel);
        updateButtonState(btn, false);
        saveState();
      }
    }
  };

  window.toggleMetricsPanel = toggleMetricsPanel;

  // ===== TỰ ĐỘNG KHỞI ĐỘNG =====
  init();

})();

// ===== CSS ANIMATIONS =====
const style = document.createElement('style');
style.textContent = `
  /* ============================================================
     FIX: Dùng class .metrics-open thay vì inline style để
     tránh animation ghi đè flex-direction lần thứ 2+
  ============================================================ */
  #tumorMetricsPanel.metrics-open {
    display: flex !important;
    flex-direction: column !important;
  }

  /* FIX: metricsContent phải có flex:1 và overflow-y:auto
     min-height:0 là bắt buộc để flex child có thể scroll */
  #metricsContent {
    flex: 1 1 0 !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    -webkit-overflow-scrolling: touch;
    min-height: 0 !important;
    overscroll-behavior: contain;
  }

  /* Animation dùng forwards để giữ trạng thái cuối */
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
      /* KHÔNG set flex-direction ở đây — để class kiểm soát */
    }
  }

  @keyframes slideOutRight {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(100%);
    }
  }

  /* Áp animation CHỈ khi panel đang mở (class .metrics-open) */
  #tumorMetricsPanel.metrics-open {
    animation: slideInRight 0.3s ease-out;
    /* animation KHÔNG dùng forwards ở đây để
       tránh fill-mode ghi đè flex-direction sau khi chạy xong */
  }

  /* Trạng thái active của nút */
  #btnMetrics.active {
    background: rgba(0, 229, 255, 0.15) !important;
    color: #00e5ff !important;
    border-color: #00e5ff !important;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.3) !important;
  }

  #btnMetrics:hover {
    background: rgba(0, 229, 255, 0.08);
    border-color: #00b8d0;
    color: #00b8d0;
  }

  /* Scrollbar styling cho metrics panel */
  #tumorMetricsPanel::-webkit-scrollbar,
  #metricsContent::-webkit-scrollbar {
    width: 4px;
  }
  #tumorMetricsPanel::-webkit-scrollbar-track,
  #metricsContent::-webkit-scrollbar-track {
    background: rgba(30, 58, 82, 0.3);
    border-radius: 4px;
  }
  #tumorMetricsPanel::-webkit-scrollbar-thumb,
  #metricsContent::-webkit-scrollbar-thumb {
    background: rgba(0, 229, 255, 0.35);
    border-radius: 4px;
  }
  #tumorMetricsPanel::-webkit-scrollbar-thumb:hover,
  #metricsContent::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 229, 255, 0.65);
  }

  /* Responsive */
  @media (max-width: 768px) {
    #tumorMetricsPanel {
      max-width: calc(100vw - 80px) !important;
      font-size: 11px !important;
    }
    #btnMetrics {
      width: 36px !important;
      height: 36px !important;
      font-size: 18px !important;
    }
  }
`;
document.head.appendChild(style);

console.log('%c[UI Controls] 📊 Phiên bản FIX scroll đã tải', 'color: #00e5ff; font-weight: bold;');