# FP-008 - Consultation SoilGrids par parcelle

- ID : `FP-008`
- Statut : `Implante`
- Priorite : `P2`

## Objectif utilisateur

Obtenir une estimation pedologique rapide sur une parcelle sans quitter l'application.

## Perimetre actuel

- appel backend par identifiant parcelle
- calcul d'un point de sonde
- cache
- resume pedologique
- profil par profondeur
- rafraichissement force

## Attendus fonctionnels

- affichage des estimations pour une parcelle selectionnee
- indication claire de la date et du statut de cache
- transparence sur les limites d'interpretation

## Donnees d'entree

- identifiant parcelle
- geometrie parcelle

## Donnees produites

- profile SoilGrids
- summary d'indicateurs

## Technique

- viewer : `src/maps/parcelles/ParcellesViewerMap.jsx`
- panneau : `src/components/ParcelSoilPanel.jsx`
- backend : `scripts/geojson-server.mjs`
- services : `src/services/soilgridsBackend.js`, `src/services/soilgrids.js`

## Documentation utilisateur

- cliquer sur une parcelle en mode viewer
- consulter le panneau SoilGrids

## Limites / dette

- donnees heuristiques
- resolution d'environ 250 m

## Evolutions recommandees

- enrichir l'explication des indicateurs
- distinguer plus clairement donnees brutes et derivees