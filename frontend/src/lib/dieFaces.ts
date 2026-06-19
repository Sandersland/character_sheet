/**
 * Shared, React-free three.js geometry/face-data for dice. Both the scripted
 * animator (`components/DiceRoller.tsx`) and the physics roller
 * (`components/PhysicsDiceRoller.tsx`) render the same die shapes and need
 * the same per-face normals/centroids — the scripted roller to know which
 * orientation to unwind onto, the physics roller to both build a matching
 * collision body and to read which face landed up. Keeping this pure and
 * React-free (no hooks, no JSX) means it can be called from either a
 * component or a physics body builder without dragging React along.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// Mirrors index.css's garnet/parchment tokens — R3F materials can't read
// CSS custom properties, so the values are duplicated here by hand.
export const DIE_BODY_COLOR = "#cf1124"; // --color-garnet-600
export const DIE_BODY_COLOR_DROPPED = "#b8b2a7"; // --color-parchment-300
export const DIE_LABEL_COLOR = "#faf9f7"; // --color-parchment-50
export const DIE_LABEL_COLOR_DROPPED = "#857f72"; // --color-parchment-500
// Darker garnet outline so the light numerals stay legible against the
// glossy resin body's specular highlights.
export const DIE_LABEL_OUTLINE_COLOR = "#7a0c18";

// Game-shop dice print their numbers large enough to nearly fill the face —
// these are sized well past the old, more conservative values.
export const FACE_LABEL_FONT_SIZE: Readonly<Record<number, number>> = {
  4: 0.42,
  6: 0.55,
  8: 0.4,
  12: 0.3,
  20: 0.26,
};
export const DEFAULT_FACE_LABEL_FONT_SIZE = 0.36;
export const FACE_LABEL_OUTLINE_WIDTH = 0.015;

// Bumped from the original 0.045 so the larger labels below clear the
// rounded d6's slightly proud-rendered surface without z-fighting.
export const LABEL_SURFACE_OFFSET = 0.06;
// The d6 box (side 1.3) has a circumscribed-sphere diameter of ~2.25
// (1.3 * sqrt(3)) — the gap between die centers needs to clear that with
// real margin or spinning corners visibly intersect the neighboring die.
export const DIE_GAP = 2.6;
export const NORMAL_GROUP_EPSILON = 1e-3;

// d6 rounded-box tuning: side length matches the old sharp BoxGeometry,
// `segments` smooths the curvature, `radius` is how deep the bevel cuts in.
export const D6_SIZE = 1.3;
export const D6_ROUNDING_SEGMENTS = 4;
export const D6_ROUNDING_RADIUS = 0.12;

export const UP_AXIS = new THREE.Vector3(0, 1, 0);
export const Z_AXIS = new THREE.Vector3(0, 0, 1);

export interface FaceGroup {
  normal: THREE.Vector3;
  centroid: THREE.Vector3;
  labelQuaternion: THREE.Quaternion;
}

/** Sharp three.js geometry for a given die type; SRD dice with no built-in
 * polyhedron (only d10/d100, the pentagonal trapezohedron) fall back to a
 * plain cube — it still tumbles, it just can't land on a matching face.
 * This is always the *logic* geometry (see `createVisualDieGeometry`): face
 * normals/centroids and result orientation are computed from this sharp
 * solid even on die types whose rendered mesh is rounded, since rounding
 * only affects geometry near edges/corners and leaves face centers (and so
 * "which face is up") unchanged. This is also the shape a physics body
 * should collide as — collisions against a rounded mesh aren't worth the
 * cost, and the sharp solid's face normals are exactly what's needed to
 * read which face landed up after the body comes to rest. */
export function createDieGeometry(faces: number): THREE.BufferGeometry {
  switch (faces) {
    case 4:
      return new THREE.TetrahedronGeometry(0.95);
    case 8:
      return new THREE.OctahedronGeometry(0.95);
    case 12:
      return new THREE.DodecahedronGeometry(0.9);
    case 20:
      return new THREE.IcosahedronGeometry(0.95);
    case 6:
    default:
      return new THREE.BoxGeometry(D6_SIZE, D6_SIZE, D6_SIZE);
  }
}

/** Rendered geometry for a given die type. The d6 — the only die type
 * actually rolled in the app today — gets a rounded box for the realistic
 * "resin die from a game shop" look; other die types aren't rounded yet
 * and just reuse the sharp logic solid. */
export function createVisualDieGeometry(faces: number): THREE.BufferGeometry {
  if (faces === 6) {
    return new RoundedBoxGeometry(D6_SIZE, D6_SIZE, D6_SIZE, D6_ROUNDING_SEGMENTS, D6_ROUNDING_RADIUS);
  }
  return createDieGeometry(faces);
}

/**
 * Groups a polyhedron's triangles into faces by clustering on shared
 * (near-identical) outward normals, then averages each face's unique
 * vertices for its centroid. This works for any convex die geometry without
 * having to hardcode three.js's internal triangulation/index layout (e.g.
 * the dodecahedron's pentagons are built from 3 triangles each).
 */
export function computeFaceGroups(geometry: THREE.BufferGeometry): FaceGroup[] {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = nonIndexed.getAttribute("position");
  const triangleCount = position.count / 3;

  const raw: { normal: THREE.Vector3; vertices: Map<string, THREE.Vector3> }[] = [];

  for (let i = 0; i < triangleCount; i++) {
    const a = new THREE.Vector3().fromBufferAttribute(position, i * 3);
    const b = new THREE.Vector3().fromBufferAttribute(position, i * 3 + 1);
    const c = new THREE.Vector3().fromBufferAttribute(position, i * 3 + 2);
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();

    let group = raw.find((candidate) => candidate.normal.dot(normal) > 1 - NORMAL_GROUP_EPSILON);
    if (!group) {
      group = { normal, vertices: new Map() };
      raw.push(group);
    }
    for (const vertex of [a, b, c]) {
      const key = `${vertex.x.toFixed(4)},${vertex.y.toFixed(4)},${vertex.z.toFixed(4)}`;
      if (!group.vertices.has(key)) group.vertices.set(key, vertex.clone());
    }
  }

  return raw.map(({ normal, vertices }) => {
    const centroid = new THREE.Vector3();
    for (const vertex of vertices.values()) centroid.add(vertex);
    centroid.divideScalar(vertices.size);
    return { normal, centroid, labelQuaternion: new THREE.Quaternion().setFromUnitVectors(Z_AXIS, normal) };
  });
}

/** The rotation that brings a given local face normal to point straight up. */
export function quaternionForUpFace(normal: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(normal, UP_AXIS);
}
