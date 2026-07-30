# 技术栈决策

决策日期：2026-07-30

## 1. 最终决策摘要

| 决策项 | 选择 | 本轮是否实施 |
|---|---|---|
| 目标平台 | 微信原生小程序 | 否；下一里程碑建骨架 |
| 语言 | TypeScript | 否；下一里程碑配置 |
| 模板与样式 | WXML + WXSS | 否 |
| 渲染器 | WebView | 否；骨架中明确，不启用 Skyline |
| 主 UI | `tdesign-miniprogram` | 否；下一里程碑按需安装 |
| Vant / WeUI | 不作为正式依赖 | 无需安装 |
| 云端 | 微信云开发 CloudBase 文档数据库 + 云存储 | 否；P0 云端里程碑再接入 |
| CloudBase Skills | 当前不安装；云端里程碑再做项目级评估 | 否 |
| 地图 | 自研插画地图画布与比例坐标 | 否；地图里程碑实施 |
| 本地 Demo | Repository 接口 + `wx` 本地存储/本地文件 | 否 |
| 质量工具 | TypeScript、ESLint、Prettier、单元测试、开发者工具/真机检查 | 否 |

## 2. 为什么使用微信原生小程序

选择：是。

原因：

- 目标交付就是微信小程序，原生技术路线减少跨端构建层和真机差异。
- `movable-area`、`movable-view`、图片、存储和 CloudBase 都有原生能力。
- 比赛只需要单平台，不需要用 uni-app、Vue 或 React 换取跨端收益。
- 25 天内更需要可控的包体、调试链和微信审核兼容性。

风险与处理：

- 原生组件抽象能力弱于 Web 框架：用清晰的页面、业务组件、Repository 和纯函数分层解决，不引入额外框架。
- 开发者工具与真机可能不同：每个 P0 页面完成后至少在一台真机做关键流程检查。

## 3. 为什么使用 TypeScript

选择：TypeScript，而不是纯 JavaScript。

原因：

- 比例坐标、地图视口、日记模型、本地/云 Repository 接口都容易因字段不一致产生难定位错误。
- 编辑与详情共享数据模型，TypeScript 可以减少空字段、日期和图片状态的回归。
- 微信官方 `miniprogram-demo` 当前工程已使用开发者工具 TypeScript 编译插件，技术路线有官方参考。
- TDesign 源码和类型体系以 TypeScript 为主，调用体验更好。

实施方式：

- 由微信开发者工具的 TypeScript 编译插件处理小程序源文件。
- 使用官方小程序 API 类型定义。
- 核心模型不使用 `any`；外部数据先按 `unknown` 校验再进入业务层。
- `tsconfig`、ESLint 和开发者工具编译目标必须一致。

风险与处理：

- 配置复杂度高于 JavaScript：下一里程碑只创建一个页面和最小配置，先验证构建。
- 开发者工具类型转换可能与命令行不同：同时运行命令行类型检查与开发者工具编译。
- 若下一里程碑的 TypeScript 编译在目标开发者工具出现阻断，先修配置；不得直接把整个项目降级成 JavaScript，除非形成书面变更决策。

## 4. UI 组件库决策

选择：`tdesign-miniprogram`，作为唯一正式 UI 组件库。

### 选择 TDesign 的理由

- 腾讯维护、MIT、原生微信小程序、近期仍有仓库和 npm 发布活动。
- 目标组件覆盖完整，能支持表单、图片、反馈、空状态、加载、标签、TabBar 和弹层。
- 自定义主题和组件粒度适合建立温暖、安静、校园青春感的视觉系统。
- npm 包声明 0 运行时依赖，供应链面相对可控。
- 相比 Vant，小程序包发布和维护更活跃；相比 WeUI，组件丰富度和视觉可塑性更合适。

### 使用规则

- 固定经过验证的精确版本并提交 lockfile，不使用无上限的 `latest`。
- 每个页面只在自身 JSON 中注册实际使用的组件。
- 下一里程碑只验证 Button、Loading/Toast 或 Empty 等极少数基础组件。
- Upload、Calendar、Swiper、ActionSheet 等在真正需要时再注册。
- 用项目设计 token 和自定义 WXSS 覆盖品牌颜色、圆角、间距和阴影，不复制零售模板主题。
- 不同时安装 Vant 或 WeUI。

### 渲染器限制

比赛版固定 WebView，不启用 Skyline。TDesign 的开放适配清单显示多个候选组件尚未完成 Skyline 适配；Vant 和 WeUI 也有公开 Skyline 兼容 Issue。切换渲染器不属于 P0。

### 风险与处理

