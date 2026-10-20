# Ledger — 2048 implementation (PRD-2048 v2.0)

Plan: `docs/plans/2026-10-20-2048-game.md`
Spec: `C:\Users\Zz\Documents\Codex\2026-10-20\2048-prd-2048-v1-0-github\outputs\2048-PRD-approved-v2.0.docx`
(text extract kept at `docs/PRD-2048-v2.0-extract.txt`)

Execution was inline (this session). Version control was unavailable: `git init`
fails on this host with `Permission denied` when creating `.git`, in every path
including `%TEMP%` — a harness restriction, not a path or ACL problem. This
ledger, plus the test suite, is the execution record instead of commits.

## Rulings

- **No git history — why: harness blocks `.git` creation — cost if wrong: no
  per-task commit trail; the ledger and test names carry traceability.**
- **AT-013 / `gameState` restore not delivered — why: PRD D-003 says the P1
  snapshot defaults to "not in V1.0" when the freeze decision is open, and the
  PRD itself records it as undecided — cost if wrong: a player who closes the
  tab loses the round, exactly as the UI states (no "continue after closing"
  claim anywhere).**
- **Game-over dialog has no Esc dismissal — why: F5's Esc rule is scoped to the
  win overlay; closing the end dialog would strand the player with no way back
  in — cost if wrong: Esc does nothing on the end screen; 重新开始 is the only exit.**
- **Win overlay dismissed with Esc leaves a visible 继续游戏 button — why: F5
  requires `win_pending` to survive dismissal and forbids Esc from continuing, so
  the round needs a non-keyboard route back — cost if wrong: one extra control in
  the toolbar while `win_pending`.**
- **Tile palette adjusted (dark text on gold/orange, `#241c16` on 64) — why:
  PRD asks for AA contrast on tile numbers, which the upstream palette fails —
  cost if wrong: the look is slightly less "classic" than upstream.**
- **CSP delivered as a `<meta>` tag without `frame-ancestors` — why: browsers
  ignore `frame-ancestors` in meta and log a console error, which AT-015 forbids;
  the README documents the header form for deployment — cost if wrong: clickjacking
  protection depends on the host sending the header.**
- **`window.__2048` test handle ships in production — why: PRD D-006 requires
  injectable RNG and the E2E suite needs to load known boards — cost if wrong:
  a player can set the board from the console, which is not a security boundary
  for a local single-player game.**
- **Axe and screenshot checks wait for entry animations to finish — why: a
  mid-fade scan/capture grades a translucent frame (false contrast violations,
  washed screenshots) — cost if wrong: the test could hide a real contrast bug
  that only appears while animating, which AA does not require.**
- **The game surface is `inert` while a dialog is open — why: `aria-modal` alone
  leaves the toolbar, board and footer reachable by Tab and by a screen reader;
  `inert` removes them from both without an `aria-hidden` landmark violation —
  cost if wrong: on a browser without `inert` (Safari < 15.5) the background is
  still reachable, so the focus trap alone guards the dialog there.**
- **`#game-surface` wrapper added for that — why: the overlay now lives inside
  `<main>` (axe region rule), so the page cannot inert `<main>` without inerting
  the dialog too — cost if wrong: one extra wrapper element.**

- **Focus restore validates the trigger — why: Esc after a win whose last click
  was plain text otherwise restored focus to `<body>`, which is not a control;
  the fallback is the board — cost if wrong: a player who won from the toolbar
  gets the board focused instead of the button they used.**
- **Backdrop clicks are swallowed and a `focusin` guard pulls focus back into the
  dialog — why: clicking the dimmed area blurred the modal to `<body>` while the
  surface was inert, and Shift+Tab then did nothing — cost if wrong: the guard could
  fight a future focusable element inside the surface; that element would have to be
  outside the modal, which is exactly what must not happen.**
- **The announcer moved out of `#game-surface` — why: it went inert with the surface,
  so win/loss messages were never spoken; the dialog conveyed them, but the live
  region is what AT-016 counts — cost if wrong: one more sibling in `<main>`.**
