import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { formatRollSpec, rollSpec, usesAdvantage } from "@/lib/dice";
import type { RollResult } from "@/lib/dice";
import { DIE_GAP, UP_AXIS, quaternionForUpFace } from "@/lib/dieFaces";
import type { FaceGroup } from "@/lib/dieFaces";
import DiceScene from "@/features/dice/DiceScene";
import type { DiceRollerProps } from "@/features/dice/diceRollerTypes";
import DieMesh from "@/features/dice/DieMesh";
import { useDieFaceData } from "@/features/dice/useDieFaceData";

// How long a roll tumbles before settling on its result. Rotation is modeled
// as a single decelerating spin that unwinds onto the landing pose (see
// ROT_TURNS_MIN/MAX below) rather than a free spin that gets corrected into
// place afterward, so there's no separate "settle" stage to time.
const TUMBLE_DURATION_MS = 1300;
const TUMBLE_DURATION_SECONDS = TUMBLE_DURATION_MS / 1000;

// How many extra full turns (beyond just arriving at the landing pose) a die
// spins through, randomized per die. The spin decelerates smoothly across
// this distance and arrives at exactly the landing orientation by
// construction — see the rotation math in the per-die useFrame loop.
const ROT_TURNS_MIN = 1.5;
const ROT_TURNS_MAX = 3;
// Fraction of the timeline by which rotation has fully unwound onto the
// landing pose. Finishes a bit before t=1 so the die is already flat on its
// face during the bounce's last, smallest rebounds rather than still turning.
const ROT_SETTLE_FRACTION = 0.8;
// How strongly a random spin axis is pulled toward horizontal. A spin axis
// close to vertical would just yaw the die in place (spinning flat like a
// top) instead of tumbling it over its corners, which barely reads as a
// tumble from the near-top-down camera.
const SPIN_AXIS_VERTICAL_DAMPING = 0.35;

// How high above its resting spot a die starts before falling. Combined with
// the bounce easing below, this reads as the die dropping in and bouncing a
// few decreasing times before coming to rest flat on the table, rather than
// rising and sinking back through a single symmetric arc.
const DROP_HEIGHT_MIN = 1.4;
const DROP_HEIGHT_MAX = 2.0;

// How far toward/away from the camera (world z) a die starts from its
// resting spot, easing back in as it falls. The camera looks almost straight
// down at the dice, so this "skitter" — not the vertical motion — is what
// actually reads as the die having been thrown/rolled rather than just
// bobbing in place. Deliberately z-only, not also sideways along x: dice sit
// side by side along x at DIE_GAP apart with only ~0.35 of clearance over
// their circumscribed-sphere diameter at rest (see the DIE_GAP
// comment), so any x-direction travel risks two neighbors visibly clipping
// through each other mid-roll. z has no such neighbor to clip into.
const SKITTER_DISTANCE_MIN = 0.9;
const SKITTER_DISTANCE_MAX = 1.6;

/** Decelerating ease-out: starts fast, eases smoothly to a stop at t=1. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Standard "ease out bounce": rises from 0 to 1 like a dropped ball settling
 * on the floor — it reaches 1 (impact) several times, rebounding to
 * decreasing heights below 1 in between, before resting at 1 for good. Used
 * to drive a die's height so it falls and bounces rather than arcing
 * symmetrically up and back down. Source: the well-known Penner easing
 * equations (see easings.net/#easeOutBounce).
 */
function easeOutBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    const shifted = t - 1.5 / d1;
    return n1 * shifted * shifted + 0.75;
  } else if (t < 2.5 / d1) {
    const shifted = t - 2.25 / d1;
    return n1 * shifted * shifted + 0.9375;
  } else {
    const shifted = t - 2.625 / d1;
    return n1 * shifted * shifted + 0.984375;
  }
}

interface ScriptedDieProps {
  geometry: THREE.BufferGeometry;
  groups: FaceGroup[];
  rounded: boolean;
  value: number | null;
  dropped: boolean;
  rolling: boolean;
  rollId: number;
  reducedMotion: boolean;
  position: readonly [number, number, number];
}

/** One 3D die: tumbles freely via a scripted tween, then eases into the
 *  engine-decided face. Owns only the animation timeline — `DieMesh` (shared
 *  with the physics roller) owns what it actually looks like. */
