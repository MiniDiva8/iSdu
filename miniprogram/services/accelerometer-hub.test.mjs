import test from 'node:test';
import assert from 'node:assert/strict';
import { AccelerometerHub } from './accelerometer-hub.ts';

function fixture() {
  const calls = { starts: [], stops: [], on: [], off: [] };
  const api = {
    on(listener) {
      calls.on.push(listener);
    },
    off(listener) {
      calls.off.push(listener);
    },
    start(callbacks) {
      calls.starts.push(callbacks);
    },
    stop(complete) {
      calls.stops.push(complete);
    },
  };
  return { calls, hub: new AccelerometerHub(api) };
}
test('two owners share one start; releasing one does not stop the other', () => {
  const { hub, calls } = fixture();
  const a = [],
    b = [];
  const releaseA = hub.subscribe((v) => a.push(v));
  const releaseB = hub.subscribe((v) => b.push(v));
  assert.equal(calls.starts.length, 1);
  calls.starts[0].success();
  releaseA();
  assert.equal(calls.stops.length, 0);
  calls.on[0]({ x: 0.2, y: -1, z: 0 });
  assert.equal(a.length, 0);
  assert.equal(b.length, 1);
  releaseB();
  assert.equal(calls.stops.length, 1);
  assert.equal(calls.off[0], calls.on[0]);
});
test('release while starting waits for the start result before stopping', () => {
  const { hub, calls } = fixture();
  const release = hub.subscribe(() => {});
  release();
  assert.equal(calls.stops.length, 0);
  calls.starts[0].success();
  assert.equal(calls.stops.length, 1);
});
test('a new owner arriving during a pending start keeps that start alive', () => {
  const { hub, calls } = fixture();
  hub.subscribe(() => {})();
  const status = [];
  hub.subscribe(
    () => {},
    (v) => status.push(v),
  );
  calls.starts[0].success();
  assert.equal(calls.starts.length, 1);
  assert.equal(calls.stops.length, 0);
  assert.equal(status.at(-1), 'running');
});
test('a new owner while stopping is started only after the stop completes', () => {
  const { hub, calls } = fixture();
  const release = hub.subscribe(() => {});
  calls.starts[0].success();
  release();
  const values = [];
  hub.subscribe((v) => values.push(v));
  assert.equal(calls.starts.length, 1);
  calls.stops[0]();
  assert.equal(calls.starts.length, 2);
  calls.starts[1].success();
  calls.on[0]({ x: 1, y: 0, z: 0 });
  assert.equal(values.length, 0);
  calls.on[1]({ x: 0.1, y: -0.8, z: 0 });
  assert.equal(values.length, 1);
});
test('old callbacks after a successful restart cannot stop the new owner', () => {
  const { hub, calls } = fixture();
  const release = hub.subscribe(() => {});
  calls.starts[0].success();
  release();
  calls.stops[0]();
  const status = [];
  hub.subscribe(
    () => {},
    (v) => status.push(v),
  );
  calls.starts[1].success();
  calls.starts[0].fail();
  calls.starts[0].success();
  calls.stops[0]();
  assert.equal(calls.stops.length, 1);
  assert.equal(status.at(-1), 'running');
});
test('failed start reports error; a fresh owner can retry and released owners stay released', () => {
  const { hub, calls } = fixture();
  const errors = [];
  const release = hub.subscribe(
    () => {},
    (s) => errors.push(s),
  );
  calls.starts[0].fail();
  release();
  assert.equal(errors.at(-1), 'error');
  const status = [];
  hub.subscribe(
    () => {},
    (s) => status.push(s),
  );
  assert.equal(calls.starts.length, 2);
  calls.starts[1].success();
  assert.equal(status.at(-1), 'running');
});
test('malformed samples are ignored and a throwing subscriber cannot block another', () => {
  const { hub, calls } = fixture();
  hub.subscribe(() => {
    throw new Error('UI unmounted');
  });
  const values = [];
  hub.subscribe((v) => values.push(v));
  calls.starts[0].success();
  for (const value of [null, {}, { x: 1, y: 2, z: Infinity }]) calls.on[0](value);
  assert.equal(values.length, 0);
  calls.on[0]({ x: 1, y: 0, z: 0 });
  assert.equal(values.length, 1);
});
test('unavailable hardware stays static and releasing a lease twice is harmless', () => {
  const statuses = [];
  const hub = new AccelerometerHub(null);
  const release = hub.subscribe(
    () => {},
    (s) => statuses.push(s),
  );
  release();
  release();
  assert.deepEqual(statuses, ['unavailable']);
});

test('a reentrant restart cannot deliver an old error after the new running status', () => {
  const { hub, calls } = fixture();
  let restarted = false;
  hub.subscribe(
    () => {},
    (status) => {
      if (status === 'error' && !restarted) {
        restarted = true;
        hub.subscribe(() => {});
        calls.starts.at(-1).success();
      }
    },
  );
  const states = [];
  hub.subscribe(
    () => {},
    (status) => states.push(status),
  );
  calls.starts[0].fail();
  assert.equal(states.at(-1), 'running');
});
test('status broadcast skips an owner released by an earlier listener', () => {
  const { hub, calls } = fixture();
  let releaseB;
  hub.subscribe(
    () => {},
    (status) => {
      if (status === 'running') releaseB?.();
    },
  );
  const states = [];
  releaseB = hub.subscribe(
    () => {},
    (status) => states.push(status),
  );
  calls.starts[0].success();
  assert.equal(states.at(-1), 'starting');
});
