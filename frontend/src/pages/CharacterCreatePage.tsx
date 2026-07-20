import CreationCeremony from "@/features/character-create/CreationCeremony";

// Thin route: the whole creation flow is the ceremony (#1176), which owns its
// own reference-loading/error states.
export default function CharacterCreatePage() {
  return <CreationCeremony />;
}
