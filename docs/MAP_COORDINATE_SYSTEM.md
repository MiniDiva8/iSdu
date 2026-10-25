# 地图比例坐标系统

更新日期：2026-08-13

## 1. 当前边界

本文件描述 `pages/map/index` 的二维校园地图与本地回忆选点实现。当前支持地图展示、拖动、缩放、复位、中心准星选点、比例坐标持久化、回忆星点和详情跳转。

当前不使用 GPS、经纬度、第三方地图 SDK、Canvas 大型框架、正式多校区地图或 CloudBase。保存到 Memory 的只有地图比例坐标，不保存屏幕像素和当前视图状态。

## 2. 地图资源与原始尺寸

- 文件：`miniprogram/assets/demo/campus-map-placeholder.jpg`
- 原始像素尺寸：`1448 × 1086`
- 宽高比：`4:3`
- 文件大小：490,518 字节（约 479 KiB）
- 地图与坐标版本：`campus-center-clean-illustration-2026-08-v3-rect`
- 用途：当前本地闭环和触控验证使用的校园插画候选图
- 来源状态：由用户提供给项目；正式参赛前仍需归档生成过程、源文件或明确的使用权证明

`1448 × 1086` 也是当前稳定逻辑尺寸。图片中包含校园边界外的不规则暖白留白，比例坐标以整张图片画布为参考，不以可见建筑包围盒为参考。当前配置用 `validAreaPolygon` 约束可选校园区域。后续如果裁切留白、替换宽高比或改变校园边界，必须制定坐标迁移方案，不能只覆盖图片文件。

Memory 同时保存 `mapAssetVersion`。只有与当前地图版本一致的记录才会投影到地图；旧地图记录继续保留在本地 Repository 和时光页中，避免未经校准的历史比例坐标落到新地图的错误建筑。

## 3. 画布结构与缩放机制

```text
map-frame（固定视口、准星与状态层）
└── movable-area（实际坐标视口）
    └── movable-view（带选点缓冲的透明画布，平移 + 1×–2.5× 缩放）
        ├── image（按 mapOffset 放置的校园地图）
        └── marker-layer（与 image 使用相同偏移和尺寸）
            └── memory-marker（照片圆点或发光星点）
```

- 使用微信原生 `movable-area` / `movable-view`。
- `direction="all"`，缩放范围为 `1×`–`2.5×`。
- `out-of-bounds=true`；透明画布在地图四周各加入半个视口的选点缓冲，使原图四角能够到达中央准星。原生组件允许短暂越界并以阻尼平滑收束，页面不再在 `touchend` 后用另一套缩放坐标二次拉回，避免放大浏览时出现内部“空气墙”。
- 手势结束时将平移量限制到“视口中心仍落在地图图像内”的范围，地图不会被拖到准星之外。
- 普通浏览启用惯性；中心选点时关闭惯性，避免用户点“确认位置”后地图仍继续移动。
- 准星位于 `map-frame` 内、`movable-view` 外，固定在真实 `movable-area` 中心，不随地图移动。
- 地图边界使用不占布局尺寸的阴影描边，避免边框造成准星与实际视口中心相差 1—2 像素。

页面只在拖动和缩放事件中更新模块内的最新 `{x, y, scale}`。拖动时不调用 `setData`；缩放只在进入最小、普通、最大区间时更新提示。

## 4. 显示尺寸

视口宽度为窗口宽度减去页面左右各 `24rpx` 的间距。视口高度约为窗口高度的 58%，并限制在 `240px`–`520px`。

地图未缩放显示尺寸使用 cover 规则：

```text
coverScale = max(
  viewportWidth / originalMapWidth,
  viewportHeight / originalMapHeight
)

mapRenderWidth  = originalMapWidth  × coverScale
mapRenderHeight = originalMapHeight × coverScale
```

透明画布尺寸与地图偏移：

```text
mapOffsetX = viewportWidth / 2
mapOffsetY = viewportHeight / 2

canvasWidth  = mapRenderWidth  + viewportWidth
canvasHeight = mapRenderHeight + viewportHeight

defaultX = (viewportWidth  - canvasWidth)  / 2
defaultY = (viewportHeight - canvasHeight) / 2
```

`image` 使用 `scaleToFill`，但当前原图和渲染矩形始终保持同一 `4:3` 比例，因此不会拉伸。若未来代码允许不等比显示，比例标记会发生视觉漂移，必须阻止。

## 5. 比例坐标定义

Memory 保存：

```ts
mapXRatio: number;
mapYRatio: number;
```

- 原点：完整地图图片左上角。
- `mapXRatio=0` 是最左侧，`mapXRatio=1` 是最右侧。
- `mapYRatio=0` 是最上侧，`mapYRatio=1` 是最下侧。
- 合法范围：闭区间 `[0, 1]`。
- 当前保存精度：通过页面路由传递时保留 6 位小数。
- 平移、缩放、视口尺寸、导航栏高度和安全区不进入 Memory。

比例转未缩放地图显示坐标：

```text
mapX = clamp(mapXRatio, 0, 1) × mapRenderWidth
mapY = clamp(mapYRatio, 0, 1) × mapRenderHeight
```

未缩放地图显示坐标转比例：

