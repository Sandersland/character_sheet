import Spinner from "@/components/ui/Spinner";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";

// useDelayedFlag(true) never trips for a fast (likely cached) import, so this
// renders nothing instead of flashing a spinner; only a slow fetch shows one (#1279).
export default function DelayedSpinner({
  variant = "inline",
}: {
  variant?: "page" | "inline";
}) {
  const show = useDelayedFlag(true);
  return show ? <Spinner variant={variant} /> : null;
}
