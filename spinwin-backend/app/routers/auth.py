from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import User
from ..security import create_token, get_current_user, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
async def login(form: OAuth2PasswordRequestForm = Depends(),
                db: AsyncSession = Depends(get_db)):
    user = (await db.execute(
        select(User).where(User.username == form.username)
    )).scalar_one_or_none()
    if not user or not user.is_active or not verify_password(form.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()
    return {"access_token": create_token(user), "token_type": "bearer",
            "role": user.role.value}


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {"id": str(user.id), "username": user.username,
            "role": user.role.value,
            "store_id": str(user.store_id) if user.store_id else None}
