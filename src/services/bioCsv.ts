import Papa from 'papaparse';

import type { ImportedBioParcel } from '../lib/types/bio';
import { BIO_CSV_HEADERS } from '../lib/types/bio';
import { decodeWindows1252, encodeWindows1252 } from '../utils/windows1252';

type CsvBinaryInput =
  | File
  | Blob
  | ArrayBuffer
  | ArrayBufferView
  | Uint8Array
  | string;

const DELIMITER = ';';
const NEWLINE = '\r\n';

function isBlobLike(input: unknown): input is Blob {
  return typeof Blob !== 'undefined' && input instanceof Blob;
}

async function toUint8Array(input: CsvBinaryInput): Promise<Uint8Array> {
  if (typeof input === 'string') {
    return encodeWindows1252(input);
  }

  if (input instanceof Uint8Array) {
    return input;
  }

  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }

  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer);
  }

  if (isBlobLike(input)) {
    const arrayBuffer = await input.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  throw new Error('Unsupported CSV input provided.');
}

function normalizeString(value: string | undefined): string {
  if (!value) {
    return '';
  }
  return value.replace(/\ufeff/g, '').trim();
}

function normalizeCulture(value: string | undefined): string | null {
  const normalized = normalizeString(value);
  return normalized === '' ? null : normalized;
}

function parseSurface(value: string | undefined, rowNumber: number): number {
  const normalized = normalizeString(value).replace(',', '.');
  if (!normalized) {
    throw new Error(`Surface parcelle manquante à la ligne ${rowNumber}.`);
  }
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) {
    throw new Error(`Surface parcelle invalide à la ligne ${rowNumber}: "${value}".`);
  }
  return parsed;
}

function parseIsOrganic(value: string | undefined): boolean {
  const normalized = normalizeString(value).toLowerCase();
  return normalized === 'oui';
}

function requireColumns(row: string[], rowNumber: number): void {
  if (row.length < BIO_CSV_HEADERS.length) {
    throw new Error(`Ligne ${rowNumber} incomplète: ${row.length}/${BIO_CSV_HEADERS.length} colonnes.`);
  }
}

function ensureHeader(header: string[]): void {
  const normalized = header.map((value) => normalizeString(value));
  const matches = BIO_CSV_HEADERS.every((expected, index) => normalized[index] === expected);
  if (!matches) {
    throw new Error('En-têtes CSV invalides. Le fichier doit respecter le format Transition Bio.');
  }
}

function parseRow(row: string[], rowNumber: number): ImportedBioParcel {
  requireColumns(row, rowNumber);
  const [
    secteur,
    exploitationName,
    exploitationCode,
    parcelName,
    parcelArea,
    parcelBio,
    soilType,
    cultureN,
    cultureN1,
    cultureN2,
    cultureN3,
    cultureN4,
  ] = row;

  return {
    secteur: normalizeString(secteur),
    exploitationName: normalizeString(exploitationName),
    exploitationCode: normalizeString(exploitationCode),
    parcelName: normalizeString(parcelName),
    parcelAreaHa: parseSurface(parcelArea, rowNumber),
    isOrganic: parseIsOrganic(parcelBio),
    soilType: normalizeString(soilType),
    cultureN: normalizeCulture(cultureN),
    cultureN1: normalizeCulture(cultureN1),
    cultureN2: normalizeCulture(cultureN2),
    cultureN3: normalizeCulture(cultureN3),
    cultureN4: normalizeCulture(cultureN4),
  };
}

function buildCsvRows(parcels: ImportedBioParcel[]): string[][] {
  return parcels.map((parcel) => [
    parcel.secteur,
    parcel.exploitationName,
    parcel.exploitationCode,
    parcel.parcelName,
    parcel.parcelAreaHa.toString().replace('.', ','),
    parcel.isOrganic ? 'oui' : 'non',
    parcel.soilType ?? '',
    parcel.cultureN ?? '',
    parcel.cultureN1 ?? '',
    parcel.cultureN2 ?? '',
    parcel.cultureN3 ?? '',
    parcel.cultureN4 ?? '',
  ]);
}

function bytesToOutput(bytes: Uint8Array): Blob | Buffer {
  const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
  if (isBrowser && typeof Blob !== 'undefined') {
    return new Blob([bytes], { type: 'text/csv;charset=windows-1252' });
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes);
  }

  return new Blob([bytes], { type: 'text/csv' });
}

export async function importBioCsv(input: CsvBinaryInput): Promise<ImportedBioParcel[]> {
  const text = typeof input === 'string'
    ? input
    : decodeWindows1252(await toUint8Array(input));

  const { data, errors } = Papa.parse<string[]>(text, {
    delimiter: DELIMITER,
    skipEmptyLines: 'greedy',
  });

  if (errors.length > 0) {
    throw new Error(`Erreur de lecture du CSV: ${errors[0].message}`);
  }

  if (data.length === 0) {
    return [];
  }

  const [header, ...rows] = data;
  ensureHeader(header ?? []);

  const parsedRows: ImportedBioParcel[] = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +2 to include header line
    if (!row || row.every((value) => normalizeString(value) === '')) {
      return;
    }
    parsedRows.push(parseRow(row, rowNumber));
  });

  return parsedRows;
}

export function exportBioCsv(parcels: ImportedBioParcel[]): Blob | Buffer {
  const rows = buildCsvRows(parcels);
  const csv = Papa.unparse({ fields: BIO_CSV_HEADERS, data: rows }, {
    delimiter: DELIMITER,
    newline: NEWLINE,
    quotes: false,
  });

  const bytes = encodeWindows1252(csv);
  return bytesToOutput(bytes);
}
