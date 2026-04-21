/**
 * mni_registration.js
 * Client-side MNI Space Utilities
 * 
 * Features:
 * - MNI coordinate system handling
 * - Voxel ↔ World coordinate conversion
 * - Atlas space alignment
 * - Coordinate validation
 */

class MNIRegistration {
    constructor() {
      // MNI152 template properties
      this.mniSpace = {
        dimensions: [182, 218, 182],  // MNI152 1mm
        voxelSize: [1.0, 1.0, 1.0],   // mm
        origin: [91, 126, 72],         // Center voxel
        orientation: 'RAS'             // Right-Anterior-Superior
      };
      
      // Affine matrix for MNI152 (simplified)
      this.affineMatrix = [
        [-1,  0,  0,  90],
        [ 0,  1,  0, -126],
        [ 0,  0,  1, -72],
        [ 0,  0,  0,  1]
      ];
    }
    
    /**
     * Convert voxel coordinates to MNI world coordinates (mm)
     * @param {number} i - X voxel index
     * @param {number} j - Y voxel index
     * @param {number} k - Z voxel index
     * @returns {Object} {x, y, z} in mm
     */
    voxelToWorld(i, j, k) {
      // Apply affine transformation
      const x = this.affineMatrix[0][0] * i + 
                this.affineMatrix[0][1] * j + 
                this.affineMatrix[0][2] * k + 
                this.affineMatrix[0][3];
                
      const y = this.affineMatrix[1][0] * i + 
                this.affineMatrix[1][1] * j + 
                this.affineMatrix[1][2] * k + 
                this.affineMatrix[1][3];
                
      const z = this.affineMatrix[2][0] * i + 
                this.affineMatrix[2][1] * j + 
                this.affineMatrix[2][2] * k + 
                this.affineMatrix[2][3];
      
      return { x, y, z };
    }
    
    /**
     * Convert MNI world coordinates to voxel indices
     * @param {number} x - X coordinate in mm
     * @param {number} y - Y coordinate in mm
     * @param {number} z - Z coordinate in mm
     * @returns {Object} {i, j, k} voxel indices
     */
    worldToVoxel(x, y, z) {
      // Inverse affine transformation (simplified)
      const i = Math.round((x - this.affineMatrix[0][3]) / this.affineMatrix[0][0]);
      const j = Math.round((y - this.affineMatrix[1][3]) / this.affineMatrix[1][1]);
      const k = Math.round((z - this.affineMatrix[2][3]) / this.affineMatrix[2][2]);
      
      return { i, j, k };
    }
    
    /**
     * Normalize coordinates to 0-255 range for UI
     * @param {number} i - Voxel index
     * @param {number} dimension - Dimension size
     * @returns {number} Normalized 0-255 coordinate
     */
    normalizeCoordinate(i, dimension) {
      return Math.round((i / dimension) * 255);
    }
    
    /**
     * Denormalize UI coordinates (0-255) to voxel space
     * @param {number} coord - UI coordinate (0-255)
     * @param {number} dimension - Target dimension size
     * @returns {number} Voxel index
     */
    denormalizeCoordinate(coord, dimension) {
      return Math.round((coord / 255) * dimension);
    }
    
    /**
     * Check if voxel coordinates are within MNI space
     * @param {number} i - X voxel
     * @param {number} j - Y voxel
     * @param {number} k - Z voxel
     * @returns {boolean}
     */
    isValidVoxel(i, j, k) {
      return (
        i >= 0 && i < this.mniSpace.dimensions[0] &&
        j >= 0 && j < this.mniSpace.dimensions[1] &&
        k >= 0 && k < this.mniSpace.dimensions[2]
      );
    }
    
    /**
     * Get anatomical label for coordinate
     * @param {number} x - X coordinate (mm or voxel)
     * @param {number} y - Y coordinate
     * @param {number} z - Z coordinate
     * @param {boolean} isVoxel - Whether coords are voxel indices
     * @returns {string} Anatomical description
     */
    getAnatomicalLabel(x, y, z, isVoxel = true) {
      let voxel;
      
      if (isVoxel) {
        voxel = { i: x, j: y, k: z };
      } else {
        voxel = this.worldToVoxel(x, y, z);
      }
      
      const { i, j, k } = voxel;
      
      // Hemisphere
      const hemisphere = i < this.mniSpace.origin[0] ? 'Right' : 'Left';
      
      // Anterior-Posterior
      let ap;
      if (j < 90) {
        ap = 'Posterior';
      } else if (j > 140) {
        ap = 'Anterior';
      } else {
        ap = 'Central';
      }
      
      // Superior-Inferior
      let si;
      if (k < 50) {
        si = 'Inferior';
      } else if (k > 120) {
        si = 'Superior';
      } else {
        si = 'Mid';
      }
      
      return `${hemisphere} ${ap} ${si}`;
    }
    
