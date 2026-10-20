**打开即玩的 2048 v2.0.0**：响应式、键盘 + 触摸、零依赖零构建，另有一个单文件版本可以存进手机离线玩。

## 试玩

- 在线：https://zz-0005.github.io/2048/
- 单文件离线：下载 [`2048-standalone.html`](https://github.com/Zz-0005/2048/blob/main/2048-standalone.html)，双击或存进手机打开，不需要网络
- PRD（本版本实现的规格）：[`docs/PRD-2048-v2.0.md`](https://github.com/Zz-0005/2048/blob/main/docs/PRD-2048-v2.0.md) · [原件 .docx](https://github.com/Zz-0005/2048/blob/main/docs/PRD-2048-v2.0.docx) · [网页版](https://zz-0005.github.io/2048/docs/prd.html)

## 这一版包含

- 规则与状态机严格按 PRD-2048 v2.0 批准稿实现：滑动合并、每步一次生成、胜利后继续、无路可走判定、最高分持久化
- 桌面方向键 / WASD，移动端滑动；弹层为真模态（`inert` + `aria-modal`），Esc 只关闭胜利提示，焦点回到棋盘
- 可访问性：`role="grid"` 棋盘与 16 格方位标签、每步 polite 播报、AA 对比度、`prefers-reduced-motion` 降级、横竖屏都不丢归属与操作说明
- 响应式布局：320px 起的竖屏、四档横屏双栏（棋盘 + 侧栏）
- 单文件构建（`npm run build:single`）与离线测试
- 只持久化最高分；按 PRD `D-003` 默认不交付当前局恢复，页面不承诺「关闭后继续」
- 不接入任何远端分析，事件仅走本地白名单接口

## 验证

| 项目 | 结果 |
|---|---|
| 自动化测试（规则、状态机、存储、浏览器 E2E） | 112 / 112 |
| axe-core 可访问性审计（载入 / 胜利层 / 结束层） | 0 条 serious / critical |
| 截图像素校验 | 66 / 66 |
| 单步耗时（200 步） | p75 ≈ 2–3ms，最慢 ≈ 10ms（预算 100ms） |
| 浏览器 | Microsoft Edge（Chromium） |

完整记录：[`docs/release-v2.0.0.md`](https://github.com/Zz-0005/2048/blob/main/docs/release-v2.0.0.md) · 审阅：[`docs/code-review-2026-10-20.md`](https://github.com/Zz-0005/2048/blob/main/docs/code-review-2026-10-20.md)

## 已知限制

- 当前局恢复（PRD AT-013）未交付，属 PRD `D-003` 默认项
- 没有 NVDA / JAWS / VoiceOver 人工走查；读屏证据是可访问性树断言与播报文案测试
- 只在 Edge/Chromium 上实测，Firefox / Safari 未验证
- 按住方向键不节流，会连续移动并刷新播报

## 许可

MIT。参考实现 [gabrielecirulli/2048](https://github.com/gabrielecirulli/2048)（MIT），原作者 Gabriele Cirulli；本项目改动见 [`NOTICE.md`](https://github.com/Zz-0005/2048/blob/main/NOTICE.md)。
