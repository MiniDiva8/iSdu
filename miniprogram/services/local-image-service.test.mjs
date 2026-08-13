import assert from 'node:assert/strict';
import test from 'node:test';

import { LocalImageService, LocalImageServiceError } from './local-image-service.ts';

const USER_DATA_PATH = 'wxfile://usr';

class FakeFileSystemAdapter {
  directories = [];
  failRemovePaths = new Set();
  failSaveAttempt = null;
  removeCalls = [];
  saveAttempts = 0;
  saveCalls = [];
  savedPaths = new Set();

  async ensureDirectory(directoryPath) {
    this.directories.push(directoryPath);
  }

  async removeFile(filePath) {
    this.removeCalls.push(filePath);

    if (this.failRemovePaths.has(filePath)) {
      throw new Error('remove failed');
    }

    this.savedPaths.delete(filePath);
  }

  async saveFile(tempFilePath, destinationPath) {
    this.saveAttempts += 1;
    this.saveCalls.push({ destinationPath, tempFilePath });

    if (this.failSaveAttempt === this.saveAttempts) {
      throw new Error('save failed');
    }

    this.savedPaths.add(destinationPath);
  }
}

function createService(adapter) {
  return new LocalImageService({
    adapter,
    createFileName: ({ index, tempFilePath }) => {
      const extension = tempFilePath.endsWith('.png') ? 'png' : 'jpg';
      return `photo-${index + 1}.${extension}`;
    },
    userDataPath: USER_DATA_PATH,
  });
}

test('persists one to three images inside the memory managed directory', async () => {
  const adapter = new FakeFileSystemAdapter();
  const service = createService(adapter);

  const result = await service.persistTempImages('memory-001', [
    'wxfile://tmp/one.jpg',
    'wxfile://tmp/two.png',
    'wxfile://tmp/three.jpg',
  ]);

  assert.deepEqual(adapter.directories, ['wxfile://usr/sdu-memory/images/memory-001']);
  assert.deepEqual(result, [
    'wxfile://usr/sdu-memory/images/memory-001/photo-1.jpg',
    'wxfile://usr/sdu-memory/images/memory-001/photo-2.png',
    'wxfile://usr/sdu-memory/images/memory-001/photo-3.jpg',
  ]);
  assert.equal(
    result.every((filePath) => service.isManagedImagePath(filePath)),
    true,
  );
});

test('rejects invalid counts, duplicate temporary paths, and unsafe memory ids', async () => {
  const adapter = new FakeFileSystemAdapter();
  const service = createService(adapter);

  await assert.rejects(
    service.persistTempImages('memory-001', []),
    (error) => error instanceof LocalImageServiceError && error.code === 'INVALID_IMAGE_COUNT',
  );
  await assert.rejects(
    service.persistTempImages('memory-001', [
      'wxfile://tmp/1.jpg',
      'wxfile://tmp/2.jpg',
      'wxfile://tmp/3.jpg',
      'wxfile://tmp/4.jpg',
    ]),
    (error) => error instanceof LocalImageServiceError && error.code === 'INVALID_IMAGE_COUNT',
  );
  await assert.rejects(
    service.persistTempImages('memory-001', ['wxfile://tmp/1.jpg', 'wxfile://tmp/1.jpg']),
    (error) => error instanceof LocalImageServiceError && error.code === 'INVALID_TEMP_FILE_PATH',
  );
  await assert.rejects(
    service.persistTempImages('../outside', ['wxfile://tmp/1.jpg']),
    (error) => error instanceof LocalImageServiceError && error.code === 'INVALID_MEMORY_ID',
  );
  assert.equal(adapter.saveCalls.length, 0);
});

test('rolls back every previously saved image when a later save fails', async () => {
  const adapter = new FakeFileSystemAdapter();
  adapter.failSaveAttempt = 2;
  const service = createService(adapter);

  await assert.rejects(
    service.persistTempImages('memory-002', [
      'wxfile://tmp/first.jpg',
      'wxfile://tmp/second.jpg',
      'wxfile://tmp/third.jpg',
    ]),
    (error) => error instanceof LocalImageServiceError && error.code === 'SAVE_FAILED',
  );

  assert.deepEqual(adapter.removeCalls, ['wxfile://usr/sdu-memory/images/memory-002/photo-1.jpg']);
  assert.equal(adapter.savedPaths.size, 0);
});

test('reports rollback paths that could not be removed after a partial failure', async () => {
  const adapter = new FakeFileSystemAdapter();
  const failedRollbackPath = 'wxfile://usr/sdu-memory/images/memory-003/photo-1.jpg';
  adapter.failSaveAttempt = 2;
  adapter.failRemovePaths.add(failedRollbackPath);
  const service = createService(adapter);

  await assert.rejects(
    service.persistTempImages('memory-003', ['wxfile://tmp/first.jpg', 'wxfile://tmp/second.jpg']),
    (error) => {
      assert.ok(error instanceof LocalImageServiceError);
      assert.equal(error.code, 'SAVE_FAILED');
      assert.deepEqual(error.failedPaths, [failedRollbackPath]);
      return true;
    },
  );
});

test('cleanup removes only managed files and reports refused or failed paths', async () => {
  const adapter = new FakeFileSystemAdapter();
  const service = createService(adapter);
  const removablePath = 'wxfile://usr/sdu-memory/images/memory-004/photo-1.jpg';
  const failedManagedPath = 'wxfile://usr/sdu-memory/images/memory-004/photo-2.jpg';
  const outsidePath = 'wxfile://usr/other-app/private.jpg';
  const traversalPath = 'wxfile://usr/sdu-memory/images/memory-004/../../private.jpg';

  adapter.savedPaths.add(removablePath);
  adapter.savedPaths.add(failedManagedPath);
  adapter.failRemovePaths.add(failedManagedPath);

  const result = await service.cleanupManagedImages([
    removablePath,
    failedManagedPath,
    outsidePath,
    traversalPath,
    removablePath,
  ]);

  assert.deepEqual(adapter.removeCalls, [removablePath, failedManagedPath]);
  assert.deepEqual(result.removedPaths, [removablePath]);
  assert.deepEqual(result.failedPaths, [failedManagedPath, outsidePath, traversalPath]);
});
