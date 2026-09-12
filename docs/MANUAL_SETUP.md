# 微信开发者工具运行手册

适用版本：默认分支 `codex/social-v2`（Social V2）。文档整理日期：2026-09-12。

[返回项目首页](../README.md) · [文档导航](README.md)

## 1. 获取代码与安装依赖

准备 Node.js `^22.15.0` 或 `>=24`、npm `>=10` 和微信开发者工具。

```sh
git clone --branch codex/social-v2 --single-branch https://github.com/MiniDiva8/iSdu.git
cd iSdu
npm ci
npm run check
```

在 Windows PowerShell 中，如果 `npm.ps1` 被执行策略限制，请使用：

```powershell
npm.cmd ci
npm.cmd run check
```

无需为此修改系统执行策略。依赖版本以仓库中的 `package-lock.json` 为准。

## 2. 导入项目并构建 npm

1. 在微信开发者工具中选择“导入项目”。
2. 选择包含 `project.config.json` 的仓库根目录，项目名称填写 iSDU。
3. 公共配置使用 `touristappid` 占位。游客模式能力受开发者工具限制；需要云能力或真机预览时，使用自己有权限的小程序 AppID。
4. 选择“工具 → 构建 npm”，确认生成 `miniprogram/miniprogram_npm/tdesign-miniprogram`。
5. 点击“编译”，检查控制台首个错误。

不要导入 `miniprogram` 子目录。更换依赖或重新安装后应重新构建 npm；构建产物已被 Git 忽略。

## 3. 先体验本地记录

当前 [运行配置](../miniprogram/config/runtime.ts)以 `mode: 'local'` 起步，并提供可选云功能入口。Social V2 已包含 CloudBase 与好友功能，本地记录体验不要求先完成云端部署。

1. 首屏查看校园插画地图，试用拖动、缩放与复位。
2. 点击“记录此处”，让中心准星落在目标地点，再确认位置。
3. 添加 1–3 张测试照片，填写文字、地点和心情后保存。
4. 点击地图标记查看详情，验证编辑与删除。
5. 在“时光”中搜索或按月份回顾，再跳回地图位置。
6. 关闭后重新打开，确认记录与照片仍在。

首次使用应呈现空状态，不会自动写入演示日记。请使用自己有权展示的测试照片。

应用启动会尝试初始化云能力；如果只需隔离云初始化进行本地调试，可在本机将 `runtimeConfig.cloudEnabled` 暂设为 `false`，并在提交前检查这项调试改动。不要把未配置云端导致的错误误判成本地记录丢失。

## 4. AppID 与本机配置

真实 AppID、环境 ID 与私有配置不应进入 Git。项目已忽略 `project.private.config.json`。

在开发者工具中配置自己有访问权限的小程序，随后检查工具实际显示的 AppID。不同工具版本对配置的写入行为可能不同；提交前必须检查公共文件：

```sh
git check-ignore project.private.config.json
git diff -- project.config.json
git status --short
```

若工具把真实 AppID 写入公共配置，在提交前将公共 `appid` 恢复为 `touristappid`。本机显示正确的 AppID 与公共仓库不含真实配置，需要分别确认。

## 5. 开启云端与好友功能

完整步骤见 [CloudBase 安全部署](CLOUDBASE_SECURITY_DEPLOYMENT.md)，分模块说明见 [身份](CLOUDBASE_IDENTITY_SETUP.md)、[回忆](CLOUDBASE_MEMORY_SETUP.md)与 [好友](CLOUDBASE_FRIEND_SETUP.md)。

需要准备：

- 自己有权限的小程序及与之关联的 CloudBase 环境。
- 文档要求的集合、索引、数据库权限与私有云存储规则。
- `auth-api`、`memory-api`、`friend-api` 三个云函数。
- 两个有测试访问资格的微信账号。

完成配置后再开启云端功能，使用可丢弃记录验证私密备份、邀请确认、共享与点赞。迁移全部成功且核验完成后才切换云端主数据，本地副本保留。

不要把数据库或云存储改为公开读写来绕过权限错误。保留公共配置的 `urlCheck: true`，按实际错误核对平台配置。

## 6. 真机预览与验收

在开发者工具中使用自己有权限的 AppID，点击“预览”，由具备访问资格的微信账号扫码。预览入口的访问权限需由小程序管理员配置。

至少分别记录 iOS、Android 的设备与微信版本，检查：

- 首屏、底部安全区、地图拖动缩放与准星选点。
- 保存、编辑、重启后读取、删除与照片缺失状态。
- 本地模式断网后的记录回顾；云端弱网下的错误提示。
- 两个账号间的邀请、可见范围、删除好友、重新建立关系、重复点赞与图片访问。

完整清单见 [本地人工测试](MANUAL_TEST_CHECKLIST.md)和 [Social V2 双账号测试](SOCIAL_V2_MANUAL_TEST.md)。

主包大小、总包大小与编译耗时应从开发者工具记录，不用源码目录大小或 npm 包大小代替。命令行检查通过不代表这些设备与平台项目已验收。

## 7. 常见问题

| 现象                         | 优先检查                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------- |
| 找不到 TDesign 组件          | 仓库根目录执行 `npm ci`，再在开发者工具中“构建 npm”                           |
| TypeScript 没有编译          | 公共配置包含 `useCompilerPlugins: ["typescript"]`；先运行 `npm run typecheck` |
| 页面白屏                     | 查看控制台第一条错误，确认导入的是根目录、npm 已构建、页面路径正确            |
| 基础库版本不可用             | 选择开发者工具实际提供的兼容版本，并检查私有配置中的旧版本覆盖                |
| 预览不可用                   | 核对 AppID、微信开发成员资格及当前登录账号                                    |
| 好友或云端功能报错           | 核对环境关联、云函数部署、集合索引与权限，按云端文档排查                      |
| PowerShell 禁止运行 npm 脚本 | 使用 `npm.cmd`，保留系统执行策略                                              |
