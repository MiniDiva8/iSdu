import { getMemoryMoodLabel, type Memory, type MemoryMood } from '../models/memory';

export const JOURNAL_UNLOCATED_MAP_VERSION = 'journal-unlocated-v1';
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const MONTH_NAMES = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
];

export interface JournalDay {
  readonly key: string;
  readonly day: number;
  readonly count: number;
  readonly memoryId: string;
  readonly mood: MemoryMood | '';
  readonly moodLabel: string;
  readonly isDemo: boolean;
  readonly isToday: boolean;
  readonly isFuture: boolean;
}
export interface JournalPhoto {
  readonly key: string;
  readonly memoryId: string;
  readonly path: string;
  readonly dateLabel: string;
  readonly placeName: string;
  readonly mood: MemoryMood;
}
export interface JournalMonth {
  readonly key: string;
  readonly label: string;
  readonly year: string;
  readonly monthLabel: string;
  readonly days: JournalDay[];
  readonly photos: JournalPhoto[];
  readonly entryCount: number;
  readonly recordedDays: number;
}

function monthParts(key: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  if (!match || year < 1900 || year > 2199 || month < 1 || month > 12) {
    throw new RangeError('月份无效');
  }
  return { year, month };
}
export function getJournalDayKey(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) throw new RangeError('记录时间无效');
  return new Date(time + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}
export function shiftJournalMonth(key: string, offset: number): string {
  const { year, month } = monthParts(key);
  if (!Number.isInteger(offset)) throw new RangeError('月份偏移无效');
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  const result = shifted.toISOString().slice(0, 7);
  monthParts(result);
  return result;
}
export function createJournalTimestamp(dayKey: string, nowIso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) throw new RangeError('日期无效');
  monthParts(dayKey.slice(0, 7));
  const time = Date.parse(dayKey + 'T12:00:00+08:00');
  if (!Number.isFinite(time) || getJournalDayKey(new Date(time).toISOString()) !== dayKey) {
    throw new RangeError('日期不存在');
  }
  const today = getJournalDayKey(nowIso);
  if (dayKey > today) throw new RangeError('还不能记录未来的一天');
  return dayKey === today ? nowIso : new Date(time).toISOString();
}
export function hasJournalLocation(memory: Pick<Memory, 'mapAssetVersion'>): boolean {
  return memory.mapAssetVersion !== JOURNAL_UNLOCATED_MAP_VERSION;
}
export function buildJournalMonth(
  memories: readonly Memory[],
  monthKey: string,
  nowIso: string = new Date().toISOString(),
): JournalMonth {
  const { year, month } = monthParts(monthKey);
  const today = getJournalDayKey(nowIso);
  const ordered = [...memories]
    .filter((memory) => getJournalDayKey(memory.recordedAt).startsWith(monthKey + '-'))
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || a.id.localeCompare(b.id));
  const byDay = new Map<string, Memory[]>();
  for (const memory of ordered) {
    const key = getJournalDayKey(memory.recordedAt);
    const group = byDay.get(key) ?? [];
    group.push(memory);
    byDay.set(key, group);
  }
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days: JournalDay[] = Array.from({ length }, (_, index) => {
    const day = index + 1;
    const key = monthKey + '-' + String(day).padStart(2, '0');
    const group = byDay.get(key) ?? [];
    const latest = group[0];
    return {
      key,
      day,
      count: group.length,
      memoryId: latest?.id ?? '',
      mood: latest?.mood ?? '',
      moodLabel: latest ? getMemoryMoodLabel(latest) : '',
      isDemo: latest?.origin === 'demo',
      isToday: key === today,
      isFuture: key > today,
    };
  });
  return {
    key: monthKey,
    label: year + '年' + month + '月',
    year: String(year),
    monthLabel: MONTH_NAMES[month - 1] ?? '',
    days,
    photos: ordered.flatMap((memory) =>
      memory.imagePaths.map((path, index) => ({
        key: memory.id + '-' + index,
        memoryId: memory.id,
        path,
        dateLabel: getJournalDayKey(memory.recordedAt).replace(/-/g, '.'),
        placeName: memory.placeName || getMemoryMoodLabel(memory),
        mood: memory.mood,
      })),
    ),
    entryCount: ordered.length,
    recordedDays: byDay.size,
  };
}
