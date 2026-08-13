# iSdu

> 基于校园地图的个人空间日记

“iSdu”是一款面向山东大学校园生活的微信小程序。它把一张二维校园插画地图变成个人日记：用户在校园位置上留下照片、文字、地点、心情和时间，之后既可以回答“我在哪里留下过记忆”，也可以按时间轴回答“那是什么时候”。

## 比赛版定位

比赛版严格限定为：单用户、单校区、无社交功能的校园地图个人日记。

核心体验：

```text
校园地图选点
→ 添加照片与文字
→ 保存个人日记
→ 地图原位置出现记忆标记
→ 点击标记回看
→ 时间轴按月回顾
→ 地图与时间轴互相跳转
```

评论、点赞、好友、公开动态、GPS、多校区、AI 生成日记和管理后台等长期功能不进入比赛 MVP。

## 当前阶段

当前处于“基于本地数据的校园地图日记完整闭环”人工验收阶段：

- 已建立项目执行规则。
- 已完成候选仓库、许可证、维护状态和兼容风险评估。
- 已确定技术栈和集成边界。
- 已完成 `1280 × 960` 二维插画地图、拖动、缩放、复位和中心准星比例选点。
- 已建立 Memory 模型、版本化本地 Repository、首次 Demo Seed 和损坏数据处理。
- 已实现 1—3 张照片选择与用户目录持久化，新建、编辑和删除都有文件回滚或清理规则。
- 已打通地图选点 → 保存 → 星点 → 详情 → 编辑 / 删除 → 重启读取的本地闭环。
- 已创建地图、记录、时光三个底部 Tab；时间轴与个人页仍是当前范围外的占位页面。
- 已精确安装 `tdesign-miniprogram@1.15.3`，只使用 Button 和 Empty。
- 37 项坐标、Memory、Repository 和本地图片自动测试以及 TypeScript、ESLint、Prettier 检查已通过。
- 尚待在微信开发者工具中重新构建 npm、编译并完成完整闭环与真机冒烟测试。
- 尚未接入 CloudBase、GPS、登录、社交、正式时间轴或个人统计。

## 已确定的技术路线

- 微信原生小程序。
- TypeScript + WXML + WXSS。
- WebView 渲染器作为比赛版基线。
- `tdesign-miniprogram` 作为唯一正式 UI 组件库，按需注册组件。
- 自研二维插画地图画布：`movable-area` / `movable-view` + 比例坐标。
- 本地 Demo Repository 与 CloudBase Repository 共享统一接口。
- 正式数据使用 CloudBase 文档数据库与云存储，并设置仅创建者可读写。
- TypeScript 类型检查、ESLint、Prettier、纯逻辑测试和真机关键流程检查。

完整理由与风险见 [技术栈决策](docs/TECH_STACK_DECISION.md)。

## 当前目录

```text
.
├── AGENTS.md
├── README.md
├── package.json
├── package-lock.json
├── project.config.json
├── tsconfig.json
├── docs/
│   ├── OPEN_SOURCE_EVALUATION.md
│   ├── TECH_STACK_DECISION.md
│   ├── INTEGRATION_PLAN.md
│   ├── THIRD_PARTY_NOTICES.md
│   ├── RISK_REGISTER.md
│   ├── STATUS.md
│   ├── MANUAL_SETUP.md
│   ├── MANUAL_TEST_CHECKLIST.md
│   ├── MAP_COORDINATE_SYSTEM.md
│   ├── LOCAL_DATA_DESIGN.md
│   └── NEXT_TASK_PROMPT.md
└── miniprogram/
    ├── config/
    ├── data/
    ├── models/
    ├── services/
    ├── utils/
    ├── components/
    ├── assets/
    └── pages/
```

## 关键设计约束

- 地图标记保存 `xRatio` / `yRatio`，不得保存固定屏幕像素。
- 地图、标记必须在同一缩放和平移容器内，避免不同机型下漂移。
- 比赛版不申请定位权限，不使用 GPS。
- 日记和照片默认私有，不得公开读取。
- 正式第三方依赖和迁移代码必须保留许可证、版权与来源。
- 每轮只完成一个里程碑，完成后停止等待验收。

## 研究与决策文档

- [开源项目评估](docs/OPEN_SOURCE_EVALUATION.md)
- [技术栈决策](docs/TECH_STACK_DECISION.md)
- [集成计划](docs/INTEGRATION_PLAN.md)
- [第三方声明](docs/THIRD_PARTY_NOTICES.md)
- [风险登记册](docs/RISK_REGISTER.md)
- [项目状态](docs/STATUS.md)
- [地图比例坐标系统](docs/MAP_COORDINATE_SYSTEM.md)
- [本地数据与图片设计](docs/LOCAL_DATA_DESIGN.md)
- [开发者工具与真机手册](docs/MANUAL_SETUP.md)
- [本地闭环人工测试清单](docs/MANUAL_TEST_CHECKLIST.md)
- [骨架任务基线（已执行）](docs/NEXT_TASK_PROMPT.md)

## 当前验收

请先按 [人工配置与测试手册](docs/MANUAL_SETUP.md) 导入并构建，再逐项执行 [本地闭环人工测试清单](docs/MANUAL_TEST_CHECKLIST.md)。当前完整闭环通过开发者工具和至少一台真机验收前，不进入 CloudBase、正式时间轴、地图聚合或正式素材阶段。

当前仓库不提交 `node_modules`、`miniprogram_npm`、真实 AppID 或开发者工具私有配置。

## 许可证与原创性

项目仓库暂时保持私有，当前不添加 MIT 或其他项目自身的开源许可证；不对仓库自有内容作额外授权推断。

TDesign 已成为精确锁定的正式运行时依赖；其他候选仍不等于已经使用。依赖版本、许可证和使用范围见 [第三方声明](docs/THIRD_PARTY_NOTICES.md)。校园插画、空间坐标系统、空间日记交互和时光回放将作为本项目原创核心实现。
