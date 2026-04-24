export type CompanionState = "idle" | "thinking" | "working" | "done" | "sleeping" | "clicked";

export type CompanionSpecies = "capybara" | "duck";

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "shiny";

export interface CompanionData {
  species: CompanionSpecies;
  rarity: Rarity;
  moodLevel: number;
  bondLevel: number;
  totalConversations: number;
  lastActiveAt: number;
  lockedRarity?: boolean;
}
