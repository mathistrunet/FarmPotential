import { DEFAULT_DEPTHS, DEFAULT_PROPERTIES } from "../../src/services/soilgrids.js";

const BASE_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query";

export class SoilGridsClient {
  constructor({ timeoutMs = 10_000, retries = 2 } = {}) {
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.failures = 0;
    this.openUntil = 0;
  }

  async query({ lat, lon, depths = DEFAULT_DEPTHS, properties = DEFAULT_PROPERTIES }) {
    if (Date.now() < this.openUntil) {
      throw new Error("[SOILGRIDS_CIRCUIT_OPEN] Circuit breaker actif (5 min).");
    }

    const searchParams = new URLSearchParams({ lat: String(lat), lon: String(lon), value: "mean" });
    properties.forEach((property) => searchParams.append("property", property));
    depths.forEach((depth) => searchParams.append("depth", depth));
    const url = `${BASE_URL}?${searchParams.toString()}`;

    let lastError = null;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const startedAt = Date.now();
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok) {
          throw new Error(`[SOILGRIDS_HTTP_${response.status}] Échec API SoilGrids.`);
        }
        const payload = await response.json();
        this.failures = 0;
        return {
          payload,
          meta: {
            durationMs: Date.now() - startedAt,
            status: response.status,
            bytes: JSON.stringify(payload).length,
          },
        };
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;
      }
    }

    this.failures += 1;
    if (this.failures >= 5) {
      this.openUntil = Date.now() + 5 * 60 * 1000;
      this.failures = 0;
    }
    throw lastError;
  }
}
