import { wechatStorageAdapter, type StorageAdapter } from '../repository/storage-adapter';

export const CLOUD_MODE_STORAGE_KEY = 'isdu:cloud-mode:v1';

export interface CloudModeState {
  readonly activatedAt: string | null;
  readonly migrationCompletedAt: string | null;
  readonly mode: 'cloud' | 'local';
  readonly privacyAcceptedAt: string | null;
}

const DEFAULT_STATE: CloudModeState = {
  activatedAt: null,
  migrationCompletedAt: null,
  mode: 'local',
  privacyAcceptedAt: null,
};

function parseState(value: unknown): CloudModeState {
  if (typeof value !== 'string' || !value) {
    return DEFAULT_STATE;
  }

  try {
    const parsed = JSON.parse(value) as Partial<CloudModeState>;
    if (parsed.mode !== 'cloud' && parsed.mode !== 'local') {
      return DEFAULT_STATE;
    }

    return {
      activatedAt: typeof parsed.activatedAt === 'string' ? parsed.activatedAt : null,
      migrationCompletedAt:
        typeof parsed.migrationCompletedAt === 'string' ? parsed.migrationCompletedAt : null,
      mode: parsed.mode,
      privacyAcceptedAt:
        typeof parsed.privacyAcceptedAt === 'string' ? parsed.privacyAcceptedAt : null,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export class CloudModeService {
  private readonly now: () => string;
  private readonly storage: StorageAdapter;

  constructor(
    storage: StorageAdapter = wechatStorageAdapter,
    now: () => string = () => new Date().toISOString(),
  ) {
    this.storage = storage;
    this.now = now;
  }

  getState(): CloudModeState {
    if (!this.storage.has(CLOUD_MODE_STORAGE_KEY)) {
      return DEFAULT_STATE;
    }

    return parseState(this.storage.read(CLOUD_MODE_STORAGE_KEY));
  }

  acceptPrivacy(): CloudModeState {
    const current = this.getState();
    const next = { ...current, privacyAcceptedAt: current.privacyAcceptedAt ?? this.now() };
    this.write(next);
    return next;
  }

  activateCloud(migrationCompletedAt = this.now()): CloudModeState {
    const current = this.getState();
    const now = this.now();
    const next: CloudModeState = {
      activatedAt: current.activatedAt ?? now,
      migrationCompletedAt,
      mode: 'cloud',
      privacyAcceptedAt: current.privacyAcceptedAt ?? now,
    };
    this.write(next);
    return next;
  }

  resetToLocal(): void {
    this.storage.remove(CLOUD_MODE_STORAGE_KEY);
  }

  private write(state: CloudModeState): void {
    this.storage.write(CLOUD_MODE_STORAGE_KEY, JSON.stringify(state));
  }
}

export const cloudModeService = new CloudModeService();
