import type { ReactNode } from "react";
import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";

interface DiceSceneProps {
  /** Full aria-live summary for the roll (idle / rolling / settled wording is the caller's call). */
  ariaLabel: string;
  /** Optional caption shown above the dice (e.g. "Hit dice", "Attack roll"). */
  label?: string;
  /** Show the settled total below the dice. Defaults to true for standalone use. */
  showTotal?: boolean;
  /** The settled total, or null while idle/rolling — drives the total readout. */
  settledTotal: number | null;
  className?: string;
  /** The dice meshes for this roll (e.g. one `DieMesh`-rendering child per die). */
  children: ReactNode;
}

/**
 * Shared canvas/scene chrome for every dice roller: the camera, lighting,
 * resin-reflection environment, contact shadow, fixed-height canvas, and the
 * surrounding aria-live/total-readout DOM. Both the scripted animator
 * (`DiceRoller`) and the physics roller (`PhysicsDiceRoller`) mount their
 * dice as `children` into this same stage, so neither can visually drift
 * from the other — there is exactly one place that owns "what the dice look
 * like they're sitting in".
 */
export default function DiceScene({
  ariaLabel,
  label,
  showTotal = true,
  settledTotal,
  className = "",
  children,
}: DiceSceneProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={`flex flex-col items-center gap-1 ${className}`}
    >
      {label && (
        <span className="text-xs font-semibold uppercase tracking-wide text-parchment-600">
          {label}
        </span>
      )}
      <div aria-hidden="true" className="h-44 w-full">
        <Canvas dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }} camera={{ position: [0, 7, 3], fov: 32 }}>
          {/* Dialed down from the pre-resin-material intensities (0.7/1.05) —
              the inline-Lightformer Environment below now does most of the
              work, via clearcoat specular highlights, so blowing out the
              scene with strong ambient/directional light would wash that
              out and flatten the glossy look. */}
          <ambientLight intensity={0.3} />
          <directionalLight position={[2.5, 4, 3]} intensity={0.7} />
          <Suspense fallback={null}>
            {children}
            {/* frames={Infinity} re-renders the shadow map every frame so it
                tracks the dice as they bounce and skitter; frames={1} (the
                previous setting) bakes a single static shadow that can't
                follow motion and visibly snaps whenever the scene re-renders. */}
            <ContactShadows position={[0, -1.1, 0]} opacity={0.35} blur={2.4} far={3} scale={10} frames={Infinity} />
            {/* Lighting-only environment (no HDRI fetch, no background — the
                canvas stays transparent via gl.alpha) so the glossy resin
                clearcoat has something to reflect. resolution is kept tiny
                since these dice render at ~176px tall. */}
            <Environment resolution={64}>
              <Lightformer form="rect" intensity={2} position={[0, 5, 2]} scale={[6, 6, 1]} color="#fff7ec" />
              <Lightformer form="rect" intensity={1} position={[-4, 2, 3]} scale={[3, 3, 1]} color="#ffe3c2" />
              <Lightformer form="rect" intensity={0.6} position={[4, 1, -3]} scale={[3, 3, 1]} color="#cfe0ff" />
            </Environment>
          </Suspense>
        </Canvas>
      </div>
      {/* Always rendered (rather than conditionally mounted) so this
          component's own height never changes between idle/rolling/settled
          — letting any layout-shift fix at the parent actually hold. */}
      {showTotal && (
        <span
          aria-hidden={settledTotal === null}
          className={`font-display text-2xl font-semibold leading-none tabular-nums text-garnet-800 ${
            settledTotal === null ? "invisible" : ""
          }`}
        >
          = {settledTotal === null ? " " : settledTotal}
        </span>
      )}
    </div>
  );
}
