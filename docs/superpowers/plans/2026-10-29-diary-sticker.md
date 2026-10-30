# Diary Sticker Implementation Plan

> For agentic workers: execute inline using superpowers:executing-plans; preserve the current linked worktree and all unrelated changes. No Git commit, upload or deployment is authorized by this plan.

Goal: Create editable diary stickers and return PNG artwork to the existing diary editor.

Architecture: Bounded vector document + undo history, original Canvas symbols, native Canvas 2D page in an ordinary subpackage. A local draft stores vectors only. Exported artwork enters the existing image pipeline; existing schemas, visibility and content checks remain authoritative.

Tech stack: TypeScript, WXML/WXSS, WeChat Canvas 2D, existing Node tests, existing browser and official offline compilers. No new runtime dependencies.

Spec: ../specs/2026-10-29-diary-sticker-design.md

## Global constraints

- Source: D:/Codex/Projects/DesktopProjects/iSdu-Fqin/.worktrees/emmo-memory-bottle, existing linked branch codex/emmo-memory-bottle-smooth.
- Keep version 3.2.0-rc.9, current release/backend records and unrelated uncommitted files.
- Stickers + photos <= 3; exported PNG uses existing managed images and cloud checks.
- No Heytea assets/code; original Canvas symbols; local-only vector draft; clear it with all-local-data action.

## Review focus

- Late Canvas/export/event callbacks after page leave must not mutate the diary.
- Failed draft writes/exports must not discard the in-memory artwork.
- Touch coordinates must remain correct after scrolling, resize and multi-touch.
- Diary image capacity, duplicate callbacks, edit mode and save rollback must preserve existing photos.
- Eraser must not remove text/symbols; export must exclude handles and UI.

## Task 1: document, rendering and draft

Files: miniprogram/utils/sticker-document.ts; miniprogram/pages/sticker-studio/sticker-renderer.ts; miniprogram/services/sticker-draft-service.ts; adjacent .test.mjs files.

Interfaces: StickerDocument, StickerLayer, StickerHistory; parseStickerDocument(unknown), createStickerDocument(), appendStickerLayer(), transformStickerLayer(), hitTestSticker(), renderSticker(ctx, document, selectedId?). Draft service read/save/clear with injected StorageAdapter.

- [ ] Write and run failing tests: empty documents, invalid/corrupt/oversized data, immutable undo/redo and redo branch truncation, rotated hit tests, clamped transforms, draft roundtrip/write failures and removal.
- [ ] Implement bounded immutable document/history and shared renderer; drawing erasers are composited before object layers and paper background.
- [ ] Run the document/draft tests to green.

## Task 2: native studio and diary integration

Files: pages/sticker-studio/index.ts/.wxml/.wxss/.json; pages/editor/index.ts/.wxml/.wxss; app.json; pages/data-management/index.ts; scripts/sticker-flows.test.mjs; package.json.

Interfaces: studio emits stickerCreated { path: string }; editor accepts only not-unloaded-page local exported artwork with a matching navigation token, once per navigation, within image capacity. A hidden opener is valid. Studio autosaves bounded vector draft; no generated PNG is stored as a permanent record until the diary is saved.

- [ ] Write/run failing flows for event integration, capacity, standalone sticker save, export failure, draft restore, undo/redo, touch drawing/dragging, late callbacks and local-data clear.
- [ ] Implement one native creation route, tool panels, original symbols, transforms, text editing, history, draft notice, Canvas retry, export and explicit return.
- [ ] Integrate editor and local-data clear, preserve existing photo and privacy flows.
- [ ] Run targeted tests, typecheck, lint and formatting.

## Task 3: verification and handoff

Files: .verification/diary-sticker-20261029; docs/DIARY_STICKER.md; docs/CURRENT_LOCAL_INTEGRATION.md; navigation PROJECT_STATE.json.

- [ ] Run full npm run check and record actual counts and any failures.
- [ ] Render actual WXML/WXSS at widths 320/390/430; use production renderer to inspect sample/export PNGs; run official offline WXML/WXSS compilation.
- [ ] Fresh code review, address material findings with regression tests; preserve unrelated work hashes.
- [ ] Update module/probe registration and dated handoff; project-context refresh/check. Record native runtime, physical phones and release upload as NOT RUN.

## Progress and rulings

- Design and implementation are explicitly delegated by the current user request; execute without adding approval checkpoints for routine local changes.
- Existing linked worktree already provides isolation; do not create a replacement or reset the dirty workspace.
- All review artifacts are based on current working files; HEAD alone omits the user's integrated baseline.
- Builder check resolved: main-package model avoids reverse subpackage imports; single global draft means continue-last-creation only; hidden opener accepts its matching event until unload.
- Task 1 complete: document/draft tests RED (missing implementation) to 10 PASS.
- Task 2 complete: renderer/page tests RED to 21 PASS, then rotation regression RED to 24 PASS. Keep the existing native stack and single current source.
- Final review: one P2 resize/export UI lock, reproduced and fixed with a deferred-export regression; no other material review findings.
- Cloud pipeline audit: a 1080 PNG would enter the existing photo compressor. Changed final export to 720 PNG plus the existing 900KB safety cap; new integration regressions RED to 26 PASS. Backing canvas stays 1080. This preserves transparency without changing cloud services.
- Packaging audit: excluded the three new in-mini-program test files and one pre-existing omitted Pal AI repository test; no runtime behavior changed outside the sticker feature.
- Visual check complete: 24 actual-template browser layouts plus actual renderer pixels; official offline compiler 32 WXML / 34 WXSS. Full suite and navigation results are recorded in the final verification summary, not inferred from earlier runs.
