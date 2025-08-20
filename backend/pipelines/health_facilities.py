from __future__ import annotations

import io
import json
import os
import re
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import geopandas as gpd

from ..services.http import make_session
from ..services.files import atomic_write_json, write_meta_sidecar

ZIP_URL = (
    "https://data.humdata.org/dataset/15d8f2ca-3528-4fb1-9cf5-a91ed3aba170/"
    "resource/fc5fd843-a8ee-4a3f-9474-861337893c84/download/opt-healthfacilities.zip"
)

RUN_TS = datetime.now(timezone.utc)
RUN_ISO = RUN_TS.isoformat()

# ----------------- helpers -----------------

def clean_str(v: Optional[str]) -> Optional[str]:
    if v is None: return None
    s = str(v).strip()
    return s if s else None

def scrub_date_string(s: Optional[str]) -> Optional[str]:
    # e.g. "May 2025 (ongoing)" -> "May 2025"
    if not s: return None
    s2 = re.sub(r"\s*\([^)]*\)\s*", "", str(s)).strip()
    return s2 or None

def parse_observed_ts(props: dict) -> Optional[int]:
    """
    Try to find a 'last updated' style field in the source and return epoch ms (UTC).
    If the shapefile has no such column, return None (timeline will use ingested_ts).
    """
    candidates = [
        "last_update", "Last_Update", "updated_at", "Updated_At",
        "lastedited", "LastEdited", "EditDate", "Date", "date"
    ]
    for k in candidates:
        if k in props and props[k]:
            val = scrub_date_string(props[k])
            if not val: continue
            try:
                # Let pandas parse many formats if present; fallback to stdlib
                from dateutil import parser as dtp
                d = dtp.parse(val)
                if d.tzinfo is None:
                    d = d.replace(tzinfo=timezone.utc)
                else:
                    d = d.astimezone(timezone.utc)
                return int(d.timestamp() * 1000)
            except Exception:
                continue
    return None

def iso_utc_from_ms(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)\
                   .isoformat()\
                   .replace("+00:00", "Z")

# ----------------- I/O -----------------

def fetch_health_facilities_zip(url: str = ZIP_URL) -> bytes:
    s = make_session()
    r = s.get(url)
    r.raise_for_status()
    return r.content

def extract_first_shp(zip_bytes: bytes, tmp_dir: str | Path) -> Path:
    tmp = Path(tmp_dir)
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        z.extractall(tmp)
    for root, _, files in os.walk(tmp):
        for f in files:
            if f.lower().endswith(".shp"):
                return Path(root) / f
    raise FileNotFoundError("No .shp file found in extracted ZIP")

# ----------------- transform -----------------

def simplify_properties(geojson: dict[str, Any]) -> dict[str, Any]:
    """
    Map source columns to the simplified schema your frontend expects,
    stamp kind + timeline fields, and (optionally) keep original props under __raw.
    """
    for feature in geojson.get("features", []):
        raw = feature.get("properties", {}) or {}

        # Simplified, bilingual-friendly fields (your UI already handles these)
        simplified = {
            "NAME":        raw.get("FacilityNa") or raw.get("FacilityName") or "Unknown",
            "TYPE":        raw.get("FacilityTy") or raw.get("Type") or "Unknown",
            "SERVICES":    raw.get("Service_Ty") or raw.get("Services") or "Unknown",
            "GOVERNORATE": raw.get("Governorat") or raw.get("Governorate") or raw.get("Gov") or "Unknown",
            "REGION":      raw.get("Region") or "Unknown",
            "SUPERVISING": raw.get("Supervisin") or raw.get("Supervising") or "Unknown",
            "URBANization": raw.get("Urbanizati") or raw.get("Urbanization") or "Unknown",
        }

        if "URBANization" in simplified:
            simplified["URBANIZATION"] = simplified.pop("URBANization")

        # Timeline stamps
        observed_ts = parse_observed_ts(raw)
        props = {
            **simplified,
            "kind": "health_center",
            "ingested_ts": int(RUN_TS.timestamp() * 1000),
            "ingested_at": RUN_ISO,
        }
        if observed_ts is not None:
            props["observed_ts"] = observed_ts
            props["observed_at"] = iso_utc_from_ms(observed_ts)

        props["__raw"] = raw

        feature["properties"] = props

    return geojson

# ----------------- pipeline -----------------

def build_health_facilities(output_path: str | Path, tmp_dir: str | Path) -> dict[str, Any]:
    zip_bytes = fetch_health_facilities_zip()
    shp_path = extract_first_shp(zip_bytes, tmp_dir)

    gdf = gpd.read_file(shp_path)
    if gdf.empty:
        raise ValueError("Shapefile loaded but contains no features")
    gdf = gdf.to_crs(epsg=4326)

    # geopandas -> GeoJSON dict (not a string)
    raw_geojson = json.loads(gdf.to_json())
    geojson = simplify_properties(raw_geojson)

    out = Path(output_path)
    changed, final_path = atomic_write_json(out, geojson)
    write_meta_sidecar(final_path, {
        "source": "health_facilities",
        "source_url": ZIP_URL,
        "records": len(geojson.get("features", [])),
        "ingested_at": RUN_ISO,
    })
    return {
        "data": geojson,
        "meta": {
            "source": "health_facilities",
            "path": final_path,
            "records": len(geojson.get("features", [])),
            "updated_at": RUN_ISO,
            "source_url": ZIP_URL,
            "changed": changed,
        },
    }

# CLI usage: python -m backend.pipelines.health_facilities
if __name__ == "__main__":  # pragma: no cover
    base = Path(__file__).resolve().parents[2]  # repo root
    out = base / "aid_dashboard_data" / "health_centers" / "opt_healthfacilities.json"
    tmp = base / "aid_dashboard_data" / "health_centers" / "tmp_shapefile"
    result = build_health_facilities(out, tmp)
    print(f"Saved {result['meta']['records']} features → {result['meta']['path']}")