# Timeline Cover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a replaceable, durable single-image cover above the existing timeline.
**Architecture:** A dedicated TimelineCoverService owns one stored local path and managed files. The timeline uses this service and native image selection; data management clears the cover through the same service.
**Tech Stack:** Existing WeChat TypeScript/WXML/WXSS, Node test runner, TDesign. No new dependencies.
**Spec:** docs/superpowers/specs/2026-10-25-timeline-cover-design.md

## Global Constraints

- Existing project directory: D:\Codex\Projects\DesktopProjects\iSdu-Fqin.
- Cover is a local personal appearance setting, independent of memories and cloud profile; no deployment.
- One compressed image, maximum 10 MiB; fit without stretching; cancellation never changes saved cover.
- Never remove the previous image before the replacement setting has committed.
- No usable Git repository exists here. Preserve originals and SHA256 in D:\Codex\Outputs\iSdu-timeline-cover-20261025; do not initialize, branch, or commit.
- Restore only the three missing original scripts from the original ZIP to enable the existing checks.

## Review Focus

- File saved but storage write fails: remove new image, preserve old setting and file.
- Corrupt saved metadata: show fallback and permit replacement without deleting arbitrary paths.
- Native picker hides/reshows page: reloading must never overwrite a pending save.
- Missing or oversized picker result: original cover persists and user receives feedback.
- Clearing local data: cover setting and managed files are cleared without touching unrelated files.

### Task 1: Durable cover service

**Files:** Create miniprogram/services/timeline-cover-service.ts and .test.mjs; modify package.json test:image to include the new tests.
**Interfaces:** TimelineCoverService(storage, files, userDataPath) with getCover(): Promise<string>, saveCover(tempFilePath: string): Promise<string>, clearCover(): Promise<void>; lazy timelineCoverService for native runtime. Reuse StorageAdapter and LocalImageFileSystemAdapter.

- [x] Write tests using in-memory storage and files: absent setting; durable save/reload; replace and cleanup; file failure; storage failure rollback; corrupt metadata recovery; unsafe saved paths; clear failure; cleanup failure.
- [x] Run focused test and verify missing implementation is the cause of failure.
- [x] Implement service with versioned key and separate user-data directory, safe path validation, unique target filenames, save-before-commit-before-cleanup ordering.
- [x] Run focused tests and the existing image suite, all pass.

### Task 2: Timeline UI and user flows

**Files:** Modify miniprogram/pages/timeline/index.ts, .wxml, .wxss and .json; miniprogram/pages/data-management/index.ts; add scripts/timeline-cover-flows.test.mjs; include it in test:pages.
**Consumes:** timelineCoverService.getCover/saveCover/clearCover.
**Produces:** loadCover(), changeCover(), chooseCoverImage(), restoreDefaultCover(), handleCoverImageError() page methods; coverImagePath, coverImageFailed, coverErrorMessage, isCoverSaving state.

- [x] Write failing flow tests against the real service and Page definition: single image selection/save/reload; picker cancel; size/empty/invalid result rejection; no concurrent picker; recover from corrupt metadata; write failure; restore and clear; old async read cannot overwrite save.
- [x] Implement native chooser and action sheet, loading guards, localized feedback, fallback cover, accessible change button and full-width background; keep existing list logic intact.
- [x] Clear cover from existing local-data confirmation flow.
- [x] Run both page flow files and service tests, all pass.

### Task 3: Validation and delivery

**Files:** Update this plan, write docs/TIMELINE_COVER.md and validation evidence in the output directory.

- [x] Run npm run check, read complete summary and resolve failures related to delivery.
- [x] Inspect rendered cover with a local preview if available; distinguish browser rendering from native device verification.
- [x] Fresh code review of changed files, fix material findings with regression tests.
- [x] Compare originals/hashes, record touched files and exact check results; deliver project location and user steps.
