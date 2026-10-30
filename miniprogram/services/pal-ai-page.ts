import { cloudModeService } from './cloud/cloud-mode-service';
import { companionService } from './companion-service';
import { resolveCompanionAsset } from '../data/companion-assets';
import type { PalAIStatus } from '../models/pal-ai';
let sequence = 0;
export function palAIScope(): string {
  return JSON.stringify(cloudModeService.getState());
}
export function palAICloudActive(): boolean {
  return cloudModeService.getState().mode === 'cloud';
}
export function palAIPartner(): { partnerId: string; partnerName: string; avatarSrc: string } {
  const state = companionService.read();
  return {
    partnerId: state.skinId,
    partnerName: state.name || '伙伴',
    avatarSrc: resolveCompanionAsset('skin', state.skinId).src,
  };
}
export function palAIRequestId(): string {
  sequence++;
  return (
    'pal_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2).padEnd(12, '0') +
    '_' +
    sequence.toString(36)
  );
}
export function palAIMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'AI_BUDGET_EXHAUSTED') return '本月AI额度已用完，普通互动照常。';
  if (['FUNCTION_NOT_FOUND', 'AI_NOT_CONFIGURED'].includes(code))
    return 'AI交流还没有开通，普通互动照常。';
  if (['UNAUTHENTICATED', 'PROFILE_REQUIRED', 'CLOUD_DISABLED'].includes(code))
    return '先开启云端功能，再来和伙伴交流吧。';
  if (code === 'AI_CHAT_LIMIT') return '今天的AI交流次数用完了，明天再聊吧。';
  if (code === 'AI_LETTER_LIMIT') return '本周的AI来信次数用完了，下周再来吧。';
  if (code === 'AI_BUSY') return '伙伴正在整理上一句话，稍等一会儿吧。';
  if (code === 'AI_CONTENT_REJECTED') return '这段文字暂时不适合使用，换一种说法吧。';
  if (code === 'AI_DIARY_CHANGED') return '日记刚有更新，请重新预览后确认。';
  if (code === 'AI_DIARY_UNAVAILABLE')
    return '这篇日记暂时无法用于来信，请选择自己有文字的云端日记。';
  if (code === 'AI_REQUEST_CANCELLED') return '这次交流已经结束，普通互动照常。';
  return '这次暂时没连上。可以稍后重试，普通互动照常。';
}
export function palAIStatusMessage(status: PalAIStatus): string {
  if (status.paused) return '本月AI额度已用完，普通互动照常。';
  if (!status.available) return 'AI交流还没有开通，普通互动照常。';
  if (!status.enabled) return '开启后，和伙伴聊几句，也能在信箱请求来信。';
  return (
    '今天还能聊 ' +
    status.chatsRemaining +
    ' 次 · 本周还能收 ' +
    status.lettersRemaining +
    ' 封AI来信'
  );
}

export function palAIRequestFinished(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  return [
    'AI_CONTENT_REJECTED',
    'AI_MODERATION_UNAVAILABLE',
    'AI_DIARY_CHANGED',
    'AI_DIARY_UNAVAILABLE',
    'AI_RESPONSE_INVALID',
    'AI_INPUT_TOO_LARGE',
    'AI_USAGE_INVALID',
    'AI_REQUEST_CANCELLED',
    'AI_CONSENT_REQUIRED',
    'AI_BUSY',
    'AI_CHAT_LIMIT',
    'AI_LETTER_LIMIT',
    'AI_BUDGET_EXHAUSTED',
    'AI_NOT_CONFIGURED',
    'INVALID_INPUT',
    'AI_REQUEST_CONFLICT',
  ].includes(code);
}