function ScriptedDie({
  geometry,
  groups,
  rounded,
  value,
  dropped,
  rolling,
  rollId,
  reducedMotion,
  position,
}: ScriptedDieProps) {
  const groupRef = useRef<THREE.Group>(null);
  const spinAxisRef = useRef(new THREE.Vector3(1, 0, 0));
  const elapsedRef = useRef(0);
  const phaseRef = useRef<"idle" | "spin">("idle");
  // Scratch quaternion reused every frame for the unwinding spin delta —
  // avoids allocating a new THREE.Quaternion 60 times a second per die.
  const spinDeltaQuatRef = useRef(new THREE.Quaternion());
  // The orientation the die unwinds onto as it decelerates: the
  // engine-decided face pointing up plus a random yaw (so dice don't all
  // land at the same angle), or — for die types with no per-face mapping —
  // an arbitrary random orientation. Recomputed each roll.
  const landingQuatRef = useRef(new THREE.Quaternion());
  // Per-die fall height, lateral entry offset, and total spin so each die
  // drops from a slightly different height, skitters in from a different
  // direction, and tumbles through a different amount of rotation —
  // without this they'd bounce and spin in perfect unison.
  const dropHeightRef = useRef(DROP_HEIGHT_MIN);
  const startOffsetRef = useRef(new THREE.Vector3());
  const thetaTotalRef = useRef(0);

  const targetQuaternion = useMemo(() => {
    if (value === null || groups.length === 0) return null;
    const normal = groups[value - 1]?.normal;
    return normal ? quaternionForUpFace(normal) : null;
  }, [groups, value]);

  useEffect(() => {
    if (!rolling) return;
    elapsedRef.current = 0;

    // Random tumble axis, pulled toward horizontal so the die visibly tumbles
    // over its corners (pitch/roll) rather than just yawing flat like a
    // spinning top — see SPIN_AXIS_VERTICAL_DAMPING.
    spinAxisRef.current.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    spinAxisRef.current.y *= SPIN_AXIS_VERTICAL_DAMPING;
    spinAxisRef.current.normalize();

    thetaTotalRef.current = (ROT_TURNS_MIN + Math.random() * (ROT_TURNS_MAX - ROT_TURNS_MIN)) * Math.PI * 2;
    dropHeightRef.current = DROP_HEIGHT_MIN + Math.random() * (DROP_HEIGHT_MAX - DROP_HEIGHT_MIN);

    // A random toward-camera-or-away distance to skitter in from (z-only —
    // see the SKITTER_DISTANCE comment above for why x is off the table).
    const skitterSign = Math.random() < 0.5 ? -1 : 1;
    const skitterDistance = SKITTER_DISTANCE_MIN + Math.random() * (SKITTER_DISTANCE_MAX - SKITTER_DISTANCE_MIN);
    startOffsetRef.current.set(0, 0, skitterSign * skitterDistance);

    // The pose the spin unwinds onto. Keep the result face up, but rotate
    // the die a random amount about the vertical axis so its final resting
    // angle varies from roll to roll. Die types with no per-face mapping
    // (e.g. d10) have no real face to land on, but should still tumble to a
    // definite stop rather than spinning forever — give them an arbitrary
    // random orientation to unwind onto instead.
    if (targetQuaternion) {
      const yaw = new THREE.Quaternion().setFromAxisAngle(UP_AXIS, Math.random() * Math.PI * 2);
      landingQuatRef.current.copy(yaw).multiply(targetQuaternion);
    } else {
      const randomAxis = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      ).normalize();
      landingQuatRef.current.setFromAxisAngle(randomAxis, Math.random() * Math.PI * 2);
    }

    if (reducedMotion) {
      phaseRef.current = "idle";
      groupRef.current?.quaternion.copy(landingQuatRef.current);
    } else {
      phaseRef.current = "spin";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rollId is the trigger; rolling/reducedMotion/targetQuaternion read fresh on each fire
  }, [rollId]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || phaseRef.current === "idle") return;

    elapsedRef.current += delta;
    const t = Math.min(elapsedRef.current / TUMBLE_DURATION_SECONDS, 1);

    // Vertical: a decaying-bounce drop (ball-on-the-floor easing) rather than
    // a single symmetric arc — the die starts elevated and falls, bouncing a
    // few smaller times before coming to rest flat exactly at t=1.
    group.position.y = position[1] + dropHeightRef.current * (1 - easeOutBounce(t));

    // Horizontal: ease from a random toward/away-from-camera entry point
    // back to the die's tidy resting spot, decelerating like friction. This
    // is the motion that actually reads as "thrown across the table" under
    // the near-top-down camera (x is left alone — see SKITTER_DISTANCE_MIN).
    const approach = 1 - easeOutCubic(t);
    group.position.x = position[0] + startOffsetRef.current.x * approach;
    group.position.z = position[2] + startOffsetRef.current.z * approach;

    // Rotation: a spin around a random axis that decelerates and unwinds
    // exactly onto the landing pose. By construction the die arrives at
    // landingQuat with zero residual spin (theta -> 0 as t -> ROT_SETTLE_
    // FRACTION) — there's no separate "settle" step slerping from wherever a
    // free spin happened to stop, so there's nothing left to visibly correct
    // after the die looks like it has already landed.
    const rotT = Math.min(t / ROT_SETTLE_FRACTION, 1);
    const theta = thetaTotalRef.current * (1 - easeOutCubic(rotT));
    spinDeltaQuatRef.current.setFromAxisAngle(spinAxisRef.current, theta);
    group.quaternion.multiplyQuaternions(spinDeltaQuatRef.current, landingQuatRef.current);

    if (t >= 1) {
      group.quaternion.copy(landingQuatRef.current);
      phaseRef.current = "idle";
    }
  });

  return (
    <DieMesh
      ref={groupRef}
      geometry={geometry}
      groups={groups}
      rounded={rounded}
      value={value}
      dropped={dropped}
      rolling={rolling}
      position={position}
    />
  );
}

