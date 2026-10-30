# Pal AI Budget Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. The user approved implementation and all product choices below. Use one independent final review; do not delegate implementation. No Git commits, push, client upload or cloud deployment in this local milestone.

**Goal:** Deliver simple GPT-6 Luna chat and owner-only diary letters with a concurrency-safe global CNY30 monthly limit, retaining all ordinary Pal interactions.
**Architecture:** Independent pal-ai CloudBase function; pure policy and budget functions; transactional store and handler; typed mini-program repository; a small chat page and additions to the existing mail page. Private AI text lives in the owner users.palAI field and is removed by existing account deletion.
**Tech Stack:** Existing Node.js/CommonJS cloud functions, TypeScript, WXML/WXSS, wx-server-sdk, built-in HTTPS, existing node:test/TypeScript loader. No new runtime framework.
**Spec:** docs/superpowers/specs/2026-10-29-pal-ai-budget-design.md

## Global Constraints

- model固定gpt-6-luna，reasoning.effort=none，store=false，service_tier=default。
- 全站每月30元模型预算；每人每天3次聊天、每周2次来信；北京时间日/周/月。
- 聊天输入最多160字、回复上限120字；来信仅本人最新一篇云端日记最多600字、输出上限280字。
- 普通互动不依赖AI。API Key只从云端环境变量读取，不进入客户端、Git或日志。
- 可信身份与所有日记归属由服务端验证；不信任客户端历史、人设、额度、模型或ownerId。
- 无自动重试；重复requestId幂等；未知结算保留预留；跨月结算归原月。
- 使用现有linked worktree，不改未提交的游乐场等并行实现；不提交、上传、部署。

## Review Focus

- 用户关闭/清空、删号或换账号时，计数/生成/回包的竞争不能复活隐私数据。
- 两个实例同时花最后一笔预算及同一ID不同payload，不得重复调用或跨用户返回。
- 上游无usage、超时、无效JSON或内容检测故障，不假成功、不自动退款或重试。
- 旧用户文档缺少palAI字段、旧模板来信、画布降级、未知云错误均继续可用。
- SDK事务回包两种封装、缺失文档两种data封装、数据库写失败不可被当成成功。

## Task 1: Fixed policy and atomic budget accounting

Files: cloudfunctions/pal-ai/lib/policy.js, policy.test.cjs; budget behavior integrated into store/handler tests below.
Produces: POLICY, periods(now), reserveCost(input,output), actualCost(usage), input validation, fixed server persona, bounded prompt and strict output parser.
Consumes: approved spec only.

- [x] Write and run failing tests for Beijing boundaries, fixed pricing integer math, character/token caps, prompt isolation, output/action validation.
- [x] Implement minimal pure functions and run tests to green.
      Expected: all policy tests pass without network calls.

## Task 2: Identity, provider and transactional service

Files: cloudfunctions/pal-ai/{index.js,package.json,config.json}, lib/{openai-client.js,openai-client.test.cjs,cloud-store.js,cloud-store.test.cjs,handler.js,handler.test.cjs}; use existing database fixture via a test-only import.
Produces: createOpenAIClient({apiKey,post}), createCloudStore(database), createHandler(options), actions status/result/consent/chat/letter/readLetter/deleteLetter/clear.
Consumes: Task 1 policy; existing users and memories ownership fields; native wx-server-sdk interface.

- [x] Test RED at HTTPS boundary and handler/store for disabled service, auth/ownership, exact consent, quotas, idempotency, global budget races, lost replies, malformed output/usage, revoke/deletion races and month rollover.
- [x] Implement pinned Responses endpoint, non-streaming count/create calls with deadlines and response-size limits; no retries and no raw upstream error output.
- [x] Implement ADMINONLY budget/request documents and private users.palAI state with atomic reserve/settle, in-flight lock and audit-only hashes.
- [x] Run policy/provider/store/handler tests to GREEN; verify deterministic fake transport never calls a real API.
      Expected: all backend focused tests pass, no API key or real user data needed.

## Task 3: Simple client flow and existing Pal integration

Files: miniprogram/models/pal-ai.ts; services/repository/pal-ai-repository.ts and tests; pages/companion/chat/index.{ts,json,wxml,wxss}; existing companion home/mail and route map/app subpackage list. Add scripts/pal-ai-flows.test.mjs and wire test:pal-ai into package.json.
Produces: typed repository; chat enabling/short history display/retry by same requestId/pause state; requested letters with explicit diary preview consent; delete/disable-and-clear; existing ordinary interactions unchanged.
Consumes: Task 2 response envelopes and owner-only status/letters/history.

- [x] Write failing repository and page tests for consent cancel, budget exhaustion, same-ID retry, diary preview/ownership, duplicate clicks, hide/unload, reset and ordinary interaction independence.
- [x] Implement single small chat screen, mail AI section and home tool entry using existing style; never include raw identifiers in page query or log.
- [x] Run targeted client tests plus existing companion/page tests, typecheck and lint.
      Expected: chat/mail flows pass, templates remain functional when AI unavailable.

## Task 4: Verification, handoff and registry

Files: docs/PAL_AI_SETUP.md; design/plan/ledger; navigation PROJECT_STATE.json and generated knowledge indexes.

- [x] Run complete npm run check from actual sourceRoot and inspect full output; preserve any parallel unrelated failure as a named limitation instead of silently fixing it.
- [x] Render/inspect actual templates at 320/390/768 widths, basic enabled/disabled/paused/loading/error states; use official WXML/WXSS offline compiler if existing harness available.
- [x] Independent final review against approved design, current files and this plan; fix important findings with RED-GREEN tests and rerun affected/full checks as needed.
- [x] Document precise API-Key setup, ADMINONLY collections, readiness switch, conservative budget accounting, deployment steps and unrun real API/device checks. No credentials in docs.
- [x] Register local-only module status/evidence; refresh and check navigation. Preserve releases/backend deployment records.
      Expected: local implementation and verification concrete; real API activation remains explicitly gated by actual cloud credential/configuration, with no fabricated smoke-test result.

## Completion record

Local milestone complete on 2026-10-29: 643 full-check tests including 63 Pal AI tests, 48 browser layout cases and official WXML31/WXSS33 offline compilation pass. Independent review findings fixed with regression evidence. Registry refresh/check pass; existing releases/backend remain unchanged. Seven-file source ZIP and hashes prepared. Masked local key input and zero-generation official Luna model-metadata check succeeded; no cloud deployment, paid generation or client upload performed. See docs/PAL_AI_SETUP.md and .verification/pal-ai-20261029/verification-summary.json.
