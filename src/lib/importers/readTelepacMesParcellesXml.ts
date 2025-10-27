import { polygonFromGml, type GmlPolygon } from '../utils/gml';
import { isLambert93Collection, toWgs842154 } from '../utils/reproject';
import type {
  Position,
  TelepacFeature,
  TelepacFeatureCollection,
  TelepacGeometry,
  TelepacParcelleProperties,
} from '../types/telepac';

const TELEPAC_SOURCE: TelepacParcelleProperties['source'] = 'telepac-mesparcelles-xml';
const ELEMENT_NODE = 1;

function createDomParser(): DOMParser {
  const ctor = (globalThis as typeof globalThis & { DOMParser?: typeof DOMParser }).DOMParser;
  if (!ctor) {
    throw new Error('TELEPAC_XML: DOMParser is not available in this environment');
  }

  return new ctor();
}

type Nullable<T> = T | null | undefined;

function decodeInput(input: string | ArrayBuffer): string {
  if (typeof input === 'string') {
    return input;
  }

  return new TextDecoder('utf-8').decode(input);
}

function childElementsByLocalName(parent: Nullable<Element>, localName: string): Element[] {
  if (!parent) {
    return [];
  }

  const result: Element[] = [];
  for (let i = 0; i < parent.childNodes.length; i += 1) {
    const node = parent.childNodes[i];
    if (node.nodeType === ELEMENT_NODE) {
      const element = node as Element;
      if (element.localName === localName) {
        result.push(element);
      }
    }
  }
  return result;
}

function firstChildByLocalName(parent: Nullable<Element>, localName: string): Element | null {
  if (!parent) {
    return null;
  }

  for (let i = 0; i < parent.childNodes.length; i += 1) {
    const node = parent.childNodes[i];
    if (node.nodeType === ELEMENT_NODE) {
      const element = node as Element;
      if (element.localName === localName) {
        return element;
      }
    }
  }

  return null;
}

function descendantsByLocalName(parent: Nullable<Element>, localName: string): Element[] {
  if (!parent) {
    return [];
  }

  const stack: Element[] = [parent];
  const result: Element[] = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (let i = current.childNodes.length - 1; i >= 0; i -= 1) {
      const node = current.childNodes[i];
      if (node.nodeType === ELEMENT_NODE) {
        const element = node as Element;
        if (element.localName === localName) {
          result.push(element);
        }
        stack.push(element);
      }
    }
  }

  return result;
}

function textContent(element: Nullable<Element>): string | null {
  if (!element || element.textContent == null) {
    return null;
  }

  const value = element.textContent.trim();
  return value.length > 0 ? value : null;
}

function textContentOfChild(parent: Nullable<Element>, localName: string): string | null {
  return textContent(firstChildByLocalName(parent, localName));
}

function parseNumberAttribute(element: Element, attribute: string): number | null {
  const raw = element.getAttribute(attribute);
  if (raw == null) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseBooleanValue(raw: Nullable<string>): boolean | undefined {
  if (raw == null) {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'oui') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'non') {
    return false;
  }

  return undefined;
}

function parseBooleanAttribute(element: Nullable<Element>, attribute: string): boolean | undefined {
  if (!element) {
    return undefined;
  }

  return parseBooleanValue(element.getAttribute(attribute) ?? undefined);
}

function parseBooleanChild(parent: Nullable<Element>, localName: string): boolean | undefined {
  const node = firstChildByLocalName(parent, localName);
  return parseBooleanValue(node?.textContent ?? undefined);
}

function normalizeDateLabour(raw: Nullable<string>): string | null {
  if (raw == null) {
    return null;
  }

  const value = raw.trim();
  if (!value || value === '000') {
    return null;
  }

  return value;
}

function collectPoints(polygons: GmlPolygon[]): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  polygons.forEach((polygon) => {
    points.push(...polygon.outer);
    polygon.holes.forEach((ring) => {
      points.push(...ring);
    });
  });
  return points;
}

function collectIlotElements(producteur: Element): Element[] {
  const seen = new Set<Element>();
  const rpg = firstChildByLocalName(producteur, 'rpg');
  const ilotsContainer = firstChildByLocalName(rpg, 'ilots');
  childElementsByLocalName(ilotsContainer, 'ilot').forEach((ilot) => {
    seen.add(ilot);
  });

  if (seen.size === 0) {
    descendantsByLocalName(producteur, 'ilot').forEach((ilot) => {
      seen.add(ilot);
    });
  }

  return Array.from(seen);
}

