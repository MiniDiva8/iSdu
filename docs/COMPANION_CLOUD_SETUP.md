# 伙伴云服务当前交付状态（2026-10-30 整理）

根据 2026-10-29 的部署交付证据，`companion-api` 已首次部署，两张集合均为 ADMINONLY，两个索引及无身份拒绝检查已核验。真实内容检测与手机双账号验收仍待完成；本次 GitHub 整理未重新登录云平台核验。详见 [反馈修复与部署交付](FEEDBACK_FIX_20261029.md) 和 [当前整合状态](CURRENT_LOCAL_INTEGRATION.md)。

下面的“未部署”“部署前执行”描述框架和早期接入阶段，保留作契约与历史参考；不能据此认定伙伴服务仍未部署，也不应重复创建已存在的集合。客户端最新交付记录见 [rc10](EXPERIENCE_RELEASE_3_2_RC10.md)。

---

> 3.2.0-rc.3 已向客户端和本函数源码白名单追加12个第二批家具ID，老ID不变；companion-api仍未部署，客户端新版本不代表云端同步升级。详见 COMPANION_DECOR_EXPANSION.md。

# 伙伴小屋云端接入（框架阶段）

本轮仅新增源码、离线自动化测试与接入说明；没有创建真实集合、上传云函数、调用真实内容检测或读写真实用户数据。
本机养成、余额、奖励、生日、偏好、日记不在本云接口中同步。正式角色和山大家具已在 3.2.0-rc.2 接入，沿用原稳定 ID，云端白名单无需变更。云函数仍未部署。

## 2026-10-26 本地优化后的开通入口

当前未部署记录与具体步骤见 [加载与云服务说明](LOAD_REWARDS_CLOUD_FIX_20261026.md)。本轮只修改提示与本地实现，没有真实部署；同时核对 PROJECT_STATE.json 的 backend 和发布证据。

## 客户端契约

从 `miniprogram/services/repository/cloud-companion-repository.ts` 导入单例 `cloudCompanionRepository`。
云函数名固定为 `companion-api`；所有请求为 `{action,payload}`。
响应为 `{ok:true,data,requestId}`，失败为 `{ok:false,code,message,requestId}`。

| 方法                                                | 返回                                        |
| --------------------------------------------------- | ------------------------------------------- |
| `getMine()`                                         | `{home:PublishedHome\|null,userId:string}`  |
| `publishHome(snapshot,visibility,expectedRevision)` | `PublishedHome`                             |
| `getHome(targetUserId)`                             | `PublishedHome`                             |
| `visitHome(targetUserId,requestId,message?)`        | `{visited:true,duplicate:boolean}`          |
| `listVisits()`                                      | `{visits:GuestVisit[],visitorCount:number}` |
| `deleteVisit(id)`                                   | `void`                                      |
| `deleteMyData()`                                    | `void`                                      |

`PublishedHome = {snapshot,visibility:'private'|'friends',revision,updatedAt,owner:{userId,displayName}}`。
`GuestVisit = {id,visitor:{userId,displayName},message,visitedAt}`。时间为服务端 UTC ISO 字符串。
所有对外用户 ID 均为现有 `users._id`，不得使用 OpenID 或身份摘要。

`HomeSnapshot = {name,skinId,accessoryId,theme,placements:[{id,itemId,x,y,rotation}]}`：

- 名字须非空，最多 16 个 Unicode 码点；留言最多 80 个码点，前后空白会被去除。
- 家具最多 40 件；实例 ID 不重复，使用 1–64 位字母、数字、下划线或连字符。
- `x,y` 为有限数，范围为 0–1；`rotation` 为 0、90、180、270。
- 皮肤：`sprout,sunshine,sky,peach,lavender,cocoa,mint,night`。
- 装饰：`none,scarf,hat,book,headphones,flower`。
- 场景：`meadow,dusk,blossom`。
- 家具：`bench,tree,desk,bookshelf,lamp,flowers,picnic,pond,cushion,bicycle,lantern,sign`。
- rc.3 追加家具：`shanhai_collectible_chest,sdu_red_graduation_rack,dacheng_eight_relief_platform,dacheng_cong_garden_lantern,grove_memory_swing,doctoral_cat_bookends,campus_postmark_workbench,three_cities_travel_sign,three_cities_souvenir_cabinet,majia_twin_dome_model,majia_stargazing_telescope,starmap_observation_table`。合计24个稳定ID（含2个旧收藏），部署须使用当前白名单。

替换最终目录时，同步修改本机目录/素材适配器、`models/companion-cloud.ts` 和云函数 `lib/companion-handler.js` 的白名单并回归测试。
只替换图片、锚点和尺寸时保持已有 ID，可保留存档与已发布快照。新增或重命名 ID 必须先安排兼容或迁移，再更新云端。
不允许通过放宽未知字段校验来兼容新素材。

