import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { palAIRepository } from '../miniprogram/services/repository/pal-ai-repository.ts';
import { companionService } from '../miniprogram/services/companion-service.ts';
import { cloudModeService } from '../miniprogram/services/cloud/cloud-mode-service.ts';
import { memoryRepository } from '../miniprogram/services/repository/index.ts';
import {
  createCompanionState,
  applyCompanionCommand,
} from '../miniprogram/utils/companion-engine.ts';
import { EMPTY_COMPANION_FACTS } from '../miniprogram/models/companion.ts';
import { openCompanionSection } from '../miniprogram/services/companion-page.ts';
const defs = new Map();
let currentName = '',
  confirm = false,
  mode,
  state,
  status,
  sent,
  letterSent,
  enabled,
  cleared,
  commands,
  navigation,
  modalContents;
globalThis.Page = (definition) => defs.set(currentName, definition);
globalThis.wx = {
  env: { USER_DATA_PATH: 'wxfile://usr' },
  getWindowInfo: () => ({ statusBarHeight: 24, windowWidth: 390, windowHeight: 844 }),
  getMenuButtonBoundingClientRect: () => ({ bottom: 72 }),
  getStorageInfoSync: () => ({ keys: [] }),
  getStorageSync: () => '',
  navigateTo: (o) => navigation.push(o.url),
  navigateBack() {},
  switchTab() {},
  vibrateShort() {},
  showToast() {},
  showModal: (o) => {
    modalContents.push(o.content);
    o.success({ confirm });
  },
};
for (const name of ['chat', 'mail']) {
  currentName = name;
  await import('../miniprogram/pages/companion/' + name + '/index.ts');
}
const page = (name) => {
  const def = defs.get(name);
  return {
    ...def,
    data: structuredClone(def.data),
    setData(value, cb) {
      Object.assign(this.data, value);
      cb?.();
    },
  };
};
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const aiReply = {
  id: 'r_0123456789012345',
  type: 'chat',
  title: '',
  text: '休息一下也很好。',
  action: 'rest',
  date: '2026-10-29',
  partnerId: 'sprout',
  partnerName: '途途',
};
beforeEach(() => {
  mode = { mode: 'cloud', activatedAt: '2026-10-29T08:00:00Z' };
  confirm = false;
  state = applyCompanionCommand(
    createCompanionState('2026-10-29T08:00:00Z'),
    { type: 'adopt', name: '途途' },
    EMPTY_COMPANION_FACTS,
    '2026-10-29T08:00:00Z',
    () => 0,
  ).state;
  status = {
    enabled: true,
    available: true,
    paused: false,
    reason: '',
    chatsRemaining: 3,
    lettersRemaining: 2,
    history: [],
    letters: [],
  };
  sent = [];
  letterSent = [];
  enabled = 0;
  cleared = 0;
  commands = [];
  navigation = [];
  modalContents = [];
  cloudModeService.getState = () => structuredClone(mode);
  companionService.read = () => structuredClone(state);
  companionService.facts = async () => ({ ...EMPTY_COMPANION_FACTS, totalEntries: 1 });
  companionService.cloudWasUsed = () => false;
  companionService.dispatch = async (command) => {
    commands.push(command);
    const result = applyCompanionCommand(
      state,
      command,
      EMPTY_COMPANION_FACTS,
      '2026-10-29T08:00:00Z',
      () => 0,
    );
    state = result.state;
    return result;
  };
  palAIRepository.status = async () => structuredClone(status);
  palAIRepository.enable = async () => {
    enabled++;
    status.enabled = true;
  };
  palAIRepository.chat = async (payload) => {
    sent.push(payload);
    status.history = [
      { role: 'user', content: payload.text },
      { role: 'assistant', content: aiReply.text },
    ];
    status.chatsRemaining--;
    return { state: 'completed', reply: aiReply };
  };
  palAIRepository.letter = async (payload) => {
    letterSent.push(payload);
    return {
      state: 'completed',
      reply: {
        ...aiReply,
        id: 'l_0123456789',
        type: 'letter',
        title: '给今天的你',
        sourceMemoryId: payload.memoryId,
        read: false,
      },
    };
  };
  palAIRepository.clear = async () => {
    cleared++;
    status.enabled = false;
    status.history = [];
    status.letters = [];
  };
  palAIRepository.readLetter = async () => {};
  palAIRepository.deleteLetter = async () => {};
  memoryRepository.listMemories = async () => [
    {
      id: 'memory_1',
      origin: 'user',
      text: '今天在图书馆复习，有一点累。',
      mood: 'tired',
      recordedAt: '2026-10-29T08:00:00Z',
      imagePaths: ['private-file'],
    },
  ];
});

