# FP-009 - Mapping des types de sols

- ID : `FP-009`
- Statut : `Implante`
- Priorite : `P2`

## Objectif utilisateur

Faire correspondre les types de sols detectes dans l'application avec les nomenclatures propres a une structure utilisatrice.

## Perimetre actuel

- detection de combinaisons de sols
- regroupement par surface et nombre de parcelles
- selection d'une structure
- creation de types cibles
- association d'une combinaison a un type de structure
- sauvegarde backend
- application aux parcelles

## Attendus fonctionnels

- pouvoir construire un mapping simple et persistant
- reappliquer ce mapping aux parcelles analysees

## Donnees d'entree

- combinaisons de sols detectees
- structure choisie
- types de sols definis par l'utilisateur

## Donnees produites

- dictionnaire de mapping par structure
- enrichissement des parcelles

## Technique

- composant : `src/components/SoilTypeMappingPanel.jsx`
- service : `src/services/soilTypeMapping.js`
- backend : `/api/soil-type-mappings`

## Documentation utilisateur

- activer la couche de sols
- ouvrir l'onglet `mapping-sols`
- creer puis associer les types cibles

## Limites / dette

- ergonomie encore tres technique
- regles de mapping potentiellement a formaliser davantage

## Evolutions recommandees

- ajouter import/export du mapping
- historiser les changements par structure
- proposer des suggestions de mapping
