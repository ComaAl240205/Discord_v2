from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.db import init_db
from app.routes import router
from app.realtime import ws_router

app = FastAPI(title="Discord_v2 API")

# Uploads: backend/uploads/avatars/...
BACKEND_ROOT = Path(__file__).resolve().parents[1]
UPLOAD_ROOT = BACKEND_ROOT / "uploads"
AVATAR_DIR = UPLOAD_ROOT / "avatars"

AVATAR_DIR.mkdir(parents=True, exist_ok=True)

app.mount(
    "/uploads",
    StaticFiles(directory=str(UPLOAD_ROOT)),
    name="uploads",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=86400,
)


@app.on_event("startup")
async def startup():
    await init_db()


@app.get("/")
async def root():
    return {
        "app": "Discord_v2 API",
        "status": "running",
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
    }


app.include_router(router)
app.include_router(ws_router)