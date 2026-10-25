# CloudBase 可信身份人工配置

更新日期：2026-08-15

本文只用于第二阶段“CloudBase 环境与可信身份基础”验收。当前代码默认保持本地模式，不会自行创建云资源、上传本地日记或读取好友数据。

不要在聊天、截图、Issue 或 Git 中发送真实 AppID、环境 ID、OpenID、密钥、二维码登录信息或其他私人配置。

## 1. 当前实现会做什么

- 小程序端只调用 `auth-api`，不接收或保存 OpenID。
- 云函数通过 `cloud.getWXContext()` 取得不可由业务参数伪造的 APPID 与 OPENID。
- 服务端把二者组合后计算 SHA-256 `identityHash`，数据库不保存原始 OpenID。
- 客户端只得到随机 `usr_` 用户 ID、自己主动填写的资料和请求编号。
- `users` 集合禁止小程序端直接读写，只允许云函数或控制台访问。

官方依据：

- [微信小程序调用 CloudBase 云函数](https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram)
- [CloudBase 数据库安全规则](https://docs.cloudbase.net/database/security-rules)
- [CloudBase 数据库索引管理](https://docs.cloudbase.net/database/data-index)

## 2. 准备真实小程序项目

1. 使用小程序管理员微信登录微信开发者工具。
2. 导入本仓库根目录，也就是同时包含 `project.config.json`、`miniprogram/` 和 `cloudfunctions/` 的目录；不要只选择 `miniprogram/`。
3. 在本机的项目设置中填写真实 AppID。真实值只能保存在已忽略的 `project.private.config.json` 或微信开发者工具本机配置中。
4. 确认 `project.config.json` 已识别：
   - 小程序目录：`miniprogram/`
   - 云函数目录：`cloudfunctions/`
5. 不要把真实 AppID 改进公共 `project.config.json`。

## 3. 创建并关联 CloudBase 环境

1. 点击微信开发者工具顶部“云开发”。
2. 按界面提示开通环境，先使用开发/测试环境；创建前阅读当前套餐、免费额度和计费提示。
3. 在 CloudBase 控制台进入“环境配置 → 安全配置 → 小程序关联”，确认当前小程序 AppID 已关联到该环境。
4. 本阶段只使用一个关联环境，并在微信开发者工具中把它选为当前环境。
5. 项目代码故意不提交环境 ID，`wx.cloud.init()` 使用当前关联的默认环境。如果账号下同时存在多个可用环境，先停止，不要靠猜测部署；后续应增加本机私有环境选择方案。

## 4. 创建 `users` 集合

1. 在“云开发 → 数据库”创建集合，名称必须是 `users`。
2. 打开集合的“权限管理”，切换为安全规则。
3. 设置为仅管理员可读写：

   ```json
   {
     "read": false,
     "write": false
   }
   ```

4. 保存规则并等待生效。这个规则会拒绝小程序端直接访问，但云函数服务端仍能操作。
5. 打开“索引管理”，创建单字段索引：
   - 索引名：`identityHash_unique`
   - 字段：`identityHash`
   - 排序：升序
   - 属性：唯一
6. 唯一索引必须在首次多人测试前建立；否则并发启动可能生成重复用户。

## 5. 部署 `auth-api`

1. 在微信开发者工具左侧找到带云朵图标的 `cloudfunctions/auth-api`。
2. 右键该目录，选择“上传并部署：云端安装依赖”。
3. 确认部署目标是刚才关联的测试环境。
4. 等待部署完成，在云函数列表确认存在 `auth-api`。
5. 依赖必须显示为精确版本 `wx-server-sdk@4.0.2`；不要改成 `latest`。
6. 不需要配置 SecretId、SecretKey、API Key 或自建 Token。

## 6. 临时启用本机身份测试

当前公开配置故意保持：

```ts
mode: 'local';
cloudEnabled: false;
cloudTraceUser: false;
```

完成上述环境配置后，可在本地暂时把 `miniprogram/config/runtime.ts` 的 `cloudEnabled` 改为 `true` 并重新编译。不要填写环境 ID，也不要提交这项本机测试改动。

`cloudTraceUser` 继续保持 `false`。正式产品以后只有在用户已阅读并同意隐私说明后，才允许决定是否开启访问追踪。

## 7. 调用冒烟测试

在微信开发者工具调试控制台依次执行：

```js
wx.cloud.callFunction({
  name: 'auth-api',
  data: { action: 'bootstrap', payload: { OPENID: 'fake-client-value' } },
});
```

预期结果：

- `result.ok` 为 `true`；
- 返回一个 `usr_` 开头的随机 `userId`；
- 第一次 `isNew` 为 `true`，再次执行为 `false`；
- 结果中不包含 OpenID、APPID 或 `identityHash`；
- 即使 payload 填了伪造 OPENID，也不会改变实际用户。

继续测试更新资料：

```js
wx.cloud.callFunction({
  name: 'auth-api',
  data: {
    action: 'updateMyProfile',
    payload: { displayName: '测试昵称', signature: '身份里程碑测试' },
  },
});
```

然后执行：

```js
wx.cloud.callFunction({ name: 'auth-api', data: { action: 'getMyProfile' } });
```

预期能读回规范化后的资料。数据库中应只有当前测试账号的一条用户记录。

## 8. 双账号最小身份测试

1. 使用测试账号 A 调用 `bootstrap`，记录返回的 `usr_` ID，不记录 OpenID。
2. 使用测试账号 B 进行真机预览并调用 `bootstrap`。
3. A 与 B 应得到两个不同的 `usr_` ID，`users` 集合应有两条记录。
4. A 修改资料后，B 的 `getMyProfile` 只能读取 B 自己的资料。
5. 客户端无法直接读取 `users` 集合；直接查询应得到权限拒绝。

当前没有好友页面或登录 UI，所以这一步是开发者工具验收，不是正式用户体验验收。

## 9. 常见错误

| 现象                        | 检查方法                                                                   |
| --------------------------- | -------------------------------------------------------------------------- |
| 提示非法环境                | 检查真实 AppID 是否关联当前 CloudBase 环境，微信开发者工具是否选中正确环境 |
| `wx.cloud` 不存在           | 检查基础库与真实小程序项目，不能用游客 AppID测试真实云环境                 |
| 找不到 `auth-api`           | 检查 `cloudfunctionRoot`、函数名和是否已经上传部署                         |
| 集合不存在                  | 创建名称完全一致的 `users` 集合                                            |
| 数据库权限拒绝              | 云函数应能访问；如果是客户端直接查询，被拒绝正是预期结果                   |
| 每次都创建新用户            | 检查 `identityHash` 唯一索引、部署环境是否一致以及数据库是否被手工清空     |
| 返回 `AUTH_CONTEXT_MISSING` | 检查函数是否由真实微信小程序调用、是否使用当前 `wx-server-sdk` 初始化      |

## 10. 本里程碑通过标准

- 单账号重复调用得到同一 `usr_` 用户；
- 两个微信账号得到不同用户；
- 客户端无法伪造身份；
- 返回值和日志不出现 OpenID、APPID、identityHash、正文或图片地址；
- 小程序端直接读写 `users` 被拒绝；
- 未上传任何本地日记或照片；
- 未实现好友、点赞、权限或好友地图。
