import { useCallback, useState } from "react";
import departementsMeta from "../data/departements_meta.json";
import { featureAreaHa, featureCentroid } from "../utils/geometry";
import { getToponymiePoints } from "../services/toponymie";
import { DEPARTMENT_TO_TOPONYMIE_REGION } from "../config/toponymie";
import { resolveToponymNames } from "./toponymieNameFormatting";

const TELEPAC_NUMBER_REGEX = /^[0-9]+(?:[.-][0-9]+)*$/;
const META_ENTRIES = Object.entries(departementsMeta || {});
const GRAPHIE_FIELDS = [
  "graphie",
  "GRAPHIE",
  "Graphie",
  "toponyme",
  "TOPONYME",
  "libelle",
  "LIBELLE",
  "nom",
  "NOM",
];

function isMeaningfulName(props) {
  if (!props) return false;
  const rawValue = props.nom ?? props.NOM ?? props.name ?? props.NAME;
  const name = (rawValue ?? "").toString().trim();
  if (!name) return false;
  const nomAffiche = (props.nom_affiche ?? "").toString().trim();
  if (nomAffiche && name === nomAffiche) return false;
  if (TELEPAC_NUMBER_REGEX.test(name.replace(/\s+/g, ""))) return false;
  return true;
}

function findDepartmentForPoint([lon, lat]) {
  for (const [code, meta] of META_ENTRIES) {
    const bbox = meta?.bbox;
    if (!bbox || bbox.length !== 4) continue;
    const [minLon, minLat, maxLon, maxLat] = bbox;
    if (lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat) {
      return code;
    }
  }
  return null;
}

function extractGraphie(properties) {
  if (!properties) return null;
  for (const field of GRAPHIE_FIELDS) {
    const raw = properties[field];
    if (raw == null) continue;
    const value = String(raw).trim();
    if (value) return value;
  }
  return null;
}

function approximateDistance2Meters(a, b) {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const rad = Math.PI / 180;
  const avgLatRad = ((lat1 + lat2) / 2) * rad;
  const x = (lon2 - lon1) * Math.cos(avgLatRad) * 111320;
  const y = (lat2 - lat1) * 110540;
  return x * x + y * y;
}

function findNearestToponym(points, target) {
  if (!Array.isArray(points) || !points.length) return null;
  let best = null;
  let bestDistance = Infinity;
  points.forEach((point) => {
    const coords = point?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return;
    const distance = approximateDistance2Meters(coords, target);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  });
  return best;
}

function collectAssignments(features) {
  const pending = [];
  features.forEach((feature, index) => {
    if (!feature || isMeaningfulName(feature.properties)) return;
    const centroid = featureCentroid(feature);
    if (!centroid) return;
    const department = findDepartmentForPoint(centroid);
    if (!department) return;
    const region = DEPARTMENT_TO_TOPONYMIE_REGION[department];
    if (!region) return;
    pending.push({
      key: feature.id ?? `idx:${index}`,
      centroid,
      region,
      areaHa: featureAreaHa(feature),
    });
  });
  return pending;
}

export function useToponymieAutoNaming(setFeatures) {
  const [isNaming, setIsNaming] = useState(false);

  const fillToponymieNames = useCallback(async (features) => {
    if (isNaming) return;
    if (!Array.isArray(features)) return;
    if (typeof setFeatures !== "function") return;
    const pending = collectAssignments(features);
    if (!pending.length) return;

    setIsNaming(true);
    try {
      const regionSet = new Set(pending.map((item) => item.region));
      const regionData = new Map();
      await Promise.all(
        Array.from(regionSet).map(async (region) => {
          try {
            const points = await getToponymiePoints(region);
            regionData.set(region, points);
          } catch (error) {
            console.error(`Toponymie: échec du chargement ${region}`, error);
          }
        })
      );

      const assignments = [];
      pending.forEach((item) => {
        const points = regionData.get(item.region);
        if (!points || !points.length) return;
        const nearest = findNearestToponym(points, item.centroid);
        if (!nearest) return;
        const baseName = extractGraphie(nearest.properties);
        if (!baseName) return;
        assignments.push({
          key: item.key,
          baseName,
          areaHa: item.areaHa,
        });
      });
      if (!assignments.length) return;

      const finalMap = resolveToponymNames(assignments);
      if (!finalMap.size) return;

      setFeatures((prev) => {
        if (!Array.isArray(prev)) return prev;
        let changed = false;
        const next = prev.map((feature, index) => {
          const key = feature?.id ?? `idx:${index}`;
          const name = finalMap.get(key);
          if (!name) return feature;
          const props = { ...(feature?.properties || {}), nom: name };
          changed = true;
          return { ...feature, properties: props };
        });
        return changed ? next : prev;
      });
    } catch (error) {
      console.error("Toponymie: attribution automatique impossible", error);
    } finally {
      setIsNaming(false);
    }
  }, [isNaming, setFeatures]);

  return { fillToponymieNames, isNaming };
}
