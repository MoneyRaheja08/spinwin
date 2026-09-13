import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .realtime import sio
from .routers import admin, analytics, auth, game, history

app = FastAPI(title="Spin & Win API", version="0.3.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(game.router)
app.include_router(admin.router)
app.include_router(history.router)
app.include_router(analytics.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


# Socket.IO + FastAPI on one ASGI app.
# Run with:  uvicorn app.main:sio_app --reload
sio_app = socketio.ASGIApp(sio, other_asgi_app=app)