function collectParcelleElements(ilot: Element): Element[] {
  const seen = new Set<Element>();
  const parcellesContainers = childElementsByLocalName(ilot, 'parcelles');
  parcellesContainers.forEach((container) => {
    childElementsByLocalName(container, 'parcelle').forEach((parcelle) => {
      seen.add(parcelle);
    });
  });

  if (seen.size === 0) {
    descendantsByLocalName(ilot, 'parcelle').forEach((parcelle) => {
      seen.add(parcelle);
    });
  }

  return Array.from(seen);
}

function interpretSrsName(value: Nullable<string>): '2154' | '4326' | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  if (normalized.includes('4326') || normalized.includes('wgs84')) {
    return '4326';
  }
  if (normalized.includes('2154') || normalized.includes('rgf93') || normalized.includes('lambert')) {
    return '2154';
  }

  return undefined;
}

function projectRing(points: Array<[number, number]>, toWgs84: boolean): Position[] {
  if (!toWgs84) {
    return points.map((point) => [point[0], point[1]] as Position);
  }

  return points.map((point) => toWgs842154(point));
}

function convertPolygonToWgs84(polygon: GmlPolygon, polygonElement: Element): Position[][] {
  const srsName = polygonElement.getAttribute('srsName') ?? polygonElement.getAttribute('srsname');
  const srs = interpretSrsName(srsName);
  const lambert = isLambert93Collection(collectPoints([polygon]));

  if (!srs && !lambert) {
    throw new Error('CRS: srsName absent et coordonnées hors enveloppe EPSG:2154');
  }

  if (!srs && lambert) {
    // eslint-disable-next-line no-console
    console.warn('GML: Missing srsName. Assuming EPSG:2154 for reprojection.');
  }

  const toWgs84 = srs !== '4326';

  return [
    projectRing(polygon.outer, toWgs84),
    ...polygon.holes.map((ring) => projectRing(ring, toWgs84)),
  ];
}

function polygonsToGeometry(polygonElements: Element[], polygons: GmlPolygon[]): TelepacGeometry {
  if (polygons.length === 0) {
    throw new Error('GML: Polygon manquant');
  }

  const rings = polygons.map((polygon, index) => convertPolygonToWgs84(polygon, polygonElements[index]));

  if (rings.length === 1) {
    return {
      type: 'Polygon',
      coordinates: rings[0],
    };
  }

  return {
    type: 'MultiPolygon',
    coordinates: rings,
  };
}

function buildProperties(
  pacage: string,
  ilotNumber: number,
  parcelleNumber: number,
  codeCulture: string,
  details: {
    ilotReference: string | null;
    commune: string | null;
    precision: string | null;
    cultureSecondaire: string | null;
    productionSemences?: boolean;
    productionFermiers?: boolean;
    deshydratation?: boolean;
    reconversionPP?: boolean;
    obligationReimplantationPP?: boolean;
    conduiteBio?: boolean;
    maecSurfaceCible?: boolean;
    maecElevageMonogastrique?: boolean;
    dateLabour: string | null;
    justificationMotif: string | null;
    justificationTexte: string | null;
  },
): TelepacParcelleProperties {
  return {
    pacage,
    ilot: ilotNumber,
    ilot_ref: details.ilotReference,
    parcelle: parcelleNumber,
    commune_insee: details.commune,
    code_culture: codeCulture,
    precision: details.precision,
    culture_secondaire: details.cultureSecondaire,
    production_semences: details.productionSemences,
    production_fermiers: details.productionFermiers,
    deshydratation: details.deshydratation,
    reconversion_pp: details.reconversionPP,
    obligation_reimplantation_pp: details.obligationReimplantationPP,
    conduite_bio: details.conduiteBio,
    maec_surface_cible: details.maecSurfaceCible,
    maec_elevage_monogastrique: details.maecElevageMonogastrique,
    date_labour: details.dateLabour,
    justification_motif: details.justificationMotif,
    justification_texte: details.justificationTexte,
    source: TELEPAC_SOURCE,
  };
}

