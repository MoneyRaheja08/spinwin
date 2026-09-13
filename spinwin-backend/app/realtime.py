"""Real-time layer — phone (controller) <-> TV (display).

Event flow (matches the spec):
  phone: customer_join {pairing_code}   -> joins session room, TV gets CUSTOMER_CONNECTED
  tv:    tv_join {tv_code}              -> registers device
  tv:    tv_watch {session_id}          -> TV joins the session room
  phone: SPIN_REQUESTED {}              -> server decides prize (engine.award_spin)
                                           -> emits SPIN_STARTED {wheel, winning_index, ...}
                                           -> after ANIMATION_SECONDS emits PRIZE_WON {result}

The server decides the prize BEFORE the animation; SPIN_STARTED carries the
winning slice index so the TV animates to the correct stop. The wheel layout
is derived from the slab's prize pool ordered by priority, so TV and server
agree on slice positions.
"""
import asyncio
import uuid
from datetime import datetime, timezone

import socketio
from sqlalchemy import select

from .config import settings
from .db import AsyncSessionLocal
from .engine import SpinError, award_spin
from .models import Prize, PrizeRule, SessionStatus, SpinSession, TvDevice

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")


async def _wheel_for_slab(db, slab_id):
    prizes = (await db.execute(
        select(Prize)
        .join(PrizeRule, PrizeRule.prize_id == Prize.id)
        .where(PrizeRule.slab_id == slab_id,
               PrizeRule.is_active.is_(True),
               Prize.is_active.is_(True))
        .order_by(Prize.priority)
    )).scalars().all()
    return [{"prize_id": str(p.id), "name": p.name,
             "value": float(p.value), "image_url": p.image_url} for p in prizes]


@sio.event
async def connect(sid, environ, auth):
    await sio.save_session(sid, {"role": None})


@sio.event
async def disconnect(sid):
    pass


@sio.on("tv_join")
async def tv_join(sid, data):
    code = (data or {}).get("tv_code")
    async with AsyncSessionLocal() as db:
        tv = (await db.execute(
            select(TvDevice).where(TvDevice.code == code)
        )).scalar_one_or_none()
        if not tv or not tv.is_active:
            return {"ok": False, "error": "Unknown or inactive TV"}
        tv.last_seen_at = datetime.now(timezone.utc)
        await db.commit()
        tv_id = str(tv.id)
    await sio.enter_room(sid, f"tv:{tv_id}")
    await sio.save_session(sid, {"role": "TV", "tv_id": tv_id})
    return {"ok": True, "tv_id": tv_id}


@sio.on("tv_watch")
async def tv_watch(sid, data):
    session_id = (data or {}).get("session_id")
    if session_id:
        await sio.enter_room(sid, f"session:{session_id}")
    return {"ok": True}


@sio.on("customer_join")
async def customer_join(sid, data):
    code = (data or {}).get("pairing_code")
    async with AsyncSessionLocal() as db:
        sess = (await db.execute(
            select(SpinSession).where(SpinSession.pairing_code == code)
        )).scalar_one_or_none()
        if sess is None:
            return {"ok": False, "error": "Invalid session"}
        if sess.status == SessionStatus.COMPLETED:
            return {"ok": False, "error": "Spin already used."}
        if sess.status in (SessionStatus.EXPIRED, SessionStatus.CANCELLED):
            return {"ok": False, "error": "Session expired"}
        if sess.status == SessionStatus.CREATED:
            sess.status = SessionStatus.CONNECTED
            sess.connected_at = datetime.now(timezone.utc)
            await db.commit()
        session_id = str(sess.id)
    room = f"session:{session_id}"
    await sio.enter_room(sid, room)
    await sio.save_session(sid, {"role": "CUSTOMER", "session_id": session_id})
    await sio.emit("CUSTOMER_CONNECTED", {"session_id": session_id}, room=room)
    return {"ok": True, "session_id": session_id}


@sio.on("SPIN_REQUESTED")
async def spin_requested(sid, data):
    state = await sio.get_session(sid)
    if state.get("role") != "CUSTOMER" or not state.get("session_id"):
        return {"ok": False, "error": "Not connected to a session"}

    session_id = state["session_id"]
    room = f"session:{session_id}"

    # build the wheel from the slab pool (for the TV to render/stop)
    async with AsyncSessionLocal() as db:
        sess = (await db.execute(
            select(SpinSession).where(SpinSession.id == uuid.UUID(session_id))
        )).scalar_one_or_none()
        if sess is None:
            return {"ok": False, "error": "Session not found"}
        wheel = await _wheel_for_slab(db, sess.price_slab_id) if sess.price_slab_id else []

    # SERVER decides the prize
    try:
        result = await award_spin(session_id)
    except SpinError as exc:
        await sio.emit("SPIN_ERROR", {"error": str(exc)}, room=room)
        return {"ok": False, "error": str(exc)}

    winning_index = next(
        (i for i, w in enumerate(wheel) if w["prize_id"] == result["prize_id"]), 0
    )

    await sio.emit("SPIN_STARTED", {
        "wheel": wheel,
        "winning_index": winning_index,
        "duration": settings.ANIMATION_SECONDS,
        "result": result,
    }, room=room)

    async def _reveal():
        await asyncio.sleep(settings.ANIMATION_SECONDS)
        await sio.emit("PRIZE_WON", {"result": result}, room=room)

    asyncio.create_task(_reveal())
    return {"ok": True, "result": result}
