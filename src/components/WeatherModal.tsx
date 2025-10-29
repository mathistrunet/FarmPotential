import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import {
  getWeather,
  findNearestStation,
  type WeatherSeries,
  type WeatherProvider,
  type WeatherGranularity,
} from '../weather';

interface WeatherModalProps {
  open: boolean;
  onClose: () => void;
  centroid?: { latitude: number; longitude: number } | null;
  parcelLabel?: string;
  onOpenSummary?: () => void;
}

interface FormState {
  lat: string;
  lon: string;
  start: string;
  end: string;
  granularity: WeatherGranularity;
  provider: WeatherProvider | 'auto';
  stationId: string;
}

interface FetchState {
  loading: boolean;
  error: string | null;
  data: WeatherSeries | null;
}

const PROVIDER_LABELS: Record<WeatherProvider | 'auto', string> = {
  auto: 'Automatique (Infoclimat → Meteostat → Open-Meteo)',
  'infoclimat': 'Infoclimat',
  'meteostat': 'Meteostat',
  'open-meteo': 'Open-Meteo ERA5',
};

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

function buildHourlyRows(data: WeatherSeries | null) {
  const hourly = data?.hourly ?? [];
  return hourly.map((point) => ({
    key: point.time,
    time: new Date(point.time).toLocaleString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
    }),
    temperature: point.t2m,
    precipitation: point.tp,
    wind: point.ws,
    direction: point.wd,
    humidity: point.rh,
    pressure: point.p,
    radiation: point.rad ?? null,
  }));
}

function buildDailyRows(data: WeatherSeries | null) {
  const daily = data?.daily ?? [];
  return daily.map((point) => ({
    key: point.date,
    date: point.date,
    tmin: point.tmin,
    tmax: point.tmax,
    tavg: point.tavg ?? null,
    prcp: point.prcp,
    wind: point.ws_avg ?? null,
    humidity: point.rh_avg ?? null,
    pressure: point.p_avg ?? null,
    sunshine: point.sun ?? null,
  }));
}

function TemperatureChart({ data, granularity }: { data: WeatherSeries | null; granularity: WeatherGranularity }) {
  const chartData = useMemo(() => {
    if (!data) return [];
    if (granularity === 'hourly') {
      return (data.hourly ?? []).map((point) => ({
        label: new Date(point.time).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          day: '2-digit',
          month: 'short',
        }),
        temperature: point.t2m,
      }));
    }
    return (data.daily ?? []).map((point) => ({
      label: point.date,
      temperature: point.tavg ?? (point.tmin != null && point.tmax != null
        ? (point.tmin + point.tmax) / 2
        : null),
      tmin: point.tmin,
      tmax: point.tmax,
    }));
  }, [data, granularity]);

  if (!chartData.length) {
    return <EmptyChart title="Température" message="Aucune donnée disponible." />;
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ margin: 0 }}>Température</h3>
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={Math.max(Math.floor(chartData.length / 12), 0)} />
            <YAxis tick={{ fontSize: 12 }} unit="°C" domain={['auto', 'auto']} />
            <Tooltip formatter={(value) => `${formatNumber(Number(value), 1)} °C`} />
            <Legend />
            <Line type="monotone" dataKey="temperature" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Température" />
            {granularity === 'daily' ? (
              <>
                <Line type="monotone" dataKey="tmin" stroke="#38bdf8" strokeWidth={1} dot={false} name="Min" />
                <Line type="monotone" dataKey="tmax" stroke="#ef4444" strokeWidth={1} dot={false} name="Max" />
              </>
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function PrecipitationChart({ data, granularity }: { data: WeatherSeries | null; granularity: WeatherGranularity }) {
  const chartData = useMemo(() => {
    if (!data) return [];
    if (granularity === 'hourly') {
      return (data.hourly ?? []).map((point) => ({
        label: new Date(point.time).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          day: '2-digit',
          month: 'short',
        }),
        precipitation: point.tp,
      }));
    }
    return (data.daily ?? []).map((point) => ({ label: point.date, precipitation: point.prcp }));
  }, [data, granularity]);

  if (!chartData.length) {
    return <EmptyChart title="Précipitations" message="Aucune donnée disponible." />;
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ margin: 0 }}>Précipitations</h3>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={Math.max(Math.floor(chartData.length / 12), 0)} />
            <YAxis tick={{ fontSize: 12 }} unit="mm" domain={[0, 'auto']} />
            <Tooltip formatter={(value) => `${formatNumber(Number(value), 1)} mm`} />
            <Bar dataKey="precipitation" fill="#6366f1" radius={[4, 4, 0, 0]} name="Précipitation" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function WindChart({ data, granularity }: { data: WeatherSeries | null; granularity: WeatherGranularity }) {
  const chartData = useMemo(() => {
    if (!data) return [];
    if (granularity === 'hourly') {
      return (data.hourly ?? []).map((point) => ({
        label: new Date(point.time).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          day: '2-digit',
          month: 'short',
        }),
        wind: point.ws,
      }));
    }
    return (data.daily ?? []).map((point) => ({ label: point.date, wind: point.ws_avg ?? null }));
  }, [data, granularity]);

  if (!chartData.length) {
    return <EmptyChart title="Vent" message="Aucune donnée disponible." />;
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ margin: 0 }}>Vent</h3>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={Math.max(Math.floor(chartData.length / 12), 0)} />
            <YAxis tick={{ fontSize: 12 }} unit="m/s" domain={[0, 'auto']} />
            <Tooltip formatter={(value) => `${formatNumber(Number(value), 1)} m/s`} />
            <Line type="monotone" dataKey="wind" stroke="#10b981" strokeWidth={2} dot={false} name="Vent" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function EmptyChart({ title, message }: { title: string; message: string }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      <div
        style={{
          minHeight: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px dashed #cbd5f5',
          borderRadius: 12,
          color: '#64748b',
          fontSize: 14,
        }}
      >
        {message}
      </div>
    </section>
  );
}

