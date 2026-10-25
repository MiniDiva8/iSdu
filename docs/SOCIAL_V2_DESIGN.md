# iSdu 第二阶段社交与云端设计

更新日期：2026-08-15

## 1. 目标与已确认决策

第二阶段在比赛第一版的空间日记闭环上增加最小、私密、可撤销的好友共享能力：

1. 使用微信小程序与 CloudBase 的可信身份上下文识别当前用户。
2. 用户通过邀请主动建立 iSdu 双向好友，不读取微信好友列表。
3. 回忆可设置为私密、部分好友可见或全部好友可见。
4. 有查看权限的好友可以点赞或取消点赞。
5. 地图提供独立的“好友近 24 小时”图层。

第二阶段不提供全站公开、陌生人内容、评论、私信、关注、推荐、GPS 或附近的人。

## 2. 产品语义

### 2.1 登录

- 用户在阅读并同意隐私说明后进入云端版。
- 小程序通过 CloudBase 云函数的可信调用上下文识别用户，不在客户端保存密码、OpenID、session key 或自签 Token。
- 服务端为每个 OpenID 映射一个不可推断的 iSdu `userId`。
- 昵称、头像和个性签名由用户主动设置；其他用户只看到用户明确填写的公开资料。

### 2.2 好友

- 好友是双方确认的 iSdu 应用内关系。
- 邀请凭证通过小程序分享路径或小程序码传递，具有有效期且不可包含 OpenID。
- 接收者打开邀请后仍需明确确认，不能仅因点击分享卡片自动建立关系。
- 任一方删除好友后，关系立即失效，双方不再满足好友可见权限。

### 2.3 可见范围

| 值                 | 用户文案     | 服务端读取条件                                     |
| ------------------ | ------------ | -------------------------------------------------- |
| `private`          | 仅自己可见   | 只有创建者                                         |
| `selected_friends` | 部分好友可见 | 当前仍是双向好友，且查看者在 `visibleToUserIds` 中 |
| `friends`          | 全部好友可见 | 当前仍是双向好友                                   |

创建和本地迁移的默认值必须是 `private`。第二阶段不定义 `public`。

### 2.4 点赞

- 查看者必须在点赞请求执行时仍有回忆读取权限。
- 创建者本人不显示点赞按钮。
- `(memoryId, userId)` 只有一条有效记录，再次操作为取消点赞。
- 客户端只接收 `likeCount` 与 `likedByMe`，本阶段不提供完整点赞用户列表和通知。

### 2.5 好友近 24 小时地图

- 使用独立图层，不与“我的回忆”默认混合。
- 24 小时窗口按第一次共享时的 `publishedAt` 计算，不按可回填的 `recordedAt` 计算。
- 查询结果只包含当前用户有权查看且地图版本兼容的最小字段。
- 地图默认显示小圆点；点击后再请求经过权限校验的简要卡片和临时图片地址。
- 回忆变为私密、删除好友、删除回忆或超过 24 小时后，应在下一次刷新时消失。

## 3. 数据模型

所有时间保存为 ISO 字符串；所有输入在云函数重新校验，不能直接信任客户端 TypeScript 类型。

### 3.1 `users`

```ts
interface CloudUser {
  _id: string; // 随机 iSdu userId，对外可使用
  identityHash: string; // 可信 APPID + OPENID 的服务端哈希，不返回客户端
  displayName: string;
  avatarFileId: string;
  signature: string;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
}
```

索引：`identityHash` 唯一。当前实现不在业务集合保存原始 OpenID；云函数从可信调用上下文取得 APPID 与 OPENID，计算 SHA-256 身份哈希后查询用户。身份哈希仍属于内部标识，不得返回客户端或写入日志。

### 3.2 `friend_requests`

```ts
interface FriendRequest {
  _id: string;
  requesterUserId: string;
  receiverUserId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
  inviteTokenHash: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}
```

