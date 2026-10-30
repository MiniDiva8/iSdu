import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StickerDraftService } from './sticker-draft-service.ts';

const doc = {
  schemaVersion: 1,
  background: 'transparent',
  layers: [
    {
      kind: 'text',
      id: 'test',
      x: 180,
      y: 180,
      scale: 1,
      rotation: 0,
      text: '今天在山大',
      color: '#35402e',
    },
  ],
};
function fixture() {
  const data = new Map();
  return {
    data,
    adapter: {
      has: (k) => data.has(k),
      read: (k) => data.get(k),
      write: (k, v) => data.set(k, v),
      remove: (k) => data.delete(k),
    },
  };
}
test('local sticker draft survives service restart and explicit clear removes it', () => {
  const { data, adapter } = fixture();
  const first = new StickerDraftService(adapter);
  first.save(doc);
  assert.deepEqual(new StickerDraftService(adapter).read(), doc);
  first.clear();
  assert.equal(data.size, 0);
  assert.equal(first.read(), null);
});
test('corrupt storage and oversized payload are never restored', () => {
  const { data, adapter } = fixture();
  const service = new StickerDraftService(adapter);
  service.save(doc);
  const key = [...data.keys()][0];
  data.set(key, '{broken');
  assert.equal(service.read(), null);
  data.set(key, ' '.repeat(900000));
  assert.equal(service.read(), null);
  assert.throws(() => service.save({ ...doc, layers: [{ ...doc.layers[0], text: '' }] }));
});
test('failed storage write is visible to caller and leaves previous draft intact', () => {
  const { adapter } = fixture();
  const service = new StickerDraftService(adapter);
  service.save(doc);
  adapter.write = () => {
    throw Error('storage full');
  };
  assert.throws(() => service.save({ ...doc, background: 'paper' }), /storage full/);
  assert.equal(service.read().background, 'transparent');
});
