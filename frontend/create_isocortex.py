#!/usr/bin/env python3
"""
create_isocortex.py
Tạo synthetic isocortex segmentation từ BigBrain template
"""

import numpy as np
import nibabel as nib
from scipy import ndimage
import sys
import os

def create_isocortex_from_template(template_path, output_path):
    """
    Tạo isocortex segmentation từ brain template
    """
    print(f"📥 Loading template: {template_path}")
    
    # Load template
    try:
        img = nib.load(template_path)
        data = img.get_fdata()
        print(f"✅ Loaded shape: {data.shape}")
    except Exception as e:
        print(f"❌ Error loading template: {e}")
        return False
    
    # Create isocortex mask (cortical shell)
    print("🔧 Creating cortical shell...")
    
    # 1. Threshold to get brain mask
    brain_mask = data > 30
    
    # 2. Erode to get inner boundary
    eroded = ndimage.binary_erosion(brain_mask, iterations=5)
    
    # 3. Cortical shell = brain - eroded
    cortex_mask = brain_mask & ~eroded
    
    # 4. Create 5 cortical regions based on position
    labels = np.zeros_like(data, dtype=np.uint8)
    
    # Get center of mass
    center = np.array(ndimage.center_of_mass(brain_mask))
    
    # Assign labels based on position
    coords = np.array(np.where(cortex_mask)).T
    
    for coord in coords:
        # Convert to centered coordinates
        rel = coord - center
        
        # Divide into regions based on angle and position
        if rel[0] > 10:  # Anterior
            labels[tuple(coord)] = 1  # Frontal
        elif rel[0] < -10:  # Posterior
            labels[tuple(coord)] = 4  # Occipital
        elif rel[1] > 0:  # Superior
            if rel[2] > 0:
                labels[tuple(coord)] = 2  # Parietal right
            else:
                labels[tuple(coord)] = 2  # Parietal left
        else:  # Inferior
            labels[tuple(coord)] = 3  # Temporal
    
    print(f"✅ Labels created:")
    print(f"   Region 1 (Frontal): {np.sum(labels == 1)} voxels")
    print(f"   Region 2 (Parietal): {np.sum(labels == 2)} voxels")
    print(f"   Region 3 (Temporal): {np.sum(labels == 3)} voxels")
    print(f"   Region 4 (Occipital): {np.sum(labels == 4)} voxels")
    
    # Save
    print(f"💾 Saving to: {output_path}")
    
    out_img = nib.Nifti1Image(labels, img.affine, img.header)
    nib.save(out_img, output_path)
    
    print("✅ Isocortex segmentation created successfully!")
    return True


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python create_isocortex.py <template.nii.gz> [output.nii.gz]")
        sys.exit(1)
    
    template_file = sys.argv[1]
    
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
    else:
        # Auto-generate output name
        base = os.path.dirname(template_file)
        output_file = os.path.join(base, 'ISOCORTEX_SEGMENTATION.label.nii.gz')
    
    if not os.path.exists(template_file):
        print(f"❌ Template file not found: {template_file}")
        sys.exit(1)
    
    success = create_isocortex_from_template(template_file, output_file)
    
    sys.exit(0 if success else 1)