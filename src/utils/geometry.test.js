import { describe, expect, it } from "vitest";

import { ringCentroidLonLat } from "./geometry";

describe("ringCentroidLonLat", () => {
  it("renvoie le centroïde d'un polygone simple", () => {
    const ring = [
      [2.0, 48.0],
      [2.1, 48.0],
      [2.1, 48.1],
      [2.0, 48.1],
      [2.0, 48.0],
    ];

    const centroid = ringCentroidLonLat(ring);
    expect(centroid).toBeTruthy();
    const [lon, lat] = centroid;
    expect(lon).toBeCloseTo(2.05, 2);
    expect(lat).toBeCloseTo(48.05, 2);
  });

  it("retourne null pour un anneau invalide", () => {
    expect(ringCentroidLonLat([])).toBeNull();
    expect(ringCentroidLonLat([[2, 48]])).toBeNull();
  });
});
