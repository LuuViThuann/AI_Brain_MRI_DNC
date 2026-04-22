

(function Brain3DIntegrationPatchSimplified() {
    'use strict';
  
    console.log('[Patch] 🔧 Đang áp dụng tích hợp đơn giản hóa...');
  
    // ===== CHỜ BRAIN3D SẴN SÀNG =====
    function waitForBrain3D() {
      return new Promise((resolve) => {
        if (window.updateBrainTumor) {
          resolve();
        } else {
          const check = setInterval(() => {
            if (window.updateBrainTumor) {
              clearInterval(check);
              resolve();
            }
          }, 100);
          
          // Timeout sau 10 giây
          setTimeout(() => {
            clearInterval(check);
            console.warn('[Patch] ⚠️ Timeout chờ brain3d.js');
            resolve();
          }, 10000);
        }
      });
    }
  
    // (Metrics panel configuration now handled by brain3d_ui_controls.js)
  
    // ===== ẨN DEPTH VECTOR MẶC ĐỊNH =====
    function hideDepthVectorByDefault() {
      console.log('[Patch] 🔍 Đang ẩn depth vector label...');
      
      const checkLabel = setInterval(() => {
        const label = document.getElementById('depthVectorLabel');
        if (label) {
          clearInterval(checkLabel);
  
          // ẨN HOÀN TOÀN (không có nút toggle nữa)
          label.style.display = 'none';
          label.style.visibility = 'hidden';
          label.style.opacity = '0';
  
          console.log('[Patch] ✅ Đã ẩn depth vector label mặc định');
        }
      }, 500);
  
      // Dừng kiểm tra sau 10 giây
      setTimeout(() => {
        clearInterval(checkLabel);
      }, 10000);
    }
  
    // ===== ẨN TOOLTIP "TUMOR DEPTH" =====
    function hideDepthTooltips() {
      console.log('[Patch] 🏷️ Đang ẩn tooltips depth...');
      
      // Kiểm tra định kỳ và ẩn bất kỳ tooltip depth nào xuất hiện
      const checkTooltips = () => {
        // Tìm tất cả các element có text "TUMOR DEPTH"
        const elements = document.querySelectorAll('[id*="depth"], [class*="depth"]');
        
        elements.forEach(el => {
          const text = el.textContent || '';
          if (text.includes('TUMOR DEPTH') || text.includes('from cortex')) {
            el.style.display = 'none';
            el.style.visibility = 'hidden';
            el.style.opacity = '0';
          }
        });
      };
      
      // Chạy ngay lập tức
      checkTooltips();
      
      // Và kiểm tra định kỳ trong 30 giây đầu
      const interval = setInterval(checkTooltips, 1000);
      setTimeout(() => clearInterval(interval), 30000);
    }
  
    // ===== VÔ HIỆU HÓA DEPTH VISUALIZATION =====
    function disableDepthVisualization() {
      console.log('[Patch] 🚫 Đang vô hiệu hóa depth visualization...');
      
      // Override hàm updateDepthVector nếu tồn tại
      if (window.updateDepthVector) {
        const originalFunc = window.updateDepthVector;
        window.updateDepthVector = function(...args) {
          // Không làm gì cả - vô hiệu hóa hoàn toàn
          console.log('[Patch] 🚫 Đã chặn updateDepthVector');
          return;
        };
        console.log('[Patch] ✅ Đã override updateDepthVector');
      }
      
      // Ẩn canvas depth nếu có
      setTimeout(() => {
        const depthCanvas = document.getElementById('depthCanvas');
        if (depthCanvas) {
          depthCanvas.style.display = 'none';
          console.log('[Patch] ✅ Đã ẩn depth canvas');
        }
      }, 1000);
    }
  
    // ===== ÁP DỤNG TẤT CẢ PATCHES =====
    async function applyPatches() {
      console.log('[Patch] 🚀 Bắt đầu áp dụng patches...');
      
      await waitForBrain3D();
  
      hideDepthVectorByDefault();
      hideDepthTooltips();
      disableDepthVisualization();
  
      console.log('[Patch] ✅ Đã áp dụng tất cả patches đơn giản hóa');
    }
  
    // ===== TỰ ĐỘNG ÁP DỤNG =====
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyPatches);
    } else {
      applyPatches();
    }
  
    // ===== CSS BỔ SUNG ĐỂ ẨN DEPTH ELEMENTS =====
    const style = document.createElement('style');
    style.textContent = `
      /* Ẩn tất cả elements liên quan đến depth */
      #depthVectorLabel,
      #depthCanvas,
      [id*="depthVector"],
      [class*="depthVector"],
      .depth-vector-line {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }
      
      /* Ẩn tooltips chứa "TUMOR DEPTH" */
      [title*="TUMOR DEPTH"],
      [title*="depth"],
      [title*="cortex"] {
        display: none !important;
      }
      
      /* Đảm bảo metrics panel luôn ở trên */
      #tumorMetricsPanel {
        z-index: 1000 !important;
        pointer-events: auto !important;
      }
    `;
    document.head.appendChild(style);
  
  })();
  
  console.log('%c[Patch] 🔧 Tích hợp đơn giản hóa đã tải - DEPTH VECTOR ĐÃ TẮT', 'color: #00e5ff; font-weight: bold;');