- **Invalid moves now announce 「无法向X移动」 — why: a blocked move was silent, so a
  screen-reader player could not tell it from a lost keypress — cost if wrong: one
  extra live-region message per blocked keypress (the same text, not stacking).**
- **Merge pops use engine-reported indices only — why: every moved tile was animated
  as a merge, so sliding read as merging (F9 wants the cue for merges) — cost if wrong:
  the merge cue depends on `mergedIndices` staying correct, now covered by unit tests.**
- **Short landscape screens switch to a two-column layout — why: at 667×375 the board
  was 508px tall, the page jumped 170px on boot focus, and the header was off-screen;
  PRD 10.1 puts 横竖屏 in QA scope — cost if wrong: a second layout to maintain, guarded
  by a viewport test and the pixel check.**
- **`setBoard` validates its input — why: the hook ships on `window.__2048` and could
  inject NaN/1.5 scores or non-power-of-two tiles into state and the best score, which
  4.2 forbids — cost if wrong: a console user gets a TypeError instead of a broken game.**
- **A failed best-score read is never written over — why: an asymmetric backend
  (read throws, write works) let `newGame` store "0" over the real best — cost if wrong:
  a transient read failure keeps that session in memory mode.**
- **`createGame` accepts a raw backend as well as an adapter — why: `createGame({storage:
  localStorage})` threw at construction, the white screen AT-012 forbids — cost if wrong:
  a malformed adapter is treated as a raw backend and degrades instead of failing loudly.**
- **Key repeat is deliberately not throttled — why: holding an arrow is a normal way to
  play 2048 and each move is cheap (p75 ≈ 2 ms) — cost if wrong: the polite live region
  queues announcements while a key is held.**

- **The attribution moves into the panel column on short landscape screens — why:
  hiding `.footer` also hid the version and MIT notice that PRD 6 and AT-017
  require on the page — cost if wrong: ~60px of the right column, measured not to
  collide with the toolbar at 667×375 and 640×320.**
- **The board hint stays in the accessibility tree on ≤380px landscape screens —
  why: `display:none` on the target of `aria-describedby="board-help"` silently
  removed the only operating instruction for keyboard players — cost if wrong: a
  clipped 1px node in the DOM.**
- **Space is swallowed only while the board itself has focus — why: on a scrollable
  320px screen Space scrolled the board out of view (219px measured) — cost if wrong:
  a player who wants to scroll with the keyboard must move focus off the board first.**

## Tasks

- Task 1 board engine — `node --test tests/engine.test.mjs` → 17/17 pass
  (merged indices and merge vectors larger than 2 added after review).
  One test expectation of mine was wrong (`[2,0,2,4]` down merges the 2s, not the
  4s); the expectation was corrected, the engine was not.
- Task 2 session + RNG — `node --test tests/session.test.mjs` → 10/10 pass.
  Two test-arithmetic fixes (empty-cell indexing, a "second move" that was valid).
- Task 3 outcome state machine — `node --test tests/outcome.test.mjs` → 12/12 pass.
- Task 4 storage + events — `node --test tests/storage.test.mjs` → 12/12 pass.
- Task 5 page/UI/input/a11y — `node --test tests/ui.e2e.test.mjs` → 16/16 pass.
  Two fixes found by the suite: focus was stolen from a dialog opened by a click,
  and the CSP `frame-ancestors` console error broke AT-015.
- Task 6 release/perf/a11y audit — `node --test tests/a11y-focus.e2e.test.mjs`
  → 10/10 pass (focus, backdrop, announcements, real touch, landscape);
  `node --test tests/acceptance.e2e.test.mjs`
  → 8/8 pass; `tests/layout.e2e.test.mjs` → 9/9 pass; `tests/invariants.test.mjs`
  → 4/4 pass. Pixel check (`tests/visual_check.py`) → 66/66 checks pass.

