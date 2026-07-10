const MAX_LEVEL = 20;

// Index 0 = XP required for level 1 (always 0) ... index 19 = level 20.
const XP_THRESHOLDS: readonly number[] = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000,
  120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export function levelForExperience(xp: number): number {
  let level = 1;
  for (let i = 0; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) level = i + 1;
  }
  return Math.min(level, MAX_LEVEL);
}

export function proficiencyBonusForLevel(level: number): number {
  if (level >= 17) return 6;
  if (level >= 13) return 5;
  if (level >= 9) return 4;
  if (level >= 5) return 3;
  return 2;
}

export interface ExperienceProgress {
  level: number;
  proficiencyBonus: number;
  currentLevelThreshold: number;
  nextLevelThreshold: number | null;
}

export function experienceProgress(xp: number): ExperienceProgress {
  const level = levelForExperience(xp);
  return {
    level,
    proficiencyBonus: proficiencyBonusForLevel(level),
    currentLevelThreshold: XP_THRESHOLDS[level - 1],
    nextLevelThreshold: level < MAX_LEVEL ? XP_THRESHOLDS[level] : null,
  };
}
