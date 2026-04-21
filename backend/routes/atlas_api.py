"""
Atlas API endpoints for EBRAINS viewer
"""
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
import numpy as np
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.atlas_loader import (
    load_julich_atlas, 
    get_region_at_voxel,
    get_atlas_slice,
    get_region_color
)

router = APIRouter()


@router.get("/atlas/region")
async def get_region_name(
    x: int = Query(..., ge=0, le=255),
    y: int = Query(..., ge=0, le=255),
    z: int = Query(..., ge=0, le=255)
):
    """
    Get brain region name at voxel coordinate
    
    Query params:
        x, y, z: Voxel coordinates (0-255)
    
    Returns:
        {
            "region_name": str,
            "region_id": int,
            "hemisphere": "left" | "right" | "none",
            "color": [R, G, B]
        }
    """
    try:
        atlas = load_julich_atlas()
        
        # Scale coordinates to atlas space (MNI is 182x218x182)
        atlas_shape = atlas['shape']
        x_scaled = int(x * atlas_shape[0] / 256)
        y_scaled = int(y * atlas_shape[1] / 256)
        z_scaled = int(z * atlas_shape[2] / 256)
        
        # Get region name
        region_name = get_region_at_voxel(x_scaled, y_scaled, z_scaled, atlas)
        
        # Determine hemisphere
        if "left" in region_name.lower():
            hemisphere = "left"
            region_id = int(atlas['left'][x_scaled, y_scaled, z_scaled])
        elif "right" in region_name.lower():
            hemisphere = "right"
            region_id = int(atlas['right'][x_scaled, y_scaled, z_scaled])
        else:
            hemisphere = "none"
            region_id = 0
        
        # Get color
        color = get_region_color(region_id, atlas) if region_id > 0 else [128, 128, 128]
        
        return {
            "region_name": region_name,
            "region_id": region_id,
            "hemisphere": hemisphere,
            "color": color,
            "coordinates": {
                "voxel": [x, y, z],
                "atlas": [x_scaled, y_scaled, z_scaled]
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error querying atlas: {str(e)}"
        )


@router.get("/atlas/slice/{axis}/{slice_idx}")
async def get_slice(
    axis: str,
    slice_idx: int
):
    """
    Get atlas parcellation slice
    
    Path params:
        axis: 'axial', 'sagittal', or 'coronal'
        slice_idx: Slice index (0-255)
    
    Returns:
        {
            "slice_data": [[int]], # 2D array of region IDs
            "labels": {region_id: {"name": str, "color": [R,G,B]}}
        }
    """
    try:
        if axis not in ['axial', 'sagittal', 'coronal']:
            raise HTTPException(400, "Invalid axis. Use 'axial', 'sagittal', or 'coronal'")
        
        atlas = load_julich_atlas()
        
        # Scale slice index to atlas space
        if axis == 'axial':
            atlas_idx = int(slice_idx * atlas['shape'][2] / 256)
        elif axis == 'sagittal':
            atlas_idx = int(slice_idx * atlas['shape'][0] / 256)
        else:  # coronal
            atlas_idx = int(slice_idx * atlas['shape'][1] / 256)
        
        # Get slice
        slice_data = get_atlas_slice(axis, atlas_idx, atlas)
        composite = slice_data['composite']
        
        # Find unique region IDs in this slice
        unique_ids = np.unique(composite[composite > 0])
        
        # Build label info
        labels = {}
        for region_id in unique_ids:
            region_id = int(region_id)
            region_info = atlas['labels'].get(region_id, {
                'name': f'Region_{region_id}',
                'rgb': [128, 128, 128]
            })
            labels[region_id] = {
                'name': region_info.get('name', f'Region_{region_id}'),
                'color': region_info.get('rgb', [128, 128, 128])
            }
        
        return {
            "slice_data": composite.tolist(),
            "labels": labels,
            "shape": composite.shape,
            "axis": axis,
            "slice_index": slice_idx
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error getting slice: {str(e)}"
        )


@router.get("/atlas/info")
async def get_atlas_info():
    """
    Get atlas metadata
    """
    try:
        atlas = load_julich_atlas()
        
        return {
            "name": "Julich-Brain Cytoarchitectonic Atlas",
            "version": "3.1",
            "num_regions": len(atlas['labels']),
            "shape": atlas['shape'],
            "space": "MNI152",
            "resolution_mm": 1.0,
            "hemispheres": ["left", "right"],
            "source": "https://jugit.fz-juelich.de/inm1/jubrain-atlas"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error loading atlas info: {str(e)}"
        )