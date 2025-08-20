from __future__ import annotations
import hashlib, json, os, tempfile, subprocess
from pathlib import Path
from datetime import datetime
from typing import Any, Tuple

def _sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def _git_sha() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        return None

def atomic_write_json(target: str | Path, payload: Any) -> Tuple[bool, str]:
    """
    Write JSON atomically: serialize -> tmp file -> rename.
    Returns (changed, final_path).
    """
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    new_bytes = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    new_hash = _sha256_bytes(new_bytes)

    # If target exists and content is identical, skip write
    if target.exists():
        old_bytes = target.read_bytes()
        if _sha256_bytes(old_bytes) == new_hash:
            return False, str(target.resolve())

    # Atomic swap
    with tempfile.NamedTemporaryFile("wb", delete=False, dir=str(target.parent)) as tmp:
        tmp.write(new_bytes)
        tmp_path = Path(tmp.name)
    tmp_path.replace(target)
    return True, str(target.resolve())

def write_meta_sidecar(data_path: str | Path, meta: dict) -> str:
    """
    Write a sidecar meta json next to data_path: <basename>.meta.json
    """
    data_path = Path(data_path)
    meta_path = data_path.with_suffix(data_path.suffix + ".meta.json")
    meta_out = {
        "updated_at": datetime.utcnow().isoformat() + "Z",
        "build_sha": _git_sha(),
        **meta,
        "data_file": data_path.name,
        "data_size": data_path.stat().st_size if data_path.exists() else None,
    }
    changed, _ = atomic_write_json(meta_path, meta_out)
    return str(meta_path.resolve())