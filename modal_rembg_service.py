import modal

app = modal.App("rembg-gpu-service")

# Persist the model cache to avoid re-downloading models on cold starts
model_volume = modal.Volume.from_name("rembg-model-cache", create_if_missing=True)
# Persist processed images
data_volume = modal.Volume.from_name("rembg-processed-images", create_if_missing=True)

# Base image with CUDA runtime; install Python deps for rembg GPU + FastAPI server
image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04", add_python="3.11"
    )
    .pip_install(
        # Background removal & GPU inference
        "rembg==2.0.53",
        "onnxruntime-gpu==1.18.0",
        # Web server
        "fastapi==0.115.0",
        "uvicorn==0.30.6",
        # Image handling
        "pillow==10.4.0",
        # Optional but often present in rembg dependency tree
        "numpy==2.1.1",
        # Multipart form parsing for FastAPI UploadFile
        "python-multipart==0.0.9",
    )
    .env({
        "U2NET_HOME": "/models",       # rembg caches models here (persisted)
        "ORT_LOGGING_LEVEL": "WARNING", # onnxruntime logs
    })
)


@app.function(
    image=image,
    gpu="A10G",  # Choose GPU type; "T4" also works but slower
    timeout=600,
    max_containers=2,
    volumes={"/models": model_volume, "/data": data_volume},
)
@modal.asgi_app()
def fastapi_app():
    import os
    import time
    import uuid
    from fastapi import FastAPI, UploadFile, File, Query
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import Response, JSONResponse

    try:
        from rembg import remove, new_session
    except Exception as e:
        # Import-time error surface
        raise RuntimeError(f"Failed to import rembg: {e}")

    api = FastAPI(title="rembg-gpu-service", version="0.2.0")

    # Allow browser-based calls during development; tighten in production
    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    session_cache = {}

    def get_session(model_name: str):
        if model_name not in session_cache:
            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
            t0 = time.time()
            try:
                sess = new_session(model_name=model_name, providers=providers)
            except TypeError:
                sess = new_session(model_name=model_name)
            session_cache[model_name] = sess
            print(f"[rembg] session created for {model_name} in {time.time()-t0:.2f}s")
        return session_cache[model_name]

    @api.on_event("startup")
    def warm_default_model():
        try:
            get_session("isnet-general-use")
        except Exception as e:
            print("[rembg] warmup failed", e)

    @api.post("/remove")
    async def remove_bg(
        file: UploadFile = File(...),
        model: str = Query(
            default="isnet-general-use",
            description="Model to use: u2net | u2netp | isnet-general-use | isnet-anime",
        ),
        only_mask: bool = Query(default=False),
        post_process_mask: bool = Query(default=True),
        alpha_matting: bool = Query(default=False),
        return_json: bool = Query(default=False, description="If true, return JSON with id and size instead of image bytes"),
    ):
        try:
            t0 = time.time()
            data = await file.read()
            print(f"[rembg] recv file name={getattr(file,'filename',None)} size={len(data)}")
            t1 = time.time()
            session = get_session(model)
            t2 = time.time()
            out = remove(
                data,
                session=session,
                only_mask=only_mask,
                post_process_mask=post_process_mask,
                alpha_matting=alpha_matting,
            )
            t3 = time.time()
            # Persist output
            image_id = str(uuid.uuid4())
            out_path = f"/data/{image_id}.png"
            with open(out_path, "wb") as f:
                f.write(out)
            size = os.path.getsize(out_path)
            print(f"[rembg] saved id={image_id} size={size} bytes path={out_path}")
            print(f"[rembg] timings read={t1-t0:.2f}s session={t2-t1:.2f}s infer={t3-t2:.2f}s total={t3-t0:.2f}s")

            if return_json:
                return JSONResponse({"id": image_id, "bytes": size, "path": f"/img/{image_id}"}, status_code=200)
            # Default: return image, plus an id header
            return Response(content=out, media_type="image/png", headers={"X-Image-Id": image_id})
        except Exception as e:
            print("[rembg] error", e)
            return JSONResponse({"error": str(e)}, status_code=500)

    @api.get("/img/{image_id}")
    def get_image(image_id: str):
        path = f"/data/{image_id}.png"
        if not os.path.exists(path):
            return JSONResponse({"error": "not found"}, status_code=404)
        with open(path, "rb") as f:
            b = f.read()
        return Response(content=b, media_type="image/png")

    @api.get("/healthz")
    def healthz():
        # Basic stats: number of files in /data (best-effort)
        try:
            count = len([n for n in os.listdir('/data') if n.endswith('.png')])
        except Exception:
            count = None
        return {"ok": True, "models": list(session_cache.keys()), "stored": count}

    return api
