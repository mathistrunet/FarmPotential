# FP-005 - Export des donnees

- ID : `FP-005`
- Statut : `Partiel`
- Priorite : `P1`

## Objectif utilisateur

Exporter les donnees du parcellaire dans des formats reutilisables en dehors de FarmPotential.

## Perimetre actuel

- export `XML Telepac`
- export `CSV`
- composant / service d'export shapefile present mais non expose comme parcours principal

## Attendus fonctionnels

- le fichier exporte doit correspondre aux donnees visibles / editees
- les metadonnees d'exploitation doivent etre reprises quand necessaire
- le fichier export `CSV` doit contenir l'ensemble des informations

## Donnees d'entree

- parcelles courantes
- choix de format
- parametres d'export

## Donnees produites

- fichier XML
- fichier CSV

## Technique

- composant : `src/Front/ExportMenuButton.jsx`
- services : `src/services/telepacXml.js`, `src/services/parcellesCsv.js`
- export shapefile : `src/Front/TelepacButton.jsx`, `src/services/parcelleShapefile.js`

## Documentation utilisateur

- ouvrir `Faire un export`
- choisir le format
- saisir les parametres demandes

## Limites / dette

- statut de l'export shapefile a clarifier
- certains usages metier d'export restent a formaliser

## Evolutions recommandees

- officialiser l'export shapefile du perimetre produit
- produire un recapitulatif des champs non exportes
