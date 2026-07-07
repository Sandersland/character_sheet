import type { ActivationType } from "@/types/character";

// Display labels for an activatedEffect's activation type (#543). Never render
// the raw key — resolve through here, mirroring the backend describeActivation.
const ACTIVATION_LABELS: Record<ActivationType, string> = {
  action: "Action",
  bonus: "Bonus action",
  reaction: "Reaction",
  commandWord: "Command word",
};

export function activationLabel(activation: ActivationType): string {
  return ACTIVATION_LABELS[activation];
}
