/**
 * SessionPage — the live-play (action-first) mode, reached by navigating to
 * /characters/:id/session after starting a session.
 *
 * Focused on what you DO at the table: take damage/heal, roll equipped weapons'
 * attack and damage (with correct versatile die), spend resources, use inventory,
 * and end the session when you're done.
 *
 * This shell resolves the character + active session, then hands off to
 * SessionContent (features/session) — extracted so useTurnState is called with a
 * guaranteed non-null character and real sessionId.
 *
 * The character sheet (/characters/:id) is the static reference view.
 */

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import Spinner from "@/components/ui/Spinner";
import SessionContent from "@/features/session/SessionContent";
import { useCharacter } from "@/hooks/useCharacter";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useReferenceData } from "@/hooks/useReferenceData";
import { fetchActiveSession } from "@/api/client";
import type { Session } from "@/types/character";

export default function SessionPage() {
  return <SessionPageInner />;
}

function SessionPageInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { character, error, setCharacter } = useCharacter(id);
  const { reference } = useReferenceData();
  const [session, setSession] = useState<Session | null>(null);
  const showSpinner = useDelayedFlag(
    (character === undefined || session === null) && !error,
  );

  // Resolve the active session on mount. If none found, bounce back to the sheet.
  useEffect(() => {
    if (!id) return;
    fetchActiveSession(id).then((s) => {
      if (!s) {
        navigate(`/characters/${id}`, { replace: true });
      } else {
        setSession(s);
      }
    });
  }, [id, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-parchment-100 px-6 text-center">
        <p className="text-sm text-parchment-600">Couldn't load character. Check the backend.</p>
        <Link to="/" className="text-xs font-semibold text-garnet-700 hover:underline">
          ← All characters
        </Link>
      </div>
    );
  }

  if (character === undefined || session === null) {
    return showSpinner ? <Spinner variant="page" /> : null;
  }

  if (character === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-parchment-100">
        <p className="text-sm text-parchment-600">Character not found.</p>
        <Link to="/" className="text-xs font-semibold text-garnet-700 hover:underline">
          ← All characters
        </Link>
      </div>
    );
  }

  return (
    <SessionContent
      character={character}
      session={session}
      reference={reference}
      setCharacter={setCharacter}
      navigate={navigate}
    />
  );
}
