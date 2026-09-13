-- ============================================================
--  SPIN & WIN  —  PostgreSQL schema (v1)
--  Ashoka Enterprises | multi-store customer reward game
--  Target: PostgreSQL 14+   |   Run once on a FRESH database.
--
--  Design notes
--  ------------
--  * The WINNING PRIZE is decided server-side. This schema stores a
--    server-authoritative result (spin_results) with a snapshot of the
--    prize name/value at win time, plus a forced-winner field and full
--    audit logging. The atomic "award" function (weighted pick +
--    inventory decrement + duplicate-spin guard, all in ONE transaction)
--    is implemented in the backend phase against these tables.
--  * Stock lives in prize_inventory (per-store OR one global row per prize
--    when store_id IS NULL), so a store can optionally keep its own stock.
--  * Slab resolution: pick the active price_slab whose [min_price, max_price]
--    contains the qualifying mobile's selling price (max_price NULL = open
--    ended, e.g. "40000+"); ties broken by priority DESC.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;          -- gen_random_uuid()

-- ----------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'STORE_ADMIN', 'STAFF');

CREATE TYPE bill_spin_status AS ENUM ('NOT_PLAYED', 'PLAYED', 'LOCKED');

CREATE TYPE session_status AS ENUM (
    'CREATED',         -- QR/session generated, waiting for phone
    'CONNECTED',       -- phone paired
    'SPIN_REQUESTED',  -- phone pressed Spin, server validating
    'SPINNING',        -- prize chosen, TV animating
    'COMPLETED',       -- result shown + persisted
    'EXPIRED',
    'CANCELLED'
);

CREATE TYPE inventory_txn_type AS ENUM (
    'INITIAL', 'RESTOCK', 'DEDUCT', 'ADJUST', 'EXPIRE', 'REVERSAL'
);

-- ----------------------------------------------------------------
-- shared updated_at trigger
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- CORE
-- ----------------------------------------------------------------
CREATE TABLE stores (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code       text UNIQUE NOT NULL,              -- MAIN, DHAKOLI, ...
    name       text NOT NULL,
    address    text,
    city       text,
    phone      text,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username      text UNIQUE NOT NULL,
    email         text UNIQUE,
    password_hash text NOT NULL,
    full_name     text,
    role          user_role NOT NULL,
    store_id      uuid REFERENCES stores(id) ON DELETE SET NULL, -- NULL for SUPER_ADMIN
    is_active     boolean NOT NULL DEFAULT true,
    last_login_at timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT super_admin_no_store  CHECK (role <> 'SUPER_ADMIN' OR store_id IS NULL),
    CONSTRAINT scoped_role_has_store CHECK (role =  'SUPER_ADMIN' OR store_id IS NOT NULL)
);

CREATE TABLE employees (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id   uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id    uuid REFERENCES users(id) ON DELETE SET NULL,  -- optional login
    code       text NOT NULL,
    name       text NOT NULL,
    phone      text,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (store_id, code)
);

