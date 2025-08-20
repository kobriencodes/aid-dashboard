from __future__ import annotations
import json
from pathlib import Path
from flask import Blueprint, jsonify, current_app
from .. import cache
from ..services.updates import load_updates, apply_updates
from ..services.ids import ensure_ids

bp = Blueprint("borders", __name__)


@bp.get("/")
@cache.cached()
def border_crossings():
    path = current_app.config["BORDER_CROSSINGS_PATH"]
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    features = ensure_ids(features, prefix="border")

    updates_path = Path(current_app.root_path).parents[1] / "aid_dashboard_data" / "updates" / "borders.jsonl"
    updates = load_updates(updates_path)
    merged = apply_updates(features, updates, id_field="id")

    return jsonify({"type": "FeatureCollection", "features": merged})
