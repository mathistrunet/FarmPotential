import React, { useCallback, useMemo } from "react";
import { MONTH_LABELS } from "../services/weather";

const SHORT_MONTH_LABELS = MONTH_LABELS.map((label) =>
  label.length > 4 ? `${label.slice(0, 3)}.` : label
);

const YEAR_COLORS = ["#2563eb", "#22c55e", "#f97316", "#a855f7", "#ef4444", "#0ea5e9"];

function formatNumber(value, { digits = 1, suffix = "" } = {}) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toFixed(digits)}${suffix}`;
}

function buildSeriesFromMonthly(monthly, key) {
  const arr = Array.from({ length: 12 }, () => null);
  if (!Array.isArray(monthly)) return arr;
  monthly.forEach((entry) => {
    if (entry && typeof entry.monthIndex === "number" && entry.monthIndex >= 0 && entry.monthIndex < 12) {
      const value = entry[key];
      arr[entry.monthIndex] = typeof value === "number" && !Number.isNaN(value) ? value : null;
    }
  });
  return arr;
}

function SimpleLineChart({
  title,
  unit,
  series,
  formatter = (value) => (value == null ? "—" : value.toFixed(1)),
}) {
  const filteredSeries = Array.isArray(series) ? series.filter((item) => item && Array.isArray(item.values)) : [];

  const allValues = filteredSeries.flatMap((serie) => serie.values.filter((value) => value != null));

  if (!filteredSeries.length || !allValues.length) {
    return (
      <div style={{ marginTop: 32 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 18 }}>{title}</h3>
        <div
          style={{
            border: "1px dashed #cbd5f5",
            borderRadius: 12,
            padding: "16px 20px",
            color: "#64748b",
            fontSize: 14,
          }}
        >
          Aucune donnée disponible pour afficher ce graphique.
        </div>
      </div>
    );
  }

  let minValue = Math.min(...allValues);
  let maxValue = Math.max(...allValues);

  if (minValue === maxValue) {
    const padding = minValue === 0 ? 1 : Math.abs(minValue) * 0.1;
    minValue -= padding;
    maxValue += padding;
  } else {
    const rangePadding = (maxValue - minValue) * 0.1;
    minValue -= rangePadding;
    maxValue += rangePadding;
  }

  const width = 760;
  const height = 280;
  const margin = { top: 28, right: 20, bottom: 44, left: 64 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const getX = (index) => margin.left + (innerWidth * index) / (MONTH_LABELS.length - 1);
  const getY = (value) => {
    if (value == null) return null;
    return margin.top + ((maxValue - value) / (maxValue - minValue)) * innerHeight;
  };

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, idx) =>
    minValue + ((maxValue - minValue) * idx) / yTicks
  );

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 18 }}>{title}</h3>
      <div style={{ background: "#f8fafc", borderRadius: 16, padding: "12px 16px" }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" role="img">
          <defs>
            <clipPath id="chartClip">
              <rect
                x={margin.left}
                y={margin.top}
                width={innerWidth}
                height={innerHeight}
                rx="6"
                ry="6"
              />
            </clipPath>
          </defs>

          {/* Background */}
          <rect
            x={margin.left}
            y={margin.top}
            width={innerWidth}
            height={innerHeight}
            fill="#ffffff"
            stroke="#e2e8f0"
            rx="6"
            ry="6"
          />

          {/* Horizontal grid lines */}
          {yTickValues.map((tick) => {
            const y = getY(tick);
            return (
              <line
                key={`grid-${tick.toFixed(4)}`}
                x1={margin.left}
                x2={margin.left + innerWidth}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray="4 4"
              />
            );
          })}

          {/* Series paths */}
          <g clipPath="url(#chartClip)">
            {filteredSeries.map((serie) => {
              const dash = serie.dashed ? "6 4" : undefined;
              const opacity = typeof serie.opacity === "number" ? serie.opacity : 1;
              let path = "";
              serie.values.forEach((value, index) => {
                const y = getY(value);
                const x = getX(index);
                if (value == null || y == null) {
                  path += "";
                  return;
                }
                if (!path) {
                  path = `M ${x} ${y}`;
                } else {
                  path += ` L ${x} ${y}`;
                }
              });

              return (
                <path
                  key={serie.label}
                  d={path}
                  fill="none"
                  stroke={serie.color}
                  strokeWidth={3}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={dash}
                  strokeOpacity={opacity}
                />
              );
            })}

            {/* Data points */}
            {filteredSeries.map((serie) => {
              const opacity = typeof serie.opacity === "number" ? serie.opacity : 1;
              return serie.values.map((value, index) => {
                const y = getY(value);
                const x = getX(index);
                if (value == null || y == null) return null;
                return (
                  <circle
                    key={`${serie.label}-${index}`}
                    cx={x}
                    cy={y}
                    r={4}
                    fill="#ffffff"
                    stroke={serie.color}
                    strokeWidth={2}
                    strokeOpacity={opacity}
                  />
                );
              });
            })}
          </g>

          {/* X axis labels */}
          {MONTH_LABELS.map((label, index) => {
            const x = getX(index);
            return (
              <text
                key={`month-${label}`}
                x={x}
                y={height - margin.bottom + 20}
                textAnchor="middle"
                fontSize={12}
                fill="#334155"
              >
                {SHORT_MONTH_LABELS[index]}
              </text>
            );
          })}

          {/* Y axis labels */}
          {yTickValues.map((tick) => {
            const y = getY(tick);
            return (
              <text
                key={`label-${tick.toFixed(4)}`}
                x={margin.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize={12}
                fill="#475569"
              >
                {formatter(tick)}{unit}
              </text>
            );
          })}

          {/* Axis titles */}
          <text
            x={margin.left + innerWidth / 2}
            y={height - 8}
            textAnchor="middle"
            fontSize={12}
            fill="#475569"
          >
            Mois de l'année
          </text>
        </svg>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
          {filteredSeries.map((serie) => (
            <span
              key={`legend-${serie.label}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}
            >
              <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true">
                <line
                  x1="0"
                  x2="28"
                  y1="5"
                  y2="5"
                  stroke={serie.color}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={serie.dashed ? "6 4" : undefined}
                  strokeOpacity={typeof serie.opacity === "number" ? serie.opacity : 1}
                />
              </svg>
              {serie.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, suffix, digits = 1, helper, color }) {
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: "14px 16px",
        background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <span style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.4, color: "#475569" }}>
        {title}
      </span>
      <span style={{ fontSize: 24, fontWeight: 600, color: color || "#0f172a" }}>
        {formatNumber(value, { digits, suffix })}
      </span>
      {helper ? <span style={{ fontSize: 12, color: "#64748b" }}>{helper}</span> : null}
    </div>
  );
}

