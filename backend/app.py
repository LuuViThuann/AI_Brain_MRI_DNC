"""
app.py (✅ COMPLETE VERSION WITH /data/images SERVING)
FastAPI main application — Brain MRI Diagnosis System backend.

CRITICAL FIXES:
✅ Added /data/images static file serving
✅ Auto-detect image directory
✅ Proper mounting order
✅ CORS headers for all endpoints
"""

import sys, os
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

# pyrefly: ignore [missing-import]
from fastapi import FastAPI, Request
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from fastapi.staticfiles import StaticFiles
# pyrefly: ignore [missing-import]
from fastapi.responses import FileResponse, JSONResponse
import time

# Import route modules
from routes.diagnosis import router as diagnosis_router
from routes.brain3d   import router as brain3d_router
from routes.xai_explain import router as xai_router
from routes.similar_cases import router as similar_router
from routes.simulator import router as simulator_router

from database import engine
from models import Base
from routes.history import router as history_router  

# ===== APP INITIALIZATION =====
app = FastAPI(
    title="Brain MRI Diagnosis API",
    description="AI-powered MRI tumor detection with 3D visualization",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# ===== MIDDLEWARE =====

# CORS — allow frontend on any local origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all HTTP requests with timing"""
    start_time = time.time()
    
    # Process request
    response = await call_next(request)
    
    # Calculate processing time
    process_time = time.time() - start_time
    
    # Log request
    status_emoji = "✅" if response.status_code < 400 else "❌"
    print(f"{status_emoji} {request.method:6} {request.url.path:40} → {response.status_code} ({process_time:.3f}s)")
    
    return response

# ===== PATH CONFIGURATION =====
BASE_DIR = Path(__file__).parent
PROJECT_ROOT = BASE_DIR.parent

MODELS_DIR = PROJECT_ROOT / "frontend" / "models"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
BRAIN_GLB_PATH = MODELS_DIR / "Brain.glb"

print(f"\n[DIR] Directory Configuration:")
print(f"   BASE_DIR:     {BASE_DIR}")
print(f"   PROJECT_ROOT: {PROJECT_ROOT}")
print(f"   FRONTEND_DIR: {FRONTEND_DIR}")
print(f"   MODELS_DIR:   {MODELS_DIR}")
print(f"   BRAIN_GLB:    {BRAIN_GLB_PATH}")

# ===== FIND IMAGE DIRECTORY =====
def find_image_directory():
    """Find the directory containing MRI images"""
    possible_dirs = [
        PROJECT_ROOT / 'data' / 'processed' / 'combined_images',
        PROJECT_ROOT / 'data' / 'processed' / 'mat_images',
        PROJECT_ROOT / 'data' / 'images',
        PROJECT_ROOT / 'data' / 'raw',
    ]
    
    for img_dir in possible_dirs:
        if img_dir.exists() and img_dir.is_dir():
            try:
                # Check if directory contains images
                images = list(img_dir.glob('*.png')) + list(img_dir.glob('*.jpg')) + list(img_dir.glob('*.jpeg'))
                if images:
                    print(f"\n[IMG] FOUND Image Directory:")
                    print(f"   Path: {img_dir}")
                    print(f"   Images: {len(images)} files")
                    return img_dir
            except Exception as e:
                print(f"   [ERROR] Error checking {img_dir}: {e}")
    
    print(f"\n[ERROR] No image directory found!")
    print(f"   Searched in:")
    for d in possible_dirs:
        print(f"     - {d} (exists: {d.exists()})")
    
    return None

IMAGES_DIR = find_image_directory()

# ===== API ROUTES (MUST BE BEFORE STATIC FILES) =====

@app.get("/api/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "Brain MRI Diagnosis API",
        "version": "1.0.0",
        "brain_model_exists": BRAIN_GLB_PATH.exists(),
        "brain_model_path": str(BRAIN_GLB_PATH) if BRAIN_GLB_PATH.exists() else None,
        "images_dir_exists": IMAGES_DIR is not None,
        "images_dir_path": str(IMAGES_DIR) if IMAGES_DIR else None,
        "image_count": len(list(IMAGES_DIR.glob("*.png"))) if IMAGES_DIR else 0
    }

# ===== TEST ENDPOINTS =====

@app.get("/test/brain-model")
async def test_brain_model():
    """Test endpoint to serve Brain.glb directly"""
    print(f"\n[TEST] Testing Brain.glb access...")
    print(f"   Requested path: {BRAIN_GLB_PATH}")
    print(f"   File exists: {BRAIN_GLB_PATH.exists()}")
    
    if BRAIN_GLB_PATH.exists():
        file_size = BRAIN_GLB_PATH.stat().st_size
        print(f"   File size: {file_size / (1024*1024):.2f} MB")
        
        return FileResponse(
            path=str(BRAIN_GLB_PATH),
            media_type="model/gltf-binary",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Cache-Control": "public, max-age=3600",
                "Content-Type": "model/gltf-binary"
            },
            filename="Brain.glb"
        )
    else:
        error_info = {
            "error": "Brain.glb not found",
            "path_checked": str(BRAIN_GLB_PATH),
            "models_dir_exists": MODELS_DIR.exists(),
            "models_dir_path": str(MODELS_DIR),
            "files_in_models_dir": list(MODELS_DIR.iterdir()) if MODELS_DIR.exists() else []
        }
        
        print(f"   [ERROR] Error: {error_info}")
        return JSONResponse(content=error_info, status_code=404)

