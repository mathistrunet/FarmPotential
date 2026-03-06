import { DEFAULT_DEPTHS, DEFAULT_PROPERTIES } from "../../src/services/soilgrids.js";

const BASE_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query";

export class SoilGridsError extends Error {
  constructor(message, { statusCode = 500, code = "SOILGRIDS_INTERNAL_ERROR", cause } = {}) {
    super(message, { cause });
    this.name = "SoilGridsError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function fetchSoilGrids(lat, lon, {
  depths = DEFAULT_DEPTHS,
  properties = DEFAULT_PROPERTIES,
  timeoutMs = 15_000,
} = {}) {
  const searchParams = new URLSearchParams({ lat: String(lat), lon: String(lon), value: "mean" });
  properties.forEach((property) => searchParams.append("property", property));
  depths.forEach((depth) => searchParams.append("depth", depth));
  const url = `${BASE_URL}?${searchParams.toString()}`;

  const controller = new AbortController();
  const startedAt = Date.now();
  console.log("SoilGrids request started");
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const duration = Date.now() - startedAt;
    console.log("SoilGrids response time:", duration);

    if (!response.ok) {
      throw new SoilGridsError(`[SOILGRIDS_HTTP_${response.status}] Échec API SoilGrids.`, {
        statusCode: 502,
        code: "SOILGRIDS_UPSTREAM_ERROR",
      });
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new SoilGridsError("[SOILGRIDS_INVALID_JSON] Réponse SoilGrids invalide.", {
        statusCode: 502,
        code: "SOILGRIDS_INVALID_JSON",
        cause: error,
      });
    }

    return {
      payload,
      meta: {
        durationMs: duration,
        status: response.status,
        bytes: JSON.stringify(payload).length,
      },
    };
  } catch (error) {
    const duration = Date.now() - startedAt;
    console.log("SoilGrids response time:", duration);
    if (error?.name === "AbortError") {
      throw new SoilGridsError("[SOILGRIDS_TIMEOUT] Timeout SoilGrids dépassé.", {
        statusCode: 504,
        code: "SOILGRIDS_TIMEOUT",
        cause: error,
      });
    }
    if (error instanceof SoilGridsError) {
      throw error;
    }
    throw new SoilGridsError(error?.message || "Erreur interne SoilGrids.", {
      statusCode: 500,
      code: "SOILGRIDS_INTERNAL_ERROR",
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export class SoilGridsClient {
  constructor({ timeoutMs = 15_000, retries = 2 } = {}) {
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.failures = 0;
    this.openUntil = 0;
  }

  async query({ lat, lon, depths = DEFAULT_DEPTHS, properties = DEFAULT_PROPERTIES }) {
    if (Date.now() < this.openUntil) {
      throw new Error("[SOILGRIDS_CIRCUIT_OPEN] Circuit breaker actif (5 min).");
    }

    let lastError = null;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        const result = await fetchSoilGrids(lat, lon, { depths, properties, timeoutMs: this.timeoutMs });
        this.failures = 0;
        return result;
      } catch (error) {
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
