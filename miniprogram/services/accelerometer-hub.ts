export type MotionStatus = 'starting' | 'running' | 'unavailable' | 'error';
export type AccelerationSample = Readonly<{ x: number; y: number; z: number }>;
type SampleListener = (sample: unknown) => void;
export interface AccelerometerAdapter {
  on(listener: SampleListener): void;
  off(listener: SampleListener): void;
  start(callbacks: { success: () => void; fail: () => void }): void;
  stop(complete: () => void): void;
}
interface Subscriber {
  sample(value: AccelerationSample): void;
  status(value: MotionStatus): void;
}
function safely(callback: () => void) {
  try {
    callback();
  } catch {
    /* A detached view must not interrupt other subscribers. */
  }
}
export class AccelerometerHub {
  private adapter: AccelerometerAdapter | null;
  private owners = new Map<number, Subscriber>();
  private nextId = 0;
  private epoch = 0;
  private phase: 'idle' | 'starting' | 'running' | 'stopping' = 'idle';
  private listener: SampleListener | null = null;
  constructor(adapter: AccelerometerAdapter | null) {
    this.adapter = adapter;
  }
  subscribe(
    onSample: Subscriber['sample'],
    onStatus: Subscriber['status'] = () => undefined,
  ): () => void {
    const id = ++this.nextId;
    this.owners.set(id, { sample: onSample, status: onStatus });
    if (!this.adapter) safely(() => onStatus('unavailable'));
    else if (this.phase === 'running') safely(() => onStatus('running'));
    else if (this.phase === 'idle') this.start();
    else safely(() => onStatus('starting'));
    return () => {
      if (!this.owners.delete(id)) return;
      if (this.owners.size === 0 && this.phase === 'running') this.stop();
    };
  }
  private broadcast(status: MotionStatus) {
    const epoch = this.epoch;
    const phase = this.phase;
    for (const [id, owner] of [...this.owners.entries()]) {
      if (epoch !== this.epoch || phase !== this.phase) break;
      if (this.owners.has(id)) safely(() => owner.status(status));
    }
  }
  private removeListener() {
    const listener = this.listener;
    this.listener = null;
    if (listener && this.adapter) safely(() => this.adapter?.off(listener));
  }
  private start() {
    if (!this.adapter || this.phase !== 'idle' || this.owners.size === 0) return;
    const epoch = ++this.epoch;
    this.phase = 'starting';
    this.broadcast('starting');
    const fail = () => {
      if (epoch !== this.epoch || this.phase !== 'starting') return;
      this.removeListener();
      this.phase = 'idle';
      this.broadcast('error');
    };
    const listener: SampleListener = (value) => {
      if (
        epoch !== this.epoch ||
        (this.phase !== 'starting' && this.phase !== 'running') ||
        !value ||
        typeof value !== 'object'
      )
        return;
      const sample = value as Record<string, unknown>;
      if (
        typeof sample.x !== 'number' ||
        typeof sample.y !== 'number' ||
        typeof sample.z !== 'number' ||
        ![sample.x, sample.y, sample.z].every(Number.isFinite)
      )
        return;
      const normalized = Object.freeze({ x: sample.x, y: sample.y, z: sample.z });
      for (const [id, owner] of [...this.owners.entries()]) {
        if (this.owners.has(id)) safely(() => owner.sample(normalized));
      }
    };
    this.listener = listener;
    try {
      this.adapter.on(listener);
      this.adapter.start({
        success: () => {
          if (epoch !== this.epoch || this.phase !== 'starting') return;
          this.phase = 'running';
          if (this.owners.size === 0) this.stop();
          else this.broadcast('running');
        },
        fail,
      });
    } catch {
      fail();
    }
  }
  private stop() {
    if (!this.adapter || this.phase !== 'running') return;
    const epoch = this.epoch;
    this.phase = 'stopping';
    this.removeListener();
    const complete = () => {
      if (epoch !== this.epoch || this.phase !== 'stopping') return;
      this.phase = 'idle';
      this.start();
    };
    try {
      this.adapter.stop(complete);
    } catch {
      complete();
    }
  }
}
function wxAdapter(): AccelerometerAdapter | null {
  if (
    typeof wx === 'undefined' ||
    typeof wx.startAccelerometer !== 'function' ||
    typeof wx.stopAccelerometer !== 'function' ||
    typeof wx.onAccelerometerChange !== 'function' ||
    typeof wx.offAccelerometerChange !== 'function'
  )
    return null;
  return {
    on: (listener) => wx.onAccelerometerChange(listener),
    off: (listener) => wx.offAccelerometerChange(listener),
    start: ({ success, fail }) => {
      void wx.startAccelerometer({ interval: 'game', success, fail });
    },
    stop: (complete) => {
      void wx.stopAccelerometer({ complete });
    },
  };
}
export const accelerometerHub = new AccelerometerHub(wxAdapter());
