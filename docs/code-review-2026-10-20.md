# 代码审阅 · 2048（2026-10-20，修复后基线）

审阅对象：`index.html`、`styles.css`、`script.js`、`tests/*`、`README.md`、`docs/`。
方法：重读当前代码 → 对可疑行为写探针复现 → 只在拿到"红证据"后才改 → 改完补测试并跑全量。
本报告不采信先前两轮评审的结论，全部重新验证；下面每条都带可复现证据。

结论：**2 个真实缺陷**（横屏元信息与棋盘描述丢失；棋盘聚焦时空格滚页），已修复并各有一条回归测试；
**4 项经核查不是缺陷**（列出理由，避免被"看起来该改"的建议带偏）；**3 处我无法在本机验证**，明确标为残留风险。

## 发现

| # | 严重度 | 位置 | 现象 | 处置 |
|---|--------|------|------|------|
| F1 | 重要 | `styles.css:458-521` | 横屏（≤560px 高）把 `.footer` 设成 `display: none`，版本与 MIT 归属在横屏下不可见；`max-height: 380px` 时 `.hint` 也被 `display: none`，而棋盘 `aria-describedby="board-help"` 正指向它，描述被移出可访问性树 | 已修：归属移到右栏底部网格区 `meta`；说明文字改为视觉隐藏 |
| F2 | 次要 | `script.js:728-753` | 棋盘获得焦点、页面可滚动时（320×420），按空格滚页 219px，棋盘被滚出视野 | 已修：仅当焦点在棋盘上时吞掉空格 |

### F1 横屏丢失归属与棋盘描述

红证据（修复前探针，667×375）：

```
footerVisible: false, hintVisible: false, describedDisplay: "none", describedRects: 0
```

PRD 6 要求页面上有版本与 MIT 归属（AT-017 的检查项），而 `role="grid"` 的 `aria-describedby` 指向一个
`display:none` 的元素时，读屏拿不到"用方向键或滑动移动"这条操作说明——横屏用户恰好是最需要它的人（只有方向键）。

修复：`grid-template-areas: "board panel" "board meta"`，`.footer` 进右栏、`align-self: end`；
≤380px 时 `.hint` 用 1px + `clip-path` 视觉隐藏而不是移除。修复后同一探针：

```
667×375  footerVisible: true, footerText: "版本 1.0.0 · MIT License 参考 gabr…", describedVisible: true
640×320  footerVisible: true, describedVisible: true, scrollY: 0, overflowX: false
```

代价：右栏多占约 60px；在 667×375 下右栏宽 276px，归属文字换行 3 行，未与工具栏重叠（footer top 300 > panel bottom）。

### F2 空格把棋盘滚出视野

红证据（修复前，320×420，页面可滚动）：

```
{"scrollable":true,"before":0,"afterSpace":219,"afterArrow":{"y":0,"moves":1}}
```

方向键已被 `preventDefault` 且走棋，空格是唯一还能把棋盘滚走的默认行为。修复：`script.js:748`，仅在
`doc.activeElement === boardEl` 时 `preventDefault`。按钮上的空格不受影响（回车/空格激活按钮仍正常，
弹层测试覆盖）。

## 核查后判定"不是缺陷"（不改）

1. **按住方向键不节流**：`p75 ≈ 2–3ms`，连按是 2048 的正常玩法；节流反而让按住无响应。live region 会排队播报，
   这是 polite 区域的设计语义，不是 bug。
2. **获胜时焦点可能回到页脚链接**：`lastFocused` 只在"当前焦点不在弹层内"时记录，玩家若用页脚链接停留过就按方向键，
   焦点确实会回到链接。但方向键监听在 `document` 上，回去后仍可继续下棋；而"回到触发控件"本身是 PRD 的要求。
   判定：可接受，不改。
3. **两个 `role="status"`**（存储横幅 + 播报区）：语义允许，且两者不同时高频更新（横幅只写一次，见测试）。
4. **`window.__2048` 生产环境可见**：测试与截图依赖它，已在校准记录里声明为有意暴露，且 `setBoard` 现在会拒绝非法输入，
   不会成为注入破坏状态的入口。

## 我无法在本机验证（残留风险，不要当成已验证）

1. **屏幕阅读器实机**：`role="grid"` + 方向键移动棋盘的组合、`aria-describedby` 的朗读效果、弹层 `inert` 的焦点行为，
   我只能用 Chromium 可访问性树和播报文案断言，无法替代 NVDA/VoiceOver 的人耳确认。发布前建议补一次。
2. **Firefox / Safari**：`inert`（Safari ≥15.5）、`100dvh`、`clip-path` 隐藏文本的行为未实测；本机只有 Edge。
3. **真实触屏惯性**：CDP 触摸能证明"滑动不滚页 + 真的走棋"，但不覆盖真机上的回弹/惯性手感。

## 测试增量

- `a11y-focus.e2e.test.mjs`：新增「Space on the focused board does not scroll the page」；
  横屏用例追加归属可见、`aria-describedby` 目标仍在可访问性树内两条断言。
- 全量：108 tests / 108 pass；截图 66 项像素校验通过；横屏三尺寸 `scrollY = 0`、无横向滚动。
