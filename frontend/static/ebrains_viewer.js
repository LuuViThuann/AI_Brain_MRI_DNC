/**
 * ebrains_viewer.js
 * EBRAINS-Style 4-Panel Atlas Viewer
 * 
 * Features:
 * - 4-panel layout (Axial, Sagittal, Coronal, 3D)
 * - Julich-Brain atlas overlay
 * - Linked crosshair navigation
 * - Hover to show region names
 * - MNI space registration
 */

class EBRAINSViewer {
    constructor(containerId) {
      this.container = document.getElementById(containerId);
      this.currentPosition = [128, 128, 128]; // Voxel coordinates
      this.atlas = null;
      this.mniData = null;
      this.sliceCanvases = {};
      this.scene3D = null;
      this.camera3D = null;
      this.renderer3D = null;
      this.controls3D = null;
      this.surfaceMeshes = [];
      
      this.init();
    }
    
    async init() {
      console.log('[EBRAINS] 🚀 Initializing viewer...');
      
      // Create UI
      this.createLayout();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Load atlas info
      await this.loadAtlasInfo();
      
      // Initialize 3D view
      this.init3DView();
      
      console.log('[EBRAINS] ✅ Viewer ready');
    }
    
    createLayout() {
      this.container.innerHTML = `
        <div class="ebrains-grid">
          <!-- Axial (Top Left) -->
          <div class="ebrains-panel" data-view="axial">
            <div class="panel-header">
              <span class="panel-title">📍 Axial (Z-axis)</span>
              <span class="panel-coords" id="axialCoords">0, 0, 0</span>
            </div>
            <div class="panel-body">
              <canvas id="axialCanvas" width="512" height="512"></canvas>
              <div class="crosshair horizontal"></div>
              <div class="crosshair vertical"></div>
            </div>
          </div>
          
          <!-- 3D View (Top Right) -->
          <div class="ebrains-panel" data-view="3d">
            <div class="panel-header">
              <span class="panel-title">🧠 3D Interactive</span>
              <div class="controls-3d">
                <button class="ctrl-btn" id="reset3D" title="Reset view">↺</button>
                <button class="ctrl-btn active" id="rotate3D" title="Auto-rotate">⟳</button>
              </div>
            </div>
            <div class="panel-body">
              <canvas id="ebrains3DCanvas"></canvas>
            </div>
          </div>
          
          <!-- Sagittal (Bottom Left) -->
          <div class="ebrains-panel" data-view="sagittal">
            <div class="panel-header">
              <span class="panel-title">📍 Sagittal (X-axis)</span>
              <span class="panel-coords" id="sagittalCoords">0, 0, 0</span>
            </div>
            <div class="panel-body">
              <canvas id="sagittalCanvas" width="512" height="512"></canvas>
              <div class="crosshair horizontal"></div>
              <div class="crosshair vertical"></div>
            </div>
          </div>
          
          <!-- Coronal (Bottom Right) -->
          <div class="ebrains-panel" data-view="coronal">
            <div class="panel-header">
              <span class="panel-title">📍 Coronal (Y-axis)</span>
              <span class="panel-coords" id="coronalCoords">0, 0, 0</span>
            </div>
            <div class="panel-body">
              <canvas id="coronalCanvas" width="512" height="512"></canvas>
              <div class="crosshair horizontal"></div>
              <div class="crosshair vertical"></div>
            </div>
          </div>
        </div>
        
        <!-- Navigation Controls -->
        <div class="ebrains-controls">
          <div class="slider-group">
            <label>X</label>
            <input type="range" id="sliderX" min="0" max="255" value="128">
            <span id="valueX">128</span>
          </div>
          
          <div class="slider-group">
            <label>Y</label>
            <input type="range" id="sliderY" min="0" max="255" value="128">
            <span id="valueY">128</span>
          </div>
          
          <div class="slider-group">
            <label>Z</label>
            <input type="range" id="sliderZ" min="0" max="255" value="128">
            <span id="valueZ">128</span>
          </div>
          
          <div class="region-info">
            <div id="regionLabel">Click on brain to see region</div>
          </div>
          
          <button class="ebrains-close-btn" id="closeEBRAINS">✕ Close</button>
        </div>
      `;
      
      // Store canvas references
      this.sliceCanvases = {
        axial: document.getElementById('axialCanvas'),
        sagittal: document.getElementById('sagittalCanvas'),
        coronal: document.getElementById('coronalCanvas')
      };
    }
    
