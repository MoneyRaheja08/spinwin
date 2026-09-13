"""Admin management API. SUPER_ADMIN sees all; STORE_ADMIN is scoped to
its own store (plus global rows) for store-scoped resources."""
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import dump, uid
from ..models import (
    AppSetting, AuditLog, Employee, InventoryLedger, InventoryTxnType,
    PriceSlab, Prize, PrizeInventory, PrizeRule, Store, TvDevice, User, UserRole,
)
from ..security import hash_password, require_roles

router = APIRouter(prefix="/api/admin", tags=["admin"])

admin = require_roles(UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN)
super_only = require_roles(UserRole.SUPER_ADMIN)


def _audit(db, user, action, entity_type, entity_id, store_id=None, **meta):
    db.add(AuditLog(actor_user_id=user.id, actor_role=user.role.value,
                    action=action, entity_type=entity_type, entity_id=entity_id,
                    store_id=store_id, meta_data=meta or None))


def _is_super(user) -> bool:
    return user.role == UserRole.SUPER_ADMIN


async def _apply(db, obj, data: dict, exclude=("id",)):
    for k, v in data.items():
        if k not in exclude:
            setattr(obj, k, v)


# ======================================================== STORES
class StoreIn(BaseModel):
    code: str
    name: str
    city: str | None = None
    address: str | None = None
    phone: str | None = None
    is_active: bool = True


@router.get("/stores")
async def list_stores(db: AsyncSession = Depends(get_db), user=Depends(admin)):
    q = select(Store).order_by(Store.name)
    if not _is_super(user):
        q = q.where(Store.id == user.store_id)
    return [dump(r) for r in (await db.execute(q)).scalars().all()]


@router.post("/stores")
async def create_store(body: StoreIn, db: AsyncSession = Depends(get_db),
                       user=Depends(super_only)):
    store = Store(**body.model_dump())
    db.add(store)
    await db.flush()
    _audit(db, user, "STORE_CREATE", "store", store.id, store.id, **body.model_dump())
    await db.commit()
    await db.refresh(store)
    return dump(store)


# ======================================================== PRIZES
class PrizeIn(BaseModel):
    name: str
    description: str | None = None
    image_url: str | None = None
    value: float = 0
    category: str | None = None
    is_active: bool = True
    priority: int = 0
    max_winners: int | None = None
    expiry_date: str | None = None


class PrizeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    image_url: str | None = None
    value: float | None = None
    category: str | None = None
    is_active: bool | None = None
    priority: int | None = None
    max_winners: int | None = None
    expiry_date: str | None = None


@router.get("/prizes")
async def list_prizes(db: AsyncSession = Depends(get_db), user=Depends(admin)):
    rows = (await db.execute(select(Prize).order_by(Prize.priority, Prize.name))).scalars().all()
    return [dump(r) for r in rows]


@router.post("/prizes")
async def create_prize(body: PrizeIn, db: AsyncSession = Depends(get_db), user=Depends(admin)):
    prize = Prize(**body.model_dump())
    db.add(prize)
    await db.flush()
    _audit(db, user, "PRIZE_CREATE", "prize", prize.id, name=prize.name)
    await db.commit()
    await db.refresh(prize)
    return dump(prize)


@router.patch("/prizes/{prize_id}")
async def update_prize(prize_id: str, body: PrizeUpdate,
                       db: AsyncSession = Depends(get_db), user=Depends(admin)):
    prize = (await db.execute(select(Prize).where(Prize.id == uid(prize_id)))).scalar_one_or_none()
    if not prize:
        raise HTTPException(404, "Prize not found")
    changes = body.model_dump(exclude_unset=True)
    await _apply(db, prize, changes)
    _audit(db, user, "PRIZE_UPDATE", "prize", prize.id, **changes)
    await db.commit()
    await db.refresh(prize)
    return dump(prize)


# ======================================================== PRICE SLABS
class SlabIn(BaseModel):
    name: str
    min_price: float
    max_price: float | None = None
    priority: int = 0
    is_active: bool = True
    store_id: str | None = None


class SlabUpdate(BaseModel):
    name: str | None = None
    min_price: float | None = None
    max_price: float | None = None
    priority: int | None = None
    is_active: bool | None = None


@router.get("/slabs")
async def list_slabs(db: AsyncSession = Depends(get_db), user=Depends(admin)):
    q = select(PriceSlab).order_by(PriceSlab.priority)
    if not _is_super(user):
        q = q.where((PriceSlab.store_id == user.store_id) | (PriceSlab.store_id.is_(None)))
    return [dump(r) for r in (await db.execute(q)).scalars().all()]


