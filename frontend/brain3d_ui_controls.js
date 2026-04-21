

(function Brain3DUIControlsSimplified() {
  'use strict';

  // ===== QUẢN LÝ TRẠNG THÁI =====
  const state = {
    metricsVisible: false
  };

  // ===== KHỞI TẠO =====
  function init() {
    console.log('[UI Controls] 📊 Khởi tạo nút Chỉ số khối u...');

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

    // Kiểm tra nút đã tồn tại chưa
    if (document.getElementById('btnMetrics')) {
      console.log('[UI Controls] ⚠️ Nút đã tồn tại');
      return;
    }

    // Tạo nút mới (cùng style với rotate/slice/reset)
    const btn = document.createElement('button');
    btn.id = 'btnMetrics';
    btn.className = 'ctrl-btn';
    btn.title = 'Hiển thị/Ẩn chỉ số khối u (M)';
    btn.innerHTML = '📊'; // Icon biểu đồ

    // Thêm sự kiện click
    btn.addEventListener('click', toggleMetricsPanel);

    // Chèn nút (trước nút reset nếu có, hoặc thêm cuối)
    const resetBtn = document.getElementById('btnReset');
    if (resetBtn) {
      viewerControls.insertBefore(btn, resetBtn);
    } else {
      viewerControls.appendChild(btn);
    }

    console.log('[UI Controls] ✅ Đã tạo nút Chỉ số khối u');
  }

  // ===== TOGGLE BẢNG CHỈ SỐ =====
  function toggleMetricsPanel() {
    state.metricsVisible = !state.metricsVisible;

    const panel = document.getElementById('tumorMetricsPanel');
    const btn = document.getElementById('btnMetrics');

    if (panel) {
      if (state.metricsVisible) {
        // Hiển thị panel
        panel.style.display = 'block';
        panel.style.animation = 'slideInRight 0.3s ease-out';

        console.log('[UI Controls] 📊 Bảng chỉ số HIỂN THỊ');
      } else {
        // Ẩn panel
        panel.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => {
          panel.style.display = 'none';
        }, 300);

        console.log('[UI Controls] 📊 Bảng chỉ số ẨN');
      }
    }

    // Cập nhật trạng thái nút
    updateButtonState(btn, state.metricsVisible);

    // Lưu trạng thái
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

    // Bắt đầu ở trạng thái ẩn
    panel.style.display = 'none';

    // Xóa nút đóng mặc định (dùng nút toggle thay thế)
    const existingClose = panel.querySelector('.close-btn');
    if (existingClose) existingClose.remove();

    console.log('[UI Controls] ✅ Đã cấu hình bảng chỉ số (ẩn mặc định)');
  }

  // ===== THIẾT LẬP SỰ KIỆN =====
  function setupEventListeners() {
    // Phím tắt: M
    document.addEventListener('keydown', (e) => {
      if (e.key === 'm' || e.key === 'M') {
        // Không kích hoạt khi đang gõ trong input/textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
          return;
        }

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

        // Áp dụng trạng thái đã lưu
        if (state.metricsVisible) {
          setTimeout(() => {
            const panel = document.getElementById('tumorMetricsPanel');
            const btn = document.getElementById('btnMetrics');

            if (panel) {
              panel.style.display = 'block';
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
      if (!state.metricsVisible) toggleMetricsPanel();
    },
    hideMetrics: () => {
      if (state.metricsVisible) toggleMetricsPanel();
    }
  };

  // Xuất hàm toggle toàn cục để tương thích
  window.toggleMetricsPanel = toggleMetricsPanel;

  // ===== TỰ ĐỘNG KHỞI ĐỘNG =====
  init();

})();

// ===== CSS ANIMATIONS =====
const style = document.createElement('style');
style.textContent = `
    /* Hiệu ứng slide cho bảng chỉ số */
    @keyframes slideInRight {
      from {
        opacity: 0;
        transform: translateX(100%);
      }
      to {
        opacity: 1;
        transform: translateX(0);
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
  
    /* Trạng thái active của nút */
    #btnMetrics.active {
      background: rgba(0, 229, 255, 0.15) !important;
      color: #00e5ff !important;
      border-color: #00e5ff !important;
      box-shadow: 0 0 12px rgba(0, 229, 255, 0.3) !important;
    }
  
    /* Hover effect cho nút */
    #btnMetrics:hover {
      background: rgba(0, 229, 255, 0.08);
      border-color: #00b8d0;
      color: #00b8d0;
    }
  
    /* Chuyển đổi mượt */
    #tumorMetricsPanel {
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
  
    /* Responsive cho mobile */
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

console.log('%c[UI Controls] 📊 Phiên bản đơn giản hóa đã tải', 'color: #00e5ff; font-weight: bold;');