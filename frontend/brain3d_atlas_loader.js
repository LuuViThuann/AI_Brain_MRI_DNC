/**
 * brain3d_atlas_loader_FINAL.js
 * ✅ FINAL FIX: Auto-detect dimensions + robust error handling
 */

(function AtlasLoaderFinal() {

  const CONFIG = {
    atlasDir: 'data/atlases/bigbrain/',
    files: {
      template: 'BIGBRAIN_MICROSCOPIC_TEMPLATE_HISTOLOGY.nii.gz',
      isocortex: 'ISOCORTEX_SEGMENTATION.label.nii.gz'
    },
    sampling: { step3D: 2, threshold: 30 }, // Faster sampling
    niftiWaitTimeout: 5000
  };

  let atlasState = {
    templateVolume: null,
    isocortexVolume: null,
    templateMesh: null,
    isocortexMesh: null,
    isLoaded: false,
    isVisible: false,
    usingSynthetic: false
  };

  // ===== WAIT FOR NIFTI =====
  function waitForNIfTI(timeout = 5000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = setInterval(() => {
        if (typeof nifti !== 'undefined' && nifti && !nifti._mock) {
          clearInterval(check);
          console.log('[Atlas] ✅ NIfTI ready');
          resolve(true);
        } else if (Date.now() - start > timeout) {
          clearInterval(check);
          console.warn('[Atlas] ⏰ NIfTI timeout');
          resolve(false);
        }
      }, 100);
    });
  }

  // ===== LOAD NIFTI FILE =====
  async function loadNIfTIFile(filename) {
    console.log(`[Atlas] 📥 Loading ${filename}...`);
    
    if (typeof nifti === 'undefined' || nifti._mock) {
      throw new Error('NIfTI library unavailable');
    }
    
    if (typeof pako === 'undefined') {
      throw new Error('Pako library unavailable');
    }
    
    const response = await fetch(`${CONFIG.atlasDir}${filename}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    let data = new Uint8Array(await response.arrayBuffer());
    console.log(`[Atlas] 📦 Downloaded ${data.length} bytes`);
    
    // Decompress gzip
    if (data[0] === 0x1f && data[1] === 0x8b) {
      console.log('[Atlas] 🗜️  Decompressing gzip...');
      try {
        data = pako.inflate(data);
        console.log(`[Atlas] ✅ Decompressed to ${data.length} bytes`);
      } catch (err) {
        throw new Error(`Gzip decompress failed: ${err.message}`);
      }
    }
    
    // Validate NIfTI
    console.log('[Atlas] 🔍 Validating NIfTI format...');
    
    if (!nifti.isNIFTI(data.buffer)) {
      // Debug: Show first 100 bytes
      const preview = Array.from(data.slice(0, 100))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      console.error('[Atlas] ❌ Not NIfTI. First 100 bytes:', preview);
      throw new Error('Invalid NIfTI format');
    }
    
    console.log('[Atlas] ✅ Valid NIfTI format');
    
    // Read header
    const header = nifti.readHeader(data.buffer);
    if (!header) {
      throw new Error('Failed to read NIfTI header');
    }
    
    console.log('[Atlas] 📊 Header info:');
    console.log('  sizeof_hdr:', header.sizeof_hdr);
    console.log('  dims:', header.dims);
    console.log('  datatype:', header.datatypeCode);
    console.log('  bitpix:', header.numBitsPerVoxel);
    console.log('  voxel_size:', header.pixDims?.slice(1, 4));
    
    // Read image data
    const image = nifti.readImage(header, data.buffer);
    if (!image) {
      throw new Error('Failed to read NIfTI image data');
    }
    
    // Convert to typed array
    let imageData;
    switch(header.datatypeCode) {
      case 2:  imageData = new Uint8Array(image); break;
      case 4:  imageData = new Int16Array(image); break;
      case 8:  imageData = new Int32Array(image); break;
      case 16: imageData = new Float32Array(image); break;
      case 512: imageData = new Uint16Array(image); break;
      default:
        console.warn(`[Atlas] ⚠️  Unknown datatype ${header.datatypeCode}, using Uint8`);
        imageData = new Uint8Array(image);
    }
    
    const dims = [header.dims[1], header.dims[2], header.dims[3]];
    const expected = dims[0] * dims[1] * dims[2];
    
    console.log(`[Atlas] ✅ Image data:`);
    console.log('  Dimensions:', dims);
    console.log('  Voxels:', imageData.length);
    console.log('  Expected:', expected);
    console.log('  Min/Max:', Math.min(...imageData), '/', Math.max(...imageData));
    
    if (imageData.length !== expected) {
      console.warn(`[Atlas] ⚠️  Size mismatch: ${imageData.length} vs ${expected}`);
    }
    
    return {
      data: imageData,
      dims: dims,
      header: header
    };
  }

  // ===== CREATE SYNTHETIC VOLUME =====
  function createSyntheticVolume(type = 'template') {
    console.log(`[Atlas] 🔧 Creating synthetic ${type}...`);
    
    const dims = [128, 128, 128];
    const center = [64, 64, 64];
    const data = new Uint8Array(dims[0] * dims[1] * dims[2]);
    
    for (let z = 0; z < dims[2]; z++) {
      for (let y = 0; y < dims[1]; y++) {
        for (let x = 0; x < dims[0]; x++) {
          const idx = x + y * dims[0] + z * dims[0] * dims[1];
          
          const dx = x - center[0];
          const dy = y - center[1];
          const dz = z - center[2];
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
          
          if (type === 'template') {
            if (dist < 55) {
              const intensity = 120 + 80 * (1 - dist / 55);
              data[idx] = Math.max(30, Math.min(255, intensity + (Math.random() - 0.5) * 30));
            }
            if (dist > 45 && dist < 50) {
              data[idx] = 200;
            }
          } else {
            if (dist > 45 && dist < 50) {
              const angle = Math.atan2(dy, dx);
              const region = Math.floor((angle + Math.PI) / (2 * Math.PI) * 5) + 1;
              data[idx] = region;
            }
          }
        }
      }
    }
    
    return { data, dims: dims, header: { dims: [3, ...dims], pixDims: [0, 1, 1, 1] } };
  }

  // ===== CREATE 3D MESH =====
  function createVolumeMesh(volumeObj, options = {}) {
    const { threshold = 30, step = 2, opacity = 0.4 } = options;
    
    const { data, dims } = volumeObj;
    const [nx, ny, nz] = dims;
    
    console.log(`[Atlas] 🔧 Creating mesh from ${nx}×${ny}×${nz} volume...`);
    console.log(`[Atlas]   Sampling: every ${step} voxels, threshold: ${threshold}`);
    
    const positions = [];
    const colors = [];
    let count = 0;
    
    for (let z = 0; z < nz; z += step) {
      for (let y = 0; y < ny; y += step) {
        for (let x = 0; x < nx; x += step) {
          const idx = x + y * nx + z * nx * ny;
          const value = data[idx];
          
          if (value > threshold) {
            positions.push(
              (x / nx) * 2 - 1,
              (y / ny) * 2 - 1,
              (z / nz) * 2 - 1
            );
            
            const intensity = Math.min(value / 255, 1);
            colors.push(intensity * 0.9, intensity * 0.9, intensity * 0.9);
            count++;
          }
        }
      }
    }
    
    console.log(`[Atlas] ✅ Generated ${count} points`);
    
    if (count === 0) {
      console.warn('[Atlas] ⚠️  No points generated - check threshold');
      return null;
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    
    const material = new THREE.PointsMaterial({
      size: 0.01,
      vertexColors: true,
      transparent: true,
      opacity: opacity,
      sizeAttenuation: true
    });
    
    const mesh = new THREE.Points(geometry, material);
    mesh.name = 'AtlasVolume';
    return mesh;
  }

  // ===== CREATE ISOCORTEX MESH =====
  function createIsocortexMesh(volumeObj) {
    const { data, dims } = volumeObj;
    const [nx, ny, nz] = dims;
    
    console.log(`[Atlas] 🧠 Creating isocortex from ${nx}×${ny}×${nz}...`);
    
    const regionColors = [
      [0.2, 0.8, 0.3],  // Green
      [0.3, 0.6, 0.9],  // Blue
      [0.9, 0.7, 0.2],  // Orange
      [0.9, 0.3, 0.3],  // Red
      [0.8, 0.3, 0.8]   // Purple
    ];
    
    const positions = [];
    const colors = [];
    const step = 2;
    
    for (let z = 0; z < nz; z += step) {
      for (let y = 0; y < ny; y += step) {
        for (let x = 0; x < nx; x += step) {
          const idx = x + y * nx + z * nx * ny;
          const label = data[idx];
          
          if (label > 0 && label <= 5) {
            positions.push(
              (x / nx) * 2 - 1,
              (y / ny) * 2 - 1,
              (z / nz) * 2 - 1
            );
            
            const color = regionColors[label - 1];
            colors.push(...color);
          }
        }
      }
    }
    
    console.log(`[Atlas] ✅ Generated ${positions.length / 3} cortical points`);
    
    if (positions.length === 0) {
      console.warn('[Atlas] ⚠️  No labels found');
      return null;
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    
    const material = new THREE.PointsMaterial({
      size: 0.015,
      vertexColors: true,
      transparent: true,
      opacity: 0.6
    });
    
    const mesh = new THREE.Points(geometry, material);
    mesh.name = 'IsocortexSegmentation';
    return mesh;
  }

  // ===== EXTRACT SLICE =====
  function extractSlice(volumeObj, axis, sliceIdx) {
    const { data, dims } = volumeObj;
    const [nx, ny, nz] = dims;
    
    let width, height, slice = [];
    
    if (axis === 'axial') {
      width = nx; height = ny;
      const z = Math.min(sliceIdx, nz - 1);
      for (let y = 0; y < ny; y++) {
        slice[y] = [];
        for (let x = 0; x < nx; x++) {
          slice[y][x] = data[x + y * nx + z * nx * ny] || 0;
        }
      }
    } else if (axis === 'sagittal') {
      width = ny; height = nz;
      const x = Math.min(sliceIdx, nx - 1);
      for (let z = 0; z < nz; z++) {
        slice[z] = [];
        for (let y = 0; y < ny; y++) {
          slice[z][y] = data[x + y * nx + z * nx * ny] || 0;
        }
      }
    } else {
      width = nx; height = nz;
      const y = Math.min(sliceIdx, ny - 1);
      for (let z = 0; z < nz; z++) {
        slice[z] = [];
        for (let x = 0; x < nx; x++) {
          slice[z][x] = data[x + y * nx + z * nx * ny] || 0;
        }
      }
    }
    
    return { slice, width, height };
  }

  // ===== INITIALIZE =====
  async function initializeAtlas() {
    console.log('%c[Atlas] 🚀 Initializing BigBrain Atlas...', 'color: #00c853; font-weight: bold;');
    
    const niftiAvailable = await waitForNIfTI(CONFIG.niftiWaitTimeout);
    
    if (niftiAvailable) {
      console.log('[Atlas] 📚 Loading real NIfTI files...');
      try {
        atlasState.templateVolume = await loadNIfTIFile(CONFIG.files.template);
        atlasState.isocortexVolume = await loadNIfTIFile(CONFIG.files.isocortex);
        atlasState.usingSynthetic = false;
        console.log('[Atlas] ✅ Real NIfTI loaded');
      } catch (err) {
        console.error('[Atlas] ❌ Load failed:', err.message);
        console.log('[Atlas] 🔧 Using synthetic fallback...');
        atlasState.templateVolume = createSyntheticVolume('template');
        atlasState.isocortexVolume = createSyntheticVolume('isocortex');
        atlasState.usingSynthetic = true;
      }
    } else {
      console.log('[Atlas] 🔧 NIfTI unavailable, using synthetic...');
      atlasState.templateVolume = createSyntheticVolume('template');
      atlasState.isocortexVolume = createSyntheticVolume('isocortex');
      atlasState.usingSynthetic = true;
    }
    
    // Create meshes
    atlasState.templateMesh = createVolumeMesh(atlasState.templateVolume, {
      threshold: CONFIG.sampling.threshold,
      step: CONFIG.sampling.step3D,
      opacity: 0.35
    });
    
    atlasState.isocortexMesh = createIsocortexMesh(atlasState.isocortexVolume);
    
    atlasState.isLoaded = true;
    
    const mode = atlasState.usingSynthetic ? 'SYNTHETIC' : 'REAL';
    const dims = atlasState.templateVolume.dims;
    console.log(`%c[Atlas] ✅ Ready (${mode}, ${dims[0]}×${dims[1]}×${dims[2]})`, 'color: #00c853; font-weight: bold;');
    
    return true;
  }

  // ===== API =====
  function addAtlasToScene(scene) {
    if (atlasState.templateMesh) {
      atlasState.templateMesh.visible = atlasState.isVisible;
      scene.add(atlasState.templateMesh);
      console.log('[Atlas] ➕ Template added to scene');
    }
    if (atlasState.isocortexMesh) {
      atlasState.isocortexMesh.visible = atlasState.isVisible;
      scene.add(atlasState.isocortexMesh);
      console.log('[Atlas] ➕ Isocortex added to scene');
    }
    return true;
  }

  function toggleAtlasVisibility() {
    atlasState.isVisible = !atlasState.isVisible;
    if (atlasState.templateMesh) atlasState.templateMesh.visible = atlasState.isVisible;
    if (atlasState.isocortexMesh) atlasState.isocortexMesh.visible = atlasState.isVisible;
    console.log(`[Atlas] 👁️  ${atlasState.isVisible ? 'VISIBLE' : 'HIDDEN'}`);
    return atlasState.isVisible;
  }

  function getAtlasStatus() {
    return {
      isLoaded: atlasState.isLoaded,
      isVisible: atlasState.isVisible,
      usingSynthetic: atlasState.usingSynthetic,
      templateLoaded: !!atlasState.templateVolume,
      isocortexLoaded: !!atlasState.isocortexVolume,
      templateDims: atlasState.templateVolume?.dims,
      isocortexDims: atlasState.isocortexVolume?.dims
    };
  }

  function getSliceData(axis, sliceIdx) {
    if (!atlasState.isLoaded) return null;
    
    // Auto-scale slice index to volume dimensions
    const dims = atlasState.templateVolume.dims;
    let scaledIdx = sliceIdx;
    
    if (axis === 'axial') {
      scaledIdx = Math.floor(sliceIdx * dims[2] / 256);
    } else if (axis === 'sagittal') {
      scaledIdx = Math.floor(sliceIdx * dims[0] / 256);
    } else {
      scaledIdx = Math.floor(sliceIdx * dims[1] / 256);
    }
    
    return {
      template: extractSlice(atlasState.templateVolume, axis, scaledIdx),
      isocortex: extractSlice(atlasState.isocortexVolume, axis, scaledIdx)
    };
  }

  // ===== EXPOSE =====
  window.AtlasLoader = {
    initialize: initializeAtlas,
    addToScene: addAtlasToScene,
    toggleVisibility: toggleAtlasVisibility,
    getStatus: getAtlasStatus,
    getSliceData: getSliceData,
    state: atlasState
  };

  console.log('[Atlas] ✅ Final module loaded');

})();