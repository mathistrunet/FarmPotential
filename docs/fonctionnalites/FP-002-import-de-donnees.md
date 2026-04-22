# FP-002 - Import de donnees

- ID : `FP-002`
- Statut : `Implante`
- Priorite : `P1`

## Objectif utilisateur

Importer rapidement un parcellaire existant dans FarmPotential a partir de formats de travail deja utilises.

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
- services : `src/services/telepacXml.js`, `src/services/shapefileZip.js`, `src/services/parcellesCsv.js`

## Documentation utilisateur

- utiliser `Importer fichier`
- formats acceptes : `.xml` (Telepac), `.zip` (shapefile), `.csv` (export FarmPotential)
- confirmer annee et colonne culture si demandees (XML uniquement)

## Limites / dette

## Evolutions recommandees