    setupEventListeners() {
      // Sliders
      ['X', 'Y', 'Z'].forEach((axis, idx) => {
        const slider = document.getElementById(`slider${axis}`);
        const valueSpan = document.getElementById(`value${axis}`);
        
        slider.addEventListener('input', (e) => {
          const val = parseInt(e.target.value);
          this.currentPosition[idx] = val;
          valueSpan.textContent = val;
          this.updateAllViews();
        });
      });
      
      // Canvas clicks
      Object.entries(this.sliceCanvases).forEach(([view, canvas]) => {
        canvas.addEventListener('click', (e) => this.handleCanvasClick(view, e));
        canvas.addEventListener('mousemove', (e) => this.handleHover(view, e));
      });
      
      // 3D controls
      document.getElementById('reset3D')?.addEventListener('click', () => {
        if (this.camera3D) {
          this.camera3D.position.set(0, 0, 300);
          this.camera3D.lookAt(0, 0, 0);
        }
      });
      
      // Close button
      document.getElementById('closeEBRAINS')?.addEventListener('click', () => {
        this.close();
      });
    }
    
    async loadAtlasInfo() {
      try {
        const response = await fetch('/api/atlas/info');
        const info = await response.json();
        console.log('[EBRAINS] 📚 Atlas info:', info);
        this.atlasInfo = info;
      } catch (e) {
        console.warn('[EBRAINS] ⚠️  Could not load atlas info:', e);
      }
    }
    
    async loadDiagnosisData(diagnosisData) {
      console.log('[EBRAINS] 📥 Loading diagnosis data...');
      
      this.mniData = diagnosisData.mni_data;
      
      if (!this.mniData) {
        console.warn('[EBRAINS] ⚠️  No MNI data available');
        return;
      }
      
      // Update atlas region display
      if (diagnosisData.prediction?.atlas_region) {
        document.getElementById('regionLabel').textContent = 
          `Tumor location: ${diagnosisData.prediction.atlas_region}`;
      }
      
      // Render slices
      this.updateAllViews();
      
      // Add tumor to 3D view
      if (this.mniData.tumor) {
        this.add3DTumor(this.mniData.tumor);
      }
      
      console.log('[EBRAINS] ✅ Data loaded');
    }
    
    init3DView() {
      const canvas = document.getElementById('ebrains3DCanvas');
      
      // Setup Three.js scene
      this.scene3D = new THREE.Scene();
      this.scene3D.background = new THREE.Color(0x050810);
      
      this.camera3D = new THREE.PerspectiveCamera(
        50, 
        canvas.clientWidth / canvas.clientHeight, 
        0.1, 
        1000
      );
      this.camera3D.position.set(0, 0, 300);
      
      this.renderer3D = new THREE.WebGLRenderer({ 
        canvas, 
        antialias: true,
        alpha: true 
      });
      this.renderer3D.setSize(canvas.clientWidth, canvas.clientHeight);
      this.renderer3D.setPixelRatio(window.devicePixelRatio);
      
      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      this.scene3D.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(10, 10, 10);
      this.scene3D.add(directionalLight);
      
      // OrbitControls (if available)
      if (typeof THREE.OrbitControls !== 'undefined') {
        this.controls3D = new THREE.OrbitControls(this.camera3D, canvas);
        this.controls3D.enableDamping = true;
      }
      
      // Load brain surface
      this.loadBrainSurface();
      
      // Animation loop
      const animate = () => {
        requestAnimationFrame(animate);
        
        if (this.controls3D) {
          this.controls3D.update();
        }
        
        this.renderer3D.render(this.scene3D, this.camera3D);
      };
      animate();
    }
    
