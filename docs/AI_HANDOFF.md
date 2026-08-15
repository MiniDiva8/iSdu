# iSdu Coding Agent 交接文档

更新日期：2026-08-15

本文用于把当前 `codex/social-v2` 分支交给下一位 coding agent。内容来自当前仓库、Git 历史、现有文档和本次完整会话中的人工反馈。不得把“代码已经实现”误写成“真实云端或真机已经验收”。本文不包含真实 AppID、CloudBase 环境 ID、OpenID、密钥或邀请令牌。

## 1. 项目当前目标和产品定位

`iSdu` 是一个微信原生小程序，以山东大学中心校区二维插画地图为载体，让用户把照片、文字、地点、心情和时间保存为校园空间日记。

比赛第一版的核心定位是：

- 单用户；
- 单校区；
- 二维插画地图；
- 本机私密日记；
- 无社交功能。

比赛第一版已冻结在 `main` 的 `4f517e9 feat: finalize competition v1`，必须继续可独立恢复。

当前 `codex/social-v2` 是第二阶段。在保留个人空间日记核心的前提下，只增加以下受控社交能力：

1. 由 CloudBase 可信微信上下文识别用户；
2. 用户通过邀请主动建立 iSdu 双向好友，不读取微信好友或通讯录；
3. 回忆支持 `private`、`selected_friends`、`friends` 三档权限；
4. 有权查看的好友可以点赞或取消点赞；
5. 地图可切换到“好友近 24 小时”图层。

当前不做全网公开动态、陌生人广场、单向关注、评论、私信、好友推荐、通讯录匹配、GPS、实时轨迹、多校区、视频日记、推荐算法或管理后台。

## 2. 当前技术栈和整体目录结构

### 2.1 技术栈

- 微信原生小程序；
- TypeScript、WXML、WXSS；
- WebView 渲染器，不启用 Skyline；
- `tdesign-miniprogram@1.15.3`，只按页面使用需要的少量组件；
- `movable-area` / `movable-view` + 自研比例坐标地图；
- 本地 Storage + 小程序用户文件目录；
- CloudBase 文档数据库、云存储、云函数；
- 三个云函数均精确锁定 `wx-server-sdk@4.0.2`；
- Node.js 原生测试、TypeScript、ESLint、Prettier 和自研敏感信息扫描；
- npm 锁文件必须保留，依赖版本不得随意升级。

### 2.2 主要目录

```text
.
├── AGENTS.md                       # 全仓库执行规则，优先级最高
├── README.md                       # 比赛版介绍；当前阶段说明已经过时
├── project.config.json             # 可提交的安全公共配置
├── project.private.config.json     # 本机真实 AppID 等私有配置，必须忽略
├── cloudfunctions/
│   ├── auth-api/                   # 可信身份、个人云资料、账号云数据删除
│   ├── memory-api/                 # 云回忆、迁移、权限、点赞、好友地图、临时图片地址
│   └── friend-api/                 # 邀请、接受、好友列表、删除好友
├── miniprogram/
│   ├── app.ts / app.json / app.wxss
│   ├── config/                     # runtime 和校园地图固定配置
│   ├── models/                     # Memory、云用户、好友、云回忆、好友地图点
│   ├── pages/
│   │   ├── map/                    # 地图、选点、我的标记、好友 24h 图层
│   │   ├── editor/                 # 新建/编辑、照片、心情、分类、可见范围
│   │   ├── detail/                 # 详情、编辑、删除、共享详情和点赞
│   │   ├── timeline/               # 时光、搜索、资料、好友入口
│   │   ├── profile/                # 数据管理、本地迁云、云端账号删除
│   │   ├── friends/                # 好友列表和邀请分享
│   │   └── friend-invite/          # 邀请预览与手动接受
│   ├── services/
│   │   ├── cloud/                  # 初始化、调用、图片上传、云模式状态
│   │   ├── repository/             # 本地与云端 Repository
│   │   ├── memory-service.ts       # 按本机状态切换本地/云端回忆源
│   │   └── memory-migration-service.ts
│   ├── utils/                      # 比例坐标、筛选、时间与统计纯函数
│   └── assets/                     # 当前校园地图运行时资源
├── docs/                            # 决策、部署、风险、隐私和验收文档
└── scripts/security-scan.mjs        # 敏感信息、依赖和大文件扫描
```

当前底部 Tab 只有“地图”和“时光”。记录入口在地图页，editor 是普通页面。

## 3. 已经完成的功能

