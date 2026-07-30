# 第三方声明

更新日期：2026-07-30

## 当前状态

当前仓库尚未安装、复制或打包任何第三方运行时代码、图片、字体或图标。下表中的所有项目均为评估候选或只读参考，不代表已正式使用。

本项目仓库暂时保持私有，当前不添加 MIT 或其他项目自身的开源许可证；本文件不对项目自有内容作授权推断。

## 候选与参考项目

| 项目 | 状态 | 许可证核实 | 来源 | 是否修改 | 署名要求 | 是否保留 LICENSE | 比赛材料是否说明 |
|---|---|---|---|---|---|---|---|
| `tdesign-miniprogram` | 候选，尚未使用；计划正式依赖 | MIT | [Tencent/tdesign-miniprogram](https://github.com/Tencent/tdesign-miniprogram) | 否 | MIT 无额外展示署名，但须保留版权/许可 | 正式引入后必须 | 正式引入后说明 |
| 微信小程序 Demo | 候选，尚未使用；官方 API 参考 | MIT | [wechat-miniprogram/miniprogram-demo](https://github.com/wechat-miniprogram/miniprogram-demo) | 否 | 迁移代码时保留来源 | 迁移时必须 | 只有实际迁移代码时说明 |
| TDesign retail starter | 候选，尚未使用；工程/视觉参考 | 根 LICENSE MIT；package 元数据 ISC，冲突 | [Tencent/tdesign-miniprogram-starter-retail](https://github.com/Tencent/tdesign-miniprogram-starter-retail) | 否 | 当前不迁移 | 若迁移前先澄清 | 仅实际使用时说明 |
| Awesome CloudBase Examples | 候选，尚未使用；技术参考 | README 写 MIT，但根 LICENSE 缺失 | [TencentCloudBase/awesome-cloudbase-examples](https://github.com/TencentCloudBase/awesome-cloudbase-examples) | 否 | 当前不迁移 | 子示例逐项核实 | 仅实际使用时说明 |
| CloudBase Skills | 候选，尚未安装 | MIT | [TencentCloudBase/cloudbase-skills](https://github.com/TencentCloudBase/cloudbase-skills) | 否 | 保留包内许可 | 安装后必须 | 作为开发工具可在开发说明中披露 |
| Awesome Mini Program Skills | 候选，决定不采用 | MIT | [TencentCloudBase/awesome-miniprogram-skills](https://github.com/TencentCloudBase/awesome-miniprogram-skills) | 否 | 不适用 | 不适用 | 不需要 |
| Tencent Map Mini Program Demo | 只读技术参考 | 无根 LICENSE；package 标 ISC | [TencentLBS/TencentMapMiniProgramDemo](https://github.com/TencentLBS/TencentMapMiniProgramDemo) | 否 | 禁止复制 | 未澄清前不使用 | 不需要 |
| BearDiary | 只读视觉参考 | MIT | [harveyqing/BearDiary](https://github.com/harveyqing/BearDiary) | 否 | 不使用其代码/素材 | 不适用 | 不需要 |
| weapp-diary | 只读反例/产品参考 | MIT | [KyaukYou/weapp-diary](https://github.com/KyaukYou/weapp-diary) | 否 | 不使用其代码/素材 | 不适用 | 不需要 |
| xy-diary | 禁止使用 | 无 LICENSE；README 要求署名和二次开发联系作者 | [s-xianyu/xy-diary](https://github.com/s-xianyu/xy-diary) | 否 | 未获许可前禁止使用 | 不适用 | 不需要 |
| WeUI MiniProgram | 候选，尚未使用；规范参考 | MIT | [wechat-miniprogram/weui-miniprogram](https://github.com/wechat-miniprogram/weui-miniprogram) | 否 | 当前不作为依赖 | 实际使用后必须 | 仅实际使用时说明 |
| Vant Weapp | 候选，决定暂不采用 | MIT | [youzan/vant-weapp](https://github.com/youzan/vant-weapp) | 否 | 当前不作为依赖 | 实际使用后必须 | 仅实际使用时说明 |

## 正式引入后的更新要求

引入任何第三方内容的同一提交必须更新本文件，至少补充：

- 精确包名和锁定版本，或仓库提交 SHA。
- 使用的准确文件/组件。
- 是否修改以及修改范围。
- 许可证和版权文本的保存位置。
- 是否包含第三方图片、字体、图标或其他非代码资产。
- 比赛 Demo、PPT、README 中的披露方式。

## 比赛材料建议表述

在 TDesign 和 CloudBase 实际接入后，可使用类似表述：

> 项目核心的校园插画地图、比例坐标系统、空间日记交互与时光回放为原创实现。基础 UI 使用 MIT 许可的 TDesign MiniProgram；运行平台与云端能力使用微信小程序和腾讯云开发 CloudBase。第三方来源和许可证已在仓库中完整列明。

不得把第三方组件或官方示例描述为本项目原创成果。
