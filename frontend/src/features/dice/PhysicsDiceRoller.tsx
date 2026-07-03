import { createRef, useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type * as CANNON from "cannon-es";
import type * as THREE from "three";

import { formatRollSpec, summarizeRoll } from "@/lib/dice";
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

// FIXED_DT (imported from physicsDice.ts) is the fixed simulated-time step used
// to fast-forward a roll with no animation (reduced-motion, or a mid-tumble
// Skip): each synchronous tick advances the same amount of sim time a real
// animated frame would. Sharing the constant keeps the two paths in lockstep.
// Safety cap on instant-resolve loop iterations. Belt-and-suspenders
// alongside the resolver's own MAX_ROLL_MS-based cutoff — elapsedMs climbs
// by a fixed amount every tick regardless of real time, so this should never
// actually bind, but it guarantees the loop can't spin forever if it did.
const INSTANT_RESOLVE_MAX_TICKS = 600;

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

/**
 * Lives inside `DiceScene`'s `<Canvas>` (required for `useFrame`) and owns
 * the only per-frame work: stepping the shared cannon-es world while a roll
 * is animating, and copying each die's body transform onto its `DieMesh`
 * every frame regardless of *why* the body moved — a real animated step
 * here, or a synchronous instant-resolve the parent already ran before this
 * frame was even scheduled. That split is what lets the reduced-motion/skip
 * path reuse the exact same physics resolution without a visible tumble.
 */
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

/**
 * Real-physics dice roller: thrown with randomized velocity/spin into an
 * invisible tray (gravity, collisions, bouncing — see `lib/physicsDice.ts`),
 * and the result is *read off whichever face lands up* rather than decided
 * in advance — physics is the source of randomness here, unlike the
 * scripted `DiceRoller`. Shares the same look (`DieMesh`/`DiceScene`) and
 * the same public props as `DiceRoller` so the two are interchangeable
 * (see `DiceRollSequence`'s `roller` prop); character creation's ability
 * scores use this one.
 *
 * Reduced-motion and a mid-tumble Skip both fast-forward the *same* physics
 * resolution synchronously (many fixed simulated steps with nothing
 * rendered in between) rather than substituting a different source of
 * randomness — so a skipped roll is exactly as fair as a watched one.
 */
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
  // Whether an animated (multi-frame) roll is currently in flight — read and
  // written by both this component (to start/cancel one) and `PhysicsRig`'s
  // `useFrame` (to step it and notice when it's done). A plain mutable ref
  // rather than state since per-frame physics has no business going through
  // React's render cycle.
  const activeRef = useRef(false);

  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // The world/bodies/resolver are created once, lazily, for this instance's
  // whole lifetime — cannon-es objects hold no GPU resources to dispose, and
  // a given roller instance always rolls the same spec.count/spec.faces (the
  // orchestrators that mount this component, e.g. DiceRollSequence, keep one
  // instance alive across an entire multi-step sequence and only ever change
  // *which* roll via rollKey, never the spec shape).
  const physicsRef = useRef<{
    world: CANNON.World;
    dice: PhysicsDie[];
    resolver: ReturnType<typeof createRollResolver>;
  } | null>(null);
  if (physicsRef.current === null) {
    const { world, diceMaterial } = createDiceWorld(spec.count);
    const dice: PhysicsDie[] = Array.from({ length: spec.count }, (_, index) => {
      const laneX = (index - (spec.count - 1) / 2) * DIE_GAP;
      const body = createDieBody(diceMaterial);
      // Rest in its tidy lane from the very first paint, same as the
      // scripted roller's idle pose, rather than at the cannon body default
      // of the world origin until the first roll throws it somewhere real.
      body.position.set(laneX, FLOOR_Y + D6_SIZE / 2, 0);
      world.addBody(body);
      return { body, groups, laneX };
    });
    physicsRef.current = { world, dice, resolver: createRollResolver(world, dice) };
  }
  const { dice, resolver } = physicsRef.current;

  function finalize(values: number[]) {
    const next = summarizeRoll(values, specRef.current);
    setResult(next);
    setRolling(false);
    onResultRef.current?.(next);
  }

  /** Runs the resolver to completion synchronously, with nothing rendered in
   *  between — used for reduced motion and for fast-forwarding a Skip. */
  function resolveInstantly() {
    let tick = resolver.tick(FIXED_DT);
    let iterations = 0;
    while (!tick.done && iterations < INSTANT_RESOLVE_MAX_TICKS) {
      tick = resolver.tick(FIXED_DT);
      iterations += 1;
    }
    activeRef.current = false;
    // tick.values is always set once tick.done is true (see
    // createRollResolver) — the fallback below is unreachable in practice,
    // a last-resort guard against ever hanging if that invariant breaks.
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

  // This effect owns the *entire* lifecycle of a triggered roll, including
  // tearing it down — see DiceRoller's identical pattern for why: StrictMode
  // double-invokes every effect on mount (setup → cleanup → setup again) in
  // dev, and a cleanup declared separately would still run in between those
  // two setups and cancel the roll this effect just started, with nothing
  // left to reschedule it. Returning the matching undo here instead means
  // the second StrictMode setup sees a fresh state and re-rolls for real,
  // while genuine unmounts/rollKey changes still cancel cleanly.
  useEffect(() => {
    if (rollKey !== undefined) {
      if (lastRollKeyRef.current === rollKey) return undefined;
      const previousRollKey = lastRollKeyRef.current;
      lastRollKeyRef.current = rollKey;
      roll();
      return () => {
        // Only undo the dedupe if there's an actual animated roll in flight
        // to cancel — instant resolution (skip/reduced-motion) has nothing
        // pending by the time `roll()` returns, and letting the replay reset
        // lastRollKeyRef there would re-roll and fire onResult a second time
        // for an already-delivered result.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey, autoRollOnMount]);

  // Lets a parent (e.g. DiceRollSequence) interrupt an in-flight tumble on
  // demand — same [skip]-only dependency reasoning as DiceRoller's matching
  // effect. Rather than substituting a different result, this fast-forwards
  // the *same* in-flight resolver (whatever sim time it's already
  // accumulated, picking up right where the animated ticks left off) to
  // completion with nothing rendered in between, so a skipped roll is just a
  // faster-watched one, not a different roll.
  useEffect(() => {
    if (!skip) return;
    if (!activeRef.current) return; // nothing in flight to interrupt
    activeRef.current = false;
    resolveInstantly();
    // Deliberately keyed on [skip] alone, not [skip, resolveInstantly] —
    // resolveInstantly only reads the refs above (always current), and
    // depending on a function recreated every render would fire this on
    // every render, fighting the lifecycle effect above for ownership of
    // activeRef the same way depending on `rolling`/`result` would.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