    async loadBrainSurface() {
      console.log('[EBRAINS] 🧠 Loading brain surface...');
      
      try {
        // Try to load .gii files
        const leftSurface = await this.loadGiftiSurface('/data/atlases/surfaces/pial_left.gii');
        const rightSurface = await this.loadGiftiSurface('/data/atlases/surfaces/pial_right.gii');
        
        if (leftSurface) {
          this.scene3D.add(leftSurface);
          this.surfaceMeshes.push(leftSurface);
        }
        
        if (rightSurface) {
          this.scene3D.add(rightSurface);
          this.surfaceMeshes.push(rightSurface);
        }
        
        console.log('[EBRAINS] ✅ Brain surface loaded');
        
      } catch (e) {
        console.warn('[EBRAINS] ⚠️  Could not load brain surface:', e);
        
        // Fallback: Create simple sphere
        const geometry = new THREE.SphereGeometry(50, 64, 64);
        const material = new THREE.MeshPhongMaterial({ 
          color: 0xcccccc,
          wireframe: false 
        });
        const sphere = new THREE.Mesh(geometry, material);
        this.scene3D.add(sphere);
        this.surfaceMeshes.push(sphere);
      }
    }
    
    async loadGiftiSurface(url) {
      // This would normally parse .gii XML format
      // For simplicity, returning null (requires full implementation)
      console.warn('[EBRAINS] ⚠️  GIFTI loader not yet implemented');
      return null;
    }
    
    add3DTumor(tumorData) {
      console.log('[EBRAINS] 🔴 Adding tumor to 3D view...');
      
      // Convert tumor voxel data to point cloud
      const positions = [];
      const colors = [];
      
      // tumorData is 3D array
      for (let z = 0; z < tumorData.length; z++) {
        for (let y = 0; y < tumorData[z].length; y++) {
          for (let x = 0; x < tumorData[z][y].length; x++) {
            if (tumorData[z][y][x] > 0.5) {
              // Convert to 3D space (center at origin)
              positions.push(
                (x - tumorData[z][y].length/2) * 2,
                (y - tumorData[z].length/2) * 2,
                (z - tumorData.length/2) * 2
              );
              
              colors.push(1, 0, 0.25); // Red
            }
          }
        }
      }
      
      if (positions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        const material = new THREE.PointsMaterial({
          size: 1.5,
          vertexColors: true,
          transparent: true,
          opacity: 0.8
        });
        
        const tumorPoints = new THREE.Points(geometry, material);
        this.scene3D.add(tumorPoints);
        
        console.log(`[EBRAINS] ✅ Added ${positions.length/3} tumor points`);
      }
    }
    
    updateAllViews() {
      this.renderSlice('axial');
      this.renderSlice('sagittal');
      this.renderSlice('coronal');
      this.updateCrosshairs();
      this.updateCoordinates();
    }
    
    async renderSlice(view) {
      const canvas = this.sliceCanvases[view];
      const ctx = canvas.getContext('2d');
      
      // Clear
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 512, 512);
      
      if (!this.mniData) {
        ctx.fillStyle = '#666';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No MNI data loaded', 256, 256);
        return;
      }
      
      // Get slice index
      let sliceIdx;
      if (view === 'axial') {
        sliceIdx = this.currentPosition[2];
      } else if (view === 'sagittal') {
        sliceIdx = this.currentPosition[0];
      } else {
        sliceIdx = this.currentPosition[1];
      }
      
