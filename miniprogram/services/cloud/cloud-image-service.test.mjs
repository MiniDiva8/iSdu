import assert from 'node:assert/strict';
import test from 'node:test';
import { CloudImageService } from './cloud-image-service.ts';
test('cloud upload uses the compressed local image required by the existing server', async () => {
  const uploads = [];
  globalThis.wx = {
    cloud: {
      init() {},
      async uploadFile(value) {
        uploads.push(value);
        return { fileID: 'cloud://fixture/file' };
      },
    },
    getImageInfo(options) {
      options.success({ width: 3000, height: 2000 });
    },
    getFileSystemManager() {
      return {
        getFileInfo(options) {
          options.success({
            size: options.filePath === 'original.jpg' ? 4 * 1024 * 1024 : 400 * 1024,
          });
        },
      };
    },
    compressImage(options) {
      options.success({ tempFilePath: 'compressed.jpg' });
    },
  };
  const result = await new CloudImageService().uploadPlannedFiles(
    {
      planId: 'plan-fixture',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      files: [{ cloudPath: 'fixtures/photo.jpg', imageId: 'img-fixture' }],
    },
    ['original.jpg'],
  );
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].filePath, 'compressed.jpg');
  assert.deepEqual(result, [{ fileId: 'cloud://fixture/file', imageId: 'img-fixture' }]);
});
