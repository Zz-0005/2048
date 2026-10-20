# 2048（PRD-2048 v2.0 实现）

当前版本 **2.0.0**（发布与验证记录见 [`docs/release-v2.0.0.md`](docs/release-v2.0.0.md)）。

响应式 2048 小游戏：桌面键盘 + 移动端触摸，纯静态、无后端、无框架、无构建步骤。

## 定位

**一个打开即玩、不索取任何东西的 2048。** 给三类人用：

- **想在手机上随手玩两分钟的人**：单文件 `2048-standalone.html` 存到手机就能离线玩，不需要安装、不需要账号、没有广告和内购；
- **用键盘的人**：方向键 / WASD 直接下棋，焦点在棋盘上，弹层是真正的模态框，Esc 关闭胜利提示；
- **需要可访问性的人**：语速友好的播报文案、`role="grid"` 棋盘、AA 对比度、`prefers-reduced-motion` 降级、横竖屏都不丢信息。

与常见的 2048 副本相比，这里刻意**只做规则本身**：不做排行榜、不做存档续玩、不埋点、不引入框架和构建链——代价是没有云端进度，收益是任何静态托管（甚至 `file://`）都能跑，源码一屏可读完。

- 规则与状态机严格按 `PRD-2048 v2.0`（批准稿）实现
- 规则引擎是纯函数模块，随机数可注入，验收用例可重复
- 只持久化最高分（`bestScore`）；按 PRD `D-003` 默认不交付 P1 当前局恢复，页面不承诺“关闭后继续”
- 不接入任何远端分析，事件仅走本地白名单接口

## 运行

```bash
# 方式一：直接打开 index.html（现代浏览器）
# 方式二：本地静态服务器（推荐，localStorage 行为与线上一致）
npm run serve      # 打印 http://127.0.0.1:<port>
```

## 测试

依赖：Node 18+ 与本机安装的 Microsoft Edge（E2E 使用 `playwright-core` 驱动本机 Edge，不下载浏览器）。

```bash
npm install         # 仅安装 devDependencies：playwright-core、axe-core
npm test            # 全量：规则单测 + 浏览器 E2E + 布局/对比度/可访问性审计
npm run test:unit   # 仅规则引擎与会话状态机单测
npm run test:e2e    # 仅浏览器测试（需要 Edge）
npm run shots       # 生成 docs/screenshots 下的截图与 geometry.json
python tests/visual_check.py  # 逐像素校验截图（需要 Pillow）
```

`tests/visual_check.py` 读取截图与 `geometry.json`，核对三种视口下每个格子的底色、棋盘是否为正方形、弹层是否居中——它是“渲染结果与引擎状态一致”的自动证据，不依赖人眼。

## 目录

```
index.html            页面结构与语义（role=grid / dialog / live region）
styles.css            主题、响应式布局、动效与 reduced-motion
script.js             规则引擎（纯函数 + 会话状态机）与 DOM 控制层
tests/engine.test.mjs     棋盘与合并规则（AT-002/003/003b/004）
tests/session.test.mjs    新局、随机数注入、有效移动（AT-001/005/006/007）
tests/outcome.test.mjs    胜负状态机与优先级（AT-008/009/010/018）
tests/storage.test.mjs    最高分持久化、存储降级、事件白名单（AT-011/012）
tests/invariants.test.mjs 40 局随机对局的不变量（棋盘/分数/步数/最大块/阶段）
tests/ui.e2e.test.mjs     键盘/触摸/弹层/焦点/读屏（AT-008/009/011/012/014/016/018）
tests/a11y-focus.e2e.test.mjs 焦点落点、遮罩、播报、真实触摸、横屏布局
tests/layout.e2e.test.mjs 320–1280 布局、AA 对比度、焦点环、点击目标
tests/acceptance.e2e.test.mjs 全流程无 console error（http 与 file://）、性能、axe 与可访问性树、发布产物（AT-015/016/017、NFR-001/005/006）
tests/serve.mjs           零依赖静态服务器（测试与本地预览共用；HOST=0.0.0.0 可供同网段设备访问）
tools/build-standalone.mjs 把三个文件打包成单文件 2048-standalone.html
tests/standalone.e2e.test.mjs 单文件版本：file:// 下开局/胜负弹层/触摸/最高分持久化
tests/shots.mjs           截图与 geometry.json 生成
tests/visual_check.py     截图像素校验（棋盘格子底色、正方形、弹层居中）
docs/plans/               实施计划；docs/ledger.md 为无 git 环境下的执行记录
docs/code-review-2026-10-20.md 审阅报告（发现、证据、不改的理由、残留风险）
LICENSE / NOTICE.md    MIT 许可证与上游归属
VERSION                发布版本号
```

