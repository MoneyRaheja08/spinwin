import asyncio
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_db
from ..engine import SpinError, award_spin, resolve_slab
from ..models import (
    AuditLog, Bill, BillItem, BillSpinStatus, Customer, Prize, SessionStatus,
    SpinSession, Store, TvDevice, User, UserRole,
)
from ..realtime import _wheel_for_slab, sio
from ..security import get_current_user, require_roles

router = APIRouter(prefix="/api", tags=["game"])


def _uid(x) -> uuid.UUID:
    return x if isinstance(x, uuid.UUID) else uuid.UUID(str(x))


def _mask_mobile(m: str | None) -> str | None:
    if not m or len(m) < 4:
        return "\u2022\u2022\u2022\u2022"
    return m[:2] + "\u2022" * max(len(m) - 4, 0) + m[-2:]


class EligibilityIn(BaseModel):
    bill_number: str
    store_id: str | None = None
    tv_code: str | None = None


async def _resolve_store_id(db, body):
    if body.store_id:
        return _uid(body.store_id)
    if body.tv_code:
        tv = (await db.execute(
            select(TvDevice).where(TvDevice.code == body.tv_code)
        )).scalar_one_or_none()
        if tv:
            return tv.store_id
    return None


@router.post("/eligibility")
async def eligibility(body: EligibilityIn, db: AsyncSession = Depends(get_db)):
    store_id = await _resolve_store_id(db, body)
    if store_id is None:
        raise HTTPException(400, "Provide a store_id or a valid tv_code")
    bill = (await db.execute(
        select(Bill).where(Bill.store_id == store_id,
                           Bill.bill_number == body.bill_number)
    )).scalar_one_or_none()
    if not bill:
        raise HTTPException(404, "Bill not found")

    item = (await db.execute(
        select(BillItem).where(BillItem.bill_id == bill.id,
                               BillItem.is_spin_item.is_(True))
    )).scalar_one_or_none()

    eligible = (bill.spin_eligible
                and bill.spins_used < bill.spins_allowed
                and bill.spin_status != BillSpinStatus.LOCKED)

    slab = await resolve_slab(db, item.selling_price, bill.store_id) if item else None
    wheel = await _wheel_for_slab(db, slab.id) if slab else []
    customer_name = None
    if bill.customer_id:
        customer_name = (await db.execute(
            select(Customer.name).where(Customer.id == bill.customer_id)
        )).scalar_one_or_none()
    return {
        "eligible": eligible,
        "bill_id": str(bill.id),
        "customer_name": customer_name,
        "spin_status": bill.spin_status.value,
        "spins_left": max(bill.spins_allowed - bill.spins_used, 0),
        "item": ({"bill_item_id": str(item.id), "model": item.model,
                  "price": float(item.selling_price)} if item else None),
        "slab": ({"id": str(slab.id), "name": slab.name} if slab else None),
        "wheel": wheel,
    }


class StaffBillIn(BaseModel):
    customer_name: str
    bill_number: str
    model: str
    price: float
    mobile: str | None = None
    store_id: str | None = None


@router.post("/staff/bills")
async def staff_create_bill(
    body: StaffBillIn, db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(
        UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN, UserRole.STAFF)),
):
    """Staff registers a walk-in bill on the spot; the customer then enters
    this bill number at the TV to play."""
    store_id = user.store_id
    if store_id is None:
        store_id = _uid(body.store_id) if body.store_id else \
            (await db.execute(select(Store.id).limit(1))).scalar_one_or_none()
    if store_id is None:
        raise HTTPException(400, "No store available for this account")

    dup = (await db.execute(select(Bill).where(
        Bill.store_id == store_id, Bill.bill_number == body.bill_number))).scalar_one_or_none()
    if dup:
        raise HTTPException(400, "A bill with this number already exists")

    mobile = body.mobile or f"NA-{body.bill_number}-{secrets.token_hex(2)}"
    cust = Customer(name=body.customer_name, mobile=mobile)
    db.add(cust)
    await db.flush()

    bill = Bill(store_id=store_id, bill_number=body.bill_number, customer_id=cust.id,
                total_amount=body.price, spin_eligible=True, spins_allowed=1,
                spins_used=0, spin_status=BillSpinStatus.NOT_PLAYED)
    db.add(bill)
    await db.flush()
    db.add(BillItem(bill_id=bill.id, model=body.model,
                    selling_price=body.price, is_spin_item=True))
    db.add(AuditLog(actor_user_id=user.id, actor_role=user.role.value,
                    action="BILL_CREATE", entity_type="bill", entity_id=bill.id,
                    store_id=store_id,
                    meta_data={"bill_number": body.bill_number, "price": body.price}))
    await db.commit()
    return {"ok": True, "bill_id": str(bill.id),
            "bill_number": body.bill_number, "customer_name": body.customer_name}


class SessionIn(BaseModel):
    bill_id: str
    tv_code: str | None = None


