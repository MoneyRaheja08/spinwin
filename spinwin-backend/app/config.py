import re

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/spinwin"
    JWT_SECRET: str = "change-me-in-prod"
    JWT_ALG: str = "HS256"
    JWT_EXPIRE_MIN: int = 720
    ANIMATION_SECONDS: int = 6
    SESSION_TTL_MIN: int = 30

    @field_validator("DATABASE_URL")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        # Managed providers (Render, Supabase, Neon) hand you a libpq-style
        # URL. This app uses the asyncpg driver, so force the right scheme...
        if v.startswith("postgres://"):
            v = "postgresql+asyncpg://" + v.split("://", 1)[1]
        elif v.startswith("postgresql://"):
            v = "postgresql+asyncpg://" + v.split("://", 1)[1]
        # ...and drop libpq's ?sslmode= (asyncpg rejects it). Render's
        # INTERNAL database URL needs no SSL param; for an external URL that
        # requires SSL, pass connect_args={"ssl": True} in db.py instead.
        v = re.sub(r"[?&]sslmode=[^&]+", "", v)
        return v


settings = Settings()
