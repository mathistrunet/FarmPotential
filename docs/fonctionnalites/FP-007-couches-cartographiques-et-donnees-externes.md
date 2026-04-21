# FP-007 - Couches cartographiques et donnees externes

- ID : `FP-007`
- Statut : `Implante`
- Priorite : `P2`

## Objectif utilisateur

Donner du contexte cartographique et agronomique autour du parcellaire.

## Perimetre actuel

- fonds raster configures
- couches IGN selon configuration
- RPG WFS
- carte des sols France

>Fichier de données interne :
>- grille SoilGrids visible
>- donnees de sols departementales
>- toponymie regionale

## Attendus fonctionnels

- activer / desactiver des couches utiles
- regler leur opacite
- enrichir la lecture du territoire

## Donnees d'entree

- configuration raster
- sources externes ou locales

## Donnees produites

- affichage cartographique contextuel

## Technique

- `src/config/rasterLayers.js`
- `src/features/map/useRasterLayers.js`
- services GeoPackage et RPG

## Documentation utilisateur

- utiliser l'onglet calques
- activer les couches selon le besoin

## Limites / dette

- dependance a des donnees externes et locales volumineuses

## Evolutions recommandees

- documenter chaque source et prerequis
- ajouter des informations de chargement / indisponibilite plus lisibles