from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple

from ..services.http import make_session
from ..services.files import atomic_write_json, write_meta_sidecar

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Default Gaza bbox (min_lat, min_lon, max_lat, max_lon)
DEFAULT_BBOX: tuple[float, float, float, float] = (31.2, 34.2, 32.6, 35.6)

# ingest run stamps
RUN_TS = datetime.now(timezone.utc)
RUN_ISO = RUN_TS.isoformat()

# ---------- Overpass query ----------

def build_query(min_lat: float, min_lon: float, max_lat: float, max_lon: float) -> str:
    # Include 'meta' so each element carries 'timestamp', 'version', 'changeset', 'user', 'uid'
    return f"""
    [out:json][timeout:60];
    (
      way["highway"~"motorway|trunk|primary|secondary"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["barrier"="checkpoint"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["military"="checkpoint"]({min_lat},{min_lon},{max_lat},{max_lon});
    );
    out geom meta;
    """

# ---------- tiling ----------

def split_bbox(
    bbox: tuple[float, float, float, float], n: int
) -> Iterable[tuple[float, float, float, float]]:
    min_lat, min_lon, max_lat, max_lon = bbox
    lat_step = (max_lat - min_lat) / n
    lon_step = (max_lon - min_lon) / n
    for i in range(n):
        for j in range(n):
            yield (
                min_lat + i * lat_step,
                min_lon + j * lon_step,
                min_lat + (i + 1) * lat_step,
                min_lon + (j + 1) * lon_step,
            )

# ---------- small helpers ----------

def iso_utc_from_ms(ms: int) -> str:
    return (
        datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )

def parse_osm_timestamp(s: str | None) -> tuple[int | None, str | None]:
    """OSM returns ISO8601; normalize to epoch ms + ISO Z."""
    if not s:
        return None, None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        dt = dt.astimezone(timezone.utc)
        ms = int(dt.timestamp() * 1000)
        return ms, iso_utc_from_ms(ms)
    except Exception:
        return None, None

def classify_kind(el: Dict[str, Any]) -> str | None:
    t = el.get("type")
    tags = el.get("tags", {}) or {}
    if t == "node":
        if tags.get("barrier") == "checkpoint" or tags.get("military") == "checkpoint":
            return "checkpoint"
    if t == "way":
        if "highway" in tags:
            return "road"
    return None

def to_feature(el: Dict[str, Any]) -> Dict[str, Any] | None:
    """Convert a single Overpass element to a Feature with normalized props."""
    kind = classify_kind(el)
    if kind is None:
        return None  # ignore other element types

    # geometry
    if el.get("type") == "node":
        geom = {"type": "Point", "coordinates": [el["lon"], el["lat"]]}
    elif el.get("type") == "way" and "geometry" in el:
        geom = {
            "type": "LineString",
            "coordinates": [[p["lon"], p["lat"]] for p in el["geometry"]],
        }
    else:
        return None

    # timestamps (from Overpass 'meta')
    obs_ms, obs_iso = parse_osm_timestamp(el.get("timestamp"))

    tags = el.get("tags", {}) or {}

    # road convenience fields
    road = None
    if kind == "road":
        # normalize to simple scalar fields when present
        road = {
            "highway": tags.get("highway"),
            "oneway": (tags.get("oneway") or "").lower() or None,
            "lanes": tags.get("lanes"),
            "maxspeed": tags.get("maxspeed"),
        }

    country = tags.get("is_in") or tags.get("addr:country")

    props: Dict[str, Any] = {
        "kind": kind,
        "id": el.get("id"),
        "osm_type": el.get("type"),
        "tags": tags,  # keep full tag bag for completeness
        "user": el.get("user"),
        "uid": el.get("uid"),
        "version": el.get("version"),
        "changeset": el.get("changeset"),

        # time fields (UTC):
        "observed_ts": obs_ms,
        "observed_at": obs_iso,
        "ingested_ts": int(RUN_TS.timestamp() * 1000),
        "ingested_at": RUN_ISO,
    }

    if country:
        props["is_in"] = country

    if kind == "road":
        # flatten commonly used road fields at top level too
        if road:
            props.update({k: v for k, v in road.items() if v is not None})

    feature = {
        "type": "Feature",
        "geometry": geom,
        "properties": props,
    }
    return feature

# ---------- main fetcher ----------

def fetch_overpass_tiles(
    output_path: str | Path,
    bbox: tuple[float, float, float, float] = DEFAULT_BBOX,
    grid_splits: int = 7,
    pause_sec: float = 5.0,
) -> dict[str, Any]:
    session = make_session()
    seen: set[Tuple[str, int]] = set()     # (type, id) to dedupe across tiles
    features: list[dict] = []
    skipped_ways: list[int] = []

    for idx, tile in enumerate(split_bbox(bbox, grid_splits), start=1):
        query = build_query(*tile)
        resp = session.post(OVERPASS_URL, data={"data": query})
        if resp.status_code != 200:
            # quick retry after short backoff
            time.sleep(30)
            resp = session.post(OVERPASS_URL, data={"data": query})

        data = resp.json()
        if "remark" in data or "error" in data:
            # tile failed; continue with others
            time.sleep(pause_sec)
            continue

        for el in data.get("elements", []):
            key = (el.get("type"), el.get("id"))
            if key in seen:
                continue
            ft = to_feature(el)
            if ft:
                features.append(ft)
                seen.add(key)
            else:
                # remember ways couldn't convert due to missing geometry
                if el.get("type") == "way" and "geometry" not in el:
                    skipped_ways.append(el.get("id"))

        time.sleep(pause_sec)

    geojson: dict[str, Any] = {"type": "FeatureCollection", "features": features}

    out = Path(output_path)
    changed, final_path = atomic_write_json(out, geojson)
    write_meta_sidecar(
        final_path,
        {
            "source": "overpass_gaza_roads_checkpoints",
            "source_url": OVERPASS_URL,
            "records": len(geojson["features"]),
            "skipped_ways": skipped_ways,
            "bbox": bbox,
            "grid_splits": grid_splits,
            "ingested_at": RUN_ISO,
        },
    )
    return {
        "data": geojson,
        "meta": {
            "source": "overpass_gaza_roads_checkpoints",
            "path": final_path,
            "records": len(geojson["features"]),
            "updated_at": RUN_ISO,
            "source_url": OVERPASS_URL,
            "changed": changed,
            "skipped_ways": skipped_ways,
        },
    }

# CLI usage: python -m backend.pipelines.checkpoints
if __name__ == "__main__":  # pragma: no cover
    base = Path(__file__).resolve().parents[2]
    out = base / "aid_dashboard_data" / "checkpoints" / "gaza_roads_checkpoints.geojson"
    result = fetch_overpass_tiles(out)
    print(f"Saved {result['meta']['records']} features → {result['meta']['path']}")
    if result["meta"]["skipped_ways"]:
        print(f"Skipped {len(result['meta']['skipped_ways'])} ways without geometry")