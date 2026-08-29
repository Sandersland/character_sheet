import { useQueryClient } from "@tanstack/react-query";

import { deleteCharacterPortrait, uploadCharacterPortrait } from "@/api/client";
import { characterKeys } from "@/api/queryKeys";
import Card from "@/components/ui/Card";
import ImageUploadControl from "@/components/ui/ImageUploadControl";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { Character } from "@/types/character";

// The portrait response carries a fresh ?v= per upload (#1615's immutable cache contract), so setQueryData alone makes the <img> refetch.
export default function IdentityCard() {
  const { character } = useCurrentCharacter();
  const queryClient = useQueryClient();
  // Character-list summaries carry their own portraitUrl copies, so invalidate that cache too.
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
        {/* w-48 keeps the action buttons on one row, under the stored image's 256px sharpness ceiling (uploads are <=512px WebP). */}
        <div className="mx-auto w-48 shrink-0 sm:mx-0">
          <ImageUploadControl
            imageUrl={character.portraitUrl ?? null}
            pending={upload.isPending || remove.isPending}
            error={upload.error ?? remove.error}
            // Cross-reset the sibling mutation so its stale error can't shadow this one's outcome.
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
