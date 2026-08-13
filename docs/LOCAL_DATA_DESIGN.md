# 本地数据设计

更新日期：2026-08-11

## 1. 目标与边界

本阶段使用微信小程序本地 Storage 和本地用户文件目录，完成单用户、单校区的校园回忆闭环。页面通过统一 `MemoryRepository` 读写日记，不直接散落 `wx.getStorageSync`、`wx.setStorageSync` 或数据库调用。

本设计不接入 CloudBase、云存储、登录、公开发布或多用户数据。它不是云端备份方案；卸载小程序、清除微信数据或系统清理本地文件后，数据可能无法恢复。

## 2. Memory 数据模型

权威类型定义位于 `miniprogram/models/memory.ts`：

```ts
interface Memory {
  id: string;
  text: string;
  imagePaths: string[];
  placeName: string;
  mood: 'happy' | 'calm' | 'nostalgic' | 'inspired';
  category: 'campus-life' | 'friendship' | 'study' | 'nature';
  mapXRatio: number;
  mapYRatio: number;
  recordedAt: string;
  origin: 'demo' | 'user';
  createdAt: string;
  updatedAt: string;
}
```

字段与约束：

| 字段         | 含义                 | 约束                                                                                |
| ------------ | -------------------- | ----------------------------------------------------------------------------------- |
| `id`         | 日记稳定标识         | 字母或数字开头，只含字母、数字、`_`、`-`，最长 100 字符；新建前生成，创建后不再改变 |
| `text`       | 正文                 | 去除首尾空格，最长 2000 字；可以为空，但不能与图片同时为空                          |
| `imagePaths` | 持久化后的本地图片   | 0 至 3 项；去空、非空、不能重复；不能保存 `wx.chooseMedia` 临时路径                 |
| `placeName`  | 用户填写的地点名称   | 允许为空，去除首尾空格，最长 60 字                                                  |
| `mood`       | 记录时的心情         | 只能是四个固定枚举值之一                                                            |
| `category`   | 回忆分类和标记颜色   | 只能是四个固定枚举值之一；不要与心情字段混用                                        |
| `mapXRatio`  | 横向比例坐标         | 有限数字，闭区间 `[0, 1]`；原点为地图左上角，向右增加                               |
| `mapYRatio`  | 纵向比例坐标         | 有限数字，闭区间 `[0, 1]`；原点为地图左上角，向下增加                               |
| `recordedAt` | 用户记录的发生时间   | 标准 UTC ISO 字符串，例如 `2026-08-11T08:30:00.000Z`                                |
| `createdAt`  | 首次成功保存时间     | Repository 生成的标准 UTC ISO 字符串                                                |
| `updatedAt`  | 最近一次成功更新时间 | Repository 生成；新建时与 `createdAt` 相同                                          |
| `origin`     | 数据来源             | Seed 数据为 `demo`，用户创建的数据由 Repository 固定写为 `user`                     |

正文和图片遵守“至少有一项”规则：纯文字日记可以保存，纯照片日记也可以保存，但两者同时为空会被拒绝。日期全部使用规范 ISO 字符串，以便直接稳定排序并为未来 CloudBase 迁移保留明确时区。

读取 Storage 时，每条记录都会重新经过 schema 和业务约束校验。页面不得绕过 `normalizeCreateMemoryInput`、`normalizeMemoryContent` 和 Repository 自行构造不完整记录。

## 3. Repository 契约

契约位于 `miniprogram/services/repository/memory-repository.ts`：

```ts
interface MemoryRepository {
  listMemories(): Promise<Memory[]>;
  getMemoryById(id: string): Promise<Memory | null>;
  createMemory(input: CreateMemoryInput): Promise<Memory>;
  updateMemory(id: string, input: UpdateMemoryInput): Promise<Memory>;
  deleteMemory(id: string): Promise<void>;
}
```

当前实现为 `LocalMemoryRepository`，默认单例由 `memoryRepository` 导出。页面的正式数据读写只使用上述 CRUD；首次 Demo Seed 使用本地实现的 `initializeDemoMemories()` 扩展。未来替换 `CloudMemoryRepository` 时，CRUD 保持一致，Demo 初始化由运行模式协调层决定。

行为约定：