以下“完成”指代码已存在；涉及真实云端或双账号的部分仍需看第 5、6 节。

### 3.1 比赛第一版本地闭环

- `1448 × 1086` 校园插画地图；
- 地图拖动、`1×`–`2.5×` 缩放、复位和中心准星选点；
- `mapXRatio` / `mapYRatio` 比例坐标和地图资源版本隔离；
- 1–3 张照片、正文、地点、心情、内容主题和记录时间；
- 临时照片复制到 `USER_DATA_PATH/sdu-memory/images/<memoryId>/`；
- 本地新建、编辑、删除、重启读取和图片回滚/清理；
- 地图心情色小点或照片标记；
- 标记卡片、详情、编辑和删除；
- 时光按月分组、关键词搜索和地图跳转；
- 日期、心情、主题筛选；
- 本机个人资料和本机数据清理；
- 损坏数据、缺失图片、空状态与失败状态处理。

### 3.2 Social V2 代码

Git 中已存在以下独立里程碑：

- `7226d69 docs: define social v2 architecture and security rules`
- `9189c1a feat: establish trusted CloudBase identity`
- `6e9ca91 feat: add private local-to-cloud memory migration`
- `16c92fb feat: add mutual iSdu friendships`
- `8ec7c4e feat: enforce memory visibility permissions`
- `00a3fbd feat: add authorized memory likes`
- `cb77bdf feat: add friends recent map layer`
- `800ede7 feat: harden CloudBase security and data deletion`

具体已实现：

- `auth-api` 使用 `cloud.getWXContext()`，不相信客户端身份字段；
- 服务端保存 APPID + OPENID 的哈希，不保存原始 OpenID；
- 客户端只接收随机 `usr_` 用户 ID；
- 本地回忆主动迁云、幂等迁移、图片上传计划和回读核验；
- 迁移回忆默认私密，失败时保持本地模式，不静默双写；
- 24 小时、单次使用、数据库只存哈希的好友邀请；
- 自邀、重复接受、重复好友、过期邀请防护；
- 删除好友并轮换再次添加后的 `relationshipId`；
- 三档可见范围和“部分好友”关系快照；
- 服务端生成首次共享 `publishedAt`；
- 好友共享详情重新鉴权后才签发短期图片地址；
- 点赞/取消、幂等、事务计数、越权检查；
- 好友近 24 小时轻量地图点、分页和地图版本过滤；
- 云端账号数据删除入口；
- 邀请、上传计划和点赞频率限制；
- 敏感信息、云函数依赖与大文件扫描。

### 3.3 不变量

- 三个云函数都调用 `cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })`；
- 小程序端 `wx.cloud.init()` 不硬编码环境 ID；
- 当前 `runtime.ts` 为 `mode: 'local'`、`cloudEnabled: true`、`cloudTraceUser: false`；
- `MemoryService` 只有迁移完整成功后才依据本机 `isdu:cloud-mode:v1` 切换到云 Repository；
- 旧本机 Storage 键与图片目录保留兼容名称，不能为品牌改名而破坏旧数据。

## 4. 当前正在开发的功能

当前没有授权继续新增功能。正在做的是 Social V2 的部署与双账号验收。

本次会话末尾的实际现场是：

1. 用户已能在手机上生成 iSdu 好友邀请；
2. 接收者点击分享卡片时，微信弹出“开发版小程序已过期，请在开发者工具中重新扫码”；
3. 该弹窗来自微信开发版生命周期，发生在 iSdu 页面运行之前，不等于 iSdu 的 24 小时邀请 Token 已过期；
4. 正确方向是把 Social V2 上传并设为体验版，添加对方为体验成员，再生成新邀请；
5. 用户点击开发者工具“上传”后只得到错误弹窗 `[object Object]`，真实上传原因尚未取到。

因此当前正在处理的是“让 Social V2 成功上传为体验版”，不是修改邀请业务逻辑。

## 5. 当前任务完成到了哪一步

### 5.1 已完成的部署前人工配置（来自用户明确反馈）

用户确认已有一个 CloudBase 测试环境，显示名为 `cloud1`。此前人工完成过：

- 8 个数据库集合；
- 集合权限；
- 5 个唯一索引；
- 12 个查询索引；
- 云存储安全规则；
- 云函数调用权限配置。

不要新建第二个环境，不要删除或重建现有测试环境。

此前也出现过开发者工具“当前环境：(无)”和控制台云函数列表为 0 的情况。后来用户已经能生成邀请，这证明至少当前小程序与好友邀请调用链有一部分真实可用，但本轮没有重新读取控制台，不能据此声称三个云函数均已正确部署或全部运行正常。

