export const XP_PER_LEVEL = 100;
export const XP_PER_APPROVAL = 10;

const titles = ["Seedling", "Sprout", "Sapling", "Grove Keeper", "Canopy Scout", "Forest Guide", "Tree Warden", "Elder Ranger"];

export function levelFromXp(xp: number) {
  return Math.floor(Math.max(xp, 0) / XP_PER_LEVEL) + 1;
}

export function levelProgress(xp: number) {
  const level = levelFromXp(xp);
  const into = Math.max(xp, 0) - (level - 1) * XP_PER_LEVEL;
  return { level, into, next: XP_PER_LEVEL, percent: Math.min(100, Math.round((into / XP_PER_LEVEL) * 100)) };
}

export function levelTitle(level: number) {
  return titles[Math.min(level - 1, titles.length - 1)];
}

export const achievementLabels: Record<string, string> = {
  first_plant: "First plant",
  five_verified: "5 verified",
  ten_verified: "10 verified",
  plant_hunter: "Plant hunter",
};
