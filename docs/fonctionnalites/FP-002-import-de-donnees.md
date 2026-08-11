# FP-002 - Import de donnees

- ID : `FP-002`
- Statut : `Implante`
- Priorite : `P1`

## Objectif utilisateur

Importer rapidement un parcellaire existant dans Studio Parcellaire a partir de formats de travail deja utilises.

## Perimetre actuel

- import `XML Telepac`
- import `ZIP shapefile`
- import `CSV parcellaire`
- detection d'annee
- affectation de colonnes de culture
- zoom automatique sur l'emprise importee

## Attendus fonctionnels

- le fichier doit etre lu sans manipulation technique complementaire
- les parcelles importees doivent etre exploitables dans l'editor
- les donnees metier disponibles doivent etre reprises quand c'est possible

## Donnees d'entree

- fichier XML Telepac
- fichier ZIP shapefile
- fichier CSV parcellaire (colonnes : Secteur, Exploitation, Numero pacage, Parcelles, Surface parcelle, Parcelle Bio, Type de sol, CultureN, CultureN1–CultureN4, Geometrie)

## Donnees produites

- features GeoJSON exploitees par l'application

## Technique

- composant : `src/Front/TelepacButton.jsx`
- utilitaires purs (testables) : `src/utils/xmlImportContext.js`
  - `cultureColumnFromOffset(offset)` — convertit un offset numerique en nom de colonne (`cultureN`, `cultureN1`, `cultureN_plus1`, etc.)
  - `resolveCultureValue(props)` — lit la valeur de culture depuis un objet de proprietes (priorite : `cultureN` > `culture` > `code_culture` > `code`)
  - `applyXmlImportContext(features, { year, cultureOffset })` — applique l'annee et route la culture vers la bonne colonne ; supprime les cles source pour eviter les doublons
- services : `src/services/telepacXml.js`, `src/services/shapefileZip.js`, `src/services/parcellesCsv.js`

## Regles de deduplication lors de l'import XML

Lors de l'import d'un fichier XML Telepac, la culture est ecrite dans la colonne determinee par l'offset choisi par l'utilisateur. Pour eviter qu'elle apparaisse simultanement dans plusieurs colonnes de l'editeur, les cles sources sont supprimees apres l'ecriture :

| Offset choisi | Cles supprimees | Remarque |
|---|---|---|
| N (offset = 0) | `culture`, `cultureN`, `cultureN_0`, `cultureN0` | `code` et `code_culture` conserves (alias reconnus pour la colonne N) |
| Autre (offset ≠ 0) | `culture`, `cultureN`, `cultureN_0`, `cultureN0`, `code`, `code_culture` | `code` supprime pour eviter que la culture apparaisse aussi en colonne N via les alias de `ParcelleEditor` |

Cette distinction est necessaire car `ParcelleEditor` reconnait `code` et `code_culture` comme alias de la colonne N (`PROPERTY_ALIASES.culture`). Sans suppression pour offset ≠ 0, la culture s'afficherait en double (colonne cible ET colonne N).

## Documentation utilisateur

- utiliser `Importer fichier`
- formats acceptes : `.xml` (Telepac), `.zip` (shapefile), `.csv` (export Studio Parcellaire)
- confirmer annee et colonne culture si demandees (XML uniquement)

## Limites / dette

## Evolutions recommandees