### 5.2 已完成的上传故障排查

本轮只读检查得到：

- `project.config.json`、`project.private.config.json`、`package.json` 都是合法 JSON；
- 公共配置继续使用安全占位 AppID；
- 被 Git 忽略的私有配置中存在已配置的真实 AppID；不得输出或提交其值；
- `cloudfunctionRoot` 是 `cloudfunctions/`；
- `miniprogramRoot` 是 `miniprogram/`；
- 三个云函数名和客户端调用名一致；
- 三个云函数的 `wx-server-sdk` 仍为 `4.0.2`；
- 小程序目录原始体积约 2,295,780 字节、1,239 个文件；
- 其中 `miniprogram_npm` 约 1,451,378 字节，assets 约 491,250 字节；
- 这接近主包限制，可能相关，但尚未获得开发者工具最终上传包数据，不能直接认定为根因；
- 开发者工具最近日志没有给出上传异常，只看到无关的真机调试告警；
- 已定位开发者工具自带 CLI：`C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`；
- 已确认 CLI 支持 `islogin` 和 `upload --project --version --desc --info-output`；
- `islogin` 检查刚开始就因用户要求创建交接节点而被主动终止，没有修改外部状态。

### 5.3 当前 Git 基线

- 分支：`codex/social-v2`；
- 交接前 HEAD：`800ede7 feat: harden CloudBase security and data deletion`；
- `main` 与比赛第一版：`4f517e9 feat: finalize competition v1`；
- 交接开始前没有 tracked diff；
- 只有 `.editorconfig` 和 `.gitattributes` 两个未跟踪文件，它们来自上一轮 Windows CRLF/LF 防复发修复，不是业务代码；
- 本交接节点应包含上述两个配置和 `docs/AI_HANDOFF.md`，提交后工作区应干净。

## 6. 尚未完成的工作

### 6.1 当前阻塞任务

- 找到开发者工具上传 `[object Object]` 的真实错误；
- 成功上传 Social V2 开发版本；
- 在微信公众平台把它设为体验版；
- 添加第二个微信账号为体验成员；
- 双方从同一个体验版重新生成和打开邀请；
- 区分微信开发版过期与 iSdu Token 过期。

### 6.2 云端核验

- 重新确认控制台实际存在 `auth-api`、`memory-api`、`friend-api`；
- 确认三者部署状态、运行时和云端依赖安装正常；
- 分别完成最小安全调用；
- 确认所有集合、索引、数据库权限、存储规则和函数调用权限仍与文档一致；
- 不得在核验时输出 OpenID、identityHash、正文、fileID 或临时图片 URL。

### 6.3 双账号和真机安全验收

- A/B 身份隔离；
- 本地迁云默认私密、幂等和图片失败恢复；
- 好友邀请预览、手动接受、重复接受、自邀、过期和删除重加；
- 三种可见范围；
- 删除好友或改私密后的详情、图片、点赞和地图越权；
- 重复点赞、取消和快速连续操作；
- 好友 24 小时边界与地图版本过滤；
- iOS、Android、弱网、前后台和重新启动；
- 云端账号数据删除；
- 上传包体、编译耗时和云函数冷启动记录。

未完成以上验收前，只能表述为：

> 代码与自动测试完成，真实社交安全待验收。

## 7. 已确定的重要设计和架构决策

### 7.1 原生小程序而不是跨端框架

选择 TypeScript + WXML + WXSS，减少比赛期框架迁移和包体风险，并直接使用微信原生手势、文件系统和云开发能力。

### 7.2 自研插画地图而不是腾讯地图/GPS

产品目标是“空间日记”，不是导航。插画地图用比例坐标保持跨屏幕稳定，并避免定位权限、真实道路地图风格和 GPS 隐私成本。

### 7.3 坐标必须为比例且绑定地图版本

固定像素会在屏幕、缩放和资源替换时漂移。`[0,1]` 比例坐标与地图版本共同决定标记是否可投影；旧版本回忆不能直接投影到新地图的错误建筑。

### 7.4 本地与云端通过服务/Repository 隔离

页面不直接散落访问 Storage 或数据库。`MemoryService` 依据明确迁移状态选择单一主数据源，避免 CloudBase 故障时出现本地和云端双主写入。

### 7.5 云端身份只能来自可信上下文

服务端只信任 `cloud.getWXContext()`，不信任客户端提供的 OpenID、用户 ID、作者 ID或好友状态。客户端对外只使用随机 iSdu 用户 ID。

