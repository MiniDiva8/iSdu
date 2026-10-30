import assert from 'node:assert/strict';
import test from 'node:test';
import {
  JournalBackgroundService,
  JOURNAL_BACKGROUND_STORAGE_KEY,
} from './journal-background-service.ts';

const root = 'wxfile://usr/sdu-memory/journal-background';
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
      for (const path of images.keys()) if (path.startsWith(`${directory}/`)) images.delete(path);
    },
  };
  const service = new JournalBackgroundService(storage, files, 'wxfile://usr');
  return { values, images, storage, files, service };
}

test('default journal appearance does not create files or settings', async () => {
  const { service, values, images } = fixture();
  assert.deepEqual(await service.read(), { imagePath: '', clarity: 55 });
  assert.equal(values.size, 0);
  assert.equal(images.size, 0);
});

test('saved background and clarity survive reopening without changing timeline settings', async () => {
  const { service, values, images, storage, files } = fixture();
  values.set('sdu-memory:timeline-cover:v1', 'timeline cover');
  const saved = await service.saveImage('wxfile://tmp/photo.png');
  assert.match(
    saved.imagePath,
    /^wxfile:\/\/usr\/sdu-memory\/journal-background\/[A-Za-z0-9._-]+\.png$/u,
  );
  assert.equal(images.get(saved.imagePath), 'wxfile://tmp/photo.png');
  await service.setClarity(80);
  const reopened = new JournalBackgroundService(storage, files, 'wxfile://usr');
  assert.deepEqual(await reopened.read(), { imagePath: saved.imagePath, clarity: 80 });
  assert.equal(values.get('sdu-memory:timeline-cover:v1'), 'timeline cover');
});

test('replacement commits settings before removing its old image and retains clarity', async () => {
  const { service, files, images, values } = fixture();
  const first = await service.saveImage('wxfile://tmp/first.jpg');
  await service.setClarity(75);
  const remove = files.removeFile;
  files.removeFile = async (path) => {
    assert.notEqual(JSON.parse(values.get(JOURNAL_BACKGROUND_STORAGE_KEY)).imagePath, path);
    await remove(path);
  };
  const second = await service.saveImage('wxfile://tmp/second.jpg');
  assert.deepEqual(await service.read(), { imagePath: second.imagePath, clarity: 75 });
  assert.equal(images.has(first.imagePath), false);
  assert.equal(images.has(second.imagePath), true);
});

test('file and metadata failures preserve the previous image and settings', async () => {
  for (const mode of ['file', 'metadata']) {
    const { service, files, storage, images } = fixture();
    const first = await service.saveImage('wxfile://tmp/first.jpg');
    if (mode === 'file')
      files.saveFile = async () => {
        throw new Error('disk full');
      };
    else
      storage.write = () => {
        throw new Error('storage full');
      };
    await assert.rejects(service.saveImage('wxfile://tmp/second.jpg'), /保存.*失败/u);
    assert.deepEqual(await service.read(), first);
    assert.deepEqual([...images.keys()], [first.imagePath]);
  }
});

test('failed clarity updates preserve the saved appearance', async () => {
  const { service, storage } = fixture();
  const first = await service.saveImage('wxfile://tmp/first.jpg');
  for (const clarity of [0, 9, 101, NaN, Infinity, '50']) {
    await assert.rejects(service.setClarity(clarity));
    assert.deepEqual(await service.read(), first);
  }
  storage.write = () => {
    throw new Error('busy');
  };
  await assert.rejects(service.setClarity(90), /保存.*失败/u);
  assert.deepEqual(await service.read(), first);
});

test('corrupt or external stored paths cannot be displayed or delete unrelated photos', async () => {
  const { service, values, images } = fixture();
  const protectedPath = 'wxfile://usr/sdu-memory/images/entry/photo.jpg';
  images.set(protectedPath, 'diary');
  for (const raw of [
    '{broken',
    JSON.stringify({ schemaVersion: 1, imagePath: protectedPath, clarity: 55 }),
    JSON.stringify({ schemaVersion: 1, imagePath: `${root}/../private.jpg`, clarity: 55 }),
  ]) {
    values.set(JOURNAL_BACKGROUND_STORAGE_KEY, raw);
    await assert.rejects(service.read(), /损坏/u);
  }
  await service.saveImage('wxfile://tmp/recovery.jpg');
  assert.equal(images.get(protectedPath), 'diary');
});

test('unreadable storage and unsafe source paths cannot replace the old background', async () => {
  const { service, storage, images } = fixture();
  const first = await service.saveImage('wxfile://tmp/first.jpg');
  for (const path of [
    '',
    ' ',
    'wxfile://tmp/../private.jpg',
    'https://example.com/photo.jpg',
    'cloud://photo',
  ]) {
    await assert.rejects(service.saveImage(path));
    assert.deepEqual(await service.read(), first);
  }
  storage.read = () => {
    throw new Error('busy');
  };
  await assert.rejects(service.saveImage('wxfile://tmp/new.jpg'), /读取/u);
  assert.deepEqual([...images.keys()], [first.imagePath]);
});

test('restore default clears only journal background files and settings', async () => {
  const { service, values, images } = fixture();
  await service.saveImage('wxfile://tmp/first.jpg');
  await service.setClarity(100);
  images.set(`${root}/orphan.jpg`, 'old');
  images.set('wxfile://usr/sdu-memory/timeline-cover/cover.jpg', 'timeline');
  images.set('wxfile://usr/sdu-memory/images/entry/photo.jpg', 'diary');
  values.set('sdu-memory:timeline-cover:v1', 'cover');
  await service.clear();
  assert.deepEqual(await service.read(), { imagePath: '', clarity: 55 });
  assert.equal(values.has(JOURNAL_BACKGROUND_STORAGE_KEY), false);
  assert.equal(values.get('sdu-memory:timeline-cover:v1'), 'cover');
  assert.equal(images.size, 2);
});

test('failed setting removal retains the old background while failed cleanup reports partial success', async () => {
  const { service, storage, files, images } = fixture();
  const first = await service.saveImage('wxfile://tmp/first.jpg');
  const remove = storage.remove;
  storage.remove = () => {
    throw new Error('busy');
  };
  await assert.rejects(service.clear(), /恢复.*失败/u);
  assert.deepEqual(await service.read(), first);
  assert.equal(images.has(first.imagePath), true);
  storage.remove = remove;
  files.removeDirectory = async () => {
    throw new Error('busy');
  };
  await assert.rejects(service.clear(), /已恢复默认.*清理/u);
  assert.deepEqual(await service.read(), { imagePath: '', clarity: 55 });
});

test('queued save, clarity and clear mutations complete in request order', async () => {
  const { service, files, images } = fixture();
  let release;
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const save = files.saveFile;
  files.saveFile = async (source, destination) => {
    started();
    await new Promise((resolve) => {
      release = resolve;
    });
    await save(source, destination);
  };
  const saving = service.saveImage('wxfile://tmp/first.jpg');
  await ready;
  const clarity = service.setClarity(90);
  const clearing = service.clear();
  release();
  await Promise.all([saving, clarity, clearing]);
  assert.deepEqual(await service.read(), { imagePath: '', clarity: 55 });
  assert.equal(images.size, 0);
  await assert.rejects(service.saveImage(''));
  files.saveFile = save;
  assert.ok((await service.saveImage('wxfile://tmp/retry.jpg')).imagePath);
});
