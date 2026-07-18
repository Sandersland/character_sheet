/**
 * Shared, React-free cannon-es physics for the real-physics dice roller
 * (PhysicsDiceRoller). Builds the world/tray/bodies, throws
 * dice with randomized velocity, steps the simulation, and reads the
 * settled face value off each die — physics *is* the source of randomness
 * here, unlike `rollDie`. Kept separate from the React
 * component so the same throw/step/read logic can run either across many
 * animation frames (the normal tumble) or synchronously in a tight loop
 * (the reduced-motion/skip path) without duplicating it.
 */
import * as CANNON from "cannon-es";
import * as THREE from "three";

import { D6_SIZE, DIE_GAP, UP_AXIS, type FaceGroup } from "./dieFaces";

// Exaggerated well past Earth gravity (9.8) for snappy, readable game feel —
// matches the scale the Codrops cannon-es dice article settled on for the
// same reason: a "physically correct" 9.8 reads as floaty in a ~2-unit-tall
// scene that settles in a second or two.
const GRAVITY_Y = -50;

// Fixed simulation timestep; cannon-es internally sub-steps real frame time
// against this when stepped with `timeSinceLastCalled` (see useFrame call
// site), so motion stays stable regardless of the browser's actual frame rate.
// Exported so the React roller's synchronous fast-forward path advances sim
// time by the exact same step as an animated frame — single source of truth.
export const FIXED_DT = 1 / 60;
const MAX_SUB_STEPS = 6;

const DIE_MASS = 1;
const DICE_FRICTION = 0.1;
const DICE_RESTITUTION = 0.3;
const FLOOR_FRICTION = 0.3;
const FLOOR_RESTITUTION = 0.3;

const SLEEP_SPEED_LIMIT = 0.15;
const SLEEP_TIME_LIMIT = 0.2;
// Secondary settle check (belt-and-suspenders alongside cannon's own sleep
// state) for any body that's effectively stopped but hasn't formally slept
// yet — e.g. dice resting close enough together that tiny mutual nudges keep
// re-arming cannon's own sleep timer indefinitely. Deliberately the *same*
// magnitude as SLEEP_SPEED_LIMIT above: this isn't a looser threshold, just
// an alternate, ungated path to the same "basically stopped" conclusion —
// see SETTLE_FALLBACK_GRACE_MS below for why it can't fire immediately.
const SETTLE_VELOCITY_THRESHOLD = 0.15;
// How long a die must have been awake since its last throw before the
// instantaneous fallback above is even consulted. Without this gate, the
// fallback — checking the *same* speed limit cannon's own sleepState uses,
// but with no sustain requirement — can report "settled" on whichever
// single tick a die's velocity happens to dip during one of its small
// decaying bounces, well before it's actually finished rocking to a stop;
// since the resolver waits for *every* die to settle before reading any of
// them, that one premature read is enough to misread a die that was about
// to land flat for real a few frames later. 900ms is comfortably longer
// than a normal landing takes to reach true `SLEEPING` via cannon's own
// sustained check, so in the common case this fallback never actually
// fires — it only kicks in for the close-neighbors-jittering edge case
// above, well before MAX_ROLL_MS's full safety-timeout would.
const SETTLE_FALLBACK_GRACE_MS = 900;

// Matches DiceScene's <ContactShadows position={[0, -1.1, 0]}> — the tray
// floor sits exactly where the shadow is already painted.
export const FLOOR_Y = -1.1;
// Conservative fixed tray Z extent, sized to stay within the visible band of
// the fixed-height (`h-44`), variable-width, non-resizing canvas (see
// DiceScene) rather than computed from the actual rendered width, which we
// deliberately never read. X is handled separately (see trayHalfXFor below)
// since it has to scale with how many dice are thrown side by side.
const TRAY_HALF_Z = 2;
const TRAY_WALL_HEIGHT = 4;
const TRAY_WALL_THICKNESS = 0.5;
// How far a die's start x can jitter off its lane center before being
// thrown — small, for the same neighbor-clipping reason DiceRoller's
// scripted skitter stays z-only (see the DIE_GAP comment).
const START_X_JITTER = 0.4;
// Room beyond a die's outermost resting lane for its own half-width, the
// start jitter above, and some margin to actually scatter/bounce around in
// rather than touching the wall at rest — without this, a multi-die roll's
// outer lanes (at `((count-1)/2) * DIE_GAP`) can start *outside* a
// fixed-width tray, which visibly clips/scatters that die past the canvas
// edge instead of containing it.
const TRAY_LANE_MARGIN = D6_SIZE / 2 + START_X_JITTER + 1.5;

