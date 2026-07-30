import { useEffect, useRef, useState } from "react";

import { selectAndCopy, writeToClipboard } from "@/lib/clipboard";

// No "failed" state: every outcome that isn't a copy now lands in "manual",
// which is actionable — the link is selected and the hint says how to take it.
type CopyStatus = "idle" | "copied" | "manual";

const MANUAL_HINT = "Link selected — press Ctrl+C (Cmd+C on Mac) to copy it.";

// Read-only invite URL with a copy button — shared by the campaign detail header.
export default function CampaignInviteLink({ inviteCode }: { inviteCode: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const inviteUrl = `${window.location.origin}/join/${inviteCode}`;

  // Only "copied" self-clears. "manual" is the one state that asks the user to
  // act, and the pre-#1467 unconditional setTimeout wiped it 2s into being read.
  // Arming the timer in an effect (rather than in the handler) is also what gives
  // us the clearTimeout that stops timers stacking across repeat clicks.
  useEffect(() => {
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  // Fallback ladder (#1467): async clipboard, then select + execCommand, then
  // leave the link selected with a hint. navigator.clipboard is missing outright
  // on the plain-http LAN origin the dev server is deliberately reachable at, and
  // writeToClipboard reports that as false rather than throwing.
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
      {/* Always mounted: text injected into a freshly-mounted aria-live region is
          unreliably announced, which is why the old conditional <p> announced
          nothing. */}
      <p role="status" className="text-xs font-semibold text-garnet-700">
        {status === "copied" && "Copied to clipboard."}
        {status === "manual" && MANUAL_HINT}
      </p>
    </div>
  );
}
