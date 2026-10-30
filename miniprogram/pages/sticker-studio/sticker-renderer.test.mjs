import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderSticker } from './sticker-renderer.ts';
import {
  appendStickerLayer,
  createStickerDocument,
  createStrokeLayer,
  createTextLayer,
} from '../../utils/sticker-document.ts';
test('erasers composite before object text and background, and export excludes selection chrome', () => {
  const operations = [];
  const ctx = new Proxy(
    {},
    {
      get:
        (_, key) =>
        (...args) =>
          operations.push([key, ...args]),
      set: (_, key, value) => {
        operations.push([key, value]);
        return true;
      },
    },
  );
  let doc = { ...createStickerDocument(), background: 'paper' };
  const text = createTextLayer('今天也很好', '#35402e');
  doc = appendStickerLayer(doc, text);
  doc = appendStickerLayer(
    doc,
    createStrokeLayer(
      [
        { x: 10, y: 10 },
        { x: 60, y: 60 },
      ],
      '#35402e',
      4,
    ),
  );
  doc = appendStickerLayer(doc, createStrokeLayer([{ x: 20, y: 20 }], '#35402e', 16, true));
  renderSticker(ctx, doc);
  const eraser = operations.findIndex(
    (o) => o[0] === 'globalCompositeOperation' && o[1] === 'destination-out',
  );
  const bg = operations.findIndex((o) => o[0] === 'fillRect');
  const lettering = operations.findIndex((o) => o[0] === 'fillText');
  assert.ok(eraser > 0 && eraser < bg && bg < lettering);
  assert.equal(
    operations.some((o) => o[0] === 'strokeRect'),
    false,
  );
  operations.length = 0;
  renderSticker(ctx, doc, text.id);
  assert.equal(
    operations.some((o) => o[0] === 'strokeRect'),
    true,
  );
});
