import { useState } from "react";

import { monogram } from "@/lib/codexLedger";
import { ENTITY_TYPE_MONOGRAM_CLASS } from "@/lib/mentions";
import type { EntityType } from "@/types/character";

// Shared portrait tile (#844): the image when set, else the type-tinted monogram.
export default function EntityPortrait({
  name,
  type,
  portraitUrl,
  className = "",
}: {
  name: string;
  type: EntityType;
  portraitUrl?: string | null;
  className?: string;
}) {
  // Keyed on the failing URL so a new URL self-resets without a remount.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (portraitUrl && portraitUrl !== failedUrl) {
    return (
      <span
        aria-hidden="true"
        className={`block shrink-0 overflow-hidden rounded-card ${className}`}
      >
        <img
          src={portraitUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(portraitUrl)}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-card font-display font-semibold ${ENTITY_TYPE_MONOGRAM_CLASS[type]} ${className}`}
    >
      {monogram(name)}
    </span>
  );
}
