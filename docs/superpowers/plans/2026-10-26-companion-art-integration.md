# 校园伙伴正式内容接入 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task by task; fresh whole-change review at the end.

**Goal:** 将用户提供的 Pal 交接包接入已完成的小屋，完成角色、动作、家具、场景和灵感内容。
**Architecture:** 保留 v1 存档与稳定 ID，通过资产注册表关联原始设计 ID。构图图用于搭配灵感，含角色的构图图不作为实时场景底图；独立空房间用于实时背景。沿用 Canvas、页面与权限模型。
**Tech Stack:** 原生微信 TypeScript/WXML/WXSS、Canvas 2D、离线 PNG/JPEG 运行资源构建。
**Spec:** 用户本轮明确授权开始融合全部内容；交接包为参考数据，奖励提案不覆盖现有规则。

## Global Constraints
- 保留日记/校园/时光/我的四个 Tab 与此前全部功能；原有存档和钱包不得重置。
- 原图保持在用户交接 ZIP 中；工程只收运行资源及来源指纹。
- 8 个角色、10 件山大家具、4 张途途动作图和 24 条灵感文案全部可见或可用。
- 保留旧 ID；旧两件家具与配饰使用代码绘制，现有库存继续可用。
- 本轮本地集成和验证；不上传覆盖、不部署或提交正式审核。

## Review Focus
- 旧存档含所有旧 ID、余额、收据，读写后不丢失。
- 地毯始终在家具/角色下；墙牌不挡住前景；旋转点击和显示一致。
- 迟到的图片回调与页面切换不产生失效画面；导出包含实际图片。
- 库存、日记入口、资料卡使用同一形象，非途途不能借用途途姿态。
- 运行包体及图片透明边缘，320/390/768 宽无溢出。

### Task 1: 正式目录和资源
- [x] 写行为测试：稳定 ID/云白名单兼容、旧存档保留、全资源存在和总预算。
- [x] 验证 RED，接入压缩 PNG/JPEG、来源清单、角色文案和主题；验证 GREEN。
### Task 2: 实时场景和角色动作
- [x] 写渲染测试：背景、分层、动作仅限途途、资源加载清单；验证 RED。
- [x] 接入背景/四种姿态、配饰与旧家具代码绘制、缓存静态场景、页面清理；验证 GREEN。
### Task 3: 完成产品页面
- [x] 灵感选择无存档副作用、写日记入口、动作/搭配图、收藏介绍与命名流程检查。
- [x] 替换占位说明，接入角色介绍/24灵感/2搭配图，完成页面与导出验证。
### Task 4: 验证和交付
- [x] 全项目 check；新原生构建、实际资源加载/导出、原始存储指纹保持。
- [x] 多尺寸页面和完整流程检查；独立审查，修复重要问题。
- [x] 更新文档及输出可查看预览，明确本机、未部署云端与未上传状态。

## Execution ledger
- Baseline: .verification/pal-integration-20261026/baseline.json + baseline.zip (271 files); isolated existing worktree verified.
- Ruling: 不重复确认设计；用户已明确将细节授权执行。
- Ruling: 不进行 Git 提交；当前 dirty baseline 混有用户工作，逐文件快照作为本轮比较依据。
- Ruling: 三张场景图分别为空房间底图与两张搭配参考，避免实时房间出现第二个固定途途。

- Task 1/2: content-red -> content-green 12 tests pass. Task 3: ui-red -> ui-green 17 tests pass.

- Task 4: complete locally. Final check355 PASS; visual19 PASS; native11 PASS and1200x1920 real export; original storage unchanged; all195 runtime source files match native stage.
- Review: important static-pose override and equal-depth picking reproduced RED, fixed GREEN; obsolete photo copy removed.
- Ruling: 当前工作树保留，不提交/合并用户原有未提交改动，保持 D 盘现有项目作为交付位置。
- External boundary: automatic approval rejected WeChat preview source upload; no retry or bypass. Concrete local output is ready; explicit upload authorization requested only after local work completed. Cloud deployment and phone/two-account acceptance remain unperformed.

- 2026-10-26 后续授权：用户明确允许生成手机预览；195 个运行文件与已验收副本一致，官方 CLI preview 成功，包体 1,993,574 字节；仅预览，体验版/云服务/正式版记录均未更改。证据见 .verification/pal-integration-20261026/preview-evidence.json。
