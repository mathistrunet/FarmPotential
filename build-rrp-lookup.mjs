#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const dataDir = path.resolve("data/BDDonesol");
const outFile = path.resolve("public/rrp_lookup.json");

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(";").map((h) => h.trim());
  return lines
    .filter((l) => l.trim())
    .map((line) => {
      const cols = line.split(";");
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = cols[i]?.trim();
      });
      return obj;
    });
}

function get(row, ...names) {
  for (const n of names) {
    if (row[n] !== undefined && row[n] !== "") return row[n];
    if (row[n?.toUpperCase?.()]) return row[n.toUpperCase()];
    if (row[n?.toLowerCase?.()]) return row[n.toLowerCase()];
  }
  return undefined;
}

async function readCsv(name) {
  const txt = await fs.readFile(path.join(dataDir, name), "utf8");
  return parseCsv(txt);
}

async function main() {
  const [etudes, ucs, links, uts] = await Promise.all([
    readCsv("table_etude.csv"),
    readCsv("table_ucs.csv"),
    readCsv("table_l_ucs_uts.csv"),
    readCsv("table_uts.csv"),
  ]);

  const etudesByNo = Object.fromEntries(etudes.map((e) => [get(e, "NO_ETUDE"), e]));
  const utsById = Object.fromEntries(
    uts.map((u) => [get(u, "ID_UTS", "id_uts"), u])
  );
  const linksByUcs = {};
  for (const l of links) {
    const idUcs = get(l, "ID_UCS", "id_ucs");
    if (!linksByUcs[idUcs]) linksByUcs[idUcs] = [];
    linksByUcs[idUcs].push(l);
  }

  const lookup = {};
  for (const u of ucs) {
    const noEtude = get(u, "NO_ETUDE");
    const noUcs = get(u, "NO_UCS");
    const key = `${noEtude}:${noUcs}`;
    const idUcs = get(u, "ID_UCS", "id_ucs");
    const etude = etudesByNo[noEtude] || {};
    const lArr = linksByUcs[idUcs] || [];
    const utsList = lArr
      .map((l) => {
        const uRow = utsById[get(l, "ID_UTS", "id_uts")];
        return {
          pourcent: Number(get(l, "POURCENT", "pourcent")) || 0,
          rp_2008_nom: get(uRow || {}, "RP_2008_NOM", "rp_2008_nom") || "",
        };
      })
      .sort((a, b) => b.pourcent - a.pourcent);

    lookup[key] = {
      id_etude: Number(get(etude, "ID_ETUDE", "id_etude")) || undefined,
      id_ucs: Number(idUcs) || undefined,
      nom_ucs: get(u, "NOM_UCS", "nom_ucs") || "",
      reg_nat: get(u, "REG_NAT", "reg_nat") || "",
      alt_min: Number(get(u, "ALT_MIN", "alt_min")) || undefined,
      alt_mod: Number(get(u, "ALT_MOD", "alt_mod")) || undefined,
      alt_max: Number(get(u, "ALT_MAX", "alt_max")) || undefined,
      nb_uts: utsList.length,
      uts: utsList,
      color_hex: get(u, "COLOR_HEX", "color_hex") || undefined,
    };
  }

  await fs.writeFile(outFile, JSON.stringify(lookup, null, 2), "utf8");
  console.log(`Wrote ${outFile} with ${Object.keys(lookup).length} entries`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
