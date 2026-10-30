# 第三方声明

## 2026-10-28 Poteto 游乐场交互参考

伙伴游乐场参考 [Poteto Playground](https://www.poteto.com/) 的草地角色跳动、点击便签、随机幸运角色、庆祝与重开交互。玩法、Canvas 绘制、任务映射和中文文案在本工程独立实现；没有引入该站点的 JavaScript、SVG、品牌或角色素材。八位角色 PNG 继续使用本项目已登记的用户交接素材，没有新增第三方运行依赖。具体接入与验证范围见 [伙伴游乐场](PAL_PLAYGROUND.md)。

更新日期：2026-08-15

## 当前状态

当前仓库已通过 npm 正式安装 `tdesign-miniprogram@1.15.3`，页面只按需注册 Button 和 Empty。第二阶段的 `auth-api` 云函数精确声明 `wx-server-sdk@4.0.2`，由微信云函数部署时在该函数目录内安装；当前本机尚未安装或部署这份云函数依赖。没有复制候选仓库源码、第三方字体或图标。

本机构建目录 `miniprogram/miniprogram_npm` 已存在，共 1,158 个文件、1,451,378 字节；该目录由微信开发者工具构建且保持 Git 忽略，实际主包大小与编译耗时仍需在本轮开发者工具验收中重新记录。

当前校园地图 JPEG 是用户提供给项目的候选资产，不作为第三方软件依赖列入下表；其生成过程、源文件和比赛使用权尚未归档，继续作为 `RISK_REGISTER.md` 的素材门禁，未核实前不能宣称为已完成原创证明。

本项目仓库已公开用于作品展示、学习交流和比赛体验，但当前不添加 MIT 或其他项目自身的开源许可证；除第三方组件自身许可证明确授予的权利外，仓库公开不等于授权复制、修改、再发布或商业使用，本文件不对项目自有内容作额外授权推断。

## 候选与参考项目

| 项目                          | 状态                                                       | 许可证核实                                    | 来源                                                                                                          | 是否修改 | 署名要求                              | 是否保留 LICENSE                                                | 比赛材料是否说明               |
| ----------------------------- | ---------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------- | --------------------------------------------------------------- | ------------------------------ |
| `tdesign-miniprogram`         | 正式运行时依赖；精确版本 `1.15.3`；按页使用 Button / Empty | MIT                                           | [Tencent/tdesign-miniprogram](https://github.com/Tencent/tdesign-miniprogram)                                 | 否       | MIT 无额外展示署名，但须保留版权/许可 | 已保留于 `docs/licenses/tdesign-miniprogram-1.15.3-LICENSE.txt` | 是                             |
| 微信小程序 Demo               | 候选，尚未使用；官方 API 参考                              | MIT                                           | [wechat-miniprogram/miniprogram-demo](https://github.com/wechat-miniprogram/miniprogram-demo)                 | 否       | 迁移代码时保留来源                    | 迁移时必须                                                      | 只有实际迁移代码时说明         |
| TDesign retail starter        | 候选，尚未使用；工程/视觉参考                              | 根 LICENSE MIT；package 元数据 ISC，冲突      | [Tencent/tdesign-miniprogram-starter-retail](https://github.com/Tencent/tdesign-miniprogram-starter-retail)   | 否       | 当前不迁移                            | 若迁移前先澄清                                                  | 仅实际使用时说明               |
| Awesome CloudBase Examples    | 候选，尚未使用；技术参考                                   | README 写 MIT，但根 LICENSE 缺失              | [TencentCloudBase/awesome-cloudbase-examples](https://github.com/TencentCloudBase/awesome-cloudbase-examples) | 否       | 当前不迁移                            | 子示例逐项核实                                                  | 仅实际使用时说明               |
| CloudBase Skills              | 候选，尚未安装                                             | MIT                                           | [TencentCloudBase/cloudbase-skills](https://github.com/TencentCloudBase/cloudbase-skills)                     | 否       | 保留包内许可                          | 安装后必须                                                      | 作为开发工具可在开发说明中披露 |
| Awesome Mini Program Skills   | 候选，决定不采用                                           | MIT                                           | [TencentCloudBase/awesome-miniprogram-skills](https://github.com/TencentCloudBase/awesome-miniprogram-skills) | 否       | 不适用                                | 不适用                                                          | 不需要                         |
| Tencent Map Mini Program Demo | 只读技术参考                                               | 无根 LICENSE；package 标 ISC                  | [TencentLBS/TencentMapMiniProgramDemo](https://github.com/TencentLBS/TencentMapMiniProgramDemo)               | 否       | 禁止复制                              | 未澄清前不使用                                                  | 不需要                         |
| BearDiary                     | 只读视觉参考                                               | MIT                                           | [harveyqing/BearDiary](https://github.com/harveyqing/BearDiary)                                               | 否       | 不使用其代码/素材                     | 不适用                                                          | 不需要                         |
| weapp-diary                   | 只读反例/产品参考                                          | MIT                                           | [KyaukYou/weapp-diary](https://github.com/KyaukYou/weapp-diary)                                               | 否       | 不使用其代码/素材                     | 不适用                                                          | 不需要                         |
| xy-diary                      | 禁止使用                                                   | 无 LICENSE；README 要求署名和二次开发联系作者 | [s-xianyu/xy-diary](https://github.com/s-xianyu/xy-diary)                                                     | 否       | 未获许可前禁止使用                    | 不适用                                                          | 不需要                         |
| WeUI MiniProgram              | 候选，尚未使用；规范参考                                   | MIT                                           | [wechat-miniprogram/weui-miniprogram](https://github.com/wechat-miniprogram/weui-miniprogram)                 | 否       | 当前不作为依赖                        | 实际使用后必须                                                  | 仅实际使用时说明               |
| Vant Weapp                    | 候选，决定暂不采用                                         | MIT                                           | [youzan/vant-weapp](https://github.com/youzan/vant-weapp)                                                     | 否       | 当前不作为依赖                        | 实际使用后必须                                                  | 仅实际使用时说明               |

## 当前精确依赖

| 包                        |     版本 | 类型   | 许可证     | 用途                                             |
| ------------------------- | -------: | ------ | ---------- | ------------------------------------------------ |
| `tdesign-miniprogram`     | `1.15.3` | 运行时 | MIT        | Button、Empty                                    |
| `wx-server-sdk`           |  `4.0.2` | 云函数 | MIT        | CloudBase 初始化、可信微信调用上下文与数据库访问 |
| `@eslint/js`              | `10.0.1` | 开发   | MIT        | ESLint 官方基础规则                              |
| `eslint`                  | `10.8.0` | 开发   | MIT        | 静态检查                                         |
| `typescript-eslint`       | `8.65.0` | 开发   | MIT        | TypeScript ESLint 解析和类型规则                 |
| `typescript`              |  `5.9.3` | 开发   | Apache-2.0 | 命令行类型检查                                   |
| `miniprogram-api-typings` |  `5.2.2` | 开发   | MIT        | 微信小程序 API 类型                              |
| `prettier`                |  `3.9.6` | 开发   | MIT        | 格式检查                                         |

小程序依赖均在根 `package.json` 和 `package-lock.json` 中精确记录；云函数依赖在 `cloudfunctions/auth-api/package.json` 中独立精确锁定。`wx-server-sdk` 的包元数据和官方仓库均标记为 MIT，部署产物必须保留 npm 包自带 LICENSE。`node_modules` 与开发者工具生成的 `miniprogram_npm` 不提交 Git。

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

## 2026-10-25 心情日记界面

主要日记交互参考 EMMO 的界面与功能观察，具体实现为独立编写的 TypeScript/WXML/WXSS。EMMO 不是本项目依赖，本项目未集成其 APK、Java 反编译代码、商标、商业表情包或图片。心情表情由 CSS 绘制，TabBar 图标由 scripts/generate-journal-icons.py 生成；Pillow 只用于开发期生成这些原创图标，不是小程序运行依赖。校园底图和既有服务沿用本项目原素材与权限边界。

## 校园伙伴用户交接素材（2026-10-26）

用户提供 `iSdu-Pal-Handoff-20261026.zip` 并明确要求接入当前小程序。8 位角色、4 张途途动作图、1 张空房间和 10 件家具及 2 张场景参考来自该包；角色文案与 24 条灵感来自其配置。运行图仅做等比缩小、调色板及编码优化，来源哈希和文件映射见 `COMPANION_ART_MANIFEST.json`。资料包自述为原创/AI 辅助设计，保留该来源说明，不将其称为学校官方授权素材。原图与研究登记仍保留在用户原 ZIP 中；当前工程未收录参考 app 的截图作为美术。

围巾、草帽、小书、耳机、花饰、旧池塘及旧坐垫的 SVG 预览与 Canvas 绘制是本项目代码矢量资产。

## 山大装饰第二批用户交接（2026-10-26）

新增12件道具和2张搭配参考来自用户提供的 `iSdu-SDU-Decor-Expansion-20261026.zip`。原包自述使用内置imagegen生成，来源与提示词保留在原始包；本工程仅等比缩小与编码优化，不把生成图当作学校标准校徽、标准色、官方科研设备或真实星图。来源/运行哈希见 `COMPANION_DECOR_EXPANSION_MANIFEST.json`。
