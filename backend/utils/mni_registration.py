"""
MNI Registration - Đưa MRI bệnh nhân về MNI space
"""
import ants
import nibabel as nib
import numpy as np
from pathlib import Path

MNI_TEMPLATE = Path("frontend/data/atlases/mni/MNI152_T1_1mm.nii.gz")

def register_to_mni(patient_mri_path: str, tumor_mask_path: str = None):
    """
    Register patient MRI + tumor mask to MNI space
    
    Returns:
        {
            'mri_mni': np.array,
            'tumor_mni': np.array (if mask provided),
            'transform': ANTs transform object
        }
    """
    # Load template
    template = ants.image_read(str(MNI_TEMPLATE))
    
    # Load patient MRI
    patient = ants.from_numpy(np.load(patient_mri_path))
    
    # Register
    print("🔄 Running ANTs registration...")
    result = ants.registration(
        fixed=template,
        moving=patient,
        type_of_transform='SyN',  # Symmetric normalization
        verbose=True
    )
    
    # Apply transform to MRI
    mri_mni = result['warpedmovout']
    
    output = {
        'mri_mni': mri_mni.numpy(),
        'transform': result
    }
    
    # Apply to tumor mask if provided
    if tumor_mask_path:
        tumor_mask = ants.from_numpy(np.load(tumor_mask_path))
        tumor_mni = ants.apply_transforms(
            fixed=template,
            moving=tumor_mask,
            transformlist=result['fwdtransforms'],
            interpolator='nearestNeighbor'
        )
        output['tumor_mni'] = tumor_mni.numpy()
    
    return output