@app.get("/test/images-dir")
async def test_images_directory():
    """Test endpoint to check images directory"""
    result = {
        "images_dir": str(IMAGES_DIR) if IMAGES_DIR else None,
        "exists": IMAGES_DIR is not None and IMAGES_DIR.exists(),
        "files_count": 0,
        "sample_files": []
    }
    
    if IMAGES_DIR and IMAGES_DIR.exists():
        images = list(IMAGES_DIR.glob("*.png"))[:10]
        result["files_count"] = len(list(IMAGES_DIR.glob("*.png")))
        result["sample_files"] = [img.name for img in images]
    
    return result



# ===== INCLUDE ROUTERS =====
app.include_router(diagnosis_router, prefix="/api", tags=["Diagnosis"])
app.include_router(brain3d_router,   prefix="/api", tags=["3D Brain"])
app.include_router(xai_router, prefix="/api/xai", tags=["xAI"])
app.include_router(similar_router, prefix="/api/similar", tags=["Similar Cases"])
app.include_router(simulator_router, tags=["MRI Simulator"])
app.include_router(history_router, prefix="/api", tags=["History"])

# ===== STATIC FILES (MUST BE LAST) =====

# 1. Mount /data/images for Similar Cases (CRITICAL!)
if IMAGES_DIR and IMAGES_DIR.exists():
    app.mount("/data/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")
    print(f"\n[OK] MOUNTED: /data/images -> {IMAGES_DIR}")
    print(f"   Example URL: http://127.0.0.1:8000/data/images/mat_005363.png")
else:
    print(f"\n[ERROR] FAILED to mount /data/images - directory not found")

# 2. Mount models directory
if MODELS_DIR.exists():
    # /models  → used by frontend relative URL: models/detail_brain.glb
    app.mount("/models", StaticFiles(directory=str(MODELS_DIR)), name="models")
    # /frontend/models → legacy reference
    app.mount("/frontend/models", StaticFiles(directory=str(MODELS_DIR)), name="frontend_models")
    print(f"[OK] MOUNTED: /models -> {MODELS_DIR}")
    print(f"[OK] MOUNTED: /frontend/models -> {MODELS_DIR}")

    detail_glb = MODELS_DIR / "detail_brain.glb"
    if BRAIN_GLB_PATH.exists():
        mb = BRAIN_GLB_PATH.stat().st_size / (1024 * 1024)
        print(f"   [OK] Brain.glb found ({mb:.1f} MB)")
    else:
        print(f"   [ERROR] Brain.glb NOT found")
    if detail_glb.exists():
        mb2 = detail_glb.stat().st_size / (1024 * 1024)
        print(f"   [OK] detail_brain.glb found ({mb2:.1f} MB)")
    else:
        print(f"   [WARNING] detail_brain.glb NOT found (will fall back to Brain.glb)")
else:
    print(f"[ERROR] Models directory not found: {MODELS_DIR}")

# 3. Mount frontend (MUST BE LAST!)
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
    print(f"[OK] MOUNTED: / -> {FRONTEND_DIR}")
else:
    print(f"[ERROR] Frontend directory not found: {FRONTEND_DIR}")

# ===== STARTUP/SHUTDOWN EVENTS =====

@app.on_event("startup")
async def startup_event():
    # Create all DB tables if they don't exist yet
    try:
        Base.metadata.create_all(bind=engine)
        print("[OK] Database tables initialised")
    except Exception as e:
        print(f"[ERROR] Failed to initialise database tables: {e}")

    """Run on server startup"""
    print("\n" + "=" * 70)
    print("  Brain MRI Diagnosis API - Server Started")
    print("=" * 70)
    print(f"\n[INFO] Main Endpoints:")
    print(f"   • Frontend:      http://127.0.0.1:8000")
    print(f"   • API Health:    http://127.0.0.1:8000/api/health")
    print(f"   • Diagnosis:     http://127.0.0.1:8000/api/diagnose")
    
    if IMAGES_DIR:
        print(f"\n[INFO] Similar Cases Images:")
        print(f"   • Directory:     {IMAGES_DIR}")
        print(f"   • Image count:   {len(list(IMAGES_DIR.glob('*.png')))}")
        print(f"   • Test URL:      http://127.0.0.1:8000/test/images-dir")
        print(f"   • Sample:        http://127.0.0.1:8000/data/images/mat_005363.png")
    else:
        print(f"\n[WARNING] Similar Cases images NOT available (directory not found)")
    
    print(f"\n[INFO] Debug/Test Endpoints:")
    print(f"   • Brain Model:   http://127.0.0.1:8000/test/brain-model")
    print(f"   • Images Dir:    http://127.0.0.1:8000/test/images-dir")
    
    print(f"\n[INFO] Documentation:")
    print(f"   • Swagger UI:    http://127.0.0.1:8000/docs")
    print(f"   • ReDoc:         http://127.0.0.1:8000/redoc")
    print("\n" + "=" * 70 + "\n")

@app.on_event("shutdown")
async def shutdown_event():
    """Run on server shutdown"""
    print("\n" + "=" * 70)
    print("  Brain MRI Diagnosis API - Server Shutting Down")
    print("=" * 70 + "\n")

# ===== MAIN ENTRY POINT =====

if __name__ == "__main__":
    # pyrefly: ignore [missing-import]
    import uvicorn
    import webbrowser
    import threading
    
    def open_browser():
        """Open browser after server starts"""
        time.sleep(2.5)
        try:
            webbrowser.open("http://127.0.0.1:8000")
            print("🌐 Browser opened at http://127.0.0.1:8000\n")
        except Exception as e:
            print(f"[WARNING] Could not open browser: {e}")
    
    # Start browser in separate thread
    browser_thread = threading.Thread(target=open_browser, daemon=True)
    browser_thread.start()
    
    # Print startup banner
    print("\n" + "=" * 70)
    print("  Starting Brain MRI Diagnosis API Server")
    print("=" * 70)
    print("\n[INFO] Initializing server...\n")
    
    # Run server
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info"
    )
