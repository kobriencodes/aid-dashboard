from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from flask import current_app

from ..pipelines.borders import load_border_crossings
from ..pipelines.checkpoints import load_checkpoints, load_roads
from ..pipelines.health_facilities import load_health_facilities


def get_bundle(include: Iterable[str] | None = None) -> dict[str, Any]:
    cfg = current_app.config
    # always available keys
    loaders = {
        "health": lambda: load_health_facilities(cfg["HEALTH_FACILITIES_PATH"]),
        "checkpoints": lambda: load_checkpoints(cfg["COMBINED_CHECKPOINTS_PATH"]),
        "roads": lambda: load_roads(cfg["COMBINED_CHECKPOINTS_PATH"]),
        "borders": lambda: load_border_crossings(cfg["BORDER_CROSSINGS_PATH"]),
    }
    selected = loaders if not include else {k: v for k, v in loaders.items() if k in include}

    payload: dict[str, Any] = {"data": {}, "meta": {"sources": {}, "included": list(selected)}}
    for key, fn in selected.items():
        chunk = fn()
        payload["data"][key] = chunk["data"]
        payload["meta"]["sources"][key] = chunk["meta"]
    return payload
