import { useVisualViewport } from "@/hooks/useVisualViewport";

export function useVisualViewportHeight(): number {
  return useVisualViewport().height;
}
