/**
 * surface_loader.js
 * GIFTI Brain Surface Loader for Three.js
 * 
 * Features:
 * - Parse GIFTI (.gii) XML format
 * - Extract vertices and triangles
 * - Create Three.js meshes
 * - Support for compressed (gzip) files
 * - Color/texture mapping
 */

class SurfaceLoader {
    constructor() {
      this.cache = new Map();
      this.loadingQueue = new Map();
    }
    
    /**
     * Load GIFTI surface file
     * @param {string} url - URL to .gii or .gii.gz file
     * @param {Object} options - Loading options
     * @returns {Promise<THREE.Mesh>}
     */
    async loadSurface(url, options = {}) {
      const {
        color = 0xcccccc,
        opacity = 1.0,
        wireframe = false,
        flatShading = false,
        side = THREE.DoubleSide
      } = options;
      
      console.log(`[SurfaceLoader] 📥 Loading surface: ${url}`);
      
      // Check cache
      if (this.cache.has(url)) {
        console.log(`[SurfaceLoader] ✅ Using cached surface`);
        return this.cache.get(url).clone();
      }
      
      // Check if already loading
      if (this.loadingQueue.has(url)) {
        console.log(`[SurfaceLoader] ⏳ Waiting for ongoing load...`);
        return this.loadingQueue.get(url);
      }
      
      // Start loading
      const loadPromise = this._loadSurfaceInternal(url, options);
      this.loadingQueue.set(url, loadPromise);
      
      try {
        const mesh = await loadPromise;
        this.cache.set(url, mesh);
        this.loadingQueue.delete(url);
        
        console.log(`[SurfaceLoader] ✅ Surface loaded successfully`);
        return mesh.clone();
        
      } catch (error) {
        this.loadingQueue.delete(url);
        throw error;
      }
    }
    
