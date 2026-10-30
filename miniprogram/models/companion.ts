export interface CompanionPlacement {
  id: string;
  itemId: string;
  x: number;
  y: number;
  rotation: number;
}
export interface CompanionState {
  schemaVersion: 1;
  adoptedAt: string | null;
  name: string;
  skinId: string;
  accessoryId: string;
  theme: string;
  crystals: number;
  shards: number;
  ownedSkins: string[];
  ownedAccessories: string[];
  furniture: Record<string, number>;
  placements: CompanionPlacement[];
  checkins: string[];
  claimed: string[];
  events: Record<'play' | 'decorate' | 'read' | 'visit', string[]>;
  readLetters: string[];
  tutorialStep: number;
  mbti: string;
  showOnJournal: boolean;
  haptics: boolean;
  lastMutationDay: string;
  receipts: { key: string; message: string }[];
  cloudRevision: number;
  cloudVisibility: 'private' | 'friends';
}
export interface CompanionFacts {
  totalEntries: number;
  entriesToday: number;
  photosToday: number;
  recordedDays: number;
  latestMood: string;
}
export interface CompanionCommand {
  type: string;
  requestId?: string;
  [key: string]: unknown;
}
export interface CompanionTask {
  id: string;
  title: string;
  hint: string;
  reward: number;
  eligible: boolean;
  claimed: boolean;
  action: string;
}
export interface CompanionLetter {
  id: string;
  title: string;
  body: string;
  read: boolean;
  date: string;
}
export interface CompanionResult {
  state: CompanionState;
  message: string;
  reward?: { itemId: string; duplicate: boolean };
}
export const EMPTY_COMPANION_FACTS: CompanionFacts = {
  totalEntries: 0,
  entriesToday: 0,
  photosToday: 0,
  recordedDays: 0,
  latestMood: 'calm',
};
