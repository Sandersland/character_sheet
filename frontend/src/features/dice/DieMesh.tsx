import { forwardRef } from "react";
import { Text } from "@react-three/drei";
import type * as THREE from "three";

import {
  DEFAULT_FACE_LABEL_FONT_SIZE,
  DIE_BODY_COLOR,
  DIE_BODY_COLOR_DROPPED,
  DIE_LABEL_COLOR,
  DIE_LABEL_COLOR_DROPPED,
  DIE_LABEL_OUTLINE_COLOR,
  FACE_LABEL_FONT_SIZE,
  FACE_LABEL_OUTLINE_WIDTH,
  LABEL_SURFACE_OFFSET,
  type FaceGroup,
} from "@/lib/dieFaces";

interface DieMeshProps {
  geometry: THREE.BufferGeometry;
  groups: FaceGroup[];
  rounded: boolean;
  value: number | null;
  dropped: boolean;
  rolling: boolean;
  /** Initial pose, before whatever drives the forwarded group ref (a
   *  scripted tween or a physics body sync) takes over each frame. */
  position?: readonly [number, number, number];
}

/**
 * One die's visual representation: the resin-look body plus its per-face
 * number labels. Purely presentational — it owns no animation and no
 * per-roll state. The group transform is driven entirely by whatever forwards
 * a ref to it: `DiceRoller`'s scripted tween eases position/quaternion every
 * frame, while `PhysicsDiceRoller` copies a cannon-es body's position/
 * quaternion onto it every frame. This split is what lets both rollers share
 * an identical look without sharing (or forking) animation logic.
 */
const DieMesh = forwardRef<THREE.Group, DieMeshProps>(function DieMesh(
  { geometry, groups, rounded, value, dropped, rolling, position = [0, 0, 0] },
  ref,
) {
  // Only reveal that a die was dropped once the whole set has actually
  // stopped — the result (and so `dropped`) may be known before the dice
  // settle, but showing it mid-roll spoils which die "loses" before the
  // others have a chance to land.
  const isResolvedDrop = dropped && !rolling;
  const bodyColor = isResolvedDrop ? DIE_BODY_COLOR_DROPPED : DIE_BODY_COLOR;
  const labelColor = isResolvedDrop ? DIE_LABEL_COLOR_DROPPED : DIE_LABEL_COLOR;
  const showFaceLabels = groups.length > 0;
  const fontSize = FACE_LABEL_FONT_SIZE[groups.length] ?? DEFAULT_FACE_LABEL_FONT_SIZE;

  return (
    <group ref={ref} position={position}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          color={bodyColor}
          flatShading={!rounded}
          roughness={0.35}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.15}
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
            outlineWidth={FACE_LABEL_OUTLINE_WIDTH}
            outlineColor={DIE_LABEL_OUTLINE_COLOR}
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
});

export default DieMesh;
