'use strict';
const {
  POLICY,
  PalAIError,
  record,
  identifier,
  clip,
  periods,
  costForTokens,
  parseGeneration,
  buildPrompt,
  parseReply,
  usageCost,
} = require('./policy');
const BUDGETS = 'pal_ai_budgets',
  REQUESTS = 'pal_ai_requests';
const fail = (code, message) => {
  throw new PalAIError(code, message);
};
const cancelled = () => fail('AI_REQUEST_CANCELLED', '这次交流已经结束，普通互动照常。');
function freshState(epoch = 0) {
  return {
    schemaVersion: 1,
    enabled: false,
    epoch,
    history: [],
    letters: [],
    results: [],
    pending: null,
  };
}
function stateOf(user) {
  const value = user.palAI;
  if (value === undefined) return freshState();
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    typeof value.enabled !== 'boolean' ||
    !Number.isSafeInteger(value.epoch) ||
    value.epoch < 0 ||
    !Array.isArray(value.history) ||
    !Array.isArray(value.letters) ||
    !Array.isArray(value.results) ||
    value.history.length > 4 ||
    value.letters.length > POLICY.maxLetters ||
    value.results.length > 6 ||
    (value.pending !== null && !record(value.pending))
  )
    fail('AI_STATE_INVALID', '伙伴记录暂时读不了，可以停用并清空后重试。');
  return value;
}
function budgetOf(row, month) {
  if (!row)
    return {
      _id: 'm_' + month,
      kind: 'budget',
      month,
      used: 0,
      reserved: 0,
      halted: false,
      priceVersion: POLICY.priceVersion,
    };
  if (
    row.month !== month ||
    ![row.used, row.reserved].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    typeof row.halted !== 'boolean' ||
    row.priceVersion !== POLICY.priceVersion
  )
    fail('AI_BUDGET_UNAVAILABLE', 'AI额度暂时无法确认，普通互动照常。');
  return row;
}
function countOf(row) {
  if (!row) return 0;
  if (!Number.isSafeInteger(row.count) || row.count < 0)
    fail('AI_BUDGET_UNAVAILABLE', 'AI额度暂时无法确认，普通互动照常。');
  return row.count;
}
function publicReply(reply) {
  const result = {
    id: reply.id,
    type: reply.type,
    title: reply.title,
    text: reply.text,
    action: reply.action,
    date: reply.date,
    partnerId: reply.partnerId,
    partnerName: reply.partnerName,
  };
  if (reply.type === 'letter') {
    result.sourceMemoryId = reply.sourceMemoryId;
    result.read = reply.read === true;
  }
  return result;
}
function createHandler(options) {
  const ready = () => options.enabled() === true && options.provider.configured === true;
  const dayId = (user, day) => 'd_' + options.hash(user + '\0' + day);
  const weekId = (user, week) => 'w_' + options.hash(user + '\0' + week);
  const jobId = (user, nonce) => 'r_' + options.hash(user + '\0' + nonce);
  async function authenticate() {
    const context = options.getTrustedContext();
    if (
      typeof context?.APPID !== 'string' ||
      !context.APPID ||
      typeof context?.OPENID !== 'string' ||
      !context.OPENID
    )
      fail('UNAUTHENTICATED', '请先开启云端身份，再和伙伴交流。');
    const identityHash = options.hash(context.APPID + '\0' + context.OPENID);
    const user = await options.store.findUserByIdentityHash(identityHash);
    if (!user || user.status !== 'active')
      fail('PROFILE_REQUIRED', '请先开启云端身份，再和伙伴交流。');
    return { id: user._id, identityHash, openid: context.OPENID };
  }
  async function actor(tx, auth) {
    const user = await tx.get('users', auth.id);
    if (!user || user.status !== 'active' || user.identityHash !== auth.identityHash) cancelled();
    return user;
  }
  async function diary(tx, auth, memoryId, request) {
    const memory = await tx.get('memories', memoryId);
    if (
      !memory ||
      memory.ownerUserId !== auth.id ||
      memory.deletedAt !== null ||
      memory.origin === 'demo' ||
      typeof memory.text !== 'string' ||
      !memory.text.trim()
    )
      fail('AI_DIARY_UNAVAILABLE', '这篇日记暂时无法用于来信，请选择自己有文字的云端日记。');
    if (
      clip(memory.text, 600) !== request.confirmedExcerpt ||
      clip(memory.customMood || memory.mood, 20) !== request.confirmedMood
    )
      fail('AI_DIARY_CHANGED', '日记刚有更新，请重新预览后确认。');
    return memory;
  }
  async function moderate(content, auth) {
    let result;
    try {
      result = await options.moderate({ content, openid: auth.openid, scene: 2 });
    } catch {
      fail('AI_MODERATION_UNAVAILABLE', '文字检查暂时不可用，稍后再来吧。');
    }
    if (
      !record(result) ||
      (result.errCode !== undefined && result.errCode !== 0) ||
      !['pass', 'review', 'risky'].includes(result.result?.suggest)
    )
      fail('AI_MODERATION_UNAVAILABLE', '文字检查暂时不可用，稍后再来吧。');
    if (result.result.suggest !== 'pass')
      fail('AI_CONTENT_REJECTED', '这段文字暂时不适合使用，换一种说法吧。');
  }
  async function status(auth) {
    const p = periods(options.now());
    return options.store.transaction(async (tx) => {
      const ai = stateOf(await actor(tx, auth));
      const budget = budgetOf(await tx.get(BUDGETS, 'm_' + p.month), p.month);
      const chats = countOf(await tx.get(REQUESTS, dayId(auth.id, p.day)));
      const letters = countOf(await tx.get(REQUESTS, weekId(auth.id, p.week)));
      const paused =
        budget.halted ||
        budget.used + budget.reserved + costForTokens(POLICY.inputMaxTokens, POLICY.chatMaxTokens) >
          POLICY.monthBudget;
      return {
        enabled: ai.enabled,
        available: ready() && !paused,
        paused,
        reason: !ready() ? 'AI_NOT_CONFIGURED' : paused ? 'AI_BUDGET_EXHAUSTED' : '',
        chatsRemaining: Math.max(0, POLICY.dailyChats - chats),
        lettersRemaining: Math.max(0, POLICY.weeklyLetters - letters),
        history: ai.history,
        letters: ai.letters.map(publicReply),
      };
    });
  }
  async function result(payload, auth) {
    if (
      Object.keys(payload).some((key) => key !== 'requestId') ||
      !identifier(payload.requestId, 16)
    )
      fail('INVALID_INPUT', '请求资料无效。');
    return options.store.transaction(async (tx) => {
      const ai = stateOf(await actor(tx, auth));
      if (!ai.enabled) cancelled();
      const id = jobId(auth.id, payload.requestId),
        row = await tx.get(REQUESTS, id);
      const saved = ai.results.find((item) => item.id === id);
      if (saved) return { state: 'completed', reply: publicReply(saved.reply) };
      if (!row) return { state: 'failed', code: 'NOT_FOUND' };
      return {
        state: row.phase === 'settled' ? 'failed' : 'pending',
        code: row.errorCode || 'AI_UNCERTAIN',
      };
    });
  }
  async function editState(action, payload, auth) {
    const allowed =
      action === 'consent'
        ? ['enabled']
        : ['deleteLetter', 'readLetter'].includes(action)
          ? ['id']
          : [];
    if (
      Object.keys(payload).some((k) => !allowed.includes(k)) ||
      (action === 'consent' && payload.enabled !== true) ||
      (['deleteLetter', 'readLetter'].includes(action) && !identifier(payload.id))
    )
      fail('INVALID_INPUT', '请求资料无效。');
    return options.store.transaction(async (tx) => {
      const user = await actor(tx, auth);
      let ai;
      if (action === 'clear') {
        const epoch =
          Number.isSafeInteger(user.palAI?.epoch) && user.palAI.epoch >= 0 ? user.palAI.epoch : 0;
        ai = freshState(epoch + 1);
      } else {
        ai = stateOf(user);
        if (action === 'consent') {
          if (!ai.enabled) ai = { ...ai, enabled: true, epoch: ai.epoch + 1, pending: null };
        } else {
          const item = ai.letters.find((l) => l.id === payload.id);
          if (!item) fail('NOT_FOUND', '这封信当前不可用。');
          ai = {
            ...ai,
            letters:
              action === 'deleteLetter'
                ? ai.letters.filter((l) => l.id !== payload.id)
                : ai.letters.map((l) => (l.id === payload.id ? { ...l, read: true } : l)),
            results:
              action === 'deleteLetter'
                ? ai.results.filter((r) => r.reply.id !== payload.id)
                : ai.results,
          };
        }
      }
      await tx.update('users', auth.id, { palAI: ai });
      return { saved: true };
    });
  }
  async function reserve(kind, request, auth) {
    const at = options.now(),
      p = periods(at),
      id = jobId(auth.id, request.requestId);
    const fingerprint = options.hash(JSON.stringify({ kind, ...request }));
    return options.store.transaction(async (tx) => {
      const user = await actor(tx, auth),
        ai = stateOf(user);
      if (!ai.enabled) fail('AI_CONSENT_REQUIRED', '先同意AI交流，再和伙伴说说话吧。');
      const existing = await tx.get(REQUESTS, id);
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          fail('AI_REQUEST_CONFLICT', '这次请求已经使用过，请重新打开交流页面。');
        const result = ai.results.find((r) => r.id === id);
        return {
          duplicate: true,
          data: result
            ? { state: 'completed', reply: publicReply(result.reply) }
            : {
                state: existing.phase === 'settled' ? 'failed' : 'pending',
                code: existing.errorCode || 'AI_UNCERTAIN',
              },
        };
      }
      let memory;
      if (kind === 'letter') {
        memory = await diary(tx, auth, request.memoryId, request);
        const version = options.hash(request.confirmedExcerpt + '\0' + request.confirmedMood);
        const cached = ai.letters.find(
          (l) => l.sourceMemoryId === request.memoryId && l.sourceVersion === version,
        );
        if (cached)
          return { duplicate: true, data: { state: 'completed', reply: publicReply(cached) } };
      }
      if (ai.pending && Date.parse(ai.pending.at) + POLICY.lockMs > Date.parse(at))
        fail('AI_BUSY', '伙伴正在整理上一句话，稍等一会儿吧。');
      const quotaId = kind === 'chat' ? dayId(auth.id, p.day) : weekId(auth.id, p.week);
      const count = countOf(await tx.get(REQUESTS, quotaId));
      if (count >= (kind === 'chat' ? POLICY.dailyChats : POLICY.weeklyLetters))
        fail(
          kind === 'chat' ? 'AI_CHAT_LIMIT' : 'AI_LETTER_LIMIT',
          kind === 'chat'
            ? '今天的AI交流次数用完了，明天再聊吧。'
            : '本周的AI来信次数用完了，下周再来吧。',
        );
      const budget = budgetOf(await tx.get(BUDGETS, 'm_' + p.month), p.month);
      const amount = costForTokens(
        POLICY.inputMaxTokens,
        kind === 'chat' ? POLICY.chatMaxTokens : POLICY.letterMaxTokens,
      );
      if (budget.halted || budget.used + budget.reserved + amount > POLICY.monthBudget)
        fail('AI_BUDGET_EXHAUSTED', '本月AI额度已用完，普通互动照常。');
      const prompt = buildPrompt(kind, request, {
        history: ai.history,
        diary: memory ? { text: memory.text, mood: memory.customMood || memory.mood } : undefined,
      });
      const ticket = {
        id,
        kind,
        request,
        epoch: ai.epoch,
        month: p.month,
        day: p.day,
        amount,
        at,
        prompt,
        moderationInput:
          request.partnerName + '\n' + (kind === 'chat' ? request.text : clip(memory.text, 600)),
        sourceVersion:
          kind === 'letter'
            ? options.hash(request.confirmedExcerpt + '\0' + request.confirmedMood)
            : '',
      };
      await tx.set(BUDGETS, { ...budget, reserved: budget.reserved + amount });
      await tx.set(REQUESTS, {
        _id: quotaId,
        kind: kind === 'chat' ? 'day' : 'week',
        count: count + 1,
      });
      await tx.set(REQUESTS, {
        _id: id,
        kind: 'request',
        fingerprint,
        month: p.month,
        amount,
        epoch: ai.epoch,
        phase: 'reserved',
        at,
      });
      await tx.update('users', auth.id, { palAI: { ...ai, pending: { id, at, epoch: ai.epoch } } });
      return ticket;
    });
  }
  async function gate(ticket, auth, phase) {
    await options.store.transaction(async (tx) => {
      const user = await actor(tx, auth),
        ai = stateOf(user),
        row = await tx.get(REQUESTS, ticket.id);
      if (
        !ai.enabled ||
        ai.epoch !== ticket.epoch ||
        ai.pending?.id !== ticket.id ||
        row?.phase !== (phase === 'sent' ? 'reserved' : 'sent')
      )
        cancelled();
      if (ticket.kind === 'letter') await diary(tx, auth, ticket.request.memoryId, ticket.request);
      if (!ready()) fail('AI_NOT_CONFIGURED', 'AI交流暂时停用，普通互动照常。');
      await tx.update(REQUESTS, ticket.id, { phase });
    });
  }
  async function settle(ticket, auth, outcome) {
    return options.store.transaction(async (tx) => {
      const row = await tx.get(REQUESTS, ticket.id);
      if (!row || row.phase === 'settled') cancelled();
      const budget = budgetOf(await tx.get(BUDGETS, 'm_' + row.month), row.month);
      let charge = 0,
        halt = false;
      if (outcome.paid) {
        if (outcome.usage !== undefined) {
          try {
            charge = usageCost(ticket.kind, outcome.usage);
          } catch {
            charge = row.amount;
            halt = true;
          }
        } else charge = row.amount;
      }
      if (charge > row.amount || budget.reserved < row.amount) {
        charge = row.amount;
        halt = true;
      }
      await tx.set(BUDGETS, {
        ...budget,
        reserved: Math.max(0, budget.reserved - row.amount),
        used: budget.used + charge,
        halted: budget.halted || halt,
      });
      await tx.update(REQUESTS, ticket.id, {
        phase: 'settled',
        charged: charge,
        settledAt: options.now(),
        errorCode: outcome.error?.code || '',
        ...(outcome.usage && !halt
          ? { inputTokens: outcome.usage.input_tokens, outputTokens: outcome.usage.output_tokens }
          : {}),
      });
      const user = await tx.get('users', auth.id);
      if (!user || user.status !== 'active' || user.identityHash !== auth.identityHash) return null;
      const ai = stateOf(user);
      if (!ai.enabled || ai.epoch !== ticket.epoch || ai.pending?.id !== ticket.id) return null;
      let reply = null;
      if (outcome.reply && !halt) {
        if (ticket.kind === 'letter') {
          const memory = await tx.get('memories', ticket.request.memoryId);
          if (!memory || memory.ownerUserId !== auth.id || memory.deletedAt !== null) {
            await tx.update('users', auth.id, { palAI: { ...ai, pending: null } });
            return null;
          }
        }
        reply = {
          id: ticket.kind === 'letter' ? 'l_' + options.hash(ticket.id).slice(0, 32) : ticket.id,
          type: ticket.kind,
          ...outcome.reply,
          date: ticket.day,
          partnerId: ticket.request.partnerId,
          partnerName: ticket.request.partnerName,
        };
        if (ticket.kind === 'letter')
          Object.assign(reply, {
            sourceMemoryId: ticket.request.memoryId,
            sourceVersion: ticket.sourceVersion,
            read: false,
          });
        const next = {
          ...ai,
          pending: null,
          results: [...ai.results, { id: ticket.id, reply }].slice(-6),
        };
        if (ticket.kind === 'chat')
          next.history = [
            ...ai.history,
            { role: 'user', content: ticket.request.text },
            { role: 'assistant', content: reply.text },
          ].slice(-4);
        else next.letters = [reply, ...ai.letters].slice(0, POLICY.maxLetters);
        await tx.update('users', auth.id, { palAI: next });
      } else await tx.update('users', auth.id, { palAI: { ...ai, pending: null } });
      return reply ? publicReply(reply) : false;
    });
  }
  async function generate(kind, payload, auth) {
    const request = parseGeneration(kind, payload);
    if (!ready()) fail('AI_NOT_CONFIGURED', 'AI交流还没有开通，普通互动照常。');
    const ticket = await reserve(kind, request, auth);
    if (ticket.duplicate) return ticket.data;
    let paid = false,
      usage,
      reply,
      error;
    try {
      await moderate(ticket.moderationInput, auth);
      await gate(ticket, auth, 'sent');
      await options.provider.count(ticket.prompt);
      await gate(ticket, auth, 'generating');
      paid = true;
      const generated = await options.provider.generate(ticket.prompt);
      usage = generated.usage;
      usageCost(kind, usage);
      reply = parseReply(kind, generated.raw);
      await moderate(reply.title + '\n' + reply.text, auth);
    } catch (caught) {
      error =
        caught instanceof PalAIError
          ? caught
          : new PalAIError('AI_UNAVAILABLE', '伙伴暂时没连上，普通互动照常。');
      if (caught?.usage !== undefined) usage = caught.usage;
    }
    const saved = await settle(ticket, auth, {
      paid,
      usage,
      reply: error ? undefined : reply,
      error,
    });
    if (saved === null) cancelled();
    if (error) throw error;
    if (!saved) fail('AI_USAGE_INVALID', '伙伴暂时休息了，普通互动照常。');
    return { state: 'completed', reply: saved };
  }
  return async (event) => {
    const requestId = options.newRequestId();
    try {
      if (
        !record(event) ||
        ![
          'status',
          'result',
          'consent',
          'chat',
          'letter',
          'readLetter',
          'deleteLetter',
          'clear',
        ].includes(event.action) ||
        (event.payload !== undefined && !record(event.payload))
      )
        fail('INVALID_INPUT', '请求资料无效。');
      const auth = await authenticate(),
        payload = event.payload || {};
      let data;
      if (event.action === 'status') {
        if (Object.keys(payload).length) fail('INVALID_INPUT', '请求资料无效。');
        data = await status(auth);
      } else if (event.action === 'result') data = await result(payload, auth);
      else if (['consent', 'readLetter', 'deleteLetter', 'clear'].includes(event.action))
        data = await editState(event.action, payload, auth);
      else data = await generate(event.action, payload, auth);
      return { ok: true, requestId, data };
    } catch (error) {
      return {
        ok: false,
        requestId,
        code: error instanceof PalAIError ? error.code : 'AI_SERVICE_UNAVAILABLE',
        message: error instanceof PalAIError ? error.message : '伙伴服务暂时不可用，普通互动照常。',
      };
    }
  };
}
module.exports = { createHandler };
