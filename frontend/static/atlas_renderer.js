/**
 * atlas_renderer.js
 * Optimized Atlas Rendering Engine
 * 
 * Features:
 * - Efficient atlas parcellation rendering
 * - Color mapping with transparency
 * - Region highlighting on hover
 * - Multi-layer compositing (MRI + Atlas + Tumor)
 * - Caching for performance
 */

class AtlasRenderer {
    constructor() {
      this.atlasCache = new Map();
      this.colorMap = new Map();
      this.highlightedRegion = null;
      
      // Color schemes
      this.colorSchemes = {
        julich: this.generateJulichColors(),
        rainbow: this.generateRainbowColors(),
        anatomical: this.generateAnatomicalColors()
      };
      
      this.currentScheme = 'julich';
    }
    
    /**
     * Render multi-layer brain slice
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} layers - { mri, atlas, tumor }
     * @param {Object} options - Rendering options
     */
    renderComposite(ctx, layers, options = {}) {
      const {
        width = 512,
        height = 512,
        mriOpacity = 1.0,
        atlasOpacity = 0.4,
        tumorOpacity = 0.7,
        showAtlas = true,
        showTumor = true,
        highlightRegion = null
      } = options;
      
      // Create composite image data
      const imageData = ctx.createImageData(width, height);
      const data = imageData.data;
      
      // Layer 1: MRI Background (grayscale)
      if (layers.mri) {
        this.renderMRILayer(data, layers.mri, width, height, mriOpacity);
      }
      
      // Layer 2: Atlas Parcellation (colored regions)
      if (showAtlas && layers.atlas) {
        this.renderAtlasLayer(
          data, 
          layers.atlas, 
          width, 
          height, 
          atlasOpacity,
          highlightRegion
        );
      }
      
      // Layer 3: Tumor Overlay (red)
      if (showTumor && layers.tumor) {
        this.renderTumorLayer(data, layers.tumor, width, height, tumorOpacity);
      }
      
      // Put to canvas
      ctx.putImageData(imageData, 0, 0);
    }
    
