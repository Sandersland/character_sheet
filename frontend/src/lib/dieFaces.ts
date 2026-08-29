// Both DiceRoller and PhysicsDiceRoller render the same die shapes and need the same per-face normals/centroids — the scripted roller to know which orientation to unwind onto, the physics roller to build a matching collision body and read which face landed up.
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
// Darker garnet outline so the light numerals stay legible against the glossy resin body's specular highlights.
export const DIE_LABEL_OUTLINE_COLOR = "#7a0c18";

export const FACE_LABEL_FONT_SIZE: Readonly<Record<number, number>> = {
  4: 0.42,
  6: 0.55,
  8: 0.46,
  10: 0.32,
  12: 0.36,
  20: 0.34,
};
export const DEFAULT_FACE_LABEL_FONT_SIZE = 0.36;
export const FACE_LABEL_OUTLINE_WIDTH = 0.02;

// Clears the rounded d6's proud surface and the bevelled polyhedra's faces (pushed out ~DIE_ROUND_RADIUS by the rounding below) without z-fighting.
export const LABEL_SURFACE_OFFSET = 0.11;
// The d6 box (side 1.3) has a circumscribed-sphere diameter of ~2.25 (1.3 * sqrt(3)) — the gap between die centers needs real margin past that or spinning corners visibly intersect the neighboring die.
export const DIE_GAP = 2.6;
const NORMAL_GROUP_EPSILON = 1e-3;

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

// D10_RING_Y is the one non-obvious value: the zigzag ring's ±y offset that makes each kite's four vertices coplanar — any other value leaves the kite non-planar, so its two triangles get distinct normals and computeFaceGroups can't cluster them.
const D10_APEX_HEIGHT = 0.95;
const D10_RING_RADIUS = 0.95;
const D10_KITE_ANGLE = Math.PI / 5; // 36° between adjacent ring vertices
const D10_RING_Y =
  (D10_APEX_HEIGHT * (1 - Math.cos(D10_KITE_ANGLE))) / (1 + Math.cos(D10_KITE_ANGLE));

// Top and bottom kites share an index pattern but opposite handedness, so orientation has to be per-face, not a single global winding.
function orientedOutward(quad: readonly number[], vertices: readonly number[][]): number[] {
  const [a, b, c] = quad.map((i) => new THREE.Vector3(...(vertices[i] as [number, number, number])));
  const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  const centroidSum = new THREE.Vector3();
  for (const i of quad) centroidSum.add(new THREE.Vector3(...(vertices[i] as [number, number, number])));
  return normal.dot(centroidSum) >= 0 ? [...quad] : [quad[0], quad[3], quad[2], quad[1]];
}

// Faces are emitted in value order 1..10 (odd values on the top apex, opposite faces summing to 11) — that emission order IS the face-to-value map, since computeFaceGroups clusters in first-encounter order.
export function d10FaceData(): { vertices: number[][]; faces: number[][] } {
  const vertices: number[][] = [
    [0, D10_APEX_HEIGHT, 0],
    [0, -D10_APEX_HEIGHT, 0],
  ];
  for (let k = 0; k < 10; k++) {
    const angle = D10_KITE_ANGLE * k;
    const y = k % 2 === 0 ? D10_RING_Y : -D10_RING_Y;
    vertices.push([D10_RING_RADIUS * Math.cos(angle), y, D10_RING_RADIUS * Math.sin(angle)]);
  }

  const ring = (k: number): number => 2 + (k % 10);
  const rawFaces: number[][] = [
    [0, ring(0), ring(1), ring(2)],
    [1, ring(3), ring(4), ring(5)],
    [0, ring(2), ring(3), ring(4)],
    [1, ring(1), ring(2), ring(3)],
    [0, ring(4), ring(5), ring(6)],
    [1, ring(9), ring(0), ring(1)],
    [0, ring(6), ring(7), ring(8)],
    [1, ring(7), ring(8), ring(9)],
    [0, ring(8), ring(9), ring(0)],
    [1, ring(5), ring(6), ring(7)],
  ];

  return { vertices, faces: rawFaces.map((quad) => orientedOutward(quad, vertices)) };
}

function createD10Geometry(): THREE.BufferGeometry {
  const { vertices, faces } = d10FaceData();
  const positions: number[] = [];
  for (const [i0, i1, i2, i3] of faces) {
    for (const i of [i0, i1, i2, i0, i2, i3]) positions.push(vertices[i][0], vertices[i][1], vertices[i][2]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// This is always the *logic* geometry: face normals/centroids and result orientation are computed from this sharp solid even on die types whose rendered mesh is rounded (rounding leaves face centers unchanged), and it's also the shape a physics body collides as. The d100, which nothing rolls, falls back to a plain cube — it still tumbles, it just can't land on a matching face.
export function createDieGeometry(faces: number): THREE.BufferGeometry {
  switch (faces) {
    case 4:
      return new THREE.TetrahedronGeometry(0.95);
    case 8:
      return new THREE.OctahedronGeometry(0.95);
    case 10:
      return createD10Geometry();
    case 12:
      return new THREE.DodecahedronGeometry(0.9);
    case 20:
      return new THREE.IcosahedronGeometry(0.95);
    case 6:
    default:
      return new THREE.BoxGeometry(D6_SIZE, D6_SIZE, D6_SIZE);
  }
}

// For non-d6 solids, the rounded look is a Minkowski-style round: take the convex hull of every vertex expanded into a small sphere of points. The flat faces survive (the outer tangent plane of three coplanar vertex-spheres is the original face, pushed out by the radius); the edges and corners become rounded.
const DIE_ROUND_RADIUS = 0.08;
const DIE_ROUND_SAMPLES = 64;
// The many tiny facets that make up a rounded edge sit a few degrees apart and get smoothed together, while the flat-face boundaries are a sharper angle and stay crisp — so faces read flat and edges read round under smooth shading.
const DIE_ROUND_CREASE_ANGLE = 0.5;

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
    case 10:
    case 12:
    case 20:
      return createRoundedPolyhedron(faces);
    default:
      return createDieGeometry(faces);
  }
}

// Clusters triangles by shared outward normal, so this works for any convex die geometry without hardcoding three.js's internal triangulation/index layout (e.g. the dodecahedron's pentagons are built from 3 triangles each).
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

export function quaternionForUpFace(normal: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(normal, UP_AXIS);
}
