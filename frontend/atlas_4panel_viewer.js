/**
 * atlas_4panel_viewer.js
 * EBRAINS-Style 4-Panel Multi-Planar MRI Viewer
 *
 * Layout (mirrors Siibra Explorer):
 *   ┌──────────────┬──────────────┐
 *   │   CORONAL    │   SAGITTAL   │
 *   │  (front Yaxis│  (side Xaxis)│
 *   ├──────────────┼──────────────┤
 *   │    AXIAL     │  3D BRAIN    │
 *   │  (top Zaxis) │  (Three.js)  │
 *   └──────────────┴──────────────┘
 *
 * Features:
 *  - Canvas rendering of axial / coronal / sagittal slices (base64 from backend)
 *  - Crosshair synchronised across 2D panels
 *  - Dynamic re-fetch of slices when crosshair moves
 *  - Tumor overlay colour-coded per view
 *  - Scale bar + orientation labels
 *  - Linked 3D brain panel reusing brain3d_new.js scene
 *  - Smooth zoom + pan per panel
 *  - Coordinate display in mm (MNI-style)
 */

(function () {

  /* ═══════════════════════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════════════════════ */
  const STATE = {
    initialized: false,
    diagnosisData: null,
    slices: null,
    crosshair: { cx: 0.5, cy: 0.5 },
    zoom: { axial: 1.1, coronal: 1.1, sagittal: 1.1 },
    pan: { axial: { x: 0, y: 0 }, coronal: { x: 0, y: 0 }, sagittal: { x: 0, y: 0 } },
    dragging: null,
    requesting: false,
    // ── 4-mode view ──
    viewMode: 'tumor',
    imageData: {
      axial: { tumor: null, clean: null, mask: null, segmentation: null },
      coronal: { tumor: null, clean: null, mask: null, segmentation: null },
      sagittal: { tumor: null, clean: null, mask: null, segmentation: null },
      heatmap: null,
    },
  };

  const API_BASE = 'http://127.0.0.1:8000/api';

  /* ═══════════════════════════════════════════════════════════════════════════
     BRAIN REGION MAP (simplified — for hover label simulation)
  ══════════════════════════════════════════════════════════════════════════ */
  const REGION_MAP = [
    { zone: [0.1, 0.1, 0.45, 0.45], name: 'Thùy Trán Trái', fn: 'Vận động / Xử lý' },
    { zone: [0.55, 0.1, 0.9, 0.45], name: 'Thùy Trán Phải', fn: 'Vận động / Xử lý' },
    { zone: [0.1, 0.55, 0.45, 0.9], name: 'Thùy Thái Dương Trái', fn: 'Ngôn ngữ / Trí nhớ' },
    { zone: [0.55, 0.55, 0.9, 0.9], name: 'Thùy Thái Dương Phải', fn: 'Ngôn ngữ / Trí nhớ' },
    { zone: [0.3, 0.3, 0.7, 0.7], name: 'Thùy Đỉnh', fn: 'Tích hợp cảm giác' },
    { zone: [0.35, 0.6, 0.65, 0.9], name: 'Thùy Chẩm', fn: 'Xử lý thị giác' },
    { zone: [0.4, 0.4, 0.6, 0.6], name: 'Thể Chai', fn: 'Bán cầu não liên kết' },
  ];

  function getRegionAt(cx, cy) {
    for (const r of REGION_MAP) {
      if (cx >= r.zone[0] && cx <= r.zone[2] && cy >= r.zone[1] && cy <= r.zone[3]) {
        return r;
      }
    }
    return { name: 'Chất trắng / Dịch não tủy', fn: 'Mô hỗ trợ' };
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     CREATE PANEL HTML
  ══════════════════════════════════════════════════════════════════════════ */
  function buildHTML() {
    return `
    <div class="atlas-toolbar">
      <div class="atlas-toolbar-left">
        <span class="atlas-logo">🧠 Giao Diện Atlas</span>
        <span class="atlas-badge">Kiểu EBRAINS</span>
      </div>
      <div class="atlas-toolbar-center" id="atlasCoordDisplay">
        <span class="coord-label">MNI</span>
        <span class="coord-val" id="atlasCoordX">—</span>
        <span class="coord-sep">,</span>
        <span class="coord-val" id="atlasCoordY">—</span>
        <span class="coord-sep">,</span>
        <span class="coord-val" id="atlasCoordZ">—</span>
        <span class="coord-unit">mm</span>
      </div>
      <!-- 4-Mode Switcher -->
      <div class="atlas-mode-switcher" id="atlasModeSwitcher">
        <button class="atlas-mode-btn" data-mode="gray"    title="Ảnh MRI gốc đen trắng"><span>Ảnh Xám</span></button>
        <button class="atlas-mode-btn" data-mode="tumor"   title="Phủ Khối U — vùng được phân đoạn"><span>Phủ U</span></button>
        <button class="atlas-mode-btn" data-mode="segmentation" title="Phân Màu U — hiển thị các vùng mô u"><span>Phân Màu</span></button>
        <button class="atlas-mode-btn" data-mode="heatmap" title="Bản Đồ Nhiệt AI — mức độ tập trung Grad-CAM"><span>Bản Đồ Nhiệt</span></button>
        <button class="atlas-mode-btn" data-mode="region"  title="Bản đồ màu các vùng não"><span>Vùng Não</span></button>
        <span class="atlas-mode-badge" id="atlasModeBadge">Phủ U</span>
      </div>

      <div class="atlas-toolbar-right">
        <button class="atlas-ctrl-btn" id="atlasBtnReset" title="Đặt lại tiêu điểm vào tâm khối u">⊕ Đặt Lại</button>
        <button class="atlas-ctrl-btn" id="atlasBtnZoomIn" title="Phóng to tất cả">＋</button>
        <button class="atlas-ctrl-btn" id="atlasBtnZoomOut" title="Thu nhỏ tất cả">－</button>
        <button class="atlas-ctrl-btn" id="atlasBtnFullscreen" title="Toàn màn hình">⤢</button>
      </div>
    </div>

    <div class="atlas-grid" id="atlasGrid">

      <!-- CORONAL (top-left) -->
      <div class="atlas-panel" id="atlasPanelCoronal" data-view="coronal">
        <div class="atlas-panel-header">
          <span class="atlas-panel-title">
            <span class="atlas-dot coronal"></span>Mặt Phẳng Trán (Coronal)
          </span>
          <span class="atlas-panel-axis">Y-axis</span>
        </div>
        <div class="atlas-canvas-wrap">
          <canvas id="atlasCanvasCoronal"></canvas>
          <div class="atlas-crosshair-h" id="crossH-coronal"></div>
          <div class="atlas-crosshair-v" id="crossV-coronal"></div>
          <div class="atlas-panel-overlay" id="overlayCoronal">
            <div class="atlas-no-data">Tải lên MRI &amp; chạy chẩn đoán<br>để kích hoạt góc nhìn này</div>
          </div>
        </div>
      </div>

      <!-- SAGITTAL (top-right) -->
      <div class="atlas-panel" id="atlasPanelSagittal" data-view="sagittal">
        <div class="atlas-panel-header">
          <span class="atlas-panel-title">
            <span class="atlas-dot sagittal"></span>Mặt Phẳng Dọc (Sagittal)
          </span>
          <span class="atlas-panel-axis">X-axis</span>
        </div>
        <div class="atlas-canvas-wrap">
          <canvas id="atlasCanvasSagittal"></canvas>
          <div class="atlas-crosshair-h" id="crossH-sagittal"></div>
          <div class="atlas-crosshair-v" id="crossV-sagittal"></div>
          <div class="atlas-panel-overlay" id="overlaySagittal">
            <div class="atlas-no-data">Tải lên MRI &amp; chạy chẩn đoán<br>để kích hoạt góc nhìn này</div>
          </div>
        </div>
      </div>

      <!-- AXIAL (bottom-left) -->
      <div class="atlas-panel" id="atlasPanelAxial" data-view="axial">
        <div class="atlas-panel-header">
          <span class="atlas-panel-title">
            <span class="atlas-dot axial"></span>Mặt Phẳng Ngang (Axial)
          </span>
          <span class="atlas-panel-axis">Z-axis</span>
        </div>
        <div class="atlas-canvas-wrap">
          <canvas id="atlasCanvasAxial"></canvas>
          <div class="atlas-crosshair-h" id="crossH-axial"></div>
          <div class="atlas-crosshair-v" id="crossV-axial"></div>
          <div class="atlas-panel-overlay" id="overlayAxial">
            <div class="atlas-no-data">Tải lên MRI &amp; chạy chẩn đoán<br>để kích hoạt góc nhìn này</div>
          </div>
        </div>
      </div>

      <!-- 3D BRAIN (bottom-right) -->
      <div class="atlas-panel" id="atlasPanelBrain3D" data-view="brain3d">
        <div class="atlas-panel-header">
          <span class="atlas-panel-title">
            <span class="atlas-dot brain3d"></span>Não 3D
          </span>
          <div class="atlas-3d-ctrls">
            <button class="atlas-ctrl-btn-sm" id="atlas3DRotate" title="Tự động xoay">⟳</button>
            <button class="atlas-ctrl-btn-sm" id="atlas3DReset"  title="Đặt lại">↺</button>
            <select class="atlas-3d-mode-select" id="atlas3DMode" title="Chế độ xem">
              <option value="transparent">Bình Thường</option>
              <option value="solid">Đặc</option>
              <option value="wireframe">Khung Dây</option>
              <option value="depth">Độ Sâu</option>
            </select>
          </div>
        </div>
        <div class="atlas-canvas-wrap" id="atlas3DWrap">
          <canvas id="atlasCanvas3D"></canvas>
          <div class="atlas-slice-planes" id="atlasSlicePlanes"></div>
          <div class="atlas-panel-overlay" id="overlay3D">
            <div class="atlas-no-data">Tải lên MRI &amp; chạy chẩn đoán<br>để kích hoạt góc nhìn 3D này</div>
          </div>
          <!-- Depth Legend Overlay -->
          <div class="atlas-depth-legend" id="atlasDepthLegend">
            <div class="atlas-depth-legend-title">Độ Sâu Khối U</div>
            <div class="atlas-depth-gradient-bar"></div>
            <div class="atlas-depth-ticks">
              <span>Bề Mặt</span><span>15mm</span><span>30mm</span><span>45mm+</span>
            </div>
            <div class="atlas-depth-value" id="atlasDepthValue">—</div>
          </div>
          <!-- NEW: Segmentation Legend Overlay -->
          <div class="atlas-seg-legend" id="atlasSegLegend" style="display:none;">
            <div class="atlas-seg-legend-title">Phân Vùng Khối U</div>
            <div class="atlas-seg-item"><span class="dot ncr"></span><span>Hoại Tử (NCR)</span></div>
            <div class="atlas-seg-item"><span class="dot et"></span><span>Tăng Cường (ET)</span></div>
            <div class="atlas-seg-item"><span class="dot ed"></span><span>Phù Nề (ED)</span></div>
          </div>
        </div>
      </div>

    </div><!-- /atlas-grid -->

    <!-- Hover tooltip -->
    <div class="atlas-tooltip" id="atlasTooltip" style="display:none;">
      <div class="atlas-tooltip-region" id="atlasTooltipRegion">—</div>
      <div class="atlas-tooltip-fn"     id="atlasTooltipFn">—</div>
    </div>

    <!-- Bottom info bar -->
    <div class="atlas-infobar">
      <span id="atlasInfoRegion">Vùng: —</span>
      <span class="atlas-infobar-sep">|</span>
      <span id="atlasInfoFunction">Chức Năng: —</span>
      <span class="atlas-infobar-sep">|</span>
      <span id="atlasInfoTumor">Khối U: —</span>
      <span class="atlas-infobar-sep">|</span>
      <span style="color:#5a7a99;">NeuroScan AI · Giao Diện Atlas</span>
    </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER SLICE IMAGE TO CANVAS
  ══════════════════════════════════════════════════════════════════════════ */
  function renderSliceToCanvas(canvasId, b64Image, zoom, pan) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const W = wrap.clientWidth || 400;
    const H = wrap.clientHeight || 400;
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, W, H);

    if (!b64Image) {
      ctx.fillStyle = '#1a2a3a';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const z = zoom || 1;
      const scaledW = W * z;
      const scaledH = H * z;
      const offsetX = (W - scaledW) / 2 + (pan ? pan.x : 0);
      const offsetY = (H - scaledH) / 2 + (pan ? pan.y : 0);
      ctx.drawImage(img, offsetX, offsetY, scaledW, scaledH);
    };
    img.src = b64Image;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     UPDATE ALL SLICE CANVASES
  ══════════════════════════════════════════════════════════════════════════ */
  function renderAllSlices() {
    // Mode-aware rendering when imageData is populated
    if (STATE.imageData.axial?.tumor || STATE.imageData.axial?.clean) {
      renderAllSlicesForMode();
      return;
    }
    if (!STATE.slices) {
      showPlaceholders();
      return;
    }
    renderSliceToCanvas('atlasCanvasCoronal', STATE.slices.coronal?.image_b64, STATE.zoom.coronal, STATE.pan.coronal);
    renderSliceToCanvas('atlasCanvasSagittal', STATE.slices.sagittal?.image_b64, STATE.zoom.sagittal, STATE.pan.sagittal);
    renderSliceToCanvas('atlasCanvasAxial', STATE.slices.axial?.image_b64, STATE.zoom.axial, STATE.pan.axial);
    updateCrosshairs();
    updateCoordinateDisplay();
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     CROSSHAIR UPDATE
  ══════════════════════════════════════════════════════════════════════════ */
  function updateCrosshairs() {
    const { cx, cy } = STATE.crosshair;
    ['coronal', 'sagittal', 'axial'].forEach(view => {
      const hEl = document.getElementById(`crossH-${view}`);
      const vEl = document.getElementById(`crossV-${view}`);
      if (hEl) hEl.style.top = `${cy * 100}%`;
      if (vEl) vEl.style.left = `${cx * 100}%`;
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     COORDINATE DISPLAY  (simulated MNI: 0-255 voxel → −90 to +90 mm)
  ══════════════════════════════════════════════════════════════════════════ */
  function updateCoordinateDisplay() {
    const { cx, cy } = STATE.crosshair;
    const xMNI = ((cx - 0.5) * 180).toFixed(1);
    const yMNI = ((cy - 0.5) * 220).toFixed(1);
    const zMNI = (0).toFixed(1);   // single slice — Z fixed

    const elX = document.getElementById('atlasCoordX');
    const elY = document.getElementById('atlasCoordY');
    const elZ = document.getElementById('atlasCoordZ');
    if (elX) elX.textContent = xMNI;
    if (elY) elY.textContent = yMNI;
    if (elZ) elZ.textContent = zMNI;

    // region info bar
    const region = getRegionAt(cx, cy);
    const elR = document.getElementById('atlasInfoRegion');
    const elF = document.getElementById('atlasInfoFunction');
    if (elR) elR.textContent = `Vùng: ${region.name}`;
    if (elF) elF.textContent = `Chức Năng: ${region.fn}`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     4-MODE VIEW SYSTEM
  ══════════════════════════════════════════════════════════════════════════ */

  const MODE_LABELS = {
    gray: 'Ảnh MRI Xám',
    tumor: 'Phủ Khối U',
    segmentation: 'Phân Màu Khối U',
    heatmap: 'Bản Đồ Nhiệt AI',
    region: 'Bản Đồ Vùng Não',
  };

  // Brain region colour zones (normalized 0-1)
  const REGION_ZONES = [
    { zone: [0.05, 0.05, 0.48, 0.48], color: 'rgba(68,136,255,0.48)' },
    { zone: [0.52, 0.05, 0.95, 0.48], color: 'rgba(68,170,255,0.48)' },
    { zone: [0.05, 0.52, 0.48, 0.95], color: 'rgba(255,136,68,0.48)' },
    { zone: [0.52, 0.52, 0.95, 0.95], color: 'rgba(255,170,68,0.48)' },
    { zone: [0.25, 0.25, 0.75, 0.72], color: 'rgba(68,255,136,0.40)' },
    { zone: [0.30, 0.60, 0.70, 0.95], color: 'rgba(200,68,255,0.46)' },
    { zone: [0.38, 0.38, 0.62, 0.62], color: 'rgba(255,68,170,0.44)' },
  ];

  function updateModeButtons() {
    document.querySelectorAll('.atlas-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === STATE.viewMode);
    });
    const badge = document.getElementById('atlasModeBadge');
    if (badge) badge.textContent = MODE_LABELS[STATE.viewMode] || STATE.viewMode;
  }

  function switchViewMode(mode) {
    if (!MODE_LABELS[mode]) return;
    STATE.viewMode = mode;
    updateModeButtons();
    renderAllSlicesForMode();

    // Toggle legend visibility
    const segLegend = document.getElementById('atlasSegLegend');
    if (segLegend) segLegend.style.display = (mode === 'segmentation') ? 'block' : 'none';

    console.log('[Atlas4Panel] 🎨 Mode:', mode);
  }

  function renderAllSlicesForMode() {
    drawModeOnCanvas('atlasCanvasCoronal', 'coronal', STATE.viewMode);
    drawModeOnCanvas('atlasCanvasSagittal', 'sagittal', STATE.viewMode);
    drawModeOnCanvas('atlasCanvasAxial', 'axial', STATE.viewMode);
    updateCrosshairs();
    updateCoordinateDisplay();
  }

  function _loadImg(src) {
    return new Promise(resolve => {
      if (!src) { resolve(null); return; }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function drawModeOnCanvas(canvasId, view, mode) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const W = wrap.clientWidth || 400;
    const H = wrap.clientHeight || 400;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, W, H);

    const vd = STATE.imageData[view];
    if (!vd || (!vd.tumor && !vd.clean)) return;

    const zoom = STATE.zoom[view] || 1;
    const pan = STATE.pan[view] || { x: 0, y: 0 };
    const sw = W * zoom;
    const sh = H * zoom;
    const ox = (W - sw) / 2 + pan.x;
    const oy = (H - sh) / 2 + pan.y;

    async function paint(src, alpha, composite, filter) {
      const img = await _loadImg(src);
      if (!img) return;
      ctx.save();
      if (composite) ctx.globalCompositeOperation = composite;
      if (alpha !== undefined) ctx.globalAlpha = alpha;
      if (filter) ctx.filter = filter;
      ctx.drawImage(img, ox, oy, sw, sh);
      ctx.filter = 'none';
      ctx.restore();
    }

    switch (mode) {
      case 'gray':
        await paint(vd.clean || vd.tumor, undefined, undefined, 'contrast(1.22) brightness(1.12)');
        break;
      case 'tumor':
        await paint(vd.tumor || vd.clean, undefined, undefined, 'contrast(1.18) brightness(1.08)');
        break;
      case 'segmentation':
        await paint(vd.clean || vd.tumor, undefined, undefined, 'contrast(1.12) brightness(1.05)');
        if (vd.segmentation) await paint(vd.segmentation, 0.85);
        break;
      case 'heatmap':
        await paint(vd.clean || vd.tumor, undefined, undefined, 'contrast(1.1) brightness(1.04)');
        if (STATE.imageData.heatmap) await paint(STATE.imageData.heatmap, 0.72, 'screen');
        if (vd.mask) await paint(vd.mask, 0.45);
        break;
      case 'region': {
        await paint(vd.clean || vd.tumor, undefined, undefined, 'contrast(1.1) brightness(1.03)');
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        for (const z of REGION_ZONES) {
          const [x0n, y0n, x1n, y1n] = z.zone;
          ctx.fillStyle = z.color;
          ctx.fillRect(ox + x0n * sw, oy + y0n * sh, (x1n - x0n) * sw, (y1n - y0n) * sh);
        }
        ctx.restore();
        if (vd.mask) await paint(vd.mask, 0.85);
        break;
      }
      default:
        await paint(vd.tumor || vd.clean);
    }

    // ── Rich Annotations overlay ──
    _drawSliceAnnotations(ctx, W, H, view, mode, zoom);
  }

  /**
   * Draw orientation labels, scale bar, depth badge, and tumor info
   * directly onto the 2D slice canvas (called after image is painted).
   */
  function _drawSliceAnnotations(ctx, W, H, view, mode, zoom) {
    // ── 1. Orientation labels (colored, high-contrast badges) ──
    const ORIENT = {
      axial: { top: 'A', bottom: 'P', left: 'R', right: 'L', topC: '#00e5ff', bottomC: '#ff9100', leftC: '#44ff88', rightC: '#cc88ff' },
      coronal: { top: 'S', bottom: 'I', left: 'R', right: 'L', topC: '#00e5ff', bottomC: '#ff5252', leftC: '#44ff88', rightC: '#cc88ff' },
      sagittal: { top: 'S', bottom: 'I', left: 'A', right: 'P', topC: '#00e5ff', bottomC: '#ff5252', leftC: '#ffcc44', rightC: '#ff6688' },
    }[view] || { top: '↑', bottom: '↓', left: '←', right: '→', topC: '#fff', bottomC: '#fff', leftC: '#fff', rightC: '#fff' };

    const fs = Math.max(10, Math.round(W / 30));
    const pad = 5;
    const bpad = 4;

    function drawOrientBadge(text, x, y, color, align, baseline) {
      ctx.save();
      ctx.font = `bold ${fs}px 'Consolas', monospace`;
      ctx.textAlign = align;
      ctx.textBaseline = baseline;
      const tw = ctx.measureText(text).width;
      const bx = align === 'right' ? x - tw - bpad : (align === 'center' ? x - tw / 2 - bpad : x - bpad);
      const by = baseline === 'bottom' ? y - fs - bpad : y - bpad;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath();
      ctx.roundRect?.(bx, by, tw + bpad * 2, fs + bpad * 2, 3) ||
        ctx.rect(bx, by, tw + bpad * 2, fs + bpad * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    drawOrientBadge(ORIENT.top, W / 2, pad + fs, ORIENT.topC, 'center', 'top');
    drawOrientBadge(ORIENT.bottom, W / 2, H - pad, ORIENT.bottomC, 'center', 'bottom');
    drawOrientBadge(ORIENT.left, pad + 2, H / 2, ORIENT.leftC, 'left', 'middle');
    drawOrientBadge(ORIENT.right, W - pad - 2, H / 2, ORIENT.rightC, 'right', 'middle');

    // ── 2. Scale bar (bottom-right) ──
    // 1mm ≈ (actual FOV / W) pixels. Approximate: brain ~18cm, image 256px → 1mm ≈ 256/180 px
    // With zoom applied: pixPerMm = (W * zoom) / 180
    const pixPerMm = (W * (zoom || 1)) / 180;
    const barMm = 10;  // show 10mm bar
    const barPx = pixPerMm * barMm;
    const bx = W - 14 - barPx;
    const by = H - 14;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(bx + barPx, by);
    ctx.moveTo(bx, by - 5); ctx.lineTo(bx, by + 5);
    ctx.moveTo(bx + barPx, by - 5); ctx.lineTo(bx + barPx, by + 5);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 9px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${barMm} mm`, bx + barPx / 2, by - 7);
    ctx.restore();

    // ── 3. Tumor depth + info badge (top-right corner) ──
    const dd = STATE.diagnosisData;
    if (dd?.prediction?.tumor_detected) {
      const depth = dd.depth_metrics?.tumor_depth_mm;
      const cat = dd.depth_metrics?.depth_category?.category || 'INTERMEDIATE';
      const area = dd.prediction?.tumor_area_percent;
      const conf = Math.round((dd.prediction?.confidence || 0) * 100);
      let loc = dd.prediction?.location_hint || '';
      if (window.translateLocationToVi) loc = window.translateLocationToVi(loc);

      const DCOL = {
        OUTSIDE: '#ff0000', SUPERFICIAL: '#ff5252', SHALLOW: '#ffb74d',
        INTERMEDIATE: '#ffe57a', DEEP: '#66bb6a', VERY_DEEP: '#4dd0e1'
      };
      const dcol = DCOL[cat] || '#ffe57a';

      const lines = [
        { label: 'Sâu', val: depth != null ? depth.toFixed(1) + ' mm' : 'N/A', valCol: dcol },
        { label: 'D/Tích', val: area != null ? area.toFixed(2) + '%' : 'N/A', valCol: '#ff9100' },
        { label: 'T/cậy', val: conf + '%', valCol: '#00e5ff' },
      ];

      const lineH = 14, bw = 135, bh = lines.length * lineH + 22;
      const bx2 = W - bw - 8, by2 = 44;

      ctx.save();
      ctx.fillStyle = 'rgba(5,8,20,0.82)';
      ctx.strokeStyle = dcol + '66';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect?.(bx2, by2, bw, bh, 5) || ctx.rect(bx2, by2, bw, bh);
      ctx.fill(); ctx.stroke();

      // Header
      ctx.fillStyle = dcol;
      ctx.font = `bold 9px monospace`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('PHÂN TÍCH KHỐI U', bx2 + 7, by2 + 6);

      // Lines
      lines.forEach((l, i) => {
        const ly = by2 + 19 + i * lineH;
        ctx.fillStyle = '#5a7a99';
        ctx.font = `9px monospace`;
        ctx.fillText(l.label + ':', bx2 + 7, ly);
        ctx.fillStyle = l.valCol;
        ctx.font = `bold 9px monospace`;
        ctx.textAlign = 'right';
        ctx.fillText(l.val, bx2 + bw - 7, ly);
        ctx.textAlign = 'left';
      });

      // Depth category badge at bottom if enough space
      if (loc && bw > 120) {
        ctx.fillStyle = '#3a4a60';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        const shortLoc = loc.length > 18 ? loc.slice(0, 17) + '…' : loc;
        ctx.fillText(shortLoc, bx2 + bw / 2, by2 + bh - 5);
      }
      ctx.restore();
    }

    // ── 4. Mode watermark ──
    const MODE_WM = { gray: 'ẢNH MRI XÁM', tumor: 'PHỦ KHỐI U', segmentation: 'PHÂN VÙNG MÀU U', heatmap: 'BẢN ĐỒ NHIỆT', region: 'BẢN ĐỒ VÙNG KHU VỰC' };
    const wmText = MODE_WM[mode] || mode.toUpperCase();
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#00e5ff';
    ctx.font = `bold 9px monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(wmText, 8, H - 8);
    ctx.restore();
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     PLACEHOLDER BRAIN (shown before any scan loaded)
  ══════════════════════════════════════════════════════════════════════════ */

  function drawPlaceholderBrain(canvasId, view) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const W = wrap.clientWidth || 300;
    const H = wrap.clientHeight || 280;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const cx = W / 2, cy = H / 2;
    const rx = (view === 'sagittal' ? W * 0.40 : W * 0.36);
    const ry = (view === 'axial' ? H * 0.39 : H * 0.42);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#060a16';
    ctx.fillRect(0, 0, W, H);

    // Subtle glow centre
    const grd = ctx.createRadialGradient(cx, cy * 0.9, 0, cx, cy, Math.max(rx, ry) * 1.15);
    grd.addColorStop(0, 'rgba(0,80,140,0.18)');
    grd.addColorStop(0.7, 'rgba(0,30,70,0.07)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Brain outer ellipse
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,160,220,0.28)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner ventricles
    ctx.beginPath();
    ctx.ellipse(cx, cy * 1.04, rx * 0.52, ry * 0.48, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,120,170,0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Midline (not sagittal)
    if (view !== 'sagittal') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - ry * 0.88);
      ctx.lineTo(cx, cy + ry * 0.88);
      ctx.strokeStyle = 'rgba(0,200,255,0.10)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Dim crosshair
    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(W, cy);
    ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
    ctx.strokeStyle = 'rgba(0,229,255,0.11)';
    ctx.lineWidth = 0.7;
    ctx.setLineDash([3, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Orientation labels
    const labs = { axial: ['A', 'P', 'R', 'L'], coronal: ['S', 'I', 'R', 'L'], sagittal: ['S', 'I', 'A', 'P'] }[view] || ['\u25b2', '\u25bc', '\u25c4', '\u25ba'];
    const fs = Math.max(9, Math.round(W / 38));
    ctx.fillStyle = 'rgba(0,200,255,0.28)';
    ctx.font = `bold ${fs}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(labs[0], cx, 7);
    ctx.textBaseline = 'bottom'; ctx.fillText(labs[1], cx, H - 6);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(labs[2], 7, cy);
    ctx.textAlign = 'right'; ctx.fillText(labs[3], W - 7, cy);
  }

  function showPlaceholders() {
    setTimeout(() => {
      drawPlaceholderBrain('atlasCanvasCoronal', 'coronal');
      drawPlaceholderBrain('atlasCanvasSagittal', 'sagittal');
      drawPlaceholderBrain('atlasCanvasAxial', 'axial');
    }, 50);  // small delay to ensure canvas has dimensions
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RE-FETCH SLICES WITH NEW CROSSHAIR
  ══════════════════════════════════════════════════════════════════════════ */
  async function refetchSlices(cx, cy) {
    // ── If imageData already loaded, just move crosshair ──
    // (avoids calling /api/mri-slices which may not exist)
    if (STATE.imageData.axial?.tumor || STATE.imageData.axial?.clean) {
      STATE.crosshair = { cx, cy };
      updateCrosshairs();
      updateCoordinateDisplay();
      // Optionally re-render mode overlays with new crosshair baked in
      // (the crosshair overlay is handled by CSS divs, so re-render is lightweight)
      return;
    }

    if (!STATE.diagnosisData || STATE.requesting) return;
    STATE.requesting = true;

    try {
      const fd = new FormData();
      if (window._lastUploadedBlob) {
        fd.append('file', window._lastUploadedBlob, 'mri.png');
      } else {
        STATE.requesting = false;
        return;
      }
      fd.append('cx', cx.toFixed(4));
      fd.append('cy', cy.toFixed(4));

      const res = await fetch(`${API_BASE}/mri-slices`, {
        method: 'POST', body: fd
      });
      if (res.ok) {
        const data = await res.json();
        STATE.slices = data;
        STATE.crosshair = { cx, cy };
        renderAllSlices();
      }
    } catch (e) {
      STATE.crosshair = { cx, cy };
      updateCrosshairs();
      updateCoordinateDisplay();
    } finally {
      STATE.requesting = false;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     CANVAS INTERACTION: click → move crosshair
  ══════════════════════════════════════════════════════════════════════════ */
  function attachCanvasInteraction(view) {
    const canvas = document.getElementById(`atlasCanvas${ucfirst(view)}`);
    if (!canvas) return;

    // Click → update crosshair
    canvas.addEventListener('click', async (e) => {
      const rect = canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / rect.width;
      const cy = (e.clientY - rect.top) / rect.height;

      // Instantly update visual crosshair
      STATE.crosshair = { cx, cy };
      updateCrosshairs();
      updateCoordinateDisplay();

      // Show region tooltip
      const region = getRegionAt(cx, cy);
      showTooltip(e.clientX, e.clientY, region);

      // Re-fetch new slices (non-blocking)
      refetchSlices(cx, cy);
    });

    // Hover → show tooltip
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / rect.width;
      const cy = (e.clientY - rect.top) / rect.height;
      const region = getRegionAt(cx, cy);
      showTooltip(e.clientX + 16, e.clientY + 8, region);
    });

    canvas.addEventListener('mouseleave', hideTooltip);

    // Wheel → zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      STATE.zoom[view] = Math.max(0.5, Math.min(4, STATE.zoom[view] + delta));
      if (STATE.imageData[view]?.tumor || STATE.imageData[view]?.clean) {
        drawModeOnCanvas(`atlasCanvas${ucfirst(view)}`, view, STATE.viewMode);
      } else {
        renderSliceToCanvas(`atlasCanvas${ucfirst(view)}`,
          STATE.slices?.[view]?.image_b64, STATE.zoom[view], STATE.pan[view]);
      }
    }, { passive: false });

    // Drag → pan (Alt+drag)
    let dragStart = null;
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 1 && e.altKey) {
        dragStart = {
          x: e.clientX, y: e.clientY,
          px: STATE.pan[view].x, py: STATE.pan[view].y
        };
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragStart) return;
      STATE.pan[view].x = dragStart.px + (e.clientX - dragStart.x);
      STATE.pan[view].y = dragStart.py + (e.clientY - dragStart.y);
      if (STATE.imageData[view]?.tumor || STATE.imageData[view]?.clean) {
        drawModeOnCanvas(`atlasCanvas${ucfirst(view)}`, view, STATE.viewMode);
      } else {
        renderSliceToCanvas(`atlasCanvas${ucfirst(view)}`,
          STATE.slices?.[view]?.image_b64, STATE.zoom[view], STATE.pan[view]);
      }
    });
    window.addEventListener('mouseup', () => { dragStart = null; });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     TOOLTIP
  ══════════════════════════════════════════════════════════════════════════ */
  function showTooltip(x, y, region) {
    const tt = document.getElementById('atlasTooltip');
    if (!tt) return;
    document.getElementById('atlasTooltipRegion').textContent = region.name;
    document.getElementById('atlasTooltipFn').textContent = region.fn;
    tt.style.left = x + 'px';
    tt.style.top = y + 'px';
    tt.style.display = 'block';
  }
  function hideTooltip() {
    const tt = document.getElementById('atlasTooltip');
    if (tt) tt.style.display = 'none';
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     3D BRAIN PANEL — reuse existing Three.js canvas from brain3d_new.js
  ══════════════════════════════════════════════════════════════════════════ */
  function mount3DBrainPanel() {
    const wrap = document.getElementById('atlas3DWrap');
    if (!wrap) return;

    // If brain3d_new.js has a canvas already rendered (#brainCanvas), clone the scene
    // Otherwise create a new minimal Three.js scene
    const existingCanvas = document.getElementById('brainCanvas');

    if (existingCanvas && window.brainRenderer) {
      // Reuse existing renderer — just point it to the new canvas
      const atlasCanvas = document.getElementById('atlasCanvas3D');
      if (atlasCanvas) {
        atlasCanvas.style.display = 'none'; // hide placeholder
      }
      // Move or mirror existing 3D view (display notice)
      const note = document.createElement('div');
      note.className = 'atlas-3d-mirror-note';
      note.innerHTML = '🔗 Góc nhìn 3D được liên kết đến tab <em>Não 3D</em> — hãy tương tác phần não xoay trên đó hoặc chuyển tab';
      wrap.appendChild(note);
    } else {
      // Create standalone minimal brain scene
      initAtlas3DScene();
    }
  }

  function initAtlas3DScene() {
    const canvas = document.getElementById('atlasCanvas3D');
    if (!canvas || typeof THREE === 'undefined') return;

    const wrap = canvas.parentElement;
    canvas.width = wrap.clientWidth || 400;
    canvas.height = wrap.clientHeight || 400;
    const W = canvas.width, H = canvas.height;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020710);

    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 2000);
    camera.position.set(0, 30, 230);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // ── 3-point lighting ──
    scene.add(new THREE.AmbientLight(0x0d2040, 2.8));
    const keyLight = new THREE.DirectionalLight(0x88ccff, 1.5);
    keyLight.position.set(80, 100, 60); keyLight.castShadow = true;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x4488aa, 0.7);
    fillLight.position.set(-80, 20, 40); scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xff6622, 0.40);
    rimLight.position.set(0, -80, -60); scene.add(rimLight);
    const topPt = new THREE.PointLight(0x00d4ff, 1.0, 280);
    topPt.position.set(0, 80, 80); scene.add(topPt);

    // ── Brain Group (rotates as one) ──
    const brainGroup = new THREE.Group();
    scene.add(brainGroup);

    // Mutable refs — assigned after GLB loads or fallback builds
    let shellMat = null, innerMat = null, gyriMat = null;
    let _glbLoaded = false;

    // ── Grid floor ──
    const grid = new THREE.GridHelper(240, 24, 0x0a2040, 0x061228);
    grid.position.y = -80; scene.add(grid);

    // ── Global scene refs (available immediately for addTumorTo3D) ──
    window._atlas3DTumorMesh = null;
    window._atlas3DTumorGlow = null;
    window._atlas3DTumorRings = [];
    window._atlas3DTumorLines = [];
    window._atlas3DScene = scene;
    window._atlas3DCamera = camera;
    window._atlas3DBrainGroup = brainGroup;
    window._atlas3DGLBModel = null;

    // ─────────────────────────────────────────────
    // LOADING OVERLAY (inside 3D panel)
    // ─────────────────────────────────────────────
    const loadingOverlay = document.createElement('div');
    loadingOverlay.style.cssText = [
      'position:absolute;inset:0;display:flex;flex-direction:column',
      'align-items:center;justify-content:center;gap:10px',
      'background:rgba(2,7,16,0.88);border-radius:8px;z-index:20;pointer-events:none'
    ].join(';');
    loadingOverlay.innerHTML = [
      '<div style="width:34px;height:34px;border:3px solid #0a2040;',
      'border-top-color:#00e5ff;border-radius:50%;',
      'animation:_s3 0.85s linear infinite;"></div>',
      '<div id="_atl3dPct" style="color:#4dd0e1;font-size:11px;font-weight:600;">Đang Tải Não 3D…</div>',
      '<div style="color:#5a7a99;font-size:9px;">detail_brain.glb</div>',
      '<style>@keyframes _s3{to{transform:rotate(360deg);}}</style>'
    ].join('');
    if (wrap) wrap.appendChild(loadingOverlay);

    // ─────────────────────────────────────────────
    // FALLBACK: procedural sphere brain
    // ─────────────────────────────────────────────
    function _buildFallbackBrain() {
      const shellGeo = new THREE.SphereGeometry(63, 64, 64);
      shellMat = new THREE.MeshPhongMaterial({
        color: 0x334466, transparent: true, opacity: 0.15,
        shininess: 100, specular: 0x5599cc, side: THREE.DoubleSide
      });
      brainGroup.add(new THREE.Mesh(shellGeo, shellMat));

      const innerGeo = new THREE.SphereGeometry(58, 56, 56);
      innerMat = new THREE.MeshPhongMaterial({
        color: 0x8899bb, transparent: true, opacity: 0.80, shininess: 40, specular: 0x223344
      });
      const innerMesh = new THREE.Mesh(innerGeo, innerMat);
      innerMesh.castShadow = true; brainGroup.add(innerMesh);

      gyriMat = new THREE.MeshBasicMaterial({ color: 0x0d2244, wireframe: true, opacity: 0.20, transparent: true });
      brainGroup.add(new THREE.Mesh(shellGeo, gyriMat));

      const lobeData = [
        { pos: [-28, 22, 18], r: [22, 18, 18], color: 0x4477ff },
        { pos: [28, 22, 18], r: [22, 18, 18], color: 0x55aaff },
        { pos: [-30, -5, 12], r: [20, 14, 18], color: 0xff7733 },
        { pos: [30, -5, 12], r: [20, 14, 18], color: 0xffaa44 },
        { pos: [0, 10, -8], r: [30, 16, 20], color: 0x44cc88 },
        { pos: [0, -28, -12], r: [24, 14, 18], color: 0xcc44ff },
      ];
      lobeData.forEach(l => {
        const geo = new THREE.SphereGeometry(1, 24, 24); geo.scale(...l.r);
        const m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: l.color, transparent: true, opacity: 0.38, shininess: 50 }));
        m.position.set(...l.pos); brainGroup.add(m);
      });
      const cbGeo = new THREE.SphereGeometry(1, 32, 32); cbGeo.scale(26, 18, 20);
      const cb = new THREE.Mesh(cbGeo, new THREE.MeshPhongMaterial({ color: 0xffcc88, transparent: true, opacity: 0.36 }));
      cb.position.set(0, -44, -28); brainGroup.add(cb);
      const bs = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 28, 16),
        new THREE.MeshPhongMaterial({ color: 0xddbb88, transparent: true, opacity: 0.40 }));
      bs.position.set(0, -58, -4); brainGroup.add(bs);
      const thalGeo = new THREE.SphereGeometry(1, 20, 20); thalGeo.scale(14, 10, 12);
      const thal = new THREE.Mesh(thalGeo, new THREE.MeshPhongMaterial({ color: 0xffee44, transparent: true, opacity: 0.30 }));
      thal.position.set(0, 4, -4); brainGroup.add(thal);
      const cc = new THREE.Mesh(new THREE.TorusGeometry(18, 4, 8, 32, Math.PI),
        new THREE.MeshPhongMaterial({ color: 0xffd700, transparent: true, opacity: 0.28 }));
      cc.rotation.x = Math.PI / 2; cc.position.y = 5; brainGroup.add(cc);

      addSlicePlanes(brainGroup);
      _glbLoaded = false;
      window._atlas3DFallbackBuilt = true;
      console.log('[Atlas4Panel] ⚠️  Using fallback procedural brain');
    }

    // ─────────────────────────────────────────────
    // GLB LOADER — detail_brain.glb → Brain.glb fallback
    // ─────────────────────────────────────────────
    function _tryLoadGLB() {
      const Loader = THREE.GLTFLoader;
      if (!Loader) { _buildFallbackBrain(); loadingOverlay.remove(); return; }

      const loader = new Loader();
      const urls = ['models/detail_brain.glb', 'models/Brain.glb'];
      let urlIndex = 0;

      function attempt() {
        if (urlIndex >= urls.length) {
          _buildFallbackBrain();
          loadingOverlay.remove();
          return;
        }
        const url = urls[urlIndex++];
        console.log('[Atlas4Panel] 🔄 Loading:', url);

        loader.load(
          url,
          function onLoad(gltf) {
            const model = gltf.scene;

            // Centre & scale to fit ~130 world-units
            const box = new THREE.Box3().setFromObject(model);
            const centre = new THREE.Vector3();
            box.getCenter(centre);
            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 130 / (maxDim || 1);
            model.position.sub(centre);
            model.scale.setScalar(scale);

            // Apply semi-transparent phong materials so tumor is visible inside
            let outerMat = null;
            model.traverse(child => {
              if (!child.isMesh) return;
              child.castShadow = true;
              child.receiveShadow = true;
              const n = (child.name || '').toLowerCase();
              const isOuter = n.includes('outer') || n.includes('cortex') || n.includes('brain') ||
                n.includes('surface') || (child.geometry?.attributes?.position?.count > 8000);
              const mat = new THREE.MeshPhongMaterial({
                color: isOuter ? 0xb8c8d8 : 0x7ba7cc,
                transparent: true,
                opacity: isOuter ? 0.28 : 0.52,
                shininess: isOuter ? 70 : 35,
                specular: 0x334466,
                side: THREE.DoubleSide
              });
              child.material = mat;
              if (isOuter && !outerMat) outerMat = mat;
            });

            // Expose primary shell mat for mode-select
            shellMat = outerMat || new THREE.MeshPhongMaterial({ color: 0xb8c8d8, transparent: true, opacity: 0.28 });
            innerMat = shellMat; // same ref (GLB has real anatomy)
            gyriMat = null;     // no wireframe overlay needed

            brainGroup.add(model);
            window._atlas3DGLBModel = model;

            // Faint wireframe skull overlay
            const skullGeo = new THREE.SphereGeometry(70, 48, 48);
            const skullMat = new THREE.MeshBasicMaterial({ color: 0x1a3366, wireframe: true, opacity: 0.06, transparent: true });
            brainGroup.add(new THREE.Mesh(skullGeo, skullMat));

            addSlicePlanes(brainGroup);
            _glbLoaded = true;
            loadingOverlay.remove();

            // Badge
            const badge = document.createElement('div');
            badge.style.cssText = 'position:absolute;bottom:8px;left:8px;background:rgba(0,229,255,0.10);' +
              'border:1px solid rgba(0,229,255,0.28);border-radius:5px;padding:2px 8px;' +
              'font-size:9px;color:#4dd0e1;letter-spacing:0.5px;pointer-events:none;z-index:5;';
            badge.textContent = '🧠 ' + url.split('/').pop();
            if (wrap) wrap.appendChild(badge);

            // If tumor data was queued before GLB loaded, apply now
            if (window._atlas3DPendingDiagnosis) {
              addTumorTo3D(window._atlas3DPendingDiagnosis);
              window._atlas3DPendingDiagnosis = null;
            }

            console.log('[Atlas4Panel] ✅ GLB loaded:', url, '| meshes in scene');
          },
          function onProgress(xhr) {
            if (xhr.total) {
              const pct = Math.round(xhr.loaded / xhr.total * 100);
              const el = document.getElementById('_atl3dPct');
              if (el) el.textContent = `Đang Tải Não 3D… ${pct}%`;
            }
          },
          function onError(err) {
            console.warn('[Atlas4Panel] ⚠️  GLB load failed:', url, err.message || err);
            attempt();
          }
        );
      }
      attempt();
    }

    // Start async load immediately
    _tryLoadGLB();

    // ── Mode select (works for both GLB and fallback) ──
    document.getElementById('atlas3DMode')?.addEventListener('change', function () {
      const mode = this.value;
      if (_glbLoaded && window._atlas3DGLBModel) {
        // Traverse GLB model and adjust opacity
        const opaque = { normal: 0.28, solid: 0.72, wireframe: 0.0, depth: 0.12 };
        const innerO = { normal: 0.52, solid: 0.85, wireframe: 0.0, depth: 0.35 };
        let first = true;
        window._atlas3DGLBModel.traverse(child => {
          if (!child.isMesh) return;
          const n = (child.name || '').toLowerCase();
          const isOuter = n.includes('outer') || n.includes('cortex') || n.includes('brain') ||
            (child.geometry?.attributes?.position?.count > 8000);
          child.material.opacity = isOuter ? (opaque[mode] ?? 0.28) : (innerO[mode] ?? 0.52);
          child.material.wireframe = mode === 'wireframe';
          if (first) { first = false; }
        });
      } else if (shellMat && innerMat) {
        // Fallback sphere mode
        if (mode === 'solid') { shellMat.opacity = 0.85; innerMat.opacity = 0.90; if (gyriMat) gyriMat.visible = false; }
        else if (mode === 'wireframe') { shellMat.opacity = 0; innerMat.opacity = 0; if (gyriMat) { gyriMat.visible = true; gyriMat.opacity = 0.45; } }
        else if (mode === 'depth') { shellMat.opacity = 0.08; innerMat.opacity = 0.30; if (gyriMat) { gyriMat.visible = true; gyriMat.opacity = 0.35; } }
        else { shellMat.opacity = 0.15; innerMat.opacity = 0.80; if (gyriMat) { gyriMat.visible = true; gyriMat.opacity = 0.20; } }
      }
    });

    // ── Drag rotate with inertia ──
    let isDrag = false, prevM = { x: 0, y: 0 };
    let rotX = 0.18, rotY = 0.4, velX = 0, velY = 0.002;

    canvas.addEventListener('mousedown', e => {
      isDrag = true; prevM = { x: e.clientX, y: e.clientY }; velX = 0; velY = 0;
    });
    window.addEventListener('mouseup', () => { isDrag = false; });
    canvas.addEventListener('mousemove', e => {
      if (!isDrag) return;
      velY = (e.clientX - prevM.x) * 0.012; velX = (e.clientY - prevM.y) * 0.010;
      rotY += velY; rotX += velX;
      rotX = Math.max(-1.1, Math.min(1.1, rotX));
      prevM = { x: e.clientX, y: e.clientY };
      brainGroup.rotation.set(rotX, rotY, 0);
    });

    // ── Wheel zoom ──
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      camera.position.z = Math.max(80, Math.min(450, camera.position.z + e.deltaY * 0.35));
    }, { passive: false });

    // ── Control buttons ──
    let autoRotate = true;
    document.getElementById('atlas3DRotate')?.addEventListener('click', function () {
      autoRotate = !autoRotate; this.classList.toggle('active', autoRotate);
    });
    document.getElementById('atlas3DReset')?.addEventListener('click', () => {
      rotX = 0.18; rotY = 0.4; velX = 0; velY = 0.002;
      camera.position.set(0, 30, 230);
      brainGroup.rotation.set(rotX, rotY, 0);
    });

    // ── Animate loop ──
    let _frame;
    function animate() {
      _frame = requestAnimationFrame(animate);
      if (!isDrag) {
        if (autoRotate) {
          velY = velY * 0.96 + 0.003 * 0.04;
          rotY += velY;
        } else {
          velX *= 0.90; velY *= 0.90;
          rotX += velX; rotY += velY;
          rotX = Math.max(-1.1, Math.min(1.1, rotX));
        }
        brainGroup.rotation.set(rotX, rotY, 0);
      }

      const t = Date.now() * 0.001; // seconds

      // ── 1. Pulse tumor rings (per-ring phase and speed) ──
      if (window._atlas3DTumorRings && window._atlas3DTumorRings.length) {
        window._atlas3DTumorRings.forEach((ring) => {
          if (ring && ring._pulse) {
            const ph = ring._pulsePhase || 0;
            const spd = ring._pulseSpeed || 1.5;
            const orig = ring._origOpacity || 0.45;
            ring.material.opacity = orig * (0.45 + 0.55 * Math.abs(Math.sin(t * spd + ph)));
            const s = 1.0 + 0.06 * Math.sin(t * spd * 1.3 + ph);
            ring.scale.setScalar(s);
          }
        });
      }

      // ── 2. Rotate particle halo around tumor center ──
      if (window._atlas3DParticleSystem) {
        const ps = window._atlas3DParticleSystem;
        ps.rotation.y += ps._angularVel || 0.006;
        ps.rotation.x += (ps._angularVel || 0.006) * 0.28;
        if (ps.material) {
          ps.material.opacity = 0.50 + 0.22 * Math.sin(t * 1.1);
        }
      }

      // ── 3. Scan plane sweep (Y oscillation through tumor zone) ──
      if (window._atlas3DScanPlanes && window._atlas3DScanPlanes.length) {
        window._atlas3DScanPlanes.forEach(sp => {
          if (sp._scanY0 == null) return;
          const frac = (Math.sin(t * sp._scanSpeed + sp._scanPhase) + 1) / 2;
          sp.position.y = sp._scanY0 + frac * (sp._scanY1 - sp._scanY0);
          if (sp.material) sp.material.opacity = 0.02 + 0.05 * frac;
        });
      }

      // ── 4. Depth sprite gentle float ──
      if (window._atlas3DDepthSprite) {
        window._atlas3DDepthSprite.position.y +=
          Math.sin(t * 0.75 + 1.2) * 0.015;
      }

      // ── 5. Core tumor emissive breathe ──
      if (window._atlas3DTumorMesh && window._atlas3DTumorMesh.material) {
        const m = window._atlas3DTumorMesh.material;
        if (!m._baseEmissive) m._baseEmissive = m.emissiveIntensity || 0.65;
        m.emissiveIntensity = m._baseEmissive + 0.28 * Math.sin(t * 2.0);
      }

      renderer.render(scene, camera);
    }
    animate();

    const panel = document.getElementById('atlasViewPanel');
    if (panel) {
      new MutationObserver(muts => muts.forEach(m => {
        if (m.attributeName === 'class') {
          if (panel.classList.contains('active')) animate();
          else cancelAnimationFrame(_frame);
        }
      })).observe(panel, { attributes: true });
    }
  }

  function addSlicePlanes(scene) {
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x004488, transparent: true, opacity: 0.18, side: THREE.DoubleSide
    });
    // Axial plane (XY)
    const axialPlane = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), planeMat.clone());
    axialPlane.rotation.x = Math.PI / 2;
    axialPlane.name = 'axialPlane';
    scene.add(axialPlane);

    // Sagittal plane (YZ)
    const sagPlane = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), planeMat.clone());
    sagPlane.rotation.y = Math.PI / 2;
    sagPlane.name = 'sagittalPlane';
    scene.add(sagPlane);

    // Coronal plane (XZ)
    const corPlane = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), planeMat.clone());
    corPlane.name = 'coronalPlane';
    scene.add(corPlane);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     ADD TUMOR TO 3D SCENE — ENHANCED VISUALIZATION
     Features: cortex shell, scan cone, particle halo, measurement needles,
               pulsing corona rings, 3D target reticle, volumetric glow cone
  ══════════════════════════════════════════════════════════════════════════ */
  function addTumorTo3D(diagnosisData) {
    const scene = window._atlas3DScene;
    const brainGroup = window._atlas3DBrainGroup || scene;
    if (!scene) return;

    // ── If GLB still loading, queue and return ──
    if (!window._atlas3DGLBModel && !window._atlas3DFallbackBuilt) {
      window._atlas3DPendingDiagnosis = diagnosisData;
      console.log('[Atlas4Panel] ⏳ Tumor queued — GLB not ready yet');
      return;
    }

    // ── Remove old tumor objects ──
    const _allOld = [
      window._atlas3DTumorMesh, window._atlas3DTumorGlow,
      ...(window._atlas3DTumorRings || []),
      ...(window._atlas3DTumorLines || []),
      ...(window._atlas3DTumorExtras || []),
      window._atlas3DDepthSprite,
      window._atlas3DParticleSystem,
    ].filter(Boolean);
    _allOld.forEach(m => brainGroup.remove(m));
    window._atlas3DTumorMesh = null;
    window._atlas3DTumorGlow = null;
    window._atlas3DTumorRings = [];
    window._atlas3DTumorLines = [];
    window._atlas3DTumorExtras = [];
    window._atlas3DDepthSprite = null;
    window._atlas3DParticleSystem = null;

    if (!diagnosisData?.prediction?.tumor_detected) return;

    const pred = diagnosisData.prediction;
    const depthMm = diagnosisData.depth_metrics?.tumor_depth_mm ?? 20;
    const depthCat = diagnosisData.depth_metrics?.depth_category?.category || 'INTERMEDIATE';
    const conf = (pred.confidence || 0.9);

    // ── FIX: centroid_normalized từ backend là range -1..1 (không phải 0..1)
    //    backend: (cx - 128) / 128  →  range -1.0 to +1.0, center = 0
    const cx_norm = pred.centroid_normalized?.[0] ?? 0;   // -1..1
    const cy_norm = pred.centroid_normalized?.[1] ?? 0;   // -1..1
    const area_pct = pred.tumor_area_percent || 2;
    const locHint = pred.location_hint || '';

    // ── FIX: Map centroid vào brain world-space
    //    Brain GLB scale = 130 world-units (bán kính ~65)
    //    Dùng BRAIN_R = 50 để tumor chắc chắn nằm trong não
    const BRAIN_R = 50;
    const tx = cx_norm * BRAIN_R;                    // X: trái(-) ↔ phải(+)
    const ty = -cy_norm * BRAIN_R;                   // Y: flip (ảnh↓ = 3D ↑)
    const tz = -(depthMm / 55) * (BRAIN_R * 0.45);  // Z: sâu hơn → đẩy vào trong
    const radius = Math.max(4, Math.min(24, Math.sqrt(area_pct) * 3.8));
    const shallow = depthMm < 15;

    console.log(`[Atlas4Panel] 🎯 Tumor 3D pos: cx_norm=${cx_norm.toFixed(2)}, cy_norm=${cy_norm.toFixed(2)} → (${tx.toFixed(1)}, ${ty.toFixed(1)}, ${tz.toFixed(1)}) r=${radius.toFixed(1)}`);
    const dc = _getDepthColor3D(depthMm);
    const extras = [];

    // ════════════════════════════════════════════════════
    //  1. CORE TUMOR SPHERE
    // ════════════════════════════════════════════════════
    const coreMat = new THREE.MeshPhongMaterial({
      color: dc.core, emissive: dc.emissive,
      emissiveIntensity: shallow ? 1.0 : 0.65,
      transparent: true, opacity: 0.95, shininess: 120,
      specular: 0xffffff,
    });
    const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 64), coreMat);
    coreMesh.position.set(tx, ty, tz); coreMesh.castShadow = true;
    brainGroup.add(coreMesh); window._atlas3DTumorMesh = coreMesh;

    // ════════════════════════════════════════════════════
    //  2. TRANSLUCENT BOUNDARY SHELL (inner)
    // ════════════════════════════════════════════════════
    const shellMesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.35, 40, 40),
      new THREE.MeshPhongMaterial({
        color: dc.glow, transparent: true, opacity: 0.18,
        side: THREE.BackSide, shininess: 20,
      })
    );
    shellMesh.position.set(tx, ty, tz);
    brainGroup.add(shellMesh); extras.push(shellMesh);

    // ════════════════════════════════════════════════════
    //  3. OUTER GLOW SPHERE
    // ════════════════════════════════════════════════════
    const glowMesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 2.4, 24, 24),
      new THREE.MeshBasicMaterial({ color: dc.glow, transparent: true, opacity: shallow ? 0.22 : 0.10 })
    );
    glowMesh.position.set(tx, ty, tz);
    brainGroup.add(glowMesh); window._atlas3DTumorGlow = glowMesh;

    // ════════════════════════════════════════════════════
    //  4. WIREFRAME DIAGNOSTIC CAGE
    // ════════════════════════════════════════════════════
    const cageGeo = new THREE.SphereGeometry(radius * 1.75, 12, 8);
    const cageMat = new THREE.MeshBasicMaterial({
      color: dc.core, wireframe: true, transparent: true, opacity: 0.28
    });
    const cageMesh = new THREE.Mesh(cageGeo, cageMat);
    cageMesh.position.set(tx, ty, tz);
    brainGroup.add(cageMesh); extras.push(cageMesh);

    // ════════════════════════════════════════════════════
    //  5. PULSING CORONA RINGS (3 concentric toruses)
    // ════════════════════════════════════════════════════
    const rings = [];
    const ringDefs = [
      { scale: 2.0, tube: 0.10, color: dc.core, opacity: 0.70, rotX: Math.PI / 2 },
      { scale: 2.8, tube: 0.08, color: dc.glow, opacity: 0.50, rotX: Math.PI / 6 },
      { scale: 3.6, tube: 0.06, color: 0xffffff, opacity: 0.18, rotX: Math.PI / 4 },
      { scale: 2.2, tube: 0.07, color: dc.core, opacity: 0.40, rotX: 0 }, // vertical plane
    ];
    ringDefs.forEach((rd, i) => {
      const rGeo = new THREE.TorusGeometry(radius * rd.scale, Math.max(0.4, radius * rd.tube), 12, 96);
      const rMat = new THREE.MeshBasicMaterial({ color: rd.color, transparent: true, opacity: rd.opacity });
      const ring = new THREE.Mesh(rGeo, rMat);
      ring.position.set(tx, ty, tz);
      ring.rotation.x = rd.rotX;
      ring._pulse = true;
      ring._pulsePhase = i * 1.1;
      ring._pulseSpeed = 1.2 + i * 0.3;
      ring._origOpacity = rd.opacity;
      brainGroup.add(ring); rings.push(ring);
    });
    // Extra alert ring for shallow tumors
    if (shallow) {
      for (let k = 0; k < 2; k++) {
        const vRing = new THREE.Mesh(
          new THREE.TorusGeometry(radius * (2.6 + k * 0.8), radius * 0.07, 8, 72),
          new THREE.MeshBasicMaterial({ color: 0xff1111, transparent: true, opacity: 0.55 - k * 0.15 })
        );
        vRing.position.set(tx, ty, tz);
        vRing._pulse = true; vRing._pulsePhase = k * 0.5; vRing._pulseSpeed = 2.5;
        vRing._origOpacity = 0.55 - k * 0.15;
        brainGroup.add(vRing); rings.push(vRing);
      }
    }
    window._atlas3DTumorRings = rings;

    // ════════════════════════════════════════════════════
    //  6. 3D TARGET RETICLE (medical crosshair)
    // ════════════════════════════════════════════════════
    const reticleMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.75 });
    const reticleSize = radius * 2.6;
    // Inner circle
    const circPts = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      circPts.push(new THREE.Vector3(Math.cos(a) * radius * 1.6, Math.sin(a) * radius * 1.6, 0));
    }
    const innerCircle = new THREE.Line(new THREE.BufferGeometry().setFromPoints(circPts), reticleMat.clone());
    innerCircle.position.set(tx, ty, tz);
    brainGroup.add(innerCircle); extras.push(innerCircle);

    // Cross lines (4 segments from circle edge outward)
    const crossDirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    crossDirs.forEach(([dx, dy]) => {
      const innerR = radius * 1.7, outerR = reticleSize * 1.1;
      const seg = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(dx * innerR, dy * innerR, 0),
          new THREE.Vector3(dx * outerR, dy * outerR, 0),
        ]),
        reticleMat.clone()
      );
      seg.position.set(tx, ty, tz);
      brainGroup.add(seg); extras.push(seg);
    });

    // Outer targeting circle
    const outerCircPts = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      outerCircPts.push(new THREE.Vector3(Math.cos(a) * reticleSize, Math.sin(a) * reticleSize, 0));
    }
    const outerCircle = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(outerCircPts),
      new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.35 })
    );
    outerCircle.position.set(tx, ty, tz);
    brainGroup.add(outerCircle); extras.push(outerCircle);

    // ════════════════════════════════════════════════════
    //  7. MEASUREMENT NEEDLES (3-axis depth indicators)
    // ════════════════════════════════════════════════════
    const needleColor = dc.core;
    const needleMat = new THREE.LineBasicMaterial({ color: needleColor, transparent: true, opacity: 0.55 });
    const dashMat = new THREE.LineDashedMaterial({ color: 0x44ccff, transparent: true, opacity: 0.40, dashSize: 4, gapSize: 4 });

    // ── FIX: Cortex surface point — tính từ bán kính não thực (~65 units)
    //    Điểm vỏ não gần nhất về phía trên tumor (Y+)
    const brainSurfaceY = Math.sqrt(Math.max(0, BRAIN_R * BRAIN_R - tx * tx - tz * tz));
    const cortexY = Math.min(brainSurfaceY, ty + depthMm * 0.9 + radius);

    // Vertical depth needle (main — cortex surface down to tumor)
    const depthLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(tx, cortexY, tz),
        new THREE.Vector3(tx, ty, tz),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.85 })
    );
    brainGroup.add(depthLine); extras.push(depthLine);

    // Arrow-head at tumor top
    const arrowPts = [
      new THREE.Vector3(tx - 3, ty + radius + 3, tz),
      new THREE.Vector3(tx, ty + radius - 0.5, tz),
      new THREE.Vector3(tx + 3, ty + radius + 3, tz),
    ];
    const arrowLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(arrowPts),
      new THREE.LineBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.90 })
    );
    brainGroup.add(arrowLine); extras.push(arrowLine);

    // Small sphere at cortex surface (entry point)
    const entrySphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.85 })
    );
    entrySphere.position.set(tx, cortexY, tz);
    brainGroup.add(entrySphere); extras.push(entrySphere);

    // Dashed lines from tumor center to 3 axis planes
    [
      [new THREE.Vector3(tx, ty, tz), new THREE.Vector3(0, ty, tz)],   // → X axis
      [new THREE.Vector3(tx, ty, tz), new THREE.Vector3(tx, 0, tz)],   // → Y axis
      [new THREE.Vector3(tx, ty, tz), new THREE.Vector3(tx, ty, 0)],   // → Z axis
    ].forEach(([a, b]) => {
      const g = new THREE.BufferGeometry().setFromPoints([a, b]);
      const l = new THREE.Line(g, dashMat.clone());
      l.computeLineDistances();
      brainGroup.add(l); extras.push(l);
    });

    // Endpoint dot markers at axis plane intersections
    [[0, ty, tz], [tx, 0, tz], [tx, ty, 0]].forEach(([px, py, pz], i) => {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 8, 8),
        new THREE.MeshBasicMaterial({ color: [0x00ffff, 0x44ff88, 0xff8844][i], transparent: true, opacity: 0.70 })
      );
      dot.position.set(px, py, pz);
      brainGroup.add(dot); extras.push(dot);
    });

    // ════════════════════════════════════════════════════
    //  8. SCANNING CONE (from cortex surface to tumor)
    // ════════════════════════════════════════════════════
    const coneHeight = Math.abs(cortexY - ty) + radius;
    const coneGeo = new THREE.ConeGeometry(radius * 1.6, coneHeight, 24, 1, true); // open cone
    const coneMat = new THREE.MeshBasicMaterial({
      color: dc.glow, transparent: true, opacity: 0.08,
      side: THREE.DoubleSide, wireframe: false,
    });
    const coneMesh = new THREE.Mesh(coneGeo, coneMat);
    coneMesh.position.set(tx, (ty + cortexY) / 2, tz);
    coneMesh.rotation.z = Math.PI; // point downward
    brainGroup.add(coneMesh); extras.push(coneMesh);

    // Cone edge wireframe
    const coneWireGeo = new THREE.ConeGeometry(radius * 1.6, coneHeight, 12, 1, true);
    const coneWire = new THREE.Mesh(coneWireGeo,
      new THREE.MeshBasicMaterial({ color: dc.core, wireframe: true, transparent: true, opacity: 0.22 })
    );
    coneWire.position.set(tx, (ty + cortexY) / 2, tz);
    coneWire.rotation.z = Math.PI;
    brainGroup.add(coneWire); extras.push(coneWire);
    //  brainGroup.add( coneMesh);

    // ════════════════════════════════════════════════════
    //  9. PARTICLE HALO (orbiting points around tumor)
    // ════════════════════════════════════════════════════
    const PARTICLE_COUNT = 180;
    const pPositions = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Distribute on a slightly noisy sphere shell
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      const r = radius * (2.0 + Math.random() * 1.2);
      pPositions[i * 3 + 0] = tx + r * Math.sin(phi) * Math.cos(theta);
      pPositions[i * 3 + 1] = ty + r * Math.sin(phi) * Math.sin(theta);
      pPositions[i * 3 + 2] = tz + r * Math.cos(phi);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    const pMat = new THREE.PointsMaterial({
      color: dc.glow, size: 1.4, transparent: true, opacity: 0.70,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(pGeo, pMat);
    particles._tumorCenter = new THREE.Vector3(tx, ty, tz);
    particles._angularVel = 0.006;
    brainGroup.add(particles); window._atlas3DParticleSystem = particles;

    // ════════════════════════════════════════════════════
    //  10. SCAN-LINE EFFECT (horizontal sweep planes)
    // ════════════════════════════════════════════════════
    for (let k = 0; k < 3; k++) {
      const scanGeo = new THREE.PlaneGeometry(radius * 5, radius * 5);
      const scanMat = new THREE.MeshBasicMaterial({
        color: dc.glow, transparent: true, opacity: 0.06 - k * 0.015,
        side: THREE.DoubleSide,
      });
      const scan = new THREE.Mesh(scanGeo, scanMat);
      scan.position.set(tx, ty - radius + k * radius * 0.7, tz);
      scan._scanY0 = ty - radius + k * radius * 0.3;
      scan._scanY1 = ty + radius * 1.5;
      scan._scanSpeed = 0.4 + k * 0.2;
      scan._scanPhase = k * 2.1;
      brainGroup.add(scan); extras.push(scan);
      // Register for animation
      scan._isScanPlane = true;
    }

    // ════════════════════════════════════════════════════
    //  11. DEPTH INFO SPRITE (rich canvas)
    // ════════════════════════════════════════════════════
    const sprite = _createDepthSprite(depthMm, depthCat, conf, area_pct, dc.core, locHint);
    if (sprite) {
      sprite.position.set(tx + radius * 2.8, ty + radius * 2.6, tz + 5);
      brainGroup.add(sprite); window._atlas3DDepthSprite = sprite;
    }

    // ════════════════════════════════════════════════════
    //  12. POINT LIGHT AT TUMOR (colored glow illumination)
    // ════════════════════════════════════════════════════
    const tumorLight = new THREE.PointLight(dc.glow, 1.8, radius * 12);
    tumorLight.position.set(tx, ty, tz);
    tumorLight._isTumorLight = true;
    brainGroup.add(tumorLight); extras.push(tumorLight);

    // Save extras
    extras.push(...rings);
    window._atlas3DTumorExtras = extras;

    // ════════════════════════════════════════════════════
    //  REGISTER ANIMATION HOOKS
    // ════════════════════════════════════════════════════
    window._atlas3DTumorRings = rings;
    window._atlas3DTumorAnimExtras = extras.filter(e =>
      e._isScanPlane || e._isTumorLight
    );
    // Keep scan planes separately for animation
    window._atlas3DScanPlanes = extras.filter(e => e._isScanPlane);

    _updateDepthLegend(depthMm, depthCat);
    console.log(`[Atlas4Panel] 🎯 Tumor 3D ENHANCED depth:${depthMm}mm (${depthCat}) r=${radius.toFixed(1)}`);
  }

  /* ── Depth color by severity (red=surface → blue=very deep) ── */
  function _getDepthColor3D(d) {
    if (!d || d < 5) return { core: 0xff1111, emissive: 0xaa0000, glow: 0xff5500 };
    if (d < 15) return { core: 0xff6600, emissive: 0xaa4400, glow: 0xff9900 };
    if (d < 30) return { core: 0xffcc00, emissive: 0xaa8800, glow: 0xffee55 };
    if (d < 45) return { core: 0x00cc55, emissive: 0x006622, glow: 0x44ff88 };
    return { core: 0x00aaff, emissive: 0x004488, glow: 0x44ccff };
  }

  /* ── Create rich canvas-based depth info sprite ── */
  function _createDepthSprite(depthMm, category, conf, areaPct, colorInt, locHint) {
    if (typeof THREE === 'undefined') return null;
    const cW = 280, cH = 140;
    const cvs = document.createElement('canvas');
    cvs.width = cW; cvs.height = cH;
    const ctx = cvs.getContext('2d');

    // Background
    ctx.fillStyle = 'rgba(4,8,22,0.88)';
    ctx.beginPath();
    ctx.roundRect?.(0, 0, cW, cH, 8) || ctx.rect(0, 0, cW, cH);
    ctx.fill();

    // Border glow
    const hexCol = '#' + colorInt.toString(16).padStart(6, '0');
    ctx.strokeStyle = hexCol;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect?.(1, 1, cW - 2, cH - 2, 8) || ctx.rect(1, 1, cW - 2, cH - 2);
    ctx.stroke();

    // Top accent line
    const grad = ctx.createLinearGradient(0, 0, cW, 0);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(0.3, hexCol);
    grad.addColorStop(0.7, hexCol);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cW, 3);

    // Header label
    ctx.fillStyle = hexCol;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('▶  TUMOR DETECTION', 10, 18);

    // Confidence badge
    const confPct = Math.round((conf || 0) * 100);
    ctx.fillStyle = confPct > 85 ? '#ff4444' : confPct > 70 ? '#ffaa00' : '#44cc88';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`CONF: ${confPct}%`, cW - 10, 18);

    // Divider
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(8, 23, cW - 16, 1);

    // Depth value (large)
    ctx.fillStyle = hexCol;
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'left';
    ctx.fillText((depthMm != null ? depthMm.toFixed(1) : '--') + ' mm', 10, 62);

    // Category label
    ctx.fillStyle = '#8899bb';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(category.replace('_', ' '), 10, 79);

    // Area percent
    ctx.fillStyle = '#ff9100';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`Area: ${areaPct != null ? areaPct.toFixed(2) : '--'}%`, cW - 10, 62);

    // ── Depth gradient bar ──
    const barX = 10, barY = 88, barW = cW - 20, barH = 8;
    const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    barGrad.addColorStop(0.0, '#ff1111');
    barGrad.addColorStop(0.15, '#ff6600');
    barGrad.addColorStop(0.35, '#ffcc00');
    barGrad.addColorStop(0.60, '#00cc55');
    barGrad.addColorStop(1.0, '#00aaff');
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.roundRect?.(barX, barY, barW, barH, 4) || ctx.rect(barX, barY, barW, barH);
    ctx.fill();
    ctx.fillStyle = barGrad;
    ctx.beginPath();
    ctx.roundRect?.(barX, barY, barW, barH, 4) || ctx.rect(barX, barY, barW, barH);
    ctx.fill();

    // Depth marker on bar
    const depthFrac = Math.min(1, Math.max(0, (depthMm || 0) / 60));
    const markerX = barX + depthFrac * barW;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(markerX, barY + barH / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Tick labels
    ctx.fillStyle = '#5a7a99'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
    ['0', '15', '30', '45', '60+'].forEach((t, i) => {
      ctx.fillText(t, barX + (i / 4) * barW, barY + barH + 10);
    });

    // Location hint
    if (locHint) {
      ctx.fillStyle = '#46607a'; ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      const short = locHint.length > 34 ? locHint.slice(0, 33) + '…' : locHint;
      ctx.fillText(short, cW / 2, cH - 4);
    }

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cvs), transparent: true
    }));
    sprite.scale.set(52, 26, 1);
    return sprite;
  }

  /* ── Update depth legend panel ── */
  function _updateDepthLegend(depthMm, category) {
    const el = document.getElementById('atlasDepthValue');
    if (!el) return;
    const dc = _getDepthColor3D(depthMm);
    const hexCol = '#' + dc.core.toString(16).padStart(6, '0');
    const label = !depthMm || depthMm < 5 ? '🔴 Critical (nông)' :
      depthMm < 15 ? '🟠 Shallow' :
        depthMm < 30 ? '🟡 Trung bình' :
          depthMm < 45 ? '🟢 Deep' : '🔵 Very Deep';
    el.innerHTML = `<span style="color:${hexCol};font-weight:700;font-size:13px;">${depthMm.toFixed(1)} mm</span><br><small style="color:#8899b0;font-size:9px;">${label}</small>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SHOW / HIDE OVERLAYS
  ══════════════════════════════════════════════════════════════════════════ */
  function hideOverlays() {
    ['Coronal', 'Sagittal', 'Axial', '3D'].forEach(v => {
      const el = document.getElementById(`overlay${v}`);
      if (el) el.style.display = 'none';
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     UPDATE TUMOR INFO BAR
  ══════════════════════════════════════════════════════════════════════════ */
  function updateInfoBar(diagnosisData) {
    const pred = diagnosisData?.prediction;
    const el = document.getElementById('atlasInfoTumor');
    if (!el) return;
    if (pred?.tumor_detected) {
      el.innerHTML = `Tumor: <span style="color:#ff5252;font-weight:bold;">DETECTED</span> · ${pred.tumor_area_percent?.toFixed(2)}% · ${pred.location_hint || 'Unknown'}`;
    } else {
      el.innerHTML = `Tumor: <span style="color:#00c853;font-weight:bold;">NOT DETECTED</span>`;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     TOOLBAR BUTTONS
  ══════════════════════════════════════════════════════════════════════════ */
  function attachToolbarEvents() {
    // Reset crosshair to tumor center
    document.getElementById('atlasBtnReset')?.addEventListener('click', () => {
      if (STATE.slices?.crosshair) {
        STATE.crosshair = {
          cx: STATE.slices.crosshair.cx,
          cy: STATE.slices.crosshair.cy,
        };
        updateCrosshairs();
        updateCoordinateDisplay();
      }
    });

    // Zoom in all panels
    document.getElementById('atlasBtnZoomIn')?.addEventListener('click', () => {
      ['axial', 'coronal', 'sagittal'].forEach(v => {
        STATE.zoom[v] = Math.min(4, STATE.zoom[v] + 0.2);
      });
      renderAllSlices();
    });

    // Zoom out all panels
    document.getElementById('atlasBtnZoomOut')?.addEventListener('click', () => {
      ['axial', 'coronal', 'sagittal'].forEach(v => {
        STATE.zoom[v] = Math.max(0.5, STATE.zoom[v] - 0.2);
      });
      renderAllSlices();
    });

    // Fullscreen
    document.getElementById('atlasBtnFullscreen')?.addEventListener('click', () => {
      const panel = document.getElementById('atlasViewPanel');
      if (panel) {
        if (!document.fullscreenElement) {
          panel.requestFullscreen?.();
        } else {
          document.exitFullscreen?.();
        }
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RESIZE OBSERVER — redraw canvases if panel resizes
  ══════════════════════════════════════════════════════════════════════════ */
  function attachResizeObserver() {
    if (!window.ResizeObserver) return;
    const grid = document.getElementById('atlasGrid');
    if (!grid) return;
    const obs = new ResizeObserver(() => {
      if (STATE.imageData.axial?.tumor || STATE.imageData.axial?.clean) {
        renderAllSlicesForMode();
      } else if (STATE.slices) {
        renderAllSlices();
      } else {
        showPlaceholders();
      }
    });
    obs.observe(grid);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     PUBLIC API: init + load
  ══════════════════════════════════════════════════════════════════════════ */

  /**
   * Call once to build and mount the panel HTML inside #atlasViewPanel.
   */
  function init() {
    if (STATE.initialized) return;
    STATE.initialized = true;

    const container = document.getElementById('atlasViewPanel');
    if (!container) {
      console.error('[Atlas4Panel] ❌ Container #atlasViewPanel not found');
      return;
    }

    container.innerHTML = buildHTML();

    // Attach interactions
    ['axial', 'coronal', 'sagittal'].forEach(attachCanvasInteraction);

    // Toolbar
    attachToolbarEvents();

    // Mode switcher — event delegation on container
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.atlas-mode-btn');
      if (btn && btn.dataset.mode) switchViewMode(btn.dataset.mode);
    });

    // Draw placeholder brains immediately
    showPlaceholders();

    // 3D brain panel
    setTimeout(mount3DBrainPanel, 200);

    // Resize
    attachResizeObserver();

    console.log('[Atlas4Panel] ✅ Initialized');
  }

  /**
   * Load diagnosis data into the viewer and render all slices.
   * Call after /api/diagnose returns.
   *
   * @param {object} diagnosisData - full response from /api/diagnose
   */
  function loadDiagnosis(diagnosisData) {
    if (!STATE.initialized) init();

    STATE.diagnosisData = diagnosisData;
    STATE.slices = diagnosisData?.slices || null;

    if (STATE.slices) {
      // ── Populate imageData for all 4 modes ──
      ['axial', 'coronal', 'sagittal'].forEach(view => {
        const s = STATE.slices[view];
        if (s) {
          STATE.imageData[view] = {
            tumor: s.image_b64 || null,
            clean: s.clean_b64 || s.image_b64 || null,
            mask: s.mask_b64 || null,
            segmentation: s.segmentation_b64 || null,
          };
        }
      });
      STATE.imageData.heatmap = STATE.slices.heatmap_b64 || null;   // Auto-fit: zoom in slightly to better fill panel with brain tissue\n      const FIT_ZOOM = 1.30;\n      STATE.zoom = { axial: FIT_ZOOM, coronal: FIT_ZOOM, sagittal: FIT_ZOOM };\n      STATE.pan  = { axial:{x:0,y:0}, coronal:{x:0,y:0}, sagittal:{x:0,y:0} };

      // Update crosshair to tumor centroid
      if (STATE.slices.crosshair) {
        STATE.crosshair = {
          cx: STATE.slices.crosshair.cx,
          cy: STATE.slices.crosshair.cy,
        };
      }

      hideOverlays();

      // Default mode after diagnosis: Tumor Overlay
      STATE.viewMode = 'tumor';
      updateModeButtons();
      renderAllSlicesForMode();
      addTumorTo3D(diagnosisData);
      updateInfoBar(diagnosisData);

      console.log('[Atlas4Panel] ✅ Diagnosis loaded | mode:', STATE.viewMode,
        '| heatmap:', !!STATE.imageData.heatmap);
    } else {
      console.warn('[Atlas4Panel] ⚠️  No slice data in diagnosis response');
    }
  }

  // ── util ──
  function ucfirst(s) {
    return s ? s[0].toUpperCase() + s.slice(1) : s;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     EXPORT TO WINDOW
  ══════════════════════════════════════════════════════════════════════════ */
  window.Atlas4PanelViewer = { init, loadDiagnosis, switchViewMode };

})();
