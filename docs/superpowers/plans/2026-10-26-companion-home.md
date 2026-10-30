> 2026-10-26 用户追加要求：宠物、装饰等正式形象正在另一边设计，稍后提供。本轮先完成可运行框架，
> 不定稿美术或生成正式宠物/家具素材。目录、尺寸、锚点和动画统一走可替换素材配置。
> 以下数量、名字和费用是框架预览配置，收到用户设计后可以替换；本轮不部署或上传覆盖现有体验版。

# 校园伙伴小屋 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, with one final independent whole-feature review. User explicitly delegated design and implementation details.

**Goal:** 在当前完整日记/个人页/转盘/记忆瓶基线上加入可玩的原创伙伴小屋与受控好友来访。
**Architecture:** 独立本机养成状态、纯奖励引擎、Canvas 场景与细分原生页面；新增云函数只负责主动发布的家园快照和好友留言。
**Tech Stack:** 微信原生 TypeScript/WXML/WXSS、Canvas 2D、现有 TDesign、CloudBase。
**Spec:** docs/superpowers/specs/2026-10-26-companion-home-design.md

## Global Constraints

- 保留 3.1.0-rc.3 所有现有功能和用户修改，不改日记记录/隐私契约。
- 原创 8 个皮肤、6 个装饰、12 个家具；免费光点与星屑，不含付费。
- 存储键 isdu:companion:v1；DPR <= 2；家具 <= 40；留言 <= 80 字。
- 小屋默认仅自己可见；好友访问由服务端可信身份和实时双向关系校验。
- 不把脚本或模拟器结果冒充实机通过；未明确授权不部署云函数。

## Review Focus

- 多次点击/异步返回不能重复领奖或扣费；操作失败后页面和存档一致。
- 跨北京时间零点、补签和倒退时钟不能产生无限奖励。
- 对损坏存档、满仓库、所有皮肤已拥有都必须给出可恢复行为。
- 页面隐藏/卸载后，动画和过时异步响应不能继续写页面。
- 访客伪造主人、好友关系撤销、留言检测服务失效不能越权或写入。

### Task 1: 养成引擎与存储

Files: miniprogram/models/companion.ts; miniprogram/data/companion-catalog.ts;
miniprogram/utils/companion-engine.ts; miniprogram/services/companion-service.ts;
对应 *.test.mjs。
Interfaces: createCompanionState(nowIso), applyCompanionCommand(state, command, facts, nowIso, random),
buildCompanionTasks(state, facts, nowIso), buildCompanionLetters(state,facts,nowIso);
companionService.read(), dispatch(command), facts(), clear()。

- [x] 先写签到/补签、重复奖励、抽取、库存、异常存储测试并观察失败。
- [x] 实现模型、目录、纯引擎与单键原子存储；状态损坏不写入。
- [x] 专项测试、类型检查通过。

### Task 2: 受控云展示与来访

Files: cloudfunctions/companion-api/{index.js,config.json,package.json,lib/*};
miniprogram/services/repository/cloud-companion-repository.ts; 对应测试。
Interfaces: getMine, publishHome(snapshot,visibility,expectedRevision),
getHome(targetUserId), visitHome(targetUserId,requestId,message?),
listVisits, deleteVisit(id), deleteMyData。
Response envelope: {ok,data,requestId} / {ok:false,code,message,requestId}。
Home snapshot: {name,skinId,accessoryId,theme,placements:[{id,itemId,x,y,rotation}]}。

- [x] 先写可信身份、目标好友权限、撤销、幂等、限流、审核失败测试并观察失败。
- [x] 新集合服务端读写；公开快照白名单与版本冲突；留言审核失败关闭写入。
- [x] Repository 校验响应，不返回内部身份或伪装成成功。
- [x] 权限与库测试通过；写明部署权限/索引和完整删除步骤。

### Task 3: 场景与资产

Files: miniprogram/utils/companion-scene.ts, companion-artwork.ts;
miniprogram/pages/companion/index.*;
miniprogram/data/companion-assets.ts; 用户后续提供的素材目录。
Interfaces: screenToWorld, worldToScreen, clampCamera, stepCompanion;
createCompanionSceneRenderer(ctx,viewport,snapshot,offscreenFactory)。

- [x] 先写比例坐标、缩放、行走速度、隐藏清理与家具命中回归并观察失败。
- [x] 实现中性占位与可替换素材、精灵图单帧缩略图适配。
- [x] 实现领取、引导、行走、互动、相机、布置和访客只读模式。
- [x] 检查缓存复用/降级、DPR 和隐藏后的 RAF/计时器清理。

### Task 4: 玩法页面与原页面接入

Files: pages/companion-{tasks,collection,mail,card,photo}/index._;
pages/journal/index._, pages/profile/index._, pages/friends/index._;
pages/data-management/index.ts; app.json; package*.json; project.config.json;
scripts/companion-flows.test.mjs。

- [x] 先写领取/签到/兑换/换装/信箱、日记原页保留、清理失败与异步返回测试。
- [x] 实现所有原生页面与错误/空状态；图库、家具商店和抽取显示真实余额和概率。
- [x] 接入日记/个人页和好友来访；清除数据包含新存档与主动发布的云家园。
- [x] 添加 3.2.0-rc.1 版本和专项检查，原套件全部通过。

### Task 5: 验证与交付

Files: .verification/companion-20261026/*; docs/COMPANION_HOME.md; README.md。

- [x] 浏览器多尺寸和完整闭环，微信原生编译/互动/卡片 PNG 导出；相册权限留待设备验收。
- [x] 全套 npm run check 和源文件保留复核。
- [x] 一次新上下文独立全功能复核，实质问题回归修复。
- [x] 保存可审查框架、后端部署说明和占位截图，等待用户正式素材；本轮不发布。
