import { useQueryClient } from "@tanstack/react-query";

import { deleteCharacterPortrait, uploadCharacterPortrait } from "@/api/client";
import { characterKeys } from "@/api/queryKeys";
import Card from "@/components/ui/Card";
import ImageUploadControl from "@/components/ui/ImageUploadControl";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { Character } from "@/types/character";

/**
 * Story-tab portrait editor (#1616) — both the sheet's portrait render site
 * and the post-creation surface to add/replace/remove one. The returned
 * Character's portraitUrl carries a fresh ?v= per upload (#1615's immutable
 * cache contract), so useCharacterMutation's setQueryData alone makes the
 * <img> refetch — no reload, no manual cache busting.
 */
export default function PortraitCard() {
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
    <Card title="Portrait" className="p-4">
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
      />
    </Card>
  );
}
