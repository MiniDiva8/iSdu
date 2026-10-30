# Profile and Wheel implementation plan

Goal: 按用户参考修改个人主页和心情/主题旋转选择，验证后上传 3.1.0rc.2 体验版。
Spec: docs/superpowers/specs/2026-10-25-profile-wheel-design.md
Baseline: 46abb56；现有 codex/emmo-journal 独立工程；inline execution。

## Global Constraints

- 原生 TypeScript / WXML / WXSS；现有 Repository、CloudBase、TDesign。
- 原创 CSS 表情与图形，不引入商业资源；保留已存在的云记录可见范围。
- 只上传此客户端体验版；其他候选和云函数保持现状。

## Review Focus

- 角度边界与惯性：数学回归验证，索引限制为当前枚举。
- 原生触点和快速操作：手势实例隔离、多指取消和确认防重复。
- 取消与页面返回：无日记写入；编辑结果保留原内容和可见范围。
- 偏好/统计：示例排除、同日去重、北京时间连续天数、清理失败提示。
- 异步重载：个人页退出或模式切换时不显示旧响应。

### Task 1: 转盘、偏好与统计模型

Files: utils/selection-wheel.ts, utils/profile-summary.ts, services/journal-preferences-service.ts and corresponding tests.
Interfaces: wheelIndexAtRotation, wheelRotationForIndex, wheelReleaseRotation, wheelPointAngle, normalizeWheelAngle；buildProfileSummary(memories, nowIso)；journalPreferencesService read/save/clear。

- [x] 观察角度/吸附、Unicode/连续天数、偏好验证与存储的失败测试。
- [x] 实现纯模型与偏好服务。
- [x] 新测试与类型检查通过，提交。

### Task 2: 原生转盘与个人设置

Files: pages/selection-wheel/_, pages/profile/_, pages/editor/_, pages/journal/_, pages/data-management/index.ts, scripts/profile-wheel-flows.test.mjs, app.json.
Consumes: Task 1 的模型与偏好；现有日期校验和日记/好友 Repository。
Produces: 全屏转盘、主页与编辑的确认返回、参考图式个人页、真实统计和默认值设置。

- [x] 新建导航、编辑确认/取消、默认值与旧记录、统计/偏好清理业务测试先失败。
- [x] 实现原生页面、旋转手势及设置布局；保留照片和权限业务。
- [x] 全套检查通过，提交。

### Task 3: 验证、审查与体验上传

Files: docs/PROFILE_WHEEL_RELEASE.md; private verification, staging and QR output under .verification/profile-wheel-rc2.

- [x] 官方 WXML/WXSS 编译与实际模拟器转盘手势/确认/取消通过。
- [x] 检查小屏与安全区的个人页、心情和主题转盘截图。
- [x] 一个新上下文代理进行整轮只读审查，重要问题以回归修复。
- [x] 以现有真实 AppID 建立私有上传副本，核对运行文件哈希；上传 3.1.0rc.2。
- [x] 核验微信后台体验标记、日记首页路径与当前体验码；保留日志并交付。
