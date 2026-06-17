import { useParams } from "react-router-dom";

export default function CharacterSheetPage() {
  const { id } = useParams();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Character {id}</h1>
      <p className="text-gray-500">Character sheet coming soon.</p>
    </div>
  );
}