- `listMemories()` 按 `recordedAt` 倒序排列；相同时间再按 `createdAt` 和 `id` 稳定排序。
- `getMemoryById()` 对合法但不存在的 ID 返回 `null`。
- `createMemory()` 自动写入 `origin: 'user'`、`createdAt` 和 `updatedAt`，并拒绝重复 ID。
- `updateMemory()` 保留原 `id`、`origin` 和 `createdAt`，只更新可编辑内容与 `updatedAt`。
- `deleteMemory()` 对不存在的记录返回 `NOT_FOUND`，不静默成功。
- 返回的 Memory 和 `imagePaths` 都是副本，调用方修改它们不会污染 Repository 内部快照。

Repository 使用 `MemoryRepositoryError` 区分以下错误：

- `CORRUPT_DATA`
- `DUPLICATE_ID`
- `INVALID_ID`
- `NOT_FOUND`
- `STORAGE_READ_FAILED`
- `STORAGE_WRITE_FAILED`
- `UNSUPPORTED_SCHEMA`

页面必须捕获这些错误并显示可理解的状态，不能让 Promise 拒绝成为未处理异常。

## 4. Storage 键与版本化快照

本地日记只使用一个正式键：

```text
sdu-memory:memories:v1
```

Storage 中保存的是 JSON 字符串，解析后的 envelope 为：

```ts
interface MemoryStorageEnvelope {
  schemaVersion: 1;
  updatedAt: string;
  memories: Memory[];
}
```

每次写操作都先在内存中生成完整的新数组和 envelope，再通过一次 `wx.setStorageSync` 覆盖单键快照。若序列化、校验或 Storage 写入失败，调用方收到 `STORAGE_WRITE_FAILED`，页面不得假定保存成功。

`schemaVersion` 与 Storage 键版本承担不同职责：键名用于隔离大版本，envelope 字段用于读入时验证和未来迁移。当前只接受版本 `1`，其他版本返回 `UNSUPPORTED_SCHEMA`，不得强行按当前结构读取。

### 4.1 本机个人资料

“时光”页的名字和个性签名使用独立键保存：

```text
sdu-memory:user-profile:v1
```

资料结构为：

```ts
interface UserProfile {
  displayName: string; // 必填，最多 20 字
  signature: string; // 可空，最多 80 字
  campusName: string; // 当前为“山东大学中心校区”
  updatedAt: string; // 规范 UTC ISO 时间
}
```

`LocalUserProfileRepository` 负责读取、校验和写入，页面不直接调用 Storage。资料与 Memory 分开存储，因此改名、改签名或资料损坏不会改写日记快照。读入时会重新应用当前 `campusMapConfig.displayName`，使校区正式改名时不依赖旧资料中的历史文案。

本功能仍是单用户本地展示：不读取微信账号资料，不保存头像，不包含用户 ID、登录态、公开权限或社交关系。未来接入 CloudBase 时，个人资料需要单独设计用户归属和权限，不能把当前本地资料键直接视为云端身份。

## 5. Demo Seed 与用户数据

`miniprogram/data/demo-memories.ts` 保存首次演示用的三条 Seed 数据，它们明确标记：

```text
origin = demo
```

用户通过 `createMemory()` 创建的记录固定为：

```text
origin = user
```

`initializeDemoMemories()` 通过 `StorageAdapter.has()` 检查 key 是否真实存在，只在 `sdu-memory:memories:v1` 从未存在时写入 Seed。一旦键存在，即使 envelope 中的 `memories` 是空数组，也不能再次自动 Seed。因此用户主动删除到零条后，重新打开小程序仍保持真正的空状态，不会重新出现演示日记。键存在但值为 `''`、`null` 或损坏 JSON 时按损坏数据报错，绝不能误当首次启动并覆盖为 Demo。

不得在每次 `App.onLaunch`、地图 `onShow` 或页面刷新时覆盖已有快照。如果以后增加“恢复演示数据”，它只能作为开发环境显式操作，并且必须保留全部 `origin: 'user'` 记录，只替换或补充 `origin: 'demo'` 记录。

Demo 图片若使用代码包内资源，不属于本地图片服务的受管目录，删除 Demo 日记时不能尝试删除包内资源。

## 6. 本地图片保存位置与服务

