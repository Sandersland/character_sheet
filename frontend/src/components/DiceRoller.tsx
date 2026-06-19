import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Text } from "@react-three/drei";
import * as THREE from "three";

import { formatRollSpec, rollSpec } from "../lib/dice";
import type { RollResult, RollSpec } from "../lib/dice";

// How long a roll tumbles before settling on its result, and what fraction
// of that window is free-spinning vs. easing into the final, face-up pose.
const TUMBLE_DURATION_MS = 750;
const TUMBLE_DURATION_SECONDS = TUMBLE_DURATION_MS / 1000;
const SETTLE_FRACTION = 0.62;
const SPIN_SPEED_MIN_RAD_PER_SEC = 9;
const SPIN_SPEED_MAX_RAD_PER_SEC = 15;

const LABEL_SURFACE_OFFSET = 0.045;
// The d6 box (side 1.3) has a circumscribed-sphere diameter of ~2.25
// (1.3 * sqrt(3)) — the gap between die centers needs to clear that with
// real margin or spinning corners visibly intersect the neighboring die.
const DIE_GAP = 2.6;
const NORMAL_GROUP_EPSILON = 1e-3;

// Mirrors index.css's garnet/parchment tokens — R3F materials can't read
// CSS custom properties, so the values are duplicated here by hand.
const DIE_BODY_COLOR = "#cf1124"; // --color-garnet-600
const DIE_BODY_COLOR_DROPPED = "#b8b2a7"; // --color-parchment-300
const DIE_LABEL_COLOR = "#faf9f7"; // --color-parchment-50
const DIE_LABEL_COLOR_DROPPED = "#857f72"; // --color-parchment-500

const FACE_LABEL_FONT_SIZE: Readonly<Record<number, number>> = {
  4: 0.36,
  6: 0.4,
  8: 0.32,
  12: 0.24,
  20: 0.22,
};
const DEFAULT_FACE_LABEL_FONT_SIZE = 0.3;

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

interface FaceGroup {
  normal: THREE.Vector3;
  centroid: THREE.Vector3;
  labelQuaternion: THREE.Quaternion;
}

/** Real three.js geometry for a given die type; SRD dice with no built-in
 * polyhedron (only d10/d100, the pentagonal trapezohedron) fall back to a
 * plain cube — it still tumbles, it just can't land on a matching face. */
function createDieGeometry(faces: number): THREE.BufferGeometry {
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
      return new THREE.BoxGeometry(1.3, 1.3, 1.3);
  }
}

/**
 * Groups a polyhedron's triangles into faces by clustering on shared
 * (near-identical) outward normals, then averages each face's unique
 * vertices for its centroid. This works for any convex die geometry without
 * having to hardcode three.js's internal triangulation/index layout (e.g.
 * the dodecahedron's pentagons are built from 3 triangles each).
 */
