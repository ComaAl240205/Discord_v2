from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.db import init_db
from app.routes import router
from app.routes_2 import router_2
from app.realtime import ws_router


app = FastAPI(title="Discord_v2 API")

# Uploads: backend/uploads/avatars/... und backend/uploads/servers/...
BACKEND_ROOT = Path(__file__).resolve().parents[1]
UPLOAD_ROOT = BACKEND_ROOT / "uploads"
AVATAR_DIR = UPLOAD_ROOT / "avatars"
SERVER_DIR = UPLOAD_ROOT / "servers"

AVATAR_DIR.mkdir(parents=True, exist_ok=True)
SERVER_DIR.mkdir(parents=True, exist_ok=True)

# CORS zuerst registrieren.
# Dein Frontend läuft über eine andere Cloudflare-Origin.
# Browser blocken Cross-Origin Requests ohne passende CORS Header.
# FastAPI löst das über CORSMiddleware mit erlaubten Origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://some-mood-measured-hughes.trycloudflare.com",
        "https://lenders-possession-allow-chassis.trycloudflare.com",
    ],
    allow_origin_regex=r"https://.*\.trycloudflare\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=86400,
)

app.mount(
    "/uploads",
    StaticFiles(directory=str(UPLOAD_ROOT)),
    name="uploads",
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


# Router zuletzt einhängen
app.include_router(router)
app.include_router(router_2)
app.include_router(ws_router)