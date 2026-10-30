import { cloudCompanionRepository } from './repository/cloud-companion-repository';
import type { CompanionState, CompanionCommand } from '../models/companion';
import { parseHomeSnapshot, type HomeSnapshot } from '../models/companion-cloud';
import { companionService } from './companion-service';
import { companionAssetPreview } from '../data/companion-assets';
import {
  COMPANION_SKINS,
  COMPANION_ACCESSORIES,
  COMPANION_FURNITURE,
} from '../data/companion-catalog';
export function companionRequestId(): string {
  return 'home_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
}
function companionErrorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
}
export function companionMessage(error: unknown): string {
  const code = companionErrorCode(error);
  if (code === 'FUNCTION_NOT_FOUND')
    return '伙伴云服务尚未开通，请联系管理员完成配置；本机小屋可继续使用。';
  if (code === 'CLOUD_DISABLED' || code === 'PROFILE_REQUIRED' || code === 'UNAUTHENTICATED')
    return '请先到“我的 → 数据管理”开启云端与好友功能，再来访问小屋。';
  if (code === 'FUNCTION_CALL_FAILED' || code === 'CLOUD_UNAVAILABLE')
    return '伙伴云服务暂时无法连接，暂时无法判断好友小屋是否开放；请稍后重试。';
  if (code === 'HOME_UNAVAILABLE') return '好友小屋未开放或当前无权访问，请与好友确认来访设置。';
  return error instanceof Error ? error.message : '小屋暂时没有准备好，请稍后再试。';
}
export function companionErrorTitle(error: unknown): string {
  const code = companionErrorCode(error);
  if (code === 'FUNCTION_NOT_FOUND') return '伙伴云服务尚未开通';
  if (code === 'CLOUD_DISABLED' || code === 'PROFILE_REQUIRED' || code === 'UNAUTHENTICATED')
    return '请先开启云端功能';
  if (code === 'FUNCTION_CALL_FAILED' || code === 'CLOUD_UNAVAILABLE') return '暂时无法连接小屋';
  return '小院暂时无法访问';
}
export function commandCompanion(c: CompanionCommand) {
  return companionService.dispatch({ ...c, requestId: c.requestId ?? companionRequestId() });
}
export function publicCompanionSnapshot(s: CompanionState): HomeSnapshot {
  return parseHomeSnapshot({
    name: s.name,
    skinId: s.skinId,
    accessoryId: s.accessoryId,
    theme: s.theme,
    placements: s.placements.map((p) => ({ ...p })),
  });
}
export function companionTopInset(): number {
  const statusBarHeight =
    typeof wx.getWindowInfo === 'function' ? (wx.getWindowInfo().statusBarHeight ?? 24) : 24;
  const fallback = statusBarHeight + 44;
  try {
    if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
      const menu = wx.getMenuButtonBoundingClientRect();
      if (
        menu.width > 0 &&
        menu.height > 0 &&
        menu.top >= statusBarHeight &&
        Number.isFinite(menu.bottom) &&
        menu.bottom > menu.top
      )
        return Math.max(fallback, menu.bottom + 8);
    }
  } catch {
    // Desktop and older clients may not expose usable native menu geometry.
  }
  return fallback;
}
export function backFromCompanion(): void {
  void wx.navigateBack({
    fail: () => {
      void wx.switchTab({ url: '/pages/journal/index' });
    },
  });
}
export function openCompanionSection(
  section: string,
  options: { reuse?: boolean; onFailure?: () => void } = {},
): void {
  const urls: Record<string, string> = {
    home: '/pages/companion/index',
    tasks: '/pages/companion/tasks/index',
    collection: '/pages/companion/collection/index',
    card: '/pages/companion/card/index',
    mail: '/pages/companion/mail/index',
    chat: '/pages/companion/chat/index',
    photo: '/pages/companion/photo/index',
    playground: '/pages/companion/playground/index',
    friends: '/pages/friends/index',
    journal: '/pages/journal/index',
  };
  const url = urls[section];
  if (!url) return;
  const callbacks = options.onFailure ? { fail: options.onFailure } : {};
  if (section === 'journal') void wx.switchTab({ url, ...callbacks });
  else {
    if (options.reuse && typeof getCurrentPages === 'function') {
      const pages = getCurrentPages();
      for (let index = pages.length - 2; index >= 0; index--) {
        if ('/' + pages[index]?.route === url) {
          void wx.navigateBack({ delta: pages.length - 1 - index, ...callbacks });
          return;
        }
      }
    }
    void wx.navigateTo({ url, ...callbacks });
  }
}
export function companionCards(s: CompanionState, tab: string, shop = false) {
  const kind = tab === 'furniture' ? 'furniture' : tab === 'accessories' ? 'accessory' : 'skin';
  const catalog =
    kind === 'skin'
      ? COMPANION_SKINS
      : kind === 'accessory'
        ? COMPANION_ACCESSORIES
        : COMPANION_FURNITURE;
  return catalog
    .filter((item) => !item.legacy || (!shop && (s.furniture[item.id] ?? 0) > 0))
    .map((item) => {
      const placed = s.placements.filter((p) => p.itemId === item.id).length;
      const count =
        kind === 'skin'
          ? Number(s.ownedSkins.includes(item.id))
          : kind === 'accessory'
            ? Number(s.ownedAccessories.includes(item.id))
            : (s.furniture[item.id] ?? 0);
      const preview = companionAssetPreview(kind, item.id);
      return {
        ...item,
        src: preview.src,
        previewCropped: preview.cropped,
        previewStyle: preview.style,
        statusLabel:
          kind === 'furniture'
            ? '拥有 ' + count + ' · 已摆出 ' + placed
            : count > 0
              ? '已拥有'
              : '未拥有',
        owned: count > 0,
        count,
        placed,
        available: count - placed,
        selected:
          kind === 'skin'
            ? s.skinId === item.id
            : kind === 'accessory'
              ? s.accessoryId === item.id
              : false,
        shop,
      };
    });
}
export function confirmCompanion(
  title: string,
  content: string,
  confirmText = '确认',
): Promise<boolean> {
  return new Promise((resolve) => {
    void wx.showModal({
      title,
      content,
      confirmText,
      success: (r) => resolve(r.confirm),
      fail: () => resolve(false),
    });
  });
}

