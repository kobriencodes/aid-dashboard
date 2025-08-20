from __future__ import annotations

from flask import Blueprint

bp = Blueprint("healthcheck", __name__)


@bp.get("/health")
def health():
    return {"status": "ok"}
