# FP-002 - Import de donnees

- ID : `FP-002`
- Statut : `Implante`
- Priorite : `P1`

## Objectif utilisateur

Importer rapidement un parcellaire existant dans FarmPotential a partir de formats de travail deja utilises.

## Perimetre actuel

- import `XML Telepac`
- import `ZIP shapefile`
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

## Donnees produites

- features GeoJSON exploitees par l'application

## Technique

- composant : `src/Front/TelepacButton.jsx`
- services : `src/services/telepacXml.js`, `src/services/shapefileZip.js`

## Documentation utilisateur

- utiliser `Importer fichier`
- confirmer annee et colonne culture si demandees

## Limites / dette

## Evolutions recommandees

- ajouter un import CSV parcellaire