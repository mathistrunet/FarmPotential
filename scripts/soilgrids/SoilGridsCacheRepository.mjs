import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export class SoilGridsCacheRepository {
  constructor({ dataDir, ttlDays = 30 }) {
    this.file = path.join(dataDir, "parcel-soilgrids-cache.json");
    this.ttlMs = ttlDays * 24 * 60 * 60 * 1000;
  }

  async ensure() {
    await mkdir(path.dirname(this.file), { recursive: true });
    try {
      await readFile(this.file, "utf-8");
    } catch {
      await writeFile(this.file, JSON.stringify({ entries: [] }, null, 2));
    }
  }

  async read() {
    await this.ensure();
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf-8"));
      return Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch {
      return [];
    }
  }

  async write(entries) {
    await this.ensure();
    await writeFile(this.file, JSON.stringify({ entries }, null, 2));
  }

  async getByParcel(parcelId) {
    const entries = await this.read();
    const now = Date.now();
    return entries.find((entry) => entry.parcel_id === parcelId && now - new Date(entry.fetched_at).getTime() <= this.ttlMs);
  }

  async getByCacheKey(cacheKey) {
    const entries = await this.read();
    const now = Date.now();
    return entries.find((entry) => entry.cache_key === cacheKey && now - new Date(entry.fetched_at).getTime() <= this.ttlMs);
  }

  async upsert(entry) {
    const entries = await this.read();
    const next = entries.filter((item) => item.parcel_id !== entry.parcel_id);
    next.push(entry);
    await this.write(next);
    return entry;
  }
}