### 7.6 好友必须双向确认

iSdu 不读取微信好友列表。邀请只用于预览，接收者仍需主动点击接受；关系使用 `relationshipId`，删除再添加不会恢复旧的“部分好友”授权。

### 7.7 回忆默认私密

新建和迁移默认 `private`。详情、图片、点赞和好友地图分别在服务端重新鉴权，不能仅靠客户端隐藏按钮。

### 7.8 图片保存 fileID，读取签发短期地址

数据库不保存永久公开 URL，页面不长期缓存临时 URL。即使已下载副本无法远程撤回，撤销权限后也必须阻止后续请求。

## 8. 明确放弃或禁止重复尝试的方案

- 不读取微信通讯录或微信好友列表；微信没有为本产品开放这种好友读取方案；
- 不把好友改成单向关注；
- 不做全站公开、陌生人动态、评论、私信或推荐流；
- 不使用 GPS、原生 `<map>` 或腾讯地图替代当前插画底图；
- 不切 Skyline；
- 不引入 React、Vue、uni-app、Vant、WeUI、Godot 或第二套正式 UI 库；
- 不复制 TDesign retail starter 的商城业务；
- 不把临时图片路径、Base64 或临时 URL当永久数据；
- 不在客户端直连业务集合或相信客户端身份字段；
- 不把真实 AppID、环境 ID、OpenID、密钥写入 Git；
- 不把环境 ID硬编码到 `runtime.ts`；
- 不因云端失败静默写回本地；
- 不新建第二个 CloudBase 环境来规避现有环境问题；
- 不删除 `package-lock.json`，不升级依赖来绕过格式或部署故障；
- 不把 Prettier `endOfLine: lf` 改成 `auto` / `crlf`；
- 不通过修改邀请业务代码解决截图中的“开发版小程序已过期”。

## 9. 当前已知 bug、风险和技术债

### P0：当前阻塞

- 开发者工具上传只弹 `[object Object]`，体验版无法建立；
- 分享卡片仍指向过期开发版，第二账号无法进入；
- 三个云函数当前在控制台的最终存在状态尚未由本轮重新核验。

### P1：真实安全验收

- 双账号越权矩阵未完成；
- 私密图片的云存储直读阻断和短期地址撤销未完成真机验证；
- CloudBase 弱网、冷启动、部分上传失败和事务并发未完成真实环境验证；
- 当前 CloudBase 套餐/免费额度曾阻止自定义存储规则变更，规则最终状态需重新核实。

### P1：包体和工具链

- 原始 `miniprogram/` 约 2.30 MB，构建后的 TDesign 目录占比大；需获得开发者工具实际上传包分析，不能靠删除依赖或业务文件盲目修；
- 当前开发者工具版本曾出现基础库下载/TLS、真机调试和 `[object Object]` 等工具异常；
- Windows 全局 Git `core.autocrlf=true` 曾把大量受 Prettier 管理的文件转成 CRLF；交接节点新增 `.gitattributes` / `.editorconfig` 固定 LF；
- `miniprogram_npm` 是本机构建产物，不进 Git，换机后必须重新“工具 → 构建 npm”。

### P2：产品技术债

- 个人地图标记没有聚合；大量日记仍可能重叠；
- 当前地图边界/手势历史上多次出现回弹、空气墙和可停留空白区问题，现有代码有人工校正逻辑，后续修改必须回归多机型，不能再叠加另一套高频 `setData` 边界算法；
- 星点随地图缩放，未做屏幕尺寸恒定标记；
- 本地图片缺少统一总容量统计与孤儿文件巡检；
- 清除小程序数据或卸载仍会删除本机副本；
- README 与 `docs/STATUS.md` 的部分部署状态已经滞后。

## 10. 最近修改过的重要文件及作用

