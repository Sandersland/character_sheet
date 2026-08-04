import { useQueryClient } from "@tanstack/react-query";

import { deleteCharacterPortrait, uploadCharacterPortrait } from "@/api/client";
import { characterKeys } from "@/api/queryKeys";
import Card from "@/components/ui/Card";
import ImageUploadControl from "@/components/ui/ImageUploadControl";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { Character } from "@/types/character";

/**
 * Identity summary (#927) + portrait editor (#1616, merged here by #1618 so
 * the portrait sits beside the identity fields instead of floating in its own
 * near-empty card). The portrait region is both the sheet's portrait render
 * site and the post-creation surface to add/replace/remove one. The returned
 * Character's portraitUrl carries a fresh ?v= per upload (#1615's immutable
 * cache contract), so useCharacterMutation's setQueryData alone makes the
 * <img> refetch — no reload, no manual cache busting. The background/alignment
 * fields stay read-only display; editable narrative fields land in #930.
 */
export default function IdentityCard() {
  const { character } = useCurrentCharacter();
  const queryClient = useQueryClient();
  // Character-list summaries carry their own portraitUrl copies — invalidate
  // so the CharacterCard thumbnail matches the sheet after a write.
  const invalidateList = () =>
    void queryClient.invalidateQueries({ queryKey: characterKeys.list() });

  const upload = useCharacterMutation<File, Character>({
    characterId: character.id,
    mutationFn: (file) => uploadCharacterPortrait(character.id, file),
    toCharacter: (c) => c,
    fallbackMessage: "Couldn't upload the portrait",
    onCharacterWritten: invalidateList,
  });
  const remove = useCharacterMutation<void, Character>({
    characterId: character.id,
    mutationFn: () => deleteCharacterPortrait(character.id),
    toCharacter: (c) => c,
    fallbackMessage: "Couldn't remove the portrait",
    onCharacterWritten: invalidateList,
  });

  return (
    <Card title="Identity" className="p-4 sm:p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
        {/* w-48 keeps the pair of action buttons on one row and stays under the
            stored image's 256px sharpness ceiling (uploads are ≤512px WebP). */}
        <div className="mx-auto w-48 shrink-0 sm:mx-0">
          <ImageUploadControl
            imageUrl={character.portraitUrl ?? null}
            pending={upload.isPending || remove.isPending}
            error={upload.error ?? remove.error}
            // Cross-reset the sibling mutation so a stale error from the previous
            // action can't outlive (or shadow) the outcome of this one.
            onSelect={(file) => {
              remove.reset();
              upload.mutate(file);
            }}
            onRemove={() => {
              upload.reset();
              remove.mutate();
            }}
            label="Portrait"
            layout="stacked"
            previewClassName="aspect-[4/5] w-full"
            emptyLabel="Add a portrait"
          />
        </div>
        <dl className="flex min-w-0 flex-1 flex-col gap-4 sm:pt-1">
          <Row label="Background" value={character.background} />
          <Row label="Alignment" value={character.alignment} />
        </dl>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-parchment-800">{label}</dt>
      <dd className="text-sm text-parchment-600">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}
