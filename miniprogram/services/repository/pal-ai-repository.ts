import type {
  PalAIChatRequest,
  PalAILetterRequest,
  PalAIGeneration,
  PalAIReply,
  PalAIStatus,
  PalAITurn,
} from '../../models/pal-ai';
import {
  wechatCloudFunctionClient,
  type CloudFunctionClient,
} from '../cloud/cloud-function-client';

export class PalAIRepositoryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'PalAIRepositoryError';
    this.code = code;
  }
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u.test(value);
const short = (value: unknown, maximum: number): value is string =>
  typeof value === 'string' && Array.from(value).length <= maximum;
function invalid(): never {
  throw new PalAIRepositoryError(
    'INVALID_RESPONSE',
    '伙伴服务暂时没有返回完整内容，普通互动照常。',
  );
}
function parseResult<T>(value: unknown, parse: (data: unknown) => T): T {
  if (!isRecord(value) || typeof value.ok !== 'boolean' || !id(value.requestId)) invalid();
  if (!value.ok) {
    if (!short(value.code, 60) || !value.code || !short(value.message, 200)) invalid();
    throw new PalAIRepositoryError(value.code, value.message);
  }
  return parse(value.data);
}
function parseReply(value: unknown): PalAIReply {
  if (
    !isRecord(value) ||
    !id(value.id) ||
    !['chat', 'letter'].includes(String(value.type)) ||
    !short(value.title, 28) ||
    !short(value.text, value.type === 'chat' ? 120 : 280) ||
    !value.text.trim() ||
    !['none', 'happy', 'rest'].includes(String(value.action)) ||
    !id(value.partnerId) ||
    !short(value.partnerName, 16) ||
    !value.partnerName ||
    typeof value.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value.date)
  )
    invalid();
  if (
    value.type === 'letter' &&
    (!value.title.trim() || !id(value.sourceMemoryId) || typeof value.read !== 'boolean')
  )
    invalid();
  return {
    id: value.id,
    type: value.type as PalAIReply['type'],
    title: value.title,
    text: value.text,
    action: value.action as PalAIReply['action'],
    date: value.date,
    partnerId: value.partnerId,
    partnerName: value.partnerName,
    ...(value.type === 'letter'
      ? { sourceMemoryId: value.sourceMemoryId as string, read: value.read as boolean }
      : {}),
  };
}
function parseStatus(value: unknown): PalAIStatus {
  if (
    !isRecord(value) ||
    !['enabled', 'available', 'paused'].every((k) => typeof value[k] === 'boolean') ||
    !short(value.reason, 60) ||
    !Number.isSafeInteger(value.chatsRemaining) ||
    Number(value.chatsRemaining) < 0 ||
    Number(value.chatsRemaining) > 3 ||
    !Number.isSafeInteger(value.lettersRemaining) ||
    Number(value.lettersRemaining) < 0 ||
    Number(value.lettersRemaining) > 2 ||
    !Array.isArray(value.history) ||
    value.history.length > 4 ||
    !Array.isArray(value.letters) ||
    value.letters.length > 12 ||
    (value.paused && value.available)
  )
    invalid();
  const history: PalAITurn[] = value.history.map((item: unknown) => {
    if (
      !isRecord(item) ||
      !['user', 'assistant'].includes(String(item.role)) ||
      !short(item.content, item.role === 'user' ? 160 : 120)
    )
      invalid();
    return { role: item.role as PalAITurn['role'], content: item.content };
  });
  const letters = value.letters.map(parseReply);
  if (letters.some((letter) => letter.type !== 'letter')) invalid();
  return {
    enabled: value.enabled as boolean,
    available: value.available as boolean,
    paused: value.paused as boolean,
    reason: value.reason,
    chatsRemaining: value.chatsRemaining as number,
    lettersRemaining: value.lettersRemaining as number,
    history,
    letters,
  };
}
function generation(value: unknown, type: 'chat' | 'letter', memoryId?: string): PalAIGeneration {
  if (!isRecord(value) || !['completed', 'pending', 'failed'].includes(String(value.state)))
    invalid();
  if (value.state === 'completed') {
    const reply = parseReply(value.reply);
    if (reply.type !== type || (type === 'letter' && reply.sourceMemoryId !== memoryId)) invalid();
    return { state: 'completed', reply };
  }
  if (!short(value.code, 60)) invalid();
  return { state: value.state as 'pending' | 'failed', code: value.code };
}
function saved(value: unknown): void {
  if (!isRecord(value) || value.saved !== true) invalid();
}
export class PalAIRepository {
  private readonly client: CloudFunctionClient;
  constructor(client: CloudFunctionClient = wechatCloudFunctionClient) {
    this.client = client;
  }
  async status(): Promise<PalAIStatus> {
    return parseResult(await this.client.call('pal-ai', 'status'), parseStatus);
  }
  async enable(): Promise<void> {
    parseResult(await this.client.call('pal-ai', 'consent', { enabled: true }), saved);
  }
  async chat(payload: PalAIChatRequest): Promise<PalAIGeneration> {
    return parseResult(await this.client.call('pal-ai', 'chat', { ...payload }), (value) =>
      generation(value, 'chat'),
    );
  }
  async letter(payload: PalAILetterRequest): Promise<PalAIGeneration> {
    return parseResult(await this.client.call('pal-ai', 'letter', { ...payload }), (value) =>
      generation(value, 'letter', payload.memoryId),
    );
  }
  async result(
    requestId: string,
    type: 'chat' | 'letter',
    memoryId?: string,
  ): Promise<PalAIGeneration> {
    return parseResult(await this.client.call('pal-ai', 'result', { requestId }), (value) =>
      generation(value, type, memoryId),
    );
  }
  async readLetter(letterId: string): Promise<void> {
    parseResult(await this.client.call('pal-ai', 'readLetter', { id: letterId }), saved);
  }
  async deleteLetter(letterId: string): Promise<void> {
    parseResult(await this.client.call('pal-ai', 'deleteLetter', { id: letterId }), saved);
  }
  async clear(): Promise<void> {
    parseResult(await this.client.call('pal-ai', 'clear'), saved);
  }
}
export const palAIRepository = new PalAIRepository();