- `AGENTS.md`：第二阶段范围、安全、地图、Git 与停止条件；所有后续工作必须先读。
- `miniprogram/config/runtime.ts`：当前 `mode: local`、CloudBase 初始化开启但不写环境 ID。
- `miniprogram/app.ts`：启动时初始化 CloudBase。
- `miniprogram/services/cloud/cloud-initializer.ts`：可失败、可禁用的 `wx.cloud.init()` 包装。
- `miniprogram/services/cloud/cloud-mode-service.ts`：记录隐私同意、迁移完成和本地/云模式。
- `miniprogram/services/memory-service.ts`：本地和云端回忆的唯一运行时入口。
- `miniprogram/services/memory-migration-service.ts`：逐条迁移、失败报告、全部成功才切云模式。
- `miniprogram/services/repository/cloud-memory-repository.ts`：云回忆 CRUD、迁移、权限、好友地图和图片上传计划。
- `miniprogram/services/repository/cloud-friend-repository.ts`：邀请、解析、接受、好友列表和删除。
- `miniprogram/services/repository/cloud-like-repository.ts`：授权点赞/取消。
- `miniprogram/pages/friends/*`：好友列表和微信邀请分享。
- `miniprogram/pages/friend-invite/*`：邀请参数解析、预览和手动接受。
- `miniprogram/pages/editor/*`：编辑内容及可见范围选择。
- `miniprogram/pages/detail/*`：自己的详情、好友共享详情、临时图片和点赞。
- `miniprogram/pages/map/*`：地图手势、标记筛选、选点和好友 24h 图层；高风险回归文件。
- `miniprogram/pages/profile/*`：本机数据、迁云和云端删除入口。
- `cloudfunctions/auth-api/*`：可信身份、资料和云端账号清理编排。
- `cloudfunctions/memory-api/*`：云回忆、图片、可见范围、点赞和好友地图权限。
- `cloudfunctions/friend-api/*`：邀请和双向关系。
- `scripts/security-scan.mjs`：敏感信息、包体异常和云函数依赖检查。
- `docs/CLOUDBASE_SECURITY_DEPLOYMENT.md`：集合、索引、规则和部署顺序。
- `docs/SOCIAL_V2_MANUAL_TEST.md`：双账号安全验收矩阵。
- `docs/RELEASE_READINESS.md`：发布硬门禁。
- `docs/STATUS.md`：功能实现记录；云端部署段落已部分过时。
- `.gitattributes` / `.editorconfig`：Windows 下固定 LF，避免 109 个文件再次被 CRLF 污染。

## 11. 当前 Git status / git diff 的含义

交接制作前：

```text
## codex/social-v2
?? .editorconfig
?? .gitattributes
```

含义：

- 没有任何已跟踪业务文件被修改；
- 两个未跟踪文件都是上一轮格式防复发配置；
- `.gitattributes` 将文本规范为 LF，并把常见图片标为 binary；
- `.editorconfig` 规定 UTF-8、LF、两个空格、文件末尾换行和尾随空格规则；
- 它们不会改变微信小程序、WXML、WXSS、JSON、Markdown 或云函数的业务语义。

本交接节点只应新增：

- `.gitattributes`；
- `.editorconfig`；
- `docs/AI_HANDOFF.md`。

提交后必须再次执行 `git status`，预期工作区干净。不要把 `project.private.config.json`、`node_modules`、`miniprogram_npm`、真实配置或开发者工具日志加入提交。

## 12. 测试、lint、typecheck 和 format 命令

Node/npm 要求见 `package.json`。Windows PowerShell 建议：

```powershell
npm.cmd ci --registry=https://registry.npmjs.org/
npm.cmd run check
```

`npm run check` 依次执行：

```text
npm run test
npm run typecheck
npm run lint
npm run format:check
npm run scan:security
```

交接节点创建前已经实际执行一次完整 `npm.cmd run check`，结果为：129 项测试全部通过，TypeScript、ESLint、基础文件/WXML/WXSS Prettier 检查全部通过，security scan 实际运行并通过（扫描 133 个仓库文件）。这只证明静态检查和自动测试通过，不代表微信开发者工具上传、CloudBase 控制台或双账号真机已经通过。

专项命令：

```powershell
npm.cmd run test:coordinates
npm.cmd run test:memory
npm.cmd run test:image
npm.cmd run test:cloud-auth
npm.cmd run test:cloud-memory
npm.cmd run test:cloud-friends
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd run scan:security
```

已知 npm 镜像问题：`npm ci` 使用 `https://registry.npmmirror.com/` 曾报 npm 自身的 `Exit handler never called!`；使用官方 registry 成功。不要删除或重建锁文件。

提交前还要执行：

```powershell
git diff --check
git status --short --branch
git diff --stat
```

## 13. 必须遵守的约束

