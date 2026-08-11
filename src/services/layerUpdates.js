// Mises à jour des couches cartographiques.
//
// Le serveur local compare ce qui est publié dans les Releases à ce qui est
// présent sur le poste. L'interface se contente d'afficher le résultat et de
// déclencher la reprise ; le téléchargement lui-même se fait à l'affichage
// suivant de la couche concernée.

const ENDPOINT = "/api/layers/updates";

const EMPTY_REPORT = { outdated: [], added: [], offline: true, checkedAt: null };

/**
 * État des couches. Ne lève jamais : une vérification impossible ne doit pas
 * perturber l'utilisation de l'application.
 */
export async function fetchLayerUpdates({ refresh = false, signal } = {}) {
  try {
    const response = await fetch(`${ENDPOINT}${refresh ? "?refresh=true" : ""}`, { signal });
    if (!response.ok) return EMPTY_REPORT;
    const payload = await response.json();
    return {
      outdated: Array.isArray(payload?.outdated) ? payload.outdated : [],
      added: Array.isArray(payload?.added) ? payload.added : [],
      offline: !!payload?.offline,
      checkedAt: payload?.checkedAt ?? null,
    };
  } catch {
    return EMPTY_REPORT;
  }
}

/** Accepte les mises à jour : les copies périmées sont écartées. */
export async function applyLayerUpdates({ signal } = {}) {
  const response = await fetch(ENDPOINT, { method: "POST", signal });
  if (!response.ok) throw new Error(`Mise à jour impossible (HTTP ${response.status})`);
  const payload = await response.json();
  return Array.isArray(payload?.updated) ? payload.updated : [];
}
