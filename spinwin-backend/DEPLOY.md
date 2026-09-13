# Deploying the Spin & Win backend

Stack: FastAPI (ASGI) + async SQLAlchemy + Socket.IO + PostgreSQL.
Recommended host: **Render** (Git deploys, native WebSockets, managed Postgres).

## The 3 things that matter for THIS stack

1. **Single worker (or add Redis).** Socket.IO keeps room state in memory, and
   the delayed `PRIZE_WON` runs as an in-process task. With >1 worker/instance,
   an emit from one worker won't reach clients on another. The start command
   pins `--workers 1`, which is correct for one showroom. To scale to multiple
   instances later, give every worker a shared backplane:
   ```python
   # app/realtime.py
   mgr = socketio.AsyncRedisManager(settings.REDIS_URL)
   sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*", client_manager=mgr)
   ```
   (Render offers a Key Value / Redis instance for this.)

2. **WebSocket-capable host only.** Render supports long-lived WebSockets, so
   the backend belongs there. Do **not** put the backend on Vercel/Netlify
   serverless — they can't hold a Socket.IO connection. The *frontend* (Phase 3)
   can go on any static host.

3. **Connection string.** Managed Postgres gives a libpq URL; this app needs the
   asyncpg driver. `config.py` now rewrites `postgres://` / `postgresql://` to
   `postgresql+asyncpg://` and strips `?sslmode=` automatically, so you can paste
   Render's internal URL as-is. (For an *external* SSL DB, set
   `connect_args={"ssl": True}` in `app/db.py`.)

## Option A — Blueprint (one step)

1. Push `spinwin-backend/` to a GitHub repo (this folder = repo root).
2. Render → **New + → Blueprint** → select the repo. `render.yaml` provisions the
   web service + Postgres and wires `DATABASE_URL` and a generated `JWT_SECRET`.
3. Load the schema + seed, then set passwords (see "One-time DB setup").

## Option B — Manual

1. **New + → PostgreSQL** → plan Basic-256mb → copy the **Internal Database URL**.
2. **New + → Web Service** → connect repo →
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn app.main:sio_app --host 0.0.0.0 --port $PORT --workers 1`
   - Health check path: `/health`
   - Env vars: `DATABASE_URL` = internal URL, `JWT_SECRET` = long random string,
     `ANIMATION_SECONDS` = 6.

## One-time DB setup

From your laptop, using the database's **External** connection string:
```bash
psql "postgresql://USER:PASS@HOST/spinwin" < schema.sql
psql "postgresql://USER:PASS@HOST/spinwin" < seed_demo.sql
```
Then set real passwords for the seeded users. Open a Render **Shell** on the web
service (or run locally against the external URL):
```bash
python -m scripts.create_user --username superadmin --password '<pick>' --role SUPER_ADMIN
python -m scripts.create_user --username mainadmin  --password '<pick>' --role STORE_ADMIN \
    --store-id 11111111-1111-1111-1111-111111111111
```

## Verify

- `https://spinwin-api.onrender.com/health` → `{"status":"ok"}`
- `https://spinwin-api.onrender.com/docs` → log in, hit `/api/eligibility` with
  store_id `11111111-1111-1111-1111-111111111111` and bill `INV-1002`.

## Cost (Render, 2026)

- Testing: $0 (free web + free Postgres) — but the DB expires after 30 days and
  the service cold-starts after 15 min idle. Not for the live showroom.
- Production floor: ~$13/mo (Starter web $7 + Basic-256mb Postgres $6) on the $0
  Hobby workspace. Add Redis only when you run more than one instance.
