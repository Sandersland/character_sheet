import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { deleteCharacter } from "@/api/client";
import { getQueryClient } from "@/api/queryClient";
import { characterKeys } from "@/api/queryKeys";
import Modal from "@/components/ui/Modal";
import type { CharacterSummary } from "@/types/character";

interface DeleteCharacterModalProps {
  characterId: string;
  characterName: string;
  onClose: () => void;
}

export default function DeleteCharacterModal({
  characterId,
  characterName,
  onClose,
}: DeleteCharacterModalProps) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await deleteCharacter(characterId);
      // Cache is written directly, not invalidated (#1660): navigating inside the 30s staleTime would otherwise serve the stale list with the deleted row.
      const queryClient = getQueryClient();
      queryClient.setQueryData<CharacterSummary[]>(characterKeys.list(), (prev) =>
        prev?.filter((character) => character.id !== characterId),
      );
      queryClient.removeQueries({ queryKey: characterKeys.detail(characterId) });
      navigate("/", { replace: true });
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(false);
    }
  }

  return (
    <Modal title="Delete character?" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <p className="text-sm text-parchment-700">
          Permanently delete{" "}
          <span className="font-semibold text-parchment-900">{characterName}</span>?{" "}
          <span className="font-semibold text-garnet-700">
            This can't be undone.
          </span>
        </p>

        {error && (
          <p className="text-xs font-semibold text-garnet-700">{error}</p>
        )}

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className="rounded-control bg-garnet-surface px-4 py-2 text-sm font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-surface-hover disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-sm font-semibold text-garnet-700 hover:underline disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
