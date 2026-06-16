import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";

export class SoilGridsCacheRepository {
  constructor({ dataDir, ttlDays = 30, fileName = "parcel-soilgrids-cache.json" }) {
    this.file = path.join(dataDir, fileName);
    this.ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    // Chaîne de sérialisation des écritures : sous remplissage parallèle, plusieurs upsert
    // peuvent se déclencher en même temps ; on les exécute l'un après l'autre pour éviter les
    // pertes d'entrées (read-modify-write concurrents).
    this.writeChain = Promise.resolve();
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
    // Écriture atomique (temp + rename) : un lecteur concurrent ne voit jamais un fichier
    // partiellement écrit (sinon JSON.parse échoue).
    const tmp = `${this.file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tmp, JSON.stringify({ entries }, null, 2));
    await rename(tmp, this.file);
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
    // Maillon sérialisé : lit l'état le plus récent, remplace l'entrée de la parcelle, réécrit.
    // Le `.then(run, run)` enchaîne quel que soit le sort du maillon précédent.
    const run = async () => {
      const entries = await this.read();
      const next = entries.filter((item) => item.parcel_id !== entry.parcel_id);
      next.push(entry);
      await this.write(next);
    };
    this.writeChain = this.writeChain.then(run, run);
    await this.writeChain;
    return entry;
  }
}
