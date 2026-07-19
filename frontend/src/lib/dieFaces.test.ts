import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { computeFaceGroups, createDieGeometry, createVisualDieGeometry, d10FaceData } from "@/lib/dieFaces";

function vec(v: number[]): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[1], v[2]);
}

describe("d10 pentagonal trapezohedron (#1102)", () => {
  it("groups into exactly 10 faces", () => {
    expect(computeFaceGroups(createDieGeometry(10))).toHaveLength(10);
  });

  it("has planar kite faces (all four vertices coplanar)", () => {
    const { vertices, faces } = d10FaceData();
    for (const face of faces) {
      expect(face).toHaveLength(4);
      const [a, b, c, d] = face.map((i) => vec(vertices[i]));
      const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      // Fourth vertex must lie on the plane through the first three.
      expect(Math.abs(normal.dot(new THREE.Vector3().subVectors(d, a)))).toBeLessThan(1e-6);
    }
  });

  it("has outward, distinct, antipodally-paired normals", () => {
    const groups = computeFaceGroups(createDieGeometry(10));
    for (const g of groups) expect(g.normal.dot(g.centroid)).toBeGreaterThan(0);

    for (let i = 0; i < groups.length; i++) {
      let antipodes = 0;
      for (let j = 0; j < groups.length; j++) {
        if (i === j) continue;
        const dot = groups[i].normal.dot(groups[j].normal);
        expect(dot).toBeLessThan(1 - 1e-3);
        if (dot < -1 + 1e-3) antipodes += 1;
      }
      expect(antipodes).toBe(1);
    }
  });

  it("maps opposite faces to values summing to 11 with odd values on one apex", () => {
    const groups = computeFaceGroups(createDieGeometry(10));
    for (let i = 0; i < groups.length; i++) {
      const antipode = groups.findIndex((g, j) => j !== i && groups[i].normal.dot(g.normal) < -1 + 1e-3);
      // Value = index + 1 (see DieMesh label / ScriptedDie landing).
      expect(i + 1 + (antipode + 1)).toBe(11);
    }
    // Odd values (even indices) all point toward the same apex.
    const oddSigns = groups.filter((_, i) => i % 2 === 0).map((g) => Math.sign(g.normal.y));
    const evenSigns = groups.filter((_, i) => i % 2 === 1).map((g) => Math.sign(g.normal.y));
    expect(new Set(oddSigns).size).toBe(1);
    expect(new Set(evenSigns).size).toBe(1);
    expect(oddSigns[0]).toBe(-evenSigns[0]);
  });

  it("has all faces equidistant from the center", () => {
    const groups = computeFaceGroups(createDieGeometry(10));
    const inradii = groups.map((g) => g.normal.dot(g.centroid));
    for (const r of inradii) expect(Math.abs(r - inradii[0])).toBeLessThan(1e-6);
  });

  it("groups every supported die into one face per value (characterization)", () => {
    for (const faces of [4, 6, 8, 12, 20]) {
      expect(computeFaceGroups(createDieGeometry(faces))).toHaveLength(faces);
    }
  });

  it("builds a rounded visual d10 hull, not the box fallback", () => {
    const geometry = createVisualDieGeometry(10);
    const position = geometry.getAttribute("position");
    expect(position).toBeDefined();
    // The sharp d10 is 60 positions (10 kites x 2 tris x 3); the rounded hull
    // is far denser, and the box fallback would be only 36.
    expect(position.count).toBeGreaterThan(100);
  });
});
