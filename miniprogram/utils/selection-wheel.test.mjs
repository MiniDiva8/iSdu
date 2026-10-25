import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeWheelAngle,
  wheelIndexAtRotation,
  wheelRotationForIndex,
  wheelReleaseRotation,
  wheelPointAngle,
} from './selection-wheel.ts';
test('rotation stays continuous when crossing the angle branch', () => {
  assert.equal(normalizeWheelAngle(-179 - 179), 2);
  assert.equal(normalizeWheelAngle(179 - -179), -2);
  assert.equal(normalizeWheelAngle(540), -180);
  assert.throws(() => normalizeWheelAngle(NaN), /角度/);
});
test('both 12 moods and 9 topics map wrapped rotation to the right option', () => {
  assert.equal(wheelIndexAtRotation(-90, 12), 3);
  assert.equal(wheelIndexAtRotation(30, 12), 11);
  assert.equal(wheelIndexAtRotation(-390, 12), 1);
  assert.equal(wheelIndexAtRotation(-80, 9), 2);
  assert.throws(() => wheelIndexAtRotation(0, 0), /选项/);
});
test('tapping and releasing use the nearest equivalent angle without a full extra spin', () => {
  assert.equal(wheelRotationForIndex(350, 0, 12), 360);
  assert.equal(wheelRotationForIndex(10, 11, 12), 30);
  assert.equal(wheelRotationForIndex(-350, 0, 12), -360);
  assert.equal(wheelReleaseRotation(18, 0, 12), 30);
  assert.equal(wheelReleaseRotation(10, 0.5, 12), 90);
  assert.equal(wheelReleaseRotation(10, 100, 12), 120);
});
test('the center dead zone and invalid points never start a rotation', () => {
  assert.equal(wheelPointAngle({ x: 0, y: 0 }, { x: 0, y: 0 }), null);
  assert.equal(wheelPointAngle({ x: NaN, y: 4 }, { x: 0, y: 0 }), null);
  assert.equal(wheelPointAngle({ x: 100, y: 0 }, { x: 0, y: 0 }), 0);
  assert.equal(wheelPointAngle({ x: 0, y: 100 }, { x: 0, y: 0 }), 90);
});