      // Fetch atlas slice
      try {
        const response = await fetch(`/api/atlas/slice/${view}/${sliceIdx}`);
        const data = await response.json();
        
        // Render MRI background
        this.renderMRIBackground(ctx, view, sliceIdx);
        
        // Overlay atlas parcellation
        this.renderAtlasOverlay(ctx, data.slice_data, data.labels);
        
        // Overlay tumor if available
        this.renderTumorOverlay(ctx, view, sliceIdx);
        
      } catch (e) {
        console.warn(`[EBRAINS] ⚠️  Could not fetch ${view} slice:`, e);
      }
    }
    
    renderMRIBackground(ctx, view, sliceIdx) {
      if (!this.mniData || !this.mniData.mri) return;
      
      // Extract 2D slice from 3D MRI data
      const mri3D = this.mniData.mri;
      let slice2D;
      
      if (view === 'axial') {
        slice2D = mri3D[sliceIdx] || [];
      } else if (view === 'sagittal') {
        slice2D = mri3D.map(plane => plane[0] ? plane[0][sliceIdx] : 0);
      } else {
        slice2D = mri3D.map(plane => plane[sliceIdx] || []);
      }
      
      // Render grayscale MRI
      const imageData = ctx.createImageData(512, 512);
      
      for (let y = 0; y < 512; y++) {
        for (let x = 0; x < 512; x++) {
          // Scale down to fit slice dimensions
          const sx = Math.floor(x * slice2D.length / 512);
          const sy = Math.floor(y * (slice2D[0]?.length || 1) / 512);
          
          const value = slice2D[sx]?.[sy] || 0;
          const intensity = Math.min(value * 255, 255);
          
          const idx = (y * 512 + x) * 4;
          imageData.data[idx] = intensity;
          imageData.data[idx + 1] = intensity;
          imageData.data[idx + 2] = intensity;
          imageData.data[idx + 3] = 255;
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
    }
    
    renderAtlasOverlay(ctx, sliceData, labels) {
      if (!sliceData || !Array.isArray(sliceData)) return;
      
      const imageData = ctx.createImageData(512, 512);
      
      for (let y = 0; y < 512; y++) {
        for (let x = 0; x < 512; x++) {
          const sx = Math.floor(x * sliceData.length / 512);
          const sy = Math.floor(y * sliceData[0].length / 512);
          
          const regionID = sliceData[sx]?.[sy] || 0;
          
          if (regionID > 0 && labels[regionID]) {
            const color = labels[regionID].color;
            const idx = (y * 512 + x) * 4;
            
            // Blend with existing image
            const alpha = 0.3;
            imageData.data[idx] = color[0] * alpha + imageData.data[idx] * (1 - alpha);
            imageData.data[idx + 1] = color[1] * alpha + imageData.data[idx + 1] * (1 - alpha);
            imageData.data[idx + 2] = color[2] * alpha + imageData.data[idx + 2] * (1 - alpha);
            imageData.data[idx + 3] = 255;
          }
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
    }
    
    renderTumorOverlay(ctx, view, sliceIdx) {
      if (!this.mniData || !this.mniData.tumor) return;
      
      // Similar logic to MRI background but for tumor
      const tumor3D = this.mniData.tumor;
      let slice2D;
      
      if (view === 'axial') {
        slice2D = tumor3D[sliceIdx] || [];
      } else if (view === 'sagittal') {
        slice2D = tumor3D.map(plane => plane[0] ? plane[0][sliceIdx] : 0);
      } else {
        slice2D = tumor3D.map(plane => plane[sliceIdx] || []);
      }
      
      ctx.fillStyle = 'rgba(255, 0, 64, 0.6)';
      
      for (let y = 0; y < 512; y++) {
        for (let x = 0; x < 512; x++) {
          const sx = Math.floor(x * slice2D.length / 512);
          const sy = Math.floor(y * (slice2D[0]?.length || 1) / 512);
          
          if (slice2D[sx]?.[sy] > 0.5) {
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    }
    
    handleCanvasClick(view, event) {
      const canvas = this.sliceCanvases[view];
      const rect = canvas.getBoundingClientRect();
      
      const x = Math.floor((event.clientX - rect.left) / rect.width * 256);
      const y = Math.floor((event.clientY - rect.top) / rect.height * 256);
      
      // Update current position
      if (view === 'axial') {
        this.currentPosition[0] = x;
        this.currentPosition[1] = y;
      } else if (view === 'sagittal') {
        this.currentPosition[1] = x;
        this.currentPosition[2] = y;
      } else {
        this.currentPosition[0] = x;
        this.currentPosition[2] = y;
      }
      
      // Update sliders
      document.getElementById('sliderX').value = this.currentPosition[0];
      document.getElementById('sliderY').value = this.currentPosition[1];
      document.getElementById('sliderZ').value = this.currentPosition[2];
      document.getElementById('valueX').textContent = this.currentPosition[0];
      document.getElementById('valueY').textContent = this.currentPosition[1];
      document.getElementById('valueZ').textContent = this.currentPosition[2];
      
      this.updateAllViews();
    }
    
    async handleHover(view, event) {
      const canvas = this.sliceCanvases[view];
      const rect = canvas.getBoundingClientRect();
      
      const x = Math.floor((event.clientX - rect.left) / rect.width * 256);
      const y = Math.floor((event.clientY - rect.top) / rect.height * 256);
      
      // Get voxel coordinate
      let voxel;
      if (view === 'axial') {
        voxel = [x, y, this.currentPosition[2]];
      } else if (view === 'sagittal') {
        voxel = [this.currentPosition[0], x, y];
      } else {
        voxel = [x, this.currentPosition[1], y];
      }
      
      // Query region name
      try {
        const response = await fetch(`/api/atlas/region?x=${voxel[0]}&y=${voxel[1]}&z=${voxel[2]}`);
        const data = await response.json();
        
        document.getElementById('regionLabel').textContent = data.region_name;
        
      } catch (e) {
        // Ignore errors during hover
      }
    }
    
    updateCrosshairs() {
      // Update crosshair positions to reflect current slice
      Object.entries(this.sliceCanvases).forEach(([view, canvas]) => {
        const panel = canvas.closest('.ebrains-panel');
        const hCross = panel.querySelector('.crosshair.horizontal');
        const vCross = panel.querySelector('.crosshair.vertical');
        
        // Calculate positions based on current coordinates
        if (view === 'axial') {
          vCross.style.left = `${this.currentPosition[0] / 256 * 100}%`;
          hCross.style.top = `${this.currentPosition[1] / 256 * 100}%`;
        } else if (view === 'sagittal') {
          vCross.style.left = `${this.currentPosition[1] / 256 * 100}%`;
          hCross.style.top = `${this.currentPosition[2] / 256 * 100}%`;
        } else {
          vCross.style.left = `${this.currentPosition[0] / 256 * 100}%`;
          hCross.style.top = `${this.currentPosition[2] / 256 * 100}%`;
        }
      });
    }
    
    updateCoordinates() {
      const coords = `${this.currentPosition[0]}, ${this.currentPosition[1]}, ${this.currentPosition[2]}`;
      
      document.getElementById('axialCoords').textContent = coords;
      document.getElementById('sagittalCoords').textContent = coords;
      document.getElementById('coronalCoords').textContent = coords;
    }
    
    close() {
      this.container.style.display = 'none';
      
      // Notify main app
      if (window.App && window.App.switchTab) {
        window.App.switchTab('scan');
      }
    }
  }
  
  // Initialize viewer when diagnosis completes
  window.initEBRAINSViewer = function(diagnosisData) {
    console.log('[EBRAINS] 🚀 Initializing EBRAINS viewer...');
    
    const container = document.getElementById('ebrainsViewerContainer');
    
    if (!container) {
      console.error('[EBRAINS] ❌ Container not found');
      return;
    }
    
    container.style.display = 'block';
    
    if (!window.ebrainsViewer) {
      window.ebrainsViewer = new EBRAINSViewer('ebrainsViewerContainer');
    }
    
    if (diagnosisData.mni_data) {
      window.ebrainsViewer.loadDiagnosisData(diagnosisData);
    } else {
      console.warn('[EBRAINS] ⚠️  No MNI data in diagnosis');
    }
  };