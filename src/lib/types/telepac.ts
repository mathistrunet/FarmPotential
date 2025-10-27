export type Position = [number, number];

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: Position[][];
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}

export type Geometry = PolygonGeometry | MultiPolygonGeometry;

export interface Feature<G extends Geometry = Geometry, P = Record<string, unknown>> {
  type: 'Feature';
  geometry: G;
  properties: P;
}

export interface FeatureCollection<G extends Geometry = Geometry, P = Record<string, unknown>> {
  type: 'FeatureCollection';
  features: Array<Feature<G, P>>;
}

export interface TelepacParcelleProperties {
  pacage: string;
  ilot: number;
  ilot_ref?: string | null;
  parcelle: number;
  commune_insee?: string | null;
  code_culture: string;
  precision?: string | null;
  culture_secondaire?: string | null;
  production_semences?: boolean;
  production_fermiers?: boolean;
  deshydratation?: boolean;
  reconversion_pp?: boolean;
  obligation_reimplantation_pp?: boolean;
  conduite_bio?: boolean;
  maec_surface_cible?: boolean;
  maec_elevage_monogastrique?: boolean;
  date_labour?: string | null;
  justification_motif?: string | null;
  justification_texte?: string | null;
  source: 'telepac-mesparcelles-xml';
}

export type TelepacGeometry = PolygonGeometry | MultiPolygonGeometry;

export type TelepacFeature = Feature<TelepacGeometry, TelepacParcelleProperties>;

export type TelepacFeatureCollection = FeatureCollection<TelepacGeometry, TelepacParcelleProperties>;