`wx.chooseMedia` 返回的 `tempFilePath` 是临时文件，不能直接写入 Memory 作为永久路径。正式本地图片由 `miniprogram/services/local-image-service.ts` 保存到：

```text
${wx.env.USER_DATA_PATH}/sdu-memory/images/<memoryId>/<generatedFileName>
```

对外单例为 `localImageService`：

```ts
persistTempImages(memoryId, tempFilePaths): Promise<string[]>;
cleanupManagedImages(filePaths): Promise<{
  removedPaths: string[];
  failedPaths: string[];
}>;
isManagedImagePath(filePath): boolean;
```

实现使用 `FileSystemManager.mkdir` 创建记忆目录，再使用 `FileSystemManager.saveFile` 把临时文件移动到指定用户目录。`saveFile` 成功后，原临时路径不应再被使用。

图片服务的边界：

- 单次 `persistTempImages` 只接受 1 至 3 个非空、不重复的临时路径。
- `memoryId` 和生成文件名经过安全校验，不能包含路径分隔符或 `..`。
- 保存多张图片时按顺序执行；中途失败会逆序删除本轮已保存文件。
- 若回滚删除也失败，失败文件路径通过 `LocalImageServiceError.failedPaths` 返回，供 UI 明确提示或后续清理。
- `cleanupManagedImages` 只删除 `USER_DATA_PATH/sdu-memory/images/` 下且不存在父级穿越的路径。
- 包内图片、临时图片、其他业务目录或任意外部路径都会被拒绝，并出现在 `failedPaths` 中。
- 图片内容不转换为 Base64，也不写入 Storage。
- 服务使用惰性微信单例，模块被 Node 测试导入时不会在顶层读取 `wx`；测试通过注入 Fake Adapter 验证文件事务。

编辑页调用 `wx.chooseMedia` 时请求 `sizeType: ['compressed']`，并拒绝压缩后大小无效或单张超过 5 MiB 的图片。图片服务仍会独立执行数量与路径安全校验；大小限制属于当前页面策略，未来抽取业务协调层时应同时迁移，不能只依赖 UI 提示。

文字日记可能没有新增图片。此时调用方应直接使用空 `imagePaths`，不要以空数组调用 `persistTempImages`。

## 7. 新建、编辑与删除事务

Repository 和图片文件系统无法组成真正的数据库事务，因此页面或上层业务服务必须严格遵守以下顺序，使失败最多产生可清理的孤儿文件，而不是让有效日记引用已经删除的图片。

### 7.1 新建

1. 进入新建流程时生成稳定 `memoryId`，同一次保存重试继续使用该 ID。
2. 使用页面级 `isSaving` 阻止连续点击；Repository 的重复 ID 检查是第二道保护。
3. 有新照片时先调用 `persistTempImages(memoryId, tempPaths)`。
4. 所有图片成功后，用返回的持久化路径调用 `createMemory()`。
5. Repository 写入失败时，调用 `cleanupManagedImages(newPersistentPaths)` 回滚本轮图片。
6. 图片保存失败时不得调用 Repository，正文和表单状态应保留，允许用户移除图片或重试。

### 7.2 编辑

编辑态必须区分：

- 保留的旧持久化路径；
- 用户移除的旧持久化路径；
- 本轮新选择的临时路径。

事务顺序：

1. 编辑过程中移除旧图片时只更新表单，不立即删除文件；取消编辑后原记录仍应完整可用。
2. 先持久化本轮新增图片。
3. 用“保留旧路径 + 新持久化路径”调用 `updateMemory()`。
4. Repository 更新失败时，只回滚本轮新增图片，不能删除旧图片。
5. Repository 更新成功后，再检查被移除旧路径是否仍被其他 Memory 引用。
6. 只清理引用计数为零且 `isManagedImagePath()` 返回 `true` 的旧路径。
7. 清理失败不回滚已经成功的日记更新；UI 应提示“日记已保存，但部分旧图片未清理”。

### 7.3 删除

1. 二次确认后先读取待删除 Memory，保存其 `imagePaths` 作为清理候选。
2. 先调用 `deleteMemory(id)` 删除数据快照。
3. Repository 删除失败时，不得删除任何图片。
4. 删除成功后重新读取剩余 Memories，建立所有剩余 `imagePaths` 的引用集合。
5. 只清理“不再被任何 Memory 引用且属于受管目录”的候选路径。
6. 图片清理部分失败时，日记数据已经删除，失败只会留下孤儿文件；必须显示明确提示并保留 `failedPaths` 供诊断，不得声称全部清理成功。