@router.post("/slabs")
async def create_slab(body: SlabIn, db: AsyncSession = Depends(get_db), user=Depends(admin)):
    store_id = uid(body.store_id) if body.store_id else None
    if not _is_super(user):
        store_id = user.store_id  # store admin can only make own-store slabs
    slab = PriceSlab(name=body.name, min_price=body.min_price, max_price=body.max_price,
                     priority=body.priority, is_active=body.is_active, store_id=store_id)
    db.add(slab)
    await db.flush()
    _audit(db, user, "SLAB_CREATE", "price_slab", slab.id, store_id, name=slab.name)
    await db.commit()
    await db.refresh(slab)
    return dump(slab)


@router.patch("/slabs/{slab_id}")
async def update_slab(slab_id: str, body: SlabUpdate,
                      db: AsyncSession = Depends(get_db), user=Depends(admin)):
    slab = (await db.execute(select(PriceSlab).where(PriceSlab.id == uid(slab_id)))).scalar_one_or_none()
    if not slab:
        raise HTTPException(404, "Slab not found")
    changes = body.model_dump(exclude_unset=True)
    await _apply(db, slab, changes)
    _audit(db, user, "SLAB_UPDATE", "price_slab", slab.id, slab.store_id, **changes)
    await db.commit()
    await db.refresh(slab)
    return dump(slab)


# ======================================================== PRIZE RULES (weights)
class RuleIn(BaseModel):
    slab_id: str
    prize_id: str
    weight: float = 1
    max_winners: int | None = None
    daily_limit: int | None = None
    is_active: bool = True


class RuleUpdate(BaseModel):
    weight: float | None = None
    max_winners: int | None = None
    daily_limit: int | None = None
    is_active: bool | None = None


@router.get("/slabs/{slab_id}/rules")
async def slab_rules(slab_id: str, db: AsyncSession = Depends(get_db), user=Depends(admin)):
    """Rules for a slab, each with the calculated win percentage."""
    rows = (await db.execute(
        select(PrizeRule, Prize).join(Prize, Prize.id == PrizeRule.prize_id)
        .where(PrizeRule.slab_id == uid(slab_id)).order_by(Prize.priority)
    )).all()
    total = sum(float(r.weight) for r, _ in rows if r.is_active) or 0.0
    out = []
    for rule, prize in rows:
        d = dump(rule)
        d["prize_name"] = prize.name
        d["prize_value"] = float(prize.value)
        d["percentage"] = round(float(rule.weight) / total * 100, 2) if (total and rule.is_active) else 0.0
        out.append(d)
    return {"total_active_weight": total, "rules": out}


@router.post("/rules")
async def create_rule(body: RuleIn, db: AsyncSession = Depends(get_db), user=Depends(admin)):
    rule = PrizeRule(slab_id=uid(body.slab_id), prize_id=uid(body.prize_id),
                     weight=body.weight, max_winners=body.max_winners,
                     daily_limit=body.daily_limit, is_active=body.is_active)
    db.add(rule)
    await db.flush()
    _audit(db, user, "RULE_CREATE", "prize_rule", rule.id,
           slab_id=str(body.slab_id), prize_id=str(body.prize_id), weight=body.weight)
    await db.commit()
    await db.refresh(rule)
    return dump(rule)


@router.patch("/rules/{rule_id}")
async def update_rule(rule_id: str, body: RuleUpdate,
                      db: AsyncSession = Depends(get_db), user=Depends(admin)):
    rule = (await db.execute(select(PrizeRule).where(PrizeRule.id == uid(rule_id)))).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    changes = body.model_dump(exclude_unset=True)
    await _apply(db, rule, changes)
    _audit(db, user, "RULE_UPDATE", "prize_rule", rule.id, **changes)
    await db.commit()
    await db.refresh(rule)
    return dump(rule)


@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: str, db: AsyncSession = Depends(get_db), user=Depends(admin)):
    rule = (await db.execute(select(PrizeRule).where(PrizeRule.id == uid(rule_id)))).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    await db.delete(rule)
    _audit(db, user, "RULE_DELETE", "prize_rule", uid(rule_id))
    await db.commit()
    return {"ok": True}


# ======================================================== INVENTORY
class InventoryIn(BaseModel):
    prize_id: str
    store_id: str | None = None
    quantity_initial: int = 0
    low_stock_threshold: int = 0


class StockChange(BaseModel):
    quantity: int          # +restock; adjust uses set_remaining instead
    note: str | None = None


class StockSet(BaseModel):
    set_remaining: int
    note: str | None = None