function MonthlyTable({ monthly, year, accentColor }) {
  if (!monthly?.length) return null;

  return (
    <div style={{ marginTop: 28 }}>
      <h4 style={{ margin: "0 0 12px", fontSize: 16, color: accentColor || "#1f2937" }}>
        Détail mensuel {year ? `(${year})` : ""}
      </h4>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            minWidth: 720,
          }}
        >
          <thead>
            <tr style={{ background: "#f8fafc", textAlign: "left" }}>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb" }}>Mois</th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb" }}>Temp. jour (°C)</th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb" }}>Temp. nuit (°C)</th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb" }}>Pluie (mm)</th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb" }}>Vent (km/h)</th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb" }}>Hygrométrie (%)</th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb" }}>Jours mesurés</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((month) => (
              <tr key={month.monthIndex}>
                <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f5f9" }}>{month.label}</td>
                <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f5f9" }}>
                  {formatNumber(month.avgDayTemp)}
                </td>
                <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f5f9" }}>
                  {formatNumber(month.avgNightTemp)}
                </td>
                <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f5f9" }}>
                  {formatNumber(month.totalPrecipitation, { digits: 1 })}
                </td>
                <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f5f9" }}>
                  {formatNumber(month.avgWindSpeed)}
                </td>
                <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f5f9" }}>
                  {formatNumber(month.avgHumidity)}
                </td>
                <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f5f9" }}>
                  {month.precipitationDayCount ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function YearSummary({
  year,
  dataset,
  loading,
  error,
  onRetry,
  accentColor,
}) {
  return (
    <div
      key={year}
      style={{
        marginTop: 36,
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        padding: "20px 22px",
        background: "#ffffff",
        boxShadow: "0 10px 32px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>Année {year}</h3>
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            background: accentColor || "#2563eb",
            display: "inline-block",
          }}
        />
      </div>

      {loading && (
        <div style={{ color: "#1e3a8a", fontWeight: 500 }}>Chargement des relevés météo…</div>
      )}

      {!loading && error && (
        <div
          style={{
            background: "#fee2e2",
            color: "#b91c1c",
            border: "1px solid #fecaca",
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 12,
          }}
        >
          {error}
          {onRetry ? (
            <button
              type="button"
              onClick={() => onRetry(year)}
              style={{
                marginLeft: 12,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #b91c1c",
                background: "#fff5f5",
                color: "#b91c1c",
                cursor: "pointer",
              }}
            >
              Réessayer
            </button>
          ) : null}
        </div>
      )}

      {!loading && !error && dataset ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
            }}
          >
            <SummaryCard
              title="Température jour"
              value={dataset.summary?.avgDayTemp}
              suffix="°C"
              color={accentColor}
            />
            <SummaryCard
              title="Température nuit"
              value={dataset.summary?.avgNightTemp}
              suffix="°C"
              color={accentColor}
            />
            <SummaryCard
              title="Pluviométrie"
              value={dataset.summary?.totalPrecipitation}
              digits={1}
              suffix=" mm"
              helper={
                dataset.summary?.precipitationDayCount
                  ? `${dataset.summary.precipitationDayCount} jours de relevés`
                  : null
              }
              color={accentColor}
            />
            <SummaryCard
              title="Vent moyen"
              value={dataset.summary?.avgWindSpeed}
              suffix=" km/h"
              color={accentColor}
            />
            <SummaryCard
              title="Hygrométrie"
              value={dataset.summary?.avgHumidity}
              suffix=" %"
              color={accentColor}
            />
          </div>

          <MonthlyTable monthly={dataset.monthly} year={year} accentColor={accentColor} />
        </>
      ) : null}
    </div>
  );
}

