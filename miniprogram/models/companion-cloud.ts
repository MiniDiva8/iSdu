// Public cloud display DTOs. Keep provisional catalog IDs aligned with the local catalog.
export const COMPANION_CLOUD_SKINS = [
  'sprout',
  'sunshine',
  'sky',
  'peach',
  'lavender',
  'cocoa',
  'mint',
  'night',
] as const;
export const COMPANION_CLOUD_ACCESSORIES = [
  'none',
  'scarf',
  'hat',
  'book',
  'headphones',
  'flower',
] as const;
export const COMPANION_CLOUD_THEMES = ['meadow', 'dusk', 'blossom'] as const;
export const COMPANION_CLOUD_FURNITURE = [
  'bench',
  'tree',
  'desk',
  'bookshelf',
  'lamp',
  'flowers',
  'picnic',
  'pond',
  'cushion',
  'bicycle',
  'lantern',
  'sign',
  'shanhai_collectible_chest',
  'sdu_red_graduation_rack',
  'dacheng_eight_relief_platform',
  'dacheng_cong_garden_lantern',
  'grove_memory_swing',
  'doctoral_cat_bookends',
  'campus_postmark_workbench',
  'three_cities_travel_sign',
  'three_cities_souvenir_cabinet',
  'majia_twin_dome_model',
  'majia_stargazing_telescope',
  'starmap_observation_table',
] as const;

export type CompanionHomeVisibility = 'private' | 'friends';
export interface HomePlacement {
  readonly id: string;
  readonly itemId: (typeof COMPANION_CLOUD_FURNITURE)[number];
  readonly x: number;
  readonly y: number;
  readonly rotation: 0 | 90 | 180 | 270;
}
export interface HomeSnapshot {
  readonly name: string;
  readonly skinId: (typeof COMPANION_CLOUD_SKINS)[number];
  readonly accessoryId: (typeof COMPANION_CLOUD_ACCESSORIES)[number];
  readonly theme: (typeof COMPANION_CLOUD_THEMES)[number];
  readonly placements: readonly HomePlacement[];
}
export interface CompanionPublicUser {
  readonly userId: string;
  readonly displayName: string;
}
export interface PublishedHome {
  readonly snapshot: HomeSnapshot;
  readonly visibility: CompanionHomeVisibility;
  readonly revision: number;
  readonly updatedAt: string;
  readonly owner: CompanionPublicUser;
}
export interface GuestVisit {
  readonly id: string;
  readonly visitor: CompanionPublicUser;
  readonly message: string;
  readonly visitedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function oneOf<T extends string | number>(value: unknown, choices: readonly T[]): value is T {
  return choices.some((choice) => choice === value);
}
function isRatio(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}
export function isCompanionOpaqueId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/u.test(value);
}
function invalid(): never {
  throw new Error('小屋资料格式无效');
}

export function parseHomeSnapshot(value: unknown): HomeSnapshot {
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    Array.from(value.name).length > 16 ||
    !oneOf(value.skinId, COMPANION_CLOUD_SKINS) ||
    !oneOf(value.accessoryId, COMPANION_CLOUD_ACCESSORIES) ||
    !oneOf(value.theme, COMPANION_CLOUD_THEMES) ||
    !Array.isArray(value.placements) ||
    value.placements.length > 40
  )
    invalid();
  const ids = new Set<string>();
  const placements = value.placements.map((placement: unknown): HomePlacement => {
    if (
      !isRecord(placement) ||
      typeof placement.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,64}$/u.test(placement.id) ||
      ids.has(placement.id) ||
      !oneOf(placement.itemId, COMPANION_CLOUD_FURNITURE) ||
      !isRatio(placement.x) ||
      !isRatio(placement.y) ||
      !oneOf(placement.rotation, [0, 90, 180, 270] as const)
    )
      invalid();
    ids.add(placement.id);
    return {
      id: placement.id,
      itemId: placement.itemId,
      x: placement.x,
      y: placement.y,
      rotation: placement.rotation,
    };
  });
  return {
    name: value.name,
    skinId: value.skinId,
    accessoryId: value.accessoryId,
    theme: value.theme,
    placements,
  };
}
function parsePublicUser(value: unknown): CompanionPublicUser {
  if (
    !isRecord(value) ||
    !isCompanionOpaqueId(value.userId) ||
    typeof value.displayName !== 'string' ||
    !value.displayName ||
    Array.from(value.displayName).length > 64
  )
    invalid();
  return { userId: value.userId, displayName: value.displayName };
}
export function parsePublishedHome(value: unknown): PublishedHome {
  if (
    !isRecord(value) ||
    !oneOf(value.visibility, ['private', 'friends'] as const) ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !isTimestamp(value.updatedAt)
  )
    invalid();
  return {
    snapshot: parseHomeSnapshot(value.snapshot),
    visibility: value.visibility,
    revision: value.revision,
    updatedAt: value.updatedAt,
    owner: parsePublicUser(value.owner),
  };
}
export function parseGuestVisit(value: unknown): GuestVisit {
  if (
    !isRecord(value) ||
    !isCompanionOpaqueId(value.id) ||
    typeof value.message !== 'string' ||
    Array.from(value.message).length > 80 ||
    !isTimestamp(value.visitedAt)
  )
    invalid();
  return {
    id: value.id,
    visitor: parsePublicUser(value.visitor),
    message: value.message,
    visitedAt: value.visitedAt,
  };
}