/** The tray's X half-extent for a roll of `count` dice spaced `DIE_GAP`
 *  apart — wide enough that every die's lane sits comfortably inside the
 *  walls, however many dice are thrown side by side. */
function trayHalfXFor(count: number): number {
  const outermostLaneX = count > 1 ? ((count - 1) / 2) * DIE_GAP : 0;
  return outermostLaneX + TRAY_LANE_MARGIN;
}

const START_HEIGHT_MIN = 4;
const START_HEIGHT_MAX = 6;
const THROW_VELOCITY_X: readonly [number, number] = [-2, 2];
const THROW_VELOCITY_Y: readonly [number, number] = [-2, 0];
const THROW_VELOCITY_Z: readonly [number, number] = [-3, -1];
const THROW_ANGULAR_VELOCITY = 8;

// A flat-resting cube face points within a few degrees of straight up;
// anything further off than this is treated as not a clean landing (an
// edge/corner balance, or a die resting against a neighbor) and gets
// re-thrown rather than read as-is. 20 degrees leaves a wide margin below
// anything that would actually indicate an edge/corner balance (tens of
// degrees off) while tolerating the couple-degree residual tilt ordinary
// contact softness/low friction leaves even on a die that's genuinely done
// settling.
const COCK_DOT_THRESHOLD = Math.cos((20 * Math.PI) / 180);
// A die resting flat on the floor has its center within this tolerance of
// the expected single-layer rest height; anything higher is very likely
// stacked on top of another die rather than cocked on an edge, which the
// dot-product check alone wouldn't catch (a die lying flat on top of a
// neighbor still has a face pointing straight up). Still well short of a
// full die-height (~1.3) that true stacking would show.
const REST_HEIGHT_TOLERANCE = 0.35;

const MAX_REROLL_ATTEMPTS = 5;
// Safety cap so a roll can never hang if dice somehow never settle (e.g. a
// degenerate stack) — past this, whatever's still cocked gets snapped to its
// nearest face instead of re-thrown again.
const MAX_ROLL_MS = 4000;

/** One die's physics body plus the face data needed to read its result and
 *  the lane (resting x position) it should be re-thrown from on a retry. */
export interface PhysicsDie {
  body: CANNON.Body;
  groups: FaceGroup[];
  laneX: number;
}

/** A fresh world + tray sized for `count` dice, ready to have dice bodies
 *  added to it. */
export function createDiceWorld(count: number): { world: CANNON.World; diceMaterial: CANNON.Material } {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY_Y, 0) });
  world.allowSleep = true;

  const diceMaterial = new CANNON.Material("dice");
  const floorMaterial = new CANNON.Material("tray");
  world.addContactMaterial(
    new CANNON.ContactMaterial(diceMaterial, diceMaterial, {
      friction: DICE_FRICTION,
      restitution: DICE_RESTITUTION,
    }),
  );
  world.addContactMaterial(
    new CANNON.ContactMaterial(diceMaterial, floorMaterial, {
      friction: FLOOR_FRICTION,
      restitution: FLOOR_RESTITUTION,
    }),
  );

  addTray(world, floorMaterial, trayHalfXFor(count));

  return { world, diceMaterial };
}

/** Invisible static floor + four walls dice can land and bounce on/off. */
function addTray(world: CANNON.World, floorMaterial: CANNON.Material, trayHalfX: number): void {
  const floor = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: floorMaterial });
  floor.addShape(new CANNON.Plane());
  floor.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  floor.position.set(0, FLOOR_Y, 0);
  world.addBody(floor);

  const wallY = FLOOR_Y + TRAY_WALL_HEIGHT / 2;

  // Walls along x (block +/-x travel), spanning the full z width of the tray.
  for (const sign of [1, -1] as const) {
    const wall = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: floorMaterial });
    wall.addShape(
      new CANNON.Box(new CANNON.Vec3(TRAY_WALL_THICKNESS / 2, TRAY_WALL_HEIGHT / 2, TRAY_HALF_Z + TRAY_WALL_THICKNESS)),
    );
    wall.position.set(sign * (trayHalfX + TRAY_WALL_THICKNESS / 2), wallY, 0);
    world.addBody(wall);
  }
  // Walls along z (block +/-z travel), spanning the full x width of the tray.
  for (const sign of [1, -1] as const) {
    const wall = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: floorMaterial });
    wall.addShape(
      new CANNON.Box(new CANNON.Vec3(trayHalfX + TRAY_WALL_THICKNESS, TRAY_WALL_HEIGHT / 2, TRAY_WALL_THICKNESS / 2)),
    );
    wall.position.set(0, wallY, sign * (TRAY_HALF_Z + TRAY_WALL_THICKNESS / 2));
    world.addBody(wall);
  }
}

