import ImageUploadControl from "@/components/ui/ImageUploadControl";

// Label + picker wrapper shared by the codex create (deferred `file`) and edit
// (immediate `imageUrl`) portrait surfaces (#1617). Hosts render it only for
// the campaign OWNER — portrait writes are an owner-only act.
export default function EntityPortraitField({
  imageUrl,
  file,
  pending,
  onSelect,
  onRemove,
}: {
  imageUrl?: string | null;
  file?: File | null;
  pending: boolean;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <span className="block text-xs font-semibold text-parchment-700">Portrait</span>
      <div className="mt-1">
        <ImageUploadControl
          imageUrl={imageUrl}
          file={file}
          pending={pending}
          onSelect={onSelect}
          onRemove={onRemove}
          label="Portrait"
        />
      </div>
    </div>
  );
}
