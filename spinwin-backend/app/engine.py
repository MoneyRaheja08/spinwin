"""Core prize engine.

`award_spin` runs the entire decision in ONE database transaction with
row-level locks, so it is the single source of truth for who wins what.
Guarantees:
  * The prize is chosen server-side by weight — the frontend never decides.
  * Inventory is respected: out-of-stock prizes are excluded, and the
    chosen prize's stock is decremented in the same transaction.
  * No double spins: the bill row is locked and its spin counter checked.
  * max_winners caps (per prize globally, and per prize within a slab) are
    enforced.
  * Controlled-winner (forced_prize_id) is honoured when the prize is
    active and in stock, and is flagged + audited.
  * Every award writes a spin_result (with a snapshot), an inventory_ledger
    entry, and an audit_log row.
"""
import random
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select

from .db import AsyncSessionLocal
from .models import (
    AuditLog, Bill, BillSpinStatus, InventoryLedger, InventoryTxnType,
    PriceSlab, Prize, PrizeInventory, PrizeRule, SessionStatus, SpinResult,
    SpinSession,
)


class SpinError(Exception):
    """Raised for any non-award outcome (already played, no stock, etc.)."""


async def resolve_slab(db, price, store_id):
    """Pick the active slab whose range contains `price`.

    Store-specific slabs win over global (store_id NULL); ties break on
    higher priority.
    """
    rows = (await db.execute(
        select(PriceSlab).where(
            PriceSlab.is_active.is_(True),
            PriceSlab.min_price <= price,
            (PriceSlab.max_price.is_(None)) | (PriceSlab.max_price >= price),
            (PriceSlab.store_id == store_id) | (PriceSlab.store_id.is_(None)),
        )
    )).scalars().all()
    if not rows:
        return None
    rows.sort(key=lambda s: (s.store_id is not None, s.priority), reverse=True)
    return rows[0]


