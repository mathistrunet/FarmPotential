import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WeatherAnalysisResponse } from './types';

export interface WeatherAnalysisParams {
  station?: string;
  lat?: number;
  lon?: number;
  dateStart: string;
  dateEnd: string;
  source?: string;
}

interface State {
  data: WeatherAnalysisResponse | null;
  loading: boolean;
  error: string | null;
}

export function useWeatherAnalysis(params: WeatherAnalysisParams | null) {
  const [state, setState] = useState<State>({ data: null, loading: false, error: null });
  const abortRef = useRef<AbortController | null>(null);

  const queryString = useMemo(() => {
    if (!params) return null;
    const search = new URLSearchParams();
    if (params.station) {
      search.set('station', params.station);
    }
    if (params.lat != null) {
      search.set('lat', params.lat.toString());
    }
    if (params.lon != null) {
      search.set('lon', params.lon.toString());
    }
    search.set('dateStart', params.dateStart);
    search.set('dateEnd', params.dateEnd);
    if (params.source) {
      search.set('source', params.source);
    }
    return search.toString();
  }, [params]);

  const fetchData = useCallback(async () => {
    if (!queryString) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const response = await fetch(`/api/weather/analyze?${queryString}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Analyse météo indisponible (statut ${response.status})`);
      }
      const json = (await response.json()) as WeatherAnalysisResponse;
      setState({ data: json, loading: false, error: null });
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return;
      setState({ data: null, loading: false, error: (error as Error).message || 'Erreur inconnue' });
    }
  }, [queryString]);

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

export default useWeatherAnalysis;