// The `aria-live` summary: the settled dice + total once stopped, a "Rolling…"
// announcement mid-tumble, or just the spec when idle. Pure — kept out of the
// component body so the render stays a thin mapping.
function describeRoll(spec: DiceRollerProps["spec"], rolling: boolean, settled: RollResult | null): string {
  if (settled) {
    const dice = settled.dice.map((die) => (die.dropped ? `${die.value} (dropped)` : `${die.value}`)).join(", ");
    return `${formatRollSpec(spec)}: ${dice} — total ${settled.total}`;
  }
  return rolling ? `Rolling ${formatRollSpec(spec)}…` : formatRollSpec(spec);
}

/**
 * Animated, reusable 3D dice roller — real three.js polyhedra (via React
 * Three Fiber) that tumble and settle on a real roll from `rollSpec`,
 * dimming any dice `spec.dropLowest` excludes from the total (e.g. the
 * dropped die in 4d6-drop-lowest). Parents stay in control of *when* a roll
 * happens via `rollKey` — character creation rolls ability scores via the
 * physics-backed `PhysicsDiceRoller` instead, but this scripted animator
 * stays available for rolls whose result is already known (e.g. animating a
 * previously-computed hit-die roll) and is meant to be dropped in unchanged
 * wherever that's the case.
 *
 * The engine (`rollSpec`) always decides the result; the 3D dice tumble
 * freely and then orient to land on that result, so rolls stay deterministic
 * and testable even though the animation looks physical. Honors
 * `prefers-reduced-motion` by settling immediately, and exposes the result
 * as a single `aria-live` text summary rather than relying on reading the
 * (decorative) spinning dice.
 */
