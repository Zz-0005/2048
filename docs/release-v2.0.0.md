# 2048 v2.0.0 发布、定位与验证记录

发布日期：2026-10-20 · 对应 PRD：`PRD-2048 v2.0`（批准稿，仓库内为 [`docs/PRD-2048-v2.0.md`](PRD-2048-v2.0.md) 与 [`docs/PRD-2048-v2.0.docx`](PRD-2048-v2.0.docx)） · 版本文件：`VERSION` = `2.0.0`

## 1. 定位

**一句话**：一个打开即玩、不索取任何东西的 2048。

**给谁用**

| 用户 | 场景 | 这一版怎么满足 |
|------|------|----------------|
| 手机用户 | 通勤、排队时玩两分钟 | 单文件 `2048-standalone.html` 存进手机即可离线玩；触摸滑动；竖屏 320px 起可用 |
| 键盘用户 | 桌面快速对局 | 方向键 / WASD；焦点常驻棋盘；弹层是真模态框；Esc 关闭胜利提示 |
| 需要可访问性的人 | 读屏、低视力、晕动敏感 | `role="grid"` + 16 格方位标签；polite 播报每一步；AA 对比度；`prefers-reduced-motion` 降级；横屏不丢归属与操作说明 |
| 二次开发者 | 想读规则、跑验收 | 纯函数引擎（可注入 RNG/时钟）+ 112 项自动化测试；无框架、无构建、源码一屏可读 |

**刻意不做**：排行榜、账号、云存档（AT-013 按 PRD `D-003` 默认不交付）、埋点、PWA 离线包、音效、多语言。
代价是没有跨设备进度；收益是任何静态托管甚至 `file://` 都能跑，且没有任何网络请求。

## 2. 版本范围（2.0.0 相对 1.0.0）

- 版本号统一到 `2.0.0`：`VERSION`、`package.json`、页面页脚。
- 短横屏布局：`orientation: landscape and max-height: 560px` 改为双栏（棋盘 + 侧栏），
  版本与 MIT 归属移入侧栏底部（`grid-area: meta`），不再 `display:none`。
- ≤380px 高度时操作说明改为视觉隐藏（1px + `clip-path`），保留在可访问性树里，
  因为棋盘 `aria-describedby="board-help"` 指向它。
- 空格键在棋盘聚焦时被吞掉，避免把棋盘滚出视野。
- 单文件构建 `2048-standalone.html`（`npm run build:single`）与离线测试 `tests/standalone.e2e.test.mjs`。
- 新增 `tools/public-link.ps1`：把单文件版通过 localhost.run 的 SSH 隧道临时公开（仅用于验收演示）。

## 3. 验证记录（本机实测，2026-10-20）

环境：Windows + Node 24 + Microsoft Edge（headless）。浏览器矩阵仅 Edge/Chromium。

| 项目 | 命令 | 结果 |
|------|------|------|
| 全量测试 | `node --test "tests/*.test.mjs"` | **112 passed / 0 failed**（约 20s，连续两次） |
| 规则引擎 | `tests/engine.test.mjs` | 17 项：AT-002/003/003b/004、一步一合、四方向、`mergedIndices`、大于 2 的合并向量 |
| 会话状态机 | `tests/session.test.mjs` | 10 项：AT-001/005（按合并数校正）/006/007、RNG 注入 |
| 胜负判定 | `tests/outcome.test.mjs` | 12 项：AT-008/009/010/018、胜利优先于失败、Esc 只关胜利层 |
| 存储与事件 | `tests/storage.test.mjs` | 12 项：AT-011/012、白名单、环形缓冲、抛错监听器 |
| 随机不变量 | `tests/invariants.test.mjs` | 4 项：40 局 × 400 步 |
| 加固用例 | `tests/hardening.test.mjs` | 9 项：`setBoard` 校验、读失败不覆盖最高分、raw backend、时钟注入 |
| UI / 输入 / 读屏 | `tests/ui.e2e.test.mjs` | 16 项：键盘、CDP 触摸、弹层、焦点、`inert` |
| 布局与对比度 | `tests/layout.e2e.test.mjs` | 9 项：320/390/768/1280、AA 对比度、44px 目标、焦点环 |
| 焦点与真实触摸 | `tests/a11y-focus.e2e.test.mjs` | 11 项：Esc 焦点落点、遮罩不丢焦点、无效移动播报、空格不滚页、横屏归属可见、真实触摸滑动 |
| 发布验收 | `tests/acceptance.e2e.test.mjs` | 8 项：AT-015/017、NFR-001/005/006、axe、可访问性树、`file://` |
| 单文件版 | `tests/standalone.e2e.test.mjs` | 4 项：`file://` 无报错、胜负弹层、触摸、最高分跨刷新 |
| 像素校验 | `python tests/visual_check.py` | **66 / 66**（三视口 16 格底色 + 弹层居中 + 棋盘正方形） |
| 单步耗时 | `acceptance.e2e.test.mjs` | 200 步 p75 ≈ 2–3ms，最慢 ≈ 10ms（预算 100ms） |
| 可访问性审计 | axe-core 4.14，WCAG 2.0/2.1 A+AA | 载入 / 胜利层 / 结束层：0 条 serious / critical |

