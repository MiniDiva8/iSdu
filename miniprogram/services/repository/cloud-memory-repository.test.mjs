import assert from 'node:assert/strict';
import test from 'node:test';

import { CloudMemoryRepository, CloudMemoryRepositoryError } from './cloud-memory-repository.ts';

function createClient(result) {
  const calls = [];
  return {
    calls,
    call: async (...args) => {
      calls.push(args);
      return result;
    },
  };
}

const item = {
  category: 'campus-life',
  customCategory: '',
  customMood: '',
  hasImage: true,
  id: 'memory-shared',
  likeCount: 3,
  mapAssetVersion: 'campus-map-v3',
  mapXRatio: 0.4,
  mapYRatio: 0.6,
  mood: 'happy',
  ownerDisplayName: '好友甲',
  ownerUserId: 'usr_friend',
  placeName: '图书馆',
  publishedAt: '2026-08-15T08:00:00.000Z',
  recordedAt: '2026-08-14T08:00:00.000Z',
  summary: '一起看晚霞',
  thumbnailUrl: 'https://temp.invalid/thumbnail',
};

test('requests one authorized friend timeline page with the current cursor', async () => {
  const response = {
    data: {
      items: [item],
      nextCursor: { id: item.id, publishedAt: item.publishedAt },
    },
    ok: true,
    requestId: 'req-1',
  };
  const client = createClient(response);
  const repository = new CloudMemoryRepository(client);
  const page = await repository.listFriendTimeline(null);
  assert.deepEqual(client.calls, [['memory-api', 'listFriendTimeline', { cursor: null }]]);
  assert.equal(page.items[0].ownerDisplayName, '好友甲');
  assert.deepEqual(page.nextCursor, response.data.nextCursor);
});

test('rejects malformed friend timeline coordinates and counts', async () => {
  const client = createClient({
    data: { items: [{ ...item, likeCount: -1, mapXRatio: 2 }], nextCursor: null },
    ok: true,
    requestId: 'req-2',
  });
  const repository = new CloudMemoryRepository(client);
  await assert.rejects(repository.listFriendTimeline(), /好友时光条目格式无效/u);
});

test('keeps friend timeline authorization errors typed', async () => {
  const client = createClient({
    code: 'PROFILE_REQUIRED',
    message: '请先开启云端身份',
    ok: false,
    requestId: 'req-3',
  });
  const repository = new CloudMemoryRepository(client);
  await assert.rejects(repository.listFriendTimeline(), (error) => {
    assert.equal(error instanceof CloudMemoryRepositoryError, true);
    assert.equal(error.code, 'PROFILE_REQUIRED');
    return true;
  });
});

const ownedMemory = (visibility = 'private') => ({
  id: 'existing-record',
  text: '已有的校园记录',
  imagePaths: [],
  imageIds: [],
  category: 'campus-life',
  customCategory: '',
  mood: 'happy',
  customMood: '',
  mapAssetVersion: 'campus-map-v3',
  mapXRatio: 0.5,
  mapYRatio: 0.5,
  placeName: '',
  recordedAt: '2026-08-15T08:00:00.000Z',
  createdAt: '2026-08-15T08:00:00.000Z',
  updatedAt: '2026-08-15T08:00:00.000Z',
  origin: 'user',
  canEdit: true,
  likedByMe: false,
  likeCount: 0,
  ownerUserId: 'usr_self',
  ownerDisplayName: '自己',
  publishedAt: null,
  selectedFriendIds: [],
  visibility,
});
test('existing cloud lists containing public records remain readable in the diary client', async () => {
  const client = createClient({
    ok: true,
    requestId: 'compat-list',
    data: {
      memories: [ownedMemory(), { ...ownedMemory('public'), id: 'existing-public' }],
    },
  });
  const memories = await new CloudMemoryRepository(client).listMemories();
  assert.deepEqual(
    memories.map((x) => x.visibility),
    ['private', 'public'],
  );
});
test('unknown cloud visibility values are rejected instead of being downgraded', async () => {
  const client = createClient({
    ok: true,
    requestId: 'compat-unknown',
    data: {
      memories: [ownedMemory('unexpected-scope')],
    },
  });
  await assert.rejects(new CloudMemoryRepository(client).listMemories(), /可见范围无效/);
});

function imageEditingFixture() {
  let current = {
    ...ownedMemory(),
    imagePaths: ['https://temp.invalid/original'],
    imageIds: ['image-original'],
  };
  const calls = [];
  const repository = new CloudMemoryRepository(
    {
      async call(_name, action, input) {
        calls.push({ action, input });
        if (action === 'createImageUploadPlan') throw new Error('unexpected image upload');
        return {
          ok: true,
          requestId: 'image-edit',
          data: action === 'listMine' ? { memories: [current] } : { memory: current },
        };
      },
    },
    { uploadPlannedFiles: async () => assert.fail('existing photos must not be uploaded') },
  );
  return { repository, calls, setCurrent: (memory) => (current = memory) };
}

test('an editor keeps existing image IDs across repeated signed URL refreshes', async () => {
  const h = imageEditingFixture();
  const editing = await h.repository.getMemoryById('existing-record');
  for (let refresh = 0; refresh < 12; refresh++) {
    h.setCurrent({ ...editing, imagePaths: [`https://temp.invalid/refresh-${refresh}`] });
    await h.repository.listMemories();
  }
  await h.repository.updateMemory(editing.id, { ...editing, text: '修改正文，保留照片' });
  assert.deepEqual(h.calls.at(-1).input.keepImageIds, ['image-original']);
  assert.deepEqual(h.calls.at(-1).input.uploaded, []);
});

test('a list snapshot can still retain its current image when no editor was loaded', async () => {
  const h = imageEditingFixture();
  const [memory] = await h.repository.listMemories();
  await h.repository.updateMemory(memory.id, { ...memory, text: '从当前快照编辑' });
  assert.deepEqual(h.calls.at(-1).input.keepImageIds, ['image-original']);
});

test('an editor image alias cannot retain a photo removed by the latest server snapshot', async () => {
  const h = imageEditingFixture();
  const editing = await h.repository.getMemoryById('existing-record');
  h.setCurrent({ ...editing, imagePaths: [], imageIds: [] });
  await h.repository.listMemories();
  await assert.rejects(h.repository.updateMemory(editing.id, editing), /unexpected image upload/);
  assert.equal(h.calls.at(-1).action, 'createImageUploadPlan');
});

test('deleting or clearing records also clears editor image aliases', async () => {
  for (const clear of [false, true]) {
    const h = imageEditingFixture();
    const editing = await h.repository.getMemoryById('existing-record');
    if (clear) await h.repository.clearMemories();
    else await h.repository.deleteMemory(editing.id);
    await assert.rejects(h.repository.updateMemory(editing.id, editing), /unexpected image upload/);
  }
});

test('a stale list reply cannot replace image mappings from a newer saved memory', async () => {
  const h = imageEditingFixture();
  const old = await h.repository.getMemoryById('existing-record');
  const saved = {
    ...old,
    imagePaths: ['https://temp.invalid/new-photo'],
    imageIds: ['image-new'],
    updatedAt: '2026-08-15T09:00:00.000Z',
  };
  h.setCurrent(saved);
  await h.repository.getMemoryById(saved.id);
  h.setCurrent(old);
  await h.repository.listMemories();
  h.setCurrent(saved);
  await h.repository.updateMemory(saved.id, { ...saved, text: '继续编辑已保存版本' });
  assert.deepEqual(h.calls.at(-1).input.keepImageIds, ['image-new']);
});