1. 每次开始先完整阅读 `AGENTS.md`。
2. 不在 `main` 开发，不重写比赛第一版历史。
3. 保留用户工作，禁止 `git reset --hard`、`git clean -fd` 和强推。
4. 当前暂停新增功能，先完成部署和验收。
5. 不把“自动测试通过”描述成“真实云端或真机通过”。
6. 不打印或提交 AppID、环境 ID、OpenID、密钥、邀请 Token、正文、fileID 或临时图片地址。
7. 不改变集合名、索引、数据库权限、存储规则或函数调用权限，除非用户单独授权且先核对文档。
8. 不改变三个云函数的 `wx-server-sdk@4.0.2`。
9. 不删除 `package-lock.json`，不随意升级依赖。
10. 不提交 `node_modules`、`miniprogram_npm` 或 `project.private.config.json`。
11. 不硬编码 CloudBase 环境 ID。
12. 不读取微信好友、通讯录、手机号或微信号。
13. 不绕过服务端权限检查。
14. 地图坐标必须保持比例与版本绑定。
15. 任何地图手势修改都必须回归 iOS、Android、缩放、四角和选点。
16. 未得到明确要求不推送远程、不创建 PR、不提交审核、不发布线上版。

## 14. 下一位 Agent 最合理的继续顺序

1. 读 `AGENTS.md`、本文、`docs/RELEASE_READINESS.md`、`docs/CLOUDBASE_SECURITY_DEPLOYMENT.md` 和 `docs/SOCIAL_V2_MANUAL_TEST.md`。
2. 检查当前分支、HEAD、Git 工作区和交接提交。
3. 不改业务代码，先复现并取得开发者工具上传真实错误。
4. 使用已定位的开发者工具 CLI 先执行 `islogin`；若登录正常，再用 `upload` 的 `--info-output` 输出结构化诊断。输出必须脱敏。
5. 根据真实错误处理：优先检查开发者工具登录、项目成员上传权限、私有 AppID是否被上传命令识别，以及实际主包分析；不要先删功能。
6. 成功上传后只设为体验版，不提交审核、不发布线上版。
7. 添加第二账号为体验成员，双方进入同一体验版并生成新邀请。
8. 若此时 iSdu 页面内仍提示邀请过期，再检查 `friend-api` 的 `expiresAt`、Token 传参和环境一致性；在此之前不要改邀请逻辑。
9. 核对三个云函数和 CloudBase 配置。
10. 按双账号安全清单逐项验收并记录真实结果。
11. 只有安全矩阵通过后，才更新 README、STATUS 和发布结论。

## 15. 下一步具体应该完成什么

下一步唯一任务：

> 在不修改业务代码、不新建 CloudBase 环境、不暴露真实配置的前提下，取得微信开发者工具上传 `[object Object]` 的真实错误并修复，使当前 Social V2 成功上传为体验版。

推荐从以下只读/受控诊断继续：

```powershell
& 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat' `
  islogin `
  --project 'C:\Users\24578\Desktop\iSdu-social-v2' `
  --lang zh
```

登录正常后，再由用户确认版本号和说明，使用 `upload --info-output <临时文件>` 获取结构化结果。临时输出不得提交，读取时应对 AppID、环境 ID和身份信息脱敏。

成功标准：

- 微信公众平台“开发版本”出现本次 Social V2；
- 可将它设为体验版；
- 第二账号有体验权限并能打开；
- 新分享卡片不再触发“开发版小程序已过期”；
- 此过程没有修改或发布比赛第一版；
- 没有修改业务代码、数据库设计或安全规则。

## 16. 现有文档的过时点

### README.md

README 的“当前阶段”仍写成 `0.9.0` 本地公测，并声称尚未接入 CloudBase、登录和社交。这对 `main` 比赛第一版仍基本成立，但对当前 `codex/social-v2` 明显过时。下一次状态文档维护时应将“比赛第一版”和“Social V2”分栏，不要直接删掉比赛版说明。

### docs/STATUS.md

功能实现记录较完整，但前部仍写“没有创建或部署真实云资源”。用户后来已经人工创建测试环境并能生成邀请，因此这部分已过时；由于本轮没有重新验证控制台，当前不能直接改成“三个函数均部署成功”，应在核验后更新。

### docs/CLOUDBASE_IDENTITY_SETUP.md

第 6 节示例仍写 `cloudEnabled: false`，而实际 `runtime.ts` 已是 `cloudEnabled: true`。文档应在后续维护时改成说明“CloudBase 初始化已启用，但主数据仍由本机迁移状态决定”。

### AGENTS.md

核心范围、安全、技术栈和 Git 约束仍有效，不应在本交接中修改。可能需要补充的只是当前阶段状态：Social V2 功能代码已完成，现处部署/双账号安全验收期；比赛版 P0/P1 描述是历史基线，不是当前待开发清单。