@router.get("/inventory")
async def list_inventory(db: AsyncSession = Depends(get_db), user=Depends(admin)):
    q = select(PrizeInventory, Prize).join(Prize, Prize.id == PrizeInventory.prize_id)
    if not _is_super(user):
        q = q.where((PrizeInventory.store_id == user.store_id) | (PrizeInventory.store_id.is_(None)))
    rows = (await db.execute(q)).all()
    out = []
    for inv, prize in rows:
        d = dump(inv)
        d["prize_name"] = prize.name
        d["low_stock"] = inv.quantity_remaining <= inv.low_stock_threshold
        out.append(d)
    return out


@router.post("/inventory")
async def create_inventory(body: InventoryIn, db: AsyncSession = Depends(get_db), user=Depends(admin)):
    store_id = uid(body.store_id) if body.store_id else None
    if not _is_super(user):
        store_id = user.store_id
    inv = PrizeInventory(prize_id=uid(body.prize_id), store_id=store_id,
                         quantity_initial=body.quantity_initial,
                         quantity_remaining=body.quantity_initial,
                         low_stock_threshold=body.low_stock_threshold)
    db.add(inv)
    await db.flush()
    db.add(InventoryLedger(inventory_id=inv.id, txn_type=InventoryTxnType.INITIAL,
                           quantity_delta=body.quantity_initial,
                           balance_after=body.quantity_initial, actor_user_id=user.id,
                           note="Opening stock"))
    _audit(db, user, "INVENTORY_CREATE", "prize_inventory", inv.id, store_id,
           qty=body.quantity_initial)
    await db.commit()
    await db.refresh(inv)
    return dump(inv)


@router.post("/inventory/{inventory_id}/restock")
async def restock(inventory_id: str, body: StockChange,
                  db: AsyncSession = Depends(get_db), user=Depends(admin)):
    inv = (await db.execute(
        select(PrizeInventory).where(PrizeInventory.id == uid(inventory_id)).with_for_update()
    )).scalar_one_or_none()
    if not inv:
        raise HTTPException(404, "Inventory row not found")
    if body.quantity <= 0:
        raise HTTPException(400, "quantity must be positive")
    inv.quantity_initial += body.quantity
    inv.quantity_remaining += body.quantity
    db.add(InventoryLedger(inventory_id=inv.id, txn_type=InventoryTxnType.RESTOCK,
                           quantity_delta=body.quantity, balance_after=inv.quantity_remaining,
                           actor_user_id=user.id, note=body.note or "Restock"))
    _audit(db, user, "INVENTORY_RESTOCK", "prize_inventory", inv.id, inv.store_id,
           qty=body.quantity)
    await db.commit()
    await db.refresh(inv)
    return dump(inv)


@router.post("/inventory/{inventory_id}/adjust")
async def adjust(inventory_id: str, body: StockSet,
                 db: AsyncSession = Depends(get_db), user=Depends(admin)):
    inv = (await db.execute(
        select(PrizeInventory).where(PrizeInventory.id == uid(inventory_id)).with_for_update()
    )).scalar_one_or_none()
    if not inv:
        raise HTTPException(404, "Inventory row not found")
    if body.set_remaining < 0 or body.set_remaining > inv.quantity_initial:
        raise HTTPException(400, "set_remaining out of range")
    delta = body.set_remaining - inv.quantity_remaining
    inv.quantity_remaining = body.set_remaining
    db.add(InventoryLedger(inventory_id=inv.id, txn_type=InventoryTxnType.ADJUST,
                           quantity_delta=delta, balance_after=inv.quantity_remaining,
                           actor_user_id=user.id, note=body.note or "Manual adjust"))
    _audit(db, user, "INVENTORY_ADJUST", "prize_inventory", inv.id, inv.store_id, delta=delta)
    await db.commit()
    await db.refresh(inv)
    return dump(inv)


# ======================================================== TV DEVICES
class TvIn(BaseModel):
    code: str
    name: str | None = None
    store_id: str | None = None
    is_active: bool = True


@router.get("/tv-devices")
async def list_tv(db: AsyncSession = Depends(get_db), user=Depends(admin)):
    q = select(TvDevice).order_by(TvDevice.code)
    if not _is_super(user):
        q = q.where(TvDevice.store_id == user.store_id)
    return [dump(r) for r in (await db.execute(q)).scalars().all()]


