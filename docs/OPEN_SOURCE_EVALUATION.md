# 开源项目评估

评估日期：2026-07-30

## 1. 评估方法与边界

本轮对 12 个指定 GitHub 仓库进行了只读核实，检查范围包括：

- 仓库是否存在、默认分支和是否归档。
- 当前 README、根 LICENSE、`package.json`。
- 目录结构和代表性源码。
- 截至评估日可见的最近提交。
- 与微信小程序、Skyline、开发者工具相关的代表性开放 Issue。
- 技术栈、后端依赖、可复用价值、隐私和许可证风险。

本轮没有把第三方仓库克隆进主项目，没有安装其依赖，也没有复制第三方代码。由于当前工作区没有微信开发者工具会话、AppID 和 CloudBase 环境，本轮不能对各示例做真机运行验证；“兼容性”分数是基于源码、维护状态、官方说明和 Issue 的静态判断，不等于真机通过。

“最近提交”表示评估时查询到的默认/可见仓库最新提交日期；若提交仅为文档、CNAME 或依赖自动更新，会在说明中单独标注，不能据此推断业务代码仍在持续维护。

## 2. 评分口径

每项满分 10 分。分数越高越有利：

| 缩写 | 维度 | 高分含义 |
|---|---|---|
| L | 许可证清晰度 | 根许可证清晰、元数据一致 |
| M | 当前维护状态 | 近期有实质维护和问题响应 |
| C | 微信小程序兼容性 | 原生兼容且当前工具链风险低 |
| F | 需求匹配程度 | 与个人校园地图日记直接相关 |
| R | 可复用价值 | 可在合规前提下低风险复用 |
| Q | 代码质量 | 结构、测试、类型和规范良好 |
| D | 文档完整度 | 安装、API、示例和限制清楚 |
| I | 引入成本 | 高分代表引入简单、耦合低 |
| P | 包体和性能风险 | 高分代表风险低、易按需控制 |
| S | 安全与隐私风险 | 高分代表默认做法更安全 |

总分只用于横向辅助，最终分类优先考虑许可证、隐私和产品边界等一票否决条件。

## 3. 候选仓库总览

