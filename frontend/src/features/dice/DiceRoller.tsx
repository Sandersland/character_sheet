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

const TUMBLE_DURATION_MS = 1300;
const TUMBLE_DURATION_SECONDS = TUMBLE_DURATION_MS / 1000;

const ROT_TURNS_MIN = 1.5;
const ROT_TURNS_MAX = 3;
const ROT_SETTLE_FRACTION = 0.8;
const SPIN_AXIS_VERTICAL_DAMPING = 0.35;

const DROP_HEIGHT_MIN = 1.4;
const DROP_HEIGHT_MAX = 2.0;

const SKITTER_DISTANCE_MIN = 0.9;
const SKITTER_DISTANCE_MAX = 1.6;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

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
  // Reused across frames to avoid allocating a new THREE.Quaternion every frame.
  const spinDeltaQuatRef = useRef(new THREE.Quaternion());
  const landingQuatRef = useRef(new THREE.Quaternion());
  // Randomized per die so they don't fall/skitter/spin in perfect unison.
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

    spinAxisRef.current.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    spinAxisRef.current.y *= SPIN_AXIS_VERTICAL_DAMPING;
    spinAxisRef.current.normalize();

    thetaTotalRef.current = (ROT_TURNS_MIN + Math.random() * (ROT_TURNS_MAX - ROT_TURNS_MIN)) * Math.PI * 2;
    dropHeightRef.current = DROP_HEIGHT_MIN + Math.random() * (DROP_HEIGHT_MAX - DROP_HEIGHT_MIN);

    const skitterSign = Math.random() < 0.5 ? -1 : 1;
    const skitterDistance = SKITTER_DISTANCE_MIN + Math.random() * (SKITTER_DISTANCE_MAX - SKITTER_DISTANCE_MIN);
    startOffsetRef.current.set(0, 0, skitterSign * skitterDistance);

    // Dice with no per-face mapping (only the d100) get an arbitrary landing
    // orientation instead of unwinding onto a specific face.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scripted-tumble seed keyed on the rollId trigger; rolling/reducedMotion/targetQuaternion are read fresh on each fire, so completing the deps would restart the animation mid-roll; useEffectEvent (the sanctioned extraction) isn't in React 18.3.1 (#1056)
  }, [rollId]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || phaseRef.current === "idle") return;

    elapsedRef.current += delta;
    const t = Math.min(elapsedRef.current / TUMBLE_DURATION_SECONDS, 1);

    group.position.y = position[1] + dropHeightRef.current * (1 - easeOutBounce(t));

    const approach = 1 - easeOutCubic(t);
    group.position.x = position[0] + startOffsetRef.current.x * approach;
    group.position.z = position[2] + startOffsetRef.current.z * approach;

    // Spin decelerates to exactly the landing pose by construction (theta -> 0
    // as t -> ROT_SETTLE_FRACTION), so there's no separate settle/correction step needed.
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

function describeRoll(spec: DiceRollerProps["spec"], rolling: boolean, settled: RollResult | null): string {
  if (settled) {
    const dice = settled.dice.map((die) => (die.dropped ? `${die.value} (dropped)` : `${die.value}`)).join(", ");
    return `${formatRollSpec(spec)}: ${dice} — total ${settled.total}`;
  }
  return rolling ? `Rolling ${formatRollSpec(spec)}…` : formatRollSpec(spec);
}

/** The 3D dice are cosmetic — `rollSpec` always decides the result, so rolls
 *  stay deterministic and testable regardless of the animation. */
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

  // Owns its own cleanup (not a separate effect) so StrictMode's dev
  // double-invoke re-triggers cleanly instead of hanging the roll in the
  // "rolling" state forever.
  useEffect(() => {
    if (rollKey !== undefined) {
      if (lastRollKeyRef.current === rollKey) return undefined;
      const previousRollKey = lastRollKeyRef.current;
      lastRollKeyRef.current = rollKey;
      roll();
      return () => {
        // Only undo the dedupe if a timer is actually pending (the animated
        // path) — otherwise a StrictMode replay would call roll() again and
        // fire onResult twice for an already-delivered result.
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
        if (timeoutRef.current !== undefined) {
          clearTimeout(timeoutRef.current);
          hasAutoRolledRef.current = false;
        }
      };
    }

    return undefined;
    // `roll` reads only the refs above, which are always current, so it's
    // intentionally left out of the deps below.
  }, [rollKey, autoRollOnMount]);

  // Keyed on [skip] alone — including rolling/result would fire this on
  // every roll and fight the lifecycle effect above for ownership of timeoutRef.
  useEffect(() => {
    if (!skip) return;
    if (timeoutRef.current === undefined) return;
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

  // aria doesn't reveal the result until the dice actually stop, even though
  // they already know which face to settle on.
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
