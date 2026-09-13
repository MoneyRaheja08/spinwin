"""Spin history — filterable list + CSV export."""
import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import uid
from ..models import (
    Bill, BillItem, Customer, Employee, SpinResult, SpinSession, Store, UserRole,
)
from ..security import require_roles

router = APIRouter(prefix="/api/history", tags=["history"])
admin = require_roles(UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN)


def _base_query():
    return (
        select(
            SpinResult.created_at, Bill.bill_number, Customer.mobile, BillItem.model,
            SpinSession.qualifying_price, Store.name, Employee.name,
            SpinResult.prize_name, SpinResult.prize_value, SpinSession.id,
            SpinSession.status,
        )
        .select_from(SpinResult)
        .join(SpinSession, SpinResult.session_id == SpinSession.id)
        .outerjoin(Bill, SpinSession.bill_id == Bill.id)
        .outerjoin(Customer, SpinSession.customer_id == Customer.id)
        .outerjoin(BillItem, SpinSession.bill_item_id == BillItem.id)
        .outerjoin(Store, SpinSession.store_id == Store.id)
        .outerjoin(Employee, Bill.employee_id == Employee.id)
    )


def _apply_filters(q, user, *, store_id, employee_id, prize_id, customer_mobile,
                   bill_number, product, price_min, price_max, date_from, date_to):
    if user.role != UserRole.SUPER_ADMIN:
        q = q.where(SpinSession.store_id == user.store_id)
    elif store_id:
        q = q.where(SpinSession.store_id == uid(store_id))
    if employee_id:
        q = q.where(Bill.employee_id == uid(employee_id))
    if prize_id:
        q = q.where(SpinResult.prize_id == uid(prize_id))
    if customer_mobile:
        q = q.where(Customer.mobile.ilike(f"%{customer_mobile}%"))
    if bill_number:
        q = q.where(Bill.bill_number.ilike(f"%{bill_number}%"))
    if product:
        q = q.where(BillItem.model.ilike(f"%{product}%"))
    if price_min is not None:
        q = q.where(SpinSession.qualifying_price >= price_min)
    if price_max is not None:
        q = q.where(SpinSession.qualifying_price <= price_max)
    if date_from:
        q = q.where(SpinResult.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.where(SpinResult.created_at <= datetime.fromisoformat(date_to))
    return q


def _row_to_dict(r):
    return {
        "datetime": r[0].isoformat() if r[0] else None,
        "bill_number": r[1],
        "customer_mobile": r[2],
        "product": r[3],
        "mobile_price": float(r[4]) if r[4] is not None else None,
        "store": r[5],
        "employee": r[6],
        "prize": r[7],
        "prize_value": float(r[8]) if r[8] is not None else None,
        "session_id": str(r[9]),
        "status": r[10].value if r[10] else None,
    }


@router.get("")
async def history(
    db: AsyncSession = Depends(get_db), user=Depends(admin),
    store_id: str | None = Query(None), employee_id: str | None = Query(None),
    prize_id: str | None = Query(None), customer_mobile: str | None = Query(None),
    bill_number: str | None = Query(None), product: str | None = Query(None),
    price_min: float | None = Query(None), price_max: float | None = Query(None),
    date_from: str | None = Query(None), date_to: str | None = Query(None),
    limit: int = Query(100, le=500), offset: int = Query(0),
):
    q = _apply_filters(_base_query(), user, store_id=store_id, employee_id=employee_id,
                       prize_id=prize_id, customer_mobile=customer_mobile,
                       bill_number=bill_number, product=product, price_min=price_min,
                       price_max=price_max, date_from=date_from, date_to=date_to)
    q = q.order_by(SpinResult.created_at.desc()).limit(limit).offset(offset)
    rows = (await db.execute(q)).all()
    return {"count": len(rows), "rows": [_row_to_dict(r) for r in rows]}


@router.get("/export.csv")
async def export_csv(
    db: AsyncSession = Depends(get_db), user=Depends(admin),
    store_id: str | None = Query(None), employee_id: str | None = Query(None),
    prize_id: str | None = Query(None), customer_mobile: str | None = Query(None),
    bill_number: str | None = Query(None), product: str | None = Query(None),
    price_min: float | None = Query(None), price_max: float | None = Query(None),
    date_from: str | None = Query(None), date_to: str | None = Query(None),
):
    q = _apply_filters(_base_query(), user, store_id=store_id, employee_id=employee_id,
                       prize_id=prize_id, customer_mobile=customer_mobile,
                       bill_number=bill_number, product=product, price_min=price_min,
                       price_max=price_max, date_from=date_from, date_to=date_to)
    q = q.order_by(SpinResult.created_at.desc()).limit(50000)
    rows = (await db.execute(q)).all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Date & time", "Bill number", "Customer mobile", "Product",
                "Mobile price", "Store", "Employee", "Prize", "Prize value",
                "Session ID", "Status"])
    for r in rows:
        d = _row_to_dict(r)
        w.writerow([d["datetime"], d["bill_number"], d["customer_mobile"], d["product"],
                    d["mobile_price"], d["store"], d["employee"], d["prize"],
                    d["prize_value"], d["session_id"], d["status"]])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=spin_history.csv"})
