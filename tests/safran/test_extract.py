from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

from workers.safran.extract import load_daily_weather


def _create_dataset(tmp_path: Path) -> Path:
    time = pd.date_range("2020-01-01", periods=48, freq="H")
    lat = [45.0]
    lon = [1.0]
    data = xr.Dataset(
        {
            "T2m": (("time", "lat", "lon"), np.full((48, 1, 1), 273.15 + 15.0)),
            "RR": (("time", "lat", "lon"), np.ones((48, 1, 1))),
            "RH": (("time", "lat", "lon"), np.full((48, 1, 1), 75.0)),
            "SWdown": (("time", "lat", "lon"), np.full((48, 1, 1), 150.0)),
            "Wind": (("time", "lat", "lon"), np.full((48, 1, 1), 2.0)),
            "Nebulosity": (("time", "lat", "lon"), np.full((48, 1, 1), 0.4)),
        },
        coords={"time": time, "lat": lat, "lon": lon},
    )
    path = tmp_path / "safran_2020.nc"
    data.to_netcdf(path, engine="h5netcdf")
    return path


def test_load_daily_weather(tmp_path: Path):
    path = _create_dataset(tmp_path)
    daily = load_daily_weather(path)
    assert set(["tmin", "tmax", "tmean", "rr", "rh", "swdown", "w10m", "nebulosity"]).issubset(
        daily.columns
    )
    assert len(daily) == 2
    assert daily.iloc[0]["rr"] == 24