/** A dynamic die body. Only d6 has a matching cannon shape today — other die
 *  types fall back to the same box, same as `dieFaces.ts`'s sharp geometry
 *  fallback, so they still tumble and settle, just without a real per-face read. */
export function createDieBody(diceMaterial: CANNON.Material): CANNON.Body {
  const half = D6_SIZE / 2;
  return new CANNON.Body({
    mass: DIE_MASS,
    material: diceMaterial,
    shape: new CANNON.Box(new CANNON.Vec3(half, half, half)),
    allowSleep: true,
    sleepSpeedLimit: SLEEP_SPEED_LIMIT,
    sleepTimeLimit: SLEEP_TIME_LIMIT,
  });
}

function lerpRange([min, max]: readonly [number, number], t: number): number {
  return min + t * (max - min);
}

/** Launches a die from above into its lane with a randomized throw — start
 *  position/orientation, linear velocity ("the throw"), and angular velocity
 *  (tumble). `laneX` is the die's resting lane center (mirrors `DiceRoller`'s
 *  per-die `DIE_GAP` spacing) so a multi-die set still reads as one throw
 *  across a tidy row rather than dice spawning on top of each other. */
export function throwDie(body: CANNON.Body, laneX: number): void {
  body.wakeUp();
  body.position.set(
    laneX + (Math.random() * 2 - 1) * START_X_JITTER,
    START_HEIGHT_MIN + Math.random() * (START_HEIGHT_MAX - START_HEIGHT_MIN),
    0.5 + Math.random(),
  );
  body.quaternion.setFromEuler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
  body.velocity.set(
    lerpRange(THROW_VELOCITY_X, Math.random()),
    lerpRange(THROW_VELOCITY_Y, Math.random()),
    lerpRange(THROW_VELOCITY_Z, Math.random()),
  );
  body.angularVelocity.set(
    (Math.random() * 2 - 1) * THROW_ANGULAR_VELOCITY,
    (Math.random() * 2 - 1) * THROW_ANGULAR_VELOCITY,
    (Math.random() * 2 - 1) * THROW_ANGULAR_VELOCITY,
  );
  body.force.set(0, 0, 0);
  body.torque.set(0, 0, 0);
}

/** Whether a body has come to rest, per cannon-es's own sleep bookkeeping
 *  (the primary signal, already correctly sustained) or — only once
 *  `sinceThrowMs` clears SETTLE_FALLBACK_GRACE_MS — a plain instantaneous
 *  velocity-threshold fallback, for a body that's somehow still awake
 *  despite having effectively stopped. `sinceThrowMs` is the time since
 *  *this* body was last (re)thrown, tracked by the caller (see
 *  createRollResolver), not overall roll time — a retried die deserves its
 *  own fresh grace period, not whatever's left over from the first throw's. */
function isBodySettled(body: CANNON.Body, sinceThrowMs: number): boolean {
  if (body.sleepState === CANNON.Body.SLEEPING) return true;
  if (sinceThrowMs < SETTLE_FALLBACK_GRACE_MS) return false;
  return (
    body.velocity.lengthSquared() < SETTLE_VELOCITY_THRESHOLD ** 2 &&
    body.angularVelocity.lengthSquared() < SETTLE_VELOCITY_THRESHOLD ** 2
  );
}

interface FaceReading {
  value: number;
  /** How aligned the read face's normal is with "up" (dot product, 1 = dead-on). */
  confidence: number;
  /** True if the die isn't a clean flat landing — see COCK_DOT_THRESHOLD/REST_HEIGHT_TOLERANCE. */
  cocked: boolean;
}

const scratchQuaternion = new THREE.Quaternion();
const scratchNormal = new THREE.Vector3();

