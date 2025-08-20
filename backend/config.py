from __future__ import annotations

import os
from dataclasses import dataclass

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


@dataclass
class Config:
    ADMIN_API_TOKEN = os.getenv("ADMIN_API_TOKEN", "changeme")
    FLASK_ENV: str = os.getenv("FLASK_ENV", "development")
    DEBUG: bool = os.getenv("FLASK_DEBUG", "0") == "1"

    CORS_ALLOWED_ORIGINS: str = os.getenv("CORS_ALLOWED_ORIGINS", "*")
    JSON_SORT_KEYS: bool = False

    # Data paths
    HEALTH_FACILITIES_PATH: str = os.path.join(
        BASE_DIR, "aid_dashboard_data", "health_centers", "opt_healthfacilities.json"
    )
    COMBINED_CHECKPOINTS_PATH: str = os.path.join(
        BASE_DIR, "aid_dashboard_data", "checkpoints", "gaza_roads_checkpoints.geojson"
    )
    BORDER_CROSSINGS_PATH: str = os.path.join(
        BASE_DIR, "aid_dashboard_data", "borders", "border_crossings.geojson"
    )

    # Caching
    CACHE_TYPE: str = os.getenv("CACHE_TYPE", "SimpleCache")
    CACHE_DEFAULT_TIMEOUT: int = int(os.getenv("CACHE_DEFAULT_TIMEOUT", "300"))
