"""SQLAlchemy 2.0 models — mirror of schema.sql.

PG enum types and gen_random_uuid() already exist from schema.sql, so
Enum columns are mapped with create_type=False and UUID pks use a server
default. NOTE: the `metadata` column on audit_logs is mapped to the Python
attribute `meta_data` because `metadata` is reserved on the declarative Base.
"""
from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text,
    Uuid, func, text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------- enums
class UserRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    STORE_ADMIN = "STORE_ADMIN"
    STAFF = "STAFF"


class BillSpinStatus(str, enum.Enum):
    NOT_PLAYED = "NOT_PLAYED"
    PLAYED = "PLAYED"
    LOCKED = "LOCKED"


class SessionStatus(str, enum.Enum):
    CREATED = "CREATED"
    CONNECTED = "CONNECTED"
    SPIN_REQUESTED = "SPIN_REQUESTED"
    SPINNING = "SPINNING"
    COMPLETED = "COMPLETED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class InventoryTxnType(str, enum.Enum):
    INITIAL = "INITIAL"
    RESTOCK = "RESTOCK"
    DEDUCT = "DEDUCT"
    ADJUST = "ADJUST"
    EXPIRE = "EXPIRE"
    REVERSAL = "REVERSAL"


def _enum(py_enum, name):
    return Enum(py_enum, name=name, create_type=False,
               values_callable=lambda e: [m.value for m in e])


_PK = lambda: mapped_column(Uuid(as_uuid=True), primary_key=True,
                            server_default=text("gen_random_uuid()"))
_NOW = lambda: mapped_column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------- core
class Store(Base):
    __tablename__ = "stores"
    id: Mapped[uuid.UUID] = _PK()
    code: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _NOW()
    updated_at: Mapped[datetime] = _NOW()


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = _PK()
    username: Mapped[str] = mapped_column(Text, unique=True)
    email: Mapped[str | None] = mapped_column(Text, unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    full_name: Mapped[str | None] = mapped_column(Text)
    role: Mapped[UserRole] = mapped_column(_enum(UserRole, "user_role"))
    store_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("stores.id", ondelete="SET NULL"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _NOW()
    updated_at: Mapped[datetime] = _NOW()


class Employee(Base):
    __tablename__ = "employees"
    id: Mapped[uuid.UUID] = _PK()
    store_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    code: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _NOW()


class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[uuid.UUID] = _PK()
    mobile: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _NOW()
    updated_at: Mapped[datetime] = _NOW()


# ---------------------------------------------------------------- catalog
class Product(Base):
    __tablename__ = "products"
    id: Mapped[uuid.UUID] = _PK()
    sku: Mapped[str | None] = mapped_column(Text, unique=True)
    brand: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text, default="MOBILE")
    default_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _NOW()


class PriceSlab(Base):
    __tablename__ = "price_slabs"
    id: Mapped[uuid.UUID] = _PK()
    store_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(Text)
    min_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    max_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    priority: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _NOW()
    updated_at: Mapped[datetime] = _NOW()


# ---------------------------------------------------------------- bills
class Bill(Base):
    __tablename__ = "bills"
    id: Mapped[uuid.UUID] = _PK()
    store_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stores.id", ondelete="RESTRICT"))
    bill_number: Mapped[str] = mapped_column(Text)
    bill_date: Mapped[date] = mapped_column(Date, server_default=func.current_date())
    customer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"))
    employee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id", ondelete="SET NULL"))
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    spin_eligible: Mapped[bool] = mapped_column(Boolean, default=True)
    spins_allowed: Mapped[int] = mapped_column(Integer, default=1)
    spins_used: Mapped[int] = mapped_column(Integer, default=0)
    spin_status: Mapped[BillSpinStatus] = mapped_column(_enum(BillSpinStatus, "bill_spin_status"),
                                                        default=BillSpinStatus.NOT_PLAYED)
    external_ref: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _NOW()
    updated_at: Mapped[datetime] = _NOW()


class BillItem(Base):
    __tablename__ = "bill_items"
    id: Mapped[uuid.UUID] = _PK()
    bill_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bills.id", ondelete="CASCADE"))
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"))
    brand: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(Text)
    serial_imei: Mapped[str | None] = mapped_column(Text)
    selling_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    is_spin_item: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _NOW()


# ---------------------------------------------------------------- prizes
class Prize(Base):
    __tablename__ = "prizes"
    id: Mapped[uuid.UUID] = _PK()
    name: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(Text)
    value: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    category: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    max_winners: Mapped[int | None] = mapped_column(Integer)
    expiry_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = _NOW()
    updated_at: Mapped[datetime] = _NOW()


class PrizeInventory(Base):
    __tablename__ = "prize_inventory"
    id: Mapped[uuid.UUID] = _PK()
    prize_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prizes.id", ondelete="CASCADE"))
    store_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"))
    quantity_initial: Mapped[int] = mapped_column(Integer, default=0)
    quantity_remaining: Mapped[int] = mapped_column(Integer, default=0)
    low_stock_threshold: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = _NOW()
    updated_at: Mapped[datetime] = _NOW()


class InventoryLedger(Base):
    __tablename__ = "inventory_ledger"
    id: Mapped[uuid.UUID] = _PK()
    inventory_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prize_inventory.id", ondelete="CASCADE"))
    txn_type: Mapped[InventoryTxnType] = mapped_column(_enum(InventoryTxnType, "inventory_txn_type"))
    quantity_delta: Mapped[int] = mapped_column(Integer)
    balance_after: Mapped[int] = mapped_column(Integer)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True))
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _NOW()


