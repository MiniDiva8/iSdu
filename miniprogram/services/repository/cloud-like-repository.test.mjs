import assert from 'node:assert/strict';
import test from 'node:test';

import { CloudLikeRepository } from './cloud-like-repository.ts';

test('sends only memory id and desired like state', async () => {
  const calls = [];
  const repository = new CloudLikeRepository({
    async call(functionName, action, payload) {
      calls.push({ action, functionName, payload });
      return {
        data: { likeCount: 1, likedByMe: true },
        ok: true,
        requestId: 'req-like',
      };
    },
  });
  assert.deepEqual(await repository.setLiked('memory_1', true), {
    likeCount: 1,
    likedByMe: true,
  });
  assert.deepEqual(calls, [
    {
      action: 'setLike',
      functionName: 'memory-api',
      payload: { liked: true, memoryId: 'memory_1' },
    },
  ]);
});

test('rejects malformed like counts', async () => {
  const repository = new CloudLikeRepository({
    async call() {
      return { data: { likeCount: -1, likedByMe: true }, ok: true, requestId: 'req-like' };
    },
  });
  await assert.rejects(() => repository.setLiked('memory_1', true), /点赞状态格式无效/u);
});

test('keeps public authorization failures typed', async () => {
  const repository = new CloudLikeRepository({
    async call() {
      return {
        code: 'VIEW_FORBIDDEN',
        message: '这段好友回忆当前不可点赞',
        ok: false,
        requestId: 'req-denied',
      };
    },
  });
  await assert.rejects(
    () => repository.setLiked('memory_1', true),
    (error) => error.code === 'VIEW_FORBIDDEN' && error.requestId === 'req-denied',
  );
});