    /**
     * Render MRI grayscale layer
     */
    renderMRILayer(data, mriSlice, width, height, opacity) {
      const mriHeight = mriSlice.length;
      const mriWidth = mriSlice[0]?.length || 0;
      
      if (mriWidth === 0) return;
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          // Map canvas coords to MRI coords
          const mx = Math.floor(x * mriWidth / width);
          const my = Math.floor(y * mriHeight / height);
          
          const value = mriSlice[my]?.[mx] || 0;
          
          // Normalize and apply windowing
          const intensity = this.applyWindowLevel(value, {
            level: 128,
            window: 256
          });
          
          const idx = (y * width + x) * 4;
          data[idx] = intensity;
          data[idx + 1] = intensity;
          data[idx + 2] = intensity;
          data[idx + 3] = 255 * opacity;
        }
      }
    }
    
    /**
     * Render atlas parcellation layer
     */
    renderAtlasLayer(data, atlasSlice, width, height, opacity, highlightRegion) {
      const atlasHeight = atlasSlice.slice_data?.length || 0;
      const atlasWidth = atlasSlice.slice_data?.[0]?.length || 0;
      
      if (atlasWidth === 0) return;
      
      const labels = atlasSlice.labels || {};
      const sliceData = atlasSlice.slice_data;
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const ax = Math.floor(x * atlasWidth / width);
          const ay = Math.floor(y * atlasHeight / height);
          
          const regionID = sliceData[ay]?.[ax] || 0;
          
          if (regionID > 0) {
            const idx = (y * width + x) * 4;
            
            // Get region color
            let color = this.getRegionColor(regionID, labels);
            
            // Highlight if selected
            if (highlightRegion && regionID === highlightRegion) {
              color = this.brightenColor(color, 1.5);
              opacity = Math.min(opacity * 1.5, 0.8);
            }
            
            // Alpha blend
            const alpha = opacity;
            data[idx] = color[0] * alpha + data[idx] * (1 - alpha);
            data[idx + 1] = color[1] * alpha + data[idx + 1] * (1 - alpha);
            data[idx + 2] = color[2] * alpha + data[idx + 2] * (1 - alpha);
            data[idx + 3] = 255;
          }
        }
      }
    }
    
    /**
     * Render tumor overlay layer
     */
    renderTumorLayer(data, tumorSlice, width, height, opacity) {
      const tumorHeight = tumorSlice.length;
      const tumorWidth = tumorSlice[0]?.length || 0;
      
      if (tumorWidth === 0) return;
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const tx = Math.floor(x * tumorWidth / width);
          const ty = Math.floor(y * tumorHeight / height);
          
          const value = tumorSlice[ty]?.[tx] || 0;
          
          if (value > 0.5) {
            const idx = (y * width + x) * 4;
            
            // Vivid red tumor color
            const tumorColor = [255, 0, 64];
            const alpha = opacity * value; // Use value as alpha for smooth edges
            
            data[idx] = tumorColor[0] * alpha + data[idx] * (1 - alpha);
            data[idx + 1] = tumorColor[1] * alpha + data[idx + 1] * (1 - alpha);
            data[idx + 2] = tumorColor[2] * alpha + data[idx + 2] * (1 - alpha);
          }
        }
      }
    }
    
    /**
     * Get color for a brain region
     */
    getRegionColor(regionID, labels) {
      // Check cache first
      const cacheKey = `${regionID}_${this.currentScheme}`;
      if (this.colorMap.has(cacheKey)) {
        return this.colorMap.get(cacheKey);
      }
      
      let color;
      
      // Try to get color from labels
      if (labels[regionID] && labels[regionID].color) {
        color = labels[regionID].color;
      } else {
        // Generate color from ID using color scheme
        color = this.colorSchemes[this.currentScheme][regionID % this.colorSchemes[this.currentScheme].length];
      }
      
      // Cache it
      this.colorMap.set(cacheKey, color);
      
      return color;
    }
    
    /**
     * Apply window/level to intensity value
     */
    applyWindowLevel(value, settings) {
      const { level, window } = settings;
      
      const min = level - window / 2;
      const max = level + window / 2;
      
      if (value <= min) return 0;
      if (value >= max) return 255;
      
      return Math.floor(((value - min) / window) * 255);
    }
    
    /**
     * Brighten a color
     */
    brightenColor(color, factor) {
      return [
        Math.min(color[0] * factor, 255),
        Math.min(color[1] * factor, 255),
        Math.min(color[2] * factor, 255)
      ];
    }
    
    /**
     * Generate Julich-Brain color scheme
     */
    generateJulichColors() {
      // Anatomically meaningful colors
      return [
        [255, 100, 100], // Red - Motor areas
        [100, 255, 100], // Green - Sensory areas
        [100, 100, 255], // Blue - Visual areas
        [255, 255, 100], // Yellow - Association areas
        [255, 100, 255], // Magenta - Limbic areas
        [100, 255, 255], // Cyan - Prefrontal areas
        [255, 150, 100], // Orange - Parietal areas
        [150, 100, 255], // Purple - Temporal areas
      ];
    }
    
    /**
     * Generate rainbow color scheme
     */
    generateRainbowColors() {
      const colors = [];
      for (let i = 0; i < 256; i++) {
        const hue = i / 256;
        colors.push(this.hslToRgb(hue, 0.8, 0.6));
      }
      return colors;
    }
    
    /**
     * Generate anatomical color scheme
     */
    generateAnatomicalColors() {
      return {
        frontal: [255, 150, 150],
        parietal: [150, 255, 150],
        temporal: [150, 150, 255],
        occipital: [255, 255, 150],
        limbic: [255, 150, 255],
        basal_ganglia: [150, 255, 255],
        thalamus: [255, 200, 150],
        cerebellum: [200, 150, 255]
      };
    }
    
    /**
     * HSL to RGB conversion
     */
    hslToRgb(h, s, l) {
      let r, g, b;
      
      if (s === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p, q, t) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };
        
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }
      
      return [
        Math.round(r * 255),
        Math.round(g * 255),
        Math.round(b * 255)
      ];
    }
    
    /**
     * Create region outline
     */
    createRegionOutline(atlasSlice, regionID) {
      const sliceData = atlasSlice.slice_data;
      const height = sliceData.length;
      const width = sliceData[0]?.length || 0;
      
      const outline = [];
      
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          if (sliceData[y][x] === regionID) {
            // Check if on boundary
            const isEdge = (
              sliceData[y-1][x] !== regionID ||
              sliceData[y+1][x] !== regionID ||
              sliceData[y][x-1] !== regionID ||
              sliceData[y][x+1] !== regionID
            );
            
            if (isEdge) {
              outline.push([x, y]);
            }
          }
        }
      }
      
      return outline;
    }
    
    /**
     * Draw region outline on canvas
     */
    drawRegionOutline(ctx, outline, width, height, color = '#00e5ff', lineWidth = 2) {
      if (outline.length === 0) return;
      
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      
      ctx.beginPath();
      
      for (let i = 0; i < outline.length; i++) {
        const [x, y] = outline[i];
        const canvasX = x * width / outline[0].length;
        const canvasY = y * height / outline.length;
        
        if (i === 0) {
          ctx.moveTo(canvasX, canvasY);
        } else {
          ctx.lineTo(canvasX, canvasY);
        }
      }
      
      ctx.stroke();
    }
    
    /**
     * Clear cache
     */
    clearCache() {
      this.atlasCache.clear();
      this.colorMap.clear();
    }
    
    /**
     * Set color scheme
     */
    setColorScheme(scheme) {
      if (this.colorSchemes[scheme]) {
        this.currentScheme = scheme;
        this.colorMap.clear(); // Clear cache when scheme changes
      }
    }
  }
  
  // Export singleton instance
  window.AtlasRenderer = window.AtlasRenderer || new AtlasRenderer();