/** Reads which face is pointing up on a settled body, by transforming each
 *  face's local normal (from the same `computeFaceGroups` data the visual
 *  labels use) by the body's orientation and picking the one most aligned
 *  with +Y. Flags a "cocked" read — an edge/corner balance, or a die resting
 *  on top of a neighbor rather than the floor — so the caller can re-throw
 *  rather than report a value nobody would actually read off the die. */
function readUpFace(body: CANNON.Body, groups: FaceGroup[]): FaceReading {
  // Die types with no per-face mapping (only d10/d100 today — see
  // dieFaces.ts's createDieGeometry fallback) can't be read at all; treat
  // them as an always-valid "1" rather than retrying forever against a
  // confidence score that can never clear the threshold.
  if (groups.length === 0) return { value: 1, confidence: 1, cocked: false };

  scratchQuaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);

  let best = -Infinity;
  let bestIndex = 0;
  for (let face = 0; face < groups.length; face++) {
    scratchNormal.copy(groups[face].normal).applyQuaternion(scratchQuaternion);
    const dot = scratchNormal.dot(UP_AXIS);
    if (dot > best) {
      best = dot;
      bestIndex = face;
    }
  }

  const expectedRestY = FLOOR_Y + D6_SIZE / 2;
  const offFloor = Math.abs(body.position.y - expectedRestY) > REST_HEIGHT_TOLERANCE;
  const cocked = best < COCK_DOT_THRESHOLD || offFloor;

  return { value: bestIndex + 1, confidence: best, cocked };
}

interface RollResolverTickResult {
  done: boolean;
  /** Present only once `done` is true: each die's observed face value, in `dice` order. */
  values?: number[];
}

/**
 * Drives a set of thrown dice to a result, one `tick(dt)` call at a time —
 * stepping the world, checking whether everything's settled, and re-throwing
 * any cocked dice — so the exact same resolution logic can run either across
 * real animation frames (one `tick(delta)` per `useFrame`, the normal tumble)
 * or synchronously in a tight loop (`tick(FIXED_DT)` repeatedly with no
 * rendering in between — the reduced-motion/skip path). A single running
 * `elapsedMs` (never reset by a retry) bounds the *whole* roll, including any
 * retries, to `MAX_ROLL_MS` — past that, whatever's still cocked is accepted
 * as read rather than retried again, so a roll can never hang.
 */
export function createRollResolver(world: CANNON.World, dice: readonly PhysicsDie[]) {
  let elapsedMs = 0;
  let attempts = 0;
  // Time since each die was last (re)thrown — separate from `elapsedMs`
  // (which tracks the whole roll, including retries) because a retried die
  // deserves its own fresh SETTLE_FALLBACK_GRACE_MS window, not whatever's
  // left over from the very first throw's budget. Reset to 0 alongside
  // `elapsedMs`/`attempts` for the initial throw, and per-index whenever
  // that die alone is re-thrown below.
  const sinceThrowMs = dice.map(() => 0);

  function reset(): void {
    elapsedMs = 0;
    attempts = 0;
    sinceThrowMs.fill(0);
  }

  function tick(dt: number): RollResolverTickResult {
    world.step(FIXED_DT, dt, MAX_SUB_STEPS);
    elapsedMs += dt * 1000;
    for (let index = 0; index < sinceThrowMs.length; index++) sinceThrowMs[index] += dt * 1000;
    const timedOut = elapsedMs >= MAX_ROLL_MS;

    const allSettled = dice.every((die, index) => isBodySettled(die.body, sinceThrowMs[index]));
    if (!allSettled && !timedOut) return { done: false };

    const readings = dice.map((die) => readUpFace(die.body, die.groups));
    const cockedIndices = readings.map((reading, index) => (reading.cocked ? index : -1)).filter((index) => index >= 0);

    if (cockedIndices.length > 0 && attempts < MAX_REROLL_ATTEMPTS && !timedOut) {
      attempts += 1;
      for (const index of cockedIndices) {
        throwDie(dice[index].body, dice[index].laneX);
        sinceThrowMs[index] = 0;
      }
      return { done: false };
    }

    // Either every die landed clean, or we're out of retries/time — accept
    // the best-effort reading either way (see readUpFace's `confidence`).
    return { done: true, values: readings.map((reading) => reading.value) };
  }

  return { tick, reset };
}