export async function readTelepacMesParcellesXml(input: string | ArrayBuffer): Promise<TelepacFeatureCollection> {
  const xml = decodeInput(input);
  const parser = createDomParser();
  const document = parser.parseFromString(xml, 'application/xml');
  const root = document.documentElement;

  if (!root) {
    throw new Error('TELEPAC_XML: Invalid document');
  }

  const producteurElements = descendantsByLocalName(root, 'producteur');

  const features: TelepacFeature[] = [];
  let ilotCount = 0;

  producteurElements.forEach((producteur) => {
    const pacage = producteur.getAttribute('numero-pacage') ?? '';
    const ilots = collectIlotElements(producteur);
    ilotCount += ilots.length;

    ilots.forEach((ilot) => {
      const ilotNumber = parseNumberAttribute(ilot, 'numero-ilot');
      if (ilotNumber == null) {
        return;
      }

      const ilotReference = ilot.getAttribute('numero-ilot-reference');
      const justification = firstChildByLocalName(ilot, 'justification');
      const justificationMotif = textContentOfChild(justification, 'motifOperation');
      const justificationTexte = textContentOfChild(justification, 'justification');
      const communeFromIlot = textContentOfChild(ilot, 'commune');
      const parcelles = collectParcelleElements(ilot);

      parcelles.forEach((parcelle) => {
        const descriptif = firstChildByLocalName(parcelle, 'descriptif-parcelle');
        if (!descriptif) {
          return;
        }

        const parcelleNumber = parseNumberAttribute(descriptif, 'numero-parcelle');
        if (parcelleNumber == null) {
          return;
        }

        const culturePrincipale = firstChildByLocalName(descriptif, 'culture-principale');
        if (!culturePrincipale) {
          return;
        }

        const codeCulture = textContentOfChild(culturePrincipale, 'code-culture');
        if (!codeCulture) {
          return;
        }

        const precision = textContentOfChild(culturePrincipale, 'precision');
        const cultureSecondaire = culturePrincipale.getAttribute('culture-secondaire');
        const productionSemences = parseBooleanAttribute(culturePrincipale, 'production-semences');
        const productionFermiers = parseBooleanAttribute(culturePrincipale, 'production-fermiers');
        const deshydratation = parseBooleanAttribute(culturePrincipale, 'deshydratation');
        const reconversionPP = parseBooleanChild(culturePrincipale, 'reconversion-pp');
        const obligationReimplantationPP = parseBooleanChild(culturePrincipale, 'obligation-reimplantation-pp');
        const dateLabour = normalizeDateLabour(culturePrincipale.getAttribute('date-labour'));

        const agriBio = firstChildByLocalName(descriptif, 'agri-bio');
        const conduiteBio = parseBooleanAttribute(agriBio, 'conduite-bio');

        const engagementsMaec = firstChildByLocalName(descriptif, 'engagements-maec');
        const maecSurfaceCible = parseBooleanAttribute(engagementsMaec, 'surface-cible');
        const maecElevageMonogastrique = parseBooleanAttribute(engagementsMaec, 'elevage-monogastrique');

        const communeFromParcelle = textContentOfChild(descriptif, 'commune');
        const commune = communeFromParcelle ?? communeFromIlot ?? null;

        const geometrie = firstChildByLocalName(parcelle, 'geometrie');
        if (!geometrie) {
          throw new Error('GML: Polygon manquant');
        }

        const polygonElements = descendantsByLocalName(geometrie, 'Polygon');
        if (polygonElements.length === 0) {
          throw new Error('GML: Polygon manquant');
        }

        const polygons = polygonElements.map((polygonElement) => polygonFromGml(polygonElement));
        const geometry = polygonsToGeometry(polygonElements, polygons);

        const properties = buildProperties(pacage, ilotNumber, parcelleNumber, codeCulture, {
          ilotReference: ilotReference ?? null,
          commune,
          precision: precision ?? null,
          cultureSecondaire: cultureSecondaire ?? null,
          productionSemences,
          productionFermiers,
          deshydratation,
          reconversionPP,
          obligationReimplantationPP,
          conduiteBio,
          maecSurfaceCible,
          maecElevageMonogastrique,
          dateLabour,
          justificationMotif,
          justificationTexte,
        });

        const feature: TelepacFeature = {
          type: 'Feature',
          geometry,
          properties,
        };

        features.push(feature);
      });
    });
  });

  if (ilotCount === 0 || features.length === 0) {
    throw new Error('TELEPAC_XML: structure invalide (aucun ilot/parcelle)');
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