test('local mode does not open AI but ordinary touching still updates the original Pal engine', async () => {
  mode.mode = 'local';
  const p = page('chat');
  await p.onShow();
  await p.greet();
  assert.equal(commands[0].type, 'interact');
  assert.equal(state.events.play.length, 1);
  assert.equal(sent.length, 0);
  p.onInput({ detail: { value: '你好' } });
  await p.sendMessage();
  assert.equal(sent.length, 0);
});

test('consent cancellation never enables AI or sends text', async () => {
  status.enabled = false;
  const p = page('chat');
  await p.onShow();
  await p.enableAI();
  assert.equal(enabled, 0);
  assert.equal(sent.length, 0);
});

test('explicit consent enables AI and simple chat clears input only on confirmed success', async () => {
  status.enabled = false;
  confirm = true;
  const p = page('chat');
  await p.onShow();
  await p.enableAI();
  p.onInput({ detail: { value: '你好' } });
  await p.sendMessage();
  assert.equal(enabled, 1);
  assert.equal(sent.length, 1);
  assert.equal(p.data.input, '');
  assert.equal(p.data.messages.at(-1).content, '休息一下也很好。');
});

test('exhausted budget blocks paid chat while ordinary interaction remains usable', async () => {
  status.available = false;
  status.paused = true;
  status.reason = 'AI_BUDGET_EXHAUSTED';
  const p = page('chat');
  await p.onShow();
  p.onInput({ detail: { value: '你好' } });
  await p.sendMessage();
  await p.greet();
  assert.equal(sent.length, 0);
  assert.equal(commands[0].type, 'interact');
});

test('network retry queries the original request and double click never creates a second generation', async () => {
  const hold = deferred();
  const queried = [];
  palAIRepository.chat = async (payload) => {
    sent.push(payload);
    return hold.promise;
  };
  const p = page('chat');
  await p.onShow();
  p.onInput({ detail: { value: '你好' } });
  const first = p.sendMessage();
  await p.sendMessage();
  assert.equal(sent.length, 1);
  hold.resolve({ state: 'pending', code: 'AI_UNCERTAIN' });
  await first;
  palAIRepository.result = async (requestId) => {
    queried.push(requestId);
    throw Error('network');
  };
  await p.sendMessage();
  assert.equal(sent.length, 1);
  assert.deepEqual(queried, [sent[0].requestId]);
  assert.equal(p.data.input, '你好');
});

test('late response after hide does not clear input or display stale conversation', async () => {
  const hold = deferred();
  palAIRepository.chat = async (payload) => {
    sent.push(payload);
    return hold.promise;
  };
  const p = page('chat');
  await p.onShow();
  p.onInput({ detail: { value: '你好' } });
  const request = p.sendMessage();
  p.onHide();
  hold.resolve({ state: 'completed', reply: aiReply });
  await request;
  assert.equal(p.data.input, '你好');
  assert.equal(p.data.messages.length, 0);
});

test('disabling and clearing AI does not change the Pal save or remove diaries', async () => {
  confirm = true;
  const p = page('chat');
  await p.onShow();
  const before = structuredClone(state);
  await p.disableAI();
  assert.equal(cleared, 1);
  assert.deepEqual(state, before);
  assert.equal(p.data.status.enabled, false);
});

test('mail previews diary text and cancellation never enables or requests AI', async () => {
  const p = page('mail');
  await p.onShow();
  await p.reloadAI();
  await p.requestAILetter();
  assert.equal(letterSent.length, 0);
  assert.equal(
    modalContents.some((text) => text.includes('图书馆') && text.includes('OpenAI')),
    true,
  );
});

test('mail sends explicit bounded consent snapshot without photos or unbounded diary body', async () => {
  confirm = true;
  const p = page('mail');
  await p.onShow();
  await p.reloadAI();
  await p.requestAILetter();
  assert.equal(letterSent.length, 1);
  assert.equal(letterSent[0].memoryId, 'memory_1');
  assert.equal(letterSent[0].diaryConsent, true);
  assert.equal('text' in letterSent[0], false);
  assert.equal('imagePaths' in letterSent[0], false);
  assert.equal(letterSent[0].confirmedExcerpt, '今天在图书馆复习，有一点累。');
  assert.equal(letterSent[0].confirmedMood, 'tired');
});