export default function DiceRoller({
  spec,
  onResult,
  rollKey,
  autoRollOnMount = false,
  label,
  skip = false,
  showTotal = true,
  className = "",
}: DiceRollerProps) {
  const [result, setResult] = useState<RollResult | null>(null);
  const [rolling, setRolling] = useState(false);
  const [rollId, setRollId] = useState(0);

  const { visualGeometry, groups, rounded } = useDieFaceData(spec.faces);

  // Advantage/disadvantage rolls two d20s; render both so the taken + un-taken die both show.
  const dieCount = usesAdvantage(spec) ? 2 : spec.count;

  const specRef = useRef(spec);
  specRef.current = spec;
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const skipRef = useRef(skip);
  skipRef.current = skip;
  const resultRef = useRef(result);
  resultRef.current = result;
  const lastRollKeyRef = useRef<number | string | undefined>(undefined);
  const hasAutoRolledRef = useRef(false);
  const timeoutRef = useRef<number | undefined>(undefined);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // This effect owns the *entire* lifecycle of a triggered roll, including
  // tearing it down — that symmetry matters under StrictMode, which (in
  // dev only) double-invokes every effect on mount as setup → cleanup →
  // setup again. A cleanup declared in a *separate* effect would still run
  // in between those two setups and clear the timer this effect just
  // scheduled, with nothing left to reschedule it (the dedupe below would
  // see the same rollKey and skip re-rolling) — the roll would hang
  // forever in the "rolling" state. Returning the matching undo here
  // instead means the second StrictMode setup sees a fresh state and
  // re-rolls for real, while genuine unmounts/rollKey changes still cancel
  // cleanly.
  useEffect(() => {
    if (rollKey !== undefined) {
      if (lastRollKeyRef.current === rollKey) return undefined;
      const previousRollKey = lastRollKeyRef.current;
      lastRollKeyRef.current = rollKey;
      roll();
      return () => {
        // Only undo the dedupe if there's an actual pending timer to
        // cancel (the animated path) — StrictMode's replay re-running
        // `roll()` is harmless there since it just reschedules a fresh
        // timer in place of the cancelled one. But when skip/reduced-motion
        // resolved instantly, there's nothing pending to cancel, and
        // letting the replay reset `lastRollKeyRef` would make the second
        // setup call `roll()` again — re-rolling and firing `onResult` a
        // second time for an already-delivered result, which corrupts any
        // consumer that appends results rather than overwriting by index.
        if (timeoutRef.current !== undefined) {
          clearTimeout(timeoutRef.current);
          lastRollKeyRef.current = previousRollKey;
        }
      };
    }

    if (autoRollOnMount && !hasAutoRolledRef.current) {
      hasAutoRolledRef.current = true;
      roll();
      return () => {
        // Same reasoning as the rollKey branch above.
        if (timeoutRef.current !== undefined) {
          clearTimeout(timeoutRef.current);
          hasAutoRolledRef.current = false;
        }
      };
    }

    return undefined;
    // `roll` only reads the refs above, which are always current, so it's
    // intentionally left out of the dependency list (lint confirms there's
    // nothing reactive it touches that isn't already listed here).
  }, [rollKey, autoRollOnMount]);

  // Lets a parent (e.g. DiceRollSequence) interrupt an in-flight tumble on
  // demand. Deliberately keyed on [skip] alone, not [skip, rolling, result]
  // — depending on values that change during every normal roll would fire
  // this on every roll and fight the lifecycle effect above for ownership
  // of `timeoutRef` (the exact StrictMode trap that effect's comment
  // describes). Keying on skip only means this never runs during a normal
  // roll and can't reintroduce that bug; it only acts on the false→true
  // transition, reading the live result via a ref instead.
  useEffect(() => {
    if (!skip) return;
    if (timeoutRef.current === undefined) return; // nothing in flight to interrupt
    clearTimeout(timeoutRef.current);
    timeoutRef.current = undefined;
    setRolling(false);
    if (resultRef.current) onResultRef.current?.(resultRef.current);
  }, [skip]);

  function roll() {
    if (timeoutRef.current !== undefined) clearTimeout(timeoutRef.current);

    const next = rollSpec(specRef.current);
    setResult(next);
    setRollId((id) => id + 1);

    if (reducedMotionRef.current || skipRef.current) {
      setRolling(false);
      onResultRef.current?.(next);
      return;
    }

    setRolling(true);
    timeoutRef.current = window.setTimeout(() => {
      setRolling(false);
      onResultRef.current?.(next);
    }, TUMBLE_DURATION_MS);
  }

  // The DOM/aria summary only reveals once the dice have actually stopped —
  // the 3D dice receive `result` immediately so they know which face to
  // settle on, but that's not something a player can read off a spinning die.
  const settled = rolling ? null : result;
  const ariaLabel = describeRoll(spec, rolling, settled);

  return (
    <DiceScene
      ariaLabel={ariaLabel}
      label={label}
      showTotal={showTotal}
      settledTotal={settled?.total ?? null}
      className={className}
    >
      {Array.from({ length: dieCount }, (_, index) => (
        <ScriptedDie
          key={index}
          geometry={visualGeometry}
          groups={groups}
          rounded={rounded}
          value={result?.dice[index]?.value ?? null}
          dropped={result?.dice[index]?.dropped ?? false}
          rolling={rolling}
          rollId={rollId}
          reducedMotion={reducedMotionRef.current}
          position={[(index - (dieCount - 1) / 2) * DIE_GAP, 0, 0]}
        />
      ))}
    </DiceScene>
  );
}
