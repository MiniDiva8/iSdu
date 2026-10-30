import test from 'node:test';
import assert from 'node:assert/strict';

const calls = { starts: 0, stops: 0, listeners: [], removed: [], fail: false };
globalThis.wx = {
  createSelectorQuery() {},
  onAccelerometerChange(listener) {
    calls.listeners.push(listener);
  },
  offAccelerometerChange(listener) {
    calls.removed.push(listener);
  },
  startAccelerometer(options) {
    calls.starts += 1;
    (calls.fail ? options.fail : options.success)();
  },
  stopAccelerometer(options) {
    calls.stops += 1;
    options.complete();
  },
};
let definition;
globalThis.Component = (value) => {
  definition = value;
};
await import('../miniprogram/components/motion-avatar/index.ts');

function fixture(t) {
  calls.starts = 0;
  calls.stops = 0;
  calls.listeners = [];
  calls.removed = [];
  calls.fail = false;
  let now = 0,
    next = 0;
  const timers = new Map();
  const hosts = [];
  const queries = [];
  const frames = new Map();
  const translations = [];
  const context = new Proxy(
    {},
    {
      get: (object, key) =>
        object[key] ??
        ((...values) => {
          if (key === 'translate') translations.push(values);
        }),
      set: (object, key, value) => {
        object[key] = value;
        return true;
      },
    },
  );
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    requestAnimationFrame(callback) {
      const id = ++next;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
  };
  t.mock.method(wx, 'createSelectorQuery', () => ({
    in() {
      return this;
    },
    select() {
      return this;
    },
    fields() {
      return this;
    },
    exec(callback) {
      queries.push(callback);
    },
  }));
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    const id = ++next;
    timers.set(id, { callback, due: now + delay });
    return id;
  });
  t.mock.method(globalThis, 'clearTimeout', (id) => timers.delete(id));
  function host(props = {}, onEvent) {
    const defaults = Object.fromEntries(
      Object.entries(definition.properties).map(([k, v]) => [k, v.value]),
    );
    const value = {
      data: { ...structuredClone(definition.data), ...defaults, ...props },
      updates: [],
      events: [],
      setData(patch) {
        Object.assign(this.data, patch);
        this.updates.push(patch);
      },
      triggerEvent(name, detail) {
        this.events.push({ name, detail });
        onEvent?.(this, name, detail);
      },
    };
    for (const [name, method] of Object.entries(definition.methods))
      value[name] = method.bind(value);
    definition.lifetimes.attached.call(value);
    hosts.push(value);
    return value;
  }
  function patch(host, values) {
    Object.assign(host.data, values);
    definition.observers['active,motionEnabled,reducedMotion'].call(host);
  }
  function tick(duration) {
    const until = now + duration;
    let steps = 0;
    while (timers.size) {
      const found = [...timers]
        .filter(([, timer]) => timer.due <= until)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!found) break;
      assert.ok(++steps < 3000, 'unbounded timer loop');
      now = found[1].due;
      timers.delete(found[0]);
      found[1].callback();
    }
    now = until;
  }
  function ready(host) {
    definition.lifetimes.ready?.call(host);
    queries.shift()?.([{ node: canvas, width: 88, height: 88 }]);
  }
  function frame(duration = 1000 / 60) {
    now += duration;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(now));
  }
  t.after(() => {
    for (const value of hosts) definition.lifetimes.detached.call(value);
  });
  return { host, patch, tick, timers, frames, queries, ready, frame, translations, canvas };
}
test('the default avatar stays static, creates no timer and never starts hardware', (t) => {
  const f = fixture(t),
    host = f.host();
  assert.equal(calls.starts, 0);
  assert.equal(f.timers.size, 0);
  assert.ok(host.data.poseStyle.includes('translate3d'));
  assert.equal(host.data.motionStatus, 'static');
});
test('page hiding releases only its sensor lease and stops future animation updates', (t) => {
  const f = fixture(t),
    host = f.host({ motionEnabled: true });
  assert.equal(calls.starts, 1);
  calls.listeners[0]({ x: 0.8, y: -0.6, z: 0 });
  f.tick(100);
  definition.pageLifetimes.hide.call(host);
  assert.equal(calls.stops, 1);
  assert.equal(f.timers.size, 0);
  const updates = host.updates.length;
  calls.listeners[0]({ x: -1, y: 1, z: 0 });
  f.tick(500);
  assert.equal(host.updates.length, updates);
  definition.pageLifetimes.show.call(host);
  assert.equal(calls.starts, 2);
});
test('manual nudges run one loop and detach stops it immediately', (t) => {
  const f = fixture(t),
    host = f.host();
  const home = host.data.poseStyle;
  host.impulse(-1, -2);
  host.impulse(0.5, -0.5);
  assert.equal(f.timers.size, 1);
  f.tick(120);
  assert.notEqual(host.data.poseStyle, home);
  definition.lifetimes.detached.call(host);
  const updates = host.updates.length;
  f.tick(1000);
  assert.equal(host.updates.length, updates);
  assert.equal(f.timers.size, 0);
});
test('active=false and reduced motion both disable sensors and manual animation', (t) => {
  const f = fixture(t),
    host = f.host({ active: false, motionEnabled: true });
  assert.equal(calls.starts, 0);
  host.impulse(2, -2);
  assert.equal(f.timers.size, 0);
  f.patch(host, { active: true });
  assert.equal(calls.starts, 1);
  f.patch(host, { reducedMotion: true });
  assert.equal(calls.stops, 1);
  host.impulse(2, -2);
  assert.equal(f.timers.size, 0);
  f.patch(host, { reducedMotion: false });
  assert.equal(calls.starts, 2);
});
test('two visible avatars do not stop each other when one detaches', (t) => {
  const f = fixture(t),
    a = f.host({ motionEnabled: true }),
    b = f.host({ motionEnabled: true });
  assert.equal(calls.starts, 1);
  definition.lifetimes.detached.call(a);
  assert.equal(calls.stops, 0);
  calls.listeners[0]({ x: 1, y: -0.3, z: 0 });
  f.tick(200);
  assert.ok(b.updates.length > 2);
  definition.lifetimes.detached.call(b);
  assert.equal(calls.stops, 1);
});
test('sensor errors preserve the face and its profile activation event', (t) => {
  const f = fixture(t);
  calls.fail = true;
  const host = f.host({ motionEnabled: true });
  assert.equal(host.data.motionStatus, 'error');
  host.onActivate();
  assert.equal(host.events.filter((e) => e.name === 'activate').length, 1);
  assert.ok(host.data.poseStyle);
  assert.equal(calls.stops, 0);
});
test('a static avatar click emits activation without enabling hardware', (t) => {
  const f = fixture(t),
    host = f.host();
  host.onActivate();
  assert.deepEqual(host.events, [{ name: 'activate', detail: {} }]);
  assert.equal(calls.starts, 0);
});

