# iSdu Social V2 CloudBase 安全部署清单

更新日期：2026-08-15

本清单是 Social V2 的统一部署依据。真实 AppID、环境 ID、OpenID、密钥、测试账号与二维码只保存在微信开发者工具或 CloudBase 控制台，不写入 Git、截图或聊天。

当前代码默认仍从本地模式启动。用户只有主动阅读说明并执行“开启云端并备份本机回忆”后，才会创建 iSdu 云端身份和迁移数据。

## 1. 第一个人工暂停点：创建测试环境

1. 使用真实小程序 AppID 导入仓库根目录，不要只导入 `miniprogram/`。
2. 在微信开发者工具中开通一个专用测试 CloudBase 环境，并确认它关联当前 AppID。
3. 不要把环境 ID 写进 `miniprogram/config/runtime.ts`。代码使用当前工具选中的环境。
4. 首次只配置测试环境，不直接操作生产环境。

## 2. 集合与客户端权限

创建以下 8 个集合：

- `users`
- `memories`
- `memory_migrations`
- `image_upload_plans`
- `friend_requests`
- `friendships`
- `invite_tokens`
- `likes`

每个集合都选择“仅管理端可读写”，或设置等价的自定义规则：

```json
{
  "read": false,
  "write": false
}
```

预期结果：小程序页面直接调用数据库会收到权限拒绝；`auth-api`、`memory-api` 和 `friend-api` 使用服务端 SDK 后仍能访问。

## 3. 必须建立的唯一索引

| 集合                | 字段           | 属性       |
| ------------------- | -------------- | ---------- |
| `users`             | `identityHash` | 唯一、升序 |
| `memory_migrations` | `migrationKey` | 唯一、升序 |
| `friendships`       | `pairKey`      | 唯一、升序 |
| `invite_tokens`     | `tokenHash`    | 唯一、升序 |
| `likes`             | `pairKey`      | 唯一、升序 |

在导入测试数据前先创建唯一索引。CloudBase 会把缺失字段视为 `null`；不要先批量写入缺少这些字段的占位文档。

## 4. 建议的查询索引

根据控制台实际报出的索引建议建立以下普通或组合索引：

- `memories`: `ownerUserId + deletedAt + recordedAt(desc)`
- `memories`: `ownerUserId + deletedAt + publishedAt(desc)`
- `memories`: `ownerUserId + clientRequestId`
- `image_upload_plans`: `ownerUserId + expiresAt + usedAt`
- `friendships`: `userAId + status`
- `friendships`: `userBId + status`
- `friend_requests`: `requesterUserId + createdAt(desc)`
- `friend_requests`: `receiverUserId + createdAt(desc)`
- `invite_tokens`: `creatorUserId + createdAt(desc)`
- `invite_tokens`: `expiresAt + usedAt`
- `likes`: `memoryId + userId`
- `likes`: `ownerUserId + userId`

若控制台提示组合索引字段顺序不同，以实际查询条件和 CloudBase 索引建议为准；不要为了消除提示把集合改成公开读取。

## 5. 云存储规则

进入“云存储 → 权限设置 → 自定义安全规则”。Social V2 不能使用公开读。客户端只负责把上传计划指定的本机图片上传为创建者文件；数据库绑定与任何读取都由云函数再次校验。

传统文档型环境建议规则：

```json
{
  "read": false,
  "write": "auth != null && (resource.openid == auth.openid || resource.openid == auth.uid)"
}
```

保存后等待规则生效，并验证：

1. 当前账号可以执行 `wx.cloud.uploadFile`；
2. 其他账号不能直接读取 fileID；
3. 只有 `memory-api` 鉴权通过后才会签发短期地址；
4. 短期地址不写入数据库、不写入长期 Storage、不打印到日志。

如果环境是 CloudBase PG 模式，不要直接复制上述传统规则，应按控制台的 RLS 配置实现相同策略。

## 6. 云函数调用权限

在“云函数 → 权限控制”中仅允许已登录且非匿名的微信上下文调用三个业务函数：

```json
{
  "*": { "invoke": false },
  "auth-api": { "invoke": "auth != null && auth.loginType != 'ANONYMOUS'" },
  "memory-api": { "invoke": "auth != null && auth.loginType != 'ANONYMOUS'" },
  "friend-api": { "invoke": "auth != null && auth.loginType != 'ANONYMOUS'" }
}
```

客户端传入的 OpenID、ownerUserId 或 userId 均不作为身份依据。三个函数只使用 `cloud.getWXContext()` 的 APPID 与 OPENID 识别当前调用者。

## 7. 部署顺序

依次右键以下目录，选择“上传并部署：云端安装依赖”：

1. `cloudfunctions/auth-api`
2. `cloudfunctions/memory-api`
3. `cloudfunctions/friend-api`

三个目录的 `wx-server-sdk` 均锁定为 `4.0.2`。部署前在仓库根目录执行：

```powershell
npm.cmd ci
npm.cmd run check
```

部署后先用开发者工具完成空账号 `bootstrap`，再迁移一条纯文字回忆，最后测试邀请和点赞。不要一开始迁移全部真实数据。

## 8. 频率限制与日志

- 邀请：单个用户 10 分钟最多创建 5 个；邀请 24 小时失效且只能使用一次。
- 图片上传计划：单个用户 10 分钟最多创建 20 个，每个计划 10 分钟失效。
- 点赞变更：单个用户每分钟最多 60 次。
- 点赞以 `memoryId + userId` 唯一，事务内重新检查好友关系和回忆权限。

日志只允许记录 requestId、公开错误码与脱敏用户标识。不得记录 OpenID、identityHash、正文、地点全文、好友允许列表、fileID 或临时图片地址。

## 9. 云端账号删除

“时光 → 数据管理 → 删除全部云端数据”要求二次确认，服务端只删除可信当前账号的数据，包括云回忆与图片、点赞、好友关系、邀请、迁移记录、上传计划和云端资料。

本机备份不会自动删除。若数据库已删除但云存储清理失败，页面只返回遗留文件数量，不返回路径；运营者需在控制台按 requestId 排查并清理。

## 10. 官方依据

- [微信小程序调用 CloudBase 云函数](https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram)
- [CloudBase 云存储安全规则](https://docs.cloudbase.net/storage/security-rules)
- [CloudBase 索引管理](https://docs.cloudbase.net/database/data-index)
- [CloudBase 云函数安全规则](https://docs.cloudbase.net/cloud-function/security-rules)

真实测试环境尚未创建和部署前，只能标记为“代码与自动测试完成，真实社交安全待验收”。
