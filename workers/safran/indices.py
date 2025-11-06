"""Computation of agro-climatic indices for SAFRAN weather series."""
from __future__ import annotations

from dataclasses import dataclass
import math

import numpy as np
import pandas as pd


@dataclass
class IndexSettings:
    base_temperature: float = 10.0
    altitude_m: float = 200.0
    soil_storage_mm: float = 150.0
    albedo: float = 0.23


STEFAN_BOLTZMANN = 4.903e-9
G_SC = 0.0820


def _saturated_vapour_pressure(temp_c: pd.Series) -> pd.Series:
    return 0.6108 * np.exp((17.27 * temp_c) / (temp_c + 237.3))


def _slope_svp_curve(temp_c: pd.Series) -> pd.Series:
    return 4098 * _saturated_vapour_pressure(temp_c) / ((temp_c + 237.3) ** 2)


def _psychrometric_constant(altitude_m: float) -> float:
    pressure = 101.3 * (((293.0 - 0.0065 * altitude_m) / 293.0) ** 5.26)
    return 0.000665 * pressure


def _inverse_relative_distance(day_of_year: pd.Series) -> pd.Series:
    return 1 + 0.033 * np.cos((2 * np.pi / 365) * day_of_year)


def _solar_declination(day_of_year: pd.Series) -> pd.Series:
    return 0.409 * np.sin(((2 * np.pi / 365) * day_of_year) - 1.39)


def _sunset_hour_angle(latitude_rad: pd.Series, declination: pd.Series) -> pd.Series:
    return np.arccos(-np.tan(latitude_rad) * np.tan(declination))


def _extraterrestrial_radiation(day_of_year: pd.Series, latitude_deg: pd.Series) -> pd.Series:
    lat_rad = np.radians(latitude_deg)
    decl = _solar_declination(day_of_year)
    ws = _sunset_hour_angle(lat_rad, decl)
    dr = _inverse_relative_distance(day_of_year)
    return (
        (24 * 60 / math.pi)
        * G_SC
        * dr
        * (
            ws * np.sin(lat_rad) * np.sin(decl)
            + np.cos(lat_rad) * np.cos(decl) * np.sin(ws)
        )
    )


def _net_shortwave_radiation(swdown: pd.Series, albedo: float) -> pd.Series:
    return (1 - albedo) * swdown * 0.0864


def _net_longwave_radiation(
    tmax_c: pd.Series,
    tmin_c: pd.Series,
    swdown: pd.Series,
    rh: pd.Series,
    ra: pd.Series,
) -> pd.Series:
    tmax_k = tmax_c + 273.16
    tmin_k = tmin_c + 273.16
    sigma_term = ((tmax_k**4) + (tmin_k**4)) / 2
    ea = _saturated_vapour_pressure((tmax_c + tmin_c) / 2) * (rh / 100)
    rs_rso = np.minimum(1.0, swdown * 0.0864 / (ra + 1e-6))
    return STEFAN_BOLTZMANN * sigma_term * (0.34 - 0.14 * np.sqrt(ea)) * (1.35 * rs_rso - 0.35)


def _net_radiation(
    swdown: pd.Series,
    tmax_c: pd.Series,
    tmin_c: pd.Series,
    rh: pd.Series,
    day_of_year: pd.Series,
    latitude: pd.Series,
    albedo: float,
) -> pd.Series:
    ra = _extraterrestrial_radiation(day_of_year, latitude)
    rns = _net_shortwave_radiation(swdown, albedo)
    rnl = _net_longwave_radiation(tmax_c, tmin_c, swdown, rh, ra)
    return rns - rnl


def growing_degree_days(tmin: pd.Series, tmax: pd.Series, base_temperature: float) -> pd.Series:
    mean_temp = (tmin + tmax) / 2
    gdd = np.maximum(0.0, mean_temp - base_temperature)
    return gdd


def fao56_reference_et0(
    weather: pd.DataFrame,
    settings: IndexSettings,
) -> pd.Series:
    tmean = weather["tmean"]
    delta = _slope_svp_curve(tmean)
    gamma = _psychrometric_constant(settings.altitude_m)
    es = _saturated_vapour_pressure(tmean)
    ea = es * (weather["rh"] / 100.0)
    net_rad = _net_radiation(
        weather["swdown"],
        weather["tmax"],
        weather["tmin"],
        weather["rh"],
        weather["day_of_year"],
        weather["lat"],
        settings.albedo,
    )
    wind = weather["w10m"]
    temp_term = (900.0 / (weather["tmean"] + 273.0)) * wind * (es - ea)
    et0 = (0.408 * delta * net_rad + gamma * temp_term) / (delta + gamma * (1 + 0.34 * wind))
    return np.maximum(et0, 0.0)


def compute_daily_indices(
    weather: pd.DataFrame,
    settings: IndexSettings,
) -> pd.DataFrame:
    df = weather.copy()
    df["day_of_year"] = pd.to_datetime(df["date"]).dt.dayofyear
    df["gdd"] = growing_degree_days(df["tmin"], df["tmax"], settings.base_temperature)
    df["etp"] = fao56_reference_et0(df, settings)

    storage = []
    available = settings.soil_storage_mm
    balance = []
    for _, row in df.iterrows():
        available += row["rr"]
        if available > settings.soil_storage_mm:
            available = settings.soil_storage_mm
        etr = min(row["etp"], available)
        available -= etr
        balance.append(
            {
                "etr": etr,
                "soil_storage": available,
                "water_balance": available - (settings.soil_storage_mm / 2),
            }
        )
    balance_df = pd.DataFrame(balance)
    df = pd.concat([df, balance_df], axis=1)
    df.rename(columns={"water_balance": "bilan_hydrique"}, inplace=True)
    return df


def summarise_season(df: pd.DataFrame) -> pd.Series:
    summary = pd.Series(dtype="float64")
    summary["cum_rr"] = df["rr"].sum()
    summary["cum_etp"] = df["etp"].sum()
    summary["gdd"] = df["gdd"].sum()
    summary["deficit_hydrique"] = (df["etp"] - df["etr"]).clip(lower=0).sum()
    summary["days_tmean_gt_30"] = float((df["tmean"] > 30).sum())
    return summary


__all__ = [
    "IndexSettings",
    "compute_daily_indices",
    "growing_degree_days",
    "fao56_reference_et0",
    "summarise_season",
]
