import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WeatherAnalysisResponse } from './types';

export interface WeatherAnalysisParams {
  lat: number;
  lon: number;
  crop: string;
  phaseStart: number;
  phaseEnd: number;
  yearsBack?: number;
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
    search.set('lat', params.lat.toString());
    search.set('lon', params.lon.toString());
    search.set('crop', params.crop);
    search.set('phaseStart', params.phaseStart.toString());
    search.set('phaseEnd', params.phaseEnd.toString());
    if (params.yearsBack) {
      search.set('yearsBack', params.yearsBack.toString());
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
