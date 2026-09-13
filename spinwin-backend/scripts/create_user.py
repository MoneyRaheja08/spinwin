"""Create or reset a user (fixes the placeholder hashes from seed_demo.sql).

Usage:
  python -m scripts.create_user --username superadmin --password secret --role SUPER_ADMIN
  python -m scripts.create_user --username mainadmin  --password secret --role STORE_ADMIN \
      --store-id 11111111-1111-1111-1111-111111111111
"""
import argparse
import asyncio
import uuid

from sqlalchemy import select

from app.db import AsyncSessionLocal
from app.models import User, UserRole
from app.security import hash_password


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--username", required=True)
    ap.add_argument("--password", required=True)
    ap.add_argument("--role", required=True, choices=[r.value for r in UserRole])
    ap.add_argument("--store-id", default=None)
    ap.add_argument("--full-name", default=None)
    a = ap.parse_args()

    store_id = uuid.UUID(a.store_id) if a.store_id else None
    async with AsyncSessionLocal() as db:
        user = (await db.execute(
            select(User).where(User.username == a.username)
        )).scalar_one_or_none()
        if user:
            user.password_hash = hash_password(a.password)
            user.role = UserRole(a.role)
            user.store_id = store_id
            if a.full_name:
                user.full_name = a.full_name
            print("Updated user:", a.username)
        else:
            db.add(User(username=a.username, password_hash=hash_password(a.password),
                        role=UserRole(a.role), store_id=store_id, full_name=a.full_name))
            print("Created user:", a.username)
        await db.commit()


if __name__ == "__main__":
    asyncio.run(main())
