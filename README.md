# iSdu · 心情日记与校园地图

参考 EMMO 的主要日记交互重新实现的微信原生小程序：用心情表情记录每天的小事，也能把日记留在校园地图上，通过原有好友系统按范围分享。

这是当前本地开发版本 `codex/emmo-journal`。可直接从本机体验模式运行；真实好友与云端照片需要配置微信 AppID 和 CloudBase。

[本轮交付与运行说明](docs/EMMO_JOURNAL_DELIVERY.md) · [开发者工具运行手册](docs/MANUAL_SETUP.md) · [云端安全配置](docs/CLOUDBASE_SECURITY_DEPLOYMENT.md) · [原 Social V2 说明](docs/SOCIAL_V2_README.md)

## 已实现

- **日记首页**：按月浏览心情表情墙、切换月份、同日多篇列表、全文和地点搜索。
- **写日记**：心情、日期、文字、最多 3 张照片、分类；支持补记、编辑和删除，也可以只记录心情。
- **文字草稿**：本机新建日记自动保留文字、心情和地点；从首页明确恢复，照片需重新选择；不会覆盖另一份未完成草稿。
- **照片墙与时光**：照片可进入所属日记，时光页保留原来的搜索、筛选和封面功能。
- **校园地图**：沿用现有中心校区插画底图、拖动缩放和标记；日记可选校园地点，再从详情定位。无地点日记保持独立，不产生虚假坐标。
- **好友**：接入既有邀请、双向好友、好友时光、近 24 小时好友地图和点赞；可见范围仍为仅自己、指定好友或全部好友，默认仅自己。

表情和底部图标为独立绘制，未使用 EMMO 的 APK 图片或反编译 Java 代码。商店、会员、画布、复杂富文本不在这轮主要日记功能范围内。

## 直接运行

1. 在微信开发者工具中导入本目录，识别根目录的 `project.config.json`。
2. 使用当前 `touristappid` 可体验本机日记。交付 ZIP 已附构建好的 `miniprogram/miniprogram_npm`；开发源码若没有该目录，先安装依赖，再选择“工具 → 构建 npm”。
3. 编译进入“日记”首页，点顶部金色加号，选心情并写下一篇日记；在“校园地点”中可关联插画地图位置。
4. “我的 → 数据管理”提供原云端与好友启用流程。配置真实 AppID、云函数、数据库权限和索引前，好友服务无法完成在线操作。

开发环境需要 Node.js `^22.15.0` 或 `>=24`、npm `>=10`：

```powershell
npm.cmd ci
npm.cmd run check
```

原生 TabBar：日记 / 校园 / 时光 / 我的。照片墙从日记首页或“我的”进入。

## 实现入口

| 位置                                            | 用途                               |
| ----------------------------------------------- | ---------------------------------- |
| `miniprogram/pages/journal`                     | 月份表情墙、同日列表、搜索         |
| `miniprogram/pages/editor`                      | 日记编辑、持久化和好友可见范围     |
| `miniprogram/pages/album`                       | 按月照片墙                         |
| `miniprogram/pages/location-picker`             | 校园选点与 EventChannel 返回       |
| `miniprogram/pages/map`                         | 现有校园地图、本人和好友标记       |
| `miniprogram/components/mood-face`              | 原创 CSS 心情表情                  |
| `miniprogram/utils/journal.ts`                  | 北京时间日期分组、日历和无地点标识 |
| `miniprogram/services/journal-draft-service.ts` | 本机文字草稿                       |
| `cloudfunctions`                                | 现有身份、好友、回忆与权限服务     |

完整检查覆盖自动测试、TypeScript、ESLint、Prettier 和安全扫描。官方模拟器、云端联调和真实设备验收分别记录，具体结果见本轮交付说明。

## 素材与使用说明

本项目用于作品展示与学习交流，不代表学校官方服务。第三方来源和许可证见 [第三方说明](docs/THIRD_PARTY_NOTICES.md)。项目自身为 `UNLICENSED`；校园地图沿用项目所有者提供的素材，未向第三方授予再利用许可。历史材料描述的版本与实测时间不代表本轮已经完成云端部署或真机验收。
