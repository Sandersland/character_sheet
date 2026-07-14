import { useVisualViewport } from "@/hooks/useVisualViewport";

// The visible viewport height, shrinking when the on-screen keyboard opens.
// A thin projection of `useVisualViewport` (the keyboard-aware geometry hook) —
// used to cap the BottomSheet body above the keyboard (#784) and the mobile
// mention suggestion list (#785), which only need the height.
export function useVisualViewportHeight(): number {
  return useVisualViewport().height;
}
