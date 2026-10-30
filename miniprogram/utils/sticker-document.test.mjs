import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  StickerHistory,
  appendStickerLayer,
  createStickerDocument,
  createStampLayer,
  createStrokeLayer,
  createTextLayer,
  hasStickerContent,
  hitTestSticker,
  parseStickerDocument,
  removeStickerLayer,
  transformStickerLayer,
} from './sticker-document.ts';

test('only actual marks or nonempty objects make a sticker exportable', () => {
  assert.equal(hasStickerContent(createStickerDocument()), false);
  const erased = appendStickerLayer(
    createStickerDocument(),
    createStrokeLayer([{ x: 4, y: 5 }], '#35402e', 12, true),
  );
  assert.equal(hasStickerContent(erased), false);
  assert.throws(() => createTextLayer('   ', '#35402e'));
  assert.equal(
    hasStickerContent(appendStickerLayer(erased, createTextLayer('今天很棒', '#35402e'))),
    true,
  );
});

test('stroke points and documents are detached from caller-owned input', () => {
  const points = [{ x: 15, y: 25 }];
  const layer = createStrokeLayer(points, '#35402e', 4);
  points[0].x = 200;
  const doc = appendStickerLayer(createStickerDocument(), layer);
  layer.points[0].x = 300;
  assert.equal(doc.layers[0].points[0].x, 15);
  assert.equal(parseStickerDocument(doc).layers[0].points[0].x, 15);
});

test('undo groups a whole stroke and moving an object truncates the redo branch', () => {
  const history = new StickerHistory();
  const stamp = createStampLayer('tea', '#35402e');
  history.commit(appendStickerLayer(history.document, stamp));
  history.commit(appendStickerLayer(history.document, createTextLayer('晚课后喝杯茶', '#35402e')));
  assert.equal(history.undo().layers.length, 1);
  assert.equal(history.canRedo, true);
  history.commit(transformStickerLayer(history.document, stamp.id, { x: 100, y: 120 }));
  assert.equal(history.canRedo, false);
  assert.equal(history.undo().layers[0].x, 180);
  assert.equal(history.redo().layers[0].x, 100);
  const exposed = history.document;
  exposed.layers.length = 0;
  assert.equal(history.document.layers.length, 1);
});

test('hit testing uses rotation, scale and topmost object order', () => {
  const first = { ...createStampLayer('leaf', '#35402e'), id: 'first', x: 100, y: 100 };
  const last = {
    ...createTextLayer('今天去上课', '#35402e'),
    id: 'last',
    x: 100,
    y: 100,
    rotation: 90,
  };
  const doc = appendStickerLayer(appendStickerLayer(createStickerDocument(), first), last);
  assert.equal(hitTestSticker(doc, { x: 100, y: 150 }), 'last');
  assert.equal(hitTestSticker(doc, { x: 330, y: 330 }), '');
});

test('transforms remain finite, visible and bounded while deleting preserves other layers', () => {
  const stamp = createStampLayer('sun', '#35402e');
  const text = createTextLayer('校园散步', '#35402e');
  const doc = appendStickerLayer(appendStickerLayer(createStickerDocument(), stamp), text);
  const moved = transformStickerLayer(doc, stamp.id, {
    x: -1000,
    y: 4000,
    scale: 100,
    rotation: 450,
  });
  const layer = moved.layers[0];
  assert.ok(layer.x >= 0 && layer.x <= 360 && layer.y >= 0 && layer.y <= 360);
  assert.ok(layer.scale <= 2.4);
  assert.equal(layer.rotation, 90);
  assert.throws(() => transformStickerLayer(doc, stamp.id, { x: NaN }));
  assert.deepEqual(
    removeStickerLayer(moved, stamp.id).layers.map((l) => l.id),
    [text.id],
  );
  assert.equal(doc.layers[0].x, 180);
});

test('draft parser rejects corrupt values, duplicate ids and resource exhaustion', () => {
  const doc = appendStickerLayer(createStickerDocument(), createTextLayer('记住今天', '#35402e'));
  assert.equal(parseStickerDocument({ ...doc, schemaVersion: 4 }), null);
  assert.equal(
    parseStickerDocument({ ...doc, layers: [{ ...doc.layers[0], scale: Infinity }] }),
    null,
  );
  assert.equal(
    parseStickerDocument({ ...doc, layers: [{ ...doc.layers[0], text: '字'.repeat(61) }] }),
    null,
  );
  assert.equal(parseStickerDocument({ ...doc, layers: [doc.layers[0], doc.layers[0]] }), null);
  assert.equal(
    parseStickerDocument({ ...doc, layers: [{ ...doc.layers[0], color: 'url(secret)' }] }),
    null,
  );
  assert.equal(
    parseStickerDocument({
      ...doc,
      layers: Array.from({ length: 81 }, (_, i) => ({ ...doc.layers[0], id: 'layer-' + i })),
    }),
    null,
  );
  assert.throws(() => createStampLayer('unknown-brand-art', '#35402e'));
});

test('history stays bounded and no-op commits retain redo', () => {
  const history = new StickerHistory();
  const stamp = createStampLayer('flower', '#35402e');
  history.commit(appendStickerLayer(history.document, stamp));
  for (let i = 0; i < 70; i++)
    history.commit(transformStickerLayer(history.document, stamp.id, { x: 100 + i }));
  history.undo();
  history.commit(history.document);
  assert.equal(history.canRedo, true);
  let undoCount = 0;
  while (history.canUndo) {
    history.undo();
    undoCount++;
  }
  assert.ok(undoCount <= 30);
});
