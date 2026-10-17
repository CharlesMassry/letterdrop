/* Letterdrop game logic — classic script, attaches to window.Letterdrop */
(function () {
  'use strict';

  var COLS = 8;
  var ROWS = 12;
  var INITIAL_DROP_MS = 900;
  var MIN_DROP_MS = 350;
  /** How long the disintegration animation runs before gravity. */
  var CLEAR_ANIM_MS = 520;
  /** Base ms per full cell of cascade fall (eased glide). */
  var SETTLE_MS_PER_CELL = 150;
  var SETTLE_MS_MIN = 380;
  var SETTLE_MS_MAX = 920;

  var LETTER_VALUES = {
    A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
    N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
  };

  var SPAWN_WEIGHTS = [
    ['E', 12], ['A', 9], ['I', 9], ['O', 8], ['N', 6], ['R', 6], ['T', 6],
    ['L', 4], ['S', 4], ['U', 4], ['D', 4], ['G', 3], ['B', 2], ['C', 2],
    ['M', 2], ['P', 2], ['F', 2], ['H', 2], ['V', 2], ['W', 2], ['Y', 2],
    ['K', 1], ['J', 1], ['X', 1], ['Q', 1], ['Z', 1],
  ];

  var totalWeight = 0;
  for (var wi = 0; wi < SPAWN_WEIGHTS.length; wi++) totalWeight += SPAWN_WEIGHTS[wi][1];

  var SHAPES = {
    I: [[0, 0], [1, 0], [2, 0], [3, 0]],
    L: [[0, 0], [1, 0], [2, 0], [2, 1]],
    J: [[0, 0], [1, 0], [2, 0], [2, -1]],
    O: [[0, 0], [0, 1], [1, 0], [1, 1]],
    T: [[0, 0], [1, 0], [2, 0], [1, 1]],
    S: [[0, 0], [0, 1], [1, 1], [1, 2]],
    Z: [[0, 1], [0, 2], [1, 0], [1, 1]],
  };
  var SHAPE_IDS = ['I', 'L', 'J', 'O', 'T', 'S', 'Z'];

  function wordSetHas(word) {
    return !!(window.LETTERDROP_WORD_SET && window.LETTERDROP_WORD_SET[word]);
  }

  function randomLetter() {
    var roll = Math.random() * totalWeight;
    for (var i = 0; i < SPAWN_WEIGHTS.length; i++) {
      roll -= SPAWN_WEIGHTS[i][1];
      if (roll <= 0) return SPAWN_WEIGHTS[i][0];
    }
    return 'E';
  }

  function letterValue(letter) {
    return LETTER_VALUES[letter.toUpperCase()] || 1;
  }

  /** Scrabble letter-sum score (primary). Tiny +1 per letter past 4 keeps longer words fair. */
  function scoreWord(word) {
    var upper = word.toUpperCase();
    var base = 0;
    for (var i = 0; i < upper.length; i++) base += letterValue(upper.charAt(i));
    var lengthNudge = Math.max(0, upper.length - 4);
    return base + lengthNudge;
  }

  function isDictionaryWord(word) {
    return wordSetHas(String(word).toLowerCase());
  }

  function normalizeCells(cells) {
    var minR = Infinity;
    var minC = Infinity;
    var i;
    for (i = 0; i < cells.length; i++) {
      if (cells[i].dr < minR) minR = cells[i].dr;
      if (cells[i].dc < minC) minC = cells[i].dc;
    }
    var out = [];
    for (i = 0; i < cells.length; i++) {
      out.push({
        dr: cells[i].dr - minR,
        dc: cells[i].dc - minC,
        letter: cells[i].letter || 'A',
      });
    }
    return out;
  }

  function rotateOffsetsClockwise(cells) {
    var out = [];
    for (var i = 0; i < cells.length; i++) {
      out.push({ dr: cells[i].dc, dc: -cells[i].dr, letter: cells[i].letter });
    }
    return out;
  }

  function absoluteCells(piece) {
    var out = [];
    for (var i = 0; i < piece.cells.length; i++) {
      var c = piece.cells[i];
      out.push({ row: piece.row + c.dr, col: piece.col + c.dc, letter: c.letter });
    }
    return out;
  }

  function createPiece(shape, row, col) {
    var offsets = SHAPES[shape];
    var cells = [];
    for (var i = 0; i < offsets.length; i++) {
      cells.push({ dr: offsets[i][0], dc: offsets[i][1], letter: randomLetter() });
    }
    return { shape: shape, row: row, col: col, cells: normalizeCells(cells) };
  }

  function createEmptyBoard() {
    var board = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) row.push(null);
      board.push(row);
    }
    return board;
  }

  function cellsFit(board, abs) {
    for (var i = 0; i < abs.length; i++) {
      var row = abs[i].row;
      var col = abs[i].col;
      if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
      if (board[row][col] !== null) return false;
    }
    return true;
  }

  function pieceFits(board, piece, row, col, cells) {
    if (row === undefined) row = piece.row;
    if (col === undefined) col = piece.col;
    if (cells === undefined) cells = piece.cells;
    var abs = [];
    for (var i = 0; i < cells.length; i++) {
      abs.push({ row: row + cells[i].dr, col: col + cells[i].dc });
    }
    return cellsFit(board, abs);
  }

  function lockPiece(board, piece) {
    var abs = absoluteCells(piece);
    for (var i = 0; i < abs.length; i++) {
      var a = abs[i];
      if (a.row >= 0 && a.row < ROWS && a.col >= 0 && a.col < COLS) {
        board[a.row][a.col] = a.letter;
      }
    }
  }

  function tryMoveDown(board, piece) {
    if (!pieceFits(board, piece, piece.row + 1, piece.col)) return false;
    piece.row += 1;
    return true;
  }

  function canMoveDown(board, piece) {
    return !!(piece && pieceFits(board, piece, piece.row + 1, piece.col));
  }

  /** Lowest row the piece can occupy without colliding. */
  function landingRow(board, piece) {
    if (!piece) return 0;
    var row = piece.row;
    while (pieceFits(board, piece, row + 1, piece.col)) row += 1;
    return row;
  }

  function lockAtRow(state, row) {
    if (!state.active) return;
    state.active.row = row;
    lockAndSpawn(state);
  }

  function tryMoveHorizontal(board, piece, dir) {
    if (!pieceFits(board, piece, piece.row, piece.col + dir)) return false;
    piece.col += dir;
    return true;
  }

  function tryRotate(board, piece) {
    // O is square but letters must still cycle on rotate (↑ / X).
    var rotatedRaw = rotateOffsetsClockwise(piece.cells);
    var rotated = normalizeCells(rotatedRaw);
    var kicks = [[0, 0], [0, -1], [0, 1], [0, -2], [0, 2], [-1, 0], [-1, -1], [-1, 1]];
    for (var i = 0; i < kicks.length; i++) {
      var row = piece.row + kicks[i][0];
      var col = piece.col + kicks[i][1];
      if (pieceFits(board, piece, row, col, rotated)) {
        piece.row = row;
        piece.col = col;
        piece.cells = rotated;
        return true;
      }
    }
    return false;
  }

  function isBoardFull(board) {
    for (var c = 0; c < COLS; c++) {
      if (board[0][c] !== null) return true;
    }
    return false;
  }

  function spawnPiece(board) {
    var shape = SHAPE_IDS[Math.floor(Math.random() * SHAPE_IDS.length)];
    var centers = [3, 2, 4, 1, 5, 0, 6];
    var i, piece;
    for (i = 0; i < centers.length; i++) {
      piece = createPiece(shape, 0, centers[i]);
      if (pieceFits(board, piece)) return piece;
    }
    for (i = 0; i < COLS; i++) {
      piece = createPiece(shape, 0, i);
      if (pieceFits(board, piece)) return piece;
    }
    return null;
  }

  /**
   * Remove cells and apply column gravity.
   * Returns { removed, moves } where moves describe each letter that fell
   * (for eased cascade animation). Logical positions stay on the integer grid.
   */
  function removeCellsAndApplyGravity(board, cells) {
    var removed = [];
    var moves = [];
    var toRemove = {};
    var i, r, c, key;
    for (i = 0; i < cells.length; i++) {
      key = cells[i].row + ',' + cells[i].col;
      toRemove[key] = true;
    }
    for (i = 0; i < cells.length; i++) {
      var letter = board[cells[i].row] && board[cells[i].row][cells[i].col];
      if (letter) removed.push(letter);
    }
    for (c = 0; c < COLS; c++) {
      var stack = [];
      for (r = ROWS - 1; r >= 0; r--) {
        if (toRemove[r + ',' + c]) continue;
        if (board[r][c]) stack.push({ letter: board[r][c], fromRow: r });
      }
      for (r = 0; r < ROWS; r++) board[r][c] = null;
      for (i = 0; i < stack.length; i++) {
        var toRow = ROWS - 1 - i;
        board[toRow][c] = stack[i].letter;
        if (stack[i].fromRow !== toRow) {
          var fall = toRow - stack[i].fromRow;
          moves.push({
            letter: stack[i].letter,
            col: c,
            fromRow: stack[i].fromRow,
            toRow: toRow,
            durationMs: settleDurationForFall(fall),
          });
        }
      }
    }
    return { removed: removed, moves: moves };
  }

  function settleDurationForFall(fall) {
    var ms = SETTLE_MS_MIN + fall * SETTLE_MS_PER_CELL;
    if (ms > SETTLE_MS_MAX) ms = SETTLE_MS_MAX;
    return ms;
  }

  function settleDurationMs(moves) {
    var maxMs = SETTLE_MS_MIN;
    for (var i = 0; i < moves.length; i++) {
      var ms = moves[i].durationMs || settleDurationForFall(moves[i].toRow - moves[i].fromRow);
      if (ms > maxMs) maxMs = ms;
    }
    return maxMs;
  }

  function activeCellMap(piece) {
    var map = {};
    if (!piece) return map;
    var abs = absoluteCells(piece);
    for (var i = 0; i < abs.length; i++) {
      map[abs[i].row + ',' + abs[i].col] = abs[i].letter;
    }
    return map;
  }

  function findLinedUpWords(board) {
    var candidates = [];

    function considerRun(cells) {
      if (cells.length < 3) return;
      var letters = [];
      var i, start, end, word, slice, j;
      for (i = 0; i < cells.length; i++) letters.push(cells[i].letter.toLowerCase());
      for (start = 0; start < letters.length; start++) {
        for (end = start + 3; end <= letters.length; end++) {
          word = letters.slice(start, end).join('');
          if (wordSetHas(word)) {
            slice = [];
            for (j = start; j < end; j++) {
              slice.push({ row: cells[j].row, col: cells[j].col });
            }
            candidates.push({ word: word, cells: slice, points: scoreWord(word) });
          }
        }
      }
    }

    var r, c, run;
    for (r = 0; r < ROWS; r++) {
      run = [];
      for (c = 0; c <= COLS; c++) {
        var hLetter = c < COLS ? board[r][c] : null;
        if (hLetter) run.push({ row: r, col: c, letter: hLetter });
        else if (run.length) {
          considerRun(run);
          run = [];
        }
      }
    }
    for (c = 0; c < COLS; c++) {
      run = [];
      for (r = 0; r <= ROWS; r++) {
        var vLetter = r < ROWS ? board[r][c] : null;
        if (vLetter) run.push({ row: r, col: c, letter: vLetter });
        else if (run.length) {
          considerRun(run);
          run = [];
        }
      }
    }

    function candAnchor(cand) {
      var bestR = Infinity;
      var bestC = Infinity;
      for (var i = 0; i < cand.cells.length; i++) {
        var cell = cand.cells[i];
        if (cell.row < bestR || (cell.row === bestR && cell.col < bestC)) {
          bestR = cell.row;
          bestC = cell.col;
        }
      }
      return { row: bestR, col: bestC };
    }

    // Prefer higher points; ties → longer → topmost → leftmost → word text.
    candidates.sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      if (b.cells.length !== a.cells.length) return b.cells.length - a.cells.length;
      var aa = candAnchor(a);
      var bb = candAnchor(b);
      if (aa.row !== bb.row) return aa.row - bb.row;
      if (aa.col !== bb.col) return aa.col - bb.col;
      if (a.word < b.word) return -1;
      if (a.word > b.word) return 1;
      return 0;
    });

    var used = {};
    var claimed = [];
    for (var ci = 0; ci < candidates.length; ci++) {
      var cand = candidates[ci];
      var overlap = false;
      for (var k = 0; k < cand.cells.length; k++) {
        if (used[cand.cells[k].row + ',' + cand.cells[k].col]) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;
      for (k = 0; k < cand.cells.length; k++) {
        used[cand.cells[k].row + ',' + cand.cells[k].col] = true;
      }
      claimed.push(cand);
    }
    return claimed;
  }

  function createInitialState() {
    return {
      phase: 'title',
      board: createEmptyBoard(),
      active: null,
      score: 0,
      wordsFound: 0,
      foundWords: [],
      dropIntervalMs: INITIAL_DROP_MS,
      feedback: null,
      feedbackKind: null,
      endReason: null,
      /** @type {null|{cells:Array<{row:number,col:number,letter:string}>}} */
      clearing: null,
      settling: null,
      spawnAfterClear: false,
    };
  }

  function clearingKeySet(state) {
    var set = {};
    if (!state.clearing) return set;
    for (var i = 0; i < state.clearing.cells.length; i++) {
      var c = state.clearing.cells[i];
      set[c.row + ',' + c.col] = c.letter;
    }
    return set;
  }

  function settlingMoveMap(state) {
    var map = {};
    if (!state.settling) return map;
    for (var i = 0; i < state.settling.moves.length; i++) {
      var m = state.settling.moves[i];
      map[m.toRow + ',' + m.col] = m;
    }
    return map;
  }

  function resolveActiveOverlap(state) {
    if (!state.active) return;
    while (state.active.row >= 0 && !pieceFits(state.board, state.active)) {
      state.active.row -= 1;
    }
    if (state.active.row < 0 || !pieceFits(state.board, state.active)) {
      endGame(state, 'full');
    }
  }

  /**
   * Score the word and start disintegration — board cells stay until finishClearing().
   */
  function applyScoreClear(state, word, cells) {
    if (state.clearing || state.settling) return false;
    var snapshot = [];
    var i;
    for (i = 0; i < cells.length; i++) {
      var row = cells[i].row;
      var col = cells[i].col;
      var letter = state.board[row] && state.board[row][col];
      if (letter) snapshot.push({ row: row, col: col, letter: letter });
    }
    if (snapshot.length === 0) return false;

    var points = scoreWord(word);
    var upper = word.toUpperCase();
    state.score += points;
    state.wordsFound += 1;
    if (!state.foundWords) state.foundWords = [];
    state.foundWords.push({ word: upper, points: points });
    state.feedback = '+' + points + ' · ' + upper;
    state.feedbackKind = 'ok';
    state.dropIntervalMs = Math.max(MIN_DROP_MS, INITIAL_DROP_MS - state.wordsFound * 25);
    state.clearing = { cells: snapshot };
    return true;
  }

  /** After disintegration: apply gravity and optionally play eased cascade settle. */
  function finishClearing(state) {
    if (!state.clearing) return false;
    var result = removeCellsAndApplyGravity(state.board, state.clearing.cells);
    state.clearing = null;
    if (result.moves && result.moves.length) {
      state.settling = {
        moves: result.moves,
        durationMs: settleDurationMs(result.moves),
      };
      return true;
    }
    afterBoardSettled(state);
    return true;
  }

  /** After cascade animation (or if nothing fell): resolve piece, claim words, spawn. */
  function finishSettling(state) {
    if (!state.settling) return false;
    state.settling = null;
    afterBoardSettled(state);
    return true;
  }

  function afterBoardSettled(state) {
    resolveActiveOverlap(state);
    claimLinedUpWords(state);
    if (!state.clearing && !state.settling && state.spawnAfterClear) {
      state.spawnAfterClear = false;
      spawnNext(state);
    }
  }

  function claimLinedUpWords(state) {
    if (state.phase !== 'playing') return 0;
    if (state.clearing || state.settling) return 0;
    var words = findLinedUpWords(state.board);
    if (!words.length) return 0;
    return applyScoreClear(state, words[0].word, words[0].cells) ? 1 : 0;
  }

  function endGame(state, reason) {
    state.phase = 'ended';
    state.active = null;
    state.clearing = null;
    state.settling = null;
    state.spawnAfterClear = false;
    state.endReason = reason;
    state.feedback = null;
    state.feedbackKind = null;
  }

  function spawnNext(state) {
    if (state.phase !== 'playing') return;
    if (isBoardFull(state.board)) {
      endGame(state, 'full');
      return;
    }
    state.active = spawnPiece(state.board);
    if (!state.active) endGame(state, 'full');
  }

  function lockAndSpawn(state) {
    if (state.active) {
      lockPiece(state.board, state.active);
      state.active = null;
    }
    claimLinedUpWords(state);
    if (state.clearing) {
      state.spawnAfterClear = true;
      return;
    }
    spawnNext(state);
  }

  function startGame(state) {
    state.phase = 'playing';
    state.board = createEmptyBoard();
    state.score = 0;
    state.wordsFound = 0;
    state.foundWords = [];
    state.clearing = null;
    state.settling = null;
    state.spawnAfterClear = false;
    state.dropIntervalMs = INITIAL_DROP_MS;
    state.feedback = 'Line up a dictionary word in a row or column to score.';
    state.feedbackKind = 'info';
    state.endReason = null;
    state.active = spawnPiece(state.board);
  }

  function tickDrop(state) {
    if (state.phase !== 'playing' || !state.active || state.clearing || state.settling) return;
    if (!tryMoveDown(state.board, state.active)) lockAndSpawn(state);
  }

  function hardDrop(state) {
    if (state.phase !== 'playing' || !state.active || state.clearing || state.settling) return;
    while (tryMoveDown(state.board, state.active)) { /* fall */ }
    lockAndSpawn(state);
  }

  function moveLeft(state) {
    if (state.phase !== 'playing' || !state.active || state.clearing || state.settling) return;
    tryMoveHorizontal(state.board, state.active, -1);
  }

  function moveRight(state) {
    if (state.phase !== 'playing' || !state.active || state.clearing || state.settling) return;
    tryMoveHorizontal(state.board, state.active, 1);
  }

  function softDrop(state) {
    if (state.phase !== 'playing' || !state.active || state.clearing || state.settling) return;
    if (!tryMoveDown(state.board, state.active)) lockAndSpawn(state);
  }

  function rotate(state) {
    if (state.phase !== 'playing' || !state.active || state.clearing || state.settling) return;
    tryRotate(state.board, state.active);
  }

  window.Letterdrop = {
    COLS: COLS,
    ROWS: ROWS,
    LETTER_VALUES: LETTER_VALUES,
    letterValue: letterValue,
    scoreWord: scoreWord,
    createInitialState: createInitialState,
    startGame: startGame,
    endGame: endGame,
    tickDrop: tickDrop,
    hardDrop: hardDrop,
    canMoveDown: function (state) {
      return canMoveDown(state.board, state.active);
    },
    landingRow: function (state) {
      return landingRow(state.board, state.active);
    },
    lockAtRow: lockAtRow,
    absoluteCells: absoluteCells,
    moveLeft: moveLeft,
    moveRight: moveRight,
    softDrop: softDrop,
    rotate: rotate,
    claimLinedUpWords: claimLinedUpWords,
    finishClearing: finishClearing,
    finishSettling: finishSettling,
    clearingKeySet: clearingKeySet,
    settlingMoveMap: settlingMoveMap,
    CLEAR_ANIM_MS: CLEAR_ANIM_MS,
    findLinedUpWords: findLinedUpWords,
    isDictionaryWord: isDictionaryWord,
    activeCellMap: activeCellMap,
    plant: function (state, cells) {
      for (var i = 0; i < cells.length; i++) {
        state.board[cells[i].row][cells[i].col] = String(cells[i].letter).toUpperCase();
      }
    },
  };
})();
