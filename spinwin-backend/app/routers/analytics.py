"""Dashboard analytics — KPIs + a few series for charts."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import uid
from ..models import (
    Bill, PriceSlab, Prize, PrizeInventory, SpinResult, SpinSession, UserRole,
)
from ..security import require_roles

router = APIRouter(prefix="/api/analytics", tags=["analytics"])
admin = require_roles(UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN)


@router.get("/dashboard")
async def dashboard(store_id: str | None = Query(None),
                    db: AsyncSession = Depends(get_db), user=Depends(admin)):
    # resolve scope
    sid = None
    if user.role != UserRole.SUPER_ADMIN:
        sid = user.store_id
    elif store_id:
        sid = uid(store_id)

    def scoped(q):
        return q.where(SpinSession.store_id == sid) if sid else q

    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today.replace(day=1)

    total_spins = (await db.execute(scoped(
        select(func.count()).select_from(SpinResult)
        .join(SpinSession, SpinResult.session_id == SpinSession.id)))).scalar_one()

    total_value = (await db.execute(scoped(
        select(func.coalesce(func.sum(SpinResult.prize_value), 0))
        .select_from(SpinResult).join(SpinSession, SpinResult.session_id == SpinSession.id)))).scalar_one()

    spins_today = (await db.execute(scoped(
        select(func.count()).select_from(SpinResult)
        .join(SpinSession, SpinResult.session_id == SpinSession.id)
        .where(SpinResult.created_at >= today)))).scalar_one()

    spins_month = (await db.execute(scoped(
        select(func.count()).select_from(SpinResult)
        .join(SpinSession, SpinResult.session_id == SpinSession.id)
        .where(SpinResult.created_at >= month_start)))).scalar_one()

    highest_value = (await db.execute(scoped(
        select(func.coalesce(func.max(SpinResult.prize_value), 0))
        .select_from(SpinResult).join(SpinSession, SpinResult.session_id == SpinSession.id)))).scalar_one()

    # prizes remaining (scoped: store rows + global rows)
    inv_q = select(func.coalesce(func.sum(PrizeInventory.quantity_remaining), 0))
    if sid:
        inv_q = inv_q.where((PrizeInventory.store_id == sid) | (PrizeInventory.store_id.is_(None)))
    prizes_remaining = (await db.execute(inv_q)).scalar_one()

    # prize distribution
    dist_rows = (await db.execute(scoped(
        select(SpinResult.prize_name, func.count().label("c"))
        .select_from(SpinResult).join(SpinSession, SpinResult.session_id == SpinSession.id)
        .group_by(SpinResult.prize_name).order_by(func.count().desc())))).all()
    prize_distribution = [{"prize": n, "count": c} for n, c in dist_rows]
    most_won = prize_distribution[0]["prize"] if prize_distribution else None

    # spins by day (last 30 days)
    day = func.date_trunc("day", SpinResult.created_at)
    day_rows = (await db.execute(scoped(
        select(day.label("d"), func.count().label("c"))
        .select_from(SpinResult).join(SpinSession, SpinResult.session_id == SpinSession.id)
        .where(SpinResult.created_at >= now - timedelta(days=30))
        .group_by(day).order_by(day)))).all()
    spins_by_day = [{"date": d.date().isoformat(), "count": c} for d, c in day_rows]

    # spins by slab
    slab_rows = (await db.execute(scoped(
        select(PriceSlab.name, func.count().label("c"))
        .select_from(SpinResult)
        .join(SpinSession, SpinResult.session_id == SpinSession.id)
        .join(PriceSlab, SpinResult.slab_id == PriceSlab.id)
        .group_by(PriceSlab.name).order_by(func.count().desc())))).all()
    spins_by_slab = [{"slab": n, "count": c} for n, c in slab_rows]

    # inventory levels
    lvl_q = select(Prize.name, PrizeInventory.quantity_remaining, PrizeInventory.quantity_initial) \
        .join(Prize, Prize.id == PrizeInventory.prize_id)
    if sid:
        lvl_q = lvl_q.where((PrizeInventory.store_id == sid) | (PrizeInventory.store_id.is_(None)))
    inventory_levels = [{"prize": n, "remaining": rem, "initial": init}
                        for n, rem, init in (await db.execute(lvl_q)).all()]

    # sales (bills) vs spins
    bills_q = select(func.count()).select_from(Bill)
    if sid:
        bills_q = bills_q.where(Bill.store_id == sid)
    total_bills = (await db.execute(bills_q)).scalar_one()

    return {
        "kpis": {
            "total_spins": total_spins,
            "total_prizes_given": total_spins,
            "total_prize_value": float(total_value),
            "prizes_remaining": prizes_remaining,
            "spins_today": spins_today,
            "spins_this_month": spins_month,
            "most_won_prize": most_won,
            "highest_value_given": float(highest_value),
            "mobile_sales": total_bills,
            "conversion_pct": round(total_spins / total_bills * 100, 1) if total_bills else 0.0,
        },
        "prize_distribution": prize_distribution,
        "spins_by_day": spins_by_day,
        "spins_by_slab": spins_by_slab,
        "inventory_levels": inventory_levels,
    }