## Full-run evidence

`node --test "tests/*.test.mjs"` → 112 tests, 112 pass, 0 fail (~20s), twice in a row.
Move-handling latency measured in Edge over 200 moves: p75 ≈ 2–3 ms, worst ≈ 10 ms (budget 100 ms).
axe (wcag2a/2aa/21a/21aa) on load, win dialog and end dialog: 0 serious/critical
violations. The Chromium accessibility tree exposes the named grid, 16 labelled cells,
a polite live region and a modal dialog whose description carries the score, and drops
the board while the dialog is up. Layout audit at 320/390/768/1280: no horizontal scroll,
square board, even cells, 44 px tap target, visible focus ring. The page also boots and
plays from `file://` with no console errors.

## Review outcome

Two independent review passes ran after Task 6 (rule/state/storage; UI/a11y/browser tests).
The rule review reported no rule breaks — it verified `slideLine` over all 625 four-cell
lines and 240k random board/direction pairs against its own oracle — and five hardening
items, all now fixed with tests in `tests/hardening.test.mjs`. The UI review found one
critical focus-restore bug and five important ones (backdrop focus loss, silent blocked
moves, banner spam, landscape overflow, overstated screen-reader claim); the code fixes
are in `script.js`/`styles.css`/`index.html` and their tests in
`tests/a11y-focus.e2e.test.mjs`. Honest note on method: the batch of UI fixes above was
written together with its tests and then run red/green, not strictly test-first as Tasks
1–5 were; the engine hardening items did start from failing tests.
## Review pass (2026-10-20, after the fixes)

A third, independent read of the shipped code (not a re-run of the earlier reviews)
found two real defects and four non-defects; the report with red/green evidence is
`docs/code-review-2026-10-20.md`. Fixed here:

1. Short landscape screens hid the footer (version + MIT attribution) and the hint
   that `aria-describedby` points at - both restored, with the footer moved into the
   panel column and the hint visually hidden.
2. Space scrolled the page out from under a focused board (219px at 320×420) - only
   swallowed while the board has focus.

Left unchanged on purpose: key repeat is not throttled, focus may return to a footer
link that held focus when the winning move was played, the two `role="status"` regions
stay separate, and `window.__2048` stays exposed. Still unverified here: a real
screen-reader walkthrough and Firefox/Safari behaviour.
## Single-file build (2026-10-20)

The user could not open the game from a phone or a second computer: the PC is connected
to the phone's hotspot ("vivo X200 Pro"), so no other device shares that network and the
hotspot does not route inbound connections. Rather than fight the network, the three
source files are now also bundled into one self-contained `2048-standalone.html`
(`tools/build-standalone.mjs`, `npm run build:single`) that any device can open from
local storage. Its CSP is relaxed to inline script/style - a single file cannot use
external sources - and `tests/standalone.e2e.test.mjs` proves it boots under `file://`
with no console errors, opens both dialogs, handles CDP touch swipes, and persists the
best score across a reload.

## v2.0.0 release (2026-10-20)

Version bumped in `VERSION`, `package.json` and the page footer; `2048-standalone.html`
rebuilt and the screenshots regenerated, because the footer text is part of the pixel
target. Positioning, scope, review and verification records live in
`docs/release-v2.0.0.md`.

One test had to change because of the bump: `layout.e2e.test.mjs` hardcoded `/1\.0\.0/`
in the footer assertion and correctly went red. It now reads `VERSION` and asserts the
page shows exactly that string, so a future bump cannot drift silently.

GitHub upload status at the time of writing: blocked on repository creation. `Zz-0005/2048`
does not exist, `gh` has no token, `github.com:443` is unreachable from this machine
(`api.github.com` and SSH are fine), and `git init` is refused under `F:\` - only the harness
workspace accepts `.git`. The staged repository at
`C:\Users\Zz\Documents\deepseek-harness\default-workspace\2048-github` holds the commit
ready to push (`b0122ff`).
