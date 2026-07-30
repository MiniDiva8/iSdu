# 微信开发者工具与真机测试手册

更新日期：2026-07-31

本手册用于验证“最小微信原生 TypeScript 小程序骨架”。本轮没有 CloudBase、正式地图、日记数据或外部网络请求。

## 0. 开始前准备

1. 安装当前稳定版微信开发者工具，并使用你自己的微信账号登录。
2. 打开终端，进入仓库根目录：

   ```powershell
   Set-Location -LiteralPath 'C:\Users\24578\Desktop\iSdu'
   ```

3. 安装依赖：

   ```powershell
   npm.cmd install
   ```

   如果普通命令行可以运行 `npm`，也可以执行 `npm install`。本机 PowerShell 若提示禁止运行 `npm.ps1`，使用 `npm.cmd` 即可，不要为了本项目修改系统执行策略。

4. 可选地先运行自动检查：

   ```powershell
   npm.cmd run check
   ```

## 1. 创建或导入小程序项目

1. 打开微信开发者工具。
2. 在欢迎页选择“小程序”，点击“导入项目”；如果已有项目列表，也可以点击左上角的“+”。
3. “项目目录”选择：

   ```text
   C:\Users\24578\Desktop\iSdu
   ```

4. 必须选择包含 `project.config.json` 的仓库根目录，不要选择 `miniprogram` 子目录。
5. 项目名称可填写“山大迹忆”。
6. 仅做本地模拟器编译时，公共配置中的 `touristappid` 可作为安全占位值。

## 2. 在哪里填写 AppID

真实 AppID 只用于预览和真机测试，不要写入 Git，不要在聊天、截图或提交记录中发送。

1. 在仓库根目录新建 `project.private.config.json`。该文件已被 `.gitignore` 忽略。
2. 写入以下本机配置，把示例文字替换为你自己的 AppID：

   ```json
   {
     "description": "仅本机使用，不提交 Git",
     "appid": "在本机填写你自己的小程序AppID"
   }
   ```

3. 回到开发者工具，打开右上角“详情”→“基本信息”，确认显示的是你的 AppID。
4. 如果在界面中修改 AppID，确认开发者工具写入的是 `project.private.config.json`，没有把真实值写进公共 `project.config.json`。
5. 在提交任何代码前运行：

   ```powershell
   git check-ignore project.private.config.json
   git diff -- project.config.json
   ```

   第一条应显示该文件被忽略；第二条不得出现真实 AppID。如果开发者工具改动了公共文件，请先把 `project.config.json` 的 `appid` 恢复为 `touristappid`。

## 3. 如何构建 npm

1. 确认仓库根目录已经执行过 `npm.cmd install`。
2. 在微信开发者工具顶部菜单选择“工具”→“构建 npm”。
3. 等待提示构建完成。
4. 构建结果应位于：

   ```text
   C:\Users\24578\Desktop\iSdu\miniprogram\miniprogram_npm
   ```

5. 展开目录后应能找到 `tdesign-miniprogram`。本项目只在页面 JSON 中注册 Button 和 Empty。
6. 每次修改 `package.json` 或重新安装不同版本后，都要重新执行“构建 npm”。
7. `miniprogram_npm` 是本机生成物，已被 Git 忽略，本项目选择不提交它；`package.json` 和 `package-lock.json` 才是可复现依赖来源。

## 4. 关闭本地合法域名校验

1. 点击开发者工具右上角“详情”。
2. 打开“本地设置”。
3. 勾选“不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”。
4. 公共配置也设置了 `urlCheck: false`，但仍以当前开发者工具界面显示为准。
5. 该选项只用于本地开发，不能替代正式发布时的域名和安全配置。本轮没有任何外部请求。

## 5. 如何编译与检查模拟器

