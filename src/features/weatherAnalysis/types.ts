export interface Probability {
  probability: number | null;
  sampleSize: number;
  occurrences: number;
}

export interface SeriesStatistics {
  mean: number | null;
  stdev: number | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
}

export interface HeatwaveStats {
  events: number;
  totalDays: number;
  longest: number;
}

export interface YearIndicators {
  year: number;
  gdd: Record<string, number>;
  hdd: Record<string, number>;
  freezeDays: {
    le0: number;
    leMinus2: number;
    leMinus4: number;
  };
  heatDays: {
    ge30: number;
    ge32: number;
    ge35: number;
  };
  heatwaves: Record<string, HeatwaveStats>;
  rainfall: {
    total: number;
    dryDays: number;
    maxDrySpell: number;
    heavyRainDays: Record<string, number>;
    values: number[];
  };
  wind: {
    meanDays: Record<string, number>;
    gustDays: Record<string, number>;
  };
  freezeEvents: {
    lastSpringFreezeDoy: number | null;
    firstAutumnFreezeDoy: number | null;
  };
}

export interface AggregatedIndicators {
  years: YearIndicators[];
  stats: {
    gdd: Record<string, SeriesStatistics>;
    hdd: Record<string, SeriesStatistics>;
    rainfallTotal: SeriesStatistics;
    dryDays: SeriesStatistics;
    maxDrySpell: SeriesStatistics;
    heavyRainDays: Record<string, SeriesStatistics>;
    freezeDays: {
      le0: SeriesStatistics;
      leMinus2: SeriesStatistics;
      leMinus4: SeriesStatistics;
    };
    heatDays: {
      ge30: SeriesStatistics;
      ge32: SeriesStatistics;
      ge35: SeriesStatistics;
    };
    windMeanDays: Record<string, SeriesStatistics>;
    windGustDays: Record<string, SeriesStatistics>;
  };
}

export interface TrendSummary {
  direction: '↑' | '→' | '↓';
  ols: {
    slope: number;
    intercept: number;
    r2: number;
  } | null;
  mannKendall: {
    tau: number;
    pValue: number;
  } | null;
}

export interface StationSummary {
  id: string;
  name: string;
  lat: number;
  lon: number;
  altitude: number | null;
  type: string | null;
  distanceKm?: number;
}

export interface WeatherAnalysisResponse {
  crop: string;
  phase: {
    startDayOfYear: number;
    endDayOfYear: number;
  };
  yearsAnalyzed: number;
  stationsUsed: StationSummary[];
  indicators: AggregatedIndicators;
  risks: {
    heatwave?: Probability;
    drySpell?: Probability;
    extremeHeat?: Probability;
    lateFrost?: Probability;
  };
  rainfallQuantiles: {
    p10: number | null;
    p50: number | null;
    p90: number | null;
  };
  trends: {
    rainfall: TrendSummary;
    gdd: TrendSummary;
  };
  confidence: number;
  source: string;
}
