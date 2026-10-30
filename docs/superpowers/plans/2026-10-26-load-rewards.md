# 加载、批量领取与云提示 Implementation Plan

> 本会话采用 superpowers:executing-plans 直接实施；用户已要求直接操作。保留未提交工作，不创建提交。

**Goal:** 基于 3.2.0rc.3 减少加载等待，增加一键领取并解释云端状态。
**Architecture:** Repository 上的本人日记短期内存缓存、页面保留内容、云端批量图片地址；伙伴奖励仍由原有纯函数计算并整体落盘。
**Tech Stack:** 微信原生 TypeScript / WXML / WXSS，Node test。
**Spec:** docs/superpowers/specs/2026-10-26-load-rewards-design.md

## Global Constraints

保留 rc.3 与既有动态头像等未提交实现。仅本人日记可缓存；好友每次实时验权。无新增依赖。未授权上传、部署、提交、推送。缓存为 30 秒内存数据，不落盘。

## Review Focus

- 模式切换或删除后旧请求不能恢复陈旧内容。
- 手动刷新失败不能被旧缓存伪装为成功。
- 再入页保留内容，但切换账号/模式必须清除。
- 批量签发不能错配图片，且每批不超过 50。
- 批量与单项领取并发、存储失败和跨北京时间零点必须保持奖励一致。

### Task 1: 日记数据与页面加载

- [x] 写回归并观察失败：MemoryService 请求合并、30 秒过期、写失效、强制刷新；journal/timeline 再入保留与失效。
- [x] MemoryService 增加 getCachedMemories / invalidateList / listMemories(forceRefresh=false)，写操作前后失效；不缓存本地直读和好友查询。
- [x] 首页年月日期先显示；journal/timeline 从同一缓存渲染并以版本和 scope 避免过期回流。下拉调用 forceRefresh=true。
- [x] memory-handler 的 listMine 按 50 文件批量签发且映射回每条回忆；测试多批、空列表、所有权。
- [x] 运行相关 Node 回归与类型检查，保存结果。

### Task 2: 一键领取

- [x] 写 claimAll 测试并观察失败：仅合格任务、并发、写失败、午夜。
- [x] 引擎增加 claimAll，service 只读一次事实和只写一次状态；页面显示可领取数量和总光点并提供按钮。
- [x] 复用原 action lease，保留正常成功时派生状态刷新和重入修复，避免遗漏或重复 reload。
- [x] 运行伙伴测试与交互回归。

### Task 3: 云提示、交接与总验收

- [x] 写错误分类回归并观察失败；仅明确函数不存在才提示服务未开通，通用失败不归因好友。
- [x] 修正做客时空主人名与统一标题，保留私密状态边界。
- [x] 补充云部署步骤、客户端/后端生效边界和当前验证记录。
- [x] 完整 npm run check；布局/交互预览；更新 PROJECT_STATE 对应模块和 refresh/check，发布记录维持 rc.3 原快照。
