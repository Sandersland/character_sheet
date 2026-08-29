import { useEffect, useRef, useState } from "react";

import { selectAndCopy, writeToClipboard } from "@/lib/clipboard";

// No "failed" state: every non-copy outcome lands in "manual", which is actionable.
type CopyStatus = "idle" | "copied" | "manual";

const MANUAL_HINT = "Link selected — press Ctrl+C (Cmd+C on Mac) to copy it.";

export default function CampaignInviteLink({ inviteCode }: { inviteCode: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const inviteUrl = `${window.location.origin}/join/${inviteCode}`;

  // Only "copied" self-clears; arming the timer in an effect gives us the
  // clearTimeout that stops timers stacking on repeat clicks.
  useEffect(() => {
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  // writeToClipboard reports a missing clipboard API as false rather than throwing (#1467).
  async function copyInvite() {
    if (await writeToClipboard(inviteUrl)) {
      setStatus("copied");
      return;
    }
    const input = inputRef.current;
    setStatus(input && selectAndCopy(input) ? "copied" : "manual");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="block text-xs font-semibold text-parchment-700" htmlFor="campaign-invite">
        Invite link
      </label>
      <div className="flex gap-2">
        <input
          id="campaign-invite"
          ref={inputRef}
          type="text"
          readOnly
          value={inviteUrl}
          className="w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 focus:border-garnet-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={copyInvite}
          className="shrink-0 rounded-control bg-garnet-surface px-3 py-1.5 text-sm font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-surface-hover"
        >
          {status === "copied" ? "Copied" : "Copy"}
        </button>
      </div>
      {/* Always mounted: text injected into a freshly-mounted aria-live region is unreliably announced. */}
      <p role="status" className="text-xs font-semibold text-garnet-700">
        {status === "copied" && "Copied to clipboard."}
        {status === "manual" && MANUAL_HINT}
      </p>
    </div>
  );
}
