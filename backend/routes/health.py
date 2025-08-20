from __future__ import annotations

import json
from flask import Blueprint, current_app, jsonify
from ..services.updates import load_updates, apply_updates
from pathlib import Path

from .. import cache

bp = Blueprint("health", __name__)


@bp.get("/")
@cache.cached()  # uses CACHE_DEFAULT_TIMEOUT
def health_centers():
    path = current_app.config["HEALTH_FACILITIES_PATH"]
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    # ensure features have a stable id (add in pipeline if missing)
    for i, ft in enumerate(data.get("features", [])):
        ft.setdefault("properties", {}).setdefault("id", f"health:{i}")
    updates_path = Path(current_app.root_path).parents[1] / "aid_dashboard_data" / "updates" / "health.jsonl"
    updates = load_updates(updates_path)
    merged = apply_updates(data["features"], updates, id_field="id")
    return jsonify({"type":"FeatureCollection","features":merged})
