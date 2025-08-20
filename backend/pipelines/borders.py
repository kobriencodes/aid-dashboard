from __future__ import annotations

from datetime import datetime, timezone
from dateutil import parser as dtp
import pandas as pd
import csv
import json
import re
from pathlib import Path
from typing import Any, Dict, Optional

from ..services.files import atomic_write_json, write_meta_sidecar

RUN_TS = datetime.now(timezone.utc)
RUN_ISO = RUN_TS.isoformat()

# --- Helpers ---------------------------------------------------------------

def clean_str(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None

def scrub_date_string(s: Optional[str]) -> Optional[str]:
    """Remove parenthetical notes etc. e.g. 'May 2025 (ongoing)' -> 'May 2025'"""
    if not s:
        return None
    s2 = re.sub(r"\s*\([^)]*\)\s*", "", str(s)).strip()
    return s2 or None

def to_ts(val) -> Optional[int]:
    """Parse a wide range of inputs to epoch ms (UTC). Returns None on failure."""
    if pd.isna(val) or val is None:
        return None
    s = scrub_date_string(str(val))
    if not s:
        return None
    try:
        d = dtp.parse(s)
        # ensure timezone-aware in UTC
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        else:
            d = d.astimezone(timezone.utc)
        return int(d.timestamp() * 1000)
    except Exception:
        return None

def get_ci(d: Dict[str, Any], *names: str) -> Optional[str]:
    """Case-insensitive + trimmed lookup for CSV headers."""
    if d is None:
        return None
    lower = {str(k).strip().lower(): v for k, v in d.items()}
    for n in names:
        v = lower.get(str(n).strip().lower())
        if v is not None and str(v).strip() != "":
            return str(v)
    return None

def to_float(name: str, val: Any) -> float:
    try:
        return float(val)
    except Exception as e:
        raise ValueError(f"Row has invalid {name!r}: {val!r}") from e

def compact(d: Dict[str, Any]) -> Dict[str, Any]:
    """Drop None/empty-string fields."""
    return {k: v for k, v in d.items() if v not in (None, "", [])}

# --- Main ------------------------------------------------------------------

def csv_to_geojson(csv_path: str | Path, geojson_out: str | Path) -> dict[str, Any]:
    csv_p = Path(csv_path)
    out_p = Path(geojson_out)
    features: list[dict] = []

    with csv_p.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Case-insensitive header access
            name        = clean_str(get_ci(row, "Name"))
            typ         = clean_str(get_ci(row, "Type"))
            status      = clean_str(get_ci(row, "Status"))
            country     = clean_str(get_ci(row, "Country"))
            last_update = clean_str(get_ci(row, "Last_Update", "last_update"))
            source      = clean_str(get_ci(row, "Source"))

            lon_raw = get_ci(row, "Longitude")
            lat_raw = get_ci(row, "Latitude")
            if lon_raw is None or lat_raw is None:
                # Skip bad rows rather than crashing
                # (or, alternatively, raise with a clearer message)
                continue

            lon = to_float("Longitude", lon_raw)
            lat = to_float("Latitude",  lat_raw)

            observed_ts = to_ts(last_update)

            props = compact({
                "kind": "border_crossing",
                "name": name,
                "type": typ,
                "status": status,
                "country": country,
                "last_update": last_update,
                "source": source,

                # normalized time fields (UTC):
                "observed_ts": observed_ts,
                "observed_at": (
                    datetime.fromtimestamp(observed_ts / 1000, tz=timezone.utc)
                            .isoformat()
                            .replace("+00:00", "Z")
                    if observed_ts is not None else None
                ),
                "ingested_ts": int(RUN_TS.timestamp() * 1000),
                "ingested_at": RUN_ISO,
            })

            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": props,
            })

    geojson = {"type": "FeatureCollection", "features": features}
    changed, final_path = atomic_write_json(out_p, geojson)
    write_meta_sidecar(final_path, {
        "source": "border_crossings_csv",
        "csv": str(csv_p.resolve()),
        "records": len(features),
    })
    return {
        "data": geojson,
        "meta": {
            "source": "border_crossings_csv",
            "csv": str(csv_p.resolve()),
            "path": final_path,
            "records": len(features),
            "changed": changed,
        },
    }

# CLI usage: python -m backend.pipelines.borders
if __name__ == "__main__":  # pragma: no cover
    base = Path(__file__).resolve().parents[2]
    csv_in = base / "aid_dashboard_data" / "borders" / "border_crossings_complete.csv"
    out = base / "aid_dashboard_data" / "borders" / "border_crossings.geojson"
    res = csv_to_geojson(csv_in, out)
    print(f"Saved {res['meta']['records']} features → {res['meta']['path']}")