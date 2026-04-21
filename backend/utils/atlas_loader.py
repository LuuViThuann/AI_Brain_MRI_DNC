"""
Julich-Brain Atlas Loader
"""
import nibabel as nib
import xmltodict
import numpy as np
from pathlib import Path

ATLAS_DIR = Path("frontend/data/atlases/julich")

def load_julich_atlas():
    """
    Load Julich-Brain parcellation + labels
    
    Returns:
        {
            'left': np.array (207 regions),
            'right': np.array (207 regions),
            'labels': {1: 'hOc1 (V1)', 2: 'hOc2 (V2)', ...}
        }
    """
    # Load NIfTI parcellations
    left_img = nib.load(ATLAS_DIR / "JulichBrainAtlas_3.1_207areas_MPM_lh_MNI152.nii.gz")
    right_img = nib.load(ATLAS_DIR / "JulichBrainAtlas_3.1_207areas_MPM_rh_MNI152.nii.gz")
    
    left_data = left_img.get_fdata()
    right_data = right_img.get_fdata()
    
    # Parse XML labels
    with open(ATLAS_DIR / "JulichBrainAtlas_3.1_207areas_MPM_lh_MNI152.xml") as f:
        xml_data = xmltodict.parse(f.read())
    
    labels = {}
    for label in xml_data['atlas']['data']['label']:
        idx = int(label['@index'])
        name = label['@fullname']
        labels[idx] = name
    
    return {
        'left': left_data,
        'right': right_data,
        'labels': labels
    }


def get_region_at_voxel(x, y, z, atlas_data):
    """
    Get brain region name at voxel coordinate
    """
    labels = atlas_data['labels']
    left = atlas_data['left']
    right = atlas_data['right']
    
    # Check left hemisphere
    left_idx = int(left[x, y, z])
    if left_idx > 0:
        return labels.get(left_idx, f"Region {left_idx}")
    
    # Check right hemisphere
    right_idx = int(right[x, y, z])
    if right_idx > 0:
        return labels.get(right_idx, f"Region {right_idx}")
    
    return "Unknown region"