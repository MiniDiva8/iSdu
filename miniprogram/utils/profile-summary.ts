import { MEMORY_MOODS, MEMORY_MOOD_LABELS, type Memory, type MemoryMood } from '../models/memory';
import { getJournalDayKey, hasJournalLocation } from './journal';
export interface ProfileMoodCount {
  readonly mood: MemoryMood;
  readonly label: string;
  readonly count: number;
  readonly percentage: number;
}
export interface JournalProfileSummary {
  readonly entryCount: number;
  readonly characterCount: number;
  readonly recordedDayCount: number;
  readonly currentStreak: number;
  readonly campusPlaceCount: number;
  readonly moodCounts: ProfileMoodCount[];
}
function previousDay(key: string): string {
  return new Date(Date.parse(key + 'T00:00:00.000Z') - 86400000).toISOString().slice(0, 10);
}
export function buildProfileSummary(
  memories: readonly Memory[],
  nowIso = new Date().toISOString(),
): JournalProfileSummary {
  const records = memories.filter((memory) => memory.origin === 'user');
  const days = new Set(records.map((memory) => getJournalDayKey(memory.recordedAt)));
  const today = getJournalDayKey(nowIso);
  let cursor = days.has(today) ? today : previousDay(today);
  let currentStreak = 0;
  while (days.has(cursor)) {
    currentStreak += 1;
    cursor = previousDay(cursor);
  }
  const places = new Set(
    records
      .filter(hasJournalLocation)
      .map(
        (memory) =>
          memory.mapAssetVersion +
          ':' +
          memory.mapXRatio.toFixed(5) +
          ':' +
          memory.mapYRatio.toFixed(5),
      ),
  );
  const moodCounts = MEMORY_MOODS.map((mood) => {
    const count = records.filter((memory) => memory.mood === mood).length;
    return {
      mood,
      label: MEMORY_MOOD_LABELS[mood],
      count,
      percentage: records.length ? Math.round((count / records.length) * 100) : 0,
    };
  })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
  return {
    entryCount: records.length,
    characterCount: records.reduce(
      (total, memory) => total + Array.from(memory.text.replace(/\s/gu, '')).length,
      0,
    ),
    recordedDayCount: days.size,
    currentStreak,
    campusPlaceCount: places.size,
    moodCounts,
  };
}
