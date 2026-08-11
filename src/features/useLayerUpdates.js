import { useCallback, useEffect, useState } from "react";

import { applyLayerUpdates, fetchLayerUpdates } from "../services/layerUpdates";

/**
 * Suit l'état des cartes hébergées dans les Releases.
 *
 * La vérification est portée par l'éditeur, pas par le panneau qui l'affiche :
 * le repère « mise à jour disponible » doit apparaître dès l'ouverture de
 * l'application, sans attendre que l'utilisateur ouvre l'onglet Calques.
 */
export function useLayerUpdates() {
  const [report, setReport] = useState(null);
  const [applying, setApplying] = useState(false);
  const [appliedCount, setAppliedCount] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchLayerUpdates({ signal: controller.signal }).then((next) => {
      if (!controller.signal.aborted) setReport(next);
    });
    return () => controller.abort();
  }, []);

  const apply = useCallback(async () => {
    setApplying(true);
    try {
      const updated = await applyLayerUpdates();
      setAppliedCount(updated.length);
      setReport(await fetchLayerUpdates());
    } catch (error) {
      console.warn("[LAYER_UPDATES] Mise à jour impossible :", error?.message || error);
    } finally {
      setApplying(false);
    }
  }, []);

  const pending = (report?.outdated?.length ?? 0) + (report?.added?.length ?? 0);

  return { report, pending, applying, appliedCount, apply };
}