- 包体：每增加一组组件后记录开发者工具的主包/总包数据；未使用组件不得注册。
- 真机差异：对 Upload、Dialog、Popup、Swiper 等复杂组件分别做真机检查。
- 风格过于企业化：通过自有设计 token 和业务组件包装处理，但不 fork 组件库。
- 升级回归：比赛前冻结版本，升级必须有明确修复目标和回归清单。

## 5. CloudBase 使用方式

选择：微信小程序原生 `wx.cloud` 路线，文档数据库保存日记，云存储保存图片；不单独搭建服务器。

### 架构边界

业务层只依赖统一接口：

```ts
interface DiaryRepository {
  list(filter?: DiaryFilter): Promise<Diary[]>;
  getById(id: string): Promise<Diary | null>;
  create(input: CreateDiaryInput): Promise<Diary>;
  update(id: string, patch: UpdateDiaryInput): Promise<Diary>;
  remove(id: string): Promise<void>;
}
```

实现分为：

- `LocalDiaryRepository`：开发和五分钟演示的本地 Demo。
- `CloudDiaryRepository`：正式模式的 CloudBase 文档数据库与云存储。

页面不得直接散落 `wx.getStorage`、数据库和上传调用。模式切换由单一配置入口决定。

### 数据模型草案

```ts
interface MapPoint {
  xRatio: number; // 0..1
  yRatio: number; // 0..1
}

interface DiaryPhoto {
  id: string;
  localPath?: string;
  fileId?: string;
  status: 'local' | 'uploading' | 'ready' | 'failed';
}

interface Diary {
  id: string;
  ownerId?: string; // 云端由身份与安全规则约束，客户端不自行信任
  content: string;
  placeName: string;
  mood: string;
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
  point: MapPoint;
  photos: DiaryPhoto[];
  schemaVersion: 1;
}
```

### 数据库安全