当前 `LocalImageService` 负责安全保存、回滚和受管路径清理；跨 Repository 的引用检查和上述业务顺序由调用页面或业务协调层负责，不能误认为单独调用图片服务已经完成整篇日记事务。

## 8. 损坏数据与缺失图片

`parseMemoryStorage()` 在读入时检查：

- JSON 是否可解析；
- envelope 是否为对象；
- `schemaVersion` 是否支持；
- `updatedAt` 是否为规范 ISO 时间；
- `memories` 是否为数组；
- 每条 Memory 是否满足字段类型和全部业务约束。

解析失败返回 `CORRUPT_DATA`，当前实现不会自动用空数组覆盖损坏原值。页面应进入可恢复错误状态，提供重试、导出诊断信息或由用户明确确认的重置操作；不能白屏，也不能在用户不知情时丢弃原数据。

图片文件丢失与 JSON 损坏是两类不同问题。Memory 结构仍合法但图片无法读取时，应保留正文、坐标和其余图片，在图片组件 `binderror` 中显示占位状态，并允许用户编辑移除失效路径或删除日记。不得因为单张图片丢失而丢弃整篇日记。

## 9. 存储空间、临时路径和卸载风险

- Storage 和 `USER_DATA_PATH` 都有平台与设备空间限制；具体可用量不能写死为所有设备相同。
- 当前选择照片限制 1 至 3 张、请求压缩图，并设置单张 5 MiB 上限；保存失败仍可能表示空间不足、文件失效或系统文件操作失败。
- 正文和 metadata 存在单一 Storage JSON 中，照片只存文件路径，严禁把照片 Base64 写入 Storage。
- 临时路径的生命周期不受项目控制。用户选图后应在本次有效会话内完成持久化，不能把临时路径留到重启后继续保存。
- 正常关闭或重新打开小程序时，Storage 和用户文件通常继续存在；但卸载小程序、清除微信数据、系统清理、设备迁移或异常损坏都可能使本地记录或图片消失。
- 本地模式没有跨设备同步、云端恢复或长期备份保证。比赛演示前应在目标设备完整走一遍重启后的读取与图片显示测试。
- 图片更新和删除必须执行引用检查，定期清理已确认无引用的受管孤儿文件，避免长期占用空间。

## 10. 未来迁移 CloudBase

页面继续依赖 `MemoryRepository`，CloudBase 里程碑新增 `CloudMemoryRepository`，而不是在页面中加入 `if (cloud)` 分支。

迁移时保持以下字段语义不变：

- `id`
- 正文、地点、心情和分类
- `[0,1]` 比例坐标
- 三个 ISO 时间字段
- 图片顺序

本地 `imagePaths` 不能直接写入云数据库。迁移顺序应为：

1. 读取并校验本地 Memory。
2. 将仍存在的受管本地图片上传到当前用户隔离的云存储路径。
3. 取得稳定 `fileID`，不要把会过期的临时访问 URL 当永久数据。
4. 以统一 Repository 契约创建云端文档。
5. 回读并验证云端文档和图片数量。
6. 只有在云端完整成功且用户明确选择后，才考虑清理本地副本。

云端实现必须保持重复保存保护、时间排序、字段校验和删除引用规则，并增加“仅创建者可读写”的数据库与存储安全规则。`origin` 可以继续用于区分演示与用户内容，但不能替代云端用户归属和权限字段。

## 11. 自动测试与人工验证边界

当前纯逻辑测试覆盖 Memory 校验、Repository 新建/更新/删除、排序、重复 ID、空数据、损坏数据，以及图片服务的数量限制、部分失败回滚和受管目录清理。

以下内容仍必须在微信开发者工具和真机验证：

- `wx.chooseMedia` 取消与真实临时路径；
- `FileSystemManager.saveFile` 在 Android 和 iOS 的实际表现；
- 空间不足和文件权限错误提示；
- 新建、编辑和删除事务的 UI 状态；
- 小程序重启后 Storage 和图片是否仍可读取；
- 图片文件丢失时的占位与恢复流程；
- 卸载或清除数据后的预期不可恢复状态。
