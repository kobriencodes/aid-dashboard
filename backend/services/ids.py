from __future__ import annotations
import hashlib
from typing import Iterable, Literal

def _norm(s: str) -> str:
    return " ".join(s.lower().strip().split())

def _short_hash(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:10]

def ensure_ids(features: Iterable[dict], prefix: Literal["border","checkpoint","road"]) -> list[dict]:
    out = []
    for ft in features:
        props = ft.setdefault("properties", {})
        fid = props.get("id") or props.get("@id") or props.get("osm_id")
        if not fid:
            geom = ft.get("geometry", {})
            t = geom.get("type")
            if t == "Point":
                lon, lat = geom.get("coordinates", [None, None])
                name = props.get("name") or props.get("NAME") or ""
                key = f"{round(lon or 0, 5)}|{round(lat or 0, 5)}|{_norm(str(name))}"
            else:  # LineString (roads)
                coords = geom.get("coordinates", [])
                if coords:
                    lon, lat = coords[0]
                else:
                    lon, lat = 0, 0
                ref = props.get("ref") or props.get("name") or ""
                key = f"{round(lon,5)}|{round(lat,5)}|{_norm(str(ref))}"
            fid = f"{prefix}:{_short_hash(key)}"
        props["id"] = str(fid)
        out.append(ft)
    return out