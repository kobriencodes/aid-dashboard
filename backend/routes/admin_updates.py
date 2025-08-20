# backend/routes/admin_updates.py
from __future__ import annotations
from flask import Blueprint, request, jsonify, abort, current_app
from pathlib import Path
import csv, io, json
from datetime import datetime, timezone

bp = Blueprint("admin_updates", __name__)

def _updates_dir() -> Path:
    return Path(current_app.root_path).parents[1] / "aid_dashboard_data" / "updates"

ALLOWED_CATEGORIES = {"health","checkpoints","borders","roads","food","water","shelters"}

def _parse_iso(ts: str) -> datetime:
    # permissive ISO parser; require 'Z' or offset
    try:
        if ts.endswith("Z"):
            return datetime.fromisoformat(ts[:-1]).replace(tzinfo=timezone.utc)
        return datetime.fromisoformat(ts)
    except Exception:
        raise ValueError("verified_at must be ISO-8601, e.g. 2025-08-19T13:45:00Z")

def _iter_jsonl(path: Path):
    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                # skip bad lines (or log)
                continue

def _latest_per_id(path: Path) -> list[dict]:
    """Return only the latest row per id (by verified_at), stable-sorted by time desc."""
    latest: dict[str, dict] = {}
    for obj in _iter_jsonl(path):
        _id = obj.get("id")
        if not _id:
            continue
        try:
            ts = _parse_iso(obj.get("verified_at",""))
        except Exception:
            continue
        prev = latest.get(_id)
        if not prev:
            latest[_id] = obj
        else:
            try:
                prev_ts = _parse_iso(prev.get("verified_at",""))
            except Exception:
                prev_ts = datetime.min.replace(tzinfo=timezone.utc)
            if ts >= prev_ts:
                latest[_id] = obj
    # newest first
    rows = list(latest.values())
    rows.sort(key=lambda r: _parse_iso(r["verified_at"]), reverse=True)
    return rows

@bp.post("/update")
def post_update():
    from ..services.auth import require_admin
    require_admin()

    upd = request.get_json(force=True, silent=False)
    if not isinstance(upd, dict):
        return {"error":"invalid payload"}, 400

    cat = upd.get("category")
    if cat not in ALLOWED_CATEGORIES:
        return {"error":"invalid category"}, 400

    # minimal schema checks
    if not upd.get("id") or not upd.get("status") or not upd.get("verified_at"):
        return {"error":"id, status, verified_at required"}, 400

    try:
        ts = _parse_iso(upd["verified_at"])
    except Exception as e:
        return {"error": str(e)}, 400
    # Re-emit as Z format to keep consistent
    upd["verified_at"] = ts.astimezone(timezone.utc).isoformat().replace("+00:00","Z")

    updates_dir = _updates_dir()
    updates_dir.mkdir(parents=True, exist_ok=True)
    out = updates_dir / f"{cat}.jsonl"

    line = json.dumps(upd, ensure_ascii=False)
    with out.open("a", encoding="utf-8") as f:
        f.write(line + "\n")

    return jsonify({"ok": True})

@bp.get("/list")
def get_list():
    from ..services.auth import require_admin
    require_admin()

    cat = request.args.get("category", "")
    if cat not in ALLOWED_CATEGORIES:
        return {"error":"invalid category"}, 400

    path = _updates_dir() / f"{cat}.jsonl"
    rows = _latest_per_id(path)
    return jsonify(rows)

@bp.post("/bulk")
def post_bulk():
    from ..services.auth import require_admin
    require_admin()

    cat = request.args.get("category", "")
    if cat not in ALLOWED_CATEGORIES:
        return {"error":"invalid category"}, 400

    # Accept either: (a) text body, (b) uploaded file under 'file'
    incoming_bytes: bytes | None = None
    if "file" in request.files:
        incoming_bytes = request.files["file"].read()
    else:
        incoming_bytes = request.get_data(cache=False, as_text=False)

    if not incoming_bytes:
        return {"error":"no data provided"}, 400

    text = incoming_bytes.decode("utf-8", errors="ignore").strip()
    if not text:
        return {"error":"empty data"}, 400

    updates_dir = _updates_dir()
    updates_dir.mkdir(parents=True, exist_ok=True)
    out = updates_dir / f"{cat}.jsonl"

    # Heuristic: JSONL if starts with '{' or '[' on many lines, else CSV
    is_jsonl = text.lstrip().startswith("{") or "\n{" in text or "\n[" in text

    appended = 0
    with out.open("a", encoding="utf-8") as fout:
        if is_jsonl:
            # Accept either JSONL or a single JSON array
            if text.lstrip().startswith("["):
                try:
                    arr = json.loads(text)
                    if not isinstance(arr, list):
                        return {"error":"JSON payload must be array or JSONL"}, 400
                except Exception as e:
                    return {"error": f"invalid JSON array: {e}"}, 400
                for obj in arr:
                    if not isinstance(obj, dict):
                        continue
                    obj["category"] = cat
                    if not (obj.get("id") and obj.get("status") and obj.get("verified_at")):
                        continue
                    # normalize timestamp
                    try:
                        ts = _parse_iso(obj["verified_at"])
                        obj["verified_at"] = ts.astimezone(timezone.utc).isoformat().replace("+00:00","Z")
                    except Exception:
                        continue
                    fout.write(json.dumps(obj, ensure_ascii=False) + "\n")
                    appended += 1
            else:
                # Treat each line as JSON
                for line in text.splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    if isinstance(obj, dict):
                        obj["category"] = cat
                        if not (obj.get("id") and obj.get("status") and obj.get("verified_at")):
                            continue
                        try:
                            ts = _parse_iso(obj["verified_at"])
                            obj["verified_at"] = ts.astimezone(timezone.utc).isoformat().replace("+00:00","Z")
                        except Exception:
                            continue
                        fout.write(json.dumps(obj, ensure_ascii=False) + "\n")
                        appended += 1
        else:
            # CSV mode; expect headers at least: id,status,verified_at
            reader = csv.DictReader(io.StringIO(text))
            required = {"id","status","verified_at"}
            if not required.issubset(set(h.lower() for h in reader.fieldnames or [])):
                return {"error":"CSV must include headers: id,status,verified_at"}, 400
            for row in reader:
                obj = {
                    "id": row.get("id"),
                    "status": row.get("status"),
                    "verified_at": row.get("verified_at"),
                    "name": row.get("name") or None,
                    "notes": row.get("notes") or None,
                    "priority": row.get("priority") or None,
                    "source": row.get("source") or None,
                    "reporter": row.get("reporter") or None,
                    "tags": [t.strip() for t in (row.get("tags") or "").split("|") if t.strip()] or None,
                    "category": cat,
                }
                if not (obj["id"] and obj["status"] and obj["verified_at"]):
                    continue
                try:
                    ts = _parse_iso(obj["verified_at"])
                    obj["verified_at"] = ts.astimezone(timezone.utc).isoformat().replace("+00:00","Z")
                except Exception:
                    continue
                fout.write(json.dumps(obj, ensure_ascii=False) + "\n")
                appended += 1

    return jsonify({"ok": True, "appended": appended})