CREATE TABLE customers (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mobile     text UNIQUE NOT NULL,
    name       text,
    email      text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- CATALOG
-- ----------------------------------------------------------------
CREATE TABLE products (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sku           text UNIQUE,
    brand         text NOT NULL,
    model         text NOT NULL,
    name          text NOT NULL,
    category      text NOT NULL DEFAULT 'MOBILE',  -- MOBILE qualifies for a spin
    default_price numeric(12,2),
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE price_slabs (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id   uuid REFERENCES stores(id) ON DELETE CASCADE,  -- NULL = global
    name       text NOT NULL,
    min_price  numeric(12,2) NOT NULL,
    max_price  numeric(12,2),                                 -- NULL = open ended
    priority   int NOT NULL DEFAULT 0,                        -- tie-break on overlap
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT slab_range_valid CHECK (max_price IS NULL OR max_price >= min_price)
);

-- ----------------------------------------------------------------
-- BILLS  (bill verification / eligibility)
-- ----------------------------------------------------------------
CREATE TABLE bills (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    bill_number   text NOT NULL,
    bill_date     date NOT NULL DEFAULT current_date,
    customer_id   uuid REFERENCES customers(id) ON DELETE SET NULL,
    employee_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
    total_amount  numeric(12,2),
    spin_eligible boolean NOT NULL DEFAULT true,
    spins_allowed int NOT NULL DEFAULT 1 CHECK (spins_allowed >= 0),
    spins_used    int NOT NULL DEFAULT 0 CHECK (spins_used >= 0),
    spin_status   bill_spin_status NOT NULL DEFAULT 'NOT_PLAYED',
    external_ref  text,                       -- link to your ERP/billing later
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (store_id, bill_number),
    CONSTRAINT spins_not_exceeded CHECK (spins_used <= spins_allowed)
);

CREATE TABLE bill_items (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id       uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    product_id    uuid REFERENCES products(id) ON DELETE SET NULL,
    brand         text,
    model         text,
    serial_imei   text,
    selling_price numeric(12,2) NOT NULL,
    quantity      int NOT NULL DEFAULT 1 CHECK (quantity > 0),
    is_spin_item  boolean NOT NULL DEFAULT false,  -- the qualifying mobile line
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- PRIZES  +  INVENTORY  +  RULES
-- ----------------------------------------------------------------
CREATE TABLE prizes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    description text,
    image_url   text,
    value       numeric(12,2) NOT NULL DEFAULT 0,  -- prize cost / value
    category    text,                              -- VOUCHER, ACCESSORY, CASHBACK...
    is_active   boolean NOT NULL DEFAULT true,
    priority    int NOT NULL DEFAULT 0,            -- wheel ordering
    max_winners int,                               -- global cap (NULL = unlimited)
    expiry_date date,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Source of truth for stock. One row per (prize, store); store_id NULL = shared pool.
CREATE TABLE prize_inventory (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prize_id            uuid NOT NULL REFERENCES prizes(id) ON DELETE CASCADE,
    store_id            uuid REFERENCES stores(id) ON DELETE CASCADE,  -- NULL = shared
    quantity_initial    int NOT NULL DEFAULT 0 CHECK (quantity_initial   >= 0),
    quantity_remaining  int NOT NULL DEFAULT 0 CHECK (quantity_remaining >= 0),
    low_stock_threshold int NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (prize_id, store_id),
    CONSTRAINT remaining_lte_initial CHECK (quantity_remaining <= quantity_initial)
);
-- UNIQUE(prize_id, store_id) does not stop multiple global (NULL) rows, so:
CREATE UNIQUE INDEX uq_prize_inventory_global
    ON prize_inventory (prize_id) WHERE store_id IS NULL;

-- Full audit history of every stock change.
CREATE TABLE inventory_ledger (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id   uuid NOT NULL REFERENCES prize_inventory(id) ON DELETE CASCADE,
    txn_type       inventory_txn_type NOT NULL,
    quantity_delta int  NOT NULL,               -- +restock / -deduct
    balance_after  int  NOT NULL,
    reference_id   uuid,                         -- e.g. spin_result id
    actor_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
    note           text,
    created_at     timestamptz NOT NULL DEFAULT now()
);

-- Maps a price slab to the prizes in its pool, with weights.
CREATE TABLE prize_rules (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slab_id     uuid NOT NULL REFERENCES price_slabs(id) ON DELETE CASCADE,
    prize_id    uuid NOT NULL REFERENCES prizes(id)      ON DELETE CASCADE,
    weight      numeric(10,3) NOT NULL DEFAULT 1 CHECK (weight >= 0),
    max_winners int,                              -- cap for this prize in this slab
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (slab_id, prize_id)
);

-- ----------------------------------------------------------------
-- GAME  (TV devices, sessions, results)
-- ----------------------------------------------------------------
CREATE TABLE tv_devices (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id          uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    code              text UNIQUE NOT NULL,        -- TV-001
    name              text,
    pairing_code      text,                        -- rotating code shown for pairing
    active_session_id uuid,                        -- FK added after spin_sessions
    is_active         boolean NOT NULL DEFAULT true,
    last_seen_at      timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE spin_sessions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id           uuid NOT NULL REFERENCES stores(id)     ON DELETE RESTRICT,
    tv_device_id       uuid REFERENCES tv_devices(id)          ON DELETE SET NULL,
    bill_id            uuid REFERENCES bills(id)               ON DELETE SET NULL,
    bill_item_id       uuid REFERENCES bill_items(id)          ON DELETE SET NULL,
    customer_id        uuid REFERENCES customers(id)           ON DELETE SET NULL,
    price_slab_id      uuid REFERENCES price_slabs(id)         ON DELETE SET NULL,
    qualifying_price   numeric(12,2),
    pairing_code       text NOT NULL UNIQUE,       -- token embedded in the QR
    status             session_status NOT NULL DEFAULT 'CREATED',
    forced_prize_id    uuid REFERENCES prizes(id) ON DELETE SET NULL,  -- controlled winner
    forced_by_user_id  uuid REFERENCES users(id)  ON DELETE SET NULL,
    created_by_user_id uuid REFERENCES users(id)  ON DELETE SET NULL,  -- staff, if any
    connected_at       timestamptz,
    spun_at            timestamptz,
    completed_at       timestamptz,
    expires_at         timestamptz,
    client_ip          inet,
    user_agent         text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE spin_results (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          uuid NOT NULL UNIQUE REFERENCES spin_sessions(id) ON DELETE CASCADE,
    prize_id            uuid REFERENCES prizes(id)      ON DELETE SET NULL,
    prize_name          text NOT NULL,                 -- snapshot at win time
    prize_value         numeric(12,2) NOT NULL DEFAULT 0,  -- snapshot at win time
    slab_id             uuid REFERENCES price_slabs(id) ON DELETE SET NULL,
    is_forced           boolean NOT NULL DEFAULT false,
    selection_meta      jsonb,                         -- candidate pool, weights, rng
    inventory_ledger_id uuid REFERENCES inventory_ledger(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- close the TV <-> session cycle
ALTER TABLE tv_devices
    ADD CONSTRAINT fk_tv_active_session
    FOREIGN KEY (active_session_id) REFERENCES spin_sessions(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------
-- SETTINGS  +  AUDIT
-- ----------------------------------------------------------------
CREATE TABLE app_settings (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id   uuid REFERENCES stores(id) ON DELETE CASCADE,  -- NULL = global default
    key        text NOT NULL,
    value      jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (store_id, key)
);

CREATE TABLE audit_logs (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid REFERENCES users(id)  ON DELETE SET NULL,
    actor_role    text,
    action        text NOT NULL,       -- PRIZE_UPDATE, SPIN_FORCED, INVENTORY_RESTOCK...
    entity_type   text,
    entity_id     uuid,
    store_id      uuid REFERENCES stores(id) ON DELETE SET NULL,
    metadata      jsonb,
    client_ip     inet,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------
CREATE INDEX idx_users_store            ON users (store_id);
CREATE INDEX idx_employees_store        ON employees (store_id);
CREATE INDEX idx_bills_customer         ON bills (customer_id);
CREATE INDEX idx_bills_date             ON bills (bill_date);
CREATE INDEX idx_bills_store_status     ON bills (store_id, spin_status);
CREATE INDEX idx_bill_items_bill        ON bill_items (bill_id);
CREATE INDEX idx_slabs_active           ON price_slabs (is_active, min_price);
CREATE INDEX idx_prize_rules_slab       ON prize_rules (slab_id);
CREATE INDEX idx_prize_rules_prize      ON prize_rules (prize_id);
CREATE INDEX idx_inventory_prize        ON prize_inventory (prize_id);
CREATE INDEX idx_inv_ledger_inv         ON inventory_ledger (inventory_id, created_at);
CREATE INDEX idx_sessions_status        ON spin_sessions (status);
CREATE INDEX idx_sessions_bill          ON spin_sessions (bill_id);
CREATE INDEX idx_sessions_tv            ON spin_sessions (tv_device_id);
CREATE INDEX idx_sessions_created       ON spin_sessions (created_at);
CREATE INDEX idx_results_prize          ON spin_results (prize_id);
CREATE INDEX idx_results_created        ON spin_results (created_at);
CREATE INDEX idx_audit_entity           ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_store_created    ON audit_logs (store_id, created_at);

-- ----------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'stores','users','customers','bills','price_slabs','prizes',
        'prize_inventory','prize_rules','tv_devices','spin_sessions','app_settings'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON %1$s;', t);
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON %1$s '
            'FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t);
    END LOOP;
END $$;

COMMIT;
