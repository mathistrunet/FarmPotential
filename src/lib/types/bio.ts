export interface ImportedBioParcel {
  secteur: string;
  exploitationName: string;
  exploitationCode: string;
  parcelName: string;
  parcelAreaHa: number;
  isOrganic: boolean;
  soilType: string;
  cultureN: string | null;
  cultureN1: string | null;
  cultureN2: string | null;
  cultureN3: string | null;
  cultureN4: string | null;
}

export const BIO_CSV_HEADERS = [
  'Secteur',
  'Exploitations',
  'Code exploitation',
  'Parcelles',
  'Surface parcelle',
  'Parcelle Bio',
  'Type de sol',
  'CultureN',
  'CultureN1',
  'CultureN2',
  'CultureN3',
  'CultureN4',
] as const;

export type BioCsvHeader = (typeof BIO_CSV_HEADERS)[number];
