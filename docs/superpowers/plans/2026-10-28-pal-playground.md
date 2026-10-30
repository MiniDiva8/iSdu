# 伙伴游乐场 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task. User approved direct implementation and delegated details; no additional approval checkpoint.

**Goal:** 在现有 Pal 小屋中加入八伙伴跳动、碰撞、翻任务便签和幸运庆祝，复用真实任务与幂等奖励。
**Architecture:** 新增 companion 普通分包页面；纯逻辑负责物理和任务映射，Canvas 负责舞台，原生 WXML 负责可操作便签与降级名单。钱包和任务只通过现有 companionService 修改。
**Tech Stack:** TypeScript、WXML、WXSS、Canvas 2D、TDesign，无新依赖。
**Spec:** D:/Codex/Projects/DesktopProjects/iSdu/materials/components/pal-playground-20261028/POTETO_INTEGRATION_PROPOSAL.md。2026-10-28 用户已选择方案 A，明确“按建议直接实现，细节由你决定”，并授权真实源码目录继续工作。

## Global Constraints

- 使用当前 emmo-memory-bottle linked worktree，保留既有未提交实现，不提交或上传。
- 复用八位角色与原有九项任务，不更改存档版本、余额规则或奖励额度。
- onHide/onUnload 取消动画与倒计时，异步回调不得覆盖新状态。
- 领奖重新核验事实，读事实失败禁止领奖并提供重试；静态名单仍可操作。
- 当前包号 3.2.0-rc.5；体验、正式和云部署状态不在本轮修改。

## Review Focus

- 低高度/窄屏和长文案不遮挡微信胶囊、名单或任务按钮。
- 连续翻卡、重开和重复领奖不增加额外光点。
- 离开/返回、晚到事实或命令结果、后台倒计时不得导航或污染新局。
- Canvas 初始化/图片加载失败以及暂停时仍可打开所有任务。
- 跨日与真实任务变化必须回读，未领取伙伴的深链接不得发奖。

### Task 1: 舞台纯逻辑与任务映射

Files: miniprogram/utils/companion-playground.ts、companion-playground.test.mjs。
Interfaces: createPlayground(width,height,random) -> PlaygroundRound；stepPlayground(round,seconds,heldId?)；hitPlayground(round,x,y)；buildPlaygroundNotes(state,facts,now)；recommendPlaygroundTask(tasks)。

- [x] 写边界、碰撞、命中、随机范围和真实任务映射测试，观察 RED。
- [x] 实现纯逻辑，验证每个便签都引用真实任务，奖励来自原规则；GREEN。

### Task 2: 原生分包页面与入口

Files: miniprogram/pages/companion/playground/index.{ts,wxml,wxss,json}、miniprogram/utils/companion-playground-renderer.ts、app.json、companion-page.ts、小屋和任务页入口。
Interfaces: 消费 Task 1；仅 commandCompanion(interact/claim) 写入存档；selectPartner、restart、cancelCountdown、goTasks、performNoteAction 为页面交互入口。

- [x] 写页面生命周期、幸运互动/幂领奖、错误/异步回流、导航与降级测试，观察 RED。
- [x] 实现 Canvas 舞台、原生翻卡便签、暂停、名单、幸运彩纸和可取消倒计时；GREEN。
- [x] 接入本人小屋和任务页，访客小屋不展示；注册分包路由与工程测试脚本。

### Task 3: 验证与交接

- [x] 在真实 cwd 执行 npm run check，465 项工程测试与全部质量检查通过；36 组浏览器检查、官方 WXML/WXSS 离线编译通过。
- [x] 独立审查本轮文件，修复确认问题并复验。
- [x] 更新 THIRD_PARTY_NOTICES、CURRENT_LOCAL_INTEGRATION、交付说明与导航 registry；refresh/check。

## Ledger

- Ruling: 用户已授权直接实现、细节由实现者决定；采用 inline 执行，不增加方案/计划审批轮次。
- Ruling: 当前源码已经是隔离 linked worktree；继续在此修改，保留脏工作区，不创建或移动 worktree。
- Pre-flight: Task 2 消费 Task 1 的 PlaygroundRound 与任务便签，字段和命令来源在接口中固定；Task 3 验证完整集成。
- BASE: c823646da19573817551fb824821a5196f0285f7；该 HEAD 不含完整成品，以本轮开始时现场文件快照为增量基准。
- Task 1: complete，物理/触摸/任务映射 8 项 GREEN。
- Task 2: complete，页面/存储/奖额/跨日/导航等 17 项 GREEN，合计 25 项专项。
- Ruling: Node 测试不能把所有 Math.random 固定为零，否则同毫秒真实请求 ID 冲突；采用保持首角色幸运但请求 ID 不同的递增种子，不改变生产请求规则。
- Ruling: 原分包边界测试枚举旧六页；用户已批准第七页，保留并更新准确页清单，不放宽验证。
- 独立审查确认问题：导航栈复用、晚到失败回调、滚动触摸、滑动误触、跨日、幸运便签重开。均已补回归并修复；实际模板检查另捕获长表达式被格式化换行的渲染问题，已拆成条件节点。
- Ruling: 便签出现后滚入可见区域，倒计时另设固定取消条，确保短屏可取消。草地底部装饰文字移除，避免压住角色名字。
- Ruling: 遵守用户工作区与 Git 边界，成品留在原 linked worktree，不提交、推送、合并或清理工作树。
- Task 3: complete；匹配最终源码的 465 测试、36 组浏览器及两个官方离线编译器通过。263 个未涉及运行文件哈希保持，Git HEAD、版本与发布部署记录保持。
