# backend/models/schemas.py
from __future__ import annotations
from typing import List, Literal, Optional, Dict, Any
from pydantic import BaseModel, Field, model_validator, ConfigDict


# ----------------------------
# GeoJSON core shapes
# ----------------------------
class PointGeometry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["Point"]
    coordinates: List[float]  # [lon, lat]

    @model_validator(mode="after")
    def _validate_coords(self):
        if len(self.coordinates) != 2:
            raise ValueError("Point coordinates must be [lon, lat]")
        return self


class LineStringGeometry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["LineString"]
    coordinates: List[List[float]]  # [[lon, lat], ...]

    @model_validator(mode="after")
    def _validate_coords(self):
        if not self.coordinates or any(len(p) != 2 for p in self.coordinates):
            raise ValueError("LineString coordinates must be [[lon, lat], ...]")
        return self


# Generic-ish Feature (keeps extra tags from OSM etc.)
class Feature(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["Feature"] = "Feature"
    geometry: Dict[str, Any]
    properties: Dict[str, Any]


class FeatureCollection(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: List[Feature]


# ----------------------------
# Domain-specific properties
# ----------------------------
class HealthFacilityProps(BaseModel):
    model_config = ConfigDict(extra="ignore")
    NAME: str = Field(default="Unknown")
    TYPE: str = Field(default="Unknown")
    SERVICES: str = Field(default="Unknown")
    GOVERNORATE: str = Field(default="Unknown")
    REGION: str = Field(default="Unknown")
    SUPERVISING: str = Field(default="Unknown")
    URBANIZATION: str = Field(default="Unknown")


class BorderCrossingProps(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    last_update: Optional[str] = None
    source: Optional[str] = None


class HealthFacilityFeature(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["Feature"] = "Feature"
    geometry: PointGeometry  # most facilities are point features
    properties: HealthFacilityProps


class CheckpointFeature(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["Feature"] = "Feature"
    geometry: PointGeometry
    properties: Dict[str, Any]  # OSM node attributes


class RoadFeature(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["Feature"] = "Feature"
    geometry: LineStringGeometry
    properties: Dict[str, Any]  # OSM way attributes


class HealthFacilityCollection(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: List[HealthFacilityFeature]


class CheckpointCollection(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: List[CheckpointFeature]


class RoadCollection(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: List[RoadFeature]


# ----------------------------
# Optional response envelope
# ----------------------------
class Meta(BaseModel):
    model_config = ConfigDict(extra="ignore")
    source: Optional[str] = None
    path: Optional[str] = None
    records: Optional[int] = None
    updated_at: Optional[str] = None


class Envelope(BaseModel):
    model_config = ConfigDict(extra="ignore")
    data: Dict[str, Any]
    meta: Meta