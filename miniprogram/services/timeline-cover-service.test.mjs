import assert from 'node:assert/strict';
import test from 'node:test';
import { TimelineCoverService, TIMELINE_COVER_STORAGE_KEY } from './timeline-cover-service.ts';

const root = 'wxfile://usr/sdu-memory/timeline-cover';

function fixture() {
  const values = new Map();
  const images = new Map();
  const storage = {
    has: (key) => values.has(key),
    read: (key) => values.get(key),
    write: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  };
  const files = {
    ensureDirectory: async () => undefined,
    saveFile: async (source, destination) => images.set(destination, source),
    removeFile: async (path) => images.delete(path),
    removeDirectory: async (directory) => {
      for (const path of images.keys()) {
        if (path.startsWith(`${directory}/`)) images.delete(path);
      }
    },
  };
  const service = new TimelineCoverService(storage, files, 'wxfile://usr');
  return { values, images, storage, files, service };
}

test('a new device uses the default cover without writing any setting', async () => {
  const { service, values, images } = fixture();
  assert.equal(await service.getCover(), '');
  assert.equal(values.size, 0);
  assert.equal(images.size, 0);
});

test('a saved cover survives a fresh service and uses a permanent managed image', async () => {
  const { service, storage, files, images } = fixture();
  const saved = await service.saveCover('wxfile://tmp/landscape.png');
  assert.match(saved, /^wxfile:\/\/usr\/sdu-memory\/timeline-cover\/[A-Za-z0-9._-]+\.png$/u);
  assert.equal(images.get(saved), 'wxfile://tmp/landscape.png');
  const reopened = new TimelineCoverService(storage, files, 'wxfile://usr');
  assert.equal(await reopened.getCover(), saved);
});

test('replacing the cover removes the old image only after the new setting is committed', async () => {
  const { service, storage, images, files } = fixture();
  const first = await service.saveCover('wxfile://tmp/first.jpg');
  const remove = files.removeFile;
  files.removeFile = async (path) => {
    assert.notEqual(JSON.parse(storage.read(TIMELINE_COVER_STORAGE_KEY)).imagePath, path);
    await remove(path);
  };
  const second = await service.saveCover('wxfile://tmp/second.jpg');
  assert.notEqual(first, second);
  assert.equal(await service.getCover(), second);
  assert.equal(images.has(first), false);
  assert.equal(images.has(second), true);
});

test('file-write failure keeps the previous cover and setting', async () => {
  const { service, files, images } = fixture();
  const first = await service.saveCover('wxfile://tmp/first.jpg');
  files.saveFile = async () => {
    throw new Error('disk full');
  };
  await assert.rejects(service.saveCover('wxfile://tmp/second.jpg'), /保存.*失败/u);
  assert.equal(await service.getCover(), first);
  assert.deepEqual([...images.keys()], [first]);
});

test('metadata-write failure rolls back the new image without removing the previous cover', async () => {
  const { service, storage, images } = fixture();
  const first = await service.saveCover('wxfile://tmp/first.jpg');
  storage.write = () => {
    throw new Error('storage full');
  };
  await assert.rejects(service.saveCover('wxfile://tmp/second.jpg'), /保存.*失败/u);
  assert.equal(await service.getCover(), first);
  assert.deepEqual([...images.keys()], [first]);
});

test('cleanup failure after a replacement does not turn a successful save into a failure', async () => {
  const { service, files } = fixture();
  await service.saveCover('wxfile://tmp/first.jpg');
  files.removeFile = async () => {
    throw new Error('busy');
  };
  const second = await service.saveCover('wxfile://tmp/second.jpg');
  assert.equal(await service.getCover(), second);
});

test('corrupt metadata reports a recoverable error and can be replaced', async () => {
  const { service, values } = fixture();
  values.set(TIMELINE_COVER_STORAGE_KEY, '{broken');
  await assert.rejects(service.getCover(), /封面.*损坏/u);
  const saved = await service.saveCover('wxfile://tmp/new.jpg');
  assert.equal(await service.getCover(), saved);
});

