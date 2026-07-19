import * as CANNON from "cannon-es";
import { describe, expect, it } from "vitest";

import { computeFaceGroups, createDieGeometry, quaternionForUpFace, type FaceGroup } from "@/lib/dieFaces";
import {
  createDiceWorld,
  createDieBody,
  createRollResolver,
  FIXED_DT,
  FLOOR_Y,
  readUpFace,
  throwDie,
  type PhysicsDie,
} from "@/lib/physicsDice";

function groupsFor(faces: number): FaceGroup[] {
  return computeFaceGroups(createDieGeometry(faces));
}

function restYFor(groups: FaceGroup[]): number {
  return groups.length > 0 ? groups[0].normal.dot(groups[0].centroid) : 0.65;
}

// One die placed flat on a chosen face, at its true rest height, for readUpFace.
function placeOnFace(body: CANNON.Body, groups: FaceGroup[], faceIndex: number, restY: number): void {
  const q = quaternionForUpFace(groups[faceIndex].normal);
  body.quaternion.set(q.x, q.y, q.z, q.w);
  body.position.set(0, FLOOR_Y + restY, 0);
}

describe("d10 physics body + face reading (#1102)", () => {
  const diceMaterial = new CANNON.Material("dice");

  it("builds a 10-face / 12-vertex convex polyhedron for the d10", () => {
    const body = createDieBody(diceMaterial, 10);
    const shape = body.shapes[0];
    expect(shape).toBeInstanceOf(CANNON.ConvexPolyhedron);
    const poly = shape as CANNON.ConvexPolyhedron;
    expect(poly.faces).toHaveLength(10);
    expect(poly.vertices).toHaveLength(12);
  });

  it("keeps the d6 body a box", () => {
    const body = createDieBody(diceMaterial, 6);
    expect(body.shapes[0]).toBeInstanceOf(CANNON.Box);
  });

  it("reads each d10 face up bijectively when landed flat on it", () => {
    const groups = groupsFor(10);
    const restY = restYFor(groups);
    const body = createDieBody(diceMaterial, 10);
    const read = new Set<number>();
    for (let i = 0; i < 10; i++) {
      placeOnFace(body, groups, i, restY);
      const result = readUpFace(body, groups, restY);
      expect(result).toEqual({ value: i + 1, confidence: expect.any(Number), cocked: false });
      read.add(result.value);
    }
    expect(read.size).toBe(10);
  });

  it("flags an off-axis tilt as cocked", () => {
    const groups = groupsFor(10);
    const restY = restYFor(groups);
    const body = createDieBody(diceMaterial, 10);
    placeOnFace(body, groups, 0, restY);
    const tilt = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(1, 0, 0), (25 * Math.PI) / 180);
    body.quaternion = tilt.mult(body.quaternion);
    expect(readUpFace(body, groups, restY).cocked).toBe(true);
  });

  it("flags a raised (stacked) die as cocked", () => {
    const groups = groupsFor(10);
    const restY = restYFor(groups);
    const body = createDieBody(diceMaterial, 10);
    placeOnFace(body, groups, 0, restY);
    body.position.y += 1;
    expect(readUpFace(body, groups, restY).cocked).toBe(true);
  });

  it("falls back to value 1 for a die with no face groups (d100)", () => {
    const body = createDieBody(diceMaterial, 6);
    expect(readUpFace(body, [], 0.65)).toEqual({ value: 1, confidence: 1, cocked: false });
  });

  function resolveOne(faces: number): number {
    const groups = groupsFor(faces);
    const restY = restYFor(groups);
    const { world, diceMaterial: material } = createDiceWorld(1);
    const body = createDieBody(material, faces);
    world.addBody(body);
    const dice: PhysicsDie[] = [{ body, groups, laneX: 0, restY }];
    const resolver = createRollResolver(world, dice);
    throwDie(body, 0);
    let tick = resolver.tick(FIXED_DT);
    let iterations = 0;
    while (!tick.done && iterations < 600) {
      tick = resolver.tick(FIXED_DT);
      iterations += 1;
    }
    expect(tick.done).toBe(true);
    return tick.values![0];
  }

  it("resolves a thrown d10 to a value in 1..10, with spread across rolls", () => {
    const observed = new Set<number>();
    for (let r = 0; r < 30; r++) {
      const value = resolveOne(10);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(10);
      observed.add(value);
    }
    expect(observed.size).toBeGreaterThan(1);
  });

  it("still resolves a thrown d6 to a value in 1..6 (regression)", () => {
    for (let r = 0; r < 10; r++) {
      const value = resolveOne(6);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
    }
  });
});
