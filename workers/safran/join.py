"""Spatial join utilities for parcel ↔ SAFRAN grid association."""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Dict, Iterable, Tuple

import pandas as pd


def _load_geojson(path: Path) -> Dict:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _geometry_centroid(geometry: Dict) -> Tuple[float, float]:
    geom_type = geometry.get("type")
    if geom_type == "Point":
        lon, lat = geometry["coordinates"]
        return float(lon), float(lat)
    if geom_type == "Polygon":
        coords = geometry["coordinates"][0]
    elif geom_type == "MultiPolygon":
        coords = geometry["coordinates"][0][0]
    else:
        raise ValueError(f"Unsupported geometry type: {geom_type}")
    xs = [pt[0] for pt in coords]
    ys = [pt[1] for pt in coords]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def _haversine(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6371.0
    lon1_rad, lat1_rad = math.radians(lon1), math.radians(lat1)
    lon2_rad, lat2_rad = math.radians(lon2), math.radians(lat2)
    dlon = lon2_rad - lon1_rad
    dlat = lat2_rad - lat1_rad
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def join_parcels_to_grid(parcels_path: Path, weather: pd.DataFrame) -> pd.DataFrame:
    data = _load_geojson(parcels_path)
    features = data["features"]
    centroids = [
        {
            "parcel_id": feature.get("id") or feature["properties"].get("id", str(index)),
            "lon": _geometry_centroid(feature["geometry"])[0],
            "lat": _geometry_centroid(feature["geometry"])[1],
        }
        for index, feature in enumerate(features)
    ]
    parcels_df = pd.DataFrame(centroids)
    grid = weather[["grid_id", "lon", "lat"]].drop_duplicates().reset_index(drop=True)
    assignments = []
    for _, parcel in parcels_df.iterrows():
        distances = (
            grid.apply(
                lambda row: _haversine(
                    parcel["lon"], parcel["lat"], row["lon"], row["lat"]
                ),
                axis=1,
            )
        )
        idx = distances.idxmin()
        assignments.append({
            "parcel_id": parcel["parcel_id"],
            "grid_id": grid.loc[idx, "grid_id"],
            "distance_km": float(distances.loc[idx]),
        })
    return pd.DataFrame(assignments)


__all__ = ["join_parcels_to_grid"]
