"""Typer CLI for SAFRAN integration."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import pandas as pd
import typer

from .config import WorkerSettings, parse_years
from .extract import load_many
from .fetch import SafranFetcher
from .indices import IndexSettings, compute_daily_indices
from .join import join_parcels_to_grid

app = typer.Typer(help="SAFRAN dataset integration utilities")


@app.command()
def pull(year: str = typer.Argument(..., help="Year or range (e.g. 2020..2021)")) -> None:
    settings = WorkerSettings()
    years = parse_years(year)
    fetcher = SafranFetcher(settings)
    results = fetcher.download_years(years)
    for result in results:
        status = "cached" if result.cached else "downloaded"
        typer.echo(f"{result.year}: {status} → {result.path}")


@app.command()
def build(
    farm_id: str = typer.Option(..., "--farm-id", help="Unique farm identifier"),
    parcel_file: Path = typer.Option(..., "--parcel-file", exists=True, file_okay=True),
    source_dir: Optional[Path] = typer.Option(None, help="Override data directory"),
) -> None:
    settings = WorkerSettings()
    if source_dir is not None:
        settings = WorkerSettings(data_dir=source_dir)
    paths = [settings.data_dir / f"safran_{year}.nc" for year in settings.year_list]
    frames = load_many(paths)
    mapping = join_parcels_to_grid(parcel_file, frames)
    merged = frames.merge(mapping, on="grid_id", how="inner")
    indices_settings = IndexSettings(
        base_temperature=settings.gdd_base,
        altitude_m=settings.altitude_m,
        soil_storage_mm=settings.soil_storage_mm,
        albedo=settings.albedo,
    )
    enriched = compute_daily_indices(merged, indices_settings)
    settings.ensure_directories()
    output_path = settings.build_dir / f"{farm_id}.parquet"
    enriched.to_parquet(output_path, index=False)
    typer.echo(f"build complete → {output_path}")


@app.command()
def export(
    farm_id: str = typer.Option(..., "--farm-id"),
    format: str = typer.Option("csv", "--format", case_sensitive=False),
) -> None:
    settings = WorkerSettings()
    input_path = settings.build_dir / f"{farm_id}.parquet"
    if not input_path.exists():
        raise typer.BadParameter(f"build artefact missing for farm {farm_id}")
    df = pd.read_parquet(input_path)
    settings.ensure_directories()
    if format.lower() == "csv":
        output_path = settings.export_dir / f"{farm_id}.csv"
        df.to_csv(output_path, index=False)
    elif format.lower() == "parquet":
        output_path = settings.export_dir / f"{farm_id}.parquet"
        df.to_parquet(output_path, index=False)
    else:
        raise typer.BadParameter("format must be csv or parquet")
    typer.echo(f"exported {len(df)} rows → {output_path}")


if __name__ == "__main__":  # pragma: no cover
    app()
