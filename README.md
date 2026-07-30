# 山大迹忆

> 基于校园地图的个人空间日记

“山大迹忆”是一款面向山东大学校园生活的微信小程序。它把一张二维校园插画地图变成个人日记：用户在校园位置上留下照片、文字、地点、心情和时间，之后既可以回答“我在哪里留下过记忆”，也可以按时间轴回答“那是什么时候”。

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

当前处于“最小微信原生 TypeScript 小程序骨架”里程碑：

- 已建立项目执行规则。
- 已完成候选仓库、许可证、维护状态和兼容风险评估。
- 已确定技术栈和集成边界。
- 已创建五个占位页面和地图、记录、时光三个底部 Tab。
- 已建立本地 Demo 模式配置与最小 Repository 占位接口。
- 已精确安装 `tdesign-miniprogram@1.15.3`，只使用 Button 和 Empty。
- 命令行 TypeScript、ESLint 检查已通过。
- 尚待在微信开发者工具中构建 npm、编译、预览并完成真机冒烟测试。
- 尚未配置 AppID 或 CloudBase 环境。
- 尚未开发正式地图、日记、时间轴数据或统计功能。

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
│   └── NEXT_TASK_PROMPT.md
└── miniprogram/
    ├── config/
    ├── services/repository/
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
- [开发者工具与真机手册](docs/MANUAL_SETUP.md)
- [骨架任务基线（已执行）](docs/NEXT_TASK_PROMPT.md)

## 当前验收

请先按 [人工配置与测试手册](docs/MANUAL_SETUP.md) 在微信开发者工具完成构建 npm、模拟器编译和至少一台真机冒烟测试。本轮通过人工验收前，不进入地图技术原型。

当前仓库不提交 `node_modules`、`miniprogram_npm`、真实 AppID 或开发者工具私有配置。

## 许可证与原创性

项目仓库暂时保持私有，当前不添加 MIT 或其他项目自身的开源许可证；不对仓库自有内容作额外授权推断。

TDesign 已成为精确锁定的正式运行时依赖；其他候选仍不等于已经使用。依赖版本、许可证和使用范围见 [第三方声明](docs/THIRD_PARTY_NOTICES.md)。校园插画、空间坐标系统、空间日记交互和时光回放将作为本项目原创核心实现。
