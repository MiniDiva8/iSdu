# 文档导航

[返回项目首页](../README.md)

第一次了解 iSDU，建议先阅读 [项目与技术导读](PROJECT_GUIDE.md)，再按兴趣查看对应实现。本文档索引面向默认分支 Social V2。

## 快速了解与运行

| 文档                                                                          | 内容                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------ |
| [项目与技术导读](PROJECT_GUIDE.md)                                            | 项目价值、关键设计取舍、源码入口、五分钟演示路线 |
| [开发者工具运行手册](MANUAL_SETUP.md)                                         | 安装依赖、导入项目、本地体验、云端准备与排错     |
| [比赛介绍 PPT](https://github.com/MiniDiva8/iSdu/releases/tag/competition-v2) | 已归档的 Social V2 比赛展示材料                  |

## 理解设计

| 文档                                     | 内容                                 |
| ---------------------------------------- | ------------------------------------ |
| [地图坐标系统](MAP_COORDINATE_SYSTEM.md) | 比例坐标、缩放、拖动与选点           |
| [本地数据设计](LOCAL_DATA_DESIGN.md)     | 记录结构、持久化、照片与恢复         |
| [Social V2 设计](SOCIAL_V2_DESIGN.md)    | 身份、好友、分享范围、点赞与好友地图 |
| [技术栈决策](TECH_STACK_DECISION.md)     | 平台与依赖选择的背景                 |
| [界面设计系统](UI_UX_2_DESIGN_SYSTEM.md) | 视觉与交互约定                       |

## 云端配置与验证

| 文档                                                                                                                    | 内容                                 |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| [CloudBase 安全部署](CLOUDBASE_SECURITY_DEPLOYMENT.md)                                                                  | 数据权限、索引、云存储与部署顺序     |
| [身份配置](CLOUDBASE_IDENTITY_SETUP.md) · [回忆配置](CLOUDBASE_MEMORY_SETUP.md) · [好友配置](CLOUDBASE_FRIEND_SETUP.md) | 分模块部署说明                       |
| [Social V2 双账号验收](SOCIAL_V2_MANUAL_TEST.md)                                                                        | 跨账号访问、撤权、好友关系与异常验证 |
| [人工测试清单](MANUAL_TEST_CHECKLIST.md)                                                                                | 本地体验、设备与交互检查             |
| [隐私指引草案](PRIVACY_GUIDE_DRAFT.md)                                                                                  | 平台隐私声明的配置参考               |
| [第三方与素材说明](THIRD_PARTY_NOTICES.md)                                                                              | 第三方许可证及素材使用边界           |

## 历史记录与维护资料

[STATUS.md](STATUS.md)、[RELEASE_READINESS.md](RELEASE_READINESS.md)、[AI_HANDOFF.md](AI_HANDOFF.md)、[INTEGRATION_PLAN.md](INTEGRATION_PLAN.md)、[RISK_REGISTER.md](RISK_REGISTER.md)、[NEXT_TASK_PROMPT.md](NEXT_TASK_PROMPT.md) 保留开发过程与阶段性待办。

这些文件记录的时间和范围不同；早期“尚未部署”不应覆盖后续实测记录，后续“闭环跑通”也不代表全部安全清单完成。对外阅读先看 [版本与验证说明](PROJECT_GUIDE.md#版本与验证说明)，追溯过程时再查原始记录。

[开源方案评估](OPEN_SOURCE_EVALUATION.md)用于说明技术调研背景；第三方实际使用情况以 [第三方说明](THIRD_PARTY_NOTICES.md)为准。
