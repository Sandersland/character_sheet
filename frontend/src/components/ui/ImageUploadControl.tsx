import { useEffect, useRef, useState } from "react";

import Spinner from "@/components/ui/Spinner";
import { ACCEPTED_IMAGE_TYPES, validateImageFile } from "@/lib/imageUpload";

interface ImageUploadControlProps {
  /** Persisted image URL — the preview when no locally staged file exists. */
  imageUrl?: string | null;
  /** Locally staged file (deferred mode) — previewed via an object URL and
   *  shown in preference to `imageUrl`. */
  file?: File | null;
  /** Disables both actions while the caller's write is in flight. */
  pending?: boolean;
  /** Caller-owned failure (e.g. an upload mutation's error) shown under the
   *  control; a local refusal from validateImageFile takes precedence. */
  error?: string | null;
  /** Fires only with a file that passed validateImageFile — refusals are
   *  rendered here and never reach the caller. */
  onSelect: (file: File) => void;
  onRemove: () => void;
  /** Accessible name for the file input and the preview image. */
  label: string;
  /** "inline" (default) puts the actions beside a small square preview;
   *  "stacked" puts them under the preview so the caller can size the image
   *  as the dominant element (IdentityCard's portrait region). */
  layout?: "inline" | "stacked";
  /** Sizing classes for the preview box; default keeps the compact square
   *  the inline consumers (EntityPortraitField, IdentitySection) rely on. */
  previewClassName?: string;
  /** Placeholder text inside the empty preview box. */
  emptyLabel?: string;
}

// Object-URL lifecycle: one URL per staged file, revoked on replace/unmount so
// staged previews never leak blob registrations.
function useObjectUrl(file: File | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url;
}

const ACTION_BUTTON_CLASS =
  "rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-600 transition-colors hover:border-garnet-700 hover:text-garnet-700 disabled:pointer-events-none disabled:opacity-50";

function PreviewBox({
  url,
  label,
  emptyLabel,
  className,
}: {
  url: string | null;
  label: string;
  emptyLabel: string;
  className: string;
}) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-card border border-parchment-300 bg-gradient-to-br from-garnet-100 to-parchment-200 ${className}`}
    >
      {url ? (
        // Absolute fill keeps an aspect-ratio-sized box honest: an in-flow
        // img's intrinsic height can push a preferred aspect-ratio taller.
        <img
          src={url}
          alt={`${label} preview`}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          {emptyLabel}
        </span>
      )}
    </span>
  );
}

function ActionRow({
  centered,
  pending,
  hasImage,
  onPick,
  onRemove,
}: {
  centered: boolean;
  pending: boolean;
  hasImage: boolean;
  onPick: () => void;
  onRemove: () => void;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${centered ? "justify-center" : ""}`}>
      <button type="button" disabled={pending} onClick={onPick} className={ACTION_BUTTON_CLASS}>
        {hasImage ? "Replace image" : "Choose image"}
      </button>
      {hasImage && (
        <button
          type="button"
          disabled={pending}
          onClick={onRemove}
          className={ACTION_BUTTON_CLASS}
        >
          Remove
        </button>
      )}
      {pending && <Spinner className="py-0" />}
    </div>
  );
}

/**
 * Domain-agnostic image picker with preview (portraits today, campaign
 * entities via #1617): a hidden file input behind visible buttons, so the
 * native control's styling never leaks into the sheet. Deferred mode (create
 * ceremony) passes `file`/`onSelect` and uploads later; immediate mode (edit
 * surfaces) passes `imageUrl` and wires `onSelect`/`onRemove` to mutations.
 */
export default function ImageUploadControl({
  imageUrl = null,
  file = null,
  pending = false,
  error = null,
  onSelect,
  onRemove,
  label,
  layout = "inline",
  previewClassName = "h-24 w-24",
  emptyLabel = "No image",
}: ImageUploadControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const objectUrl = useObjectUrl(file);
  const previewUrl = objectUrl ?? imageUrl;
  const hasImage = Boolean(file ?? imageUrl);
  const message = localError ?? error;

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    // Reset the input so re-picking the same file fires change again
    // (e.g. retrying after a failed upload).
    event.target.value = "";
    if (!picked) return;
    const validation = validateImageFile(picked);
    if (!validation.ok) {
      setLocalError(validation.message);
      return;
    }
    setLocalError(null);
    onSelect(picked);
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        aria-label={label}
        // Keyboard users reach the visible button instead — a focusable
        // sr-only input would take focus with nothing visible to show for it.
        tabIndex={-1}
        className="sr-only"
        onChange={handleChange}
        disabled={pending}
      />
      <div
        className={
          layout === "stacked" ? "flex flex-col items-stretch gap-3" : "flex items-center gap-4"
        }
      >
        <PreviewBox
          url={previewUrl}
          label={label}
          emptyLabel={emptyLabel}
          className={previewClassName}
        />
        <ActionRow
          centered={layout === "stacked"}
          pending={pending}
          hasImage={hasImage}
          onPick={() => inputRef.current?.click()}
          onRemove={() => {
            setLocalError(null);
            onRemove();
          }}
        />
      </div>
      {message && (
        <p role="alert" className="text-sm text-garnet-700">
          {message}
        </p>
      )}
    </div>
  );
}
