import { describe, expect, it } from 'vitest';
import {
  applyXmlImportContext,
  cultureColumnFromOffset,
  resolveCultureValue,
  GENERIC_CULTURE_KEYS,
  GENERIC_CULTURE_KEYS_EXTENDED,
} from '../utils/xmlImportContext';

// ─── Feature helper ────────────────────────────────────────────────────────

type Props = Record<string, unknown>;
const makeFeature = (props: Props = {}) => ({
  type: 'Feature' as const,
  id: 'f1',
  geometry: { type: 'Polygon' as const, coordinates: [] as number[][][] },
  properties: props,
});

// ─── cultureColumnFromOffset ────────────────────────────────────────────────

describe('cultureColumnFromOffset', () => {
  it('offset 0 → cultureN (année courante)', () => {
    expect(cultureColumnFromOffset(0)).toBe('cultureN');
  });

  it('offset 1 → cultureN1 (N-1)', () => {
    expect(cultureColumnFromOffset(1)).toBe('cultureN1');
  });

  it('offset 2 → cultureN2 (N-2)', () => {
    expect(cultureColumnFromOffset(2)).toBe('cultureN2');
  });

  it('offset 6 → cultureN6 (N-6, limite maximale)', () => {
    expect(cultureColumnFromOffset(6)).toBe('cultureN6');
  });

  it('offset -1 → cultureN_plus1 (N+1, année suivante)', () => {
    expect(cultureColumnFromOffset(-1)).toBe('cultureN_plus1');
  });

  it('NaN → cultureN (fallback)', () => {
    expect(cultureColumnFromOffset(NaN)).toBe('cultureN');
  });
});

// ─── GENERIC_CULTURE_KEYS ───────────────────────────────────────────────────

describe('GENERIC_CULTURE_KEYS', () => {
  it('contient les 4 clés génériques de culture courante', () => {
    expect(GENERIC_CULTURE_KEYS).toEqual(['culture', 'cultureN', 'cultureN_0', 'cultureN0']);
  });

  it('EXTENDED ajoute code et code_culture (alias ParcelleEditor)', () => {
    expect(GENERIC_CULTURE_KEYS_EXTENDED).toContain('code');
    expect(GENERIC_CULTURE_KEYS_EXTENDED).toContain('code_culture');
    expect(GENERIC_CULTURE_KEYS_EXTENDED).toHaveLength(GENERIC_CULTURE_KEYS.length + 2);
  });

  it('GENERIC_CULTURE_KEYS ne contient pas code', () => {
    expect(GENERIC_CULTURE_KEYS).not.toContain('code');
    expect(GENERIC_CULTURE_KEYS).not.toContain('code_culture');
  });
});

// ─── resolveCultureValue ────────────────────────────────────────────────────

describe('resolveCultureValue', () => {
  it('priorité cultureN > culture > code_culture > code', () => {
    expect(resolveCultureValue({ cultureN: 'A', culture: 'B', code: 'C' })).toBe('A');
    expect(resolveCultureValue({ culture: 'B', code: 'C' })).toBe('B');
    expect(resolveCultureValue({ code_culture: 'CC', code: 'C' })).toBe('CC');
    expect(resolveCultureValue({ code: 'C' })).toBe('C');
  });

  it('retourne chaîne vide si aucune valeur', () => {
    expect(resolveCultureValue({})).toBe('');
    expect(resolveCultureValue({ culture: '' })).toBe('');
  });

  it('trim les valeurs', () => {
    expect(resolveCultureValue({ culture: '  BLE  ' })).toBe('BLE');
  });
});

// ─── applyXmlImportContext — offset 0 (année N) ─────────────────────────────

