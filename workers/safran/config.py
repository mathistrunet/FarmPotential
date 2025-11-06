"""Configuration helpers for the SAFRAN worker."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, List
import os


@dataclass
class WorkerSettings:
    """Settings controlling how the SAFRAN worker operates."""

    data_dir: Path = field(
        default_factory=lambda: Path(os.getenv("SAFRAN_DATA_DIR", "./data/safran")).resolve()
    )
    source_url: str = field(default_factory=lambda: os.getenv("SAFRAN_SOURCE_URL", ""))
    years: str = field(default_factory=lambda: os.getenv("SAFRAN_YEARS", "2010-2025"))
    cache_dir: Path = field(
        default_factory=lambda: Path(os.getenv("SAFRAN_DATA_DIR", "./data/safran"))
        .resolve()
        .joinpath("cache")
    )
    build_dir: Path = field(
        default_factory=lambda: Path(os.getenv("SAFRAN_DATA_DIR", "./data/safran"))
        .resolve()
        .joinpath("build")
    )
    export_dir: Path = field(
        default_factory=lambda: Path(os.getenv("SAFRAN_DATA_DIR", "./data/safran"))
        .resolve()
        .joinpath("out")
    )
    gdd_base: float = field(default_factory=lambda: float(os.getenv("SAFRAN_GDD_BASE", "10")))
    altitude_m: float = field(default_factory=lambda: float(os.getenv("SAFRAN_ALTITUDE_M", "200")))
    soil_storage_mm: float = field(
        default_factory=lambda: float(os.getenv("SAFRAN_SOIL_STORAGE_MM", "150"))
    )
    albedo: float = field(default_factory=lambda: float(os.getenv("SAFRAN_ALBEDO", "0.23")))

    def __post_init__(self) -> None:
        base = self.data_dir
        object.__setattr__(self, "cache_dir", base / "cache")
        object.__setattr__(self, "build_dir", base / "build")
        object.__setattr__(self, "export_dir", base / "out")

    def ensure_directories(self) -> None:
        """Create every directory used by the worker if it does not exist."""

        for path in {self.data_dir, self.cache_dir, self.build_dir, self.export_dir}:
            path.mkdir(parents=True, exist_ok=True)

    @property
    def year_list(self) -> List[int]:
        """Materialise the configured year expression into individual years."""

        return list(parse_years(self.years))


def parse_years(expr: str) -> Iterable[int]:
    """Parse the year expression used by the CLI."""

    expr = expr.strip()
    if not expr:
        return []

    chunks = [p.strip() for p in expr.split(",") if p.strip()]
    years: List[int] = []
    for chunk in chunks:
        if ".." in chunk:
            start_s, end_s = chunk.split("..", 1)
        elif "-" in chunk:
            start_s, end_s = chunk.split("-", 1)
        else:
            years.append(int(chunk))
            continue
        start, end = int(start_s), int(end_s)
        if start > end:
            start, end = end, start
        years.extend(range(start, end + 1))
    return years


__all__ = ["WorkerSettings", "parse_years"]