@router.post("/tv-devices")
async def create_tv(body: TvIn, db: AsyncSession = Depends(get_db), user=Depends(admin)):
    store_id = uid(body.store_id) if body.store_id else user.store_id
    if store_id is None:
        raise HTTPException(400, "store_id required")
    tv = TvDevice(code=body.code, name=body.name, store_id=store_id,
                  is_active=body.is_active, pairing_code="PAIR-" + secrets.token_hex(3).upper())
    db.add(tv)
    await db.flush()
    _audit(db, user, "TV_CREATE", "tv_device", tv.id, store_id, code=tv.code)
    await db.commit()
    await db.refresh(tv)
    return dump(tv)


@router.post("/tv-devices/{tv_id}/repair")
async def repair_tv(tv_id: str, db: AsyncSession = Depends(get_db), user=Depends(admin)):
    tv = (await db.execute(select(TvDevice).where(TvDevice.id == uid(tv_id)))).scalar_one_or_none()
    if not tv:
        raise HTTPException(404, "TV not found")
    tv.pairing_code = "PAIR-" + secrets.token_hex(3).upper()
    tv.active_session_id = None
    _audit(db, user, "TV_REPAIR", "tv_device", tv.id, tv.store_id)
    await db.commit()
    await db.refresh(tv)
    return dump(tv)


# ======================================================== EMPLOYEES
class EmployeeIn(BaseModel):
    code: str
    name: str
    phone: str | None = None
    store_id: str | None = None
    is_active: bool = True


@router.get("/employees")
async def list_employees(db: AsyncSession = Depends(get_db), user=Depends(admin)):
    q = select(Employee).order_by(Employee.name)
    if not _is_super(user):
        q = q.where(Employee.store_id == user.store_id)
    return [dump(r) for r in (await db.execute(q)).scalars().all()]


@router.post("/employees")
async def create_employee(body: EmployeeIn, db: AsyncSession = Depends(get_db), user=Depends(admin)):
    store_id = uid(body.store_id) if body.store_id else user.store_id
    if store_id is None:
        raise HTTPException(400, "store_id required")
    emp = Employee(code=body.code, name=body.name, phone=body.phone,
                   store_id=store_id, is_active=body.is_active)
    db.add(emp)
    await db.flush()
    _audit(db, user, "EMPLOYEE_CREATE", "employee", emp.id, store_id, name=emp.name)
    await db.commit()
    await db.refresh(emp)
    return dump(emp)


# ======================================================== USERS
class UserIn(BaseModel):
    username: str
    password: str
    role: UserRole
    full_name: str | None = None
    store_id: str | None = None


@router.post("/users")
async def create_user(body: UserIn, db: AsyncSession = Depends(get_db), user=Depends(admin)):
    # store admin may only create STAFF in its own store
    if not _is_super(user):
        if body.role != UserRole.STAFF:
            raise HTTPException(403, "Store admins can only create STAFF")
        store_id = user.store_id
    else:
        store_id = uid(body.store_id) if body.store_id else None
    if body.role != UserRole.SUPER_ADMIN and store_id is None:
        raise HTTPException(400, "store_id required for this role")
    new = User(username=body.username, password_hash=hash_password(body.password),
               role=body.role, full_name=body.full_name, store_id=store_id)
    db.add(new)
    await db.flush()
    _audit(db, user, "USER_CREATE", "user", new.id, store_id, username=body.username, role=body.role.value)
    await db.commit()
    await db.refresh(new)
    d = dump(new)
    d.pop("password_hash", None)
    return d


# ======================================================== SETTINGS
class SettingIn(BaseModel):
    key: str
    value: dict
    store_id: str | None = None


@router.get("/settings")
async def get_settings(store_id: str | None = Query(None),
                       db: AsyncSession = Depends(get_db), user=Depends(admin)):
    sid = uid(store_id) if store_id else (None if _is_super(user) else user.store_id)
    q = select(AppSetting).where(
        (AppSetting.store_id == sid) | (AppSetting.store_id.is_(None))
    )
    rows = (await db.execute(q)).scalars().all()
    return {r.key: r.value for r in rows}


@router.put("/settings")
async def put_setting(body: SettingIn, db: AsyncSession = Depends(get_db), user=Depends(admin)):
    sid = uid(body.store_id) if body.store_id else (None if _is_super(user) else user.store_id)
    existing = (await db.execute(
        select(AppSetting).where(AppSetting.key == body.key, AppSetting.store_id == sid)
    )).scalar_one_or_none()
    if existing:
        existing.value = body.value
    else:
        db.add(AppSetting(key=body.key, value=body.value, store_id=sid))
    _audit(db, user, "SETTINGS_UPDATE", "app_setting", None, sid, key=body.key)
    await db.commit()
    return {"ok": True, "key": body.key, "value": body.value}