test('closing the mail page while consent dialog is pending sends nothing', async () => {
  let modal;
  wx.showModal = (o) => {
    modal = o;
  };
  const p = page('mail');
  await p.onShow();
  await p.reloadAI();
  const request = p.requestAILetter();
  await new Promise((resolve) => setImmediate(resolve));
  p.onHide();
  modal.success({ confirm: true });
  await request;
  assert.equal(letterSent.length, 0);
  wx.showModal = (o) => {
    modalContents.push(o.content);
    o.success({ confirm });
  };
});

test('AI unavailability leaves all original template letters readable', async () => {
  palAIRepository.status = async () => {
    throw Error('not deployed');
  };
  const p = page('mail');
  await p.onShow();
  await p.reloadAI();
  assert.equal(p.data.letters.length >= 1, true);
  assert.equal(letterSent.length, 0);
  await p.openLetter({ currentTarget: { dataset: { id: 'hello' } } });
  assert.equal(p.data.activeLetter.id, 'hello');
});

test('chat route uses the existing companion subpackage', () => {
  openCompanionSection('chat');
  assert.equal(navigation.at(-1), '/pages/companion/chat/index');
});

test('changing cloud identity scope clears unsent input before reopening chat', async () => {
  const p = page('chat');
  await p.onShow();
  p.onInput({ detail: { value: '上一段身份的草稿' } });
  p.onHide();
  mode = { mode: 'cloud', activatedAt: '2026-10-29T09:00:00Z' };
  await p.onShow();
  assert.equal(p.data.input, '');
});

test('pending chat result can be queried after the final daily and global quota are consumed', async () => {
  let queries = 0;
  palAIRepository.chat = async (payload) => {
    sent.push(payload);
    status.chatsRemaining = 0;
    status.available = false;
    status.paused = true;
    return { state: 'pending', code: 'AI_UNCERTAIN' };
  };
  palAIRepository.result = async () => {
    queries++;
    status.history = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: aiReply.text },
    ];
    return { state: 'completed', reply: aiReply };
  };
  const p = page('chat');
  await p.onShow();
  p.onInput({ detail: { value: '你好' } });
  await p.sendMessage();
  await p.sendMessage();
  assert.equal(sent.length, 1);
  assert.equal(queries, 1);
  assert.equal(p.data.input, '');
});

test('terminal letter failure allows a new id only after another explicit diary confirmation', async () => {
  confirm = true;
  palAIRepository.letter = async (payload) => {
    letterSent.push(payload);
    throw Object.assign(new Error('moderation unavailable'), { code: 'AI_MODERATION_UNAVAILABLE' });
  };
  const p = page('mail');
  await p.onShow();
  await p.reloadAI();
  await p.requestAILetter();
  assert.equal(letterSent.length, 1);
  await p.requestAILetter();
  assert.equal(letterSent.length, 2);
  assert.notEqual(letterSent[0].requestId, letterSent[1].requestId);
});

test('unknown letter result is queried without a second confirmation or generation even at zero quota', async () => {
  confirm = true;
  let queries = 0;
  palAIRepository.letter = async (payload) => {
    letterSent.push(payload);
    status.lettersRemaining = 0;
    status.available = false;
    status.paused = true;
    throw Error('network');
  };
  palAIRepository.result = async () => {
    queries++;
    return { state: 'failed', code: 'AI_UNCERTAIN' };
  };
  const p = page('mail');
  await p.onShow();
  await p.reloadAI();
  await p.requestAILetter();
  const dialogs = modalContents.length;
  await p.requestAILetter();
  assert.equal(letterSent.length, 1);
  assert.equal(queries, 1);
  assert.equal(modalContents.length, dialogs);
});

test('closing an AI letter resets its sender before opening an ordinary template letter', async () => {
  status.letters = [
    {
      ...aiReply,
      id: 'l_0123456789',
      type: 'letter',
      title: '给今天的你',
      partnerName: '邮邮',
      sourceMemoryId: 'memory_1',
      read: false,
    },
  ];
  const p = page('mail');
  await p.onShow();
  await p.reloadAI();
  await p.openAILetter({ currentTarget: { dataset: { id: 'l_0123456789' } } });
  p.closeLetter();
  await p.openLetter({ currentTarget: { dataset: { id: 'hello' } } });
  assert.equal(p.data.activeAIName, '');
});
