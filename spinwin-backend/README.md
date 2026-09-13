# Spin & Win — Backend (Phase 2)

FastAPI + SQLAlchemy 2.0 (async) + PostgreSQL + Socket.IO.

This phase delivers the hard core: authentication with role-based access,
the **server-authoritative prize engine**, and the **real-time phone ↔ TV**
layer. Admin CRUD endpoints (prize/slab/rule/inventory management, history,
analytics) come in Phase 3 alongside the dashboard that consumes them.

## Structure

```
spinwin-backend/
├─ app/
│  ├─ config.py        settings (env-driven)
│  ├─ db.py            async engine + session
│  ├─ models.py        SQLAlchemy models (mirror of schema.sql)
│  ├─ security.py      JWT, bcrypt, RBAC dependencies
│  ├─ engine.py        award_spin() — the atomic prize decision  ← core
│  ├─ realtime.py      Socket.IO server + events                 ← core
│  ├─ main.py          FastAPI app + Socket.IO mount
│  └─ routers/
│     ├─ auth.py       /api/auth/login, /me
│     └─ game.py       eligibility, sessions, force-winner, spin
└─ scripts/create_user.py
```

## Run

```bash
# 1. database (run the Phase-1 files first)
createdb spinwin
psql spinwin < ../schema.sql
psql spinwin < ../seed_demo.sql

# 2. backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then edit DATABASE_URL + JWT_SECRET

# 3. set real passwords for the seeded users (seed hashes are placeholders)
python -m scripts.create_user --username superadmin --password test1234 --role SUPER_ADMIN
python -m scripts.create_user --username mainadmin  --password test1234 --role STORE_ADMIN \
    --store-id 11111111-1111-1111-1111-111111111111
python -m scripts.create_user --username staff1     --password test1234 --role STAFF \
    --store-id 11111111-1111-1111-1111-111111111111

# 4. serve (FastAPI + Socket.IO on one ASGI app)
uvicorn app.main:sio_app --reload
```

API docs: `http://localhost:8000/docs`  ·  health: `/health`

## REST flow

1. `POST /api/eligibility` `{store_id, bill_number}` → is this bill playable + resolved slab.
2. `POST /api/sessions` `{bill_id}` → creates a session, returns `pairing_code` + `qr_payload`.
3. (admin, optional) `POST /api/sessions/{id}/force` `{prize_id}` → controlled winner, audited.
4. `POST /api/sessions/{id}/spin` → REST fallback that runs the engine (Socket.IO is the normal path).

## Real-time protocol (Socket.IO)

| From    | Event              | Payload                                   |
|---------|--------------------|-------------------------------------------|
| TV      | `tv_join`          | `{tv_code}`                               |
| TV      | `tv_watch`         | `{session_id}`                            |
| phone   | `customer_join`    | `{pairing_code}`                          |
| server  | `CUSTOMER_CONNECTED` | `{session_id}`  (to session room)       |
| phone   | `SPIN_REQUESTED`   | `{}`                                       |
| server  | `SPIN_STARTED`     | `{wheel, winning_index, duration, result}` |
| server  | `PRIZE_WON`        | `{result}`  (after `duration` seconds)     |
| server  | `SPIN_ERROR`       | `{error}`                                  |

The server picks the prize on `SPIN_REQUESTED` (via `engine.award_spin`) and
sends `winning_index` so the TV animates to the correct slice. The frontend
never decides the outcome.

## Why it's safe

`award_spin` runs in a single transaction with `SELECT … FOR UPDATE` on the
session, bill, and inventory rows. That serialises concurrent spins on the
same bill (second one is rejected), guarantees stock can't go negative, and
enforces `max_winners` caps. Every award writes a `spin_result` snapshot, an
`inventory_ledger` deduct, and an `audit_log` entry.

## Next (Phase 3)

Admin CRUD + analytics endpoints, then the React dashboard, `/play`, `/staff`,
and the `/tv` wheel.
