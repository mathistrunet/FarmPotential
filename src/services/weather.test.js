import { describe, expect, it } from "vitest";

import { aggregateWeatherDataset } from "./weather";

describe("aggregateWeatherDataset", () => {
  it("calcule les moyennes journalières et mensuelles", () => {
    const raw = {
      hourly: {
        time: [
          "2024-04-01T06:00:00Z",
          "2024-04-01T18:00:00Z",
          "2024-04-01T22:00:00Z",
        ],
        temperature_2m: [12, 14, 8],
        relativehumidity_2m: [70, 60, 80],
        windspeed_10m: [5, 7, 3],
      },
      daily: {
        time: ["2024-04-01", "2024-04-02"],
        precipitation_sum: [2, 0],
      },
      timezone: "UTC",
      latitude: 45.0,
      longitude: 3.0,
      elevation: 320,
    };

    const result = aggregateWeatherDataset(raw, {
      startDate: "2024-04-01",
      endDate: "2024-04-02",
    });

    expect(result.summary.avgDayTemp).toBeCloseTo(12);
    expect(result.summary.avgNightTemp).toBeCloseTo(11);
    expect(result.summary.avgHumidity).toBeCloseTo(70);
    expect(result.summary.avgWindSpeed).toBeCloseTo(5);
    expect(result.summary.totalPrecipitation).toBeCloseTo(2);
    expect(result.summary.precipitationDayCount).toBe(2);

    expect(result.metadata.timezone).toBe("UTC");
    expect(result.metadata.latitude).toBe(45);
    expect(result.metadata.longitude).toBe(3);

    expect(result.monthly).toHaveLength(1);
    const april = result.monthly[0];
    expect(april.label).toBe("Avril");
    expect(april.avgDayTemp).toBeCloseTo(12);
    expect(april.avgNightTemp).toBeCloseTo(11);
    expect(april.totalPrecipitation).toBeCloseTo(2);
    expect(april.precipitationDayCount).toBe(2);
  });
});
