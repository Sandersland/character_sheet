// Timeout for tests calling seedClassFeatures, which rewrites the whole ClassFeature table (grows with every class wave). If this bound is ever exceeded, that's a real regression — don't raise it again without measuring first.
export const RESEED_TIMEOUT_MS = 60_000;
