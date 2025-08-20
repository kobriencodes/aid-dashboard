from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from flask import current_app


def get_bundle(include: Iterable[str] | None = None) -> dict[str, Any]:
    cfg = current_app.config
    loaders = {
        "health": lambda: _load_existing(cfg["HEALTH_FACILITIES_PATH"]),
        "checkpoints": lambda: _extract_points(cfg["COMBINED_CHECKPOINTS_PATH"]),
        "roads": lambda: _extract_lines(cfg["COMBINED_CHECKPOINTS_PATH"]),
        "borders": lambda: _load_existing(cfg["BORDER_CROSSINGS_PATH"]),
    }
    selected = loaders if not include else {k: v for k, v in loaders.items() if k in include}

    bundle: dict[str, Any] = {"data": {}, "meta": {"included": list(selected), "sources": {}}}
    for key, fn in selected.items():
        chunk = fn()
        bundle["data"][key] = chunk["data"]
        bundle["meta"]["sources"][key] = chunk["meta"]
    return bundle


# Helpers that read already-built files and wrap with consistent meta
import json
from pathlib import Path


def _wrap(data: dict, path: str, source: str) -> dict[str, Any]:
    feats = data.get("features", []) if isinstance(data, dict) else []
    return {
        "data": data,
        "meta": {"source": source, "path": str(Path(path).resolve()), "records": len(feats)},
    }


def _load_json(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _extract_points(path: str) -> dict[str, Any]:
    data = _load_json(path)
    feats = [ft for ft in data.get("features", []) if ft.get("geometry", {}).get("type") == "Point"]
    return _wrap({"type": "FeatureCollection", "features": feats}, path, "checkpoints")


def _extract_lines(path: str) -> dict[str, Any]:
    data = _load_json(path)
    feats = [
        ft for ft in data.get("features", []) if ft.get("geometry", {}).get("type") == "LineString"
    ]
    return _wrap({"type": "FeatureCollection", "features": feats}, path, "roads")


def _load_existing(path: str) -> dict[str, Any]:
    return _wrap(_load_json(path), path, Path(path).stem)
