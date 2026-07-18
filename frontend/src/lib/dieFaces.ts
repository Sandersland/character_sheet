/**
 * Shared, React-free three.js geometry/face-data for dice. Both the scripted
 * animator (DiceRoller) and the physics roller
 * (PhysicsDiceRoller) render the same die shapes and need
 * the same per-face normals/centroids — the scripted roller to know which
 * orientation to unwind onto, the physics roller to both build a matching
 * collision body and to read which face landed up. Keeping this pure and
 * React-free (no hooks, no JSX) means it can be called from either a
 * component or a physics body builder without dragging React along.
 */
import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeVertices, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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
  8: 0.46,
  12: 0.36,
  20: 0.34,
};
export const DEFAULT_FACE_LABEL_FONT_SIZE = 0.36;
export const FACE_LABEL_OUTLINE_WIDTH = 0.02;

// Clears the rounded d6's proud surface and the bevelled polyhedra's faces
// (pushed out ~DIE_ROUND_RADIUS by the rounding below) without z-fighting.
export const LABEL_SURFACE_OFFSET = 0.11;
// The d6 box (side 1.3) has a circumscribed-sphere diameter of ~2.25
// (1.3 * sqrt(3)) — the gap between die centers needs to clear that with
// real margin or spinning corners visibly intersect the neighboring die.
export const DIE_GAP = 2.6;
const NORMAL_GROUP_EPSILON = 1e-3;

// d6 rounded-box tuning: side length matches the old sharp BoxGeometry,
// `segments` smooths the curvature, `radius` is how deep the bevel cuts in.
export const D6_SIZE = 1.3;
const D6_ROUNDING_SEGMENTS = 4;
const D6_ROUNDING_RADIUS = 0.12;

export const UP_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

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
// Edge-rounding for the platonic dice. A real resin die has flat number faces
// with rounded edges/corners — exactly what RoundedBoxGeometry gives the d6.
// For the other solids we approximate the same "round the edges, keep the faces
// flat" result with a Minkowski-style round: take the convex hull of every
// vertex expanded into a small sphere of points. The flat faces survive (the
// outer tangent plane of three coplanar vertex-spheres is the original face,
// pushed out by the radius); the edges and corners become rounded. Tunable.
const DIE_ROUND_RADIUS = 0.08;
const DIE_ROUND_SAMPLES = 64;
// Crease angle (rad) for normal smoothing: the many tiny facets that make up a
// rounded edge sit a few degrees apart and get smoothed together, while the
// flat-face boundaries are a sharper angle and stay crisp — so faces read flat
// and edges read round under smooth shading.
const DIE_ROUND_CREASE_ANGLE = 0.5;

/** Evenly distributed points on a sphere of `radius` (Fibonacci lattice). */
function fibonacciSpherePoints(count: number, radius: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    points.push(
      new THREE.Vector3(Math.cos(theta) * ringRadius, y, Math.sin(theta) * ringRadius).multiplyScalar(
        radius,
      ),
    );
  }
  return points;
}

/** Convex die solid with rounded edges/corners but flat faces (see above). */
function createRoundedPolyhedron(faces: number): THREE.BufferGeometry {
  const base = createDieGeometry(faces);
  const position = base.getAttribute("position");
  const unique = new Map<string, THREE.Vector3>();
  for (let i = 0; i < position.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(position, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!unique.has(key)) unique.set(key, v.clone());
  }
  base.dispose();

  const sphere = fibonacciSpherePoints(DIE_ROUND_SAMPLES, DIE_ROUND_RADIUS);
  const points: THREE.Vector3[] = [];
  for (const vertex of unique.values()) {
    for (const offset of sphere) points.push(vertex.clone().add(offset));
  }

  const hull = mergeVertices(new ConvexGeometry(points));
  return toCreasedNormals(hull, DIE_ROUND_CREASE_ANGLE);
}

export function createVisualDieGeometry(faces: number): THREE.BufferGeometry {
  switch (faces) {
    case 6:
      return new RoundedBoxGeometry(D6_SIZE, D6_SIZE, D6_SIZE, D6_ROUNDING_SEGMENTS, D6_ROUNDING_RADIUS);
    case 4:
    case 8:
    case 12:
    case 20:
      return createRoundedPolyhedron(faces);
    default:
      return createDieGeometry(faces);
  }
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
