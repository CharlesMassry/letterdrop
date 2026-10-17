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
  var lastTimerText = '';
  var lastSubmitAt = 0;
  var lastSubmitSig = '';
  var clearAnimTimer = null;
  var clearAnimToken = 0;
  var settleAnimTimer = null;
  var settleAnimToken = 0;
  /** Freeze full-board HTML rebuilds while clear/settle CSS runs. */
  var boardMotionLock = null;
  /** @type {null|{startVisual:number,endRow:number,startTs:number,durationMs:number}} */
  var hardDropAnim = null;
  var cachedMetrics = null;
  var settleFxStarted = false;
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
    settleFxStarted = false;
    cachedMetrics = null;
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
      boardMotionLock = state.settling ? 'settling' : null;
      settleFxStarted = false;
      markDirty(true);
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
      boardMotionLock = state.clearing ? 'clearing' : null;
      settleFxStarted = false;
      markDirty(true);
    }, ms);
  }

  /** @param {boolean=} forceBoard rebuild board even during motion lock (phase change) */
  function markDirty(forceBoard) {
    needsRender = true;
    if (forceBoard) {
      forceBoardRebuild = true;
      cachedMetrics = null;
    }
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
    if (hardDropAnim) {
      var t = (performance.now() - hardDropAnim.startTs) / hardDropAnim.durationMs;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      var eased = 1 - Math.pow(1 - t, 3);
      return (
        hardDropAnim.startVisual +
        (hardDropAnim.endRow - hardDropAnim.startVisual) * eased
      );
    }
    return state.active.row + dropFrac();
  }

  /**
   * Derive track geometry from real grid cells relative to the FX layer.
   * (Earlier bug: gap was read from `.board`, which has no gap — only `.board-grid`
   * does — so stepX/Y ignored gaps and tiles drifted off-column.)
   */
  function readBoardMetrics(boardEl) {
    if (!boardEl) return null;
    var layer = boardEl.querySelector('.board-fx');
    var cells = boardEl.querySelectorAll('.board-grid > .cell');
    if (!layer || cells.length < G.COLS + 1) return null;
    var layerRect = layer.getBoundingClientRect();
    var a = cells[0].getBoundingClientRect();
    var right = cells[1].getBoundingClientRect();
    var below = cells[G.COLS].getBoundingClientRect();
    var stepX = right.left - a.left;
    var stepY = below.top - a.top;
    if (!(stepX > 0) || !(stepY > 0)) return null;
    return {
      originX: a.left - layerRect.left,
      originY: a.top - layerRect.top,
      cellW: a.width,
      cellH: a.height,
      stepX: stepX,
      stepY: stepY,
    };
  }

  function getMetrics() {
    var boardEl = app.querySelector('.board');
    if (!boardEl) return null;
    var w = boardEl.clientWidth;
    var h = boardEl.clientHeight;
    if (
      cachedMetrics &&
      cachedMetrics._w === w &&
      cachedMetrics._h === h
    ) {
      return cachedMetrics;
    }
    cachedMetrics = readBoardMetrics(boardEl);
    if (cachedMetrics) {
      cachedMetrics._w = w;
      cachedMetrics._h = h;
    }
    return cachedMetrics;
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

  function placeFx(el, row, col, metrics) {
    el.style.width = metrics.cellW + 'px';
    el.style.height = metrics.cellH + 'px';
    el.style.transform =
      'translate(' +
      (metrics.originX + col * metrics.stepX) +
      'px,' +
      (metrics.originY + row * metrics.stepY) +
      'px)';
  }

  function syncActiveLayer() {
    var layer = app.querySelector('[data-fx="active"]');
    if (!layer) return;
    if (!state.active || state.clearing || state.settling) {
      if (layer.childNodes.length) layer.innerHTML = '';
      return;
    }
    var metrics = getMetrics();
    if (!metrics) return;
    var cells = G.absoluteCells(state.active);
    var vRow = visualActiveRow();
    var baseRow = state.active.row;
    var i;

    if (layer.childNodes.length !== cells.length) {
      var html = '';
      for (i = 0; i < cells.length; i++) {
        html +=
          '<div class="fx-tile fx-active" data-fx-i="' +
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
      placeFx(layer.childNodes[i], fracRow, cells[i].col, metrics);
    }
  }

  function startSettleFx() {
    if (settleFxStarted || !state.settling) return;
    var layer = app.querySelector('[data-fx="settle"]');
    var metrics = getMetrics();
    if (!layer || !metrics) return;
    settleFxStarted = true;
    var moves = state.settling.moves;
    var html = '';
    var i;
    for (i = 0; i < moves.length; i++) {
      html +=
        '<div class="fx-tile fx-settle" data-settle-i="' +
        i +
        '">' +
        tileInner(moves[i].letter) +
        '</div>';
    }
    layer.innerHTML = html;

    for (i = 0; i < moves.length; i++) {
      var el = layer.childNodes[i];
      el.style.transition = 'none';
      placeFx(el, moves[i].fromRow, moves[i].col, metrics);
    }

    // Double rAF so the browser commits the start transform before easing to the end.
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (!state.settling || !layer) return;
        var m2 = getMetrics() || metrics;
        for (var j = 0; j < moves.length; j++) {
          var tile = layer.childNodes[j];
          if (!tile) continue;
          var ms = moves[j].durationMs || state.settling.durationMs || 400;
          tile.style.transition =
            'transform ' + ms + 'ms var(--settle-ease, cubic-bezier(0.22, 1, 0.36, 1))';
          placeFx(tile, moves[j].toRow, moves[j].col, m2);
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
      '<p class="tagline">Falling letter blocks. Rising words. Two minutes to spell your way up the board.</p>' +
      '<ul class="howto">' +
      '<li><strong>← → ↓</strong> move · <strong>↑ / X</strong> rotate · <strong>Space</strong> hard drop</li>' +
      '<li><strong>Line up</strong> a word in a row or column — it scores when the piece lands</li>' +
      '<li>Or <strong>tap</strong> adjacent letters (auto-scores when the word is valid)</li>' +
      '<li>Seven tetromino shapes — each cell carries a letter</li>' +
      '</ul>' +
      '<div class="title-actions">' +
      '<button type="button" class="btn" data-action="start">Play</button>' +
      '</div>' +
      '</main>'
    );
  }

  function renderEnd() {
    var reason =
      state.endReason === 'full' ? 'Board full — no room to drop.' : "Time's up.";
    return (
      '<div class="atmosphere" aria-hidden="true"></div>' +
      '<main class="screen end-screen">' +
      '<p class="end-brand">Letterdrop</p>' +
      '<h1>' +
      (state.endReason === 'full' ? 'Stacked out' : 'Round over') +
      '</h1>' +
      '<p class="end-score">' +
      state.score +
      '</p>' +
      '<p class="end-meta">' +
      reason +
      ' · ' +
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
        var selIdx = -1;
        if (!clearingLetter && !hideSettling[key]) {
          for (var i = 0; i < state.selection.length; i++) {
            if (state.selection[i].row === r && state.selection[i].col === c) {
              selIdx = i;
              break;
            }
          }
        }
        if (selIdx >= 0) classes.push('selected');
        var order =
          selIdx >= 0 ? '<span class="sel-order">' + (selIdx + 1) + '</span>' : '';
        var val =
          letter
            ? '<span class="cell-val">' + G.letterValue(letter) + '</span>'
            : '';
        cells.push(
          '<button type="button" class="' +
            classes.join(' ') +
            '" data-row="' +
            r +
            '" data-col="' +
            c +
            '"' +
            (clearingLetter || hideSettling[key] ? ' disabled' : '') +
            ' aria-label="' +
            (letter ? 'Letter ' + letter + ', ' + G.letterValue(letter) + ' points' : 'Empty') +
            '">' +
            (letter ? '<span class="cell-letter">' + letter + '</span>' : '') +
            val +
            order +
            (clearingLetter ? shardMarkup() : '') +
            '</button>',
        );
      }
    }
    return (
      '<div class="board" role="grid" aria-label="Letter board">' +
      '<div class="board-grid">' +
      cells.join('') +
      '</div>' +
      '<div class="board-fx" data-fx="settle" aria-hidden="true"></div>' +
      '<div class="board-fx" data-fx="active" aria-hidden="true"></div>' +
      '</div>'
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
    var word = G.selectionWord(state);
    var urgent = state.timeLeftMs <= 30000;
    var fbClass = 'feedback';
    if (state.feedbackKind === 'ok') fbClass += ' ok';
    if (state.feedbackKind === 'error') fbClass += ' error';
    var previewClass = 'word-preview';
    if (!word) previewClass += ' empty';
    if (state.selectionValid) previewClass += ' valid';
    var previewText = !word
      ? 'Line up a word — or tap letters…'
      : state.selectionValid
        ? word + ' ✓'
        : word;

    lastTimerText = G.formatTime(state.timeLeftMs);

    return (
      '<div class="atmosphere" aria-hidden="true"></div>' +
      '<main class="screen play-screen">' +
      '<div class="hud">' +
      '<div class="hud-stat"><span class="label">Score</span><span class="value" data-hud="score">' +
      state.score +
      '</span></div>' +
      '<div class="hud-stat timer' +
      (urgent ? ' urgent' : '') +
      '" data-hud="timer-wrap"><span class="label">Time</span><span class="value" data-hud="timer">' +
      lastTimerText +
      '</span></div>' +
      '<div class="hud-stat"><span class="label">Words</span><span class="value" data-hud="words">' +
      state.wordsFound +
      '</span></div>' +
      '</div>' +
      '<div class="board-wrap">' +
      renderBoard() +
      '</div>' +
      '<div class="word-bar">' +
      '<div class="' +
      previewClass +
      '" aria-live="polite" data-hud="word">' +
      previewText +
      '</div>' +
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
      '<p class="hint-keys">Arrows move · ↑ rotate · Space drop · line up or tap words to score · Esc clears selection</p>' +
      '</main>'
    );
  }

  function patchHudChrome() {
    updateTimerHud();
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
    var wordEl = app.querySelector('[data-hud="word"]');
    if (wordEl) {
      var word = G.selectionWord(state);
      wordEl.className = 'word-preview';
      if (!word) wordEl.className += ' empty';
      if (state.selectionValid) wordEl.className += ' valid';
      wordEl.textContent = !word
        ? 'Line up a word — or tap letters…'
        : state.selectionValid
          ? word + ' ✓'
          : word;
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
      cachedMetrics = null;
      settleFxStarted = false;
      if (state.settling) {
        boardMotionLock = 'settling';
        startSettleFx();
      } else if (state.clearing) {
        boardMotionLock = 'clearing';
      } else {
        boardMotionLock = null;
      }
      syncActiveLayer();
    }
    lastRenderedPhase = state.phase;
    needsRender = false;
  }

  function updateTimerHud() {
    var text = G.formatTime(state.timeLeftMs);
    if (text === lastTimerText) return;
    lastTimerText = text;
    var el = app.querySelector('[data-hud="timer"]');
    var wrap = app.querySelector('[data-hud="timer-wrap"]');
    if (el) el.textContent = text;
    if (wrap) {
      if (state.timeLeftMs <= 30000) wrap.classList.add('urgent');
      else wrap.classList.remove('urgent');
    }
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

  function handleSubmit() {
    var now = performance.now();
    var sig =
      G.selectionWord(state) +
      ':' +
      state.selection
        .map(function (s) {
          return s.row + ',' + s.col;
        })
        .join(';');
    if (now - lastSubmitAt < 280 && sig === lastSubmitSig) return false;
    lastSubmitAt = now;
    lastSubmitSig = sig;
    var ok = G.submitWord(state);
    scheduleFeedbackClear();
    markDirty(true);
    return ok;
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
    select: function (row, col) {
      G.toggleSelect(state, row, col);
      markDirty(true);
    },
    submit: function () {
      return handleSubmit();
    },
    finishClearing: function () {
      G.finishClearing(state);
      boardMotionLock = state.settling ? 'settling' : null;
      settleFxStarted = false;
      markDirty(true);
    },
    finishSettling: function () {
      G.finishSettling(state);
      boardMotionLock = state.clearing ? 'clearing' : null;
      settleFxStarted = false;
      markDirty(true);
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
    var target = e.target.closest
      ? e.target.closest('[data-action], [data-row]')
      : null;
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
      syncActiveLayer();
      return;
    }
    if (action === 'right') {
      if (hardDropAnim) return;
      G.moveRight(state);
      syncActiveLayer();
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
      syncActiveLayer();
      return;
    }

    if (target.getAttribute('data-row') !== null) {
      G.toggleSelect(
        state,
        Number(target.getAttribute('data-row')),
        Number(target.getAttribute('data-col')),
      );
      scheduleFeedbackClear();
      markDirty(true);
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
        syncActiveLayer();
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (hardDropAnim) break;
        G.moveRight(state);
        syncActiveLayer();
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
        syncActiveLayer();
        break;
      case ' ':
        e.preventDefault();
        beginHardDrop();
        break;
      case 'Enter':
        e.preventDefault();
        handleSubmit();
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        break;
      case 'Escape':
      case 'Backspace':
        e.preventDefault();
        G.clearSelection(state);
        markDirty(true);
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
    cachedMetrics = null;
    if (state.phase === 'playing') syncActiveLayer();
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
      G.tickTimer(state, dt);

      if (hardDropAnim) {
        finishHardDropIfDue(ts);
      } else if (!state.clearing && !state.settling) {
        dropAccum += dt;
        if (processDropTicks()) markDirty(true);
      }

      if (state.phase !== prevPhase) markDirty(true);
      else if (lastRenderedPhase === 'playing') updateTimerHud();

      if (state.settling && !settleFxStarted) startSettleFx();
    } else {
      lastTs = 0;
      dropAccum = 0;
    }

    if (needsRender) render();
    else if (state.phase === 'playing' && lastRenderedPhase === 'playing') {
      syncActiveLayer();
    }

    requestAnimationFrame(frame);
  }

  render();
  requestAnimationFrame(frame);
})();