function computeFaceGroups(geometry: THREE.BufferGeometry): FaceGroup[] {
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
function quaternionForUpFace(normal: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(normal, UP_AXIS);
}

/** Builds (and disposes) the geometry + per-face data for one die type. */
function useDieFaceData(faces: number) {
  const geometry = useMemo(() => createDieGeometry(faces), [faces]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const groups = useMemo(() => {
    const computed = computeFaceGroups(geometry);
    // Only trust the grouping if it found exactly one face per rolled value
    // (true for the supported platonic dice; false for the box fallback).
    return computed.length === faces ? computed : [];
  }, [geometry, faces]);

  return { geometry, groups };
}

interface DieProps {
  geometry: THREE.BufferGeometry;
  groups: FaceGroup[];
  value: number | null;
  dropped: boolean;
  rolling: boolean;
  rollId: number;
  reducedMotion: boolean;
  position: readonly [number, number, number];
}

/** One 3D die: tumbles freely, then eases into the engine-decided face. */
function Die({ geometry, groups, value, dropped, rolling, rollId, reducedMotion, position }: DieProps) {
  const groupRef = useRef<THREE.Group>(null);
  const spinAxisRef = useRef(new THREE.Vector3(1, 0, 0));
  const spinSpeedRef = useRef(SPIN_SPEED_MIN_RAD_PER_SEC);
  const elapsedRef = useRef(0);
  const phaseRef = useRef<"idle" | "spin" | "settle">("idle");
  const settleStartQuatRef = useRef(new THREE.Quaternion());

  const targetQuaternion = useMemo(() => {
    if (value === null || groups.length === 0) return null;
    const normal = groups[value - 1]?.normal;
    return normal ? quaternionForUpFace(normal) : null;
  }, [groups, value]);

  useEffect(() => {
    if (!rolling) return;
    elapsedRef.current = 0;
    spinAxisRef.current.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    spinSpeedRef.current =
      SPIN_SPEED_MIN_RAD_PER_SEC + Math.random() * (SPIN_SPEED_MAX_RAD_PER_SEC - SPIN_SPEED_MIN_RAD_PER_SEC);

    if (reducedMotion) {
      phaseRef.current = "idle";
      if (groupRef.current && targetQuaternion) groupRef.current.quaternion.copy(targetQuaternion);
    } else {
      phaseRef.current = "spin";
    }
    // rollId is the trigger; rolling/reducedMotion/targetQuaternion are read fresh each time it fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollId]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || phaseRef.current === "idle") return;

    elapsedRef.current += delta;
    const t = Math.min(elapsedRef.current / TUMBLE_DURATION_SECONDS, 1);

    if (t < SETTLE_FRACTION || !targetQuaternion) {
      group.rotateOnAxis(spinAxisRef.current, delta * spinSpeedRef.current);
      if (t >= 1) phaseRef.current = "idle";
      return;
    }

    if (phaseRef.current === "spin") {
      phaseRef.current = "settle";
      settleStartQuatRef.current.copy(group.quaternion);
    }

    const settleT = Math.min((t - SETTLE_FRACTION) / (1 - SETTLE_FRACTION), 1);
    const eased = 1 - Math.pow(1 - settleT, 3);
    group.quaternion.slerpQuaternions(settleStartQuatRef.current, targetQuaternion, eased);

    if (t >= 1) {
      group.quaternion.copy(targetQuaternion);
      phaseRef.current = "idle";
    }
  });

  // Only reveal that a die was dropped once the whole set has actually
  // stopped spinning — the result (and so `dropped`) is known from frame
  // one so the engine can target an orientation, but showing it mid-tumble
  // spoils which die "loses" before any of the four have settled.
  const isResolvedDrop = dropped && !rolling;
  const bodyColor = isResolvedDrop ? DIE_BODY_COLOR_DROPPED : DIE_BODY_COLOR;
  const labelColor = isResolvedDrop ? DIE_LABEL_COLOR_DROPPED : DIE_LABEL_COLOR;
  const showFaceLabels = groups.length > 0;
  const fontSize = FACE_LABEL_FONT_SIZE[groups.length] ?? DEFAULT_FACE_LABEL_FONT_SIZE;

  return (
    <group ref={groupRef} position={position}>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={bodyColor}
          flatShading
          roughness={0.4}
          metalness={0.05}
          transparent={isResolvedDrop}
          opacity={isResolvedDrop ? 0.55 : 1}
        />
      </mesh>
      {showFaceLabels &&
        groups.map((group, index) => (
          <Text
            key={index}
            position={group.centroid.clone().addScaledVector(group.normal, LABEL_SURFACE_OFFSET).toArray()}
            quaternion={group.labelQuaternion}
            fontSize={fontSize}
            color={labelColor}
            anchorX="center"
            anchorY="middle"
          >
            {`${index + 1}`}
          </Text>
        ))}
      {/* Fallback for die types with no matching geometry (e.g. d10): no
          per-face mapping is possible, so just surface the settled value. */}
      {!showFaceLabels && !rolling && value !== null && (
        <Text position={[0, 1.1, 0]} fontSize={0.4} color={labelColor} anchorX="center" anchorY="middle">
          {`${value}`}
        </Text>
      )}
    </group>
  );
}

interface DiceRollerProps {
  /** What to roll, e.g. `{ count: 4, faces: 6, dropLowest: 1 }` for 4d6 drop lowest. */
  spec: RollSpec;
  /** Called once the roll settles, with the full per-die result. */
  onResult?: (result: RollResult) => void;
  /** Bump this (e.g. a counter) to trigger a fresh roll, including re-rolls. */
  rollKey?: number | string;
  /** Roll immediately on mount if no `rollKey` is driving this instance. */
  autoRollOnMount?: boolean;
  /** Optional caption shown above the dice (e.g. "Hit dice", "Attack roll"). */
  label?: string;
  /** When true, resolve immediately with no animation — interrupts an
   *  in-flight tumble and makes any roll that starts while set settle instantly. */
  skip?: boolean;
  className?: string;
}

/**
 * Animated, reusable 3D dice roller — real three.js polyhedra (via React
 * Three Fiber) that tumble and settle on a real roll from `lib/dice.ts`,
 * dimming any dice `spec.dropLowest` excludes from the total (e.g. the
 * dropped die in 4d6-drop-lowest). Parents stay in control of *when* a roll
 * happens via `rollKey` — character creation rolls ability scores this way
 * today; the same component is meant to be dropped into hit-dice, attack,
 * and saving-throw rolls later without changes.
 *
 * The engine (`lib/dice.ts`) always decides the result; the 3D dice tumble
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
  className = "",
}: DiceRollerProps) {
  const [result, setResult] = useState<RollResult | null>(null);
  const [rolling, setRolling] = useState(false);
  const [rollId, setRollId] = useState(0);

  const { geometry, groups } = useDieFaceData(spec.faces);

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

  const ariaLabel = settled
    ? `${formatRollSpec(spec)}: ${settled.dice
        .map((die) => (die.dropped ? `${die.value} (dropped)` : `${die.value}`))
        .join(", ")} — total ${settled.total}`
    : rolling
      ? `Rolling ${formatRollSpec(spec)}…`
      : formatRollSpec(spec);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={`flex flex-col items-center gap-1 ${className}`}
    >
      {label && (
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-parchment-500)]">
          {label}
        </span>
      )}
      <div aria-hidden="true" className="h-44 w-full">
        <Canvas dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }} camera={{ position: [0, 4, 7], fov: 30 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[2.5, 4, 3]} intensity={1.05} />
          <Suspense fallback={null}>
            {Array.from({ length: spec.count }, (_, index) => (
              <Die
                key={index}
                geometry={geometry}
                groups={groups}
                value={result?.dice[index]?.value ?? null}
                dropped={result?.dice[index]?.dropped ?? false}
                rolling={rolling}
                rollId={rollId}
                reducedMotion={reducedMotionRef.current}
                position={[(index - (spec.count - 1) / 2) * DIE_GAP, 0, 0]}
              />
            ))}
            <ContactShadows position={[0, -1.1, 0]} opacity={0.35} blur={2.4} far={3} scale={10} frames={1} />
          </Suspense>
        </Canvas>
      </div>
      {/* Always rendered (rather than conditionally mounted) so this
          component's own height never changes between idle/rolling/settled
          — letting any layout-shift fix at the parent actually hold. */}
      <span
        aria-hidden={!settled}
        className={`font-display text-2xl font-semibold leading-none tabular-nums text-[var(--color-garnet-800)] ${settled ? "" : "invisible"}`}
      >
        = {settled ? settled.total : " "}
      </span>
    </div>
  );
}
