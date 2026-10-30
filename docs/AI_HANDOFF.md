# 开发交接入口

先读 [README](../README.md)、[当前整合与边界](CURRENT_LOCAL_INTEGRATION.md)及[本次同步](GITHUB_SYNC_20261030.md)，再按功能读取匹配源码和专项说明。当前 package.json 为 3.2.0-rc.10；日记、Pal、小屋、游乐场、记忆瓶、动态头像、贴纸均在当前主线，AI 保持暂停。

## 在本机继续

```powershell
node "D:/Codex/Projects/DesktopProjects/iSdu/tools/project-context.mjs" context
node "D:/Codex/Projects/DesktopProjects/iSdu/tools/project-context.mjs" find 伙伴 --kind module
```

从 context 输出的真实源码路径执行工程命令。导航根不是聚合 Git 仓库；保留共享日记 .git、linked worktree、所有现有未提交改动和源图。登记事实改变后更新 PROJECT_STATE.json 并执行 refresh/check。

## 从 GitHub clone 继续

在本仓库根目录执行 npm.cmd ci、npm.cmd run check，再用微信开发者工具导入。无需恢复本机外部 junction。公共配置使用游客 AppID；按 [运行手册](MANUAL_SETUP.md) 和 [安全部署说明](CLOUDBASE_SECURITY_DEPLOYMENT.md) 自行配置服务，私有配置保持忽略。

## 不能混淆的状态

源码、本机自动检查、浏览器模拟、微信原生编译、真机、体验版、正式版与云部署分别记录。小屋存档、稳定 ID、余额和用户名字不能擅自重置。旧公开圈子和扫码网站是独立历史/工程，不能覆盖当前日记线。

GitHub 同步不授权部署、微信上传、启用 AI 或正式提审。校园记忆小世界等新升级仅为候选提案，用户确认前不实施。[PROJECT_INDEX.json](PROJECT_INDEX.json) 是本次便携摘要；[PROJECT_MATERIALS.md](PROJECT_MATERIALS.md) 可定位原图、比赛 PPT、视频和独立网站。