## 需求 → 证据追溯

| 需求 | 证据 |
|------|------|
| AT-001 新局两个 tile | `session.test.mjs`「AT-001」；`ui.e2e.test.mjs`「AT-001」 |
| AT-002 `[2,0,2,0]` 左移 | `engine.test.mjs`「AT-002」 |
| AT-003 `[2,2,2,0]` 左移 | `engine.test.mjs`「AT-003」 |
| AT-003b `[2,2,2,0]` 右移 | `engine.test.mjs`「AT-003b」 |
| AT-004 `[2,2,2,2]` 左移 | `engine.test.mjs`「AT-004」 |
| AT-005 有效移动恰好新增 1 个 tile | `session.test.mjs`「AT-005」 |
| AT-006 无效移动不改变任何状态 | `session.test.mjs`「AT-006」 |
| AT-007 注入 RNG 与 90/10 分布 | `session.test.mjs`「AT-007」×2 |
| AT-008 胜利层只出现一次 | `outcome.test.mjs`「AT-008」×2；`ui.e2e.test.mjs`「AT-008」 |
| AT-009 满盘无合并结束 | `outcome.test.mjs`「AT-009」；`ui.e2e.test.mjs`「AT-009」 |
| AT-010 满盘仍可合并 | `outcome.test.mjs`「AT-010」 |
| AT-011 最高分保留 | `storage.test.mjs`「AT-011」×3；`ui.e2e.test.mjs`「AT-011」 |
| AT-012 存储异常仍可玩 | `storage.test.mjs`「AT-012」×2；`ui.e2e.test.mjs`「AT-012」 |
| AT-013 当前局恢复 | **未交付**（PRD D-003 默认项），不纳入门槛 |
| AT-014 键盘/触摸方向与斜向阈值 | `ui.e2e.test.mjs`「AT-014」×3；`a11y-focus.e2e.test.mjs` 用 CDP 真实触摸证明滑动不滚页 |
| AT-015 无 console error | `ui.e2e.test.mjs` 各用例断言 + `acceptance.e2e.test.mjs` |
| AT-016 键盘/焦点/读屏 | `ui.e2e.test.mjs`「AT-016」×2（`inert` 隔离背景）+ `a11y-focus.e2e.test.mjs`（Esc 后焦点落点、遮罩点击、无效移动播报、弹层期间不滚页）+ `layout.e2e.test.mjs` + axe 与可访问性树（`acceptance.e2e.test.mjs`） |
| AT-017 许可证与归属 | `acceptance.e2e.test.mjs`「AT-017」+ 页面页脚；`a11y-focus.e2e.test.mjs` 断言横屏下归属仍可见 |
| AT-018 同一步胜利+失败 | `outcome.test.mjs`「AT-018」；`ui.e2e.test.mjs`「AT-018」 |
| NFR-001 性能 | `acceptance.e2e.test.mjs`：p75 单步处理 ≤100ms |
| NFR-002 稳定性 | 规则单测全绿 + 存储异常注入用例 |
| NFR-003 兼容性 | 目标 Chrome/Edge/Firefox/Safari 最近两个大版本；本机证据为 Edge（Chromium）全矩阵通过 |
| NFR-004 可访问性 | 焦点环、对比度、reduced-motion、axe 无 serious/critical、Chromium 可访问性树断言；**未做 NVDA/JAWS/VoiceOver 人工走读** |
| NFR-005 安全 | CSP meta、HTTPS 部署说明、MIT + NOTICE |
| NFR-006 可维护性 | 逻辑/样式/页面分离，纯函数引擎，本表即追溯 |

