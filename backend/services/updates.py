from __future__ import annotations
import json, os
from pathlib import Path
from typing import Dict, Any, Iterable
from datetime import datetime

def _parse_dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z","+00:00"))

def load_updates(path: str | Path) -> Dict[str, Dict[str, Any]]:
    """
    Read JSONL and keep the newest update per facility id.
    Returns {id: update_dict}
    """
    path = Path(path)
    latest: Dict[str, Dict[str, Any]] = {}
    if not path.exists(): return latest
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line=line.strip()
            if not line: continue
            upd = json.loads(line)
            fid = upd.get("id")
            if not fid: continue
            prev = latest.get(fid)
            if (not prev) or (_parse_dt(upd.get("verified_at","1970-01-01")) > _parse_dt(prev.get("verified_at","1970-01-01"))):
                latest[fid] = upd
    return latest

def apply_updates(features: Iterable[dict], updates_by_id: Dict[str, Dict[str, Any]], id_field: str="id") -> list[dict]:
    """
    For each baseline feature, overlay latest status if an update exists.
    Assumes each feature has properties[id_field] (add it if missing).
    """
    out=[]
    for ft in features:
        props = ft.get("properties", {})
        fid = props.get(id_field)
        if fid and fid in updates_by_id:
            u = updates_by_id[fid]
            props = {**props,
                     "status": u.get("status","unknown"),
                     "status_verified_at": u.get("verified_at"),
                     "status_source": u.get("source"),
                     "status_confidence": u.get("confidence")}
            ft = {**ft, "properties": props}
        out.append(ft)
    return out