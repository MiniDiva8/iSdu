# 当前本地整合与交付边界

整理日期：2026-10-30；现场源码：**3.2.0-rc.10**。本文汇总当前完整日记与 Pal 主线。微信与云端状态沿用匹配的 2026-10-29 交付证据，本次未重新登录平台验证这些外部状态。

## 已整合内容

| 功能         | 当前内容与说明                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 日记与编辑   | 心情墙、搜索、日期补记、文字草稿、相册、地点、偏好、首页本机背景；[日记交付](EMMO_JOURNAL_DELIVERY.md)                                                          |
| 好友与权限   | 主动邀请、双向好友、三档可见范围、点赞、好友近 24 小时地图；默认私有                                                                                            |
| 时光与记忆瓶 | 月份时间轴、本机封面、照片墙、Canvas 记忆瓶；[记忆瓶整合](MEMORY_BOTTLE_MERGE.md)                                                                               |
| 个人主页     | 心情/主题转盘、统计、动态头像及共享传感器；[动态头像](PROFILE_AVATAR_MOTION.md)                                                                                 |
| 拾光伙伴     | 8 角色、4 种途途静态姿态、22 正式家具及 2 旧收藏、场景、任务、收藏、来信和合影；[内容](COMPANION_CONTENT_DELIVERY.md)、[装饰扩展](COMPANION_DECOR_EXPANSION.md) |
| Pal 与游乐场 | 第五 Tab 进入小屋；草地、20 独立角色实例、任务便签与庆祝；[入口](PAL_TAB_ENTRY.md)、[游乐场](POTETO_FIDELITY_20261029.md)                                       |
| 贴纸         | 画笔/橡皮、文字、12 类素材、变换、撤销重做、本机草稿和 PNG 导出；[说明](DIARY_STICKER.md)                                                                       |
| 综合优化     | 图片并发与异常恢复、保存权限部分成功重试、列表可访问性、好友详情地图路径、合影回调隔离和小屋背景复用；[质量复核](QUALITY_REVIEW_20261029.md)                    |
| Pal AI       | 聊天与日记来信代码保留；云函数已部署的历史记录存在，但官方服务连通超时，AI 保持暂停；[接入状态](PAL_AI_SETUP.md)                                                |

伙伴稳定 ID、原存档、余额和用户名字继续保留。旧公开圈子留在独立历史线；扫码体验网站也保持独立工程，不合入小程序运行目录。

## 验证与外部状态

- 本次重新执行的完整工程检查、文件与安全核对，以 [GitHub 同步记录](GITHUB_SYNC_20261030.md) 为准。
- 2026-10-29 的 rc10 冻结交付记录：697 项测试及类型/lint/格式/安全通过，32 WXML/34 WXSS 官方离线编译通过，262 个运行源文件与上传工程哈希一致。该统计是当时证据，不代替本次检查。
- 体验版历史：3.2.0rc.10 已上传且后台体验标记已核验，详见[rc10 交付](EXPERIENCE_RELEASE_3_2_RC10.md)。
- 伙伴云函数历史：companion-api 已部署，真实内容检测和手机双账号待验收；memory-api 的部分本地增量尚未部署。见[伙伴云服务](COMPANION_CLOUD_SETUP.md)。
- Pal AI 历史：pal-ai 已部署，模型调用保持关闭；未解决连通问题。GitHub 同步不修改服务端开关或预算。
- 真机、真实双账号、正式审核和线上当前状态，本次均未重新核验。不把本地测试或浏览器模拟当作设备验收。

## 工作位置与恢复

本机稳定入口为 `D:/Codex/Projects/DesktopProjects/iSdu/code/current`，真实源码以导航工具现场输出为准。本次对应 `D:/Codex/Projects/DesktopProjects/iSdu-Fqin/.worktrees/emmo-memory-bottle`，Git common directory 保留在共享日记工作树内。

```powershell
node "D:/Codex/Projects/DesktopProjects/iSdu/tools/project-context.mjs" context
node "D:/Codex/Projects/DesktopProjects/iSdu/tools/project-context.mjs" find 伙伴 --kind module
```

独立 clone 不依赖这些本机路径，直接在仓库根目录运行 `npm.cmd ci` 和 `npm.cmd run check`。模块与资料的可读索引见 [PROJECT_MATERIALS.md](PROJECT_MATERIALS.md)，结构化摘要见 [PROJECT_INDEX.json](PROJECT_INDEX.json)。

旧整合说明与本次改写前的文档副本保存在本机导航根 `archive/instructions-before-20261030/github-sync`；各功能的原交付说明继续保留。历史 c823646 只覆盖早期转盘检查点，完整成品以本次同步提交与实际文件为准。

## 后续范围

校园记忆小世界等升级仍为待确认提案。本次只整理和同步已有成果，不因历史待办或候选方案继续开发。后续改动入口、模块或真实发布状态后，维护本机 PROJECT_STATE.json 并执行 refresh/check；独立 clone 同步更新对应交付文档。