test('a sleeping native component wakes and rolls during a very slow physical tilt', (t) => {
  const f = fixture(t),
    host = f.host({ motionEnabled: true });
  const home = host.data.poseStyle;
  for (let i = 0; i <= 800; i += 1) {
    const x = i / 1000;
    calls.listeners[0]({ x, y: -Math.sqrt(1 - x * x), z: 0 });
    f.tick(20);
  }
  assert.notEqual(host.data.poseStyle, home);
  const x = Number(host.data.poseStyle.match(/translate3d\((-?[\d.]+)/)[1]);
  assert.ok(x > 20, 'the face must follow cumulative tilt');
});
test('closing synchronously from starting releases the pending acquisition', (t) => {
  const f = fixture(t);
  const host = f.host({ motionEnabled: true }, (target, name, detail) => {
    if (name === 'motionstatechange' && detail.status === 'starting') {
      target.data.active = false;
      definition.observers['active,motionEnabled,reducedMotion'].call(target);
    }
  });
  assert.equal(host.data.active, false);
  assert.equal(calls.stops, 1);
  assert.equal(calls.removed.length, 1);
  assert.equal(f.timers.size, 0);
});
test('detaching synchronously from starting never leaves a sensor owner behind', (t) => {
  const f = fixture(t);
  f.host({ motionEnabled: true }, (target, name, detail) => {
    if (name === 'motionstatechange' && detail.status === 'starting')
      definition.lifetimes.detached.call(target);
  });
  assert.equal(calls.stops, 1);
  assert.equal(calls.removed.length, 1);
  assert.equal(f.timers.size, 0);
});

test('native canvas renders on every display frame without per-frame setData or timer updates', (t) => {
  const f = fixture(t),
    host = f.host({ motionEnabled: true });
  f.ready(host);
  calls.listeners[0]({ x: 1, y: -0.15, z: 0 });
  assert.equal(f.frames.size, 1, 'motion must use the native display frame scheduler');
  assert.equal(f.timers.size, 0, 'canvas motion must not retain the bridge timer');
  const updates = host.updates.length;
  const positions = [];
  for (let i = 0; i < 60; i++) {
    f.frame();
    positions.push(f.translations.at(-1)?.[0]);
  }
  assert.equal(host.updates.length, updates, 'frame positions must stay outside setData');
  assert.ok(new Set(positions).size > 45, 'display frames must advance the visible face');
});

test('native canvas frames cancel on hide and resume with a fresh clock on return', (t) => {
  const f = fixture(t),
    host = f.host({ motionEnabled: true });
  f.ready(host);
  calls.listeners[0]({ x: 1, y: -0.1, z: 0 });
  f.frame();
  definition.pageLifetimes.hide.call(host);
  assert.equal(f.frames.size, 0);
  const draws = f.translations.length;
  f.frame(100000);
  assert.equal(f.translations.length, draws);
  definition.pageLifetimes.show.call(host);
  calls.listeners.at(-1)({ x: -1, y: -0.1, z: 0 });
  assert.equal(f.frames.size, 1);
  f.frame();
  assert.ok(f.translations.length > draws);
  definition.lifetimes.detached.call(host);
  assert.equal(f.frames.size, 0);
});

test('a late native canvas query cannot revive a hidden or detached avatar', (t) => {
  const f = fixture(t),
    host = f.host({ motionEnabled: true });
  definition.lifetimes.ready?.call(host);
  assert.equal(f.queries.length, 1);
  definition.pageLifetimes.hide.call(host);
  const updates = host.updates.length;
  f.queries.shift()([{ node: {}, width: 88, height: 88 }]);
  assert.equal(host.updates.length, updates);
  assert.equal(f.frames.size, 0);
  definition.pageLifetimes.show.call(host);
  definition.lifetimes.detached.call(host);
  for (const callback of f.queries.splice(0)) callback([{ node: {}, width: 88, height: 88 }]);
  assert.equal(f.frames.size, 0);
  assert.equal(calls.stops, 2);
});

test('native canvas remains static when privacy has not enabled motion', (t) => {
  const f = fixture(t),
    host = f.host();
  f.ready(host);
  for (let i = 0; i < 60; i++) f.frame();
  assert.equal(calls.starts, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  host.onActivate();
  assert.equal(host.events.at(-1).name, 'activate');
});

test('hiding one canvas avatar leaves the shared sensor and other canvas frames running', (t) => {
  const f = fixture(t),
    a = f.host({ motionEnabled: true }),
    b = f.host({ motionEnabled: true });
  f.ready(a);
  f.ready(b);
  calls.listeners[0]({ x: 1, y: -0.1, z: 0 });
  assert.equal(f.frames.size, 2);
  definition.pageLifetimes.hide.call(a);
  assert.equal(calls.stops, 0);
  assert.equal(f.frames.size, 1);
  f.frame();
  assert.equal(f.frames.size, 1);
});

test('disabling sensor motion while rolling stops native frames and returns to a static face', (t) => {
  const f = fixture(t),
    host = f.host({ motionEnabled: true });
  f.ready(host);
  calls.listeners[0]({ x: 1, y: -0.1, z: 0 });
  f.frame();
  assert.equal(f.frames.size, 1);
  f.patch(host, { motionEnabled: false });
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(calls.stops, 1);
  assert.equal(host.data.motionStatus, 'static');
});

test('a cancelled display callback from an earlier visit cannot revive a second frame loop', (t) => {
  const f = fixture(t),
    host = f.host({ motionEnabled: true });
  f.ready(host);
  calls.listeners[0]({ x: 1, y: -0.1, z: 0 });
  const stale = [...f.frames.values()][0];
  definition.pageLifetimes.hide.call(host);
  definition.pageLifetimes.show.call(host);
  assert.equal(f.frames.size, 1);
  const draws = f.translations.length;
  stale(120000);
  assert.equal(f.translations.length, draws, 'a cancelled old callback must not paint on reentry');
  assert.equal(f.frames.size, 1, 'only the current visit may schedule a display callback');
});

test('a native cancellation error cannot interrupt hiding or leak the sensor lease', (t) => {
  const f = fixture(t),
    host = f.host({ motionEnabled: true });
  f.ready(host);
  calls.listeners[0]({ x: 1, y: -0.1, z: 0 });
  const cancelled = [...f.frames.values()][0];
  const mocked = t.mock.method(f.canvas, 'cancelAnimationFrame', () => {
    throw new Error('disposed native node');
  });
  try {
    assert.doesNotThrow(() => definition.pageLifetimes.hide.call(host));
    assert.equal(calls.stops, 1);
    const draws = f.translations.length;
    cancelled(120000);
    assert.equal(f.translations.length, draws);
  } finally {
    mocked.mock.restore();
  }
});

test('a native display scheduling error keeps the avatar usable through the DOM fallback', (t) => {
  const f = fixture(t),
    host = f.host({ motionEnabled: true });
  f.ready(host);
  t.mock.method(f.canvas, 'requestAnimationFrame', () => {
    throw new Error('display scheduler unavailable');
  });
  calls.listeners[0]({ x: 1, y: -0.1, z: 0 });
  assert.equal(host.data.canvasReady, false);
  assert.equal(f.timers.size, 1);
  f.tick(100);
  assert.ok(host.data.poseStyle.includes('translate3d'));
  host.onActivate();
  assert.equal(host.events.at(-1).name, 'activate');
});
