import { cloneMemory, sortMemoriesByDate, type Memory } from '../models/memory';

export interface MemoryMonthGroup {
  readonly key: string;
  readonly memories: Memory[];
  readonly title: string;
}

export interface MemoryInsights {
  readonly demoCount: number;
  readonly mostFrequentPlace: string | null;
  readonly mostFrequentPlaceCount: number;
  readonly placeCount: number;
  readonly recentMemory: Memory | null;
  readonly recordedDayCount: number;
  readonly totalCount: number;
  readonly userCount: number;
}

function normalizePlaceName(placeName: string): string {
  return placeName.trim().replace(/\s+/gu, ' ');
}

function getMonthKey(recordedAt: string): string {
  return recordedAt.slice(0, 7);
}

function formatMonthTitle(monthKey: string): string {
  const [year = '', month = ''] = monthKey.split('-');
  return `${year}年${month}月`;
}

export function groupMemoriesByMonth(memories: readonly Memory[]): MemoryMonthGroup[] {
  const groups = new Map<string, Memory[]>();

  for (const memory of sortMemoriesByDate(memories)) {
    const monthKey = getMonthKey(memory.recordedAt);
    const group = groups.get(monthKey);

    if (group) {
      group.push(cloneMemory(memory));
    } else {
      groups.set(monthKey, [cloneMemory(memory)]);
    }
  }

  return [...groups.entries()].map(([key, groupedMemories]) => ({
    key,
    memories: groupedMemories,
    title: formatMonthTitle(key),
  }));
}

export function calculateMemoryInsights(memories: readonly Memory[]): MemoryInsights {
  const sortedMemories = sortMemoriesByDate(memories);
  const recordedDays = new Set(sortedMemories.map((memory) => memory.recordedAt.slice(0, 10)));
  const placeCounts = new Map<string, number>();
  let mostFrequentPlace: string | null = null;
  let mostFrequentPlaceCount = 0;

  for (const memory of sortedMemories) {
    const placeName = normalizePlaceName(memory.placeName);

    if (!placeName) {
      continue;
    }

    const count = (placeCounts.get(placeName) ?? 0) + 1;
    placeCounts.set(placeName, count);

    if (count > mostFrequentPlaceCount) {
      mostFrequentPlace = placeName;
      mostFrequentPlaceCount = count;
    }
  }

  return {
    demoCount: sortedMemories.filter((memory) => memory.origin === 'demo').length,
    mostFrequentPlace,
    mostFrequentPlaceCount,
    placeCount: placeCounts.size,
    recentMemory: sortedMemories[0] ?? null,
    recordedDayCount: recordedDays.size,
    totalCount: sortedMemories.length,
    userCount: sortedMemories.filter((memory) => memory.origin === 'user').length,
  };
}
