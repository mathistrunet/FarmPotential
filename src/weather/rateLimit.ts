import type { ProviderRateLimitConfig, WeatherProvider } from './types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class TokenBucketRateLimiter {
  private tokens: number;

  private lastRefill: number;

  constructor(private readonly config: ProviderRateLimitConfig) {
    this.tokens = config.bucketSize;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    const tokensToAdd = (elapsed / this.config.intervalMs) * this.config.tokensPerInterval;
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.config.bucketSize, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Operation aborted', 'AbortError');
      }
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitTime = this.config.intervalMs / Math.max(this.config.tokensPerInterval, 1);
      await sleep(waitTime);
    }
  }

  async schedule<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await task();
    } catch (error) {
      this.tokens = Math.min(this.tokens + 1, this.config.bucketSize);
      throw error;
    }
  }
}

const DEFAULTS: Record<WeatherProvider, ProviderRateLimitConfig> = {
  'infoclimat': { tokensPerInterval: 5, intervalMs: 1000, bucketSize: 10 },
  'meteostat': { tokensPerInterval: 3, intervalMs: 1000, bucketSize: 6 },
  'open-meteo': { tokensPerInterval: 10, intervalMs: 1000, bucketSize: 20 },
};

const limiters = new Map<WeatherProvider, TokenBucketRateLimiter>();

export function getRateLimiter(provider: WeatherProvider): TokenBucketRateLimiter {
  const existing = limiters.get(provider);
  if (existing) return existing;
  const limiter = new TokenBucketRateLimiter(DEFAULTS[provider]);
  limiters.set(provider, limiter);
  return limiter;
}
