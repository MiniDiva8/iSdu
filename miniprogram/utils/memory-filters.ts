import {
  getMemoryCategoryLabel,
  getMemoryMoodLabel,
  type Memory,
  type MemoryCategory,
  type MemoryMood,
} from '../models/memory';

export type MemoryDatePreset = 'all' | 'custom' | 'day' | 'month' | 'week';
export type MemoryCategoryFilter = 'all' | MemoryCategory;
export type MemoryMoodFilter = 'all' | MemoryMood;

export interface MemoryFilterCriteria {
  readonly category: MemoryCategoryFilter;
  readonly customEndDate: string;
  readonly customStartDate: string;
  readonly datePreset: MemoryDatePreset;
  readonly keyword: string;
  readonly mood: MemoryMoodFilter;
}

export const EMPTY_MEMORY_FILTERS: Readonly<MemoryFilterCriteria> = {
  category: 'all',
  customEndDate: '',
  customStartDate: '',
  datePreset: 'all',
  keyword: '',
  mood: 'all',
};

interface TimestampRange {
  maximumExclusive: number | null;
  minimumInclusive: number | null;
}

function addLocalDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

function parseLocalDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function getTimestampRange(criteria: MemoryFilterCriteria, now: Date): TimestampRange {
  if (criteria.datePreset === 'day') {
    return {
      maximumExclusive: now.getTime() + 1,
      minimumInclusive: addLocalDays(now, -1).getTime(),
    };
  }

  if (criteria.datePreset === 'week') {
    return {
      maximumExclusive: now.getTime() + 1,
      minimumInclusive: addLocalDays(now, -7).getTime(),
    };
  }

  if (criteria.datePreset === 'month') {
    return {
      maximumExclusive: now.getTime() + 1,
      minimumInclusive: addLocalDays(now, -30).getTime(),
    };
  }

  if (criteria.datePreset === 'custom') {
    const startDate = parseLocalDateInput(criteria.customStartDate);
    const endDate = parseLocalDateInput(criteria.customEndDate);

    return {
      maximumExclusive: endDate ? addLocalDays(endDate, 1).getTime() : null,
      minimumInclusive: startDate?.getTime() ?? null,
    };
  }

  return { maximumExclusive: null, minimumInclusive: null };
}

function matchesKeyword(memory: Memory, keyword: string): boolean {
  const terms = keyword.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);

  if (terms.length === 0) {
    return true;
  }

  const searchableText = [
    memory.text,
    memory.placeName,
    getMemoryMoodLabel(memory),
    getMemoryCategoryLabel(memory),
  ]
    .join('\n')
    .toLocaleLowerCase();

  return terms.every((term) => searchableText.includes(term));
}

export function filterMemories(
  memories: readonly Memory[],
  criteria: MemoryFilterCriteria,
  now = new Date(),
): Memory[] {
  const range = getTimestampRange(criteria, now);

  return memories.filter((memory) => {
    if (criteria.mood !== 'all' && memory.mood !== criteria.mood) {
      return false;
    }

    if (criteria.category !== 'all' && memory.category !== criteria.category) {
      return false;
    }

    if (!matchesKeyword(memory, criteria.keyword)) {
      return false;
    }

    const timestamp = Date.parse(memory.recordedAt);

    if (range.minimumInclusive !== null && timestamp < range.minimumInclusive) {
      return false;
    }

    return range.maximumExclusive === null || timestamp < range.maximumExclusive;
  });
}

export function countActiveMemoryFilters(criteria: MemoryFilterCriteria): number {
  return (
    Number(criteria.datePreset !== 'all') +
    Number(criteria.mood !== 'all') +
    Number(criteria.category !== 'all') +
    Number(Boolean(criteria.keyword.trim()))
  );
}