同一对用户只能有一条有效待处理请求。用户不能邀请自己。

### 3.3 `friendships`

```ts
interface Friendship {
  _id: string;
  pairKey: string; // 两个随机 userId 排序后生成，不含 OpenID
  userIds: [string, string];
  createdAt: string;
  updatedAt: string;
}
```

索引：`pairKey` 唯一；`userIds` 用于查询当前用户好友。

### 3.4 `memories`

在现有 Memory 语义上增加：

```ts
interface CloudMemoryFields {
  ownerUserId: string;
  imageFileIds: string[];
  visibility: 'private' | 'selected_friends' | 'friends';
  visibleToUserIds: string[];
  publishedAt: string | null;
  likeCount: number;
  schemaVersion: 2;
}
```

规则：

- `private` 和 `friends` 的 `visibleToUserIds` 必须为空。
- `selected_friends` 的允许列表最多保存经过服务端确认的当前好友 userId。
- 第一次从 `private` 改为好友可见时设置 `publishedAt`。
- 从好友可见改回 `private` 后保留 `publishedAt` 作为审计字段，但任何好友查询必须排除该记录。
- 图片永久字段只保存 `fileID`，不保存临时 URL。

索引：`ownerUserId + recordedAt`、`ownerUserId + publishedAt`、`publishedAt + visibility`。

### 3.5 `likes`

```ts
interface MemoryLike {
  _id: string;
  pairKey: string; // memoryId:userId 的不可歧义编码或哈希
  memoryId: string;
  userId: string;
  createdAt: string;
}
```

索引：`pairKey` 唯一、`memoryId + createdAt`。

### 3.6 `invite_tokens`

```ts
interface InviteToken {
  _id: string;
  tokenHash: string;
  creatorUserId: string;
  expiresAt: string;
  usedAt: string | null;
  usedByUserId: string | null;
  createdAt: string;
}
```

数据库只保存 Token 哈希；原始 Token 只出现在短期分享路径中。

## 4. 云函数边界

页面不得直接读取其他用户数据。第二阶段按领域提供最小云函数入口：

### `auth-api`

- `bootstrap`：取得可信 OpenID，创建或读取 iSdu 用户。
- `getMyProfile`：读取自己的资料。
- `updateMyProfile`：更新主动填写的昵称、头像和签名。

### `friend-api`

- `createInvite`：创建短期邀请凭证。
- `resolveInvite`：显示邀请者的最小公开资料，不建立关系。
- `acceptInvite`：确认邀请并原子建立好友关系。
- `listFriends`：返回当前用户好友。
- `removeFriend`：删除关系并使后续好友内容访问失效。

### `memory-api`

- `listMine`、`getMineById`、`create`、`update`、`delete`。
- `setVisibility`：校验允许列表和好友关系后更新权限。
- `getSharedMemory`：逐条执行访问控制后返回详情。
- `listFriendRecentMapPoints`：返回近 24 小时授权地图点。
- `createImageUploadPlan`、`getAuthorizedImageUrls`：隔离图片路径并在授权后签发短期地址。

### `like-api`

- `toggleLike`：验证身份、关系和回忆权限后幂等切换。
- 不接收客户端传来的真实点赞数。

云函数入口统一返回可判别结果：

```ts
type CloudResult<T> =
  | { ok: true; data: T; requestId: string }
  | { ok: false; code: string; message: string; requestId: string };
```

错误信息不得暴露 OpenID、数据库查询、云路径或其他用户是否存在等敏感细节。

## 5. Repository 与页面改造

- 保留 `MemoryRepository`，新增 `CloudMemoryRepository`，不在页面散落 `wx.cloud` 调用。
- 新增 `AuthRepository`、`FriendRepository`、`LikeRepository` 的最小接口。
- 页面通过服务层取得当前会话和授权后的 ViewModel，不直接处理 OpenID、数据库文档或临时图片签名。
- `config/runtime.ts` 增加显式 `local | cloud` 模式；环境 ID 只放本机私有配置。
- CloudBase 不可用时显示可恢复错误，不得自动回退并产生两份互相冲突的数据。