async def award_spin(session_id, actor_user_id=None):
    """Decide + persist the prize for a session. Returns a result dict."""
    sid = session_id if isinstance(session_id, uuid.UUID) else uuid.UUID(str(session_id))

    async with AsyncSessionLocal() as db:
        async with db.begin():
            # --- lock the session -------------------------------------
            sess = (await db.execute(
                select(SpinSession).where(SpinSession.id == sid).with_for_update()
            )).scalar_one_or_none()
            if sess is None:
                raise SpinError("Session not found")
            if sess.status == SessionStatus.COMPLETED:
                raise SpinError("Spin already used.")
            if sess.status in (SessionStatus.EXPIRED, SessionStatus.CANCELLED):
                raise SpinError("Session is not playable")

            # --- lock the bill (duplicate-spin guard) -----------------
            bill = None
            if sess.bill_id:
                bill = (await db.execute(
                    select(Bill).where(Bill.id == sess.bill_id).with_for_update()
                )).scalar_one()
                if not bill.spin_eligible:
                    raise SpinError("This bill is not eligible")
                if bill.spin_status == BillSpinStatus.LOCKED:
                    raise SpinError("This bill is locked")
                if bill.spins_used >= bill.spins_allowed:
                    raise SpinError("Spin already used.")

            # --- resolve slab -----------------------------------------
            slab_id = sess.price_slab_id
            if slab_id is None and sess.qualifying_price is not None:
                slab = await resolve_slab(db, sess.qualifying_price, sess.store_id)
                slab_id = slab.id if slab else None
            if slab_id is None:
                raise SpinError("No price slab matches this transaction")

            # --- candidate rules --------------------------------------
            rule_rows = (await db.execute(
                select(PrizeRule, Prize)
                .join(Prize, Prize.id == PrizeRule.prize_id)
                .where(
                    PrizeRule.slab_id == slab_id,
                    PrizeRule.is_active.is_(True),
                    Prize.is_active.is_(True),
                    PrizeRule.weight > 0,
                )
            )).all()
            if not rule_rows:
                raise SpinError("No prizes configured for this slab")

            prize_ids = [p.id for _, p in rule_rows]

            # lock inventory rows for these prizes (store row or global)
            inv_rows = (await db.execute(
                select(PrizeInventory).where(
                    PrizeInventory.prize_id.in_(prize_ids),
                    (PrizeInventory.store_id == sess.store_id)
                    | (PrizeInventory.store_id.is_(None)),
                ).with_for_update()
            )).scalars().all()
            inv_map: dict[uuid.UUID, PrizeInventory] = {}
            for inv in inv_rows:
                cur = inv_map.get(inv.prize_id)
                # prefer a store-specific row over the global one
                if cur is None or (inv.store_id is not None and cur.store_id is None):
                    inv_map[inv.prize_id] = inv

            today = datetime.now(timezone.utc).date()
            candidates = []  # (rule, prize, inventory)
            for rule, prize in rule_rows:
                if prize.expiry_date and prize.expiry_date < today:
                    continue
                inv = inv_map.get(prize.id)
                if inv is None or inv.quantity_remaining <= 0:
                    continue
                if prize.max_winners is not None:
                    won = (await db.execute(
                        select(func.count()).select_from(SpinResult)
                        .where(SpinResult.prize_id == prize.id)
                    )).scalar_one()
                    if won >= prize.max_winners:
                        continue
                if rule.max_winners is not None:
                    won_slab = (await db.execute(
                        select(func.count()).select_from(SpinResult)
                        .where(SpinResult.prize_id == prize.id,
                               SpinResult.slab_id == slab_id)
                    )).scalar_one()
                    if won_slab >= rule.max_winners:
                        continue
                candidates.append((rule, prize, inv))

            if not candidates:
                raise SpinError("No prizes currently available (out of stock)")

            # --- choose the winner ------------------------------------
            forced = False
            roll = None
            total_weight = None
            chosen = None

            if sess.forced_prize_id:
                for c in candidates:
                    if c[1].id == sess.forced_prize_id:
                        chosen, forced = c, True
                        break
                if chosen is None:
                    raise SpinError("Forced prize is inactive or out of stock")
            else:
                weights = [float(r.weight) for r, _, _ in candidates]
                total_weight = sum(weights)
                roll = random.random() * total_weight
                acc = 0.0
                for cand, w in zip(candidates, weights):
                    acc += w
                    if roll <= acc:
                        chosen = cand
                        break
                if chosen is None:
                    chosen = candidates[-1]

            rule, prize, inv = chosen
            remaining_before = {p.id: iv.quantity_remaining for _, p, iv in candidates}

            # --- decrement stock + ledger -----------------------------
            inv.quantity_remaining -= 1
            ledger = InventoryLedger(
                inventory_id=inv.id,
                txn_type=InventoryTxnType.DEDUCT,
                quantity_delta=-1,
                balance_after=inv.quantity_remaining,
                actor_user_id=actor_user_id,
                note=f"Won on session {sess.id}",
            )
            db.add(ledger)
            await db.flush()

            meta = {
                "slab_id": str(slab_id),
                "forced": forced,
                "roll": roll,
                "total_weight": total_weight,
                "candidates": [
                    {
                        "prize_id": str(p.id),
                        "name": p.name,
                        "weight": float(r.weight),
                        "remaining_before": remaining_before[p.id],
                    }
                    for r, p, _ in candidates
                ],
            }
            result = SpinResult(
                session_id=sess.id,
                prize_id=prize.id,
                prize_name=prize.name,
                prize_value=prize.value,
                slab_id=slab_id,
                is_forced=forced,
                selection_meta=meta,
                inventory_ledger_id=ledger.id,
            )
            db.add(result)
            await db.flush()
            ledger.reference_id = result.id

            # --- advance bill + session -------------------------------
            if bill is not None:
                bill.spins_used += 1
                if bill.spins_used >= bill.spins_allowed:
                    bill.spin_status = BillSpinStatus.PLAYED

            now = datetime.now(timezone.utc)
            sess.status = SessionStatus.COMPLETED
            sess.spun_at = sess.spun_at or now
            sess.completed_at = now

            db.add(AuditLog(
                actor_user_id=actor_user_id,
                actor_role=None if actor_user_id else "SYSTEM",
                action="SPIN_FORCED" if forced else "SPIN_COMPLETED",
                entity_type="spin_session",
                entity_id=sess.id,
                store_id=sess.store_id,
                meta_data={"prize": prize.name, "value": float(prize.value),
                           "result_id": str(result.id)},
            ))

            dto = {
                "result_id": str(result.id),
                "session_id": str(sess.id),
                "prize_id": str(prize.id),
                "prize_name": prize.name,
                "prize_value": float(prize.value),
                "is_forced": forced,
                "slab_id": str(slab_id),
            }
        # transaction committed here
    return dto