class PrizeRule(Base):
    __tablename__ = "prize_rules"
    id: Mapped[uuid.UUID] = _PK()
    slab_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("price_slabs.id", ondelete="CASCADE"))
    prize_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prizes.id", ondelete="CASCADE"))
    weight: Mapped[Decimal] = mapped_column(Numeric(10, 3), default=1)
    max_winners: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _NOW()
    updated_at: Mapped[datetime] = _NOW()


# ---------------------------------------------------------------- game
class TvDevice(Base):
    __tablename__ = "tv_devices"
    id: Mapped[uuid.UUID] = _PK()
    store_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"))
    code: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str | None] = mapped_column(Text)
    pairing_code: Mapped[str | None] = mapped_column(Text)
    active_session_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _NOW()
    updated_at: Mapped[datetime] = _NOW()


class SpinSession(Base):
    __tablename__ = "spin_sessions"
    id: Mapped[uuid.UUID] = _PK()
    store_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stores.id", ondelete="RESTRICT"))
    tv_device_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tv_devices.id", ondelete="SET NULL"))
    bill_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bills.id", ondelete="SET NULL"))
    bill_item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bill_items.id", ondelete="SET NULL"))
    customer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"))
    price_slab_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("price_slabs.id", ondelete="SET NULL"))
    qualifying_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    pairing_code: Mapped[str] = mapped_column(Text, unique=True)
    status: Mapped[SessionStatus] = mapped_column(_enum(SessionStatus, "session_status"),
                                                  default=SessionStatus.CREATED)
    forced_prize_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("prizes.id", ondelete="SET NULL"))
    forced_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    spun_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    client_ip: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _NOW()
    updated_at: Mapped[datetime] = _NOW()


class SpinResult(Base):
    __tablename__ = "spin_results"
    id: Mapped[uuid.UUID] = _PK()
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("spin_sessions.id", ondelete="CASCADE"), unique=True)
    prize_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("prizes.id", ondelete="SET NULL"))
    prize_name: Mapped[str] = mapped_column(Text)
    prize_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    slab_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("price_slabs.id", ondelete="SET NULL"))
    is_forced: Mapped[bool] = mapped_column(Boolean, default=False)
    selection_meta: Mapped[dict | None] = mapped_column(JSONB)
    inventory_ledger_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("inventory_ledger.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = _NOW()


# ---------------------------------------------------------------- settings + audit
class AppSetting(Base):
    __tablename__ = "app_settings"
    id: Mapped[uuid.UUID] = _PK()
    store_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(Text)
    value: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    updated_at: Mapped[datetime] = _NOW()


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[uuid.UUID] = _PK()
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    actor_role: Mapped[str | None] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text)
    entity_type: Mapped[str | None] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True))
    store_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("stores.id", ondelete="SET NULL"))
    meta_data: Mapped[dict | None] = mapped_column("metadata", JSONB)
    client_ip: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = _NOW()
