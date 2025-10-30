import { useEffect, useMemo, useState } from 'react';
import useWeatherAnalysis, { type WeatherAnalysisParams } from './useWeatherAnalysis';
import useStationAvailability from './useStationAvailability';
import type { StationAvailability, WeatherHistorySelection } from './types';

const HOURLY_COLUMNS = [
  { key: 'dh_utc', label: 'Heure (UTC)' },
  { key: 'temperature', label: 'Température (°C)' },
  { key: 'pression', label: 'Pression (hPa)' },
  { key: 'humidite', label: 'Humidité (%)' },
  { key: 'vent_moyen', label: 'Vent moyen' },
  { key: 'pluie_1h', label: 'Pluie 1h (mm)' },
] as const;

function formatDateInput(date: Date): string {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const year = utcDate.getUTCFullYear();
  const month = `${utcDate.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${utcDate.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface WeatherAnalysisPanelProps {
  lat: number | null | undefined;
  lon: number | null | undefined;
  parcelLabel?: string;
  historySelection?: WeatherHistorySelection | null;
}

export default function WeatherAnalysisPanel({ lat, lon, parcelLabel, historySelection }: WeatherAnalysisPanelProps) {
  const [shouldAnalyze, setShouldAnalyze] = useState(false);
  const [startDate, setStartDate] = useState<string>(() => {
    if (historySelection?.start) return historySelection.start;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 2);
    return formatDateInput(start);
  });
  const [endDate, setEndDate] = useState<string>(() => {
    if (historySelection?.end) return historySelection.end;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return formatDateInput(today);
  });
  const [selectedStation, setSelectedStation] = useState<string | null>(historySelection?.stationId ?? null);

  const availability = useStationAvailability(lat, lon, 1);
  const stations: StationAvailability[] = availability.data?.stations ?? [];

  useEffect(() => {
    if (historySelection?.stationId) {
      setSelectedStation(historySelection.stationId);
      return;
    }
    if (stations.length) {
      setSelectedStation(stations[0].id);
    } else {
      setSelectedStation(null);
    }
  }, [historySelection, stations]);

  useEffect(() => {
    if (historySelection?.start) {
      setStartDate(historySelection.start);
    }
    if (historySelection?.end) {
      setEndDate(historySelection.end);
    }
  }, [historySelection]);

  useEffect(() => {
    if (historySelection) return;
    setShouldAnalyze(false);
  }, [historySelection, lat, lon, startDate, endDate, selectedStation]);

  useEffect(() => {
    if (!historySelection) return;
    if (historySelection.stationId && selectedStation !== historySelection.stationId) return;
    if (!historySelection.start || !historySelection.end) return;
    setShouldAnalyze(true);
  }, [historySelection, selectedStation]);

  const params: WeatherAnalysisParams | null = useMemo(() => {
    if (!shouldAnalyze) return null;
    if (!startDate || !endDate) return null;
    return {
      station: selectedStation ?? undefined,
      lat: lat ?? undefined,
      lon: lon ?? undefined,
      dateStart: startDate,
      dateEnd: endDate,
      source: historySelection?.series.meta.provider,
    };
  }, [shouldAnalyze, selectedStation, startDate, endDate, lat, lon, historySelection]);

  const { data, loading, error, refetch } = useWeatherAnalysis(params);

  const handleAnalyzeClick = () => {
    if (shouldAnalyze) {
      refetch();
    } else {
      setShouldAnalyze(true);
    }
  };

  const analyzeDisabled = !startDate || !endDate || (availability.loading && !historySelection);
  const stationLocked = Boolean(historySelection?.stationId);
  const historySources = historySelection?.sources?.length ? historySelection.sources.join(' • ') : null;

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
        </div>
        {historySelection ? (
          <div
            style={{
              padding: '12px 16px',
              background: '#ecfeff',
              borderRadius: 12,
              color: '#0f172a',
              fontSize: 13,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <strong style={{ fontSize: 14 }}>
              Analyse basée sur la station {historySelection.stationLabel ?? historySelection.stationId ?? 'inconnue'}
            </strong>
            <span>
              Période {historySelection.start} → {historySelection.end}
            </span>
            {historySources ? <span>Sources : {historySources}</span> : null}
          </div>
        ) : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 14, color: '#1f2937' }}>
            Station
            <select
              value={selectedStation ?? ''}
              onChange={(event) => setSelectedStation(event.target.value || null)}
              style={{ marginTop: 4, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5f5', minWidth: 220 }}
              disabled={stationLocked || !stations.length}
            >
              {stations.length ? null : <option value="">Aucune station disponible</option>}
              {stationLocked && historySelection?.stationId ? (
                <option value={historySelection.stationId}>
                  {historySelection.stationLabel ?? historySelection.stationId} (historique)
                </option>
              ) : null}
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name ?? station.id}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 14, color: '#1f2937' }}>
            Date de début
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              style={{ marginTop: 4, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5f5' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 14, color: '#1f2937' }}>
            Date de fin
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              style={{ marginTop: 4, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5f5' }}
            />
          </label>
          <button
            type="button"
            onClick={handleAnalyzeClick}
            disabled={analyzeDisabled}
            style={{
              alignSelf: 'flex-end',
              padding: '8px 16px',
              background: analyzeDisabled ? '#cbd5f5' : '#2563eb',
              color: analyzeDisabled ? '#64748b' : '#ffffff',
              border: 'none',
              borderRadius: 8,
              cursor: analyzeDisabled ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            {shouldAnalyze ? 'Actualiser' : 'Analyser'}
          </button>
        </div>
        {availability.loading ? (
          <p style={{ margin: 0, color: '#475569', fontSize: 14 }}>Chargement des stations…</p>
        ) : null}
        {availability.error ? (
          <p style={{ margin: 0, color: '#ef4444', fontSize: 14 }}>{availability.error}</p>
        ) : null}
      </header>

      {error ? (
        <div style={{ padding: 16, borderRadius: 8, background: '#fee2e2', color: '#991b1b' }}>{error}</div>
      ) : null}

      {loading ? <p style={{ color: '#475569' }}>Analyse en cours…</p> : null}

      {data ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 style={{ margin: 0, fontSize: 20, color: '#0f172a' }}>Données horaires</h2>
            <p style={{ margin: 0, fontSize: 14, color: '#475569' }}>
              Source : {data.source} — Station {data.station} — Période du {data.dateStart} au {data.dateEnd}
            </p>
          </div>
          {data.hourly.length ? (
            <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    {HOURLY_COLUMNS.map((column) => (
                      <th
                        key={column.key}
                        style={{
                          padding: '8px 12px',
                          textAlign: 'left',
                          fontWeight: 600,
                          color: '#1f2937',
                          borderBottom: '1px solid #e2e8f0',
                        }}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.hourly.map((entry, index) => (
                    <tr key={`${entry.dh_utc ?? index}-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      {HOURLY_COLUMNS.map((column) => {
                        const rawValue = (entry as Record<string, unknown>)[column.key];
                        const displayValue =
                          typeof rawValue === 'number'
                            ? rawValue.toString()
                            : typeof rawValue === 'string'
                              ? rawValue
                              : rawValue != null
                                ? String(rawValue)
                                : '—';
                        return (
                          <td key={column.key} style={{ padding: '8px 12px', color: '#334155' }}>
                            {displayValue}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ margin: 0, color: '#475569' }}>Aucune donnée horaire disponible pour cette période.</p>
          )}
        </section>
      ) : null}
    </section>
  );
}
