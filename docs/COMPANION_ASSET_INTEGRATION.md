> 当前追加版本3.2.0-rc.3已导入第二批12件装饰并完成分包；本页rc.2内容与预览是上一轮记录。最新状态见 [装饰扩展记录](COMPANION_DECOR_EXPANSION.md)。

# 伙伴素材接入约定

2026-10-26 已接入用户提供的正式校园美术，源码 3.2.0-rc.2。8 位角色、4 张途途静态姿态、10 件山大家具、空房背景和 2 张搭配参考均来自用户交接包。
完整清单和 SHA256 见 `COMPANION_ART_MANIFEST.json`；逐项稳定 ID 映射见 `miniprogram/data/companion-catalog.ts`。现有 v1 存档不迁移、不重置。

原始 ZIP 留在用户输出目录，不将约 43 MB 原始交付、设计文档或私有配置收进源码。运行资源由 `python scripts/prepare-companion-assets.py <ZIP路径>` 构建，PNG 为 384×384 调色板透明图；空房间为 1000×750 JPEG，搭配图为 768×576 JPEG，合计 714322 字节。

途途动作经 `poseSources` 接入，分别为 happy/recording/resting/gift 单张姿态；平滑移动按时间差驱动，尚无连续行走帧。配饰和两件旧家具以代码矢量绘制，SVG 仅用于预览，Canvas 不依赖 SVG 解码。

地毯/旧池塘/旧坐垫先画，墙牌随后，家具和伙伴按落点排序；命中使用完全相反的绘制顺序。两张含角色的构图图仅作搭配灵感，不作为实时底图。

## 接入位置

| 内容                      | 位置                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| 素材文件                  | miniprogram/assets/companion/                                                                  |
| 图片、帧、尺寸与锚点      | miniprogram/data/companion-assets.ts                                                           |
| 名字、价格、目录与稳定 ID | miniprogram/data/companion-catalog.ts                                                          |
| 本机动作及奖励规则        | miniprogram/utils/companion-engine.ts                                                          |
| 云端可展示目录            | miniprogram/models/companion-cloud.ts 与 cloudfunctions/companion-api/lib/companion-handler.js |

替换形象时保留目录 ID，存档、仓库和场景只保存 ID，不保存素材路径。
例如 sprout 可以对应用户最终设计的基础宠物，无需把最终图片命名为 sprout。
新增目录项要同步客户端及服务端白名单；删除已有 ID 前需先做存档映射，不直接丢弃用户收藏。

## 静态图

建议提供透明背景 PNG，主体不要裁切，保留少量透明边距。
运行素材建议使用适合手机的分辨率，高分辨率设计源文件另外保留，接入时再核对包体。

只需在 COMPANION_ASSET_OVERRIDES 中添加对应 ID 的配置。例如：

```ts
skin: {
  sprout: {
    src: '/assets/companion/base-pet.png',
    width: 100,
    height: 110,
    anchorX: 0.5,
    anchorY: 0.82,
  },
}
```

width / height 是场景内显示尺寸，以 800×1100 的逻辑小院为坐标单位，
并非文件像素尺寸。anchorX / anchorY 是相对图像 0..1 的落点；
角色通常以脚下为落点，家具以接地位置为落点。

## 帧动画

可使用单张规则网格精灵图。frameWidth / frameHeight 为单帧像素大小，
columns / rows 为整图列数和行数，fps 为播放速度。
idle、walk、interact 分别映射到待机、行走、互动的行与帧数。

```ts
sprout: {
  src: '/assets/companion/pet-sheet.png',
  previewSrc: '/assets/companion/pet-preview.png',
  frameWidth: 256,
  frameHeight: 256,
  columns: 4,
  rows: 3,
  fps: 8,
  states: {
    idle: { row: 0, frames: 2 },
    walk: { row: 1, frames: 4 },
    interact: { row: 2, frames: 4 },
  },
}
```

previewSrc 可省略；省略时，仓库、资料卡和日记入口会裁切待机首帧，
不会把整张精灵图当头像。场景以时间差控制行走速度，图片帧率不改变移动速度。
目前左右方向采用镜像；未来若提供多方向连续帧，可继续沿用此接口扩展。

## 家具与装饰

家具支持比例坐标、旋转、移动、收回及数量库存。调整显示尺寸与锚点即可接入不对称家具，
点击检测会逆旋转到素材局部坐标。装饰使用 accessory 目录，叠加在角色头部附近；
最终装饰的具体佩戴部位可按设计在绘制适配层进一步映射。

素材未配置、未读到或 Canvas 不可用时，框架保留占位与家具列表操作。
本轮已经验证实际图片、多尺寸布局、旋转/重叠命中和原生导出；微信临时预览包体已通过（1,993,574 字节，见内容交付记录）；手机帧率及双账号云端验收仍待实际操作。
