import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StationAvailabilityResponse } from './types';

interface State {
  data: StationAvailabilityResponse | null;
  loading: boolean;
  error: string | null;
}

export default function useStationAvailability(
  lat: number | null | undefined,
  lon: number | null | undefined,
  maxYears: number,
) {
  const [state, setState] = useState<State>({ data: null, loading: false, error: null });
  const abortRef = useRef<AbortController | null>(null);

  const query = useMemo(() => {
    if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) {
      return null;
    }
    const params = new URLSearchParams();
    params.set('lat', lat.toString());
    params.set('lon', lon.toString());
    params.set('maxYears', Math.max(1, Math.round(maxYears)).toString());
    return params.toString();
  }, [lat, lon, maxYears]);

  const fetchData = useCallback(async () => {
    if (!query) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ data: null, loading: true, error: null });

    try {
      const response = await fetch(`/api/weather/availability?${query}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Disponibilité des données indisponible (statut ${response.status})`);
      }
      const json = (await response.json()) as StationAvailabilityResponse;
      setState({ data: json, loading: false, error: null });
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') {
        return;
      }
      setState({
        data: null,
        loading: false,
        error: (error as Error).message || 'Erreur inconnue',
      });
    }
  }, [query]);

  useEffect(() => {
    fetchData();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchData]);

  return {
    ...state,
    refetch: fetchData,
  };
}
