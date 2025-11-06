from pathlib import Path
import json
import pandas as pd

from workers.safran.join import join_parcels_to_grid


def test_join_parcels(tmp_path: Path):
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
    path = tmp_path / "parcels.geojson"
    path.write_text(json.dumps(geojson))
    weather = pd.DataFrame(
        {
            "grid_id": ["g1", "g2"],
            "lon": [1.05, 2.0],
            "lat": [45.05, 46.0],
        }
    )
    mapping = join_parcels_to_grid(path, weather)
    assert mapping.loc[0, "grid_id"] == "g1"
    assert mapping.loc[0, "parcel_id"] == "parcel-1"
