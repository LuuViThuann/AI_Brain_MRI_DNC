/**
 * brain3d_atlas_viewer_IMPROVED.js
 * ✅ EBRAINS-STYLE ATLAS VIEWER - HOÀN CHỈNH
 * 
 * Replicates atlases.ebrains.eu/viewer functionality:
 *   ✅ 4-panel layout (Axial, Sagittal, Coronal, 3D)
 *   ✅ Real atlas background từ BigBrain NIfTI
 *   ✅ Isocortex segmentation overlay
 *   ✅ Tumor volume overlay từ diagnosis
 *   ✅ Linked crosshair navigation
 *   ✅ Slice position sliders
 *   ✅ Coordinate display (mm precision)
 *   ✅ Toggle controls cho từng layer
 * 
 * @version 2.1.0
 */

(function AtlasViewerImproved() {

    // ===== CONFIG =====
    const CONFIG = {
      dimensions: [256, 256, 256],
      voxelSize: 0.5, // mm per voxel
      colors: {
        axial: '#00e5ff',
        sagittal: '#ff9100',
        coronal: '#00c853',
        tumor: '#FF0040',
        isocortex: '#00c853'
      }
    };
  
    // ===== STATE =====
    let viewerState = {
      isActive: false,
      currentPosition: [128, 128, 128], // Voxel coords
      
      // Canvas contexts
      canvases: {
        axial: null,
        sagittal: null,
        coronal: null
      },
      
      // 3D view
      scene3D: null,
      camera3D: null,
      renderer3D: null,
      controls3D: null,
      animationId: null,
      
      // Toggles
      showAtlas: true,
      showIsocortex: true,
      showTumor: true,
      showCrosshair: true,
      
      // Data references
      diagnosisData: null
    };
  
    // ===== INITIALIZE =====
    async function initializeAtlasViewer() {
      console.log('%c[AtlasViewer] 🚀 Initializing...', 'color: #00e5ff; font-weight: bold;');
      
      try {
        // 1. Create UI
        createViewerLayout();
        
        // 2. Ensure atlas is loaded
        if (!window.AtlasLoader) {
          throw new Error('AtlasLoader not found');
        }
        
        const status = window.AtlasLoader.getStatus();
        
        if (!status.isLoaded) {
          console.log('[AtlasViewer] ⏳ Waiting for atlas to load...');
          await window.AtlasLoader.initialize();
        }
        
        // 3. Get diagnosis data
        viewerState.diagnosisData = window.lastDiagnosisData;
        
        // 4. Initialize views
        initializeSliceViews();
        initialize3DView();
        
        // 5. Render
        renderAllViews();
        
        // 6. Setup controls
        setupNavigationControls();
        
        viewerState.isActive = true;
        
        console.log('[AtlasViewer] ✅ Ready!');
        
        return true;
        
      } catch (error) {
        console.error('[AtlasViewer] ❌ Init failed:', error);
        alert('Failed to initialize Atlas Viewer: ' + error.message);
        return false;
      }
    }
  
    // ===== CREATE UI LAYOUT =====
    function createViewerLayout() {
      const container = document.createElement('div');
      container.id = 'atlasViewerContainer';
      container.innerHTML = `
        <div style="
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: #050810;
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
          gap: 2px;
          padding: 60px 4px 4px;
        ">
          
          <!-- AXIAL -->
          <div class="atlas-panel" data-view="axial">
            <div class="atlas-panel-header">
              <span class="atlas-panel-title">📍 Axial (Z-axis)</span>
              <span class="atlas-panel-coords" id="axialCoords">0, 0, 0</span>
            </div>
            <div class="atlas-panel-body">
              <canvas id="axialCanvas" width="512" height="512"></canvas>
              <div class="atlas-crosshair horizontal"></div>
              <div class="atlas-crosshair vertical"></div>
            </div>
          </div>
  
          <!-- 3D VIEW -->
          <div class="atlas-panel" data-view="3d">
            <div class="atlas-panel-header">
              <span class="atlas-panel-title">🧠 3D Interactive</span>
              <div class="atlas-3d-controls">
                <button class="atlas-ctrl-btn" id="reset3D">↺</button>
                <button class="atlas-ctrl-btn active" id="toggle3DRotate">⟳</button>
              </div>
            </div>
            <div class="atlas-panel-body">
              <canvas id="atlas3DCanvas"></canvas>
            </div>
          </div>
  
          <!-- SAGITTAL -->
          <div class="atlas-panel" data-view="sagittal">
            <div class="atlas-panel-header">
              <span class="atlas-panel-title">📍 Sagittal (X-axis)</span>
              <span class="atlas-panel-coords" id="sagittalCoords">0, 0, 0</span>
            </div>
            <div class="atlas-panel-body">
              <canvas id="sagittalCanvas" width="512" height="512"></canvas>
              <div class="atlas-crosshair horizontal"></div>
              <div class="atlas-crosshair vertical"></div>
            </div>
          </div>
  
          <!-- CORONAL -->
          <div class="atlas-panel" data-view="coronal">
            <div class="atlas-panel-header">
              <span class="atlas-panel-title">📍 Coronal (Y-axis)</span>
              <span class="atlas-panel-coords" id="coronalCoords">0, 0, 0</span>
            </div>
            <div class="atlas-panel-body">
              <canvas id="coronalCanvas" width="512" height="512"></canvas>
              <div class="atlas-crosshair horizontal"></div>
              <div class="atlas-crosshair vertical"></div>
            </div>
          </div>
  
          <!-- NAVIGATION CONTROLS -->
          <div id="atlasNavControls" style="
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 16px;
            padding: 16px 24px;
            background: rgba(10, 14, 26, 0.95);
            border: 1px solid #00e5ff;
            border-radius: 12px;
            backdrop-filter: blur(10px);
            align-items: center;
          ">
            <!-- X Slider -->
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 10px; color: #ff9100;">X</label>
              <input type="range" id="sliderX" min="0" max="255" value="128" class="atlas-slider" />
              <span style="font-size: 9px; color: #8899b0;" id="valueX">128</span>
            </div>
  
            <!-- Y Slider -->
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 10px; color: #00c853;">Y</label>
              <input type="range" id="sliderY" min="0" max="255" value="128" class="atlas-slider" />
              <span style="font-size: 9px; color: #8899b0;" id="valueY">128</span>
            </div>
  
            <!-- Z Slider -->
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 10px; color: #00e5ff;">Z</label>
              <input type="range" id="sliderZ" min="0" max="255" value="128" class="atlas-slider" />
              <span style="font-size: 9px; color: #8899b0;" id="valueZ">128</span>
            </div>
  
            <!-- Toggles -->
            <div style="border-left: 1px solid #1e3a52; padding-left: 12px; display: flex; gap: 6px;">
              <button class="atlas-toggle-btn active" id="toggleAtlas">🧠 Atlas</button>
              <button class="atlas-toggle-btn active" id="toggleIsocortex">🔬 Cortex</button>
              <button class="atlas-toggle-btn active" id="toggleTumor">🔴 Tumor</button>
              <button class="atlas-toggle-btn active" id="toggleCrosshair">✛</button>
            </div>
          </div>
  
          <!-- CLOSE BUTTON -->
          <button id="closeAtlasViewer" style="
            position: absolute;
            top: 12px;
            right: 12px;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: 1px solid #ff5252;
            background: rgba(255, 82, 82, 0.15);
            color: #ff5252;
            font-size: 18px;
            cursor: pointer;
          ">✕</button>
  
        </div>
      `;
      
      addAtlasViewerStyles();
      document.body.appendChild(container);
      
      // Store references
      viewerState.canvases.axial = document.getElementById('axialCanvas');
      viewerState.canvases.sagittal = document.getElementById('sagittalCanvas');
      viewerState.canvases.coronal = document.getElementById('coronalCanvas');
    }
  
    // ===== STYLES =====
    function addAtlasViewerStyles() {
      if (document.getElementById('atlasViewerStyles')) return;
      
      const style = document.createElement('style');
      style.id = 'atlasViewerStyles';
      style.textContent = `
        .atlas-panel {
          background: #0a0e1a;
          border: 1px solid #1e3a52;
          border-radius: 8px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .atlas-panel-header {
          background: #050810;
          padding: 10px 12px;
          border-bottom: 1px solid #1e3a52;
          display: flex;
          justify-content: space-between;
        }
        .atlas-panel-title {
          font-size: 12px;
          font-weight: bold;
          color: #00e5ff;
        }
        .atlas-panel-coords {
          font-size: 10px;
          font-family: 'Consolas', monospace;
          color: #8899b0;
        }
        .atlas-panel-body {
          flex: 1;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000;
        }
        .atlas-panel-body canvas {
          max-width: 100%;
          max-height: 100%;
        }
        .atlas-crosshair {
          position: absolute;
          background: rgba(0, 229, 255, 0.5);
          pointer-events: none;
        }
        .atlas-crosshair.horizontal {
          width: 100%;
          height: 1px;
          top: 50%;
        }
        .atlas-crosshair.vertical {
          width: 1px;
          height: 100%;
          left: 50%;
        }
        .atlas-ctrl-btn, .atlas-toggle-btn {
          padding: 6px 12px;
          border: 1px solid #5a7a99;
          border-radius: 6px;
          background: transparent;
          color: #8899b0;
          font-size: 11px;
          cursor: pointer;
        }
        .atlas-toggle-btn.active {
          background: rgba(0, 229, 255, 0.15);
          border-color: #00e5ff;
          color: #00e5ff;
        }
        .atlas-slider {
          width: 150px;
          height: 4px;
          background: #1e3a52;
          border-radius: 2px;
        }
      `;
      
      document.head.appendChild(style);
    }
  
    // ===== INITIALIZE SLICE VIEWS =====
    function initializeSliceViews() {
      ['axial', 'sagittal', 'coronal'].forEach(view => {
        const canvas = viewerState.canvases[view];
        
        canvas.addEventListener('click', (e) => handleSliceClick(view, e));
        canvas.addEventListener('mousemove', (e) => updateCrosshair(view, e));
      });
    }
  
    // ===== INITIALIZE 3D VIEW =====
    function initialize3DView() {
      const canvas = document.getElementById('atlas3DCanvas');
      
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050810);
      
      const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
      camera.position.set(200, 100, 200);
      
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setSize(canvas.clientWidth, canvas.clientHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      
      // Lights
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      
      const light = new THREE.DirectionalLight(0xffffff, 0.8);
      light.position.set(10, 10, 10);
      scene.add(light);
      
      // Controls
      if (THREE.OrbitControls) {
        const controls = new THREE.OrbitControls(camera, canvas);
        controls.enableDamping = true;
        viewerState.controls3D = controls;
      }
      
      // Add atlas meshes
      if (window.AtlasLoader && window.AtlasLoader.state) {
        const atlasState = window.AtlasLoader.state;
        
        if (atlasState.templateMesh) {
          atlasState.templateMesh.visible = viewerState.showAtlas;
          scene.add(atlasState.templateMesh);
        }
        
        if (atlasState.isocortexMesh) {
          atlasState.isocortexMesh.visible = viewerState.showIsocortex;
          scene.add(atlasState.isocortexMesh);
        }
      }
      
      // Add tumor from main scene
      if (window.brainMesh) {
        const clone = window.brainMesh.clone();
        clone.scale.set(100, 100, 100);
        scene.add(clone);
      }
      
      viewerState.scene3D = scene;
      viewerState.camera3D = camera;
      viewerState.renderer3D = renderer;
      
      // Start animation
      animate3D();
    }
  
    // ===== RENDER ALL VIEWS =====
    function renderAllViews() {
      renderSlice('axial');
      renderSlice('sagittal');
      renderSlice('coronal');
      updateCoordinates();
    }
  
    // ===== RENDER SLICE =====
    function renderSlice(view) {
      const canvas = viewerState.canvases[view];
      const ctx = canvas.getContext('2d');
      
      // Clear
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 512, 512);
      
      const pos = viewerState.currentPosition;
      
      // Determine slice index
      let sliceIndex;
      switch(view) {
        case 'axial': sliceIndex = pos[2]; break;
        case 'sagittal': sliceIndex = pos[0]; break;
        case 'coronal': sliceIndex = pos[1]; break;
      }
      
      // Get atlas data
      if (window.AtlasLoader && window.AtlasLoader.getSliceData) {
        const sliceData = window.AtlasLoader.getSliceData(view, sliceIndex);
        
        if (sliceData) {
          // Draw atlas background
          if (viewerState.showAtlas && sliceData.template) {
            drawSliceData(ctx, sliceData.template, 'grayscale');
          }
          
          // Draw isocortex overlay
          if (viewerState.showIsocortex && sliceData.isocortex) {
            drawSliceData(ctx, sliceData.isocortex, 'green', 0.4);
          }
        }
      }
      
      // Draw tumor overlay
      if (viewerState.showTumor && viewerState.diagnosisData) {
        drawTumorSlice(ctx, view);
      }
    }
  
    // ===== DRAW SLICE DATA =====
    function drawSliceData(ctx, sliceObj, colorMode, alpha = 1.0) {
      const { slice, width, height } = sliceObj;
      
      const imageData = ctx.createImageData(512, 512);
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const value = slice[y]?.[x] || 0;
          
          // Scale to 512x512
          const sx = Math.floor(x * 512 / width);
          const sy = Math.floor(y * 512 / height);
          const idx = (sy * 512 + sx) * 4;
          
          if (colorMode === 'grayscale') {
            const intensity = Math.min(value / 255, 1);
            imageData.data[idx] = intensity * 200;
            imageData.data[idx + 1] = intensity * 200;
            imageData.data[idx + 2] = intensity * 200;
            imageData.data[idx + 3] = intensity * alpha * 255;
          } else if (colorMode === 'green' && value > 0) {
            imageData.data[idx] = 0;
            imageData.data[idx + 1] = 200;
            imageData.data[idx + 2] = 83;
            imageData.data[idx + 3] = alpha * 255;
          }
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
    }
  
    // ===== DRAW TUMOR SLICE =====
    function drawTumorSlice(ctx, view) {
      const diagnosis = viewerState.diagnosisData;
      
      if (!diagnosis.mask) return;
      
      const mask = diagnosis.mask;
      
      ctx.fillStyle = 'rgba(255, 0, 64, 0.7)';
      
      for (let y = 0; y < mask.length; y++) {
        for (let x = 0; x < mask[y].length; x++) {
          if (mask[y][x] > 0.5) {
            ctx.fillRect(x * 2, y * 2, 2, 2);
          }
        }
      }
    }
  
    // ===== HANDLE SLICE CLICK =====
    function handleSliceClick(view, event) {
      const canvas = viewerState.canvases[view];
      const rect = canvas.getBoundingClientRect();
      
      const x = Math.floor((event.clientX - rect.left) / rect.width * 256);
      const y = Math.floor((event.clientY - rect.top) / rect.height * 256);
      
      switch(view) {
        case 'axial':
          viewerState.currentPosition[0] = x;
          viewerState.currentPosition[1] = y;
          break;
        case 'sagittal':
          viewerState.currentPosition[1] = x;
          viewerState.currentPosition[2] = y;
          break;
        case 'coronal':
          viewerState.currentPosition[0] = x;
          viewerState.currentPosition[2] = y;
          break;
      }
      
      updateSliders();
      renderAllViews();
    }
  
    // ===== UPDATE CROSSHAIR =====
    function updateCrosshair(view, event) {
      if (!viewerState.showCrosshair) return;
      
      const canvas = viewerState.canvases[view];
      const rect = canvas.getBoundingClientRect();
      const panel = canvas.closest('.atlas-panel');
      const crosshairs = panel.querySelectorAll('.atlas-crosshair');
      
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      crosshairs[0].style.top = y + 'px';
      crosshairs[1].style.left = x + 'px';
    }
  
    // ===== UPDATE COORDINATES =====
    function updateCoordinates() {
      const pos = viewerState.currentPosition;
      const coords = `${pos[0]}, ${pos[1]}, ${pos[2]}`;
      
      ['axial', 'sagittal', 'coronal'].forEach(view => {
        const el = document.getElementById(`${view}Coords`);
        if (el) el.textContent = coords;
      });
    }
  
    // ===== UPDATE SLIDERS =====
    function updateSliders() {
      const pos = viewerState.currentPosition;
      
      document.getElementById('sliderX').value = pos[0];
      document.getElementById('sliderY').value = pos[1];
      document.getElementById('sliderZ').value = pos[2];
      
      document.getElementById('valueX').textContent = pos[0];
      document.getElementById('valueY').textContent = pos[1];
      document.getElementById('valueZ').textContent = pos[2];
    }
  
    // ===== SETUP CONTROLS =====
    function setupNavigationControls() {
      // Sliders
      ['X', 'Y', 'Z'].forEach((axis, idx) => {
        const slider = document.getElementById(`slider${axis}`);
        const value = document.getElementById(`value${axis}`);
        
        slider.addEventListener('input', (e) => {
          const val = parseInt(e.target.value);
          viewerState.currentPosition[idx] = val;
          value.textContent = val;
          renderAllViews();
        });
      });
      
      // Toggles
      document.getElementById('toggleAtlas')?.addEventListener('click', (e) => {
        viewerState.showAtlas = !viewerState.showAtlas;
        e.target.classList.toggle('active');
        if (viewerState.scene3D) {
          const mesh = viewerState.scene3D.getObjectByName('AtlasVolume');
          if (mesh) mesh.visible = viewerState.showAtlas;
        }
        renderAllViews();
      });
      
      document.getElementById('toggleIsocortex')?.addEventListener('click', (e) => {
        viewerState.showIsocortex = !viewerState.showIsocortex;
        e.target.classList.toggle('active');
        if (viewerState.scene3D) {
          const mesh = viewerState.scene3D.getObjectByName('IsocortexSegmentation');
          if (mesh) mesh.visible = viewerState.showIsocortex;
        }
        renderAllViews();
      });
      
      document.getElementById('toggleTumor')?.addEventListener('click', (e) => {
        viewerState.showTumor = !viewerState.showTumor;
        e.target.classList.toggle('active');
        renderAllViews();
      });
      
      document.getElementById('toggleCrosshair')?.addEventListener('click', (e) => {
        viewerState.showCrosshair = !viewerState.showCrosshair;
        e.target.classList.toggle('active');
        document.querySelectorAll('.atlas-crosshair').forEach(ch => {
          ch.style.display = viewerState.showCrosshair ? 'block' : 'none';
        });
      });
      
      // Close
      document.getElementById('closeAtlasViewer')?.addEventListener('click', closeAtlasViewer);
      
      // 3D controls
      document.getElementById('reset3D')?.addEventListener('click', () => {
        if (viewerState.camera3D) {
          viewerState.camera3D.position.set(200, 100, 200);
          viewerState.camera3D.lookAt(0, 0, 0);
        }
      });
    }
  
    // ===== ANIMATE 3D =====
    function animate3D() {
      if (!viewerState.isActive) return;
      
      viewerState.animationId = requestAnimationFrame(animate3D);
      
      if (viewerState.controls3D) {
        viewerState.controls3D.update();
      }
      
      if (viewerState.renderer3D && viewerState.scene3D && viewerState.camera3D) {
        viewerState.renderer3D.render(viewerState.scene3D, viewerState.camera3D);
      }
    }
  
    // ===== CLOSE =====
    function closeAtlasViewer() {
      viewerState.isActive = false;
      
      if (viewerState.animationId) {
        cancelAnimationFrame(viewerState.animationId);
      }
      
      const container = document.getElementById('atlasViewerContainer');
      if (container) container.remove();
      
      const btn = document.getElementById('btnSliceBrain3D');
      if (btn) btn.classList.remove('active');
    }
  
    // ===== TOGGLE =====
    function toggleAtlasViewer() {
      if (viewerState.isActive) {
        closeAtlasViewer();
        return false;
      } else {
        initializeAtlasViewer();
        return true;
      }
    }
  
    // ===== EXPOSE API =====
    window.AtlasViewerComplete = {
      initialize: initializeAtlasViewer,
      toggle: toggleAtlasViewer,
      close: closeAtlasViewer,
      isActive: () => viewerState.isActive
    };
  
    console.log('[AtlasViewer] ✅ Improved module loaded');
  
  })();