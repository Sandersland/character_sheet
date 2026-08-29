import type { ReactNode } from "react";
import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";

import { configureDiceText } from "@/lib/troikaTextConfig";

// Runs when the lazy dice chunk evaluates — before any DieMesh <Text> renders —
// so troika stays on the main thread (#408) without pinning it into the initial
// bundle (#432).
configureDiceText();

interface DiceSceneProps {
  ariaLabel: string;
  label?: string;
  showTotal?: boolean;
  settledTotal: number | null;
  className?: string;
  children: ReactNode;
}

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
          {/* Kept low — the Lightformer environment below does most of the
              lighting via clearcoat highlights; raising these washes out the glossy look. */}
          <ambientLight intensity={0.3} />
          <directionalLight position={[2.5, 4, 3]} intensity={0.7} />
          {/* Renders outside the cosmetic Suspense below — a suspending
              cosmetic (env map, troika text) must never be able to unmount
              the roll's source of truth (#408). */}
          {children}
          {/* Cosmetic-only; its own Suspense boundary keeps async env-map
              setup from gating the rig above. */}
          <Suspense fallback={null}>
            {/* Re-renders the shadow map every frame so it tracks the dice as they bounce and skitter. */}
            <ContactShadows position={[0, -1.1, 0]} opacity={0.35} blur={2.4} far={3} scale={10} frames={Infinity} />
            {/* Lighting-only (no HDRI fetch, no background — canvas stays
                transparent via gl.alpha) so the resin clearcoat has something
                to reflect; resolution kept tiny since these dice render at ~176px tall. */}
            <Environment resolution={64}>
              <Lightformer form="rect" intensity={2} position={[0, 5, 2]} scale={[6, 6, 1]} color="#fff7ec" />
              <Lightformer form="rect" intensity={1} position={[-4, 2, 3]} scale={[3, 3, 1]} color="#ffe3c2" />
              <Lightformer form="rect" intensity={0.6} position={[4, 1, -3]} scale={[3, 3, 1]} color="#cfe0ff" />
            </Environment>
          </Suspense>
        </Canvas>
      </div>
      {/* Always rendered (not conditionally mounted) so this component's
          height never changes between idle/rolling/settled. */}
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
