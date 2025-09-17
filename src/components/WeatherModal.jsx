import React from "react";

function formatNumber(value, { digits = 1, suffix = "" } = {}) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toFixed(digits)}${suffix}`;
}

function formatDateRange(start, end) {
  if (!start || !end) return null;
  try {
    const formatter = new Intl.DateTimeFormat("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return `${formatter.format(new Date(start))} → ${formatter.format(new Date(end))}`;
  } catch {
    return `${start} → ${end}`;
  }
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.55)",
  zIndex: 60,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "40px 24px",
};

const panelStyle = {
  background: "#ffffff",
  borderRadius: 16,
  maxWidth: 980,
  width: "100%",
  maxHeight: "92vh",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 20px 60px rgba(15, 23, 42, 0.25)",
  overflow: "hidden",
};

const headerStyle = {
  padding: "20px 28px 16px",
  borderBottom: "1px solid #e5e7eb",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
};

const contentStyle = {
  padding: "20px 28px",
  overflowY: "auto",
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 16,
};

const summaryCardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: "14px 16px",
  background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const summaryValueStyle = {
  fontSize: 22,
  fontWeight: 600,
  color: "#0f172a",
};

function SummaryCard({ title, value, suffix, digits = 1, helper }) {
  return (
    <div style={summaryCardStyle}>
      <span style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {title}
      </span>
      <span style={summaryValueStyle}>{formatNumber(value, { digits, suffix })}</span>
      {helper ? (
        <span style={{ fontSize: 12, color: "#475569" }}>{helper}</span>
      ) : null}
    </div>
  );
}

function MonthlyTable({ monthly }) {
  if (!monthly?.length) return null;

  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 18 }}>Détail par mois</h3>
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
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb" }}>
                Mois
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb" }}>
                Temp. jour (°C)
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb" }}>
                Temp. nuit (°C)
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb" }}>
                Pluie (mm)
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb" }}>
                Vent (km/h)
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb" }}>
                Hygrométrie (%)
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb" }}>
                Jours mesurés
              </th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((month) => (
              <tr key={month.monthIndex}>
                <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f5f9" }}>
                  {month.label}
                </td>
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

export default function WeatherModal({
  open,
  onClose,
  parcelLabel,
  loading,
  error,
  weather,
  coordinates,
}) {
  if (!open) return null;

  const period = weather?.metadata
    ? formatDateRange(weather.metadata.startDate, weather.metadata.endDate)
    : null;

  const coord = coordinates || weather?.metadata?.query;
  const hasCoords =
    coord && typeof coord.latitude === "number" && typeof coord.longitude === "number";

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>{parcelLabel || "Parcelle"}</h2>
            <p style={{ margin: "6px 0 0", color: "#475569", fontSize: 13 }}>
              Données météorologiques des 12 derniers mois.
              {period ? ` ${period}.` : ""}
            </p>
            {hasCoords ? (
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                Station la plus proche autour de ({coord.latitude.toFixed(4)}°N, {coord.longitude.toFixed(4)}°E)
              </p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            style={{
              border: "1px solid #cbd5f5",
              background: "#f8fafc",
              borderRadius: 30,
              padding: "8px 18px",
              cursor: "pointer",
              fontWeight: 500,
            }}
            type="button"
          >
            Fermer
          </button>
        </div>

        <div style={contentStyle}>
          {loading && (
            <div style={{ color: "#1e3a8a", fontWeight: 500 }}>Chargement des relevés météo…</div>
          )}

          {!loading && error && (
            <div style={{
              background: "#fee2e2",
              color: "#b91c1c",
              border: "1px solid #fecaca",
              borderRadius: 12,
              padding: "14px 18px",
            }}>
              {error}
            </div>
          )}

          {!loading && !error && weather && (
            <>
              <div style={summaryGridStyle}>
                <SummaryCard
                  title="Température jour"
                  value={weather.summary?.avgDayTemp}
                  suffix="°C"
                />
                <SummaryCard
                  title="Température nuit"
                  value={weather.summary?.avgNightTemp}
                  suffix="°C"
                />
                <SummaryCard
                  title="Pluviométrie"
                  value={weather.summary?.totalPrecipitation}
                  digits={1}
                  suffix=" mm"
                  helper={
                    weather.summary?.precipitationDayCount
                      ? `${weather.summary.precipitationDayCount} jours de relevés`
                      : null
                  }
                />
                <SummaryCard
                  title="Vent moyen"
                  value={weather.summary?.avgWindSpeed}
                  suffix=" km/h"
                />
                <SummaryCard
                  title="Hygrométrie"
                  value={weather.summary?.avgHumidity}
                  suffix=" %"
                />
              </div>

              <MonthlyTable monthly={weather.monthly} />

              <p style={{ marginTop: 28, fontSize: 12, color: "#64748b" }}>
                Source : {weather.metadata?.source || "Service météo"}. Données agrégées via
                l'API Open-Meteo (archive). Les valeurs sont calculées à partir des relevés horaires
                proches de la parcelle sélectionnée.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