| # | 仓库 | 主要用途 | LICENSE 核实 | 技术栈摘要 | 最近可见提交 | 推荐 | 最终分类 | 总分 |
|---:|---|---|---|---|---|---|---|---:|
| 1 | [Tencent/tdesign-miniprogram](https://github.com/Tencent/tdesign-miniprogram) | 小程序 UI | MIT，根文件清晰 | TS/JS、WXML、WXSS/Less、npm | [2026-07-28](https://github.com/Tencent/tdesign-miniprogram/commit/ef43247e2e37e53120d73a755546ba8a83ef8dda) | A | 正式依赖 | 90 |
| 2 | [wechat-miniprogram/miniprogram-demo](https://github.com/wechat-miniprogram/miniprogram-demo) | 官方 API 示例 | MIT，根文件清晰 | 原生小程序、JS/TS、CloudBase 示例 | [2026-03-27](https://github.com/wechat-miniprogram/miniprogram-demo/commit/0b1de6f2a28ff185d7139e06b3956d8fdf15f61c) | A | 技术参考 | 88 |
| 3 | [Tencent/tdesign-miniprogram-starter-retail](https://github.com/Tencent/tdesign-miniprogram-starter-retail) | 工程结构/视觉 | 根 LICENSE 为 MIT；`package.json` 标为 ISC，存在冲突 | JS、WXML、WXSS、TDesign、Mock | [2026-05-19](https://github.com/Tencent/tdesign-miniprogram-starter-retail/commit/4280f410121c75775c4b1fd15c3849031f830cd7) | B- | 技术参考、视觉参考 | 64 |
| 4 | [TencentCloudBase/awesome-cloudbase-examples](https://github.com/TencentCloudBase/awesome-cloudbase-examples) | CloudBase 示例集合 | README 声称 MIT，但根 LICENSE 当前 404 | 多技术栈、多示例、CloudBase | [2026-07-29](https://github.com/TencentCloudBase/awesome-cloudbase-examples/commit/f49f097b306565bf6ce7ea1f8b7a9c2de78078f5) | B- | 技术参考 | 62 |
| 5 | [TencentCloudBase/cloudbase-skills](https://github.com/TencentCloudBase/cloudbase-skills) | Agent 的 CloudBase 指南 | MIT，根文件清晰 | Markdown Agent Skill、MCP 路由 | [2026-07-29](https://github.com/TencentCloudBase/cloudbase-skills/commit/b0733652236b480d536460a22f04456cc6b24db5) | B | 暂不采用 | 79 |
| 6 | [TencentCloudBase/awesome-miniprogram-skills](https://github.com/TencentCloudBase/awesome-miniprogram-skills) | 小程序 AI 开发模式 Skills | MIT，根文件清晰 | 原生小程序、AI Skills、云函数、Mock | [2026-06-18](https://github.com/TencentCloudBase/awesome-miniprogram-skills/commit/72523cad942a7d80de53646c3f1b7c367f0bc80b) | D | 暂不采用 | 62 |
| 7 | [TencentLBS/TencentMapMiniProgramDemo](https://github.com/TencentLBS/TencentMapMiniProgramDemo) | 地理地图 Marker/Callout 示例 | 无根 LICENSE；`package.json` 标 ISC | 原生 JS/WXML/WXSS、`<map>`、LBS | [2023-05-15](https://github.com/TencentLBS/TencentMapMiniProgramDemo/commit/2c72cb48e789bfcb75ad9e9f42b3677b5cf1d6f4) | C- | 技术参考 | 45 |
| 8 | [harveyqing/BearDiary](https://github.com/harveyqing/BearDiary) | 早期日记交互参考 | MIT，根文件清晰 | 2016 原生小程序、JS、本地存储、Server API | [2016-11-16](https://github.com/harveyqing/BearDiary/commit/aee2bfa9f758268699591d319baadae5b4dd5626) | D | 视觉参考 | 44 |
| 9 | [KyaukYou/weapp-diary](https://github.com/KyaukYou/weapp-diary) | 日记与 CloudBase 示例 | MIT，根文件清晰 | 原生 JS、CloudBase、云函数、旧 UI 模块 | [2022-07-29](https://github.com/KyaukYou/weapp-diary/commit/5f5be13294f21da7cf309d60c70dd68c8a6af52e) | D | 暂不采用 | 40 |
| 10 | [s-xianyu/xy-diary](https://github.com/s-xianyu/xy-diary) | 跨端日记/工具集合 | 无 LICENSE；README 要求署名并联系作者 | uni-app、Vue 3、TS、Pinia、uView Plus | [2026-03-16](https://github.com/s-xianyu/xy-diary/commit/f0f72c28c1166ffdbbe6469458b8d04baf31ddaa)，仅 CNAME | F | 禁止使用 | 35 |
| 11 | [wechat-miniprogram/weui-miniprogram](https://github.com/wechat-miniprogram/weui-miniprogram) | 微信原生视觉组件 | MIT，根文件清晰 | JS/WXML/WXSS、WeUI、npm | [2026-04-28](https://github.com/wechat-miniprogram/weui-miniprogram/commit/5d04cad87bf9305d709aa1b623b8f34f2c659a2d) | B+ | 技术参考 | 85 |
| 12 | [youzan/vant-weapp](https://github.com/youzan/vant-weapp) | 小程序 UI 备选 | MIT，根文件清晰 | TS/JS、WXML、Less、npm | [2026-02-27](https://github.com/youzan/vant-weapp/commit/7a7d43757ed19d3ad5e6bca69059e0b9ea565d0b)，依赖更新 | B | 暂不采用 | 84 |

## 4. 逐项结论

### 4.1 Tencent/tdesign-miniprogram

- 用途：本项目唯一正式 UI 组件库候选。
- 许可证：[MIT](https://github.com/Tencent/tdesign-miniprogram/blob/develop/LICENSE)，要求在复制或实质性分发时保留版权和许可文本。
- 当前状态：默认分支 `develop`；2026-07-28 仍有提交。npm 页面在评估时显示 `tdesign-miniprogram` 1.15.3、MIT、0 运行时依赖，并且近期发布。
- 技术与结构：TypeScript/JavaScript、WXML、WXSS/Less 的原生小程序组件；monorepo 中带 ESLint、Prettier、Jest/模拟与端到端测试工具。
- 适合使用：Button、Input、Textarea、Image、Dialog、Popup、Toast、Empty、Loading、Skeleton、TabBar、Tag，以及后续按需评估的 Upload、Calendar、Swiper、ActionSheet。
- 不适合迁移：仓库构建系统、文档站、uni-app 子包、聊天/Pro 组件及整套示例。
- 兼容性风险：最低基础库说明为 2.6.5。开放 Issue [#3149](https://github.com/Tencent/tdesign-miniprogram/issues/3149) 显示 Skyline 适配仍未覆盖 Calendar、Upload、Swiper、ActionSheet、Dialog 等多个本项目候选组件；[#4581](https://github.com/Tencent/tdesign-miniprogram/issues/4581) 仍报告 Skyline 表单问题。因此比赛版固定 WebView 渲染器，不承诺 Skyline。
- 包体风险：按页面 `usingComponents` 注册并在每个里程碑记录构建后包体；不得全局注册全量组件。开放建议 [#2485](https://github.com/Tencent/tdesign-miniprogram/issues/2485) 也说明包体需要主动控制。
- 安全风险：组件本身 0 运行时依赖，主要风险来自 Upload 等组件与业务上传权限的错误组合，不由组件库替代安全设计。
- 结论：A，正式依赖。下一里程碑只安装并验证少量基础组件，不一次性接入完整清单。

### 4.2 wechat-miniprogram/miniprogram-demo

- 用途：微信官方 API、生命周期、原生组件和云开发示例的首选参考。
- 许可证：[MIT](https://github.com/wechat-miniprogram/miniprogram-demo/blob/master/LICENSE)。
- 当前状态：2026-03-27 有修复提交；`project.config.json` 使用原生 `compileType`，并启用 TypeScript 编译插件。
- 技术与结构：原生小程序 JS/TS、WXML、WXSS、云函数目录、ESLint、Jest、`miniprogram-automator`、`miniprogram-ci`。
- 适合借鉴：`wx.chooseMedia`/图片选择、预览、存储、页面导航、模态交互、错误反馈、生命周期、`wx.cloud` 初始化和文件上传的当前官方写法。
- 不适合迁移：整仓示例、与本项目无关的 API 页面、官方 Demo 的公开 AppID 和大体积资源。
- 兼容性风险：示例覆盖面极大，复制页面会带入无关设置和依赖；应定位到单个官方示例后重写为本项目代码。
- 安全风险：示例旨在展示 API，不代表生产权限策略；CloudBase 权限必须按本项目“仅创建者可读写”重新设计。
- 结论：A，技术参考，不作为项目底座。

### 4.3 Tencent/tdesign-miniprogram-starter-retail

- 用途：查看 TDesign 原生小程序的目录拆分、自定义 TabBar、Mock、加载/空状态和样式组织。
- 许可证：根 [LICENSE](https://github.com/Tencent/tdesign-miniprogram-starter-retail/blob/main/LICENSE) 和 README 指向 MIT，但 `package.json` 的 `license` 为 ISC。元数据不一致降低了直接迁移的确定性。
- 当前状态：2026-05-19 有工作流维护；依赖的 TDesign 版本在仓库中固定为较旧的 1.9.5。
- 技术与结构：JavaScript + WXML + WXSS + TDesign；28 个零售页面；Mock 服务层；ESLint/Prettier。
- 适合借鉴：`pages`、`services`、`model`、`style`、`utils` 的职责拆分，空状态/图片卡片的视觉层次。
- 不适合迁移：商品、购物车、结算、订单、售后、优惠券、地址、营销、用户中心等全部零售业务；不采用其旧版本锁定和 Mock 请求层实现。
- 兼容性风险：业务耦合很重，直接删改比从小骨架重建成本更高。
- 安全风险：商城 Mock 和接口服务没有本项目的个人日记隐私模型。
- 结论：B-，只作工程与视觉参考。默认不迁移代码；若未来迁移少量通用样式，须先解决许可证元数据冲突并登记来源。

### 4.4 TencentCloudBase/awesome-cloudbase-examples

- 用途：CloudBase 数据库、存储、云函数及多种应用示例索引。
- 许可证：根 `readme.md` 标注 MIT，但 README 的 LICENSE 链接和 GitHub 根 `LICENSE` 在评估时均返回 404。不能把 README 声明自动扩展为每个子示例代码的明确授权。
- 当前状态：2026-07-29 有频繁同步提交；仓库包含 Web、React、Vue、uni-app、小程序、云函数、CloudRun、AI 等大量异构内容。
- 小程序模板核实：`miniprogram/cloudbase-miniprogram-template` 确实展示 `wx.cloud.init`、数据库、云函数和 `wx.cloud.uploadFile`，但同时带入大量 Agent/IDE/MCP 配置、OpenID 展示页和 `project.private.config.json`，不适合作为本项目最小底座。
- 适合借鉴：通过官方文档定位 `wx.cloud` 初始化、文档数据库 CRUD、上传后保存 `fileID`、错误处理和安全规则概念。
- 不适合迁移：整仓、上述模板配置、OpenID 展示页、商城/论坛/表白墙/短视频/AI/社交示例，以及任何未单独核实许可证的子目录代码。
- 兼容性风险：不同年代、平台和 SDK 并存，不能假定任意示例都适用于当前微信云开发。
- 安全风险：示例权限、测试环境 ID 和公开读模式可能只服务演示；必须以当前 CloudBase 安全规则文档为准。
- 结论：B-，技术参考。优先引用 [CloudBase 当前安全规则文档](https://docs.cloudbase.net/database/security-rules)，代码迁移必须对子目录重新核实许可。

### 4.5 TencentCloudBase/cloudbase-skills

- 用途：为编码 Agent 提供 CloudBase 平台检测、鉴权、数据库、云函数、云存储、部署和审查指导。
- 许可证：[MIT](https://github.com/TencentCloudBase/cloudbase-skills/blob/main/LICENSE)。
- 当前状态：2026-07-29 仍从上游工具包同步；`SKILL.md` 版本为 2.25.1。
- 安装方式：README 给出 `npx skills add TencentCloudBase/cloudbase-skills`。Skill 自身会自动匹配 CloudBase 任务；其完整流程还要求 CloudBase MCP，并推荐用户级插件/MCP 安装。
- 价值：能减少 SDK、鉴权域、EnvId、数据库和存储规则的误用；明确要求类型检查、测试和 CloudBase 代码审查。
- 不适配点：内容覆盖 Web、MySQL/PostgreSQL、CloudRun、AI、部署等大量本项目不需要的能力；其“先准备后端资源再写前端”工作流与当前先做本地 Demo 骨架的比赛里程碑不一致。
- 当前 Codex 兼容性：Skill 内容明确列出 Codex 为插件目标，但本轮没有实际安装，无法证明 `npx skills add` 在 Codex Desktop 中只做项目级修改；因此不把“可安装”误写成“已兼容验证”。
- 权限风险：MCP 具备环境、函数、数据库和部署管理能力；安装为用户级还会影响其他项目。不能在未确认环境和权限前自动启用。
- 结论：B，当前“暂不采用”。到 CloudBase 专属里程碑时，可以先审阅并固定版本，只做项目级 Skill 安装；MCP 单独审批、最小权限授权，不能因 Skill 建议而自动部署或创建资源。

### 4.6 TencentCloudBase/awesome-miniprogram-skills

- 用途：微信小程序“AI 开发模式”的业务 Skill 示例集合。
- 许可证：[MIT](https://github.com/TencentCloudBase/awesome-miniprogram-skills/blob/main/LICENSE)。
- 当前状态：2026-06-18 有文档维护；包含点餐、医院、打车、购物、支付、AI 文本/图片等原子 Skill。
- 技术与结构：原生小程序入口、AI 路由元数据、独立 Skill 分包、可选云函数/数据库、预览 Seed/Mock 与正式云模式。
- 可参考内容：仅可抽象参考“双模式 Repository/Adapter”和静态校验思路。
- 不适合迁移：AI 路由、支付、购物、点餐、医院、出行、AI 生成和其全部业务组件，均不在比赛版范围。
- 安全风险：项目示例涉及支付、云函数、数据库和 AI；仓库根还可见 `project.private.config.json`，不能照抄其配置管理习惯。
- 结论：D，暂不采用。它不是通用微信小程序 UI/测试 Skill 集，也不解决本项目的插画地图核心问题。

### 4.7 TencentLBS/TencentMapMiniProgramDemo

- 用途：腾讯地理地图 `<map>` 的 marker、callout、事件和 MapContext 示例。
- 许可证：仓库没有根 LICENSE；`package.json` 写 `ISC`，但缺少完整仓库级许可文本。许可证清晰度不足，不复制代码或资源。
- 当前状态：最近可见提交为 2023-05-15；README 只有一句说明，文档很弱。
- 技术与结构：原生 JavaScript/WXML/WXSS；示例使用经纬度、`markers`、`callout`、`bindmarkertap` 和 `MapContext`。
- 适合借鉴：只学习标记 ID、点击事件、气泡状态和视图复位的交互概念。
- 不适合迁移：地理经纬度模型、导航地图、定位、路线、附近车辆、LBS WebService、CDN 图片和完整页面。
- 兼容性风险：本项目使用二维插画和比例坐标，原生 `<map>` 的经纬度/Marker 模型无法解决插画地图标记漂移。
- 安全风险：LBS 密钥、定位权限和外部 CDN 都是不必要攻击面；比赛版不得引入。
- 结论：C-，技术参考，不作底座，不复制代码。

### 4.8 harveyqing/BearDiary

- 用途：观察早期日记卡片、Tab、模态、图片预览和本地数据组织。
- 许可证：[MIT](https://github.com/harveyqing/BearDiary/blob/master/LICENSE)。
- 当前状态：最后提交 2016-11-16；README 要求的开发者工具版本为 0.10.x，明显过时，并明确称项目存在“东抄抄西抄抄”。
- 技术与结构：早期原生小程序；静态检查发现 `wx.getUserInfo`、`wx.chooseImage`、自定义多行文本模拟和 `wx.request` Server API。
- 适合借鉴：公开截图中的日记卡片信息层级和图片预览动线。
- 不适合迁移：旧 API、旧工具配置、Server 请求层、视频、评论/喜欢/收藏计划和任何来源不清的拼接代码。
- 兼容性风险：不能假定在 2026 开发者工具中直接运行；需要重写而不是修补。
- 安全风险：后端接口和社交扩展方向不符合单用户私有日记。
- 结论：D，视觉参考，不迁移代码或架构。

### 4.9 KyaukYou/weapp-diary

- 用途：旧版 CloudBase 日记项目，可观察日历、编辑和个人页布局。
- 许可证：[MIT](https://github.com/KyaukYou/weapp-diary/blob/master/LICENSE)。
- 当前状态：最近可见提交为 2022-07-29 的 README 更新；README 指向另一个 2.0 仓库，当前仓库本身并非持续维护基线。
- 技术与结构：原生 JavaScript + WXML/WXSS + CloudBase 云函数/数据库；含用户、关注、粉丝、收藏、管理员、BUG 回复等超范围业务。
- 过时证据：源码仍使用 `open-type="getUserInfo"` / `bindgetuserinfo`；部署说明要求手工替换环境 ID、集合 ID 和多个 OpenID。
- 隐私阻断：README 明确要求集合设置为“所有用户可读，仅创建者可读写”。这会让私人日记可被其他用户读取，与本项目安全原则直接冲突。
- 不适合迁移：云函数、用户体系、社交/管理员功能、权限配置、旧登录交互和手工 OpenID 控制。
- 可借鉴：只看公开截图和产品层面的日历/详情信息层级。
- 结论：D，暂不采用。即使 MIT，也不以其代码作为安全或架构参考。

### 4.10 s-xianyu/xy-diary

- 用途：uni-app 跨端项目，混合日记和多个小游戏/工具。
- 许可证：根 LICENSE 不存在；README 明确要求使用时标注作者，二次开发需联系作者。
- 当前状态：2026-03-16 的最近提交仅为 `CNAME`；不能据此判断小程序业务仍在维护。
- 技术与结构：uni-app + Vue 3 + TypeScript + Pinia + uView Plus，并带大量跨端和工具依赖。
- 不适合原因：许可证未授权、作者附加前置要求、技术路线与本项目原生小程序冲突、包体和迁移成本高、包含 2048/俄罗斯方块/木鱼等无关功能。
- 安全风险：依赖面大且包含网络、持久化和跨端能力，本轮没有证据证明其日记数据满足仅创建者可读写；在许可证已经阻断的前提下不继续审计或运行。
- 结论：F，禁止使用。未取得作者书面许可并澄清许可证前，不复制代码、样式、图片或资源；最多查看公开截图理解一般交互。

### 4.11 wechat-miniprogram/weui-miniprogram

- 用途：微信官方设计语言的扩展组件库。
- 许可证：[MIT](https://github.com/wechat-miniprogram/weui-miniprogram/blob/master/LICENSE)。
- 当前状态：2026-04-28 有提交；npm 包 1.5.6，0 运行时依赖。
- 技术与结构：原生 JS/WXML/WXSS，基于 `weui-wxss`，支持 DarkMode。
- 优点：微信原生感强、低学习成本、扩展库/样式体系稳定。
- 相对不足：组件和设计表现更偏系统规范，难以独立承担“温暖、安静、校园青春感”的完整视觉；与 TDesign 同时正式引入会造成组件重复和风格分裂。
- 兼容性风险：开放 Issue [#253](https://github.com/wechat-miniprogram/weui-miniprogram/issues/253) 和 [#269](https://github.com/wechat-miniprogram/weui-miniprogram/issues/269) 仍报告 Skyline 表现/事件问题。
- 安全风险：0 运行时依赖且只提供 UI，直接风险较低；但其表单/弹层同样不能代替业务权限和输入校验。
- 结论：B+，只作微信交互规范和技术参考，不作为第二套正式 UI 库。

### 4.12 youzan/vant-weapp

- 用途：成熟的小程序 UI 备选方案。
- 许可证：[MIT](https://github.com/youzan/vant-weapp/blob/dev/LICENSE)。
- 当前状态：仓库 2026-02-27 有依赖更新，但 npm `@vant/weapp` 最新公开版本仍为 1.11.7，评估时 npm 页面显示已约两年未发布。
- 技术与结构：TypeScript/JavaScript、WXML、Less，0 运行时依赖，组件和文档完整。
- 优点：成熟、轻量、组件覆盖广、按需引用成本低。
- 风险：开放 Issue [#6064](https://github.com/youzan/vant-weapp/issues/6064) 报告基础库 3.x 构建兼容问题；[#6016](https://github.com/youzan/vant-weapp/issues/6016) 等报告 Skyline/GlassEasel 样式问题。维护节奏和小程序包发布节奏弱于 TDesign。
- 风格判断：默认更偏通用移动商城，虽可定制，但本项目选择 TDesign 后没有引入第二套库的收益。
- 安全风险：包声明 0 运行时依赖，组件库本身风险较低；Uploader、Field 等组件仍不能替代照片权限、数据校验和 CloudBase 隔离。
- 结论：B，合格备选但当前暂不采用。只有 TDesign 在下一里程碑出现阻断性真机问题时，才重新比较，不并存。

## 5. 评分表

| # | 仓库 | L | M | C | F | R | Q | D | I | P | S | 合计 |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | Tencent/tdesign-miniprogram | 10 | 10 | 10 | 9 | 9 | 9 | 9 | 8 | 7 | 9 | 90 |
| 2 | wechat-miniprogram/miniprogram-demo | 10 | 9 | 10 | 7 | 9 | 9 | 8 | 9 | 8 | 9 | 88 |
| 3 | Tencent/tdesign-miniprogram-starter-retail | 7 | 8 | 10 | 4 | 6 | 7 | 8 | 3 | 4 | 7 | 64 |
| 4 | TencentCloudBase/awesome-cloudbase-examples | 3 | 10 | 8 | 8 | 7 | 6 | 8 | 3 | 4 | 5 | 62 |
| 5 | TencentCloudBase/cloudbase-skills | 10 | 10 | 8 | 8 | 8 | 8 | 8 | 5 | 9 | 5 | 79 |
| 6 | TencentCloudBase/awesome-miniprogram-skills | 10 | 9 | 9 | 2 | 3 | 7 | 9 | 4 | 5 | 4 | 62 |
| 7 | TencentLBS/TencentMapMiniProgramDemo | 2 | 3 | 8 | 5 | 3 | 6 | 2 | 6 | 5 | 5 | 45 |
| 8 | harveyqing/BearDiary | 10 | 1 | 2 | 5 | 3 | 3 | 5 | 5 | 7 | 3 | 44 |
| 9 | KyaukYou/weapp-diary | 10 | 2 | 3 | 6 | 3 | 4 | 5 | 2 | 4 | 1 | 40 |
| 10 | s-xianyu/xy-diary | 1 | 7 | 6 | 3 | 2 | 6 | 4 | 1 | 2 | 3 | 35 |
| 11 | wechat-miniprogram/weui-miniprogram | 10 | 9 | 10 | 7 | 8 | 8 | 8 | 8 | 8 | 9 | 85 |
| 12 | youzan/vant-weapp | 10 | 6 | 8 | 8 | 9 | 9 | 9 | 8 | 8 | 9 | 84 |

## 6. 最终分类

### 正式依赖

- `Tencent/tdesign-miniprogram`：唯一正式 UI 组件库，按需安装和注册。

### 局部迁移

- 当前无默认批准的局部迁移项。
- 微信官方 `miniprogram-demo` 的单个 API 示例可在确认具体文件和 MIT 来源后，重写或迁移极少量通用代码；每次迁移仍需登记。
- 其他仓库不得因本评估给出“参考”分类而自动获得代码迁移许可。

### 技术参考

- `wechat-miniprogram/miniprogram-demo`：官方 API、TypeScript、CloudBase 和测试参考。
- `Tencent/tdesign-miniprogram-starter-retail`：工程组织参考。
- `TencentCloudBase/awesome-cloudbase-examples`：CloudBase 示例索引；以当前官方文档为准。
- `TencentLBS/TencentMapMiniProgramDemo`：Marker/Callout 交互概念，不能复制代码。
- `wechat-miniprogram/weui-miniprogram`：微信原生交互规范。

### 视觉参考

- `Tencent/tdesign-miniprogram-starter-retail`：空状态、图片卡片和间距层级。
- `harveyqing/BearDiary`：公开截图中的日记卡片信息层级。

### 暂不采用

- `TencentCloudBase/cloudbase-skills`：CloudBase 里程碑再做项目级最小权限评估。
- `TencentCloudBase/awesome-miniprogram-skills`：AI 开发模式与比赛 MVP 无关。
- `KyaukYou/weapp-diary`：旧 API、公开读取权限和超范围业务。
- `youzan/vant-weapp`：合格备选，但不与 TDesign 并存。

### 禁止使用

- `s-xianyu/xy-diary`：无明确 LICENSE，README 要求联系作者，且技术路线不符。
- 任何许可证不清的代码、图片或整仓资源。
- `TencentLBS/TencentMapMiniProgramDemo` 和 `awesome-cloudbase-examples` 中未单独澄清许可的代码不得复制；它们仍可作为只读技术参考。

## 7. 无法验证的事项

- 12 个项目在 2026 版微信开发者工具中的完整编译和真机表现。
- TDesign、Vant 的精确“构建后实际占用包体”；npm CLI 被当前网络沙箱阻断，不能用未经验证的数值填表。
- `awesome-cloudbase-examples` 各子示例是否各自带独立许可证。
- 第三方图片、图标、字体和截图是否全部与代码使用同一许可证。
- CloudBase Skill 安装命令在当前 Codex Desktop 中的准确落盘范围；README 仅说明命令和自动激活行为，未证明一定是项目级。

这些事项必须在实际引入对应内容前继续验证。
