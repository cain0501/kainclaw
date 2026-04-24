import type { CompanionData, CompanionSpecies, Rarity } from "./companionTypes";

function hashString(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash + char.charCodeAt(0)) % 100;
  }
  return hash;
}

function getSpecies(hash: number): CompanionSpecies {
  return hash % 2 === 0 ? "capybara" : "duck";
}

function getRarity(hash: number): Rarity {
  if (hash <= 59) return "common";
  if (hash <= 84) return "uncommon";
  if (hash <= 94) return "rare";
  if (hash <= 98) return "epic";
  return "legendary";
}

function isPremiumRarity(rarity: Rarity): boolean {
  return rarity === "rare" || rarity === "epic" || rarity === "legendary" || rarity === "shiny";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function generateCompanion(uuid: string, hasLicense: boolean): CompanionData {
  const hash = hashString(uuid);
  const shinyRoll = hashString(`${uuid}:shiny`);
  const rarity = shinyRoll === 0 ? "shiny" : getRarity(hash);

  const companion: CompanionData = {
    species: getSpecies(hash),
    rarity,
    moodLevel: 60,
    bondLevel: 1,
    totalConversations: 0,
    lastActiveAt: Date.now(),
  };

  if (!hasLicense && isPremiumRarity(rarity)) {
    return {
      ...companion,
      rarity: "uncommon",
      lockedRarity: true,
    };
  }

  return companion;
}

export function applyMoodDelta(data: CompanionData, delta: number): CompanionData {
  return {
    ...data,
    moodLevel: clamp(data.moodLevel + delta, 0, 100),
    bondLevel: clamp(Math.max(data.bondLevel, 1 + Math.floor(data.totalConversations / 20)), 1, 10),
  };
}

export function getIdleDecay(data: CompanionData): number {
  const elapsedMinutes = Math.floor((Date.now() - data.lastActiveAt) / 60_000);
  return Math.max(0, elapsedMinutes - 10);
}