test('an unsafe saved path is never displayed or used to remove an unrelated file', async () => {
  const { service, values, images } = fixture();
  for (const path of [
    'wxfile://usr/diary.jpg',
    `${root}/../diary.jpg`,
    `${root}/nested/photo.jpg`,
  ]) {
    values.set(TIMELINE_COVER_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, imagePath: path }));
    await assert.rejects(service.getCover(), /封面.*损坏/u);
  }
  images.set('wxfile://usr/diary.jpg', 'protected memory');
  await service.saveCover('wxfile://tmp/new.jpg');
  assert.equal(images.get('wxfile://usr/diary.jpg'), 'protected memory');
});

test('a storage-read failure does not replace a cover whose old value cannot be read', async () => {
  const { service, storage, images } = fixture();
  const first = await service.saveCover('wxfile://tmp/first.jpg');
  storage.read = () => {
    throw new Error('unavailable');
  };
  await assert.rejects(service.saveCover('wxfile://tmp/second.jpg'), /读取.*失败/u);
  assert.deepEqual([...images.keys()], [first]);
});

test('restore default clears the setting and all cover files but leaves memory photos intact', async () => {
  const { service, images, values } = fixture();
  await service.saveCover('wxfile://tmp/first.jpg');
  images.set(`${root}/orphan.jpg`, 'old cover');
  images.set('wxfile://usr/sdu-memory/images/memory-001/photo.jpg', 'memory');
  await service.clearCover();
  assert.equal(await service.getCover(), '');
  assert.equal(values.has(TIMELINE_COVER_STORAGE_KEY), false);
  assert.deepEqual([...images.keys()], ['wxfile://usr/sdu-memory/images/memory-001/photo.jpg']);
});

test('failed setting removal keeps the previous cover image intact', async () => {
  const { service, storage, images } = fixture();
  const first = await service.saveCover('wxfile://tmp/first.jpg');
  storage.remove = () => {
    throw new Error('storage failed');
  };
  await assert.rejects(service.clearCover(), /恢复.*失败/u);
  assert.equal(await service.getCover(), first);
  assert.equal(images.has(first), true);
});

test('failed directory cleanup reports partial cleanup while the saved appearance is already default', async () => {
  const { service, files } = fixture();
  await service.saveCover('wxfile://tmp/first.jpg');
  files.removeDirectory = async () => {
    throw new Error('busy');
  };
  await assert.rejects(service.clearCover(), /已恢复默认.*清理/u);
  assert.equal(await service.getCover(), '');
});

test('empty or traversing temporary paths cannot replace an existing cover', async () => {
  const { service, images } = fixture();
  const first = await service.saveCover('wxfile://tmp/first.jpg');
  for (const path of ['', '  ', 'wxfile://tmp/../secret.jpg']) {
    await assert.rejects(service.saveCover(path));
  }
  assert.equal(await service.getCover(), first);
  assert.equal(images.size, 1);
});

test('a clear requested during a slow save cannot be undone by that save', async () => {
  const { service, files, images, values } = fixture();
  let releaseSave;
  let notifyStarted;
  const started = new Promise((resolve) => {
    notifyStarted = resolve;
  });
  const originalSave = files.saveFile;
  files.saveFile = async (source, destination) => {
    notifyStarted();
    await new Promise((resolve) => {
      releaseSave = resolve;
    });
    await originalSave(source, destination);
  };
  const saving = service.saveCover('wxfile://tmp/pending.jpg');
  await started;
  const clearing = service.clearCover();
  releaseSave();
  await Promise.all([saving, clearing]);
  assert.equal(await service.getCover(), '');
  assert.equal(values.has(TIMELINE_COVER_STORAGE_KEY), false);
  assert.equal(images.size, 0);
});

test('concurrent replacements commit in request order and leave only the final cover image', async () => {
  const { service, images } = fixture();
  const [first, second] = await Promise.all([
    service.saveCover('wxfile://tmp/first.jpg'),
    service.saveCover('wxfile://tmp/second.jpg'),
  ]);
  assert.notEqual(first, second);
  assert.equal(await service.getCover(), second);
  assert.deepEqual([...images.keys()], [second]);
});

test('a failed queued operation cannot block a later save or clear', async () => {
  const { service } = fixture();
  await assert.rejects(service.saveCover(''));
  const saved = await service.saveCover('wxfile://tmp/retry.jpg');
  assert.equal(await service.getCover(), saved);
  await service.clearCover();
  assert.equal(await service.getCover(), '');
});
