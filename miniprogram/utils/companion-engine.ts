import type {
  CompanionState,
  CompanionCommand,
  CompanionFacts,
  CompanionResult,
  CompanionTask,
  CompanionLetter,
  CompanionPlacement,
} from '../models/companion';
import {
  COMPANION_SKINS,
  COMPANION_ACCESSORIES,
  COMPANION_FURNITURE,
  COMPANION_THEMES,
  COMPANION_MBTI,
} from '../data/companion-catalog';
export class CompanionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CompanionError';
    this.code = code;
  }
}
function fail(code: string, message: string): never {
  throw new CompanionError(code, message);
}
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
export function companionDayKey(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return fail('INVALID_DATE', '日期无效，请检查设备时间。');
  return new Date(time + 8 * 3600000).toISOString().slice(0, 10);
}
export function companionDateOffset(day: string, offset: number): string {
  return new Date(Date.parse(day + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
}
function dayNumber(day: string): number {
  return Math.floor(Date.parse(day + 'T00:00:00Z') / 86400000);
}
function validDay(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^\d{4}-\d\d-\d\d$/.test(v) &&
    Number.isFinite(Date.parse(v + 'T00:00:00Z')) &&
    new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v
  );
}
function strings(v: unknown, max: number): v is string[] {
  return (
    Array.isArray(v) &&
    v.length <= max &&
    v.every((x) => typeof x === 'string') &&
    new Set(v).size === v.length
  );
}
function amount(v: unknown, max = 1000000000): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
}
export function validCompanionName(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.trim() === v &&
    Array.from(v).length >= 1 &&
    Array.from(v).length <= 16 &&
    Array.from(v).every((char) => (char.codePointAt(0) ?? 0) >= 32 && char.codePointAt(0) !== 127)
  );
}
function validPlacement(v: unknown): v is CompanionPlacement {
  return (
    record(v) &&
    typeof v.id === 'string' &&
    /^[a-zA-Z0-9_-]{1,64}$/.test(v.id) &&
    COMPANION_FURNITURE.some((i) => i.id === v.itemId) &&
    typeof v.x === 'number' &&
    Number.isFinite(v.x) &&
    v.x >= 0 &&
    v.x <= 1 &&
    typeof v.y === 'number' &&
    Number.isFinite(v.y) &&
    v.y >= 0 &&
    v.y <= 1 &&
    [0, 90, 180, 270].includes(v.rotation as number)
  );
}
export function createCompanionState(nowIso: string): CompanionState {
  return {
    schemaVersion: 1,
    adoptedAt: null,
    name: '途途',
    skinId: 'sprout',
    accessoryId: 'none',
    theme: 'meadow',
    crystals: 0,
    shards: 0,
    ownedSkins: ['sprout'],
    ownedAccessories: ['none'],
    furniture: { bench: 1, tree: 1, sign: 1 },
    placements: [
      { id: 'starter-tree', itemId: 'tree', x: 0.28, y: 0.67, rotation: 0 },
      { id: 'starter-bench', itemId: 'bench', x: 0.7, y: 0.72, rotation: 0 },
      { id: 'starter-sign', itemId: 'sign', x: 0.55, y: 0.43, rotation: 0 },
    ],
    checkins: [],
    claimed: [],
    events: { play: [], decorate: [], read: [], visit: [] },
    readLetters: [],
    tutorialStep: 0,
    mbti: '',
    showOnJournal: true,
    haptics: false,
    lastMutationDay: companionDayKey(nowIso),
    receipts: [],
    cloudRevision: 0,
    cloudVisibility: 'private',
  };
}
function isState(v: unknown): v is CompanionState {
  if (
    !record(v) ||
    v.schemaVersion !== 1 ||
    !validCompanionName(v.name) ||
    !(
      v.adoptedAt === null ||
      (typeof v.adoptedAt === 'string' && Number.isFinite(Date.parse(v.adoptedAt)))
    )
  )
    return false;
  if (
    !amount(v.crystals) ||
    !amount(v.shards) ||
    !amount(v.cloudRevision) ||
    !COMPANION_THEMES.some((i) => i.id === v.theme) ||
    !COMPANION_MBTI.includes(v.mbti as string)
  )
    return false;
  if (
    typeof v.showOnJournal !== 'boolean' ||
    typeof v.haptics !== 'boolean' ||
    !amount(v.tutorialStep, 7) ||
    !validDay(v.lastMutationDay) ||
    !['private', 'friends'].includes(v.cloudVisibility as string)
  )
    return false;
  if (
    !strings(v.ownedSkins, COMPANION_SKINS.length) ||
    !v.ownedSkins.every((k) => COMPANION_SKINS.some((i) => i.id === k)) ||
    !v.ownedSkins.includes(v.skinId as string)
  )
    return false;
  if (
    !strings(v.ownedAccessories, COMPANION_ACCESSORIES.length) ||
    !v.ownedAccessories.every((k) => COMPANION_ACCESSORIES.some((i) => i.id === k)) ||
    !v.ownedAccessories.includes(v.accessoryId as string)
  )
    return false;
  if (
    !record(v.furniture) ||
    !Object.entries(v.furniture).every(
      ([id, n]) => COMPANION_FURNITURE.some((i) => i.id === id) && amount(n, 99),
    )
  )
    return false;
  if (
    !Array.isArray(v.placements) ||
    v.placements.length > 40 ||
    !v.placements.every(validPlacement) ||
    new Set(v.placements.map((p) => p.id)).size !== v.placements.length
  )
    return false;
  for (const item of COMPANION_FURNITURE)
    if (v.placements.filter((p) => p.itemId === item.id).length > Number(v.furniture[item.id] ?? 0))
      return false;
  if (
    !strings(v.checkins, 3660) ||
    !v.checkins.every(validDay) ||
    !strings(v.claimed, 600) ||
    !strings(v.readLetters, 30) ||
    !record(v.events)
  )
    return false;
  for (const k of ['play', 'decorate', 'read', 'visit'])
    if (!strings(v.events[k], 120) || !v.events[k].every(validDay)) return false;
  return (
    Array.isArray(v.receipts) &&
    v.receipts.length <= 64 &&
    v.receipts.every(
      (p) =>
        record(p) &&
        typeof p.key === 'string' &&
        typeof p.message === 'string' &&
        p.message.length <= 300,
    )
  );
}
export function parseCompanionState(raw: unknown): CompanionState {
  try {
    const v: unknown = typeof raw === 'string' ? JSON.parse(raw) : null;
    if (isState(v)) return v;
  } catch {
    /* Keep the existing bytes available for recovery. */
  }
  return fail('CORRUPTED_SAVE', '小屋存档暂时没有读懂。请保留数据，或在确认后重置小屋。');
}
export function buildCompanionTasks(
  s: CompanionState,
  f: CompanionFacts,
  now: string,
): CompanionTask[] {
  const day = companionDayKey(now);
  const items: [string, string, string, number, boolean, string][] = [
    ['welcome', '初次见面的礼物', '领取伙伴后，收下一点布置小屋的光。', 100, !!s.adoptedAt, 'home'],
    [
      'name',
      '给伙伴取个名字',
      '在资料卡中，换一个属于你们的名字。',
      30,
      !!s.adoptedAt && !['途途', '豆芽'].includes(s.name),
      'card',
    ],
    ['write', '记录今天的一句话', '今天新保存一篇真实日记。', 10, f.entriesToday > 0, 'journal'],
    [
      'photo',
      '给今天留一张照片',
      '今天新建的日记里，有一张照片。',
      10,
      f.photosToday > 0,
      'journal',
    ],
    [
      'play',
      '和伙伴打个招呼',
      '在小院里打个招呼，或在游乐场找到幸运伙伴。',
      10,
      s.events.play.includes(day),
      'home',
    ],
    [
      'decorate',
      '布置喜欢的角落',
      '今天摆放、移动或收回一件家具。',
      10,
      s.events.decorate.includes(day),
      'collection',
    ],
    [
      'letter',
      '读一封伙伴来信',
      '打开信箱，看看它想说的话。',
      5,
      s.events.read.includes(day),
      'mail',
    ],
    [
      'visit',
      '去好友家坐坐',
      '完成一次真实的好友小屋来访。',
      10,
      s.events.visit.includes(day),
      'friends',
    ],
    ['days', '收集三天的心情', '在三个不同的日子留下日记。', 50, f.recordedDays >= 3, 'journal'],
  ];
  return items.map(([id, title, hint, reward, eligible, action]) => ({
    id,
    title,
    hint,
    reward,
    eligible,
    action,
    claimed: s.claimed.includes(
      (['welcome', 'name', 'days'].includes(id) ? 'once:' : day + ':') + id,
    ),
  }));
}
export function buildCompanionLetters(
  s: CompanionState,
  f: CompanionFacts,
  now: string,
): CompanionLetter[] {
  if (!s.adoptedAt) return [];
  const templates: [string, string, string, boolean][] = [
    [
      'hello',
      '给你的第一封信',
      '你好呀，我是' +
        s.name +
        '。从今天起，这一小片草地就是我们慢慢布置的家。开心的时候可以来坐坐，普通的一天也值得被记住。',
      true,
    ],
    [
      'first-entry',
      '今天，有了一个小瞬间',
      '看到你留下了日记，我也替这个小瞬间高兴。不必每次都写很多，一个词、一张照片，也可以留住今天。',
      f.totalEntries >= 1,
    ],
    [
      'three-days',
      '我们的小小日常',
      '已经有三个日子留下了心情。谢谢你愿意和我分享生活的边边角角，慢慢来，我们还有很多天。',
      f.recordedDays >= 3,
    ],
    [
      'room',
      '角落正在变温暖',
      '小院里又多了一点你的心意。家具没有标准答案，摆成你喜欢的样子就很好。',
      s.events.decorate.length > 0,
    ],
    [
      'week',
      '七个小小的约定',
      '你已经来打过七次招呼了。偶尔忘记也没关系，生活可以按照自己的节奏继续。',
      s.checkins.length >= 7,
    ],
    [
      'collection',
      '换个样子去散步',
      '新的颜色也装得下同一个我。谢谢你给我挑新衣服，我们一起去小院里吹吹风吧。',
      s.ownedSkins.length >= 2,
    ],
  ];
  return templates
    .filter((t) => t[3])
    .map(([id, title, body]) => ({
      id,
      title,
      body,
      read: s.readLetters.includes(id),
      date: companionDayKey(s.adoptedAt ?? now),
    }));
}
export function companionWeek(
  s: CompanionState,
  now: string,
): {
  day: string;
  label: string;
  checked: boolean;
  future: boolean;
  canMakeup: boolean;
  reward: number;
}[] {
  const today = companionDayKey(now),
    birth = companionDayKey(s.adoptedAt ?? now);
  const start = companionDateOffset(
    birth,
    Math.max(0, Math.floor((dayNumber(today) - dayNumber(birth)) / 7)) * 7,
  );
  return Array.from({ length: 7 }, (_, i) => {
    const day = companionDateOffset(start, i);
    return {
      day,
      label: day === today ? '今天' : day.slice(5).replace('-', '/'),
      checked: s.checkins.includes(day),
      future: day > today,
      canMakeup: day < today && !s.checkins.includes(day) && day >= companionDateOffset(today, -6),
      reward: i >= 5 ? 30 : 20,
    };
  });
}
function mark(s: CompanionState, k: keyof CompanionState['events'], day: string) {
  if (!s.events[k].includes(day)) s.events[k].push(day);
}
function pick(value: unknown): string {
  if (typeof value !== 'string') return fail('INVALID_INPUT', '操作内容无效。');
  return value;
}
function randomIndex(random: () => number, count: number): number {
  const n = random();
  if (!Number.isFinite(n) || n < 0 || n >= 1)
    return fail('INVALID_RANDOM', '这次礼物没有准备好，请再试一次。');
  return Math.floor(n * count);
}
export function applyCompanionCommand(
  current: CompanionState,
  c: CompanionCommand,
  f: CompanionFacts,
  now: string,
  random: () => number = Math.random,
): CompanionResult {
  const today = companionDayKey(now);
  if (today < current.lastMutationDay)
    fail('CLOCK_ROLLBACK', '设备日期早于最近的小屋记录，请检查时间设置。');
  if (c.requestId) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(c.requestId)) fail('INVALID_INPUT', '操作标识无效。');
    const old = current.receipts.find((r) => r.key === c.requestId);
    if (old) return { state: current, message: old.message };
  }
  const s = JSON.parse(JSON.stringify(current)) as CompanionState;
  if (c.type !== 'adopt' && !s.adoptedAt) fail('ADOPT_FIRST', '先领取自己的校园伙伴吧。');
  let message = '已经收好啦。';
  let reward: CompanionResult['reward'];
  const spend = (n: number, kind: 'crystals' | 'shards' = 'crystals') => {
    if (s[kind] < n)
      fail(
        'INSUFFICIENT_FUNDS',
        kind === 'crystals' ? '光点还不够，先去完成一点小任务吧。' : '星屑还不够，再收集一点吧。',
      );
    s[kind] -= n;
  };
  if (c.type === 'adopt') {
    if (s.adoptedAt) fail('ALREADY_ADOPTED', '伙伴已经在小院里等你啦。');
    if (!validCompanionName(c.name)) fail('INVALID_INPUT', '名字请填写 1 至 16 个字。');
    s.name = c.name;
    s.adoptedAt = now;
    s.crystals = 100;
    message = '领取成功，送你 100 光点和三件小家具。';
  } else if (c.type === 'checkin' || c.type === 'makeup') {
    const day = c.type === 'checkin' ? today : pick(c.day);
    if (
      !validDay(day) ||
      day > today ||
      day < companionDayKey(s.adoptedAt ?? now) ||
      day < companionDateOffset(today, -6)
    )
      fail('INVALID_DAY', '只能补签陪伴开始后、近六天内错过的日子。');
    if (s.checkins.includes(day)) fail('ALREADY_CLAIMED', '这一天已经打过招呼啦。');
    if (c.type === 'makeup') {
      if (day >= today || s.claimed.includes(today + ':makeup'))
        fail('MAKEUP_LIMIT', '每天只能补签一个过去的日子。');
      spend(30);
      s.claimed.push(today + ':makeup');
    }
    const index = (dayNumber(day) - dayNumber(companionDayKey(s.adoptedAt ?? now))) % 7;
    const n = index >= 5 ? 30 : 20;
    s.crystals += n;
    s.checkins.push(day);
    message =
      (c.type === 'makeup' ? '补签完成，消耗 30 光点，获得 ' : '今天也见面啦，获得 ') +
      n +
      ' 光点。';
    const cycle = Math.floor((dayNumber(day) - dayNumber(companionDayKey(s.adoptedAt ?? now))) / 7);
    const start = companionDateOffset(companionDayKey(s.adoptedAt ?? now), cycle * 7),
      key = 'week:' + cycle;
    if (
      !s.claimed.includes(key) &&
      Array.from({ length: 7 }, (_, i) => companionDateOffset(start, i)).every((d) =>
        s.checkins.includes(d),
      )
    ) {
      s.claimed.push(key);
      s.crystals += 100;
      s.shards += 3;
      const item = COMPANION_FURNITURE[randomIndex(random, COMPANION_FURNITURE.length)];
      if (!item) fail('INVALID_ITEM', '礼物目录为空。');
      s.furniture[item.id] = Math.min(99, (s.furniture[item.id] ?? 0) + 1);
      message += ' 7 日满勤：额外 100 光点、3 星屑和' + item.name + '！';
    }
  } else if (c.type === 'claim' || c.type === 'claimAll') {
    const tasks = buildCompanionTasks(s, f, now);
    if (c.type === 'claim') {
      const task = tasks.find((t) => t.id === c.taskId);
      if (!task || !task.eligible) fail('TASK_NOT_READY', '这个小任务还没有完成，慢慢来。');
      if (task.claimed) fail('ALREADY_CLAIMED', '这份奖励已经收下啦。');
    }
    const ready = tasks.filter(
      (task) => task.eligible && !task.claimed && (c.type === 'claimAll' || task.id === c.taskId),
    );
    let total = 0;
    for (const task of ready) {
      const key = (['welcome', 'name', 'days'].includes(task.id) ? 'once:' : today + ':') + task.id;
      s.claimed.push(key);
      total += task.reward;
    }
    s.crystals += total;
    message =
      c.type === 'claimAll'
        ? ready.length
          ? '已领取 ' + ready.length + ' 项奖励，共 ' + total + ' 光点。'
          : '暂时没有可领取的奖励。'
        : '收下 ' + total + ' 光点，继续装点小屋吧。';
  } else if (c.type === 'draw') {
    spend(100);
    const item = COMPANION_SKINS[randomIndex(random, COMPANION_SKINS.length)];
    if (!item) fail('INVALID_ITEM', '装扮目录为空。');
    const duplicate = s.ownedSkins.includes(item.id);
    if (duplicate) {
      s.crystals += 20;
      s.shards += 5;
    } else s.ownedSkins.push(item.id);
    reward = { itemId: item.id, duplicate };
    message = duplicate
      ? '又遇见了' + item.name + '，已转为 20 光点和 5 星屑。'
      : '遇见新装扮：' + item.name + '！已放入仓库。';
  } else if (c.type === 'buy') {
    const item = COMPANION_FURNITURE.find((i) => i.id === c.itemId);
    if (!item) fail('INVALID_ITEM', '没有找到这件家具。');
    if ((s.furniture[item.id] ?? 0) >= 99)
      fail('INVENTORY_FULL', '这件家具已经收藏很多了，先摆出来看看吧。');
    spend(item.price);
    s.furniture[item.id] = (s.furniture[item.id] ?? 0) + 1;
    message = item.name + ' 已放入家具仓库。';
  } else if (c.type === 'redeemAccessory') {
    const item = COMPANION_ACCESSORIES.find((i) => i.id === c.itemId);
    if (!item || s.ownedAccessories.includes(item.id))
      fail('INVALID_ITEM', '装饰已拥有或暂时无法兑换。');
    spend(item.price, 'shards');
    s.ownedAccessories.push(item.id);
    message = item.name + ' 已放入装扮仓库。';
  } else if (c.type === 'equipSkin' || c.type === 'equipAccessory') {
    const id = pick(c.itemId),
      owned = c.type === 'equipSkin' ? s.ownedSkins : s.ownedAccessories;
    if (!owned.includes(id)) fail('NOT_OWNED', '先收集这件装扮，再给伙伴换上。');
    if (c.type === 'equipSkin') s.skinId = id;
    else s.accessoryId = id;
    message = '换好啦，回小院看看吧。';
  } else if (c.type === 'place') {
    if (!validPlacement(c.placement)) fail('INVALID_INPUT', '家具的位置无效。');
    const p = c.placement;
    if (s.placements.length >= 40) fail('LAYOUT_FULL', '小院最多摆放 40 件家具，先收回一些吧。');
    if (
      s.placements.some((i) => i.id === p.id) ||
      s.placements.filter((i) => i.itemId === p.itemId).length >= (s.furniture[p.itemId] ?? 0)
    )
      fail('NO_STOCK', '仓库里没有多余的这件家具。');
    s.placements.push({ ...p });
    mark(s, 'decorate', today);
    message = '这个角落更温暖了。';
  } else if (c.type === 'move') {
    const p = s.placements.find((i) => i.id === c.id);
    if (!p) fail('NOT_FOUND', '这件家具已经收回仓库了。');
    const next = { ...p, x: c.x, y: c.y, rotation: c.rotation };
    if (!validPlacement(next)) fail('INVALID_INPUT', '家具的位置无效。');
    Object.assign(p, next);
    mark(s, 'decorate', today);
  } else if (c.type === 'remove') {
    const i = s.placements.findIndex((p) => p.id === c.id);
    if (i < 0) fail('NOT_FOUND', '这件家具已经收回了。');
    s.placements.splice(i, 1);
    mark(s, 'decorate', today);
    message = '已收回仓库，之后还可以再摆出来。';
  } else if (c.type === 'interact') {
    mark(s, 'play', today);
    message = '能在今天见到你，我很开心。';
  } else if (c.type === 'visited') {
    mark(s, 'visit', today);
    message = '串门回来啦。';
  } else if (c.type === 'readLetter') {
    const letter = buildCompanionLetters(s, f, now).find((l) => l.id === c.letterId);
    if (!letter) fail('NOT_FOUND', '这封信还没有送到。');
    if (!s.readLetters.includes(letter.id)) s.readLetters.push(letter.id);
    mark(s, 'read', today);
    message = '这封信已经好好收下啦。';
  } else if (c.type === 'tutorial') {
    if (!amount(c.step, 7)) fail('INVALID_INPUT', '引导步骤无效。');
    s.tutorialStep = c.step;
  } else if (c.type === 'preferences') {
    if (c.name !== undefined) {
      if (!validCompanionName(c.name)) fail('INVALID_INPUT', '名字请填写 1 至 16 个字。');
      s.name = c.name;
    }
    if (c.theme !== undefined) {
      if (!COMPANION_THEMES.some((i) => i.id === c.theme)) fail('INVALID_INPUT', '场景颜色无效。');
      s.theme = pick(c.theme);
    }
    if (c.mbti !== undefined) {
      if (!COMPANION_MBTI.includes(pick(c.mbti))) fail('INVALID_INPUT', '角色小设定无效。');
      s.mbti = pick(c.mbti);
    }
    if (c.showOnJournal !== undefined) {
      if (typeof c.showOnJournal !== 'boolean') fail('INVALID_INPUT', '设置无效。');
      s.showOnJournal = c.showOnJournal;
    }
    if (c.haptics !== undefined) {
      if (typeof c.haptics !== 'boolean') fail('INVALID_INPUT', '设置无效。');
      s.haptics = c.haptics;
    }
  } else if (c.type === 'publication') {
    if (!amount(c.revision) || !['friends', 'private'].includes(pick(c.visibility)))
      fail('INVALID_INPUT', '家园同步状态无效。');
    s.cloudRevision = c.revision;
    s.cloudVisibility = c.visibility as 'private' | 'friends';
  } else fail('INVALID_ACTION', '暂时无法进行这个小屋操作。');
  s.lastMutationDay = today;
  const oldest = companionDateOffset(today, -45);
  s.checkins = s.checkins.filter((d) => d >= companionDateOffset(today, -120));
  s.claimed = s.claimed
    .filter((k) => k.startsWith('once:') || k.startsWith('week:') || k.slice(0, 10) >= oldest)
    .slice(-500);
  for (const k of Object.keys(s.events) as (keyof CompanionState['events'])[])
    s.events[k] = s.events[k].filter((d) => d >= oldest);
  if (c.requestId) s.receipts = [...s.receipts, { key: c.requestId, message }].slice(-64);
  if (!isState(s)) fail('INVALID_STATE', '这次操作没有完成，原存档已保留。');
  return { state: s, message, ...(reward ? { reward } : {}) };
}

export function companionMakeupDays(s: CompanionState, now: string) {
  if (!s.adoptedAt) return [];
  const today = companionDayKey(now),
    birth = companionDayKey(s.adoptedAt);
  if (s.claimed.includes(today + ':makeup')) return [];
  return Array.from({ length: 6 }, (_, i) => companionDateOffset(today, -i - 1))
    .filter((day) => day >= birth && !s.checkins.includes(day))
    .map((day) => ({
      day,
      label: day.slice(5).replace('-', '/'),
      checked: false,
      future: false,
      canMakeup: true,
      reward: (dayNumber(day) - dayNumber(birth)) % 7 >= 5 ? 30 : 20,
    }));
}
