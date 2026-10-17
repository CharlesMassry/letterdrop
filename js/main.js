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

  function brandSpans(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      out += '<span>' + (ch === ' ' ? '&nbsp;' : ch) + '</span>';
    }
    return out;
  }

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
  }

  function scheduleClearAnimation() {
    if (!state.clearing || clearAnimTimer !== null) return;
    var token = ++clearAnimToken;
    clearAnimTimer = window.setTimeout(function () {
      if (token !== clearAnimToken) return;
      clearAnimTimer = null;
      if (!state.clearing) return;
      G.finishClearing(state);
      scheduleFeedbackClear();
      // Settling and/or another clear (cascade) pick up via markDirty.
      markDirty();
    }, G.CLEAR_ANIM_MS);
  }

  function scheduleSettleAnimation() {
    if (!state.settling || settleAnimTimer !== null) return;
    var token = ++settleAnimToken;
    var ms = state.settling.durationMs || 280;
    settleAnimTimer = window.setTimeout(function () {
      if (token !== settleAnimToken) return;
      settleAnimTimer = null;
      if (!state.settling) return;
      G.finishSettling(state);
      markDirty();
    }, ms);
  }

  function markDirty() {
    needsRender = true;
    if (state.clearing) scheduleClearAnimation();
    if (state.settling) scheduleSettleAnimation();
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

  function renderBoard() {
    var activeMap = G.activeCellMap(state.active);
    var clearing = G.clearingKeySet(state);
    var settleMap = G.settlingMoveMap(state);
    var settleMs = state.settling ? state.settling.durationMs : 0;
    var cells = [];
    for (var r = 0; r < G.ROWS; r++) {
      for (var c = 0; c < G.COLS; c++) {
        var key = r + ',' + c;
        var clearingLetter = clearing[key];
        var settleMove = clearingLetter ? null : settleMap[key];
        var activeLetter = clearingLetter || settleMove ? null : activeMap[key];
        var boarded = clearingLetter || state.board[r][c];
        var letter = activeLetter || boarded || '';
        var classes = ['cell'];
        if (clearingLetter) classes.push('filled', 'disintegrating');
        else if (activeLetter) classes.push('active');
        else if (boarded) {
          classes.push('filled');
          if (settleMove) classes.push('settling');
        }
        var selIdx = -1;
        if (!clearingLetter && !settleMove) {
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
        var styleAttr = '';
        if (settleMove) {
          var fall = settleMove.toRow - settleMove.fromRow;
          if (fall < 1) fall = 1;
          var halfSteps = fall * 2;
          styleAttr =
            ' style="--fall-cells:' +
            fall +
            ';--settle-ms:' +
            settleMs +
            'ms;animation:cascade-settle ' +
            settleMs +
            'ms steps(' +
            halfSteps +
            ',end) both"';
        }
        cells.push(
          '<button type="button" class="' +
            classes.join(' ') +
            '" data-row="' +
            r +
            '" data-col="' +
            c +
            '"' +
            styleAttr +
            (clearingLetter || settleMove ? ' disabled' : '') +
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
    return '<div class="board" role="grid" aria-label="Letter board">' + cells.join('') + '</div>';
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
      ? 'Line up a word, or tap adjacent letters…'
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
      '<div class="actions">' +
      '<button type="button" class="btn btn-ghost" data-action="clear">Clear</button>' +
      '<button type="button" class="btn btn-coral" data-action="submit">Submit</button>' +
      '</div></div>' +
      '<div class="touch-pad" aria-label="Move controls">' +
      '<button type="button" class="btn" data-action="rotate">↻</button>' +
      '<button type="button" class="btn" data-action="hard">↓↓</button>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn" data-action="left">←</button>' +
      '<button type="button" class="btn" data-action="down">↓</button>' +
      '<button type="button" class="btn" data-action="right">→</button>' +
      '</div>' +
      '<p class="hint-keys">Arrows move · ↑ rotate · Space drop · line up words to score · Esc clear</p>' +
      '</main>'
    );
  }

  function render() {
    if (state.phase === 'title') app.innerHTML = renderTitle();
    else if (state.phase === 'ended') app.innerHTML = renderEnd();
    else app.innerHTML = renderPlay();
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
          markDirty();
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
    markDirty();
    return ok;
  }

  function onStart() {
    cancelAnimTimers();
    G.startGame(state);
    lastTs = performance.now();
    dropAccum = 0;
    markDirty();
  }

  function resetTitle() {
    cancelAnimTimers();
    var fresh = G.createInitialState();
    for (var k in fresh) {
      if (Object.prototype.hasOwnProperty.call(fresh, k)) state[k] = fresh[k];
    }
    markDirty();
  }

  window.__letterdrop = {
    state: state,
    plant: function (cells) {
      G.plant(state, cells);
      markDirty();
    },
    select: function (row, col) {
      G.toggleSelect(state, row, col);
      markDirty();
    },
    submit: function () {
      return handleSubmit();
    },
    finishClearing: function () {
      G.finishClearing(state);
      markDirty();
    },
    finishSettling: function () {
      G.finishSettling(state);
      markDirty();
    },
  };

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
    if (action === 'submit') {
      handleSubmit();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      return;
    }
    if (action === 'clear') {
      G.clearSelection(state);
      markDirty();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      return;
    }
    if (action === 'left') {
      G.moveLeft(state);
      markDirty();
      return;
    }
    if (action === 'right') {
      G.moveRight(state);
      markDirty();
      return;
    }
    if (action === 'down') {
      G.softDrop(state);
      markDirty();
      return;
    }
    if (action === 'hard') {
      G.hardDrop(state);
      markDirty();
      return;
    }
    if (action === 'rotate') {
      G.rotate(state);
      markDirty();
      return;
    }

    if (target.getAttribute('data-row') !== null) {
      G.toggleSelect(
        state,
        Number(target.getAttribute('data-row')),
        Number(target.getAttribute('data-col')),
      );
      scheduleFeedbackClear();
      markDirty();
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
        G.moveLeft(state);
        markDirty();
        break;
      case 'ArrowRight':
        e.preventDefault();
        G.moveRight(state);
        markDirty();
        break;
      case 'ArrowDown':
        e.preventDefault();
        G.softDrop(state);
        markDirty();
        break;
      case 'ArrowUp':
      case 'x':
      case 'X':
      case 'w':
      case 'W':
        e.preventDefault();
        G.rotate(state);
        markDirty();
        break;
      case ' ':
        e.preventDefault();
        G.hardDrop(state);
        markDirty();
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
        markDirty();
        break;
      default:
        break;
    }
  });

  function frame(ts) {
    if (state.phase === 'playing') {
      if (!lastTs) lastTs = ts;
      var dt = Math.min(64, ts - lastTs);
      lastTs = ts;

      var prevPhase = state.phase;
      G.tickTimer(state, dt);
      dropAccum += dt;
      var dropped = false;
      while (dropAccum >= state.dropIntervalMs && state.phase === 'playing') {
        dropAccum -= state.dropIntervalMs;
        G.tickDrop(state);
        dropped = true;
      }

      if (state.phase !== prevPhase || dropped) markDirty();
      else if (state.phase === 'playing' && lastRenderedPhase === 'playing') updateTimerHud();
    } else {
      lastTs = 0;
      dropAccum = 0;
    }

    if (needsRender) render();
    requestAnimationFrame(frame);
  }

  render();
  requestAnimationFrame(frame);
})();
