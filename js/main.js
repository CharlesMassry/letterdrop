/* Letterdrop UI — classic script (depends on words.js + game.js) */
(function () {
  'use strict';

  var G = window.Letterdrop;
  var app = document.getElementById('app');
  if (!app || !G) {
    document.body.innerHTML =
      '<p style="font-family:sans-serif;padding:2rem;color:#c8ebe0;background:#061a16">Letterdrop failed to load. Open <code>index.html</code> from this folder (all of <code>js/</code> and <code>css/</code> must sit beside it).</p>';
    return;
  }

  var state = G.createInitialState();
  var lastTs = 0;
  var dropAccum = 0;
  var feedbackClearTimer = null;
  var needsRender = true;
  var lastRenderedPhase = state.phase;
  var clearAnimTimer = null;
  var clearAnimToken = 0;
  var settleAnimTimer = null;
  var settleAnimToken = 0;
  /** Freeze full-board HTML rebuilds while clear/settle CSS runs. */
  var boardMotionLock = null;
  /** @type {null|{startVisual:number,endRow:number,startTs:number,durationMs:number}} */
  var hardDropAnim = null;
  var settleMotionStarted = false;
  var forceBoardRebuild = false;
  /** Classic Tetris soft-drop interval while ↓ is held. */
  var SOFT_DROP_MS = 42;
  var softDropHeld = false;

  function cancelAnimTimers() {
    clearAnimToken += 1;
    settleAnimToken += 1;
    if (clearAnimTimer !== null) {
      window.clearTimeout(clearAnimTimer);
      clearAnimTimer = null;
    }
    if (settleAnimTimer !== null) {
      window.clearTimeout(settleAnimTimer);
      settleAnimTimer = null;
    }
    hardDropAnim = null;
    boardMotionLock = null;
    settleMotionStarted = false;
    softDropHeld = false;
  }

  function fallInterval() {
    return softDropHeld ? SOFT_DROP_MS : state.dropIntervalMs || 1;
  }

  /** Keep fractional fall progress continuous when switching soft-drop on/off. */
  function setSoftDrop(held) {
    held = !!held;
    if (held === softDropHeld) return;
    var prev = fallInterval();
    softDropHeld = held;
    var next = fallInterval();
    if (prev > 0) dropAccum = dropAccum * (next / prev);
  }

  function scheduleClearAnimation() {
    if (!state.clearing || clearAnimTimer !== null) return;
    boardMotionLock = 'clearing';
    var token = ++clearAnimToken;
    clearAnimTimer = window.setTimeout(function () {
      if (token !== clearAnimToken) return;
      clearAnimTimer = null;
      if (!state.clearing) return;
      G.finishClearing(state);
      scheduleFeedbackClear();
      settleMotionStarted = false;
      // In-place patch — do NOT rebuild the whole board (that made every tile pop/settle).
      patchHudChrome();
      patchBoardAfterClear();
    }, G.CLEAR_ANIM_MS);
  }

  function scheduleSettleAnimation() {
    if (!state.settling || settleAnimTimer !== null) return;
    boardMotionLock = 'settling';
    var token = ++settleAnimToken;
    var ms = state.settling.durationMs || 280;
    settleAnimTimer = window.setTimeout(function () {
      if (token !== settleAnimToken) return;
      settleAnimTimer = null;
      if (!state.settling) return;
      G.finishSettling(state);
      settleMotionStarted = false;
      patchHudChrome();
      patchBoardAfterSettle();
    }, ms);
  }

  /** @param {boolean=} forceBoard rebuild board even during motion lock (phase change) */
  function markDirty(forceBoard) {
    needsRender = true;
    if (forceBoard) forceBoardRebuild = true;
    if (state.clearing) scheduleClearAnimation();
    if (state.settling) scheduleSettleAnimation();
  }

  function dropFrac() {
    if (!state.active || hardDropAnim || state.clearing || state.settling) return 0;
    if (!G.canMoveDown(state)) return 0;
    var interval = fallInterval();
    var f = dropAccum / interval;
    if (f < 0) return 0;
    if (f > 0.999) return 0.999;
    return f;
  }

  function visualActiveRow() {
    if (!state.active) return 0;
    var v;
    if (hardDropAnim) {
      var t = (performance.now() - hardDropAnim.startTs) / hardDropAnim.durationMs;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      var eased = 1 - Math.pow(1 - t, 3);
      v =
        hardDropAnim.startVisual +
        (hardDropAnim.endRow - hardDropAnim.startVisual) * eased;
    } else {
      v = state.active.row + dropFrac();
    }
    // Clamp so the lowest cell of the piece never paints past the bottom row.
    var maxDr = 0;
    for (var i = 0; i < state.active.cells.length; i++) {
      if (state.active.cells[i].dr > maxDr) maxDr = state.active.cells[i].dr;
    }
    var maxOrigin = G.ROWS - 1 - maxDr;
    if (v > maxOrigin) v = maxOrigin;
    if (v < -4) v = -4;
    return v;
  }

  function tileInner(letter) {
    return (
      '<span class="cell-letter">' +
      letter +
      '</span><span class="cell-val">' +
      G.letterValue(letter) +
      '</span>'
    );
  }

  /**
   * Place a motion tile on the same track math as the CSS grid (--tile-w/h, --step-*).
   * Row may be fractional for smooth fall. Clamped so the tile face stays in-stage.
   */
  function placeMotionTile(el, row, col) {
    if (row > G.ROWS - 1) row = G.ROWS - 1;
    if (row < -4) row = -4;
    if (col < 0) col = 0;
    if (col > G.COLS - 1) col = G.COLS - 1;
    el.style.setProperty('--r', String(row));
    el.style.setProperty('--c', String(col));
  }

  function syncActiveMotion() {
    var layer = app.querySelector('[data-motion="active"]');
    if (!layer) return;
    if (!state.active || state.clearing || state.settling) {
      if (layer.childNodes.length) layer.innerHTML = '';
      return;
    }
    var cells = G.absoluteCells(state.active);
    var vRow = visualActiveRow();
    var baseRow = state.active.row;
    var i;

    if (layer.childNodes.length !== cells.length) {
      var html = '';
      for (i = 0; i < cells.length; i++) {
        html +=
          '<div class="motion-tile motion-active" data-motion-i="' +
          i +
          '">' +
          tileInner(cells[i].letter) +
          '</div>';
      }
      layer.innerHTML = html;
    } else {
      for (i = 0; i < cells.length; i++) {
        var node = layer.childNodes[i];
        var letterEl = node.querySelector('.cell-letter');
        var valEl = node.querySelector('.cell-val');
        if (letterEl && letterEl.textContent !== cells[i].letter) {
          letterEl.textContent = cells[i].letter;
          if (valEl) valEl.textContent = String(G.letterValue(cells[i].letter));
        }
      }
    }

    for (i = 0; i < cells.length; i++) {
      var fracRow = vRow + (cells[i].row - baseRow);
      placeMotionTile(layer.childNodes[i], fracRow, cells[i].col);
    }
  }

  function startSettleMotion() {
    if (settleMotionStarted || !state.settling) return;
    var layer = app.querySelector('[data-motion="settle"]');
    if (!layer) return;
    settleMotionStarted = true;
    var moves = state.settling.moves;
    var html = '';
    var i;
    for (i = 0; i < moves.length; i++) {
      html +=
        '<div class="motion-tile motion-settle" data-settle-i="' +
        i +
        '">' +
        tileInner(moves[i].letter) +
        '</div>';
    }
    layer.innerHTML = html;

    // Park each tile at its destination track, then pull it up with transform
    // so the ease lands exactly on the grid cell (no pixel-metric drift).
    for (i = 0; i < moves.length; i++) {
      var el = layer.childNodes[i];
      var dy = moves[i].fromRow - moves[i].toRow;
      el.style.transition = 'none';
      placeMotionTile(el, moves[i].toRow, moves[i].col);
      el.style.transform =
        'translateY(calc(' + dy + ' * (var(--tile-h) + var(--board-gap))))';
    }

    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (!state.settling || !layer) return;
        for (var j = 0; j < moves.length; j++) {
          var tile = layer.childNodes[j];
          if (!tile) continue;
          var ms = moves[j].durationMs || state.settling.durationMs || 400;
          tile.style.transition =
            'transform ' + ms + 'ms var(--settle-ease, cubic-bezier(0.22, 1, 0.36, 1))';
          tile.style.transform = 'translateY(0)';
        }
      });
    });
  }

  function brandSpans(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      out += '<span>' + (ch === ' ' ? '&nbsp;' : ch) + '</span>';
    }
    return out;
  }

  function renderTitle() {
    return (
      '<div class="atmosphere" aria-hidden="true"></div>' +
      '<main class="screen title-screen">' +
      '<h1 class="brand" aria-label="Letterdrop">' +
      brandSpans('Letterdrop') +
      '</h1>' +
      '<p class="tagline">Falling letter blocks. Rising words. Stack until the board fills — spell your way up.</p>' +
      '<ul class="howto">' +
      '<li><strong>← → ↓</strong> move · <strong>↑ / X</strong> rotate · <strong>Space</strong> hard drop</li>' +
      '<li><strong>Line up</strong> a dictionary word in a row or column — it scores when the piece lands</li>' +
      '<li>Seven tetromino shapes — each cell carries a letter</li>' +
      '</ul>' +
      '<div class="title-actions">' +
      '<button type="button" class="btn" data-action="start">Play</button>' +
      '</div>' +
      '</main>'
    );
  }

  function renderEnd() {
    return (
      '<div class="atmosphere" aria-hidden="true"></div>' +
      '<main class="screen end-screen">' +
      '<p class="end-brand">Letterdrop</p>' +
      '<h1>Stacked out</h1>' +
      '<p class="end-score">' +
      state.score +
      '</p>' +
      '<p class="end-meta">' +
      'Board full — no room to drop. · ' +
      state.wordsFound +
      ' word' +
      (state.wordsFound === 1 ? '' : 's') +
      '</p>' +
      (state.foundWords && state.foundWords.length
        ? '<ul class="found-words end-found" aria-label="Words found this round">' +
          state.foundWords
            .map(function (w) {
              return (
                '<li><span class="fw-word">' +
                w.word +
                '</span><span class="fw-pts">' +
                w.points +
                '</span></li>'
              );
            })
            .join('') +
          '</ul>'
        : '') +
      '<div class="end-actions">' +
      '<button type="button" class="btn" data-action="start">Play again</button>' +
      '<button type="button" class="btn btn-ghost" data-action="title">Title</button>' +
      '</div>' +
      '</main>'
    );
  }

  function shardMarkup() {
    return (
      '<span class="shards" aria-hidden="true">' +
      '<i></i><i></i><i></i><i></i><i></i><i></i>' +
      '</span>'
    );
  }

  function settleDestKeys() {
    var keys = {};
    if (!state.settling) return keys;
    for (var i = 0; i < state.settling.moves.length; i++) {
      var m = state.settling.moves[i];
      keys[m.toRow + ',' + m.col] = true;
    }
    return keys;
  }

  function gridCellAt(row, col) {
    var grid = app.querySelector('.board-grid');
    if (!grid) return null;
    return grid.children[row * G.COLS + col] || null;
  }

  function emptyGridCell(el) {
    if (!el) return;
    el.className = 'cell';
    el.innerHTML = '';
    el.setAttribute('aria-label', 'Empty');
  }

  function fillGridCell(el, letter) {
    if (!el || !letter) return;
    var current = el.querySelector('.cell-letter');
    if (
      el.classList.contains('filled') &&
      !el.classList.contains('disintegrating') &&
      current &&
      current.textContent === letter
    ) {
      return; // already correct — leave the node alone
    }
    el.className = 'cell filled';
    el.innerHTML = tileInner(letter);
    el.setAttribute(
      'aria-label',
      'Letter ' + letter + ', ' + G.letterValue(letter) + ' points'
    );
  }

  function paintClearingCells() {
    if (!state.clearing) return;
    var cells = state.clearing.cells;
    for (var i = 0; i < cells.length; i++) {
      var el = gridCellAt(cells[i].row, cells[i].col);
      if (!el) continue;
      var letter = cells[i].letter;
      el.className = 'cell filled disintegrating';
      el.innerHTML = tileInner(letter) + shardMarkup();
      el.setAttribute(
        'aria-label',
        'Letter ' + letter + ', ' + G.letterValue(letter) + ' points'
      );
    }
  }

  /**
   * After gravity: only vacate cleared cells and tiles that actually fell.
   * Resting tiles keep their existing DOM nodes (no settle animation, no rebuild).
   */
  function patchBoardAfterClear() {
    var grid = app.querySelector('.board-grid');
    if (!grid || grid.children.length !== G.ROWS * G.COLS) {
      markDirty(true);
      return;
    }

    var moveFrom = {};
    var moveTo = {};
    var moves = state.settling ? state.settling.moves : [];
    var i;
    for (i = 0; i < moves.length; i++) {
      moveFrom[moves[i].fromRow + ',' + moves[i].col] = true;
      moveTo[moves[i].toRow + ',' + moves[i].col] = true;
    }

    var r, c, key, el, letter;
    for (r = 0; r < G.ROWS; r++) {
      for (c = 0; c < G.COLS; c++) {
        key = r + ',' + c;
        el = grid.children[r * G.COLS + c];
        letter = state.board[r][c];
        if (moveTo[key] || moveFrom[key]) {
          emptyGridCell(el);
          continue;
        }
        if (!letter) {
          emptyGridCell(el);
          continue;
        }
        // Unaffected resting tile — keep the live DOM node.
        fillGridCell(el, letter);
      }
    }

    var settleLayer = app.querySelector('[data-motion="settle"]');
    if (settleLayer) settleLayer.innerHTML = '';
    var activeLayer = app.querySelector('[data-motion="active"]');
    if (activeLayer) activeLayer.innerHTML = '';

    if (state.settling && moves.length) {
      boardMotionLock = 'settling';
      settleMotionStarted = false;
      startSettleMotion();
      scheduleSettleAnimation();
    } else if (state.clearing) {
      boardMotionLock = 'clearing';
      paintClearingCells();
      scheduleClearAnimation();
    } else {
      boardMotionLock = null;
      syncActiveMotion();
    }
  }

  /** After cascade: land only the tiles that fell; leave everyone else untouched. */
  function patchBoardAfterSettle() {
    var grid = app.querySelector('.board-grid');
    if (!grid || grid.children.length !== G.ROWS * G.COLS) {
      markDirty(true);
      return;
    }

    var settleLayer = app.querySelector('[data-motion="settle"]');
    if (settleLayer) settleLayer.innerHTML = '';

    // finishSettling already cleared state.settling — land letters from the board.
    var r, c, el, letter;
    for (r = 0; r < G.ROWS; r++) {
      for (c = 0; c < G.COLS; c++) {
        el = grid.children[r * G.COLS + c];
        letter = state.board[r][c];
        if (!letter) {
          if (el.classList.contains('filled') || el.classList.contains('disintegrating')) {
            emptyGridCell(el);
          }
          continue;
        }
        fillGridCell(el, letter);
      }
    }

    if (state.clearing) {
      boardMotionLock = 'clearing';
      paintClearingCells();
      scheduleClearAnimation();
    } else if (state.settling) {
      boardMotionLock = 'settling';
      settleMotionStarted = false;
      startSettleMotion();
      scheduleSettleAnimation();
    } else {
      boardMotionLock = null;
      syncActiveMotion();
    }
  }

  function renderBoard() {
    var clearing = G.clearingKeySet(state);
    var hideSettling = settleDestKeys();
    var cells = [];
    for (var r = 0; r < G.ROWS; r++) {
      for (var c = 0; c < G.COLS; c++) {
        var key = r + ',' + c;
        var clearingLetter = clearing[key];
        var boarded =
          clearingLetter ||
          (hideSettling[key] ? null : state.board[r][c]);
        var letter = clearingLetter || boarded || '';
        var classes = ['cell'];
        if (clearingLetter) classes.push('filled', 'disintegrating');
        else if (boarded) classes.push('filled');
        var val =
          letter
            ? '<span class="cell-val">' + G.letterValue(letter) + '</span>'
            : '';
        cells.push(
          '<div class="' +
            classes.join(' ') +
            '" role="gridcell" aria-label="' +
            (letter ? 'Letter ' + letter + ', ' + G.letterValue(letter) + ' points' : 'Empty') +
            '">' +
            (letter ? '<span class="cell-letter">' + letter + '</span>' : '') +
            val +
            (clearingLetter ? shardMarkup() : '') +
            '</div>',
        );
      }
    }
    return (
      '<div class="board" role="grid" aria-label="Letter board">' +
      '<div class="board-stage">' +
      '<div class="board-playfield">' +
      '<div class="board-grid">' +
      cells.join('') +
      '</div>' +
      '<div class="board-motion" data-motion="settle" aria-hidden="true"></div>' +
      '<div class="board-motion" data-motion="active" aria-hidden="true"></div>' +
      '</div>' +
      '<div class="board-floor" aria-hidden="true"></div>' +
      '</div></div>'
    );
  }

  function renderFoundWords() {
    var list = state.foundWords || [];
    if (!list.length) {
      return (
        '<div class="found-words empty" data-hud="found" aria-live="polite">' +
        '<span class="found-label">Words</span>' +
        '<span class="found-empty">None yet</span>' +
        '</div>'
      );
    }
    var items = '';
    for (var i = 0; i < list.length; i++) {
      items +=
        '<li><span class="fw-word">' +
        list[i].word +
        '</span><span class="fw-pts">' +
        list[i].points +
        '</span></li>';
    }
    return (
      '<div class="found-words" data-hud="found" aria-live="polite">' +
      '<span class="found-label">Words</span>' +
      '<ul>' +
      items +
      '</ul>' +
      '</div>'
    );
  }

  function renderPlay() {
    var fbClass = 'feedback';
    if (state.feedbackKind === 'ok') fbClass += ' ok';
    if (state.feedbackKind === 'error') fbClass += ' error';

    return (
      '<div class="atmosphere" aria-hidden="true"></div>' +
      '<main class="screen play-screen">' +
      '<div class="hud">' +
      '<div class="hud-stat"><span class="label">Score</span><span class="value" data-hud="score">' +
      state.score +
      '</span></div>' +
      '<div class="hud-stat"><span class="label">Words</span><span class="value" data-hud="words">' +
      state.wordsFound +
      '</span></div>' +
      '</div>' +
      '<div class="board-wrap">' +
      renderBoard() +
      '</div>' +
      '<div class="word-bar">' +
      '<p class="play-hint" data-hud="hint">Line up a word in a row or column to score</p>' +
      '<div class="' +
      fbClass +
      '" aria-live="assertive" data-hud="feedback">' +
      (state.feedback || '') +
      '</div>' +
      renderFoundWords() +
      '</div>' +
      '<div class="touch-pad" aria-label="Move controls">' +
      '<button type="button" class="btn" data-action="rotate">↻</button>' +
      '<button type="button" class="btn" data-action="hard">↓↓</button>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn" data-action="left">←</button>' +
      '<button type="button" class="btn" data-action="down">↓</button>' +
      '<button type="button" class="btn" data-action="right">→</button>' +
      '</div>' +
      '<p class="hint-keys">Arrows move · ↑ rotate · Space drop · line up words to score</p>' +
      '</main>'
    );
  }

  function patchHudChrome() {
    var scoreEl = app.querySelector('[data-hud="score"]');
    if (scoreEl) scoreEl.textContent = String(state.score);
    var wordsEl = app.querySelector('[data-hud="words"]');
    if (wordsEl) wordsEl.textContent = String(state.wordsFound);
    var fb = app.querySelector('[data-hud="feedback"]');
    if (fb) {
      fb.textContent = state.feedback || '';
      fb.className = 'feedback';
      if (state.feedbackKind === 'ok') fb.className += ' ok';
      if (state.feedbackKind === 'error') fb.className += ' error';
    }
    var foundHost = app.querySelector('[data-hud="found"]');
    if (foundHost) {
      var wrap = document.createElement('div');
      wrap.innerHTML = renderFoundWords();
      foundHost.replaceWith(wrap.firstChild);
    }
  }

  function render() {
    if (state.phase === 'title') {
      app.innerHTML = renderTitle();
      boardMotionLock = null;
      forceBoardRebuild = false;
    } else if (state.phase === 'ended') {
      app.innerHTML = renderEnd();
      boardMotionLock = null;
      forceBoardRebuild = false;
    } else if (
      lastRenderedPhase === 'playing' &&
      boardMotionLock &&
      !forceBoardRebuild
    ) {
      // Mid clear/settle: patch HUD only — never thrash the board DOM.
      patchHudChrome();
    } else {
      forceBoardRebuild = false;
      app.innerHTML = renderPlay();
      settleMotionStarted = false;
      if (state.settling) {
        boardMotionLock = 'settling';
        startSettleMotion();
      } else if (state.clearing) {
        boardMotionLock = 'clearing';
      } else {
        boardMotionLock = null;
      }
      syncActiveMotion();
    }
    lastRenderedPhase = state.phase;
    needsRender = false;
  }

  function scheduleFeedbackClear() {
    if (feedbackClearTimer !== null) window.clearTimeout(feedbackClearTimer);
    if (state.feedbackKind === 'ok' || state.feedbackKind === 'error') {
      feedbackClearTimer = window.setTimeout(function () {
        if (state.phase === 'playing' && state.feedbackKind !== 'info') {
          state.feedback = null;
          state.feedbackKind = null;
          // HUD-only — do not rebuild board / restart settle.
          if (boardMotionLock) patchHudChrome();
          else markDirty();
        }
      }, 2200);
    }
  }

  function beginHardDrop() {
    if (
      state.phase !== 'playing' ||
      !state.active ||
      state.clearing ||
      state.settling ||
      hardDropAnim
    ) {
      return;
    }
    var startVisual = visualActiveRow();
    var endRow = G.landingRow(state);
    var dist = Math.max(0, endRow - startVisual);
    if (dist < 0.05) {
      dropAccum = 0;
      G.lockAtRow(state, endRow);
      markDirty(true);
      return;
    }
    hardDropAnim = {
      startVisual: startVisual,
      endRow: endRow,
      startTs: performance.now(),
      durationMs: Math.min(320, 70 + dist * 32),
    };
  }

  function finishHardDropIfDue(ts) {
    if (!hardDropAnim) return false;
    if (ts - hardDropAnim.startTs < hardDropAnim.durationMs) return false;
    var endRow = hardDropAnim.endRow;
    hardDropAnim = null;
    dropAccum = 0;
    G.lockAtRow(state, endRow);
    markDirty(true);
    return true;
  }

  function onStart() {
    cancelAnimTimers();
    G.startGame(state);
    lastTs = performance.now();
    dropAccum = 0;
    markDirty(true);
  }

  function resetTitle() {
    cancelAnimTimers();
    var fresh = G.createInitialState();
    for (var k in fresh) {
      if (Object.prototype.hasOwnProperty.call(fresh, k)) state[k] = fresh[k];
    }
    markDirty(true);
  }

  window.__letterdrop = {
    state: state,
    plant: function (cells) {
      G.plant(state, cells);
      markDirty(true);
    },
    claim: function () {
      var n = G.claimLinedUpWords(state);
      if (n) {
        scheduleFeedbackClear();
        markDirty(true);
      }
      return n;
    },
    finishClearing: function () {
      G.finishClearing(state);
      settleMotionStarted = false;
      patchHudChrome();
      patchBoardAfterClear();
    },
    finishSettling: function () {
      G.finishSettling(state);
      settleMotionStarted = false;
      patchHudChrome();
      patchBoardAfterSettle();
    },
  };

  app.addEventListener('pointerdown', function (e) {
    var downBtn = e.target.closest ? e.target.closest('[data-action="down"]') : null;
    if (downBtn) {
      e.preventDefault();
      setSoftDrop(true);
    }
  });

  window.addEventListener('pointerup', function () {
    setSoftDrop(false);
  });
  window.addEventListener('pointercancel', function () {
    setSoftDrop(false);
  });
  window.addEventListener('blur', function () {
    setSoftDrop(false);
  });

  app.addEventListener('click', function (e) {
    var target = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!target) return;

    var action = target.getAttribute('data-action');
    if (action === 'start') {
      onStart();
      return;
    }
    if (action === 'title') {
      resetTitle();
      return;
    }
    if (action === 'left') {
      if (hardDropAnim) return;
      G.moveLeft(state);
      syncActiveMotion();
      return;
    }
    if (action === 'right') {
      if (hardDropAnim) return;
      G.moveRight(state);
      syncActiveMotion();
      return;
    }
    if (action === 'down') {
      // Soft drop is driven by pointer/key hold — ignore click echo.
      return;
    }
    if (action === 'hard') {
      beginHardDrop();
      return;
    }
    if (action === 'rotate') {
      if (hardDropAnim) return;
      G.rotate(state);
      dropAccum = Math.min(dropAccum, fallInterval() * 0.85);
      syncActiveMotion();
      return;
    }
  });

  window.addEventListener('keydown', function (e) {
    if (state.phase === 'title' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onStart();
      return;
    }
    if (state.phase === 'ended' && e.key === 'Enter') {
      e.preventDefault();
      onStart();
      return;
    }
    if (state.phase !== 'playing') return;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        if (hardDropAnim) break;
        G.moveLeft(state);
        syncActiveMotion();
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (hardDropAnim) break;
        G.moveRight(state);
        syncActiveMotion();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSoftDrop(true);
        break;
      case 'ArrowUp':
      case 'x':
      case 'X':
      case 'w':
      case 'W':
        e.preventDefault();
        if (hardDropAnim) break;
        G.rotate(state);
        dropAccum = Math.min(dropAccum, fallInterval() * 0.85);
        syncActiveMotion();
        break;
      case ' ':
        e.preventDefault();
        beginHardDrop();
        break;
      default:
        break;
    }
  });

  window.addEventListener('keyup', function (e) {
    if (e.key === 'ArrowDown') {
      setSoftDrop(false);
    }
  });

  window.addEventListener('resize', function () {
    if (state.phase === 'playing') syncActiveMotion();
  });

  function processDropTicks() {
    var structural = false;
    var interval = fallInterval();
    while (
      dropAccum >= interval &&
      state.phase === 'playing' &&
      state.active &&
      !state.clearing &&
      !state.settling &&
      !hardDropAnim
    ) {
      dropAccum -= interval;
      var before = state.active;
      G.tickDrop(state);
      if (!state.active || state.active !== before || state.clearing) {
        structural = true;
        dropAccum = 0;
        break;
      }
      interval = fallInterval();
    }
    return structural;
  }

  function frame(ts) {
    if (state.phase === 'playing') {
      if (!lastTs) lastTs = ts;
      var dt = Math.min(64, ts - lastTs);
      lastTs = ts;

      var prevPhase = state.phase;

      if (hardDropAnim) {
        finishHardDropIfDue(ts);
      } else if (!state.clearing && !state.settling) {
        dropAccum += dt;
        if (processDropTicks()) markDirty(true);
      }

      if (state.phase !== prevPhase) markDirty(true);

      if (state.settling && !settleMotionStarted) startSettleMotion();
    } else {
      lastTs = 0;
      dropAccum = 0;
    }

    if (needsRender) render();
    else if (state.phase === 'playing' && lastRenderedPhase === 'playing') {
      syncActiveMotion();
    }

    requestAnimationFrame(frame);
  }

  render();
  requestAnimationFrame(frame);
})();