@router.post("/sessions")
async def create_session(body: SessionIn, db: AsyncSession = Depends(get_db)):
    bill = (await db.execute(
        select(Bill).where(Bill.id == _uid(body.bill_id))
    )).scalar_one_or_none()
    if not bill:
        raise HTTPException(404, "Bill not found")
    if (not bill.spin_eligible or bill.spins_used >= bill.spins_allowed
            or bill.spin_status == BillSpinStatus.LOCKED):
        raise HTTPException(400, "Bill is not eligible / spin already used")

    item = (await db.execute(
        select(BillItem).where(BillItem.bill_id == bill.id,
                               BillItem.is_spin_item.is_(True))
    )).scalar_one_or_none()
    if not item:
        raise HTTPException(400, "No qualifying mobile on this bill")

    slab = await resolve_slab(db, item.selling_price, bill.store_id)
    if not slab:
        raise HTTPException(400, "No price slab matches this item's price")

    tv = None
    if body.tv_code:
        tv = (await db.execute(
            select(TvDevice).where(TvDevice.code == body.tv_code)
        )).scalar_one_or_none()

    code = "SPN-" + secrets.token_urlsafe(9)
    sess = SpinSession(
        store_id=bill.store_id,
        bill_id=bill.id,
        bill_item_id=item.id,
        customer_id=bill.customer_id,
        price_slab_id=slab.id,
        qualifying_price=item.selling_price,
        pairing_code=code,
        status=SessionStatus.CREATED,
        tv_device_id=(tv.id if tv else None),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.SESSION_TTL_MIN),
    )
    db.add(sess)
    await db.commit()
    await db.refresh(sess)

    # Tell the paired TV a customer has arrived, and hand it the wheel to show.
    if tv:
        masked = None
        cname = None
        if bill.customer_id:
            cust = (await db.execute(
                select(Customer).where(Customer.id == bill.customer_id)
            )).scalar_one_or_none()
            if cust:
                masked = _mask_mobile(cust.mobile)
                cname = cust.name
        wheel = await _wheel_for_slab(db, slab.id)
        await sio.emit("SESSION_ATTACHED", {
            "session_id": str(sess.id),
            "masked_mobile": masked,
            "customer_name": cname,
            "wheel": wheel,
            "slab": slab.name,
        }, room=f"tv:{tv.id}")

    return {
        "session_id": str(sess.id),
        "pairing_code": code,
        "qr_payload": f"/play?c={code}",
        "slab": slab.name,
        "expires_at": sess.expires_at.isoformat(),
    }


class ForceIn(BaseModel):
    prize_id: str


@router.post("/sessions/{session_id}/force")
async def force_winner(session_id: str, body: ForceIn,
                       db: AsyncSession = Depends(get_db),
                       user: User = Depends(require_roles(
                           UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN))):
    """Controlled-winner. Admin only. Fully audited."""
    sess = (await db.execute(
        select(SpinSession).where(SpinSession.id == _uid(session_id))
    )).scalar_one_or_none()
    if not sess:
        raise HTTPException(404, "Session not found")
    if sess.status == SessionStatus.COMPLETED:
        raise HTTPException(400, "Spin already used")

    prize = (await db.execute(
        select(Prize).where(Prize.id == _uid(body.prize_id))
    )).scalar_one_or_none()
    if not prize:
        raise HTTPException(404, "Prize not found")

    sess.forced_prize_id = prize.id
    sess.forced_by_user_id = user.id
    db.add(AuditLog(
        actor_user_id=user.id, actor_role=user.role.value,
        action="SPIN_FORCE_SET", entity_type="spin_session",
        entity_id=sess.id, store_id=sess.store_id,
        meta_data={"prize_id": str(prize.id), "prize": prize.name},
    ))
    await db.commit()
    return {"ok": True, "forced_prize": prize.name}


@router.get("/my/tv-devices")
async def my_tv_devices(db: AsyncSession = Depends(get_db),
                        user: User = Depends(get_current_user)):
    """TVs the signed-in user may run (their store; all for super admin)."""
    q = select(TvDevice).where(TvDevice.is_active.is_(True)).order_by(TvDevice.code)
    if user.role != UserRole.SUPER_ADMIN:
        q = q.where(TvDevice.store_id == user.store_id)
    rows = (await db.execute(q)).scalars().all()
    return [{"id": str(t.id), "code": t.code, "name": t.name} for t in rows]


@router.post("/sessions/{session_id}/spin")
async def spin(session_id: str, db: AsyncSession = Depends(get_db),
               user: User = Depends(require_roles(
                   UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN, UserRole.STAFF))):
    """Staff-triggered spin. Runs the same server-side engine as the phone,
    then drives the paired TV (SPIN_STARTED now, PRIZE_WON after the animation)."""
    sess = (await db.execute(
        select(SpinSession).where(SpinSession.id == _uid(session_id))
    )).scalar_one_or_none()
    if not sess:
        raise HTTPException(404, "Session not found")
    wheel = await _wheel_for_slab(db, sess.price_slab_id) if sess.price_slab_id else []

    try:
        result = await award_spin(session_id, actor_user_id=user.id)
    except SpinError as exc:
        raise HTTPException(400, str(exc))

    winning_index = next(
        (i for i, w in enumerate(wheel) if w["prize_id"] == result["prize_id"]), 0)
    room = f"session:{session_id}"
    await sio.emit("SPIN_STARTED", {
        "wheel": wheel, "winning_index": winning_index,
        "duration": settings.ANIMATION_SECONDS, "result": result,
    }, room=room)

    async def _reveal():
        await asyncio.sleep(settings.ANIMATION_SECONDS)
        await sio.emit("PRIZE_WON", {"result": result}, room=room)

    asyncio.create_task(_reveal())
    return result
