import os
import json
import pytest
import geopandas as gpd

HEALTH_DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "aid_dashboard_data", "health_centers", "opt_healthfacilities.json")
BORDER_DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "aid_dashboard_data", "borders", "border_crossings.geojson")

def test_data_file_exists():
    assert os.path.exists(HEALTH_DATA_FILE), "static_data.json is missing!"

def test_data_file_not_empty():
    with open(HEALTH_DATA_FILE) as f:
        data = json.load(f)
    assert len(data.get("features", [])) > 0, "GeoJSON has no features!"

def test_geometries_valid():
    gdf = gpd.read_file(HEALTH_DATA_FILE)
    assert not gdf.empty, "GeoDataFrame is empty!"
    assert gdf.geometry.notnull().all(), "Some geometries are null!"
    assert gdf.is_valid.all(), "Some geometries are invalid!"

def test_border_crossings_file_exists():
    assert os.path.exists(BORDER_DATA_FILE), "Border crossings GeoJSON file is missing!"


def test_border_crossings_geometry_valid():
    with open(BORDER_DATA_FILE) as f:
        data = json.load(f)
    for f in data["features"]:
        assert f["geometry"]["type"] == "Point", "Expected Point geometry for border crossings"
        assert len(f["geometry"]["coordinates"]) == 2, "Invalid coordinates in border crossing"