    /**
     * Internal loading method
     */
    async _loadSurfaceInternal(url, options) {
      try {
        // Fetch file
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Get as array buffer
        const arrayBuffer = await response.arrayBuffer();
        let data = new Uint8Array(arrayBuffer);
        
        // Check if gzipped
        const isGzipped = data[0] === 0x1f && data[1] === 0x8b;
        
        if (isGzipped) {
          console.log(`[SurfaceLoader] 🗜️  Decompressing gzip...`);
          
          if (typeof pako === 'undefined') {
            throw new Error('Pako library required for gzip decompression');
          }
          
          try {
            data = pako.inflate(data);
          } catch (e) {
            throw new Error(`Gzip decompression failed: ${e.message}`);
          }
        }
        
        // Parse GIFTI XML
        const xmlString = new TextDecoder('utf-8').decode(data);
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, 'text/xml');
        
        // Check for parse errors
        const parserError = doc.querySelector('parsererror');
        if (parserError) {
          throw new Error(`XML parse error: ${parserError.textContent}`);
        }
        
        // Extract geometry data
        const geometryData = this.parseGIFTI(doc);
        
        // Create Three.js mesh
        const mesh = this.createMesh(geometryData, options);
        
        return mesh;
        
      } catch (error) {
        console.error(`[SurfaceLoader] ❌ Error loading surface:`, error);
        throw error;
      }
    }
    
    /**
     * Parse GIFTI XML document
     */
    parseGIFTI(doc) {
      console.log(`[SurfaceLoader] 📋 Parsing GIFTI XML...`);
      
      // Get all DataArray elements
      const dataArrays = doc.querySelectorAll('DataArray');
      
      let vertices = null;
      let triangles = null;
      let normals = null;
      let colors = null;
      
      // Parse each DataArray
      for (const dataArray of dataArrays) {
        const intent = dataArray.getAttribute('Intent');
        const dataType = dataArray.getAttribute('DataType');
        const encoding = dataArray.getAttribute('Encoding');
        const dimensionality = parseInt(dataArray.getAttribute('Dimensionality') || '1');
        const dims = this.parseDimensions(dataArray);
        
        console.log(`[SurfaceLoader]   • Intent: ${intent}, DataType: ${dataType}, Dims: ${dims}`);
        
        // Decode data
        const decodedData = this.decodeData(dataArray, dataType, encoding);
        
        // Assign based on intent
        if (intent === 'NIFTI_INTENT_POINTSET') {
          vertices = this.reshapeData(decodedData, dims, 3); // Nx3 vertices
        } else if (intent === 'NIFTI_INTENT_TRIANGLE') {
          triangles = this.reshapeData(decodedData, dims, 3); // Nx3 triangles
        } else if (intent === 'NIFTI_INTENT_VECTOR') {
          normals = this.reshapeData(decodedData, dims, 3); // Nx3 normals
        } else if (intent === 'NIFTI_INTENT_RGB_VECTOR') {
          colors = this.reshapeData(decodedData, dims, 3); // Nx3 colors
        }
      }
      
      if (!vertices || !triangles) {
        throw new Error('GIFTI file missing required geometry data (vertices or triangles)');
      }
      
      console.log(`[SurfaceLoader] ✅ Parsed ${vertices.length/3} vertices, ${triangles.length/3} triangles`);
      
      return {
        vertices,
        triangles,
        normals,
        colors
      };
    }
    
    /**
     * Parse dimension string
     */
    parseDimensions(dataArray) {
      const dimElements = dataArray.querySelectorAll('Dim');
      const dims = [];
      
      for (const dim of dimElements) {
        dims.push(parseInt(dim.textContent));
      }
      
      return dims;
    }
    
    /**
     * Decode data based on encoding
     */
    decodeData(dataArray, dataType, encoding) {
      const dataElement = dataArray.querySelector('Data');
      
      if (!dataElement) {
        throw new Error('No Data element found in DataArray');
      }
      
      const text = dataElement.textContent.trim();
      
      if (encoding === 'ASCII') {
        return this.decodeASCII(text, dataType);
      } else if (encoding === 'Base64Binary') {
        return this.decodeBase64(text, dataType);
      } else if (encoding === 'GZipBase64Binary') {
        return this.decodeGZipBase64(text, dataType);
      } else {
        throw new Error(`Unsupported encoding: ${encoding}`);
      }
    }
    
    /**
     * Decode ASCII encoded data
     */
    decodeASCII(text, dataType) {
      const values = text.split(/\s+/).filter(v => v.length > 0);
      return this.convertDataType(values.map(parseFloat), dataType);
    }
    
    /**
     * Decode Base64 binary data
     */
    decodeBase64(text, dataType) {
      const binary = atob(text);
      const bytes = new Uint8Array(binary.length);
      
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      
      return this.convertDataType(bytes.buffer, dataType);
    }
    
    /**
     * Decode GZip + Base64 data
     */
    decodeGZipBase64(text, dataType) {
      if (typeof pako === 'undefined') {
        throw new Error('Pako library required for GZipBase64Binary');
      }
      
      const binary = atob(text);
      const compressed = new Uint8Array(binary.length);
      
      for (let i = 0; i < binary.length; i++) {
        compressed[i] = binary.charCodeAt(i);
      }
      
      const decompressed = pako.inflate(compressed);
      
      return this.convertDataType(decompressed.buffer, dataType);
    }
    
    /**
     * Convert ArrayBuffer to typed array based on NIFTI data type
     */
    convertDataType(buffer, dataType) {
      const typeMap = {
        'NIFTI_TYPE_UINT8': Uint8Array,
        'NIFTI_TYPE_INT8': Int8Array,
        'NIFTI_TYPE_UINT16': Uint16Array,
        'NIFTI_TYPE_INT16': Int16Array,
        'NIFTI_TYPE_UINT32': Uint32Array,
        'NIFTI_TYPE_INT32': Int32Array,
        'NIFTI_TYPE_FLOAT32': Float32Array,
        'NIFTI_TYPE_FLOAT64': Float64Array
      };
      
      const TypedArray = typeMap[dataType] || Float32Array;
      
      if (buffer instanceof ArrayBuffer) {
        return new TypedArray(buffer);
      } else {
        return new TypedArray(buffer);
      }
    }
    
    /**
     * Reshape flat array into matrix
     */
    reshapeData(data, dims, expectedCols = null) {
      // If dims is [N, 3], return flat array
      // Three.js expects flat arrays for attributes
      return data;
    }
    
    /**
     * Create Three.js mesh from geometry data
     */
    createMesh(geometryData, options) {
      const { vertices, triangles, normals, colors } = geometryData;
      
      const {
        color = 0xcccccc,
        opacity = 1.0,
        wireframe = false,
        flatShading = false,
        side = THREE.DoubleSide
      } = options;
      
      // Create BufferGeometry
      const geometry = new THREE.BufferGeometry();
      
      // Add vertices
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      
      // Add indices (faces)
      geometry.setIndex(new THREE.Uint32BufferAttribute(triangles, 1));
      
      // Add normals (or compute if not provided)
      if (normals) {
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      } else {
        geometry.computeVertexNormals();
      }
      
      // Add colors if provided
      if (colors) {
        // Normalize colors to 0-1 range
        const normalizedColors = new Float32Array(colors.length);
        for (let i = 0; i < colors.length; i++) {
          normalizedColors[i] = colors[i] / 255.0;
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(normalizedColors, 3));
      }
      
      // Create material
      const material = new THREE.MeshPhongMaterial({
        color: color,
        opacity: opacity,
        transparent: opacity < 1.0,
        wireframe: wireframe,
        flatShading: flatShading,
        side: side,
        vertexColors: colors ? true : false
      });
      
      // Create mesh
      const mesh = new THREE.Mesh(geometry, material);
      
      // Center geometry
      geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);
      
      return mesh;
    }
    
    /**
     * Load both hemispheres
     */
    async loadBothHemispheres(leftUrl, rightUrl, options = {}) {
      console.log(`[SurfaceLoader] 🧠 Loading both hemispheres...`);
      
      const [leftMesh, rightMesh] = await Promise.all([
        this.loadSurface(leftUrl, { ...options, color: 0xcccccc }),
        this.loadSurface(rightUrl, { ...options, color: 0xcccccc })
      ]);
      
      // Position hemispheres
      leftMesh.position.x = -5;
      rightMesh.position.x = 5;
      
      // Create group
      const group = new THREE.Group();
      group.add(leftMesh);
      group.add(rightMesh);
      
      console.log(`[SurfaceLoader] ✅ Both hemispheres loaded`);
      
      return group;
    }
    
    /**
     * Clear cache
     */
    clearCache() {
      this.cache.clear();
      console.log(`[SurfaceLoader] 🗑️  Cache cleared`);
    }
    
    /**
     * Get cache stats
     */
    getCacheStats() {
      return {
        cachedSurfaces: this.cache.size,
        loading: this.loadingQueue.size,
        urls: Array.from(this.cache.keys())
      };
    }
  }
  
  // Export singleton
  window.SurfaceLoader = window.SurfaceLoader || new SurfaceLoader();