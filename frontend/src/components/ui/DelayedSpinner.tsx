import Spinner from "@/components/ui/Spinner";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";

/**
 * Suspense fallback for a lazy chunk. useDelayedFlag(true) never trips for a
 * fast (likely cached) import, so it renders nothing instead of flashing a
 * spinner; only a genuinely slow fetch shows one (#1279).
 */
export default function DelayedSpinner({
  variant = "inline",
}: {
  variant?: "page" | "inline";
}) {
  const show = useDelayedFlag(true);
  return show ? <Spinner variant={variant} /> : null;
}
