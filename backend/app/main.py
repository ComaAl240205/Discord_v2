from fastapi import FastAPI

app = FastAPI(title="Discord_v2 API")

@app.get("/")