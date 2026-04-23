/**
 * Utilitaires purs pour l'import XML Télépac.
 *
 * Extraits de TelepacButton.jsx afin d'être testables indépendamment de React.
 */

/**
 * Clés génériques reconnues comme "culture courante" par l'application.
 * Supprimées avant d'écrire dans la colonne cible pour éviter les doublons
 * dans les colonnes de l'éditeur.
 */
export const GENERIC_CULTURE_KEYS = ["culture", "cultureN", "cultureN_0", "cultureN0"];

/**
 * Variante étendue : inclut `code` et `code_culture`, reconnus comme alias de
 * Culture N par ParcelleEditor (PROPERTY_ALIASES.culture). Utilisée pour les
 * imports dont l'offset ≠ 0 afin d'éviter l'apparition de la culture dans la
 * colonne N en plus de la colonne cible.
 */
export const GENERIC_CULTURE_KEYS_EXTENDED = [
  ...GENERIC_CULTURE_KEYS,
  "code",
  "code_culture",
];

/**
 * Convertit un offset numérique en nom de colonne de propriété.
 *
 * | offset | colonne         |
 * |--------|-----------------|
 * | -1     | cultureN_plus1  |
 * |  0     | cultureN        |
 * |  1     | cultureN1       |
 * |  2     | cultureN2       |
 * |  …     | cultureN{n}     |
 */
export function cultureColumnFromOffset(offset) {
  if (!Number.isFinite(offset)) return "cultureN";
  if (offset === -1) return "cultureN_plus1";
  if (offset < 0) return "cultureN";
  return offset === 0 ? "cultureN" : `cultureN${offset}`;
}

/**
 * Résout la valeur de culture depuis un objet de propriétés.
 * Priorité : cultureN → culture → code_culture → code
 *
 * Retourne une chaîne vide si aucune valeur n'est trouvée.
 */
export function resolveCultureValue(props = {}) {
  const candidates = [
    props.cultureN,
    props.culture,
    props.code_culture,
    props.code,
  ];
  const value = candidates.find(
    (item) => item != null && String(item).trim() !== ""
  );
  return value == null ? "" : String(value).trim();
}

/**
 * Applique le contexte d'import XML (année + colonne culture) à une liste de
 * features GeoJSON.
 *
 * - Écrit `annee` sur chaque feature si l'année est finie.
 * - Route la valeur de culture vers la colonne déterminée par `cultureOffset`.
 * - Supprime les clés source pour éviter la duplication dans d'autres colonnes :
 *   - offset = 0 : supprime GENERIC_CULTURE_KEYS (pas `code` / `code_culture`)
 *   - offset ≠ 0 : supprime GENERIC_CULTURE_KEYS_EXTENDED (inclut `code`)
 *
 * @param {object[]} features  - Features GeoJSON d'entrée
 * @param {object}   ctx
 * @param {number}   ctx.year          - Année campagne (NaN = ignorée)
 * @param {number}   ctx.cultureOffset - Décalage par rapport à l'année N
 * @returns {object[]} Nouvelles features avec propriétés mises à jour
 */
export function applyXmlImportContext(features, { year, cultureOffset }) {
  const keysToDelete =
    cultureOffset !== 0 ? GENERIC_CULTURE_KEYS_EXTENDED : GENERIC_CULTURE_KEYS;

  return (features || []).map((feature) => {
    const props = { ...(feature?.properties || {}) };

    if (Number.isFinite(year)) {
      props.annee = year;
    }

    const cultureValue = resolveCultureValue(props);
    if (cultureValue) {
      const targetColumn = cultureColumnFromOffset(cultureOffset);
      keysToDelete.forEach((k) => {
        delete props[k];
      });
      props[targetColumn] = cultureValue;
      if (cultureOffset === 0) {
        props.culture = cultureValue;
      }
    }

    return { ...feature, properties: props };
  });
}