1. 完成“构建 npm”后点击顶部“编译”。
2. 首屏应显示“山大迹忆”“工程骨架验证中”和“本地 Demo 占位仓库可用”。
3. 底部应只有三个 Tab：地图、记录、时光。
4. 依次点击三个 Tab，确认页面不白屏。
5. 在地图页点击“验证本地状态”，文字中的计数应递增。
6. 点击“打开详情占位页”，确认能进入详情页，再点击“返回地图”。
7. 点击“打开个人占位页”，确认能进入个人页，再点击“返回地图”。
8. 在记录页点击“验证记录页交互”，确认提示文字变化。
9. 打开调试器 Console，确认没有红色编译错误、组件找不到错误或未处理 Promise 异常。

## 6. 如何记录 npm 构建、包体和编译结果

构建完成后记录以下数据，不要用 npm 包的解压大小代替开发者工具结果：

1. 在开发者工具“详情”或上传/预览面板中记录主包大小和总包大小。
2. 记录首次完整编译耗时，以及再次点击“编译”的大致耗时。
3. 在 PowerShell 记录 `miniprogram_npm` 物理大小：

   ```powershell
   Get-ChildItem -LiteralPath '.\miniprogram\miniprogram_npm' -Recurse -File |
     Measure-Object -Property Length -Sum
   ```

4. 将 `Count`、`Sum`、主包大小、总包大小和编译耗时发回本任务即可；不要附带 AppID 或私人配置截图。

## 7. 如何预览

1. 确认开发者工具已经使用你自己的 AppID，而不是 `touristappid`。
2. 点击顶部“预览”。
3. 等待开发者工具生成二维码。
4. 用已加入该小程序开发成员的微信扫码。
5. 如果提示没有权限，请在微信公众平台确认当前微信号已加入项目成员；不要把账号密码交给任何人。

## 8. 真机冒烟测试

至少使用一台准备比赛演示的手机，记录手机型号、操作系统版本和微信版本。

1. 扫码打开预览版。
2. 确认首屏不是白屏，顶部标题和卡片没有被状态栏遮挡。
3. 依次切换地图、记录、时光三个 Tab。
4. 在地图页点击本地状态按钮两次，确认计数正常变化。
5. 进入详情页和个人页，再分别返回地图。
6. 在记录页验证本地提示变化。
7. 检查底部安全区，按钮和 Tab 不应被系统手势条遮挡。
8. 返回开发者工具 Console，确认没有未处理异常。
9. 关闭网络后重新打开一次；本轮没有 CloudBase，应仍能显示占位页面。

## 9. 常见错误检查

### 找不到 `tdesign-miniprogram` 组件

- 确认已在仓库根目录执行 `npm.cmd install`。
- 再执行“工具”→“构建 npm”。
- 确认导入的是仓库根目录，而不是 `miniprogram`。
- 确认生成了 `miniprogram/miniprogram_npm/tdesign-miniprogram`。

### TypeScript 文件没有编译

- 打开“详情”→“本地设置”，确认没有关闭 TypeScript 编译。
- 检查公共 `project.config.json` 中的 `useCompilerPlugins` 包含 `typescript`。
- 先运行 `npm.cmd run typecheck`，修复命令行报告的首个错误。

### 预览按钮不可用或提示 AppID 无效

- `touristappid` 只用于安全导入和本地模拟器验证。
- 按第 2 节把自己的 AppID 放入被忽略的 `project.private.config.json`。
- 确认当前微信号具有该 AppID 对应项目的开发权限。

### 页面白屏

- 先看 Console 的第一条红色错误，不要连续修改多项配置。
- 检查是否已经构建 npm。
- 检查 `app.json` 中的页面路径与文件夹名称是否一致。
- 重新点击“编译”，确认地图页是首个页面。

### PowerShell 提示禁止运行 `npm.ps1`

- 使用 `npm.cmd install`、`npm.cmd run check`。
- 不需要修改 Windows 全局执行策略。

### 域名校验提示

- 本轮没有外部请求；按第 4 节开启本地“不校验合法域名”。
- 不要为消除提示而接入代理、后端或 CloudBase。
