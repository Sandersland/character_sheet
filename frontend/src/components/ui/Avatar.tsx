interface AvatarProps {
  name: string | null;
  email: string | null;
  imageUrl: string | null;
  className?: string;
}

// Derive up-to-two-letter initials from a name, else the email initial, else "?".
function initials(name: string | null, email: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1) return words[0][0].toUpperCase();
  if (email && email.trim()) return email.trim()[0].toUpperCase();
  return "?";
}

// Domain-agnostic circular identity badge: image when given, else initials.
export default function Avatar({ name, email, imageUrl, className = "h-8 w-8" }: AvatarProps) {
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-parchment-200 text-sm font-semibold text-parchment-700 ${className}`;

  if (imageUrl) {
    return <img src={imageUrl} alt="" className={`${base} object-cover`} />;
  }

  return (
    <span className={base} aria-hidden="true">
      {initials(name, email)}
    </span>
  );
}