```text
mapXRatio = clamp(mapX / mapRenderWidth, 0, 1)
mapYRatio = clamp(mapY / mapRenderHeight, 0, 1)
```

实现集中在 `miniprogram/utils/map-coordinates.ts`，页面事件中不另写换算公式。

## 6. 中心准星反算

坐标 v3 不再依赖 `bindchange` / `bindscale` 返回的理论 `x、y、scale` 推导准星位置。不同真机 WebView 内核对 `movable-view` 的缩放边界和缩放原点处理可能存在差异，理论变换会把小误差放大为明显的标记漂移。

用户确认位置时，页面通过 `SelectorQuery.boundingClientRect()` 同时读取：

- `map-viewport` 的真实屏幕矩形；
- `map-image` 经平移和缩放后的真实屏幕矩形。

设视口矩形为 `(Vx, Vy, Vw, Vh)`，地图图片矩形为 `(Mx, My, Mw, Mh)`：

```text
crosshairX = Vx + Vw / 2
crosshairY = Vy + Vh / 2

mapXRatio = (crosshairX - Mx) / Mw
mapYRatio = (crosshairY - My) / Mh
```

两个矩形都使用相同的屏幕坐标系，系统状态栏、导航栏、安全区、页面间距、平移、缩放和缩放原点均已包含在实际矩形中，不需要再次推导或补偿。

确认前先检查准星是否位于地图图片矩形和 `validAreaPolygon` 内。若越界或节点测量失败，页面要求用户重试，不静默 clamp 到边缘。

## 7. 标记锚点与点击区域

- 当前坐标锚点是照片圆点或发光星点的几何中心。
- 元素使用 `translate(-50%, -50%)`，所以 `(mapX,mapY)` 穿过标记中心。
- 点击盒约为 `60rpx × 60rpx`，可见内容约 `48rpx × 48rpx`。
- 有照片时优先显示第一张照片；照片丢失时降级为分类色星点。
- 无照片时显示统一发光星点。
- 分类颜色分别表示校园生活、朋友相遇、学习成长和运动自然。
- 标记使用 `catchtap`，不会把点击继续传给地图。

## 8. 缩放后标记不漂移的原因

地图图片、标记层和所有标记位于同一个 `movable-view`。原生组件对它们应用完全相同的平移和缩放，所以星点与图片地点保持绑定。

页面不会在每个缩放事件中重建标记，也不会保存缩放后的屏幕像素。只有以下情况从比例重新计算标记：

1. 首次按窗口尺寸计算地图显示大小；
2. Repository 读取到新建、编辑或删除后的 Memory；
3. 窗口尺寸变化并重新执行 cover 布局。

## 9. 不同屏幕与安全区

- `onLoad` 使用当前窗口尺寸计算视口。
- `onResize` 重新计算 cover 尺寸、标记像素和默认视图，并取消正在进行的选点，避免在几何变化中保存错误坐标。
- 比例参考地图自身，不包含原生导航栏、状态栏、TabBar 或底部安全区。
- 准星和换算都使用 `movable-area` 内部局部坐标，所以不需要扣除页面顶部偏移。
- 底部安全区只影响页面 padding。

同一 Memory 在不同设备上可能因为 cover 裁切暂时位于视口外侧，但拖动地图后仍落在同一图片地点。

## 10. 状态与错误处理

- 地图图片加载前显示加载覆盖层。
- 图片加载失败显示错误和重试入口，不白屏。
- Repository 读取失败显示错误横幅和重试入口。
- 空数据仍允许拖动和选点，不用空状态遮住地图。
- 非法比例记录被过滤并显示数量。
- 最小/最大缩放显示边界提示。
- 复位恢复默认 `x`、`y`、`scale=1` 并关闭当前卡片。
- 选点确认期间使用导航锁，避免连续点击打开多个编辑页。

## 11. 自动测试

坐标测试覆盖：

- 比例 `0/0`、`1/1`、`0.5/0.5`；
- 越界 clamp 与非法值；
- 比例—坐标往返；
- 多种地图尺寸与 cover 布局；
- `1×` 与 `2×` 中心准星；
- 平移和缩放组合；
- 正向—逆向变换往返；
- 零、负数、`NaN`、无穷 scale；
- 非有限平移；
- 准星反算到地图外时拒绝保存。

这些测试验证数学模型，但不能替代微信开发者工具和真机对 `movable-view` 事件语义的校准。

## 12. 已知限制与后续演进

- 星点当前随地图一起放大，视觉尺寸不是苹果照片地图式的恒定屏幕尺寸。
- 标记聚合尚未实现；记忆数量增加后，重叠标记会相互遮挡。
- 选点使用地图中心准星，不支持直接点击或长按创建，避免与拖动手势冲突。
- 当前只保存单校区单图比例；图片裁切或更换必须迁移坐标。
- 地图中较大的边界外留白会压缩校园主体的有效比例范围，正式素材应在冻结坐标前优化。
- 原生边界、缩放中心、惯性关闭效果、图片解码和触控帧率仍需真机验证。

后续若支持用户重新选点，应复用同一中心准星流程并把新比例交给编辑页；若支持聚合，应在视口坐标层按缩放级别分桶，不能修改 Memory 中的原始比例坐标。
