"""Small shared helpers for the admin/history/analytics routers."""
import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import inspect as sa_inspect


def uid(x) -> uuid.UUID:
    return x if isinstance(x, uuid.UUID) else uuid.UUID(str(x))


def dump(obj) -> dict:
    """Serialize a SQLAlchemy model instance to a JSON-safe dict."""
    out = {}
    for attr in sa_inspect(obj).mapper.column_attrs:
        v = getattr(obj, attr.key)
        if isinstance(v, uuid.UUID):
            v = str(v)
        elif isinstance(v, datetime):
            v = v.isoformat()
        elif isinstance(v, date):
            v = v.isoformat()
        elif isinstance(v, Decimal):
            v = float(v)
        elif isinstance(v, enum.Enum):
            v = v.value
        out[attr.key] = v
    return out
