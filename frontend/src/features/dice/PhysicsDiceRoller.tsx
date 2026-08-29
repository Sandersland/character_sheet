import { createRef, useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type * as CANNON from "cannon-es";
import type * as THREE from "three";

import { formatRollSpec, summarizeRoll, usesAdvantage } from "@/lib/dice";
import type { RollResult } from "@/lib/dice";
import { D6_SIZE, DIE_GAP } from "@/lib/dieFaces";
import type { FaceGroup } from "@/lib/dieFaces";
import {
  FIXED_DT,
  FLOOR_Y,
  createDiceWorld,
  createDieBody,
  createRollResolver,
  throwDie,
} from "@/lib/physicsDice";
import type { PhysicsDie } from "@/lib/physicsDice";
import DiceScene from "@/features/dice/DiceScene";
import type { DiceRollerProps } from "@/features/dice/diceRollerTypes";
import DieMesh from "@/features/dice/DieMesh";
import { useDieFaceData } from "@/features/dice/useDieFaceData";

// Safety cap — belt-and-suspenders alongside the resolver's own MAX_ROLL_MS
// cutoff; should never actually bind.
const INSTANT_RESOLVE_MAX_TICKS = 600;

interface DicePhysics {
  world: CANNON.World;
  dice: PhysicsDie[];
  resolver: ReturnType<typeof createRollResolver>;
}

// Mirrors DiceRoller's dieCount guard: spec.count alone would silently drop
// the second die under advantage (see usesAdvantage in dice.ts).
function createDicePhysics(spec: DiceRollerProps["spec"], groups: FaceGroup[]): DicePhysics {
  const dieCount = usesAdvantage(spec) ? 2 : spec.count;
  const { world, diceMaterial } = createDiceWorld(dieCount);
  // Single-layer rest height (face-to-center distance) of this die's solid;
  // the d6 box's is exactly D6_SIZE/2, the d10's inradius is slightly larger.
  const restY = groups.length > 0 ? groups[0].normal.dot(groups[0].centroid) : D6_SIZE / 2;
  const dice: PhysicsDie[] = Array.from({ length: dieCount }, (_, index) => {
    const laneX = (index - (dieCount - 1) / 2) * DIE_GAP;
    const body = createDieBody(diceMaterial, spec.faces);
    // Starts in its tidy lane immediately, matching the scripted roller's
    // idle pose, instead of the cannon body's world-origin default.
    body.position.set(laneX, FLOOR_Y + restY, 0);
    world.addBody(body);
    return { body, groups, laneX, restY };
  });
  return { world, dice, resolver: createRollResolver(world, dice) };
}

interface PhysicsRigProps {
  dice: PhysicsDie[];
  resolver: ReturnType<typeof createRollResolver>;
  activeRef: { current: boolean };
  onSettled: (values: number[]) => void;
  geometry: THREE.BufferGeometry;
  groups: FaceGroup[];
  rounded: boolean;
  result: RollResult | null;
  rolling: boolean;
}

/** Lives inside DiceScene's Canvas (needed for useFrame). Copies each die's
 *  body transform onto its DieMesh every frame regardless of why it moved,
 *  which is what lets reduced-motion/skip reuse the same physics resolution
 *  without a visible tumble. */
function PhysicsRig({ dice, resolver, activeRef, onSettled, geometry, groups, rounded, result, rolling }: PhysicsRigProps) {
  const groupRefs = useRef(dice.map(() => createRef<THREE.Group>())).current;
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useFrame((_, delta) => {
    if (activeRef.current) {
      const tick = resolver.tick(delta);
      if (tick.done && tick.values) {
        activeRef.current = false;
        onSettledRef.current(tick.values);
      }
    }

    dice.forEach((die, index) => {
      const group = groupRefs[index].current;
      if (!group) return;
      const { position, quaternion } = die.body;
      group.position.set(position.x, position.y, position.z);
      group.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    });
  });

  return (
    <>
      {dice.map((_, index) => (
        <DieMesh
          key={index}
          ref={groupRefs[index]}
          geometry={geometry}
          groups={groups}
          rounded={rounded}
          value={result?.dice[index]?.value ?? null}
          dropped={result?.dice[index]?.dropped ?? false}
          rolling={rolling}
        />
      ))}
    </>
  );
}

/** Physics is the source of randomness — the result is read off whichever
 *  face lands, not decided in advance. Reduced-motion/skip fast-forward the
 *  same resolution synchronously, so a skipped roll is exactly as fair as a
 *  watched one. */
export default function PhysicsDiceRoller({
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

  const { visualGeometry, groups, rounded } = useDieFaceData(spec.faces);

  const specRef = useRef(spec);
  specRef.current = spec;
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const skipRef = useRef(skip);
  skipRef.current = skip;
  const lastRollKeyRef = useRef<number | string | undefined>(undefined);
  const hasAutoRolledRef = useRef(false);
  const reducedMotionRef = useRef(false);
  // Shared with PhysicsRig's useFrame; a plain ref (not state) since
  // per-frame physics shouldn't go through React's render cycle.
  const activeRef = useRef(false);

  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Created once lazily for this instance's lifetime — cannon-es objects need
  // no disposal, and spec.count/faces never change across rollKey (only
  // which roll, e.g. via DiceRollSequence).
  const physicsRef = useRef<DicePhysics | null>(null);
  if (physicsRef.current === null) {
    physicsRef.current = createDicePhysics(spec, groups);
  }
  const { dice, resolver } = physicsRef.current;

  function finalize(values: number[]) {
    const next = summarizeRoll(values, specRef.current);
    setResult(next);
    setRolling(false);
    onResultRef.current?.(next);
  }

  function resolveInstantly() {
    let tick = resolver.tick(FIXED_DT);
    let iterations = 0;
    while (!tick.done && iterations < INSTANT_RESOLVE_MAX_TICKS) {
      tick = resolver.tick(FIXED_DT);
      iterations += 1;
    }
    activeRef.current = false;
    // tick.values is always set once tick.done is true (see
    // createRollResolver); the fallback is an unreachable last-resort guard.
    finalize(tick.values ?? dice.map(() => 1));
  }

  function roll() {
    activeRef.current = false;
    resolver.reset();
    for (const die of dice) throwDie(die.body, die.laneX);

    if (reducedMotionRef.current || skipRef.current) {
      resolveInstantly();
      return;
    }

    setRolling(true);
    activeRef.current = true;
  }

  // Owns its own cleanup (see DiceRoller's identical pattern) so
  // StrictMode's dev double-invoke re-triggers cleanly instead of cancelling
  // a roll it just started.
  useEffect(() => {
    if (rollKey !== undefined) {
      if (lastRollKeyRef.current === rollKey) return undefined;
      const previousRollKey = lastRollKeyRef.current;
      lastRollKeyRef.current = rollKey;
      roll();
      return () => {
        // Only undo the dedupe if an animated roll is actually in flight —
        // instant resolution has nothing pending, and undoing there would
        // re-roll and fire onResult twice.
        if (activeRef.current) {
          activeRef.current = false;
          lastRollKeyRef.current = previousRollKey;
        }
      };
    }

    if (autoRollOnMount && !hasAutoRolledRef.current) {
      hasAutoRolledRef.current = true;
      roll();
      return () => {
        if (activeRef.current) {
          activeRef.current = false;
          hasAutoRolledRef.current = false;
        }
      };
    }

    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot lifecycle roll trigger; roll() reads every reactive value via refs, so completing the deps would restart the StrictMode-owned roll and re-fire onResult for an already-delivered result; useEffectEvent (the sanctioned extraction) isn't in React 18.3.1 (#1056)
  }, [rollKey, autoRollOnMount]);

  // Fast-forwards the same in-flight resolver to completion (not a
  // different roll) — same [skip]-only dependency reasoning as DiceRoller's
  // matching effect.
  useEffect(() => {
    if (!skip) return;
    if (!activeRef.current) return;
    activeRef.current = false;
    resolveInstantly();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- skip-interrupt keyed on [skip] alone; resolveInstantly reads live refs, so adding its per-render identity would fire this every render and fight the lifecycle effect for activeRef ownership; useEffectEvent (the sanctioned extraction) isn't in React 18.3.1 (#1056)
  }, [skip]);

  const settled = rolling ? null : result;

  const ariaLabel = settled
    ? `${formatRollSpec(spec)}: ${settled.dice
        .map((die) => (die.dropped ? `${die.value} (dropped)` : `${die.value}`))
        .join(", ")} — total ${settled.total}`
    : rolling
      ? `Rolling ${formatRollSpec(spec)}…`
      : formatRollSpec(spec);

  return (
    <DiceScene
      ariaLabel={ariaLabel}
      label={label}
      showTotal={showTotal}
      settledTotal={settled?.total ?? null}
      className={className}
    >
      <PhysicsRig
        dice={dice}
        resolver={resolver}
        activeRef={activeRef}
        onSettled={finalize}
        geometry={visualGeometry}
        groups={groups}
        rounded={rounded}
        result={result}
        rolling={rolling}
      />
    </DiceScene>
  );
}
