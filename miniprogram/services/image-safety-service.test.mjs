import assert from 'node:assert/strict';
import test from 'node:test';

import { SAFETY_IMAGE_MAX_BYTES, prepareImageForSafety } from './image-safety-service.ts';

function installWxMock({ dimensions, sizes }) {
  const compressions = [];
  globalThis.wx = {
    compressImage(options) {
      const output = `compressed-${compressions.length + 1}.jpg`;
      compressions.push({
        height: options.compressedHeight,
        output,
        quality: options.quality,
        src: options.src,
        width: options.compressedWidth,
      });
      options.success({ errMsg: 'compressImage:ok', tempFilePath: output });
    },
    getFileSystemManager() {
      return {
        getFileInfo(options) {
          const size = sizes[options.filePath];
          if (typeof size === 'number') {
            options.success({ digest: '', errMsg: 'getFileInfo:ok', size });
          } else {
            options.fail({ errMsg: 'getFileInfo:fail' });
          }
        },
      };
    },
    getImageInfo(options) {
      options.success({
        ...dimensions,
        errMsg: 'getImageInfo:ok',
        orientation: 'up',
        path: options.src,
        type: 'jpg',
      });
    },
  };
  return compressions;
}

test('keeps an already safe local image unchanged', async () => {
  const compressions = installWxMock({
    dimensions: { height: 1000, width: 700 },
    sizes: { 'safe.jpg': SAFETY_IMAGE_MAX_BYTES },
  });
  assert.equal(await prepareImageForSafety('safe.jpg'), 'safe.jpg');
  assert.deepEqual(compressions, []);
});

test('resizes a large landscape image without changing its aspect ratio', async () => {
  const compressions = installWxMock({
    dimensions: { height: 2000, width: 3000 },
    sizes: { 'large.jpg': 4 * 1024 * 1024, 'compressed-1.jpg': 500 * 1024 },
  });
  assert.equal(await prepareImageForSafety('large.jpg'), 'compressed-1.jpg');
  assert.deepEqual(compressions, [
    { height: 500, output: 'compressed-1.jpg', quality: 65, src: 'large.jpg', width: 750 },
  ]);
});

test('uses a second lower-quality pass and still rejects oversized output', async () => {
  const compressions = installWxMock({
    dimensions: { height: 1000, width: 700 },
    sizes: {
      'huge.jpg': 3 * 1024 * 1024,
      'compressed-1.jpg': 2 * 1024 * 1024,
      'compressed-2.jpg': SAFETY_IMAGE_MAX_BYTES + 1,
    },
  });
  await assert.rejects(prepareImageForSafety('huge.jpg'), /照片压缩后仍然过大/u);
  assert.deepEqual(
    compressions.map(({ quality }) => quality),
    [65, 35],
  );
});
