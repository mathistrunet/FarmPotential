export type Ring = Array<[number, number]>;

const ELEMENT_NODE = 1;

type Nullable<T> = T | null | undefined;

function normalizeLocalName(value: Nullable<string>): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

function childElementsByLocalName(parent: Element, localName: string): Element[] {
  const result: Element[] = [];
  const expected = localName.toLowerCase();
  for (let i = 0; i < parent.childNodes.length; i += 1) {
    const node = parent.childNodes[i];
    if (node.nodeType === ELEMENT_NODE) {
      const element = node as Element;
      if (normalizeLocalName(element.localName) === expected) {
        result.push(element);
      }
    }
  }
  return result;
}

function firstChildByLocalNames(parent: Element, names: string[]): Element | null {
  const normalizedNames = names.map((name) => name.toLowerCase());
  for (let i = 0; i < parent.childNodes.length; i += 1) {
    const node = parent.childNodes[i];
    if (node.nodeType === ELEMENT_NODE) {
      const element = node as Element;
      if (normalizedNames.includes(normalizeLocalName(element.localName) ?? '')) {
        return element;
      }
    }
  }
  return null;
}

function firstChildByLocalName(parent: Element, name: string): Element | null {
  return firstChildByLocalNames(parent, [name]);
}

function ensureClosedRing(points: Ring): Ring {
  if (points.length === 0) {
    return points;
  }
  const [firstX, firstY] = points[0];
  const [lastX, lastY] = points[points.length - 1];
  if (firstX === lastX && firstY === lastY) {
    return points;
  }
  return [...points, [firstX, firstY]];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createSeparatorRegex(separator: Nullable<string>, fallback: RegExp): RegExp {
  if (!separator || separator.length === 0) {
    return fallback;
  }
  return new RegExp(`(?:${escapeRegExp(separator)})+`);
}

function replaceDecimalSeparator(value: string, decimal: string): string {
  if (!decimal || decimal === '.') {
    return value;
  }

  let result = '';
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === decimal) {
      const previous = value[i - 1];
      const next = value[i + 1];
      const previousIsDigit = previous !== undefined && /[0-9]/.test(previous);
      const nextIsDigit = next !== undefined && /[0-9]/.test(next);
      if (previousIsDigit && nextIsDigit) {
        result += '.';
        continue;
      }
    }
    result += char;
  }

  return result;
}

function parseCoordinateValue(raw: string, decimal: string): number {
  const normalized = replaceDecimalSeparator(raw, decimal);
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) {
    throw new Error('GML: Invalid coordinate values');
  }
  return parsed;
}

function parseCoordinatePair(
  tuple: string,
  options: { decimal: string; coordinateSeparator: RegExp },
): [number, number] {
  const trimmed = tuple.trim();
  if (!trimmed) {
    throw new Error('GML: Empty coordinate pair');
  }

  const normalizedTuple = replaceDecimalSeparator(trimmed, options.decimal);
  const parts = normalizedTuple
    .split(options.coordinateSeparator)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length < 2) {
    const fallback = normalizedTuple
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (fallback.length < 2) {
      const semicolonSplit = normalizedTuple
        .split(/;/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      if (semicolonSplit.length < 2) {
        throw new Error('GML: Invalid coordinate pair');
      }
      return [
        parseCoordinateValue(semicolonSplit[0], '.'),
        parseCoordinateValue(semicolonSplit[1], '.'),
      ];
    }
    return [parseCoordinateValue(fallback[0], '.'), parseCoordinateValue(fallback[1], '.')];
  }

  return [
    parseCoordinateValue(parts[0], '.'),
    parseCoordinateValue(parts[1], '.'),
  ];
}

function parseLinearRingCoordinates(element: Element, options: {
  decimal: string;
  coordinateSeparator: RegExp;
  tupleSeparator: RegExp;
}): Ring {
  const text = element.textContent ?? '';
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  return trimmed
    .split(options.tupleSeparator)
    .map((tuple) => tuple.trim())
    .filter((tuple) => tuple.length > 0)
    .map((tuple) => parseCoordinatePair(tuple, options));
}

function parseLinearRingPosList(linearRing: Element, posList: Element): Ring {
  const text = posList.textContent ?? '';
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const decimal = posList.getAttribute('decimal')
    ?? linearRing.getAttribute('decimal')
    ?? '.';
  const dimensionAttr = posList.getAttribute('srsDimension')
    ?? linearRing.getAttribute('srsDimension');
  const dimensionParsed = dimensionAttr ? Number.parseInt(dimensionAttr, 10) : NaN;
  const dimension = Number.isNaN(dimensionParsed) || dimensionParsed < 2 ? 2 : dimensionParsed;

  const normalized = replaceDecimalSeparator(trimmed, decimal);
  const parts = normalized
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const value = Number.parseFloat(part);
      if (Number.isNaN(value)) {
        throw new Error('GML: Invalid coordinate values');
      }
      return value;
    });

  if (parts.length % dimension !== 0) {
    throw new Error('GML: Invalid posList length');
  }

  const ring: Ring = [];
  for (let i = 0; i < parts.length; i += dimension) {
    const x = parts[i];
    const y = parts[i + 1];
    if (x == null || y == null) {
      throw new Error('GML: Invalid posList coordinate pair');
    }
    ring.push([x, y]);
  }

  return ring;
}

function parseLinearRing(boundaryElement: Element): Ring {
  const linearRing = firstChildByLocalName(boundaryElement, 'LinearRing');
  if (!linearRing) {
    throw new Error('GML: Missing LinearRing');
  }

  const coordinatesElement = firstChildByLocalName(linearRing, 'coordinates');
  if (coordinatesElement && coordinatesElement.textContent) {
    const decimal = coordinatesElement.getAttribute('decimal') ?? '.';
    const coordinateSeparator = createSeparatorRegex(coordinatesElement.getAttribute('cs'), /\s*,\s*/);
    const tupleSeparator = createSeparatorRegex(coordinatesElement.getAttribute('ts'), /\s+/);
    const points = parseLinearRingCoordinates(coordinatesElement, {
      decimal,
      coordinateSeparator,
      tupleSeparator,
    });
    return ensureClosedRing(points);
  }

  const posList = firstChildByLocalName(linearRing, 'posList');
  if (posList && posList.textContent) {
    const points = parseLinearRingPosList(linearRing, posList);
    return ensureClosedRing(points);
  }

  throw new Error('GML: Missing coordinates');
}

export interface GmlPolygon {
  outer: Ring;
  holes: Ring[];
}

export function polygonFromGml(polygonElement: Element): GmlPolygon {
  const outerBoundary = firstChildByLocalNames(polygonElement, ['outerBoundaryIs', 'exterior']);
  if (!outerBoundary) {
    throw new Error('GML: Missing outerBoundaryIs');
  }
  const outer = parseLinearRing(outerBoundary);

  const innerBoundaries = childElementsByLocalName(polygonElement, 'innerBoundaryIs').concat(
    childElementsByLocalName(polygonElement, 'interior'),
  );

  const holes = innerBoundaries.map((boundary) => parseLinearRing(boundary));

  return { outer, holes };
}
