import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { loadLocalRrpZip, pickProp } from "@/services/rrpLocal";
import { FIELD_UCS, FIELD_TEXTURE, FIELD_PROF, FIELD_LIB, TEXTURE_COLORS,
         DEFAULT_FILL, DEFAULT_OUTLINE, DEFAULT_FILL_OPACITY } from "@/config/soilsLocalConfig";

type Options = {
  map: maplibregl.Map | null;
  zipUrl?: string;              // ex: "/data/rrp_occitanie.zip"
  sourceId?: string;            // ex: "soils-rrp"
  fillLayerId?: string;         // ex: "soils-rrp-fill"
  lineLayerId?: string;         // ex: "soils-rrp-outline"
  labelLayerId?: string;        // ex: "soils-rrp-label"
  zIndex?: number;              // ex: 10
};

export function useSoilLayerLocal({
  map,
  zipUrl = "/data/rrp_occitanie.zip",
  sourceId = "soils-rrp",
  fillLayerId = "soils-rrp-fill",
  lineLayerId = "soils-rrp-outline",
  labelLayerId = "soils-rrp-label",
  zIndex = 10,
}: Options) {
  useEffect(() => {
    if (!map) return;
    let aborted = false;

    async function add() {
      // Supprime proprement s’il y a déjà quelque chose
      if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
      if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
      if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);

      const gj = await loadLocalRrpZip(zipUrl);
      if (aborted) return;

      map.addSource(sourceId, {
        type: "geojson",
        data: gj,
        promoteId: "id",
        // options geojson-vt si besoin : tolerance, buffer, etc.
        // (MapLibre gère la tesselation interne sur les GeoJSON volumineux)
      });

      // expression de couleur: essaie d’utiliser la texture
      const colorExpr: any[] = ["case"];
      // On construit une expression « case »: si texture == "xxx" → couleur
      // On essaie de piocher dans plusieurs champs possibles en runtime
      // via une expression let/get
      const textureKey = ["coalesce",
        ["get", FIELD_TEXTURE[0]],
        ["get", FIELD_TEXTURE[1] ?? FIELD_TEXTURE[0]],
        ["get", FIELD_TEXTURE[2] ?? FIELD_TEXTURE[0]],
        ["get", FIELD_TEXTURE[3] ?? FIELD_TEXTURE[0]],
      ];

      Object.entries(TEXTURE_COLORS).forEach(([tex, color]) => {
        colorExpr.push(["==", ["downcase", textureKey], tex], color);
      });
      colorExpr.push(DEFAULT_FILL);

      map.addLayer({
        id: fillLayerId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": colorExpr,
          "fill-opacity": DEFAULT_FILL_OPACITY,
        },
      }, getLayerIdBelow(map, zIndex) || undefined);

      map.addLayer({
        id: lineLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": DEFAULT_OUTLINE,
          "line-width": 0.6,
          "line-opacity": 0.9,
        },
      }, getLayerIdBelow(map, zIndex + 1) || undefined);

      // Label UCS (ou libellé) si dispo
      const labelExpr: any =
        ["coalesce",
          ["to-string", ["get", FIELD_UCS[0]]],
          ["to-string", ["get", FIELD_LIB[0] ?? FIELD_UCS[0]]]
        ];

      map.addLayer({
        id: labelLayerId,
        type: "symbol",
        source: sourceId,
        layout: {
          "text-field": labelExpr,
          "text-size": 10,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#222",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.2,
        },
      }, getLayerIdBelow(map, zIndex + 2) || undefined);

      // Popup simple au clic avec infos clés (UCS, Texture, Profondeur, Libellé)
      map.on("click", fillLayerId, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties ?? {};
        const ucs = pickProp<string>(p, FIELD_UCS, "UCS ?");
        const tex = pickProp<string>(p, FIELD_TEXTURE, "—");
        const prof = pickProp<string>(p, FIELD_PROF, "—");
        const lib = pickProp<string>(p, FIELD_LIB, "");
        const html = `
          <div style="font: 12px/1.4 system-ui, sans-serif">
            <div><b>UCS</b> : ${escapeHtml(String(ucs))}</div>
            <div><b>Texture</b> : ${escapeHtml(String(tex))}</div>
            <div><b>Profondeur</b> : ${escapeHtml(String(prof))}</div>
            ${lib ? `<div><b>Libellé</b> : ${escapeHtml(String(lib))}</div>` : ""}
          </div>
        `;
        new (window as any).maplibregl.Popup({ closeButton: true })
          .setLngLat((e.lngLat as any))
          .setHTML(html)
          .addTo(map);
      });

      // Curseur main sur survol
      map.on("mouseenter", fillLayerId, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", fillLayerId, () => { map.getCanvas().style.cursor = ""; });
    }

    add().catch(console.error);
    return () => { aborted = true; };
  }, [map, zipUrl, sourceId, fillLayerId, lineLayerId, labelLayerId, zIndex]);
}

// Trouve une layer en-dessous de laquelle insérer (optionnel)
function getLayerIdBelow(map: maplibregl.Map, zIndex: number): string | null {
  const layers = map.getStyle()?.layers ?? [];
  if (!layers.length) return null;
  // Stratégie simple: retourne l'id de la layer à l’index demandé si existe
  const idx = Math.min(zIndex, layers.length - 1);
  return layers[idx]?.id ?? null;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}