Repository 对输出构造白名单副本，丢弃额外字段；发送快照也只保留公开字段。
服务端拒绝发布请求和快照中的额外字段，读取历史数据时重新按白名单构造快照。
不得把本机完整状态直接传给云函数。

## 接入顺序与冲突处理

1. 用户主动开启云身份并选择发布后，先调用 `getMine()` 获取自身不透明 ID 和当前版本。
2. 未发布时使用 `expectedRevision=0`；已有家园使用读取到的 `revision`。每次发布只增加一个版本。
3. 默认使用 `private`；只有用户主动选择时才发布为 `friends`。
4. 关闭来访时使用 `getMine().home.snapshot` 和对应版本改为 `private`。快照完全相同且已有成功审核标记时，关闭不依赖内容检测服务；修改快照、新建私有家园或重新开放好友均继续审核。
5. `REVISION_CONFLICT` 必须显示并重新读取。保留本机布置，禁止悄悄覆盖云端其他版本。
6. 打开好友页面和再次进入前台时调用 `getHome` 复核权限。访客视图只读。
7. 生成独立的随机或足够唯一来访请求 ID（1–100 位字母、数字、下划线或连字符），同一次发送的网络重试复用它；用户新发一条留言才生成新 ID。
8. 云端失败应保留本机存档与待发送文字；页面只能在实际收到成功响应后显示“已发布”“已发送”或“已删除”。

`HOME_UNAVAILABLE` 统一覆盖不存在、未开放、非好友、好友撤销或目标账号不可用，不区分私密状态。
`CONTENT_REJECTED` 表示文字未通过；`MODERATION_UNAVAILABLE` 表示检测失败或返回未知结果，均不写入。
其余常见码为 `PROFILE_REQUIRED`、`UNAUTHENTICATED`、`RATE_LIMITED`、`REQUEST_CONFLICT`、
`DATA_DELETION_IN_PROGRESS`。Repository 的 `INVALID_RESPONSE` 不得被当作成功；网络错误继续抛给调用页面。

## 集合、规则与索引（部署前人工执行）

建立 `companion_homes`、`companion_visits`，两个集合均拒绝全部客户端直接读写。
分别在两个集合安全规则中设置：

```json
{
  "read": false,
  "write": false
}
```

仅云函数的管理员 SDK 访问这些集合；不要为调试改为公开读写。
继续保留现有 `users.identityHash` 与 `friendships.pairKey` 唯一索引和既有集合规则。

建议普通索引：

| 集合               | 字段与顺序                | 用途                                 |
| ------------------ | ------------------------- | ------------------------------------ |
| `companion_visits` | `ownerUserId ASC,_id ASC` | 主人列表的完整游标扫描、接收记录删除 |
| `companion_visits` | `visitorUserId ASC`       | 作者全量清理                         |

家园使用规范 `home_ + sha256(userId)` 作为文档 ID，访问日和请求收据也使用规范散列 ID。
无需另加一个随机家园 ID；主键和事务保证并发首次发布不会出现第二份家园。
运行环境若给出组合索引建议，应按实际查询建立索引，不得放宽权限。

`companion_visits` 内部包含 `day`（每日计数）、`entry`（可展示来访/留言）、
`receipt`（请求幂等）三类文档；它们均有主人和作者 ID，不直接返回内部文档。
未发布家园的访客可能有一个私有的版本 0 家园锚点，它只用于删除互斥，`getMine().home` 仍为 `null`。

## 权限、事务与去重语义

服务端只从 `cloud.getWXContext()` 读取 APPID/OPENID，
计算 `sha256(APPID+'\0'+OPENID)` 查找现有 active 用户，且在事务中重新检查该用户。
客户端伪造主人、作者、OpenID、余额或日记字段会被拒绝。
访问别人时还须检查目标账号 active、家园为 `friends`，并验证当前 active 双向关系及其双方 ID。

CloudBase 事务只使用 `doc`，事务外先查找好友关系文档 ID，事务内再按主键读回验证。
内容检测在事务外进行，检测成功后的写事务会重新检查身份、目标可见范围和关系。
访客写事务给同一好友关系写入内部 `companionWriteFence`，给目标家园和自己的家园锚点写入内部 `writeFence`。
这使关系撤销、发布/关闭家园、开始清除与来访写入在相同文档上发生冲突，避免仅仅读快照产生写偏差。
这些内部字段不返回客户端；它们不改变好友 API 的公开结构。

