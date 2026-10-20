/* 2048 — engine + UI (static, no build step).
 * Engine layer: pure functions and a session object, no DOM.
 * Loaded by the page and by node tests.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Game2048 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SIZE = 4;
  var DIRECTIONS = ['left', 'right', 'up', 'down'];
  var BEST_KEY = 'bestScore';
  var EVENT_LOG_LIMIT = 500;

  /* PRD 7.2: the only fields an event may carry. */
  var EVENT_FIELDS = {
    game_start: ['source'],
    move: ['direction', 'score', 'maxTile', 'moves'],
    merge: ['mergedValue', 'score'],
    game_win: ['moves', 'durationMs'],
    game_over: ['score', 'maxTile', 'moves', 'durationMs'],
    restart: ['score'],
    storage_error: ['operation', 'key'],
  };

  function emptyBoard() {
    var board = [];
    for (var i = 0; i < SIZE * SIZE; i++) board.push(0);
    return board;
  }

  function boardFromRows(rows) {
    var board = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) board.push((rows[r] && rows[r][c]) || 0);
    }
    return board;
  }

  function rowsOf(board) {
    var rows = [];
    for (var r = 0; r < SIZE; r++) rows.push(board.slice(r * SIZE, r * SIZE + SIZE));
    return rows;
  }

  /* Read from the movement side: compact zeros, merge equal neighbours once,
     pad with zeros. The caller reverses the line for `right`/`down`. */
  function slideLine(line) {
    var out = [];
    var gained = 0;
    var merges = [];
    var mergePositions = [];
    var tiles = line.filter(function (v) { return v !== 0; });

    for (var i = 0; i < tiles.length; i++) {
      if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
        var merged = tiles[i] * 2;
        out.push(merged);
        mergePositions.push(out.length - 1);
        merges.push(merged);
        gained += merged;
        i++;
      } else {
        out.push(tiles[i]);
      }
    }
    while (out.length < SIZE) out.push(0);

    return { line: out, gained: gained, merges: merges, mergePositions: mergePositions };
  }

  function moveBoard(board, direction) {
    var rows = rowsOf(board);
    var next = rows.map(function (row) { return row.slice(); });
    var gained = 0;
    var merges = [];
    var mergedIndices = [];

    function applyTo(line, toBoardIndex) {
      var result = slideLine(line);
      gained += result.gained;
      merges = merges.concat(result.merges);
      for (var k = 0; k < result.mergePositions.length; k++) {
        mergedIndices.push(toBoardIndex(result.mergePositions[k]));
      }
      return result.line;
    }

    if (direction === 'left' || direction === 'right') {
      for (var r = 0; r < SIZE; r++) {
        if (direction === 'right') {
          next[r] = applyTo(next[r].slice().reverse(), function (j) {
            return r * SIZE + (SIZE - 1 - j);
          }).reverse();
        } else {
          next[r] = applyTo(next[r], function (j) { return r * SIZE + j; });
        }
      }
    } else if (direction === 'up' || direction === 'down') {
      for (var c = 0; c < SIZE; c++) {
        var column = next.map(function (row) { return row[c]; });
        if (direction === 'down') column.reverse();
        var slid = applyTo(column, function (j) {
          return direction === 'down' ? (SIZE - 1 - j) * SIZE + c : j * SIZE + c;
        });
        if (direction === 'down') slid.reverse();
        for (var r2 = 0; r2 < SIZE; r2++) next[r2][c] = slid[r2];
      }
    } else {
      return { board: board.slice(), gained: 0, moved: false, merges: [], mergedIndices: [] };
    }

    var resultBoard = boardFromRows(next);
    var moved = false;
    for (var i = 0; i < resultBoard.length; i++) {
      if (resultBoard[i] !== board[i]) { moved = true; break; }
    }

    return { board: resultBoard, gained: gained, moved: moved, merges: merges, mergedIndices: mergedIndices };
  }

  /* A move exists when an empty cell exists or two neighbours are equal. */
  function canMove(board) {
    for (var i = 0; i < board.length; i++) {
      if (board[i] === 0) return true;
      var row = Math.floor(i / SIZE);
      var col = i % SIZE;
      if (col + 1 < SIZE && board[i] === board[i + 1]) return true;
      if (row + 1 < SIZE && board[i] === board[i + SIZE]) return true;
    }
    return false;
  }

  function maxOf(board) {
    var max = 0;
    for (var i = 0; i < board.length; i++) if (board[i] > max) max = board[i];
    return max;
  }

  function isCount(value) {
    return typeof value === 'number' && isFinite(value) && value >= 0 && Math.floor(value) === value;
  }

  /* 0 or a power of two >= 2, as PRD 4.2 requires. */
  function isTileValue(value) {
    if (value === 0) return true;
    if (!isCount(value) || value < 2) return false;
    var log = Math.round(Math.log(value) / Math.LN2);
    return Math.pow(2, log) === value;
  }

  /* In-memory backend used when the page runs without usable localStorage. */
  function memoryBackend(data) {
    var store = data || {};
    return {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      setItem: function (key, value) {
        store[key] = String(value);
      },
    };
  }

  /* bestScore access, all of it inside try/catch (PRD F7). A failing backend
     degrades to memory mode instead of blocking play. */
  function createStorage(backend) {
    var readSucceeded = false;
    var adapter = {
      degraded: false,
      onerror: null,
      readBest: function () {
        try {
          if (!backend) throw new Error('storage unavailable');
          var raw = backend.getItem(BEST_KEY);
          readSucceeded = true;
          if (raw === null || raw === undefined) return 0;
          var text = String(raw).trim();
          if (!/^\d+$/.test(text)) return 0;
          var n = Number(text);
          if (!isFinite(n) || n < 0 || Math.floor(n) !== n || n > Number.MAX_SAFE_INTEGER) return 0;
          return n;
        } catch (error) {
          fail('read');
          return 0;
        }
      },
      writeBest: function (value) {
        /* Writing a guess over a value we could not read would destroy the
           player's real best score - stay in memory mode instead. */
        if (!readSucceeded) return false;
        try {
          if (!backend) throw new Error('storage unavailable');
          backend.setItem(BEST_KEY, String(value));
          return true;
        } catch (error) {
          fail('write');
          return false;
        }
      },
    };

    function fail(operation) {
      adapter.degraded = true;
      if (typeof adapter.onerror === 'function') {
        try {
          adapter.onerror(operation, BEST_KEY);
        } catch (error) {
          /* a listener must never break the game */
        }
      }
    }

    return adapter;
  }

  function createGame(options) {
    options = options || {};
    var rng = options.rng || Math.random;
    var now = options.now || function () { return Date.now(); };
    var listener = typeof options.emit === 'function' ? options.emit : null;
    var storage = options.storage;
    /* Accept either a storage adapter or a raw {getItem, setItem} backend. */
    if (!storage || typeof storage.readBest !== 'function') {
      storage = createStorage(storage || memoryBackend());
    }

    var state = {
      board: emptyBoard(),
      score: 0,
      best: 0,
      moves: 0,
      phase: 'ready',
      maxTile: 0,
      overlay: 'none',
      winSeen: false,
      storageDegraded: false,
      startedAt: 0,
    };

    var events = [];

    function emitEvent(name, payload) {
      var allowed = EVENT_FIELDS[name];
      if (!allowed) return;
      var clean = {};
      for (var i = 0; i < allowed.length; i++) {
        var key = allowed[i];
        if (payload && Object.prototype.hasOwnProperty.call(payload, key)) clean[key] = payload[key];
      }
      events.push({ name: name, payload: clean });
      if (events.length > EVENT_LOG_LIMIT) events.shift();
      if (listener) {
        try {
          listener(name, clean);
        } catch (error) {
          /* PRD 7.2: event failures never block the game */
        }
      }
    }

    function randomTile() {
      var empties = [];
      for (var i = 0; i < state.board.length; i++) if (state.board[i] === 0) empties.push(i);
      if (empties.length === 0) return null;
      var pick = Math.min(empties.length - 1, Math.floor(rng() * empties.length));
      var index = empties[pick];
      var value = rng() < 0.9 ? 2 : 4;
      state.board[index] = value;
      if (value > state.maxTile) state.maxTile = value;
      return { index: index, value: value };
    }

    function reachWin() {
      state.winSeen = true;
      state.phase = 'win_pending';
      state.overlay = 'win';
    }

    function reachGameOver() {
      state.phase = 'game_over';
      state.overlay = 'game_over';
      emitEvent('game_over', {
        score: state.score,
        maxTile: maxOf(state.board),
        moves: state.moves,
        durationMs: Math.max(0, now() - state.startedAt),
      });
    }

    storage.onerror = function (operation, key) {
      state.storageDegraded = true;
      emitEvent('storage_error', { operation: operation, key: key });
    };

    state.best = storage.readBest();
    state.storageDegraded = storage.degraded;

    function game() {}

    game.state = state;
    game.events = events;

    game.newGame = function () {
      state.board = emptyBoard();
      state.score = 0;
      state.moves = 0;
      state.maxTile = 0;
      state.phase = 'playing';
      state.overlay = 'none';
      state.winSeen = false;
      state.startedAt = now();
      randomTile();
      randomTile();
      storage.writeBest(state.best);
      state.storageDegraded = storage.degraded;
      emitEvent('game_start', { source: 'new_game' });
      return state;
    };

    game.move = function (direction) {
      if (DIRECTIONS.indexOf(direction) === -1) {
        return { moved: false, phase: state.phase, gained: 0, merges: [], mergedIndices: [], newTile: null };
      }
      if (state.phase !== 'playing' && state.phase !== 'playing_after_win') {
        return { moved: false, locked: true, phase: state.phase, gained: 0, merges: [], mergedIndices: [], newTile: null };
      }

      /* A board that cannot move at all ends the game even without a move. */
      if (!canMove(state.board)) {
        reachGameOver();
        return {
          moved: false,
          gameOver: true,
          phase: state.phase,
          gained: 0,
          merges: [],
          mergedIndices: [],
          newTile: null,
          score: state.score,
        };
      }

      var result = moveBoard(state.board, direction);
      if (!result.moved) {
        return { moved: false, phase: state.phase, gained: 0, merges: [], mergedIndices: [], newTile: null };
      }

      state.board = result.board;
      state.score += result.gained;
      state.moves += 1;
      var newTile = randomTile();
      if (state.maxTile < maxOf(state.board)) state.maxTile = maxOf(state.board);

      emitEvent('move', {
        direction: direction,
        score: state.score,
        maxTile: state.maxTile,
        moves: state.moves,
      });
      for (var m = 0; m < result.merges.length; m++) {
        emitEvent('merge', { mergedValue: result.merges[m], score: state.score });
      }

      if (state.score > state.best) {
        state.best = state.score;
        storage.writeBest(state.best);
        state.storageDegraded = storage.degraded;
      }

      var won = false;
      if (!state.winSeen && state.maxTile >= 2048) {
        won = true;
        reachWin();
        emitEvent('game_win', { moves: state.moves, durationMs: Math.max(0, now() - state.startedAt) });
      } else if (!canMove(state.board)) {
        reachGameOver();
      }

      return {
        moved: true,
        direction: direction,
        gained: result.gained,
        merges: result.merges,
        mergedIndices: result.mergedIndices,
        newTile: newTile,
        phase: state.phase,
        score: state.score,
        moves: state.moves,
        won: won,
        gameOver: state.phase === 'game_over',
      };
    };

    game.continueAfterWin = function () {
      if (state.phase !== 'win_pending') return false;
      state.overlay = 'none';
      if (!canMove(state.board)) {
        reachGameOver();
      } else {
        state.phase = 'playing_after_win';
      }
      return true;
    };

    /* Esc: hide the overlay only; the phase and the board stay untouched. */
    game.dismissWin = function () {
      if (state.phase !== 'win_pending' || state.overlay !== 'win') return false;
      state.overlay = 'none';
      return true;
    };

    game.restart = function () {
      emitEvent('restart', { score: state.score });
      game.newGame();
      return state;
    };

    /* F7 write strategy: cheap retry on page hide, never blocking. */
    game.persist = function () {
      storage.writeBest(state.best);
      state.storageDegraded = storage.degraded;
      return state.best;
    };

    /* Test / restore hook: load a board (and optionally score, moves, phase).
       It is reachable from the page console, so it refuses values that 4.2
       forbids instead of letting them reach the renderer or the best score. */
    game.setBoard = function (rows, opts) {
      opts = opts || {};
      if (!Array.isArray(rows)) throw new TypeError('setBoard: rows must be an array');

      var board = [];
      for (var r = 0; r < SIZE; r++) {
        var row = rows[r];
        if (row !== undefined && row !== null && !Array.isArray(row)) {
          throw new TypeError('setBoard: row ' + r + ' must be an array');
        }
        for (var c = 0; c < SIZE; c++) {
          var value = row && row[c] !== undefined ? row[c] : 0;
          if (!isTileValue(value)) {
            throw new TypeError('setBoard: ' + String(value) + ' is not a tile value (row ' + r + ', column ' + c + ')');
          }
          board.push(value);
        }
      }

      if (opts.score !== undefined && !isCount(opts.score)) {
        throw new TypeError('setBoard: score must be a non-negative integer');
      }
      if (opts.moves !== undefined && !isCount(opts.moves)) {
        throw new TypeError('setBoard: moves must be a non-negative integer');
      }

      state.board = board;
      state.maxTile = maxOf(state.board);
      state.score = opts.score === undefined ? 0 : opts.score;
      state.moves = opts.moves === undefined ? 0 : opts.moves;
      state.phase = opts.phase || 'playing';
      state.overlay = opts.overlay || 'none';
      state.winSeen = !!opts.winSeen;
      state.startedAt = now();
      return state;
    };

    return game;
  }

  /* ------------------------------------------------------------------ *
   * UI layer (DOM only; the engine above never touches these nodes)     *
   * ------------------------------------------------------------------ */

  var STRINGS = {
    winTitle: '你赢了',
    overTitle: '游戏结束',
    continue: '继续游戏',
    restart: '重新开始',
    winDetail: function (score) { return '当前分数 ' + score; },
    overDetail: function (score, best) { return '最终分数 ' + score + ' · 最高分 ' + best; },
    storageWarn: '存储不可用：最高分仅在本次打开期间保留。',
    newGame: '新局开始',
    moveLabel: { left: '左', right: '右', up: '上', down: '下' },
    dismissed: '已关闭胜利提示，点击“继续游戏”继续',
  };

  var KEY_TO_DIRECTION = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    a: 'left',
    d: 'right',
    w: 'up',
    s: 'down',
    A: 'left',
    D: 'right',
    W: 'up',
    S: 'down',
  };

  /* Keys that scroll the page; the game swallows them while a dialog is up. */
  var SCROLL_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'];

  function mount(doc) {
    var win = doc.defaultView || window;
    var boardEl = doc.getElementById('board');
    if (!boardEl) return null;

    var scoreEl = doc.getElementById('score');
    var bestEl = doc.getElementById('best');
    var newGameEl = doc.getElementById('new-game');
    var resumeEl = doc.getElementById('resume-win');
    var statusEl = doc.getElementById('storage-status');
    var overlayEl = doc.getElementById('overlay');
    var titleEl = doc.getElementById('overlay-title');
    var detailEl = doc.getElementById('overlay-detail');
    var primaryEl = doc.getElementById('overlay-primary');
    var secondaryEl = doc.getElementById('overlay-secondary');
    var announcerEl = doc.getElementById('announcer');
    var surfaceEl = doc.getElementById('game-surface');

    var cells = [];
    for (var c = 0; c < SIZE * SIZE; c++) cells.push(doc.querySelector('[data-index="' + c + '"]'));

    var storage = createStorage(safeBackend(win));
    var game = createGame({ storage: storage });
    var overlayKind = null;
    var lastFocused = null;
    var touchStart = null;

    function safeBackend(view) {
      try {
        var backend = view.localStorage;
        var probe = '__2048_probe__';
        backend.setItem(probe, '1');
        backend.removeItem(probe);
        return backend;
      } catch (error) {
        return null;
      }
    }

    function announce(message) {
      if (!announcerEl) return;
      announcerEl.textContent = message;
    }

    function cellLabel(index, value) {
      var row = Math.floor(index / SIZE) + 1;
      var col = (index % SIZE) + 1;
      return '第 ' + row + ' 行第 ' + col + ' 列，' + (value ? value : '空');
    }

    function animate(tile, className) {
      tile.classList.remove('is-new', 'is-merged');
      void tile.offsetWidth;
      tile.classList.add(className);
    }

    function renderCells(animation) {
      var board = game.state.board;
      for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        if (!cell) continue;
        var value = board[i];
        var tile = cell.firstElementChild;

        if (value === 0) {
          if (tile) cell.removeChild(tile);
          cell.setAttribute('aria-label', cellLabel(i, 0));
          cell.removeAttribute('data-value');
          continue;
        }

        if (!tile) {
          tile = doc.createElement('span');
          tile.className = 'tile';
          cell.appendChild(tile);
        }
        var text = String(value);
        if (tile.textContent !== text) tile.textContent = text;
        if (tile.dataset.value !== text) tile.dataset.value = text;
        if (tile.dataset.len !== String(text.length)) tile.dataset.len = String(text.length);
        cell.setAttribute('aria-label', cellLabel(i, value));

        if (animation && animation.moved) {
          if (animation.newTile && animation.newTile.index === i) animate(tile, 'is-new');
          else if (animation.mergedIndices && animation.mergedIndices.indexOf(i) !== -1) animate(tile, 'is-merged');
        }
      }
    }

    function renderScore(animation) {
      scoreEl.textContent = String(game.state.score);
      bestEl.textContent = String(game.state.best);
      if (animation && animation.moved && animation.gained > 0) {
        scoreEl.classList.remove('is-bumped');
        void scoreEl.offsetWidth;
        scoreEl.classList.add('is-bumped');
      }
    }

    function setOverlayContent(kind) {
      var state = game.state;
      overlayEl.classList.toggle('overlay--win', kind === 'win');
      titleEl.textContent = kind === 'win' ? STRINGS.winTitle : STRINGS.overTitle;
      detailEl.textContent = kind === 'win'
        ? STRINGS.winDetail(state.score)
        : STRINGS.overDetail(state.score, state.best);
      primaryEl.textContent = kind === 'win' ? STRINGS.continue : STRINGS.restart;
      secondaryEl.textContent = STRINGS.restart;
      secondaryEl.hidden = kind !== 'win';
    }

    /* Focus without dragging a short viewport around (landscape phones). */
    function focusEl(el) {
      if (!el || typeof el.focus !== 'function') return;
      try {
        el.focus({ preventScroll: true });
      } catch (error) {
        el.focus();
      }
    }

    /* Remember the control that opened the dialog; the dialog and <body> are
       never meaningful targets to return to. */
    function rememberTrigger() {
      var active = doc.activeElement;
      if (!active || active === doc.body || active === doc.documentElement) return;
      if (overlayEl.contains(active)) return;
      lastFocused = active;
    }

    function focusableOrBoard(el) {
      if (!el || el === doc.body || el === doc.documentElement) return boardEl;
      if (!doc.contains(el)) return boardEl;
      if (el.getClientRects().length === 0) return boardEl;
      return el;
    }

    function openOverlay(kind) {
      overlayKind = kind;
      rememberTrigger();
      setOverlayContent(kind);
      overlayEl.hidden = false;
      // The dialog is modal: take the rest of the page out of the focus order
      // and the accessibility tree while it is up.
      if (surfaceEl) surfaceEl.inert = true;
      focusEl(primaryEl);
    }

    function closeOverlay(restoreFocus) {
      overlayEl.hidden = true;
      overlayKind = null;
      if (surfaceEl) surfaceEl.inert = false;
      if (restoreFocus === false) return;
      focusEl(focusableOrBoard(lastFocused));
    }

    function syncOverlay() {
      var state = game.state;
      var kind = null;
      if (state.phase === 'win_pending' && state.overlay === 'win') kind = 'win';
      else if (state.phase === 'game_over' && state.overlay === 'game_over') kind = 'game_over';

      resumeEl.hidden = !(state.phase === 'win_pending' && state.overlay !== 'win');

      if (!kind) {
        if (overlayKind) closeOverlay(true);
        return;
      }
      if (overlayKind === kind) {
        setOverlayContent(kind);
        return;
      }
      openOverlay(kind);
    }

    function render(animation) {
      renderScore(animation);
      renderCells(animation);
      statusEl.hidden = !game.state.storageDegraded;
      if (game.state.storageDegraded && statusEl.textContent !== STRINGS.storageWarn) {
        statusEl.textContent = STRINGS.storageWarn;
      }
      syncOverlay();
    }

    function moveMessage(direction, result) {
      var label = STRINGS.moveLabel[direction];
      if (result.won) return '第 ' + result.moves + ' 步：你赢了，当前分数 ' + result.score;
      if (result.gameOver) return '第 ' + result.moves + ' 步：游戏结束，最终分数 ' + result.score;
      if (result.merges && result.merges.length) {
        return '第 ' + result.moves + ' 步：向' + label + '移动，合并 ' + result.merges.join('、') + '，当前分数 ' + result.score;
      }
      return '第 ' + result.moves + ' 步：向' + label + '移动，当前分数 ' + result.score;
    }

    function applyMove(direction) {
      var result = game.move(direction);
      if (result.moved) {
        render({ moved: true, newTile: result.newTile, gained: result.gained, mergedIndices: result.mergedIndices });
        announce(moveMessage(direction, result));
      } else if (result.gameOver) {
        render({ moved: false });
        announce(STRINGS.overTitle + '，最终分数 ' + game.state.score);
      } else if (result.locked) {
        /* the open dialog, or the resume button, is what the player needs next */
        if (!overlayKind) announce('已暂停，请点击“继续游戏”');
      } else {
        announce('无法向' + STRINGS.moveLabel[direction] + '移动');
      }
      return result;
    }

    function startGame(announcement) {
      game.newGame();
      render({ moved: false });
      announce(announcement || STRINGS.newGame);
      focusEl(boardEl);
    }

    /* ---------- input ---------- */

    doc.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if (overlayKind === 'win') {
          event.preventDefault();
          game.dismissWin();
          syncOverlay();
          announce(STRINGS.dismissed);
        }
        return;
      }
      if (overlayKind) {
        /* Tab is handled on the dialog itself, and the dialog is modal, so
           navigation keys must not scroll the page behind it. */
        if (event.key !== 'Tab' && SCROLL_KEYS.indexOf(event.key) !== -1) event.preventDefault();
        return;
      }
      var direction = KEY_TO_DIRECTION[event.key];
      if (!direction) {
        /* Space on the focused board would scroll the page out from under the
           player (small screens); the board itself never scrolls on Space. */
        if (event.key === ' ' && doc.activeElement === boardEl) event.preventDefault();
        return;
      }
      event.preventDefault();
      applyMove(direction);
    });

    boardEl.addEventListener('touchstart', function (event) {
      if (event.touches.length !== 1) {
        touchStart = null;
        return;
      }
      var touch = event.touches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
    }, { passive: true });

    boardEl.addEventListener('touchmove', function (event) {
      if (touchStart && event.cancelable) event.preventDefault();
    }, { passive: false });

    boardEl.addEventListener('touchend', function (event) {
      var start = touchStart;
      touchStart = null;
      if (!start) return;
      if (event.touches && event.touches.length > 0) return;
      var touch = event.changedTouches && event.changedTouches[0];
      if (!touch) return;

      var dx = touch.clientX - start.x;
      var dy = touch.clientY - start.y;
      var ax = Math.abs(dx);
      var ay = Math.abs(dy);
      var major = Math.max(ax, ay);
      var minor = Math.min(ax, ay);
      if (major < 24) return;
      if (minor !== 0 && major / minor < 1.5) return;

      var direction = major === ax
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down' : 'up');
      applyMove(direction);
    }, { passive: true });

    boardEl.addEventListener('touchcancel', function () {
      touchStart = null;
    });

    boardEl.addEventListener('click', function () {
      focusEl(boardEl);
    });

    /* Keep Tab inside the open dialog. */
    overlayEl.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return;
      var focusables = [primaryEl, secondaryEl].filter(function (el) {
        return el && !el.hidden && el.offsetParent !== null;
      });
      if (focusables.length === 0) return;
      var index = focusables.indexOf(doc.activeElement);
      event.preventDefault();
      var next = event.shiftKey
        ? focusables[(index - 1 + focusables.length) % focusables.length]
        : focusables[(index + 1) % focusables.length];
      focusEl(next);
    });

    /* A click on the dimmed backdrop must not drop focus out of the modal. */
    overlayEl.addEventListener('mousedown', function (event) {
      if (event.target === overlayEl) event.preventDefault();
    });

    /* Safety net: whatever happens to focus while the dialog is up, it belongs
       inside the dialog (backdrop clicks, browser quirks, pointer on the page). */
    doc.addEventListener('focusin', function (event) {
      if (!overlayKind) return;
      if (overlayEl.contains(event.target)) return;
      focusEl(primaryEl);
    });

    newGameEl.addEventListener('click', function () {
      startGame(STRINGS.newGame);
    });

    /* Only move focus to the board when no dialog is open. */
    function focusBoardIfIdle() {
      if (!overlayKind) focusEl(boardEl);
    }

    resumeEl.addEventListener('click', function () {
      if (!game.continueAfterWin()) return;
      render({ moved: false });
      focusBoardIfIdle();
      announce('继续游戏，当前分数 ' + game.state.score);
    });

    primaryEl.addEventListener('click', function () {
      if (overlayKind === 'win') {
        game.continueAfterWin();
        render({ moved: false });
        announce('继续游戏，当前分数 ' + game.state.score);
        focusBoardIfIdle();
      } else {
        game.restart();
        render({ moved: false });
        announce(STRINGS.newGame);
        focusBoardIfIdle();
      }
    });

    secondaryEl.addEventListener('click', function () {
      game.restart();
      render({ moved: false });
      announce(STRINGS.newGame);
      focusBoardIfIdle();
    });

    doc.addEventListener('visibilitychange', function () {
      if (doc.visibilityState === 'hidden') game.persist();
    });

    /* ---------- boot ---------- */

    startGame(STRINGS.newGame);

    var handle = {
      game: game,
      state: function () { return game.state; },
      events: game.events,
      setBoard: function (rows, opts) {
        game.setBoard(rows, opts);
        render({ moved: false });
        return game.state;
      },
      press: function (direction) { return applyMove(direction); },
      overlayKind: function () { return overlayKind; },
    };
    win.__2048 = handle;
    return handle;
  }

  var api = {
    SIZE: SIZE,
    DIRECTIONS: DIRECTIONS,
    EVENT_FIELDS: EVENT_FIELDS,
    STRINGS: STRINGS,
    emptyBoard: emptyBoard,
    boardFromRows: boardFromRows,
    rowsOf: rowsOf,
    slideLine: slideLine,
    moveBoard: moveBoard,
    canMove: canMove,
    createStorage: createStorage,
    memoryBackend: memoryBackend,
    createGame: createGame,
    mount: mount,
  };

  return api;
});

/* Boot the page only when a document exists (node tests import the module). */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var start = function () { window.Game2048.mount(document); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
