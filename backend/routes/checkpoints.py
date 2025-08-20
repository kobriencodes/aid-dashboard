from __future__ import annotations
import json
from pathlib import Path
from flask import Blueprint, jsonify, current_app
from .. import cache
from ..services.updates import load_updates, apply_updates
from ..services.ids import ensure_ids

bp = Blueprint("checkpoints_roads", __name__)


def _load_combined():
    path = current_app.config["COMBINED_CHECKPOINTS_PATH"]
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@bp.get("/checkpoints")
@cache.cached()
def checkpoints():
    data = _load_combined()
    features = [ft for ft in data.get("features", []) if ft.get("geometry", {}).get("type") == "Point"]
    features = ensure_ids(features, prefix="checkpoint")

    updates_path = Path(current_app.root_path).parents[1] / "aid_dashboard_data" / "updates" / "checkpoints.jsonl"
    updates = load_updates(updates_path)
    merged = apply_updates(features, updates, id_field="id")

    return jsonify({"type": "FeatureCollection", "features": merged})

@bp.get("/roads")
@cache.cached()
def roads():
    data = _load_combined()
    features = [ft for ft in data.get("features", []) if ft.get("geometry", {}).get("type") == "LineString"]
    features = ensure_ids(features, prefix="road")

    updates_path = Path(current_app.root_path).parents[1] / "aid_dashboard_data" / "updates" / "roads.jsonl"
    updates = load_updates(updates_path)
    merged = apply_updates(features, updates, id_field="id")

    return jsonify({"type": "FeatureCollection", "features": merged})
