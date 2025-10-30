import { z } from 'zod';

export const AnalyzeWeatherSchema = z.object({
    lat: z.coerce.number().optional(),
    lon: z.coerce.number().optional(),
    station: z.string().optional(),
    dateStart: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/),
    dateEnd: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/),
    source: z
        .enum(['Infoclimat (Open Data)', 'MeteoFrance', 'OpenWeather'])
        .default('Infoclimat (Open Data)'),
});

export const WeatherAnalysisInputSchema = z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    crop: z.string().min(1),
    phase: z.object({
        startDayOfYear: z.number().int().min(1).max(366),
        endDayOfYear: z.number().int().min(1).max(366),
    }),
    yearsBack: z.number().int().min(1).max(50).default(5),
});
const HeatwaveStatsSchema = z.object({
    events: z.number(),
    totalDays: z.number(),
    longest: z.number(),
});
const SeriesStatisticsSchema = z.object({
    mean: z.number().nullable(),
    stdev: z.number().nullable(),
    p10: z.number().nullable(),
    p50: z.number().nullable(),
    p90: z.number().nullable(),
});
const YearIndicatorsSchema = z.object({
    year: z.number().int(),
    gdd: z.record(z.string(), z.number()),
    hdd: z.record(z.string(), z.number()),
    freezeDays: z.object({
        le0: z.number(),
        leMinus2: z.number(),
        leMinus4: z.number(),
    }),
    heatDays: z.object({
        ge30: z.number(),
        ge32: z.number(),
        ge35: z.number(),
    }),
    heatwaves: z.record(z.string(), HeatwaveStatsSchema),
    rainfall: z.object({
        total: z.number(),
        dryDays: z.number(),
        maxDrySpell: z.number(),
        heavyRainDays: z.record(z.string(), z.number()),
        values: z.array(z.number()),
    }),
    wind: z.object({
        meanDays: z.record(z.string(), z.number()),
        gustDays: z.record(z.string(), z.number()),
    }),
    freezeEvents: z.object({
        lastSpringFreezeDoy: z.number().nullable(),
        firstAutumnFreezeDoy: z.number().nullable(),
    }),
});
const AggregatedIndicatorsSchema = z.object({
    years: z.array(YearIndicatorsSchema),
    stats: z.object({
        gdd: z.record(z.string(), SeriesStatisticsSchema),
        hdd: z.record(z.string(), SeriesStatisticsSchema),
        rainfallTotal: SeriesStatisticsSchema,
        dryDays: SeriesStatisticsSchema,
        maxDrySpell: SeriesStatisticsSchema,
        heavyRainDays: z.record(z.string(), SeriesStatisticsSchema),
        freezeDays: z.object({
            le0: SeriesStatisticsSchema,
            leMinus2: SeriesStatisticsSchema,
            leMinus4: SeriesStatisticsSchema,
        }),
        heatDays: z.object({
            ge30: SeriesStatisticsSchema,
            ge32: SeriesStatisticsSchema,
            ge35: SeriesStatisticsSchema,
        }),
        windMeanDays: z.record(z.string(), SeriesStatisticsSchema),
        windGustDays: z.record(z.string(), SeriesStatisticsSchema),
    }),
});
const ProbabilitySchema = z.object({
    probability: z.number().min(0).max(1).nullable(),
    sampleSize: z.number().int().nonnegative(),
    occurrences: z.number().int().nonnegative(),
});
const TrendSchema = z.object({
    slope: z.number(),
    intercept: z.number(),
    r2: z.number(),
});
const MannKendallSchema = z.object({
    tau: z.number(),
    pValue: z.number(),
});
const TrendSummarySchema = z.object({
    direction: z.enum(['↑', '→', '↓']),
    ols: TrendSchema.nullable(),
    mannKendall: MannKendallSchema.nullable(),
});
const StationSchema = z.object({
    id: z.string(),
    name: z.string(),
    city: z.string().nullable().optional(),
    lat: z.number(),
    lon: z.number(),
    altitude: z.number().nullable(),
    type: z.string().nullable(),
    distanceKm: z.number().optional(),
});
export const WeatherAnalysisResponseSchema = z.object({
    crop: z.string(),
    phase: WeatherAnalysisInputSchema.shape.phase,
    yearsAnalyzed: z.number().int().nonnegative(),
    stationsUsed: z.array(StationSchema),
    indicators: AggregatedIndicatorsSchema,
    risks: z.object({
        heatwave: ProbabilitySchema.optional(),
        drySpell: ProbabilitySchema.optional(),
        extremeHeat: ProbabilitySchema.optional(),
        lateFrost: ProbabilitySchema.optional(),
    }),
    rainfallQuantiles: z.object({
        p10: z.number().nullable(),
        p50: z.number().nullable(),
        p90: z.number().nullable(),
    }),
    trends: z.object({
        rainfall: TrendSummarySchema,
        gdd: TrendSummarySchema,
    }),
    confidence: z.number().min(0).max(1),
    source: z.literal('Infoclimat (Open Data)'),
});
