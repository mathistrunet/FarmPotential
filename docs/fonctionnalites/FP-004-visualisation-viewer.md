# FP-004 - Visualisation Viewer

- ID : `FP-004`
- Statut : `Implante`
- Priorite : `P1`

## Objectif utilisateur

Consulter rapidement le parcellaire sans passer par l'interface complete d'edition.

## Perimetre actuel

- mode `Viewer`
- filtres par annee
- filtres multi-cultures
- coloration par culture
- popup parcelle
- ouverture du panneau SoilGrids

## Attendus fonctionnels

- consultation fluide
- filtrage lisible
- lecture rapide des donnees de base

## Donnees d'entree

- collection de parcelles
- filtres annee et culture

## Donnees produites

- vue filtree
- selection d'une parcelle pour consultation

## Technique

- composant : `src/maps/parcelles/ParcellesViewerMap.jsx`

## Documentation utilisateur

- basculer en mode `Viewer`
- filtrer par annee et culture
- cliquer sur une parcelle pour details

## Limites / dette

- mode oriente consultation simple
- peu de personnalisation de l'affichage a ce stade

## Evolutions recommandees

- ajouter plus de criteres de filtres
- proposer des exports depuis le viewer si pertinent
