import { useEffect, useMemo, useState } from "react";

function buildWmsTileTemplate({ base, layer, version = "1.3.0" }) {
  const common = `SERVICE=WMS&REQUEST=GetMap&VERSION=${encodeURIComponent(version)}&FORMAT=image/png&TRANSPARENT=true&LAYERS=${layer}&STYLES=`;
  if (version === "1.3.0") {
    return `${base}?${common}&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`;
  }
  // 1.1.1 fallback
  return `${base}?${common}&SRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`;
}

async function ping(url) {
  const res = await fetch(url);
  const ok = res.ok;
  const ct = res.headers.get("content-type") || "";
  const txt = await res.text();
  return { ok, ct, txt, status: res.status, url };
}

export default function SoilsDebug() {
  const [cap, setCap] = useState(null);
  const [tile, setTile] = useState(null);
  const [errs, setErrs] = useState([]);

  const env = useMemo(() => ({
    mode: import.meta.env.VITE_SOILS_MODE,
    wmsBase: import.meta.env.VITE_SOILS_WMS_URL,
    wmsLayer: import.meta.env.VITE_SOILS_WMS_LAYER,
    wmsVersion: import.meta.env.VITE_SOILS_WMS_VERSION ?? "1.3.0",
    wfsUrl: import.meta.env.VITE_SOILS_WFS_URL,
    wfsTypename: import.meta.env.VITE_SOILS_WFS_TYPENAME,
  }), []);

  useEffect(() => {
    const run = async () => {
      const e = [];
      if (!env.wmsBase || !env.wmsLayer) {
        e.push("ENV manquantes: VITE_SOILS_WMS_URL ou VITE_SOILS_WMS_LAYER");
      }

      try {
        const capUrl = `${env.wmsBase}?SERVICE=WMS&REQUEST=GetCapabilities`;
        const r1 = await ping(capUrl);
        setCap(r1);
        if (!r1.ok) e.push(`GetCapabilities KO (${r1.status}) — ${r1.url}`);
        if (r1.ok && !r1.txt.includes(env.wmsLayer)) {
          e.push(`Le nom de couche "${env.wmsLayer}" n'apparait pas dans les capacités WMS`);
        }
      } catch (err) {
        e.push(`Erreur GetCapabilities: ${String(err)}`);
      }

      try {
        const template = buildWmsTileTemplate({ base: env.wmsBase, layer: env.wmsLayer, version: env.wmsVersion });
        const bboxFRz5 = "1113194.9079327357,5322350.877,3339584.723,7010397.406"; // bbox plausible
        const tileUrl = template.replace("{bbox-epsg-3857}", bboxFRz5);
        const r2 = await ping(tileUrl);
        setTile(r2);
        if (!r2.ok) e.push(`GetMap KO (${r2.status}) — ${r2.url}`);
        if (r2.ok && !(r2.ct.includes("image/png") || r2.ct.includes("image"))) {
          e.push(`GetMap Content-Type inattendu: ${r2.ct} — ${r2.url}`);
        }
      } catch (err) {
        e.push(`Erreur GetMap: ${String(err)}`);
      }

      setErrs(e);
      console.table({ ...env });
      if (cap?.url) console.log("Capabilities URL:", cap.url);
      if (tile?.url) console.log("GetMap URL:", tile.url);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{position:"fixed",right:10,top:10,background:"#fff",padding:12,borderRadius:10,boxShadow:"0 6px 20px rgba(0,0,0,.15)",maxWidth:420,zIndex:9999,fontFamily:"system-ui,Arial"}}>
      <h3 style={{margin:"0 0 8px"}}>Soils Debug</h3>
      <div style={{fontSize:13,whiteSpace:"pre-wrap"}}>
        <div><b>VITE_SOILS_WMS_URL</b>: {env.wmsBase || <em style={{color:"red"}}>non défini</em>}</div>
        <div><b>VITE_SOILS_WMS_LAYER</b>: {env.wmsLayer || <em style={{color:"red"}}>non défini</em>}</div>
        <div><b>VITE_SOILS_WMS_VERSION</b>: {env.wmsVersion}</div>
      </div>
      <hr/>
      <div style={{fontSize:12}}>
        <div><b>Capabilities:</b> {cap ? `${cap.status} ${cap.ct}` : "…"} </div>
        {cap?.url && <div style={{overflow:"hidden",textOverflow:"ellipsis"}}><a href={cap.url} target="_blank">ouvrir</a></div>}
      </div>
      <div style={{fontSize:12, marginTop:6}}>
        <div><b>GetMap (1 tuile):</b> {tile ? `${tile.status} ${tile.ct}` : "…"} </div>
        {tile?.url && <div style={{overflow:"hidden",textOverflow:"ellipsis"}}><a href={tile.url} target="_blank">ouvrir</a></div>}
      </div>
      {!!errs.length && (
        <div style={{marginTop:8, color:"#b00020", fontSize:12}}>
          <b>Problèmes détectés :</b>
          <ul>{errs.map((x,i)=><li key={i}>{x}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