export default function WeatherModal({ open, onClose, centroid, parcelLabel, onOpenSummary }: WeatherModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [linkToParcel, setLinkToParcel] = useState<boolean>(Boolean(centroid));
  const [form, setForm] = useState<FormState>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);
    return {
      lat: centroid?.latitude ? centroid.latitude.toFixed(6) : '',
      lon: centroid?.longitude ? centroid.longitude.toFixed(6) : '',
      start: formatDateInput(start),
      end: formatDateInput(end),
      granularity: 'daily',
      provider: 'auto',
      stationId: '',
    };
  });
  const [fetchState, setFetchState] = useState<FetchState>({ loading: false, error: null, data: null });
  const [stationState, setStationState] = useState<{
    loading: boolean;
    error: string | null;
    label: string | null;
  }>({ loading: false, error: null, label: null });
  const hourlyRows = useMemo(() => buildHourlyRows(fetchState.data), [fetchState.data]);
  const dailyRows = useMemo(() => buildDailyRows(fetchState.data), [fetchState.data]);

  useEffect(() => {
    if (!open) return;
    if (!containerRef.current) {
      const el = document.createElement('div');
      document.body.appendChild(el);
      containerRef.current = el;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      abortRef.current?.abort();
    };
  }, [open, onClose]);

  useEffect(
    () => () => {
      if (containerRef.current && containerRef.current.parentNode) {
        containerRef.current.parentNode.removeChild(containerRef.current);
        containerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    if (!centroid || !linkToParcel) return;
    setForm((prev) => ({
      ...prev,
      lat: centroid.latitude.toFixed(6),
      lon: centroid.longitude.toFixed(6),
    }));
  }, [centroid, linkToParcel, open]);

  const handleInputChange = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleToggleLink = useCallback(() => {
    setLinkToParcel((prev) => !prev);
  }, []);

  const handleSuggestStation = useCallback(async () => {
    const provider = form.provider === 'auto' ? 'infoclimat' : form.provider;
    if (!form.lat || !form.lon) {
      setStationState({ loading: false, error: 'Veuillez saisir des coordonnées.', label: null });
      return;
    }
    const lat = Number(form.lat);
    const lon = Number(form.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setStationState({ loading: false, error: 'Coordonnées invalides.', label: null });
      return;
    }
    setStationState({ loading: true, error: null, label: null });
    try {
      const station = await findNearestStation({ provider, lat, lon });
      if (!station) {
        setStationState({ loading: false, error: 'Aucune station trouvée à proximité.', label: null });
        return;
      }
      setForm((prev) => ({ ...prev, stationId: station.id }));
      const label = station.name
        ? `${station.name} (${station.id})`
        : `Station ${station.id}`;
      setStationState({
        loading: false,
        error: null,
        label: `${label}${station.distanceKm != null ? ` – ${station.distanceKm.toFixed(1)} km` : ''}`,
      });
    } catch (error) {
      setStationState({
        loading: false,
        error: (error as Error).message || 'Impossible de suggérer une station.',
        label: null,
      });
    }
  }, [form.lat, form.lon, form.provider]);

  const handleLoad = useCallback(async () => {
    const lat = Number(form.lat);
    const lon = Number(form.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setFetchState({ loading: false, error: 'Coordonnées invalides.', data: null });
      return;
    }
    if (!form.start || !form.end) {
      setFetchState({ loading: false, error: 'Veuillez renseigner la période.', data: null });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFetchState({ loading: true, error: null, data: null });
    try {
      const series = await getWeather({
        lat,
        lon,
        start: form.start,
        end: form.end,
        granularity: form.granularity,
        provider: form.provider,
        stationId: form.stationId.trim() || undefined,
        signal: controller.signal,
      });
      setFetchState({ loading: false, error: null, data: series });
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return;
      setFetchState({ loading: false, error: (error as Error).message || 'Erreur inconnue.', data: null });
    }
  }, [form.end, form.granularity, form.lat, form.lon, form.provider, form.start, form.stationId]);

  const handleSummaryNavigation = useCallback(() => {
    if (onOpenSummary) {
      onOpenSummary();
    }
  }, [onOpenSummary]);

  if (!open) {
    return null;
  }

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 40px 90px rgba(15,23,42,0.25)',
          width: 'min(1080px, 100%)',
          maxHeight: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          style={{
            padding: '20px 28px 16px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20 }}>Météo historique</h2>
              {parcelLabel ? (
                <p style={{ margin: '4px 0 0', color: '#475569', fontSize: 14 }}>Parcelle : {parcelLabel}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: 'none',
                background: '#e2e8f0',
                borderRadius: 999,
                width: 36,
                height: 36,
                fontSize: 16,
                cursor: 'pointer',
              }}
              aria-label="Fermer"
            >
              ×
            </button>
          </div>
          <nav style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              disabled
              style={{
                padding: '10px 18px',
                borderRadius: 999,
                border: 'none',
                background: '#0ea5e9',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'default',
                opacity: 1,
              }}
              aria-current="page"
            >
              Historique météo
            </button>
            <button
              type="button"
              onClick={handleSummaryNavigation}
              style={{
                padding: '10px 18px',
                borderRadius: 999,
                border: '1px solid #e2e8f0',
                background: '#fff',
                color: '#0f172a',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Synthèse météo
            </button>
          </nav>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '320px 1fr',
            gap: 0,
            minHeight: 0,
            flex: 1,
            maxHeight: '100%',
            height: '100%',
          }}
        >
          <aside
            style={{
              borderRight: '1px solid #e2e8f0',
              padding: '24px 24px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              overflowY: 'auto',
              maxHeight: '100%',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 13, color: '#1e293b', display: 'flex', flexDirection: 'column', gap: 6 }}>
                Latitude
                <input
                  type="number"
                  step="0.000001"
                  value={form.lat}
                  onChange={(event) => handleInputChange('lat', event.target.value)}
                  onFocus={() => setLinkToParcel(false)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #cbd5f5',
                  }}
                />
              </label>
              <label style={{ fontSize: 13, color: '#1e293b', display: 'flex', flexDirection: 'column', gap: 6 }}>
                Longitude
                <input
                  type="number"
                  step="0.000001"
                  value={form.lon}
                  onChange={(event) => handleInputChange('lon', event.target.value)}
                  onFocus={() => setLinkToParcel(false)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #cbd5f5',
                  }}
                />
              </label>
              <button
                type="button"
                onClick={handleToggleLink}
                disabled={!centroid}
                style={{
                  alignSelf: 'flex-start',
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: linkToParcel ? '1px solid #0ea5e9' : '1px solid #cbd5f5',
                  background: linkToParcel ? '#0ea5e9' : '#f8fafc',
                  color: linkToParcel ? '#fff' : '#0f172a',
                  fontSize: 12,
                  cursor: centroid ? 'pointer' : 'not-allowed',
                }}
              >
                {linkToParcel ? 'Dissocier de la parcelle' : 'Lier à la parcelle'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 13, color: '#1e293b', display: 'flex', flexDirection: 'column', gap: 6 }}>
                Date de début
                <input
                  type="date"
                  value={form.start}
                  onChange={(event) => handleInputChange('start', event.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5f5' }}
                />
              </label>
              <label style={{ fontSize: 13, color: '#1e293b', display: 'flex', flexDirection: 'column', gap: 6 }}>
                Date de fin
                <input
                  type="date"
                  value={form.end}
                  onChange={(event) => handleInputChange('end', event.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5f5' }}
                />
              </label>
            </div>

            <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <legend style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Granularité</legend>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#0f172a' }}>
                <input
                  type="radio"
                  name="granularity"
                  value="daily"
                  checked={form.granularity === 'daily'}
                  onChange={() => handleInputChange('granularity', 'daily')}
                />
                Journalier
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#0f172a' }}>
                <input
                  type="radio"
                  name="granularity"
                  value="hourly"
                  checked={form.granularity === 'hourly'}
                  onChange={() => handleInputChange('granularity', 'hourly')}
                />
                Horaire
              </label>
            </fieldset>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#1e293b' }}>
              Fournisseur
              <select
                value={form.provider}
                onChange={(event) => handleInputChange('provider', event.target.value as WeatherProvider | 'auto')}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5f5' }}
              >
                {Object.entries(PROVIDER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#1e293b' }}>
              Station (optionnel)
              <input
                type="text"
                value={form.stationId}
                onChange={(event) => handleInputChange('stationId', event.target.value)}
                placeholder="Identifiant station"
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5f5' }}
              />
            </label>
            <button
              type="button"
              onClick={handleSuggestStation}
              disabled={stationState.loading}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid #cbd5f5',
                background: '#f8fafc',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {stationState.loading ? 'Recherche station…' : 'Trouver la station la plus proche'}
            </button>
            {stationState.error ? (
              <p style={{ margin: 0, color: '#ef4444', fontSize: 12 }}>{stationState.error}</p>
            ) : null}
            {stationState.label ? (
              <p style={{ margin: 0, color: '#0f172a', fontSize: 12 }}>{stationState.label}</p>
            ) : null}

            <button
              type="button"
              onClick={handleLoad}
              disabled={fetchState.loading}
              style={{
                marginTop: 8,
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #38bdf8',
                background: '#0ea5e9',
                color: '#fff',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                boxShadow: '0 12px 30px rgba(14,165,233,0.25)',
              }}
            >
              {fetchState.loading ? 'Chargement…' : 'Charger l’historique'}
            </button>

            <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
              Respect des licences : l’attribution du fournisseur choisi est affichée avec les données.
            </p>
          </aside>

          <main style={{ padding: '24px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {fetchState.error ? (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 12,
                  background: '#fee2e2',
                  color: '#b91c1c',
                  fontSize: 14,
                }}
              >
                {fetchState.error}
              </div>
            ) : null}

            {fetchState.data ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                  <span
                    style={{
                      background: '#f1f5f9',
                      padding: '6px 10px',
                      borderRadius: 999,
                      fontSize: 12,
                      color: '#0f172a',
                    }}
                  >
                    Fournisseur actif : {fetchState.data.meta.provider}
                  </span>
                  {fetchState.data.meta.stationName || fetchState.data.meta.stationId ? (
                    <span style={{ fontSize: 12, color: '#334155' }}>
                      Station : {fetchState.data.meta.stationName || 'N/A'}{' '}
                      {fetchState.data.meta.stationId ? `(${fetchState.data.meta.stationId})` : ''}
                    </span>
                  ) : null}
                  <span
                    style={{
                      background: '#0ea5e9',
                      color: '#fff',
                      padding: '6px 10px',
                      borderRadius: 999,
                      fontSize: 12,
                    }}
                  >
                    Données © {fetchState.data.meta.attribution ?? fetchState.data.meta.provider}
                  </span>
                </div>

                <TemperatureChart data={fetchState.data} granularity={form.granularity} />
                <PrecipitationChart data={fetchState.data} granularity={form.granularity} />
                <WindChart data={fetchState.data} granularity={form.granularity} />

                <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <h3 style={{ margin: 0 }}>{form.granularity === 'hourly' ? 'Données horaires' : 'Données journalières'}</h3>
                  <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                        <tr>
                          {form.granularity === 'hourly' ? (
                            <>
                              <th style={thStyle}>Heure</th>
                              <th style={thStyle}>Température (°C)</th>
                              <th style={thStyle}>Précip. (mm)</th>
                              <th style={thStyle}>Vent (m/s)</th>
                              <th style={thStyle}>Dir (°)</th>
                              <th style={thStyle}>Humidité (%)</th>
                              <th style={thStyle}>Pression (hPa)</th>
                              <th style={thStyle}>Radiation (W/m²)</th>
                            </>
                          ) : (
                            <>
                              <th style={thStyle}>Date</th>
                              <th style={thStyle}>T. min (°C)</th>
                              <th style={thStyle}>T. max (°C)</th>
                              <th style={thStyle}>T. moy (°C)</th>
                              <th style={thStyle}>Précip. (mm)</th>
                              <th style={thStyle}>Vent moy (m/s)</th>
                              <th style={thStyle}>Humidité (%)</th>
                              <th style={thStyle}>Pression (hPa)</th>
                              <th style={thStyle}>Ensoleillement (h)</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {form.granularity === 'hourly'
                          ? hourlyRows.map((row) => (
                              <tr key={row.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={tdStyle}>{row.time}</td>
                                <td style={tdStyle}>{formatNumber(row.temperature, 1)}</td>
                                <td style={tdStyle}>{formatNumber(row.precipitation, 2)}</td>
                                <td style={tdStyle}>{formatNumber(row.wind, 1)}</td>
                                <td style={tdStyle}>{row.direction != null ? row.direction.toFixed(0) : '—'}</td>
                                <td style={tdStyle}>{row.humidity != null ? row.humidity.toFixed(0) : '—'}</td>
                                <td style={tdStyle}>{row.pressure != null ? row.pressure.toFixed(1) : '—'}</td>
                                <td style={tdStyle}>{row.radiation != null ? row.radiation.toFixed(1) : '—'}</td>
                              </tr>
                            ))
                          : dailyRows.map((row) => (
                              <tr key={row.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={tdStyle}>{row.date}</td>
                                <td style={tdStyle}>{formatNumber(row.tmin, 1)}</td>
                                <td style={tdStyle}>{formatNumber(row.tmax, 1)}</td>
                                <td style={tdStyle}>{formatNumber(row.tavg, 1)}</td>
                                <td style={tdStyle}>{formatNumber(row.prcp, 2)}</td>
                                <td style={tdStyle}>{row.wind != null ? row.wind.toFixed(1) : '—'}</td>
                                <td style={tdStyle}>{row.humidity != null ? row.humidity.toFixed(0) : '—'}</td>
                                <td style={tdStyle}>{row.pressure != null ? row.pressure.toFixed(1) : '—'}</td>
                                <td style={tdStyle}>{row.sunshine != null ? row.sunshine.toFixed(1) : '—'}</td>
                              </tr>
                            ))}
                        {form.granularity === 'hourly'
                          ? !hourlyRows.length && (
                              <tr>
                                <td colSpan={8} style={{ ...tdStyle, textAlign: 'center' }}>
                                  Aucune donnée disponible pour la plage sélectionnée.
                                </td>
                              </tr>
                            )
                          : !dailyRows.length && (
                              <tr>
                                <td colSpan={9} style={{ ...tdStyle, textAlign: 'center' }}>
                                  Aucune donnée disponible pour la plage sélectionnée.
                                </td>
                              </tr>
                            )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94a3b8',
                  fontSize: 14,
                  textAlign: 'center',
                }}
              >
                {fetchState.loading
                  ? 'Chargement des données météo…'
                  : 'Renseignez les paramètres puis cliquez sur « Charger l’historique ».'}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );

  return containerRef.current ? createPortal(content, containerRef.current) : content;
}

const thStyle: CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 600,
  color: '#0f172a',
  borderBottom: '1px solid #e2e8f0',
  position: 'sticky',
  top: 0,
};

const tdStyle: CSSProperties = {
  padding: '8px 12px',
  color: '#1f2937',
  fontSize: 12,
};
