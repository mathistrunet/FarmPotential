# Démonstration SAFRAN – pipeline de bout en bout

Ce document illustre comment exécuter le worker SAFRAN sur un jeu de parcelles, exporter les indicateurs agroclimatiques et préparer les fichiers pour ingestion côté backend.

## Prérequis

* Python 3.11+ avec `pip install pandas xarray typer` (les tests utilisent également `pytest`).
* Fichiers SAFRAN NetCDF horaires contenant au minimum les variables `T2m`, `RR`, `RH`, `SWdown`, `Wind` et `Nebulosity`.
* Fichier GeoJSON listant les parcelles (géométries en EPSG:4326).

## Étapes

1. **Télécharger les données SAFRAN**

   ```bash
   export SAFRAN_SOURCE_URL=/chemin/vers/netcdf
   export SAFRAN_DATA_DIR=./data/safran
   python -m workers.safran.cli pull --year 2020..2021
   ```

   Les fichiers sont stockés dans `data/safran` avec un fichier de métadonnées (taille + hash) pour chaque année téléchargée.

2. **Construire la base climat pour une ferme**

   ```bash
   python -m workers.safran.cli build --farm-id demo --parcel-file ./samples/parcelles.geojson
   ```

   Cette étape :

   * lit les NetCDF horaires via `xarray` et agrège en journalier (min/max/mean de `T2m`, cumul de `RR`, moyennes de `RH`, `SWdown`, `Wind`, `Nebulosity`),
   * associe chaque parcelle à la maille la plus proche via la distance haversine des centroïdes,
   * calcule les indicateurs agroclimatiques :
     * **GDD** base `SAFRAN_GDD_BASE` (10°C par défaut),
     * **ETP FAO-56** avec altitude `SAFRAN_ALTITUDE_M` (200 m) et albédo `SAFRAN_ALBEDO` (0,23),
     * **ETR** = min(ETP, eau dispo), eau dispo plafonnée par `SAFRAN_SOIL_STORAGE_MM` (150 mm),
     * **Bilan hydrique** = réserve instantanée moins la moitié de la RU max.

   Le résultat est sérialisé dans `data/safran/build/<farm-id>.parquet`.

3. **Exporter pour le backend**

   ```bash
   python -m workers.safran.cli export --farm-id demo --format csv
   ```

   Produit `data/safran/out/demo.csv` (ou `.parquet`) contenant les colonnes attendues par la base :

   * `parcel_id`, `grid_id`, `date`, `tmin`, `tmax`, `tmean`, `rr`, `rh`, `swdown`, `w10m`, `nebulosity`,
   * `gdd`, `etp`, `etr`, `bilan_hydrique`, `soil_storage`, `day_of_year`.

4. **Ingestion côté backend**

   * Lancer les migrations et précharger la grille : `pnpm nx run backend:migrate && pnpm nx run backend:seed-safran-grid`.
   * Importer le CSV généré : `curl -X POST /admin/safran/ingest -F file=@data/safran/out/demo.csv`.
   * Les séries sont insérées dans `safran_daily` et `parcel_climate`, la table `dataset_meta` conserve la provenance (source, année, date de build).

5. **Consommation API**

   * `GET /climate/safran/parcel/:parcelId?from=YYYY-MM-DD&to=YYYY-MM-DD` : renvoie les séries quotidiennes pour une parcelle.
   * `GET /climate/safran/parcel/:parcelId/summary?season=YYYY` : synthèse saisonnière (cumuls pluie/ETP, GDD, déficit hydrique, jours > 30°C).

6. **Frontend**

   * L'onglet *Climat (SAFRAN)* de la vue parcelle consomme l'API publique, affiche des cartes (cumuls pluie/ETP, GDD, déficit hydrique) et deux graphiques (courbe Tmean, barres RR/ETP).
   * Un bouton d'export CSV restitue le contenu de `parcel_climate`.

## Limites & paramétrage

* Les NetCDF doivent être complets sur la période ciblée ; l'intégrité est vérifiée par hash SHA-256.
* Les approximations FAO-56 (pression via altitude, albédo constant) sont configurables via `.env` (`SAFRAN_ALTITUDE_M`, `SAFRAN_ALBEDO`).
* En mode hors ligne, placez les NetCDF dans `SAFRAN_SOURCE_URL` (dossier local) et le worker utilisera les fichiers sans téléchargement réseau.
