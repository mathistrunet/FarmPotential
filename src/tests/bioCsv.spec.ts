import { describe, expect, it } from 'vitest';

import type { ImportedBioParcel } from '../lib/types/bio';
import { exportBioCsv, importBioCsv } from '../services/bioCsv';
import { decodeWindows1252, encodeWindows1252 } from '../utils/windows1252';

const HEADER = 'Secteur;Exploitations;Code exploitation;Parcelles;Surface parcelle;Parcelle Bio;Type de sol;CultureN;CultureN1;CultureN2;CultureN3;CultureN4';

async function csvOutputToString(output: Blob | Buffer): Promise<string> {
  if (typeof Blob !== 'undefined' && output instanceof Blob) {
    const arrayBuffer = await output.arrayBuffer();
    return decodeWindows1252(new Uint8Array(arrayBuffer));
  }
  return decodeWindows1252(output as Uint8Array);
}

describe('bio CSV import/export', () => {
  it('imports CSV rows encoded in windows-1252', async () => {
    const csvLine = 'secteur import test;exploit superadmin;5555;Argile 1 (bio) XL;15;oui;Argileux;Colza;Luzerne;;;';
    const csv = `${HEADER}\r\n${csvLine}`;
    const bytes = encodeWindows1252(csv);

    const parcels = await importBioCsv(bytes);

    expect(parcels).toEqual([
      {
        secteur: 'secteur import test',
        exploitationName: 'exploit superadmin',
        exploitationCode: '5555',
        parcelName: 'Argile 1 (bio) XL',
        parcelAreaHa: 15,
        isOrganic: true,
        soilType: 'Argileux',
        cultureN: 'Colza',
        cultureN1: 'Luzerne',
        cultureN2: null,
        cultureN3: null,
        cultureN4: null,
      },
    ] satisfies ImportedBioParcel[]);
  });

  it('exports CSV rows with windows-1252 encoding and formatting', async () => {
    const parcels: ImportedBioParcel[] = [
      {
        secteur: 'secteur import test',
        exploitationName: 'exploit superadmin',
        exploitationCode: '5555',
        parcelName: 'Argile 1 (bio) XL',
        parcelAreaHa: 15.25,
        isOrganic: false,
        soilType: 'Argilo-limoneux',
        cultureN: 'Colza',
        cultureN1: 'Fève',
        cultureN2: 'Maïs ensilage',
        cultureN3: 'Blé tendre d’hiver',
        cultureN4: 'œillet',
      },
    ];

    const output = exportBioCsv(parcels);
    const csv = await csvOutputToString(output);

    expect(csv).toContain('15,25');
    expect(csv).toContain('œillet');
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe(HEADER);
    expect(lines[1]).toBe('secteur import test;exploit superadmin;5555;Argile 1 (bio) XL;15,25;non;Argilo-limoneux;Colza;Fève;Maïs ensilage;Blé tendre d’hiver;œillet');
  });
});