export async function recordCompanionVisit(targetUserId: string, requestId: string, message = '') {
  // Mark before network I/O: an uncertain reply may still have persisted visitor data.
  companionService.markCloudUsed();
  return cloudCompanionRepository.visitHome(targetUserId, requestId, message);
}

interface CompanionActionPage {
  setData(patch: { busy?: boolean; actionMessage?: string }): void;
}
interface CompanionActionState {
  active: boolean;
  epoch: number;
  pending: boolean;
  serial: number;
}
export interface CompanionActionLease {
  epoch: number;
  serial: number;
}
const companionActions = new WeakMap<object, CompanionActionState>();
function actionState(page: object): CompanionActionState {
  let state = companionActions.get(page);
  if (!state) {
    state = { active: false, epoch: 0, pending: false, serial: 0 };
    companionActions.set(page, state);
  }
  return state;
}
export function resumeCompanionActions(page: CompanionActionPage): void {
  const state = actionState(page);
  state.active = true;
  state.epoch++;
  page.setData({ busy: state.pending });
}
export function suspendCompanionActions(page: object): void {
  const state = actionState(page);
  state.active = false;
  state.epoch++;
}
export function beginCompanionAction(page: CompanionActionPage): CompanionActionLease | null {
  const state = actionState(page);
  if (!state.active || state.pending) return null;
  state.pending = true;
  state.serial++;
  page.setData({ busy: true });
  return { epoch: state.epoch, serial: state.serial };
}
export function companionActionCurrent(page: object, lease: CompanionActionLease): boolean {
  const state = actionState(page);
  return state.active && state.epoch === lease.epoch && state.serial === lease.serial;
}
export function endCompanionAction(
  page: CompanionActionPage,
  lease: CompanionActionLease,
): boolean {
  const state = actionState(page);
  if (state.serial !== lease.serial) return false;
  state.pending = false;
  if (state.active) page.setData({ busy: false });
  return state.active && state.epoch !== lease.epoch;
}
