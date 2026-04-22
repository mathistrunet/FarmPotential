# FP-001 - Gestion du parcellaire

- ID : `FP-001`
- Statut : `Implante`
- Priorite : `P1`

## Objectif utilisateur

Permettre de charger, afficher, modifier, organiser et sauvegarder un parcellaire agricole dans l'application.

## Perimetre actuel

- affichage cartographique des parcelles
- mode `Editor` et mode `Viewer`
- dessin et edition de polygones
- suppression / reinitialisation
- selection simple et multiple (box-select clic gauche en mode multi-selection)
- filtrage par annee et groupe
- persistance locale et backend
- carte sans inclinaison (pitch desactive)

## Attendus fonctionnels

- une parcelle doit etre visible et selectionnable sur la carte
- une modification de geometrie ou de proprietes doit etre repercutee dans l'etat applicatif
- les donnees doivent rester disponibles apres refresh si possible

## Donnees d'entree

- GeoJSON de parcelles
- actions utilisateur sur la carte

## Technique

- frontend principal : `src/maps/parcelles/ParcellesEditorMap.jsx`
- store : `src/maps/parcelles/ParcellesStore.jsx`
- backend : `src/services/parcellesBackend.js`

## Documentation utilisateur

- importer ou dessiner des parcelles
- modifier les formes et proprietes
- utiliser `undo/redo` au besoin
- cliquer sur "Multi-selection" dans la barre d'outils pour passer en mode selection multiple, puis maintenir le clic gauche et faire glisser la souris pour selectionner plusieurs parcelles par rectangle
- la rotation et l'inclinaison de la carte sont desactivees (vue 2D plane uniquement)

## Limites / dette


## Evolutions recommandees


