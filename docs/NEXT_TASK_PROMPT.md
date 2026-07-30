# 下一里程碑任务提示词

> 状态：本提示词已于 2026-07-31 用作最小小程序骨架里程碑的边界基线。保留本文用于追溯，不代表已经授权进入地图技术原型或其他后续里程碑。

以下内容可在本轮验收并提交后，直接作为下一次 Codex 任务：

---

你现在是“山大迹忆”项目的技术负责人和主要开发工程师。请先完整阅读并遵守：

- `AGENTS.md`
- `README.md`
- `docs/TECH_STACK_DECISION.md`
- `docs/INTEGRATION_PLAN.md`
- `docs/THIRD_PARTY_NOTICES.md`
- `docs/RISK_REGISTER.md`
- `docs/STATUS.md`

本轮只执行一个里程碑：

> 初始化最小可运行的微信原生 TypeScript 小程序骨架，并只集成评估通过的 TDesign 基础组件。

## 一、开始前检查

先检查并报告：

- 当前目录和文件。
- `git status`、当前分支、未提交更改和最近提交。
- 是否已存在小程序工程或 `package.json`。
- 是否有用户文件、真实 AppID、CloudBase 环境 ID、密钥或私有配置。
- 本机 Node/npm 版本。
- 是否能发现微信开发者工具或其 CLI；只做只读检测，不擅自启动 GUI。

如果上一里程碑仍有未提交或冲突更改，保留它们，不覆盖；先说明影响。不要执行破坏性 Git 命令。

在基线干净且本轮尚无分支时，建议创建：

`feat/miniprogram-skeleton`

## 二、任务边界

只创建：

- 微信原生小程序最小目录。
- TypeScript 编译与类型检查配置。
- `app.ts`、`app.json`、`app.wxss`。
- 一个工程验证页；可以使用计划中的地图页路由，但页面只显示项目标题、阶段说明和组件冒烟区，不实现地图。
- `project.config.json` 的可提交公共配置。
- `project.private.config.json` 忽略规则；不得写入或提交真实 AppID。
- 最小 `package.json` 和 lockfile。
- ESLint、Prettier 和必要脚本。
- 精确锁定的 `tdesign-miniprogram` 依赖。
- 只注册 2 至 3 个基础组件，优先 Button、Loading、Empty 或 Toast。
- 一组最小项目设计 token，用于验证温暖、安静的校园风格覆盖，不复制零售模板主题。
- 更新 README、STATUS 和 THIRD_PARTY_NOTICES 中与“已正式引入 TDesign”相关的状态。

## 三、依赖限制

- 正式 UI 依赖只能是 `tdesign-miniprogram`。
- 使用评估后固定的精确版本；安装前再次核实当前包元数据和 LICENSE，并记录选择版本。
- 不安装 Vant、WeUI、uView、React、Vue、uni-app 或其他 UI/框架。
- 不复制 TDesign 仓库、retail starter 或微信 Demo 的整套源码。
- 只注册验证页实际使用的 TDesign 组件。
- 开发依赖只保留 TypeScript、微信小程序 API 类型、ESLint/TypeScript 插件、Prettier 及其确有必要的最小配置。
- 不在本轮引入 Jest、E2E、CloudBase SDK、云函数工具或部署工具；测试框架留到需要纯逻辑/组件测试的里程碑。

## 四、公共与私有配置

- 公共 `project.config.json` 使用游客/占位 AppID 或不含真实 AppID的安全方案，以当前开发者工具支持为准。
- TypeScript 编译配置参考微信官方 `miniprogram-demo` 当前做法，但只保留本项目所需字段。
- 比赛版渲染器固定 WebView，不启用 Skyline。
- 真实 AppID、环境 ID、OpenID、令牌、密钥和本机路径不得提交。
- 不创建 CloudBase 环境、集合、云函数或存储目录。

## 五、工程验证页

页面必须：

- 显示“山大迹忆”和“基于校园地图的个人空间日记”。
- 明确显示“工程骨架验证中”，避免被误认为正式地图页。
- 展示已注册的少量 TDesign 组件。
- 有一个可点击按钮触发纯本地 UI 状态变化，以证明 TypeScript 事件和 `setData` 正常。
- 使用最小设计 token 覆盖主色、纸张背景、文字色、圆角和间距。
- 不出现地图选点、照片上传、日记表单、时间轴、统计或 CloudBase 调用。

## 六、验收标准

自动检查必须满足：

- `npm install` 成功并生成 lockfile。
- TypeScript 类型检查通过。
- ESLint 通过。
- Prettier check 通过。
- 仓库中不存在真实 AppID、环境 ID、OpenID、密钥、令牌和私有配置。
- `git diff --check` 通过。
- 依赖树中没有第二套 UI、跨端框架或 CloudBase 运行时依赖。
- `miniprogram_npm`、`node_modules` 和私有配置未被 Git 跟踪。

开发者工具验收：

- 项目能被微信开发者工具导入。
- “构建 npm”成功。
- 模拟器能打开工程验证页，无编译错误。
- Button 点击后本地状态正确变化。
- Loading/Empty/Toast 等已选组件显示正确。
- Console 没有未处理异常。
- 开发者工具能看到当前构建包体；记录结果，不猜测。

真机验收：

- 用户在私有配置中提供 AppID 后，至少一台手机可以预览。
- 页面布局、按钮点击和基础组件正常。
- 记录手机系统、微信版本和发现的问题。

若没有开发者工具、AppID 或真机，自动检查仍要完成，并把对应步骤明确标记为“待用户人工验证”，不得声称通过。

## 七、本轮禁止

- 不开发正式地图或 `movable-view` 技术样片。
- 不制作正式校园地图。
- 不实现比例坐标。
- 不开发日记新建/编辑/详情。
- 不选择或上传图片。
- 不实现时间轴、个人统计、月份筛选或时光回放。
- 不接入 CloudBase，不创建任何云资源。
- 不安装 CloudBase Skills 或 MCP。
- 不实现评论、点赞、好友、关注、公开动态、GPS、AI 或管理员功能。
- 不创建 Demo 视频或 PPT。
- 不顺手进入下一个里程碑。

## 八、Git 要求

- 禁止 `git reset --hard`、`git clean -fd`、强制推送和覆盖历史。
- 提交前检查 `git diff`、`git status`、未跟踪文件、文件体积和敏感信息。
- 不提交 `node_modules`、`miniprogram_npm`、开发者工具私有配置或真实 AppID。
- 建议一个原子提交：

`chore: initialize native miniprogram skeleton`

- 未经明确要求，不推送远端、不创建 PR。
- 完成后停止并等待验收，不进入地图或数据层开发。

## 九、完成后的汇报

严格按以下结构：

### 本次完成
### 当前项目状态
### 创建或修改的文件
### 安装的依赖与精确版本
### 执行的命令
### 自动检查结果
### 开发者工具检查结果
### 真机检查结果
### 包体记录
### 敏感信息检查
### 未能验证的内容
### 已知风险
### 需要我人工完成的事项
### 建议 Git 提交
### 下一里程碑

完成后停止，等待我的验收。

---
