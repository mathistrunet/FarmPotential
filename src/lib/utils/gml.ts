export type Ring = Array<[number, number]>;

const ELEMENT_NODE = 1;

function childElementsByLocalName(parent: Element, localName: string): Element[] {
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

function firstChildByLocalNames(parent: Element, names: string[]): Element | null {
  for (let i = 0; i < parent.childNodes.length; i += 1) {
    const node = parent.childNodes[i];
    if (node.nodeType === ELEMENT_NODE) {
      const element = node as Element;
      if (names.includes(element.localName ?? '')) {
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

function parseLinearRing(boundaryElement: Element): Ring {
  const linearRing = firstChildByLocalName(boundaryElement, 'LinearRing');
  if (!linearRing) {
    throw new Error('GML: Missing LinearRing');
  }
  const coordinatesElement = firstChildByLocalName(linearRing, 'coordinates');
  if (!coordinatesElement || !coordinatesElement.textContent) {
    throw new Error('GML: Missing coordinates');
  }
  const points = parseGmlCoordinates(coordinatesElement.textContent);
  return ensureClosedRing(points);
}

export function parseGmlCoordinates(text: string): Ring {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  return trimmed
    .split(/\s+/)
    .map((pair) => {
      const cleaned = pair.trim();
      if (!cleaned) {
        throw new Error('GML: Empty coordinate pair');
      }
      const parts = cleaned.split(/[;,\s]+/).filter(Boolean);
      if (parts.length < 2) {
        throw new Error('GML: Invalid coordinate pair');
      }
      const x = Number.parseFloat(parts[0]);
      const y = Number.parseFloat(parts[1]);
      if (Number.isNaN(x) || Number.isNaN(y)) {
        throw new Error('GML: Invalid coordinate values');
      }
      return [x, y] as [number, number];
    });
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
