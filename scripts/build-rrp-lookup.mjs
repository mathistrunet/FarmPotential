#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';

// Paths
const root = path.resolve(process.cwd());
const dataZipPath = path.join(root, 'public', 'data', 'rrp_occitanie.zip');
const lookupOutPath = path.join(root, 'public', 'rrp_lookup.json');
const colorsOutPath = path.join(root, 'public', 'rrp_colors.json');

function decodeBuffer(buf) {
  try {
    return new TextDecoder('latin1').decode(buf);
  } catch {
    // fallback cp1252
    try {
      return new TextDecoder('windows-1252').decode(buf);
    } catch {
      return buf.toString('binary');
    }
  }
}

function readCsvFromZip(zip, pattern) {
  const entry = zip
    .getEntries()
    .find((e) => pattern.test(e.entryName));
  if (!entry) throw new Error(`Missing ${pattern}`);
  const text = decodeBuffer(entry.getData());
  return parse(text, {
    columns: true,
    delimiter: ';',
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  });
}

async function main() {
  const outerZip = new AdmZip(dataZipPath);
  const innerEntry = outerZip
    .getEntries()
    .find((e) => /BDDonesol.*\.zip$/i.test(e.entryName));
  if (!innerEntry) throw new Error('BDDonesol zip not found');
  const innerZip = new AdmZip(innerEntry.getData());

  const etudes = readCsvFromZip(innerZip, /table_etude\.csv$/i);
  const ucs = readCsvFromZip(innerZip, /table_ucs\.csv$/i);
  const links = readCsvFromZip(innerZip, /table_l_ucs_uts\.csv$/i);
  const uts = readCsvFromZip(innerZip, /table_uts\.csv$/i);

  const noEtudeById = {};
  const idEtudeByNo = {};
  etudes.forEach((e) => {
    const id = e.id_etude || e.ID_ETUDE;
    const no = e.no_etude || e.NO_ETUDE;
    if (id != null && no != null) {
      noEtudeById[id] = no;
      idEtudeByNo[no] = id;
    }
  });

  const utsById = {};
  uts.forEach((u) => {
    const id = u.id_uts || u.ID_UTS;
    if (id != null) {
      utsById[id] = u.rp_2008_nom || u.RP_2008_NOM;
    }
  });

  const linksByUcs = {};
  links.forEach((l) => {
    const idUcs = l.id_ucs || l.ID_UCS;
    if (!idUcs) return;
    (linksByUcs[idUcs] ??= []).push(l);
  });

  const lookup = {};
  ucs.forEach((u) => {
    const idEtude = u.id_etude || u.ID_ETUDE;
    const noEtude = noEtudeById[idEtude];
    const noUcs = u.no_ucs || u.NO_UCS;
    if (!noEtude || noUcs == null) return;
    const key = `${String(noEtude).trim()}:${String(Number(noUcs))}`;
    const idUcs = u.id_ucs || u.ID_UCS;
    const entry = {
      id_etude: Number(idEtude),
      id_ucs: Number(idUcs),
      nom_ucs: u.nom_ucs || u.NOM_UCS || '',
      reg_nat: u.reg_nat || u.REG_NAT || '',
      alt_min: toNumber(u.alt_min || u.ALT_MIN),
      alt_mod: toNumber(u.alt_mod || u.ALT_MOD),
      alt_max: toNumber(u.alt_max || u.ALT_MAX),
      nb_uts: toNumber(u.nb_uts || u.NB_UTS),
      uts: [],
    };
    const lArr = linksByUcs[idUcs] || [];
    entry.uts = lArr
      .map((l) => ({
        pourcent: Math.round(toNumber(l.pourcent || l.POURCENT) || 0),
        rp_2008_nom: utsById[l.id_uts || l.ID_UTS] || '',
      }))
      .sort((a, b) => b.pourcent - a.pourcent);
    lookup[key] = entry;
  });

  // Parse SLD for colors
  const sldEntry = outerZip
    .getEntries()
    .find((e) => e.entryName.toLowerCase().endsWith('.sld'));
  if (!sldEntry) throw new Error('SLD file not found');
  const sldText = sldEntry.getData().toString('utf8');
  const colors = {};
  const ruleRegex = /<se:Rule[\s\S]*?<\/se:Rule>/g;
  for (const match of sldText.matchAll(ruleRegex)) {
    const rule = match[0];
    if (!/code_coul/i.test(rule)) continue;
    const codeMatch = rule.match(/<ogc:Literal>\s*([^<]+)\s*<\/ogc:Literal>/i);
    const colorMatch = rule.match(/<se:SvgParameter[^>]*name=['"]fill['"][^>]*>(#[0-9a-fA-F]{6})<\/se:SvgParameter>/i);
    if (codeMatch && colorMatch) {
      colors[codeMatch[1].trim()] = colorMatch[1].trim();
    }
  }

  await fs.writeFile(lookupOutPath, JSON.stringify(lookup, null, 2), 'utf8');
  await fs.writeFile(colorsOutPath, JSON.stringify(colors, null, 2), 'utf8');
  console.log(`Lookup entries: ${Object.keys(lookup).length}`);
  console.log(`Color entries: ${Object.keys(colors).length}`);
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
