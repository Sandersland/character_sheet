import type { ActivationType } from "@/types/character";

// Mirrors the backend's describeActivation; keep both in sync (#543).
const ACTIVATION_LABELS: Record<ActivationType, string> = {
  action: "Action",
  bonus: "Bonus action",
  reaction: "Reaction",
  commandWord: "Command word",
};

export function activationLabel(activation: ActivationType): string {
  return ACTIVATION_LABELS[activation];
}
