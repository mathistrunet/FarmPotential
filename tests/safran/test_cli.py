from pathlib import Path
import json
import os

import numpy as np
import pandas as pd
import typer.testing
import xarray as xr

from workers.safran.cli import app

runner = typer.testing.CliRunner()


def _create_dataset(base: Path, year: int) -> Path:
    time = pd.date_range(f"{year}-01-01", periods=24, freq="H")
    lat = [45.0]
    lon = [1.0]
    data = xr.Dataset(
        {
            "T2m": (("time", "lat", "lon"), np.full((24, 1, 1), 273.15 + 18.0)),
            "RR": (("time", "lat", "lon"), np.ones((24, 1, 1))),
            "RH": (("time", "lat", "lon"), np.full((24, 1, 1), 70.0)),
            "SWdown": (("time", "lat", "lon"), np.full((24, 1, 1), 180.0)),
            "Wind": (("time", "lat", "lon"), np.full((24, 1, 1), 3.0)),
            "Nebulosity": (("time", "lat", "lon"), np.full((24, 1, 1), 0.5)),
        },
        coords={"time": time, "lat": lat, "lon": lon},
    )
    path = base / f"safran_{year}.nc"
    data.to_netcdf(path, engine="h5netcdf")
    return path


def test_build_and_export(tmp_path: Path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    for year in (2020, 2021):
        _create_dataset(data_dir, year)

    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": "parcel-1",
                "properties": {},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [1.0, 45.0],
                            [1.1, 45.0],
                            [1.1, 45.1],
                            [1.0, 45.1],
                            [1.0, 45.0],
                        ]
                    ],
                },
            }
        ],
    }
    parcel_file = tmp_path / "parcels.geojson"
    parcel_file.write_text(json.dumps(geojson))

    env = {
        "SAFRAN_DATA_DIR": str(tmp_path / "worker"),
        "SAFRAN_SOURCE_URL": str(data_dir),
        "SAFRAN_YEARS": "2020..2021",
    }

    result = runner.invoke(app, ["pull", "2020..2021"], env=env)
    assert result.exit_code == 0

    result = runner.invoke(
        app,
        [
            "build",
            "--farm-id",
            "demo",
            "--parcel-file",
            str(parcel_file),
        ],
        env=env,
    )
    assert result.exit_code == 0

    result = runner.invoke(
        app,
        [
            "export",
            "--farm-id",
            "demo",
            "--format",
            "csv",
        ],
        env=env,
    )
    assert result.exit_code == 0
    export_path = Path(env["SAFRAN_DATA_DIR"]) / "out" / "demo.csv"
    assert export_path.exists()
