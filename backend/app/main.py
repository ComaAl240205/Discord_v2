from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.db import init_db
from app.routes import router
from app.routes_2 import router_2
from app.realtime import ws_router


app = FastAPI(title="Discord_v2 API")

# -------------------------------------------------------
# CORS
# -------------------------------------------------------
# Wichtig:
# Browser schicken bei Authorization/Headern zuerst eine OPTIONS Preflight-Anfrage.
# Diese muss dein Backend mit Access-Control-Allow-Origin beantworten.
# Sonst blockt der Browser den echten Request komplett.
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",

    # dein aktuelles Frontend über Cloudflare
    "https://some-mood-measured-hughes.trycloudflare.com",

    # dein aktuelles Backend über Cloudflare
    "https://lenders-possession-allow-chassis.trycloudflare.com",
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.trycloudflare\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)


# Extra Safety Middleware:
# Falls Cloudflare/Browser bei OPTIONS zickt, geben wir manuell CORS zurück.
@app.middleware("http")
async def force_cors_headers(request: Request, call_next):
    origin = request.headers.get("origin")

    is_allowed_origin = False

    if origin:
        if origin in ALLOWED_ORIGINS:
            is_allowed_origin = True
        elif origin.startswith("https://") and origin.endswith(".trycloudflare.com"):
            is_allowed_origin = True

    # Preflight direkt beantworten
    if request.method == "OPTIONS":
        response = Response(status_code=204)
    else:
        response = await call_next(request)

    if is_allowed_origin and origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = (
            "Authorization,Content-Type,Accept,Origin,X-Requested-With"
        )
        response.headers["Access-Control-Expose-Headers"] = "*"
        response.headers["Vary"] = "Origin"

    return response


# -------------------------------------------------------
# Uploads
# -------------------------------------------------------
BACKEND_ROOT = Path(__file__).resolve().parents[1]
UPLOAD_ROOT = BACKEND_ROOT / "uploads"
AVATAR_DIR = UPLOAD_ROOT / "avatars"
SERVER_DIR = UPLOAD_ROOT / "servers"

AVATAR_DIR.mkdir(parents=True, exist_ok=True)
SERVER_DIR.mkdir(parents=True, exist_ok=True)

app.mount(
    "/uploads",
    StaticFiles(directory=str(UPLOAD_ROOT)),
    name="uploads",
)


# -------------------------------------------------------
# Startup
# -------------------------------------------------------
@app.on_event("startup")
async def startup():
    await init_db()


# -------------------------------------------------------
# Health
# -------------------------------------------------------
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


# -------------------------------------------------------
# Routers
# -------------------------------------------------------
app.include_router(router)
app.include_router(router_2)
app.include_router(ws_router)