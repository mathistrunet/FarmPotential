"""Download utilities for the SAFRAN worker."""
from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Iterable, Optional
import json
import shutil
import time
import urllib.request

from .config import WorkerSettings


_METADATA_SUFFIX = ".metadata.json"


@dataclass
class FetchResult:
    """Outcome of a fetch operation."""

    year: int
    path: Path
    cached: bool


class SafranFetcher:
    """Download SAFRAN NetCDF files and maintain a local cache."""

    def __init__(self, settings: Optional[WorkerSettings] = None) -> None:
        self.settings = settings or WorkerSettings()
        self.settings.ensure_directories()

    def _destination_for_year(self, year: int) -> Path:
        return self.settings.data_dir / f"safran_{year}.nc"

    def _metadata_path(self, dest: Path) -> Path:
        return dest.with_suffix(dest.suffix + _METADATA_SUFFIX)

    def download_years(self, years: Iterable[int]) -> list[FetchResult]:
        results: list[FetchResult] = []
        for year in years:
            results.append(self.download_year(year))
        return results

    def download_year(self, year: int) -> FetchResult:
        dest = self._destination_for_year(year)
        metadata_path = self._metadata_path(dest)
        if dest.exists() and metadata_path.exists():
            return FetchResult(year=year, path=dest, cached=True)

        source = self._resolve_source(year)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if source.is_file():
            shutil.copy2(source, dest)
        else:
            self._stream_download(source, dest)

        metadata = {
            "year": year,
            "fetched_at": time.time(),
            "size": dest.stat().st_size,
            "sha256": self._hash_file(dest),
        }
        metadata_path.write_text(json.dumps(metadata, indent=2))
        return FetchResult(year=year, path=dest, cached=False)

    def _resolve_source(self, year: int) -> Path:
        base = self.settings.source_url
        if not base:
            raise ValueError(
                "SAFRAN_SOURCE_URL must point to either a directory or an HTTP endpoint"
            )
        if base.startswith("http://") or base.startswith("https://"):
            return Path(f"{base.rstrip('/')}/safran_{year}.nc")
        path = Path(base)
        if path.is_dir():
            candidate = path / f"safran_{year}.nc"
            if not candidate.exists():
                raise FileNotFoundError(candidate)
            return candidate
        if path.is_file():
            return path
        raise FileNotFoundError(base)

    def _stream_download(self, source: Path, dest: Path) -> None:
        url = str(source)
        with urllib.request.urlopen(url) as response, open(dest, "wb") as output:  # type: ignore[arg-type]
            shutil.copyfileobj(response, output)

    def _hash_file(self, path: Path) -> str:
        hasher = sha256()
        with open(path, "rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                hasher.update(chunk)
        return hasher.hexdigest()


__all__ = ["SafranFetcher", "FetchResult"]
