/** Narrow an unknown thrown value to a message, falling back to a default. */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
