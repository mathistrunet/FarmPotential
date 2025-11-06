"""Extract daily weather information from SAFRAN NetCDF files."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
import datetime as dt

import numpy as np
import pandas as pd
import xarray as xr


@dataclass
class DailyWeatherRecord:
    """Representation of a single day for one SAFRAN grid cell."""

    grid_id: str
    date: dt.date
    tmin: float
    tmax: float
    tmean: float
    rr: float
    rh: float
    swdown: float
    w10m: float
    nebulosity: float
    lon: float
    lat: float


REQUIRED_VARIABLES = {
    "T2m": "air temperature at 2 m (K)",
    "RR": "precipitation (kg m-2)",
    "RH": "relative humidity (%)",
    "SWdown": "downwelling shortwave radiation (W m-2)",
    "Wind": "wind speed at 10 m (m s-1)",
    "Nebulosity": "cloud cover (0-1)",
}


def _normalise_temperature(values: xr.DataArray) -> xr.DataArray:
    # SAFRAN temperatures are provided in Kelvin; convert to Celsius.
    return values - 273.15


def load_daily_weather(path: Path) -> pd.DataFrame:
    """Load the NetCDF file, aggregate to daily scale and return a DataFrame."""

    ds = xr.open_dataset(path, engine="h5netcdf")
    missing = [var for var in REQUIRED_VARIABLES if var not in ds.variables]
    if missing:
        raise KeyError(f"Variables missing from dataset: {', '.join(missing)}")

    frame = ds[list(REQUIRED_VARIABLES)].to_dataframe().reset_index()
    frame["temp"] = _normalise_temperature(frame["T2m"]).astype("float32")
    frame["date"] = pd.to_datetime(frame["time"]).dt.date
    frame.drop(columns=["time", "T2m"], inplace=True)

    grouped = frame.groupby(["lat", "lon", "date"])
    daily = grouped.agg(
        tmin=("temp", "min"),
        tmax=("temp", "max"),
        tmean=("temp", "mean"),
        rr=("RR", "sum"),
        rh=("RH", "mean"),
        swdown=("SWdown", "mean"),
        w10m=("Wind", "mean"),
        nebulosity=("Nebulosity", "mean"),
    )
    daily = daily.reset_index()

    # The dataset grid is uniform: create a stable identifier.
    daily["grid_id"] = (
        daily["lat"].round(3).astype(str) + "_" + daily["lon"].round(3).astype(str)
    )
    columns = [
        "grid_id",
        "date",
        "tmin",
        "tmax",
        "tmean",
        "rr",
        "rh",
        "swdown",
        "w10m",
        "nebulosity",
        "lon",
        "lat",
    ]
    return daily[columns]


def load_many(paths: Iterable[Path]) -> pd.DataFrame:
    frames = [load_daily_weather(path) for path in paths]
    return pd.concat(frames, ignore_index=True)


__all__ = ["load_daily_weather", "load_many", "DailyWeatherRecord"]