- 集合使用“仅创建者可读写”或等价规则；参考 [CloudBase 安全规则](https://docs.cloudbase.net/database/security-rules)。
- 禁止“所有用户可读，仅创建者可写”。
- 禁止提供无用户范围的 `collection.get()` 聚合接口或公开云函数。
- 用两名测试用户做正向/反向权限验证：A 能读写自己的日记，B 不能读取、更新或删除 A 的任何日记。
- 权限规则是发布阻断项；仅隐藏 UI 不构成安全。

### 云存储安全

- 图片路径按用户隔离，不使用可猜测的公共目录。
- 数据库保存稳定 `fileID`，显示时按需换取可访问地址；参考 [CloudBase 云存储说明](https://docs.cloudbase.net/storage/introduce)。
- 删除/替换日记图片时维护文件引用，失败可重试并避免孤儿文件。
- 上传前做数量、类型和大小检查；上传失败不丢失本地草稿。

### 配置安全

- 真实 AppID、环境 ID、OpenID、令牌和私有配置不得提交。
- 环境 ID 必须由用户在云端里程碑人工确认，不依赖隐式“当前环境”。
- 开发、演示和正式环境不得共享可写生产数据。

## 6. 是否安装 CloudBase Skills

当前决策：不安装。

理由：

- 当前里程碑和下一里程碑都不接入 CloudBase，安装不会提高当前验收质量。
- Skill 自动匹配 CloudBase 任务，覆盖 Web、数据库、CloudRun、AI 和部署等远超本项目需要的能力。
- 其完整工作流依赖 CloudBase MCP；MCP 能管理环境、函数、数据库和部署，属于需要单独审批的高权限工具。
- README 没有证明 `npx skills add` 在当前 Codex Desktop 中一定只修改项目目录，不能默认认为无全局影响。

后续允许条件：

1. 进入独立的 CloudBase 接入里程碑。
2. 先固定并审阅具体提交/版本。
3. 优先项目级安装，不修改用户级全局配置。
4. 只启用小程序、微信鉴权、文档数据库和云存储相关引用。
5. MCP 安装、登录、资源创建和部署分别征得用户同意。
6. 任何工具调用显式指定完整环境 ID，并遵守最小权限。

结论不是“永不使用”，而是“有知识价值，当前不安装；云端阶段受控评估”。

## 7. 地图技术实现

选择：核心必须自研，不使用腾讯地理 `<map>` 作为主页。

### 画布结构

```text
movable-area（固定视口）
└── movable-view（拖动 + 缩放）
    ├── image（原创/占位二维校园地图）
    └── marker-layer（与 image 同一变换上下文）
        └── memory-marker × N
```

### 坐标不变量

- 原始地图有稳定的逻辑宽高。
- 位置只持久化为 `xRatio`、`yRatio`，范围 `[0, 1]`。
- 标记在画布内的逻辑位置：

```text
mapX = xRatio × mapLogicalWidth
mapY = yRatio × mapLogicalHeight
```

- CSS 可将标记定位为 `left: xRatio × 100%`、`top: yRatio × 100%`；地图和标记处于同一 `movable-view`，一起平移缩放。
- 从屏幕点击反算比例坐标时，必须扣除视口偏移和平移，并除以缩放与逻辑尺寸：

```text
xRatio = clamp((screenX - viewportLeft - translateX) / (scale × mapRenderWidth), 0, 1)
yRatio = clamp((screenY - viewportTop  - translateY) / (scale × mapRenderHeight), 0, 1)
```

具体事件字段以骨架/地图里程碑对当前基础库的实测为准，不把未经验证的事件坐标假设写死。

### 复位与跳转

- 保存默认 `scale`、`x`、`y` 视图。
- “回到默认视图”显式重设三个状态。
- 从时间轴/详情返回地图时，传日记 ID，地图页加载后根据比例坐标计算目标视图并高亮标记。
- 视图状态和日记坐标分离；拖动/缩放不修改日记位置。

### 测试

坐标转换写为纯函数，至少覆盖：

- 1x、1.5x、最大缩放。
- 视口左上、中心、右下。
- 正负平移。
- 不同屏幕宽高比。
- 边界 clamp。
- 比例坐标 → 屏幕 → 比例坐标的往返误差。

真机验收要求：至少两种屏幕尺寸或模拟器尺寸，加一台真实手机，标记不能出现肉眼明显漂移。

### 为什么不使用 TencentMap Demo 作底座

它基于经纬度和地理 `<map>`；本项目需要插画坐标、无 GPS、无定位权限。它只能提供 Marker 点击和 Callout 的概念参考，且仓库许可证不完整。

## 8. 本地 Demo 模式

选择：用与云端同构的 Repository，不写“只为 Demo 存活”的页面分支。

### 存储

- 日记 JSON 使用单一、带版本号的本地存储键，例如 `sdu-memory:diaries:v1`。
- 读入时校验 schema；损坏数据进入可恢复错误状态，不让页面崩溃。
- 写操作采用“先生成完整新快照，再覆盖存储”的方式，避免半更新。
- 提供可显式执行的 Seed 数据初始化/重置，不在每次启动时悄悄覆盖用户数据。

### 图片

- 内置演示 Seed 使用仓库内原创或明确许可的小体积图片。
- 用户选择的临时路径不能当永久路径；本地模式后续使用小程序文件保存能力持久化，保存失败时保留草稿并提示。
- 删除日记时只删除确认不再被其他记录引用的本地文件。

### 模式切换

- 默认开发可使用本地模式。
- 云端模式必须通过单一环境配置切换。
- 同一页面不出现 `if (cloud)` 分支；差异封装在 Repository 内。

## 9. 测试与格式化工具

### 下一里程碑引入

- TypeScript 与小程序 API 类型。
- ESLint：检查 TS/JS、未使用变量、Promise 和危险类型逃逸。
- Prettier：格式化 TS/JS/JSON/WXML/WXSS/Markdown；不同时引入第二套格式化器。
- 脚本：`typecheck`、`lint`、`format:check`。

### P0 逐步引入

- 纯逻辑单元测试：坐标转换、按月分组、统计、Repository schema 迁移。
- 组件测试：只对关键自研业务组件使用微信小程序模拟工具。
- 冒烟测试：有可用开发者工具 CLI 时再接 `miniprogram-automator`，否则保留明确人工步骤。
- 真机测试：地图拖放缩放、选图、保存、详情、删除、时间轴跳转和弱网失败。

不在下一里程碑一次性引入完整 E2E/CI 基础设施，以免工具配置取代业务闭环。

## 10. 十项最终回答

1. 主项目使用微信原生小程序：是。
2. 主 UI 组件库：TDesign MiniProgram。
3. 官方 API 参考：`wechat-miniprogram/miniprogram-demo`。
4. CloudBase 参考：当前官方 CloudBase 文档为主，`TencentCloudBase/awesome-cloudbase-examples` 只作示例索引。
5. 工程结构参考：`Tencent/tdesign-miniprogram-starter-retail`，不复制零售业务。
6. 视觉参考：TDesign retail starter 的通用状态/卡片层级，以及 BearDiary 公开截图；最终视觉自行设计。
7. 不应使用：`xy-diary`；不采用 `weapp-diary`、`awesome-miniprogram-skills`；Vant/WeUI 不作为第二套依赖；TencentMap Demo 不作底座。
8. CloudBase Skills：有价值但当前不安装，云端里程碑再做项目级最小权限评估。
9. 地图核心：必须自研。
10. 下一步：初始化最小可运行的微信原生 TypeScript 骨架，只按需集成 TDesign 基础组件并完成开发者工具/真机冒烟验证。