function YearToggleList({
  yearOptions,
  selectedYears,
  onToggleYear,
  loadingYears,
  yearErrors,
  getColor,
}) {
  if (!yearOptions?.length) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 18 }}>Sélectionnez les années à afficher</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {yearOptions.map((year) => {
          const checked = selectedYears.includes(year);
          const loading = loadingYears.includes(year);
          const error = yearErrors?.[year];
          const color = getColor(year);
          return (
            <div
              key={year}
              style={{
                border: `1px solid ${checked ? color : "#e2e8f0"}`,
                borderRadius: 12,
                padding: "10px 14px",
                background: checked ? "#eff6ff" : "#ffffff",
                minWidth: 140,
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleYear(year)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontWeight: 600, color: checked ? color : "#1f2937" }}>{year}</span>
              </label>
              {loading ? (
                <div style={{ fontSize: 12, color: "#0f172a", marginTop: 6 }}>Chargement…</div>
              ) : null}
              {!loading && error ? (
                <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 6 }}>⚠️ {error}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function WeatherModal({
  open,
  onClose,
  parcelLabel,
  centroid,
  station,
  stationLoading,
  stationError,
  onRetryStation,
  yearOptions,
  selectedYears,
  onToggleYear,
  loadingYears,
  weatherByYear,
  yearErrors,
  onRetryYear,
}) {
  const hasCoords = centroid && typeof centroid.latitude === "number" && typeof centroid.longitude === "number";

  const getColor = useCallback(
    (year) => {
      const idx = yearOptions ? yearOptions.indexOf(year) : -1;
      if (idx >= 0) {
        return YEAR_COLORS[idx % YEAR_COLORS.length];
      }
      return YEAR_COLORS[0];
    },
    [yearOptions]
  );

  const precipitationSeries = useMemo(() => {
    if (!selectedYears?.length) return [];
    return selectedYears
      .map((year) => {
        const dataset = weatherByYear?.[year];
        if (!dataset?.monthly) return null;
        return {
          label: `Pluie ${year}`,
          color: getColor(year),
          values: buildSeriesFromMonthly(dataset.monthly, "totalPrecipitation"),
        };
      })
      .filter(Boolean);
  }, [selectedYears, weatherByYear, getColor]);

  const dayTempSeries = useMemo(() => {
    if (!selectedYears?.length) return [];
    return selectedYears
      .map((year) => {
        const dataset = weatherByYear?.[year];
        if (!dataset?.monthly) return null;
        return {
          label: `Jour ${year}`,
          color: getColor(year),
          values: buildSeriesFromMonthly(dataset.monthly, "avgDayTemp"),
        };
      })
      .filter(Boolean);
  }, [selectedYears, weatherByYear, getColor]);

  const nightTempSeries = useMemo(() => {
    if (!selectedYears?.length) return [];
    return selectedYears
      .map((year) => {
        const dataset = weatherByYear?.[year];
        if (!dataset?.monthly) return null;
        return {
          label: `Nuit ${year}`,
          color: getColor(year),
          values: buildSeriesFromMonthly(dataset.monthly, "avgNightTemp"),
        };
      })
      .filter(Boolean);
  }, [selectedYears, weatherByYear, getColor]);

  const temperatureSeries = useMemo(() => {
    if (!dayTempSeries.length && !nightTempSeries.length) return [];
    const night = nightTempSeries.map((serie) => ({
      ...serie,
      dashed: true,
      opacity: 0.7,
    }));
    return [...dayTempSeries, ...night];
  }, [dayTempSeries, nightTempSeries]);

  const humiditySeries = useMemo(() => {
    if (!selectedYears?.length) return [];
    return selectedYears
      .map((year) => {
        const dataset = weatherByYear?.[year];
        if (!dataset?.monthly) return null;
        return {
          label: `Humidité ${year}`,
          color: getColor(year),
          values: buildSeriesFromMonthly(dataset.monthly, "avgHumidity"),
        };
      })
      .filter(Boolean);
  }, [selectedYears, weatherByYear, getColor]);

  const windSeries = useMemo(() => {
    if (!selectedYears?.length) return [];
    return selectedYears
      .map((year) => {
        const dataset = weatherByYear?.[year];
        if (!dataset?.monthly) return null;
        return {
          label: `Vent ${year}`,
          color: getColor(year),
          values: buildSeriesFromMonthly(dataset.monthly, "avgWindSpeed"),
        };
      })
      .filter(Boolean);
  }, [selectedYears, weatherByYear, getColor]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 18,
          maxWidth: 1120,
          width: "100%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.35)",
          overflow: "hidden",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            padding: "24px 32px 20px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 24 }}>Fenêtre météo – {parcelLabel || "Parcelle"}</h2>
            {hasCoords ? (
              <p style={{ margin: "6px 0 0", color: "#475569", fontSize: 13 }}>
                Coordonnées approximatives : {centroid.latitude.toFixed(4)}°N / {centroid.longitude.toFixed(4)}°E
              </p>
            ) : (
              <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
                Impossible de déterminer les coordonnées de cette parcelle.
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              border: "1px solid #cbd5f5",
              background: "#f8fafc",
              borderRadius: 30,
              padding: "10px 20px",
              cursor: "pointer",
              fontWeight: 600,
            }}
            type="button"
          >
            Fermer
          </button>
        </div>

        <div style={{ padding: "26px 32px", overflowY: "auto" }}>
          {!hasCoords ? (
            <div
              style={{
                background: "#fef3c7",
                border: "1px solid #facc15",
                borderRadius: 12,
                padding: "14px 18px",
                color: "#92400e",
                fontSize: 14,
              }}
            >
              Sélectionnez une parcelle valide ou dessinez-la complètement pour récupérer ses coordonnées et accéder aux
              données météo.
            </div>
          ) : null}

          {stationLoading ? (
            <div style={{ color: "#1e3a8a", fontWeight: 500, marginTop: 12 }}>
              Recherche de la station météo la plus proche…
            </div>
          ) : null}

          {!stationLoading && stationError ? (
            <div
              style={{
                background: "#fee2e2",
                color: "#b91c1c",
                border: "1px solid #fecaca",
                borderRadius: 12,
                padding: "14px 18px",
                marginTop: 12,
              }}
            >
              {stationError}
              {onRetryStation ? (
                <button
                  type="button"
                  onClick={onRetryStation}
                  style={{
                    marginLeft: 12,
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid #b91c1c",
                    background: "#fff5f5",
                    color: "#b91c1c",
                    cursor: "pointer",
                  }}
                >
                  Réessayer
                </button>
              ) : null}
            </div>
          ) : null}

          {!stationLoading && !stationError && hasCoords && !station ? (
            <div
              style={{
                background: "#fff7ed",
                color: "#b45309",
                border: "1px solid #fb923c",
                borderRadius: 12,
                padding: "14px 18px",
                marginTop: 12,
                fontSize: 13,
              }}
            >
              Aucune station météo n&apos;a pu être identifiée à proximité immédiate de cette parcelle. Veuillez vérifier sa
              position ou réessayer ultérieurement.
            </div>
          ) : null}

          {station && (
            <div
              style={{
                marginTop: 18,
                padding: "16px 20px",
                borderRadius: 16,
                background: "linear-gradient(135deg, #ecfeff 0%, #e0f2fe 100%)",
                border: "1px solid #bae6fd",
              }}
            >
              <h3 style={{ margin: "0 0 6px", fontSize: 18, color: "#0f172a" }}>Station météo la plus proche</h3>
              <p style={{ margin: "4px 0", color: "#1f2937", fontSize: 14 }}>
                <strong>{station.name || station.city || station.id || "Station"}</strong>
                {station.city ? ` – ${station.city}` : ""}
              </p>
              <p style={{ margin: "4px 0", color: "#334155", fontSize: 13 }}>
                Latitude : {station.latitude?.toFixed(4)}°N · Longitude : {station.longitude?.toFixed(4)}°E
                {station.distanceKm != null
                  ? ` · Distance estimée : ${station.distanceKm.toFixed(1)} km`
                  : ""}
              </p>
              <p style={{ margin: "4px 0", color: "#475569", fontSize: 12 }}>
                Les graphiques ci-dessous utilisent les données horaires agrégées de cette station.
              </p>
            </div>
          )}

          <YearToggleList
            yearOptions={yearOptions}
            selectedYears={selectedYears}
            onToggleYear={onToggleYear}
            loadingYears={loadingYears}
            yearErrors={yearErrors}
            getColor={getColor}
          />

          {selectedYears?.length ? (
            <>
              <SimpleLineChart
                title="Pluviométrie cumulée par mois"
                unit=" mm"
                series={precipitationSeries}
                formatter={(value) => (value == null ? "—" : value.toFixed(0))}
              />

              <SimpleLineChart
                title="Températures moyennes (jour et nuit)"
                unit=" °C"
                series={temperatureSeries}
              />

              <SimpleLineChart
                title="Hygrométrie moyenne"
                unit=" %"
                series={humiditySeries}
                formatter={(value) => (value == null ? "—" : value.toFixed(0))}
              />

              <SimpleLineChart
                title="Vitesse moyenne du vent"
                unit=" km/h"
                series={windSeries}
              />

              {selectedYears.map((year) => {
                const dataset = weatherByYear?.[year];
                const isLoading = loadingYears.includes(year);
                const error = yearErrors?.[year];
                return (
                  <YearSummary
                    key={year}
                    year={year}
                    dataset={dataset}
                    loading={isLoading}
                    error={error}
                    onRetry={onRetryYear}
                    accentColor={getColor(year)}
                  />
                );
              })}
            </>
          ) : (
            <div
              style={{
                marginTop: 32,
                border: "1px dashed #cbd5f5",
                borderRadius: 12,
                padding: "20px 24px",
                color: "#475569",
                fontSize: 14,
              }}
            >
              Sélectionnez au moins une année pour afficher les graphiques météo associés à cette station.
            </div>
          )}

          <p style={{ marginTop: 36, fontSize: 12, color: "#64748b" }}>
            Source : Open-Meteo (archive). Données agrégées via les relevés horaires les plus proches de la parcelle
            sélectionnée.
          </p>
        </div>
      </div>
    </div>
  );
}