describe('applyXmlImportContext — offset 0 (année N)', () => {
  it('écrit la culture dans cultureN ET culture', () => {
    const [result] = applyXmlImportContext(
      [makeFeature({ culture: 'BLE' })],
      { year: 2025, cultureOffset: 0 },
    );
    expect(result.properties.cultureN).toBe('BLE');
    expect(result.properties.culture).toBe('BLE');
  });

  it('conserve code (alias N, lu par ParcelleEditor pour offset 0)', () => {
    const [result] = applyXmlImportContext(
      [makeFeature({ code: 'BLE' })],
      { year: 2025, cultureOffset: 0 },
    );
    expect(result.properties.cultureN).toBe('BLE');
    expect(result.properties.code).toBe('BLE'); // code NON supprimé pour offset=0
  });

  it('supprime les clés génériques source (pas code)', () => {
    const [result] = applyXmlImportContext(
      [makeFeature({ cultureN: 'BLE', cultureN_0: 'BLE', cultureN0: 'BLE' })],
      { year: 2025, cultureOffset: 0 },
    );
    expect(result.properties.cultureN).toBe('BLE');   // réécrit
    expect(result.properties.cultureN_0).toBeUndefined();
    expect(result.properties.cultureN0).toBeUndefined();
  });

  it('définit annee', () => {
    const [result] = applyXmlImportContext(
      [makeFeature({ culture: 'BLE' })],
      { year: 2025, cultureOffset: 0 },
    );
    expect(result.properties.annee).toBe(2025);
  });
});

// ─── applyXmlImportContext — offset 1 (N-1) ─────────────────────────────────

describe('applyXmlImportContext — offset 1 (N-1)', () => {
  it('écrit la culture dans cultureN1 uniquement', () => {
    const [result] = applyXmlImportContext(
      [makeFeature({ culture: 'FEV' })],
      { year: 2024, cultureOffset: 1 },
    );
    expect(result.properties.cultureN1).toBe('FEV');
    expect(result.properties.culture).toBeUndefined();
    expect(result.properties.cultureN).toBeUndefined();
  });

  it('supprime code et code_culture pour éviter la duplication en colonne N', () => {
    // Sans cette suppression, code="FEV" serait lu comme alias de Culture N
    // par ParcelleEditor (PROPERTY_ALIASES.culture) et afficherait FEV dans N ET N-1.
    const [result] = applyXmlImportContext(
      [makeFeature({ code: 'FEV', code_culture: 'FEV' })],
      { year: 2024, cultureOffset: 1 },
    );
    expect(result.properties.cultureN1).toBe('FEV');
    expect(result.properties.code).toBeUndefined();
    expect(result.properties.code_culture).toBeUndefined();
  });

  it('définit annee', () => {
    const [result] = applyXmlImportContext(
      [makeFeature({ culture: 'FEV' })],
      { year: 2024, cultureOffset: 1 },
    );
    expect(result.properties.annee).toBe(2024);
  });
});

// ─── applyXmlImportContext — autres offsets ──────────────────────────────────

describe('applyXmlImportContext — autres offsets', () => {
  it('offset 2 → cultureN2', () => {
    const [result] = applyXmlImportContext(
      [makeFeature({ culture: 'ORG' })],
      { year: 2023, cultureOffset: 2 },
    );
    expect(result.properties.cultureN2).toBe('ORG');
    expect(result.properties.culture).toBeUndefined();
  });

  it('offset -1 → cultureN_plus1 (N+1)', () => {
    const [result] = applyXmlImportContext(
      [makeFeature({ culture: 'COL' })],
      { year: 2026, cultureOffset: -1 },
    );
    expect(result.properties.cultureN_plus1).toBe('COL');
  });
});

// ─── applyXmlImportContext — cas limites ─────────────────────────────────────

describe('applyXmlImportContext — cas limites', () => {
  it('annee NaN → propriété annee absente', () => {
    const [result] = applyXmlImportContext(
      [makeFeature({})],
      { year: NaN, cultureOffset: 0 },
    );
    expect(result.properties.annee).toBeUndefined();
  });

  it('feature sans culture → propriétés inchangées (hors annee)', () => {
    const [result] = applyXmlImportContext(
      [makeFeature({ ilot: '3' })],
      { year: 2025, cultureOffset: 0 },
    );
    expect(result.properties.ilot).toBe('3');
    expect(result.properties.cultureN).toBeUndefined();
  });

  it('tableau vide → tableau vide', () => {
    expect(applyXmlImportContext([], { year: 2025, cultureOffset: 0 })).toEqual([]);
  });

  it('conserve les autres propriétés non-culture', () => {
    const [result] = applyXmlImportContext(
      [makeFeature({ culture: 'BLE', ilot: '1', surface: 3.5, nom: 'Parcelle A' })],
      { year: 2025, cultureOffset: 1 },
    );
    expect(result.properties.ilot).toBe('1');
    expect(result.properties.surface).toBe(3.5);
    expect(result.properties.nom).toBe('Parcelle A');
  });
});