截图证据：`docs/screenshots/`（含 `standalone-mobile.png`、`geometry.json`）。

## 4. 审查记录

### 4.1 规则与状态审查（独立评审）

- 用自己的 oracle 覆盖全部 625 种四格行、240k 组随机棋盘×方向、120k 次 `canMove`、60 局随机对局，**零分歧**。
- 提出 5 项加固建议，全部落地并配 `tests/hardening.test.mjs`：
  `setBoard` 输入校验、读失败不得覆盖最高分、`createGame` 接受原始 backend、最高分只认纯数字、时钟注入下的时长。
- 结论：**通过**。

### 4.2 UI 与可访问性审查（独立评审）

- 1 项严重、5 项重要，全部修复并有回归测试：
  1. 从非可聚焦区域获胜后 Esc 焦点落回 `<body>` → 现在校验触发控件并回退到棋盘；
  2. 点击暗色遮罩会丢焦点 → 遮罩 `mousedown` 阻止默认 + `focusin` 守卫；
  3. 无效移动完全静默 → 播报「无法向X移动」；
  4. 存储横幅每次移动重写 → 仅内容变化时写；
  5. 横屏布局溢出/信息丢失 → 双栏 + 归属与说明保留；
  6. 读屏声明过度 → README 改为"未做人工读屏走查"。
- 结论：**修复后通过**。

### 4.3 交付前第三轮审阅（本轮）

- 缺陷 1：横屏 `display:none` 掉了页脚与 `aria-describedby` 目标 → 已修（见第 2 节），
  红证据：`footerVisible:false, describedDisplay:"none"`；修复后四档横屏 `describedVisible:true`。
- 缺陷 2：320×420 下空格把页面滚动 219px → 已修，红证据 `afterSpace:219`。
- 判定不是缺陷（不改）：方向键不节流、焦点可能回到页脚链接、两个 `role="status"`、`window.__2048` 暴露。
- 完整报告：`docs/code-review-2026-10-20.md`。

## 5. 已知限制（发布时必须一并说明）

- **AT-013 当前局恢复未交付**（PRD `D-003` 默认项），页面不承诺"关闭后继续"。
- **没有 NVDA / JAWS / VoiceOver 人工走查**：读屏证据是可访问性树断言与播报文案测试。
- **浏览器矩阵仅 Edge/Chromium**：Firefox / Safari（尤其 `inert`、`100dvh`）未实测。
- **键盘连按不节流**：按住方向键会连续移动并刷新播报。
- **临时公网链接不是分发方案**：localhost.run 隧道随本机关机失效、地址每次变化；长期地址用 GitHub Pages。

## 6. GitHub 仓库信息（复制即用）

**Description**（≤350 字符）：

```
打开即玩的 2048：响应式、键盘+触摸、零依赖零构建、可离线单文件；含 112 项自动化测试与 axe/像素级验收记录。
```

**Topics**：`2048` `game` `vanilla-js` `no-dependencies` `accessibility` `a11y` `mobile` `static-site` `offline` `github-pages`

**About 链接**：`https://zz-0005.github.io/2048/`
