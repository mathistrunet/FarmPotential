import pandas as pd

from workers.safran.indices import IndexSettings, compute_daily_indices


def test_compute_indices_produces_expected_columns():
    data = pd.DataFrame(
        {
            "grid_id": ["g1", "g1"],
            "date": pd.to_datetime(["2020-06-01", "2020-06-02"]).date,
            "tmin": [10.0, 12.0],
            "tmax": [20.0, 25.0],
            "tmean": [15.0, 18.0],
            "rr": [5.0, 0.0],
            "rh": [70.0, 60.0],
            "swdown": [200.0, 210.0],
            "w10m": [2.0, 2.5],
            "nebulosity": [0.3, 0.2],
            "lon": [1.0, 1.0],
            "lat": [45.0, 45.0],
        }
    )
    result = compute_daily_indices(data, IndexSettings())
    assert {"gdd", "etp", "etr", "bilan_hydrique"}.issubset(result.columns)
    assert len(result) == 2
