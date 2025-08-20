from __future__ import annotations

from flask import Blueprint, jsonify, make_response, request, current_app
from pathlib import Path
import json, glob

from .. import cache
from ..services.datasets import get_bundle

bp = Blueprint("datasets", __name__)


@bp.get("/")
@cache.cached()
def datasets_bundle():
    include = request.args.get("include")
    parts = [p.strip() for p in include.split(",")] if include else None
    data = get_bundle(parts)
    resp = make_response(jsonify(data))
    resp.headers["Cache-Control"] = "public, max-age=300"
    return resp

@bp.get("/meta")
def datasets_meta():
    base = Path(current_app.config["HEALTH_FACILITIES_PATH"]).parents[1]
    metas = {}
    for p in glob.glob(str(base / "**/*.meta.json"), recursive=True):
        with open(p, "r", encoding="utf-8") as f:
            metas[Path(p).stem] = json.load(f)
    return jsonify({"meta_files": metas})