import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { memoryRepository } from '../miniprogram/services/repository/index.ts';
import { cloudMemoryRepository } from '../miniprogram/services/repository/cloud-memory-repository.ts';
import { cloudModeService } from '../miniprogram/services/cloud/cloud-mode-service.ts';
import { companionMessage } from '../miniprogram/services/companion-page.ts';
import { WechatCloudFunctionClient } from '../miniprogram/services/cloud/cloud-function-client.ts';
const defs = new Map(),
  storage = new Map();
let name = '';
globalThis.Page = (definition) => defs.set(name, definition);
globalThis.wx = {
  getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  getStorageSync: (k) => storage.get(k) ?? '',
  setStorageSync: (k, v) => storage.set(k, v),
  removeStorageSync: (k) => storage.delete(k),
  getWindowInfo: () => ({ statusBarHeight: 24 }),
  stopPullDownRefresh: () => Promise.resolve(),
  cloud: { init() {}, callFunction: async () => ({ result: { ok: true } }) },
};
for (const key of ['journal', 'timeline']) {
  name = key;
  await import('../miniprogram/pages/' + key + '/index.ts');
}
const page = (key) => {
  const def = defs.get(key);
  return {
    ...def,
    data: structuredClone(def.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
};
const entry = (id = 'first') => ({
  id,
  text: '今天很好',
  imagePaths: [],
  placeName: '',
  mood: 'happy',
  customMood: '',
  category: 'study',
  customCategory: '',
  origin: 'user',
  mapAssetVersion: 'journal-unlocated-v1',
  mapXRatio: 0,
  mapYRatio: 0,
  createdAt: '2026-10-26T06:00:00Z',
  updatedAt: '2026-10-26T06:00:00Z',
  recordedAt: '2026-10-26T06:00:00Z',
});
beforeEach(() => {
  storage.clear();
  memoryRepository.invalidateList();
});
test('journal shows actual month dates before cloud data arrives', () => {
  const home = page('journal');
  home.onLoad();
  assert.ok(home.data.days.length >= 28);
  assert.match(home.data.yearLabel, /^\d{4}$/u);
  assert.ok(home.data.monthLabel);
});
test('journal keeps readable dates and moods during a same-session refresh', async (t) => {
  const home = page('journal');
  let fetch = async () => [entry()];
  t.mock.method(memoryRepository, 'listMemories', () => fetch());
  await home.loadJournal();
  let finish;
  fetch = () =>
    new Promise((r) => {
      finish = r;
    });
  const reload = home.loadJournal();
  assert.equal(home.data.memories[0]?.id, 'first');
  assert.ok(home.data.days.some((d) => d.count > 0));
  assert.equal(home.data.isLoading, false);
  finish([entry('updated')]);
  await reload;
});
test('timeline keeps content while refreshing and an older reply cannot overwrite a new one', async (t) => {
  const timeline = page('timeline');
  let fetch = async () => [entry()];
  t.mock.method(memoryRepository, 'listMemories', () => fetch());
  await timeline.loadTimeline();
  let finish;
  fetch = () =>
    new Promise((r) => {
      finish = r;
    });
  const old = timeline.loadTimeline();
  assert.equal(timeline.data.isLoading, false);
  assert.equal(timeline.data.allMemories[0].id, 'first');
  fetch = async () => [entry('new')];
  await timeline.loadTimeline();
  finish([entry('old')]);
  await old;
  assert.equal(timeline.data.allMemories[0].id, 'new');
});
test('timeline clears previous session data immediately after cloud activation changes', async (t) => {
  const timeline = page('timeline');
  let fetch = async () => [entry()];
  t.mock.method(memoryRepository, 'listMemories', () => fetch());
  await timeline.loadTimeline();
  cloudModeService.activateCloud();
  let finish;
  fetch = () =>
    new Promise((r) => {
      finish = r;
    });
  const loading = timeline.loadTimeline();
  assert.deepEqual(timeline.data.allMemories, []);
  finish([]);
  await loading;
});
test('missing companion function and network failures give different feedback without blaming friend', async (t) => {
  const client = new WechatCloudFunctionClient();
  let failure = { errCode: -501000, errMsg: 'FunctionName parameter could not be found' };
  t.mock.method(wx.cloud, 'callFunction', async () => {
    throw failure;
  });
  await assert.rejects(client.call('companion-api', 'getHome'), (e) => {
    assert.equal(e.code, 'FUNCTION_NOT_FOUND');
    assert.match(companionMessage(e), /伙伴云服务尚未开通/u);
    return true;
  });
  failure = { errMsg: 'network timeout' };
  await assert.rejects(client.call('companion-api', 'getHome'), (e) => {
    assert.equal(e.code, 'FUNCTION_CALL_FAILED');
    assert.match(companionMessage(e), /无法判断好友小屋/u);
    return true;
  });
});
test('HOME_UNAVAILABLE preserves the unified private or unauthorized response', () => {
  const error = Object.assign(new Error('raw'), { code: 'HOME_UNAVAILABLE' });
  assert.match(companionMessage(error), /未开放或当前无权访问/u);
  assert.doesNotMatch(companionMessage(error), /好友还没有使用/u);
});

test('startup prefetch does not abort app launch when local storage is unavailable', async (t) => {
  let app;
  globalThis.App = (definition) => {
    app = definition;
  };
  await import('../miniprogram/app.ts');
  t.mock.method(wx, 'getStorageInfoSync', () => {
    throw new Error('storage unavailable');
  });
  assert.doesNotThrow(() => app.onLaunch());
});
test('journal and timeline pull-down refresh explicitly bypass the session cache', async (t) => {
  for (const key of ['journal', 'timeline']) {
    const target = page(key);
    let forced = false;
    t.mock.method(target, key === 'journal' ? 'loadJournal' : 'loadTimeline', async (value) => {
      forced = value;
    });
    await target.onPullDownRefresh();
    assert.equal(forced, true);
  }
});

test('failed manual refresh cannot become apparent success on timeline re-entry from old cache', async (t) => {
  cloudModeService.activateCloud();
  memoryRepository.invalidateList();
  let calls = 0;
  t.mock.method(cloudMemoryRepository, 'listMemories', async () => {
    if (++calls === 1) return [entry()];
    throw new Error('offline');
  });
  const target = page('timeline');
  await target.loadTimeline();
  await target.loadTimeline(true);
  assert.match(target.data.refreshMessage, /更新未完成/u);
  await target.loadTimeline();
  assert.equal(calls, 3, 're-entry must actually retry after failed manual refresh');
  assert.match(target.data.refreshMessage, /更新未完成/u);
  assert.equal(target.data.allMemories[0].id, 'first');
});
test('cloud execution error for a missing collection is not a missing function', async (t) => {
  t.mock.method(wx.cloud, 'callFunction', async () => {
    throw {
      errCode: -504002,
      errMsg:
        'cloud.callFunction:fail Error: errCode: -504002 functions execute fail | errMsg: Error: collection does not exist',
    };
  });
  await assert.rejects(
    new WechatCloudFunctionClient().call('companion-api', 'getMine'),
    (e) => e.code === 'FUNCTION_CALL_FAILED',
  );
});
test('early calendar cannot mistake an unread day for an empty day', async (t) => {
  const target = page('journal');
  target.data.monthKey = '2026-10';
  let finish;
  const navigation = [];
  wx.navigateTo = (o) => {
    navigation.push(o.url);
    return Promise.resolve();
  };
  t.mock.method(
    memoryRepository,
    'listMemories',
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const loading = target.loadJournal();
  target.openDay({ currentTarget: { dataset: { key: '2026-10-26' } } });
  assert.deepEqual(navigation, []);
  finish([entry()]);
  await loading;
  target.openDay({ currentTarget: { dataset: { key: '2026-10-26' } } });
  assert.equal(target.data.showDaySheet, true);
});