## 验证结果（本机实测）

| 项目 | 命令 | 结果 |
|------|------|------|
| 全量测试 | `node --test "tests/*.test.mjs"` | 112 passed / 0 failed（约 20s），连续两次 |
| 单步处理耗时（NFR-001） | `acceptance.e2e.test.mjs` | 200 步实测 p75 约 2–3ms，最慢约 6ms（预算 100ms） |
| 可访问性审计 | axe-core 4.14，WCAG 2.0/2.1 A+AA | 载入、胜利层、结束层均 0 条 serious/critical |
| 布局审计 | `layout.e2e.test.mjs` | 320/390/768/1280 无横向滚动、棋盘正方形、格子等宽、44px 点击目标 |
| 横屏/短视口 | `a11y-focus.e2e.test.mjs` | 667×375、640×320 棋盘完整可见且加载后不跳动 |
| 截图像素校验 | `tests/visual_check.py` | 66 项全部通过（三视口 16 格底色 + 弹层居中 + 正方形） |
| 浏览器 | Microsoft Edge（Chromium）headless | 全矩阵通过 |

## 运行方式

三种，任选：

1. **单文件（推荐给手机、其它电脑、离线场景）**：`2048-standalone.html` 一个文件包含全部 HTML/CSS/JS，
   传到任何设备用浏览器打开即可，无需服务器、无需联网。重新生成：`npm run build:single`。
   注意：该构建把 CSP 放宽到 `script-src 'unsafe-inline'`（单文件必须内联），部署版仍用严格 CSP。
2. **本机双击**：打开 `index.html`（同目录需有 `styles.css`、`script.js`）。
3. **本地服务器**：`npm run serve` → `http://127.0.0.1:8787`；
   需要让同网段设备访问时 `HOST=0.0.0.0 PORT=8787 npm run serve`，
   前提是两台设备在同一 Wi-Fi 且该网络未开启 AP 隔离（手机热点、访客网络、校园网通常有隔离）。
4. **公网链接（任何人点开就能玩）**：`powershell -File tools/public-link.ps1`。
   脚本把单文件版作为 `index.html` 放到临时目录，仅在回环地址提供服务，再通过 localhost.run 的 SSH 隧道
   转发成 `https://<随机>.lhr.life`。只暴露临时目录里的那一个文件；链接的有效期等于这个窗口和这台机器
   开着的时长，每次重启链接都会变。要长期可用的地址，把 `2048-standalone.html` 传到 GitHub Pages /
   Netlify Drop / Cloudflare Pages 即可（纯静态，无需构建设置）。

## 部署

静态托管即可（无后端）：

- 上传 `index.html`、`styles.css`、`script.js`、`LICENSE`、`NOTICE.md`
- 必须 HTTPS
- 建议在响应头补齐 CSP（`frame-ancestors` 只能通过响应头生效，meta 中会被忽略）：
  `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
- 回滚：保留上一个版本目录，直接切回

## 已知范围限制

- 不实现 P1 当前局恢复（AT-013）；仅最高分跨刷新保留
- 无撤销、排行榜、PWA 离线、音效、多语言切换（PRD 第 12 节机会池）
- 本机浏览器矩阵仅 Edge；Firefox/Safari 需在对应设备复跑 `npm run test:e2e`
- 未做 NVDA / JAWS / VoiceOver 人工走读：读屏证据是可访问性树断言与播报文案测试，发布前建议补一次真机走查
- 横竖屏均已适配（667×375 短横屏下棋盘完整可见），但键盘连按（key repeat）不节流：按住方向键会连续移动并刷新播报
- 支持直接双击 `index.html`（file://）运行；Chromium 正常，其他内核未验证 file:// 下的 localStorage 行为
- 无远端错误监控，M-002 按 PRD 10.2 以 CI 全绿 + 浏览器矩阵取证
