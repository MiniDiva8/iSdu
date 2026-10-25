# EMMO 式 iSdu 日记 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 可运行的原生日记小程序，包含 EMMO 式主要日记界面及原有校园地图和好友功能。
**Architecture:** 复用当前 Repository 与 CloudBase 合约；用显式保留地图版本表示无地点日记；新增纯日历模型、本机文字草稿和日记/照片/选点页面。
**Tech Stack:** TypeScript, WXML, WXSS, TDesign MiniProgram 1.15.3, CloudBase, Node test runner。
**Spec:** docs/superpowers/specs/2026-10-25-emmo-journal-design.md

## Global Constraints
- 平台：微信原生小程序；语言：TypeScript；视图与样式：WXML、WXSS。
- UI：tdesign-miniprogram 是唯一正式 UI 组件库。
- 日记默认私有，跨用户访问经现有云函数。
- 不部署、不推送、不引入商业 APK 图片或 Java 源码。
- 开发仅在 .worktrees/emmo-journal；新成果位于 D:。

## Review Focus
- 北京时间午夜、闰年与跨年：纯日历测试验证。
- 同日多条及多张照片：每条可访问、图片不丢；页面流程测试验证。
- 无地点与历史地图版本：地图入口明确过滤；既有地图和服务测试验证。
- 云端模式与本机草稿隔离：草稿只在本机新建流程生效；页面流程测试验证。
- 保存失败/重复提交/损坏图片：沿用原保存回滚与保护，并运行既有测试。

### Task 1: 日历模型与本机草稿
Files: utils/journal.ts、utils/journal.test.mjs、services/journal-draft-service.ts 及测试。
Interfaces: buildJournalMonth(memories, monthKey, nowIso) 返回 days/entryCount/recordedDays/photos；草稿 read/save/clear。
- [ ] 写业务测试并观察缺失实现导致失败。
- [ ] 实现日期分组、月份切换、无地点判定、照片视图与草稿校验。
- [ ] 验证新测试及原模型/存储测试，提交。

### Task 2: 首页、心情组件与照片墙
Files: components/mood-face/*、pages/journal/*、pages/album/*、app.json、scripts/journal-flows.test.mjs。
Consumes: Task 1 的日历模型和现有 memoryRepository。
Produces: 可切换月份的表情墙、同日列表、搜索、可到详情的照片墙。
- [ ] 写首页/照片回顾流程测试，观察失败。
- [ ] 实现原生页面与原创心情组件。
- [ ] 验证本机读写和失败状态、页面注册、类型，提交。

### Task 3: 编辑闭环与校园、好友整合
Files: pages/editor/*、pages/location-picker/*、pages/detail/*、pages/timeline/*、pages/profile/*、custom-tab-bar/*。
Consumes: Task 1 的日期、位置标记与草稿；现有地图纯函数和好友/点赞服务。
Produces: 可直接新建日记、保存/编辑/删除、选校园地点、详情定位、好友分享入口。
- [ ] 写直接新建、草稿恢复、选点返回、无地点防跳转和兼容云端负载的测试，观察失败。
- [ ] 复用原保存逻辑，重写纸张编辑与详情视图，补选点与导航。
- [ ] 运行全部业务与页面测试，提交。

### Task 4: 验证与交付
Files: docs/EMMO_JOURNAL_DELIVERY.md、README.md、必要预览/验证脚本。
- [ ] 跑完整 npm run check 与 git diff --check，修复实际问题。
- [ ] 尝试开发者工具编译；生成可核对的页面预览，区分原生与浏览器验证范围。
- [ ] 由一个独立审阅代理检查本轮全部改动；修复重要问题后复验。
- [ ] 核对仓库根目录、未提交文件与敏感信息；整理可导入源码包到 D:/Codex/Outputs。
- [ ] 汇报实现内容、检查证据与真实设备/云端未验证项。