- 每个主人＋访客＋北京时间自然日仅算一个来访日；`visitorCount` 是当前关系下这些来访日的累计数量，并非留言条数。
- 新的一天重新计数，服务端时钟决定日期，不使用客户端日期。
- 同一天多次空留言访问返回 `duplicate:true`，不新增展示项。
- 非空留言每个访客每天最多 3 条；三条共用一个来访日计数。
- 同一请求 ID 的重试返回 `duplicate:true`；跨午夜重试也不会新增计数。
- 同一请求 ID 改写文字返回 `REQUEST_CONFLICT`。
- 每次重试仍校验当前权限。已撤销好友或已关闭来访不能靠旧请求绕过。
- 列表只展示当前 active 好友、且匹配当前 `relationshipId` 的记录；删好友后重加也不会重新公开旧关系的留言。
- `deleteVisit` 只删除展示项，主人或作者都可删除，移除好友后仍可删除。计数和重试收据保留，防止通过删除绕过每日限制。
- 对未知或无权删除的 ID 返回相同确认，不暴露某个留言是否存在。

列表按每批 50 条扫描，删除按每批 40 条处理，不把数据库默认页长当作完整结果。
每次删除事务低于 100 个操作。列表或清理遇到平台超时/错误会失败，不能把部分结果报告为完整成功。

依据：[CloudBase 事务说明](https://docs.cloudbase.net/database/transaction)，包含只支持 doc、快照隔离、锁冲突与事务操作限制。

## 内容安全配置

`config.json` 已声明：

```json
{
  "permissions": {
    "openapi": ["security.msgSecCheck"]
  }
}
```

新名字、公开发布和非空留言使用 `cloud.openapi.security.msgSecCheck({content,openid,version:2,scene})`，
其中 openid 来自可信上下文；名字场景为 1，留言场景为 2。
仅 `result.suggest === 'pass'` 才允许写入；`review/risky` 拒绝，异常/未知结果关闭写入。
已成功受理的同一留言请求重试无需再次检测，但仍重新验权。
原样关闭已有家园只收紧可见范围：事务内比较完整白名单快照、内部 `moderatedNameHash` 和预期版本，相符才直接改为私有；不会引入新文字或放宽公开发布。

若今后获准部署，使用对应小程序的云环境与服务端依赖安装；当前 SDK 固定为 `wx-server-sdk@4.0.2`。
确保内容安全接口已开通，保存 config 权限；权限更新可能有约 10 分钟缓存。
权限缺失时应修正配置，禁止在代码中跳过审核。

依据：[CloudBase 云调用权限错误说明](https://docs.cloudbase.net/faq/knowledge/cloud-call-604101-permission-error)。
不得在日志中输出文字全文、APPID、OPENID、identityHash 或内部 SDK 错误对象。

## 完整删除与中断恢复

账户删除入口必须在删除现有 users 身份前 `await cloudCompanionRepository.deleteMyData()`，
成功后才继续原有云账户删除；失败应停止并提供重试，不能把身份先删掉导致无法继续授权清理。

清理先将本人家园改为私有删除标记，阻止新的发布、收到来访及本人写出的来访。
随后循环删除所有 `ownerUserId` 或 `visitorUserId` 为本人的展示项、日计数与请求收据，直至两个查询都为空，
最后删除本人家园/锚点。其他用户的家园不删除。
中断会保留删除标记；再次调用可继续，只有所有批次完成才确认成功。
`getMine` 在删除期间返回 `home:null`；发布返回 `DATA_DELETION_IN_PROGRESS`。

本接口只清除伙伴云资料，不替代既有账户、日记、图片删除服务，也不删除本机养成键。
本机数据管理入口仍须独立清理 `isdu:companion:v1` 并遵循其存储失败处理。

## 本轮证据与后续人工验收

离线测试使用注入的数据库事务模拟器和内容检测替身，未调用真实云端。
运行：

```powershell
node --test cloudfunctions/companion-api/lib/companion-handler.test.cjs cloudfunctions/companion-api/lib/cloud-companion-store.test.cjs
node --experimental-strip-types --import ./scripts/register-typescript-imports.mjs --test miniprogram/services/repository/cloud-companion-repository.test.mjs
```

专项日志位于忽略目录 `.verification/companion-20261026/cloud-*.log`。
覆盖可信身份、输出白名单、好友/可见范围撤销、版本冲突、请求重试、跨北京时间零点、
并发留言限额、审核失败关闭写入、审核故障时仍可原样关闭家园、SDK 错误回滚、超过一页的读取、超过一批的完整清理和删除中断恢复。

后续仅在明确获准部署后，以两个真实测试账号验证规则拒绝直接读写、内容安全权限、
发布/关闭/删好友即时失权、并发重试和清除数据。离线事务模拟器不证明真实环境的锁冲突或权限配置已通过。