## 6. 本地数据迁移

迁移必须由用户在“数据管理”中主动发起：

1. 登录并创建云端用户。
2. 读取、校验本地 Memory 和受管图片。
3. 为每条本地记录生成稳定的迁移幂等键。
4. 上传图片到 `users/<userId>/memories/<memoryId>/` 隔离路径。
5. 创建默认 `private` 的云端 Memory。
6. 回读云端文档并核对字段、坐标、图片数量和地图版本。
7. 标记迁移完成；本阶段默认继续保留本地副本。

任何记录失败都必须报告具体条数并允许重试，不能因为部分成功而清空本机数据。

## 7. 权限判定顺序

服务端读取一条好友回忆时固定执行：

1. 从可信上下文解析当前用户。
2. 查询 Memory，确认未删除且作者账号有效。
3. 作者本人直接允许。
4. `private` 拒绝。
5. 查询当前双向好友关系；不存在则拒绝。
6. `friends` 允许。
7. `selected_friends` 还需允许列表包含当前 userId。
8. 只有通过后才生成图片临时地址或允许点赞。

不得只在列表查询时判断一次，然后让详情、图片或点赞接口绕过权限。

## 8. 并发与一致性

- 接受邀请使用事务或唯一 `pairKey`，重复点击不能创建两条好友关系。
- 点赞使用唯一 `pairKey` 和事务更新 `likeCount`；事务失败时不返回乐观成功。
- 删除 Memory 时同时清理点赞文档；图片清理失败单独报告，不恢复已删除内容。
- 修改可见范围与好友删除并发时，以请求执行时查询到的当前好友关系为准。
- 好友地图分页查询，不能假定好友数量或查询 `in` 参数永远小于平台限制。

## 9. 隐私、滥用与发布门禁

- 更新公众平台隐私保护指引，明确用户资料、好友关系、照片、正文和地图比例位置的用途。
- 不索取手机号、真实姓名、学号、微信号或通讯录。
- 分享邀请需要频率限制、有效期和重复使用保护。
- 至少提供删除好友；全站公开和陌生人内容上线前必须另行设计举报、屏蔽和内容安全流程。
- 生产日志只记录 requestId、错误码和脱敏 userId，不记录正文、OpenID、完整允许列表或图片 URL。
- 云开发环境、真实 AppID、OpenID、环境 ID 和访问凭证不得提交 Git。

## 10. 自动测试与双账号测试

纯逻辑测试至少覆盖：

- 三档可见范围矩阵。
- 非好友、已删除好友和未被选中好友的拒绝。
- 邀请过期、重复接受、自邀和重复好友。
- 点赞重复提交、取消、无权限点赞和并发唯一性。
- 24 小时边界、地图版本、非法比例和分页批次。
- 本地迁移默认私密、幂等重试、图片部分失败和本地副本保留。

必须使用两个不同微信账号执行反向越权测试：

1. 非好友不能读取详情、图片或点赞。
2. 成为好友后只能看到允许范围内的回忆。
3. 部分好友列表移除后立即不可见。
4. 删除好友后详情、图片、点赞和好友地图均不可访问。
5. 将回忆改为私密后，另一账号刷新即消失。
6. 24 小时边界前后查询结果正确。

## 11. 实施里程碑

1. 规则与设计冻结。
2. CloudBase 环境与可信身份基础。
3. 本地回忆到云端私密迁移。
4. iSdu 双向好友与邀请。
5. 回忆可见范围和授权详情/图片。
6. 点赞。
7. 好友近 24 小时地图图层。
8. 双账号越权、iOS/Android 真机与发布隐私验收。

每个里程碑独立提交并等待验收。身份、权限或双账号反向测试未通过时，不得描述为可正式上线。
