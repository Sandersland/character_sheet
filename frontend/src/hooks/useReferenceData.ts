import { useEffect, useState } from "react";

import { fetchReference } from "@/api/client";
import type { ReferenceData } from "@/types/character";

export function useReferenceData() {
  const [reference, setReference] = useState<ReferenceData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchReference()
      .then((data) => {
        if (mounted) setReference(data);
      })
      .catch(() => {
        if (mounted) setError(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return { reference, error };
}
