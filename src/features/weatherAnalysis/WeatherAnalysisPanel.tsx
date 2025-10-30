import { useEffect, useMemo, useState } from 'react';
import useWeatherAnalysis, { type WeatherAnalysisParams } from './useWeatherAnalysis';
import useStationAvailability from './useStationAvailability';
import type { Probability, WeatherAnalysisResponse, YearIndicators } from './types';

const DEFAULT_DRY_SPELL_THRESHOLD = 10;

const YEARS_OPTIONS = [1, 5, 10] as const;

function formatProbability(probability?: Probability): string {
  if (!probability || probability.probability == null) return '—';
  return `${Math.round(probability.probability * 100)} %`;
}

function probabilityWidth(probability?: Probability): string {
  if (!probability || probability.probability == null) return '0%';
  return `${Math.round(probability.probability * 100)}%`;
}

function formatDayOfYear(day: number): string {
  const date = new Date(Date.UTC(2024, 0, 1));
  date.setUTCDate(day);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function formatDateInput(date: Date): string {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const year = utcDate.getUTCFullYear();
  const month = `${utcDate.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${utcDate.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayOfYearFromInput(value: string): number | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const diff = date.getTime() - start;
  const doy = Math.floor(diff / (24 * 60 * 60 * 1000));
  return Number.isFinite(doy) ? doy : null;
}

function consecutiveYearsAvailable(years: number[]): number {
  if (!years.length) return 0;
  const uniqueYears = new Set(years);
  const latest = Math.max(...uniqueYears);
  let count = 0;
  for (let year = latest; uniqueYears.has(year); year -= 1) {
    count += 1;
  }
  return count;
}

function formatAvailableYears(years: number[]): string {
  if (!years.length) {
    return 'Aucune donnée disponible sur la période demandée.';
  }
  if (years.length === 1) {
    return `${years[0]}`;
  }
  const sorted = [...years].sort((a, b) => a - b);
  return `${sorted[0]} – ${sorted[sorted.length - 1]} (${sorted.length} ans)`;
}

function confidenceLabel(value: number): { label: string; color: string } {
  if (value >= 0.75) return { label: 'Confiance élevée', color: '#16a34a' };
  if (value >= 0.5) return { label: 'Confiance moyenne', color: '#f59e0b' };
  return { label: 'Confiance faible', color: '#ef4444' };
}

function rainfallSparkline(years: YearIndicators[]): string {
  if (!years.length) return '';
  const values = years.map((year) => year.rainfall.total);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = 180;
  const height = 40;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1 || 1)) * width;
      const normalized = max === min ? 0.5 : 1 - (value - min) / (max - min);
      const y = normalized * height;
      return `${x},${y}`;
    })
    .join(' ');
  return points;
}

function StationsList({ stations }: { stations: WeatherAnalysisResponse['stationsUsed'] }) {
  if (!stations.length) return <p style={{ margin: 0 }}>Stations inconnues.</p>;
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {stations.map((station) => (
        <li key={station.id} style={{ fontSize: 14, color: '#1f2937', marginBottom: 2 }}>
          <strong>{station.name}</strong>
          {station.distanceKm != null ? ` — ${station.distanceKm.toFixed(1)} km` : ''}
        </li>
      ))}
    </ul>
  );
}

export interface WeatherAnalysisPanelProps {
  lat: number | null | undefined;
  lon: number | null | undefined;
  parcelLabel?: string;
}

export default function WeatherAnalysisPanel({ lat, lon, parcelLabel }: WeatherAnalysisPanelProps) {
  const [yearsBack, setYearsBack] = useState<number>(5);
  const [shouldAnalyze, setShouldAnalyze] = useState(false);
  const [startDate, setStartDate] = useState<string>(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 30);
    return formatDateInput(start);
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return formatDateInput(today);
  });

  const maxLookback = YEARS_OPTIONS[YEARS_OPTIONS.length - 1] ?? 1;
  const availability = useStationAvailability(lat, lon, maxLookback);
  const primaryStation = availability.data?.stations?.[0] ?? null;
  const availableYears = primaryStation?.availableYears ?? [];
  const continuousYears = useMemo(() => consecutiveYearsAvailable(availableYears), [availableYears]);

  useEffect(() => {
    setShouldAnalyze(false);
  }, [lat, lon, startDate, endDate]);

  useEffect(() => {
    if (!continuousYears) {
      setYearsBack(YEARS_OPTIONS[0]);
      return;
    }
    setYearsBack((current) => {
      if (current <= continuousYears) {
        return current;
      }
      const fallback = [...YEARS_OPTIONS].reverse().find((option) => option <= continuousYears) ?? YEARS_OPTIONS[0];
      return fallback;
    });
  }, [continuousYears]);

  const baseParams: WeatherAnalysisParams | null = useMemo(() => {
    if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) {
      return null;
    }
    const phaseStart = dayOfYearFromInput(startDate);
    const phaseEnd = dayOfYearFromInput(endDate);
    if (phaseStart == null || phaseEnd == null) {
      return null;
    }
    return {
      lat,
      lon,
      crop: 'custom_period',
      phaseStart,
      phaseEnd,
      yearsBack,
    };
  }, [lat, lon, yearsBack, startDate, endDate]);

  const requestParams = shouldAnalyze ? baseParams : null;

  const { data, loading, error, refetch } = useWeatherAnalysis(requestParams);

  const confidence = data ? confidenceLabel(data.confidence) : null;

  const handleAnalyzeClick = () => {
    if (shouldAnalyze) {
      refetch();
    } else {
      setShouldAnalyze(true);
    }
  };

  const analyzeDisabled = availability.loading || !baseParams;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, color: '#0f172a' }}>Analyse météo</h1>
            {parcelLabel ? (
              <p style={{ margin: '4px 0 0', color: '#475569', fontSize: 14 }}>Parcelle : {parcelLabel}</p>
            ) : null}
          </div>
          {confidence ? (
            <span
              style={{
                alignSelf: 'flex-start',
                background: `${confidence.color}20`,
                color: confidence.color,
                padding: '6px 12px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {confidence.label}
            </span>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13, color: '#1e293b' }}>
            Date de début
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              style={{
                marginTop: 4,
                borderRadius: 8,
                border: '1px solid #cbd5f5',
                padding: '8px 12px',
                fontSize: 14,
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13, color: '#1e293b' }}>
            Date de fin
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              style={{
                marginTop: 4,
                borderRadius: 8,
                border: '1px solid #cbd5f5',
                padding: '8px 12px',
                fontSize: 14,
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13, color: '#1e293b' }}>
            Fenêtre historique
            <select
              value={yearsBack}
              onChange={(event) => setYearsBack(Number(event.target.value))}
              style={{
                marginTop: 4,
                borderRadius: 8,
                border: '1px solid #cbd5f5',
                padding: '8px 12px',
                fontSize: 14,
              }}
            >
              {YEARS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} ans
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleAnalyzeClick}
            style={{
              marginTop: 20,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #38bdf8',
              background: '#0ea5e9',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: analyzeDisabled ? 'not-allowed' : 'pointer',
              opacity: analyzeDisabled ? 0.6 : 1,
            }}
            disabled={analyzeDisabled}
          >
            {shouldAnalyze ? 'Rafraîchir' : "Lancer l'analyse"}
          </button>
        </div>
      </header>

      {availability.loading ? (
        <div style={{ padding: 16, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <p style={{ margin: 0, color: '#475569' }}>Chargement des années disponibles…</p>
        </div>
      ) : null}

      {availability.error ? (
        <div style={{ padding: 16, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca' }}>
          <p style={{ margin: 0, color: '#b91c1c' }}>{availability.error}</p>
        </div>
      ) : null}

      {primaryStation ? (
        <div style={{ padding: 16, borderRadius: 12, background: '#ffffff', border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#0f172a' }}>Disponibilité des données</h3>
          <p style={{ margin: 0, fontSize: 14, color: '#1f2937' }}>
            Station analysée : <strong>{primaryStation.name}</strong>
            {primaryStation.distanceKm != null ? ` — ${primaryStation.distanceKm.toFixed(1)} km` : ''}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#475569' }}>{formatAvailableYears(availableYears)}</p>
          {continuousYears > 0 && continuousYears < yearsBack ? (
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#b45309' }}>
              Données continues disponibles sur {continuousYears} ans. Ajustez la fenêtre historique si nécessaire.
            </p>
          ) : null}
        </div>
      ) : null}

      {baseParams && !shouldAnalyze ? (
        <div style={{ padding: 16, borderRadius: 12, background: '#f8fafc', border: '1px dashed #cbd5f5' }}>
          <p style={{ margin: 0, color: '#475569' }}>
            Vérifiez les années disponibles puis lancez l'analyse météo.
          </p>
        </div>
      ) : null}

      {!baseParams ? (
        <div style={{ padding: 24, borderRadius: 12, background: '#f8fafc', border: '1px dashed #cbd5f5' }}>
          <p style={{ margin: 0, color: '#475569' }}>
            Sélectionnez une parcelle sur la carte pour lancer l'analyse météo.
          </p>
        </div>
      ) : null}

      {loading ? (
        <div style={{ padding: 24, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <p style={{ margin: 0, color: '#475569' }}>Chargement des données Infoclimat…</p>
        </div>
      ) : null}

      {error ? (
        <div style={{ padding: 24, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca' }}>
          <p style={{ margin: 0, color: '#b91c1c' }}>{error}</p>
        </div>
      ) : null}

      {data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            <div style={{ borderRadius: 12, padding: 16, background: '#ffffff', border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#0f172a' }}>Stations utilisées</h3>
              <StationsList stations={data.stationsUsed} />
            </div>
            <div style={{ borderRadius: 12, padding: 16, background: '#ffffff', border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#0f172a' }}>Période analysée</h3>
              <p style={{ margin: 0, fontSize: 14, color: '#1f2937' }}>
                {formatDayOfYear(data.phase.startDayOfYear)} → {formatDayOfYear(data.phase.endDayOfYear)}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#475569' }}>
                {data.yearsAnalyzed} campagnes agrégées ({yearsBack} ans demandés)
              </p>
            </div>
            <div style={{ borderRadius: 12, padding: 16, background: '#ffffff', border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#0f172a' }}>Pluie cumulée (mm)</h3>
              <p style={{ margin: 0, fontSize: 14, color: '#1f2937' }}>
                P10 : {data.rainfallQuantiles.p10?.toFixed(1) ?? '—'}
              </p>
              <p style={{ margin: '4px 0', fontSize: 14, color: '#1f2937' }}>
                Médiane : {data.rainfallQuantiles.p50?.toFixed(1) ?? '—'}
              </p>
              <p style={{ margin: 0, fontSize: 14, color: '#1f2937' }}>
                P90 : {data.rainfallQuantiles.p90?.toFixed(1) ?? '—'}
              </p>
            </div>
          </section>

          <section style={{ borderRadius: 12, padding: 16, background: '#ffffff', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#0f172a' }}>Probabilités d'événements défavorables</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Vague de chaleur (≥1 épisode ≥35°C)', value: data.risks.heatwave },
                { label: 'Jours très chauds (≥3 jours ≥35°C)', value: data.risks.extremeHeat },
                { label: `Séquence sèche ≥ ${DEFAULT_DRY_SPELL_THRESHOLD} jours`, value: data.risks.drySpell },
                { label: 'Gel tardif (Tmin ≤0°C après début de phase)', value: data.risks.lateFrost },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#1f2937' }}>
                    <span>{item.label}</span>
                    <strong>{formatProbability(item.value)}</strong>
                  </div>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 999,
                      background: '#e2e8f0',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: probabilityWidth(item.value),
                        height: '100%',
                        background: '#ef4444',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ borderRadius: 12, padding: 16, background: '#ffffff', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#0f172a' }}>Tendance pluviométrie</h3>
            {data.indicators.years.length > 1 ? (
              <svg viewBox="0 0 180 40" width="100%" height="60">
                <polyline
                  fill="none"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  points={rainfallSparkline(data.indicators.years)}
                />
              </svg>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>Données insuffisantes pour tracer une tendance.</p>
            )}
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#475569' }}>
              Direction : {data.trends.rainfall.direction} — slope {data.trends.rainfall.ols?.slope ?? 'n/a'}
            </p>
          </section>

          <footer style={{ fontSize: 12, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
            <span>Source : Infoclimat (Open Data)</span>
            <span>Dernier rafraîchissement : {new Date().toLocaleString('fr-FR')}</span>
          </footer>
        </div>
      ) : null}
    </section>
  );
}