    /**
     * Calculate distance between two points in mm
     * @param {Object} point1 - {x, y, z} in mm
     * @param {Object} point2 - {x, y, z} in mm
     * @returns {number} Euclidean distance in mm
     */
    calculateDistance(point1, point2) {
      const dx = point2.x - point1.x;
      const dy = point2.y - point1.y;
      const dz = point2.z - point1.z;
      
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    
    /**
     * Get bounding box for a set of voxels
     * @param {Array} voxels - Array of {i, j, k} voxels
     * @returns {Object} {min: {i,j,k}, max: {i,j,k}, center: {i,j,k}}
     */
    getBoundingBox(voxels) {
      if (voxels.length === 0) return null;
      
      let minI = Infinity, minJ = Infinity, minK = Infinity;
      let maxI = -Infinity, maxJ = -Infinity, maxK = -Infinity;
      
      for (const v of voxels) {
        minI = Math.min(minI, v.i);
        minJ = Math.min(minJ, v.j);
        minK = Math.min(minK, v.k);
        
        maxI = Math.max(maxI, v.i);
        maxJ = Math.max(maxJ, v.j);
        maxK = Math.max(maxK, v.k);
      }
      
      return {
        min: { i: minI, j: minJ, k: minK },
        max: { i: maxI, j: maxJ, k: maxK },
        center: {
          i: Math.round((minI + maxI) / 2),
          j: Math.round((minJ + maxJ) / 2),
          k: Math.round((minK + maxK) / 2)
        }
      };
    }
    
    /**
     * Convert between different slice orientations
     * @param {number} x - Coordinate
     * @param {number} y - Coordinate
     * @param {number} z - Coordinate
     * @param {string} fromOrientation - 'axial', 'sagittal', 'coronal'
     * @param {string} toOrientation - Target orientation
     * @returns {Object} {x, y, z} in target orientation
     */
    convertOrientation(x, y, z, fromOrientation, toOrientation) {
      if (fromOrientation === toOrientation) {
        return { x, y, z };
      }
      
      // Conversion lookup table
      const conversions = {
        'axial_to_sagittal': (x, y, z) => ({ x: z, y: x, z: y }),
        'axial_to_coronal': (x, y, z) => ({ x: x, y: z, z: y }),
        'sagittal_to_axial': (x, y, z) => ({ x: y, y: z, z: x }),
        'sagittal_to_coronal': (x, y, z) => ({ x: y, y: x, z: z }),
        'coronal_to_axial': (x, y, z) => ({ x: x, y: z, z: y }),
        'coronal_to_sagittal': (x, y, z) => ({ x: z, y: x, z: y })
      };
      
      const key = `${fromOrientation}_to_${toOrientation}`;
      
      if (conversions[key]) {
        return conversions[key](x, y, z);
      }
      
      console.warn(`Unknown orientation conversion: ${key}`);
      return { x, y, z };
    }
    
    /**
     * Format coordinates for display
     * @param {Object} voxel - {i, j, k}
     * @param {boolean} includeWorld - Include world coordinates
     * @returns {string} Formatted string
     */
    formatCoordinates(voxel, includeWorld = true) {
      const { i, j, k } = voxel;
      let str = `Voxel: (${i}, ${j}, ${k})`;
      
      if (includeWorld) {
        const world = this.voxelToWorld(i, j, k);
        str += `\nMNI: (${world.x.toFixed(1)}, ${world.y.toFixed(1)}, ${world.z.toFixed(1)}) mm`;
      }
      
      return str;
    }
    
    /**
     * Get nearest standard MNI coordinate
     * Used for atlas lookup alignment
     * @param {number} coord - Input coordinate
     * @param {number} step - Grid step size (default 2mm)
     * @returns {number} Snapped coordinate
     */
    snapToGrid(coord, step = 2) {
      return Math.round(coord / step) * step;
    }
    
    /**
     * Calculate volume from voxel count
     * @param {number} voxelCount - Number of voxels
     * @returns {Object} {mm3, cm3, ml}
     */
    calculateVolume(voxelCount) {
      const voxelVolume = this.mniSpace.voxelSize[0] * 
                          this.mniSpace.voxelSize[1] * 
                          this.mniSpace.voxelSize[2];
      
      const mm3 = voxelCount * voxelVolume;
      const cm3 = mm3 / 1000;
      const ml = cm3; // 1 cm³ = 1 ml
      
      return { mm3, cm3, ml };
    }
    
    /**
     * Get slice plane normal vector
     * @param {string} orientation - 'axial', 'sagittal', 'coronal'
     * @returns {Array} [x, y, z] normal vector
     */
    getSliceNormal(orientation) {
      const normals = {
        'axial': [0, 0, 1],      // Z-axis (superior-inferior)
        'sagittal': [1, 0, 0],   // X-axis (left-right)
        'coronal': [0, 1, 0]     // Y-axis (anterior-posterior)
      };
      
      return normals[orientation] || [0, 0, 1];
    }
  }
  
  // Export singleton
  window.MNIRegistration = window.MNIRegistration || new MNIRegistration();