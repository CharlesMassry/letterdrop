/* Letterdrop game logic — classic script, attaches to window.Letterdrop */
(function () {
  'use strict';

  var COLS = 8;
  var ROWS = 12;
  var ROUND_MS = 120000;
  var INITIAL_DROP_MS = 900;
  var MIN_DROP_MS = 350;

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

  function scoreWord(word) {
    var upper = word.toUpperCase();
    var base = 0;
    for (var i = 0; i < upper.length; i++) base += letterValue(upper.charAt(i));
    var lengthBonus = Math.max(0, upper.length - 2);
    return base * (1 + lengthBonus);
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

  function tryMoveHorizontal(board, piece, dir) {
    if (!pieceFits(board, piece, piece.row, piece.col + dir)) return false;
    piece.col += dir;
    return true;
  }

  function tryRotate(board, piece) {
    if (piece.shape === 'O') return true;
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

  function removeCellsAndApplyGravity(board, cells) {
    var removed = [];
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
        if (board[r][c]) stack.push(board[r][c]);
      }
      for (r = ROWS - 1; r >= 0; r--) {
        var fromBottom = ROWS - 1 - r;
        board[r][c] = stack[fromBottom] || null;
      }
    }
    return removed;
  }

  function areAdjacent(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
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

    candidates.sort(function (a, b) {
      if (b.cells.length !== a.cells.length) return b.cells.length - a.cells.length;
      return b.points - a.points;
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
      selection: [],
      score: 0,
      wordsFound: 0,
      timeLeftMs: ROUND_MS,
      dropIntervalMs: INITIAL_DROP_MS,
      feedback: null,
      feedbackKind: null,
      selectionValid: false,
      endReason: null,
    };
  }

  function selectionWord(state) {
    var out = '';
    for (var i = 0; i < state.selection.length; i++) {
      var s = state.selection[i];
      out += state.board[s.row][s.col] || '';
    }
    return out;
  }

  function refreshSelectionValid(state) {
    var word = selectionWord(state);
    state.selectionValid = word.length >= 3 && isDictionaryWord(word);
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

  function applyScoreClear(state, word, cells) {
    var points = scoreWord(word);
    var cleared = removeCellsAndApplyGravity(state.board, cells);
    if (cleared.length === 0) return false;
    state.selection = [];
    state.selectionValid = false;
    state.score += points;
    state.wordsFound += 1;
    state.feedback = '+' + points + ' · ' + word.toUpperCase();
    state.feedbackKind = 'ok';
    state.dropIntervalMs = Math.max(MIN_DROP_MS, INITIAL_DROP_MS - state.wordsFound * 25);
    resolveActiveOverlap(state);
    return true;
  }

  function claimLinedUpWords(state) {
    if (state.phase !== 'playing') return 0;
    var claimed = 0;
    for (var guard = 0; guard < 8; guard++) {
      var words = findLinedUpWords(state.board);
      if (!words.length) break;
      if (!applyScoreClear(state, words[0].word, words[0].cells)) break;
      claimed += 1;
    }
    return claimed;
  }

  function endGame(state, reason) {
    state.phase = 'ended';
    state.active = null;
    state.selection = [];
    state.selectionValid = false;
    state.endReason = reason;
    state.feedback = null;
    state.feedbackKind = null;
  }

  function lockAndSpawn(state) {
    if (state.active) {
      lockPiece(state.board, state.active);
      state.active = null;
    }
    claimLinedUpWords(state);
    if (state.phase !== 'playing') return;
    if (isBoardFull(state.board)) {
      endGame(state, 'full');
      return;
    }
    state.active = spawnPiece(state.board);
    if (!state.active) endGame(state, 'full');
  }

  function startGame(state) {
    state.phase = 'playing';
    state.board = createEmptyBoard();
    state.selection = [];
    state.selectionValid = false;
    state.score = 0;
    state.wordsFound = 0;
    state.timeLeftMs = ROUND_MS;
    state.dropIntervalMs = INITIAL_DROP_MS;
    state.feedback =
      'Line up words in a row/column to score — or tap adjacent letters, then Submit.';
    state.feedbackKind = 'info';
    state.endReason = null;
    state.active = spawnPiece(state.board);
  }

  function tickDrop(state) {
    if (state.phase !== 'playing' || !state.active) return;
    if (!tryMoveDown(state.board, state.active)) lockAndSpawn(state);
  }

  function hardDrop(state) {
    if (state.phase !== 'playing' || !state.active) return;
    while (tryMoveDown(state.board, state.active)) { /* fall */ }
    lockAndSpawn(state);
  }

  function moveLeft(state) {
    if (state.phase !== 'playing' || !state.active) return;
    tryMoveHorizontal(state.board, state.active, -1);
  }

  function moveRight(state) {
    if (state.phase !== 'playing' || !state.active) return;
    tryMoveHorizontal(state.board, state.active, 1);
  }

  function softDrop(state) {
    if (state.phase !== 'playing' || !state.active) return;
    if (!tryMoveDown(state.board, state.active)) lockAndSpawn(state);
  }

  function rotate(state) {
    if (state.phase !== 'playing' || !state.active) return;
    tryRotate(state.board, state.active);
  }

  function clearSelection(state) {
    state.selection = [];
    state.selectionValid = false;
  }

  function trySelectLinedUpAt(state, row, col) {
    var words = findLinedUpWords(state.board);
    var hit = null;
    for (var i = 0; i < words.length; i++) {
      for (var j = 0; j < words[i].cells.length; j++) {
        if (words[i].cells[j].row === row && words[i].cells[j].col === col) {
          hit = words[i];
          break;
        }
      }
      if (hit) break;
    }
    if (!hit) return false;
    applyScoreClear(state, hit.word, hit.cells);
    claimLinedUpWords(state);
    return true;
  }

  function toggleSelect(state, row, col) {
    if (state.phase !== 'playing') return;
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
    if (!state.board[row][col]) return;

    if (state.selection.length === 0 && trySelectLinedUpAt(state, row, col)) return;

    var idx = -1;
    for (var i = 0; i < state.selection.length; i++) {
      if (state.selection[i].row === row && state.selection[i].col === col) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      if (idx === state.selection.length - 1) {
        state.selection.pop();
        refreshSelectionValid(state);
      }
      return;
    }

    if (state.selection.length === 0) {
      state.selection.push({ row: row, col: col });
      refreshSelectionValid(state);
      return;
    }

    var last = state.selection[state.selection.length - 1];
    if (!areAdjacent(last, { row: row, col: col })) {
      state.feedback = 'Letters must be adjacent (up/down/left/right).';
      state.feedbackKind = 'error';
      return;
    }

    for (i = 0; i < state.selection.length; i++) {
      if (state.selection[i].row === row && state.selection[i].col === col) return;
    }

    state.selection.push({ row: row, col: col });
    refreshSelectionValid(state);

    if (state.selectionValid) {
      var word = selectionWord(state).toLowerCase();
      var cells = state.selection.slice();
      applyScoreClear(state, word, cells);
      claimLinedUpWords(state);
    }
  }

  function submitWord(state) {
    if (state.phase !== 'playing') return false;
    var word = selectionWord(state).toLowerCase();

    if (state.selection.length === 0) {
      var n = claimLinedUpWords(state);
      if (n > 0) return true;
      if (state.feedbackKind === 'ok') return false;
      state.feedback =
        'Tap letters in order, or line them up in a row/column — then they score.';
      state.feedbackKind = 'error';
      return false;
    }

    if (state.selection.length < 3) {
      state.feedback = 'Words need at least 3 letters.';
      state.feedbackKind = 'error';
      return false;
    }

    if (!wordSetHas(word)) {
      state.feedback = '"' + word.toUpperCase() + "\" isn't in the dictionary.";
      state.feedbackKind = 'error';
      return false;
    }

    var cells = state.selection.slice();
    var ok = applyScoreClear(state, word, cells);
    if (!ok) {
      state.feedback = 'Could not clear those letters — try again.';
      state.feedbackKind = 'error';
      return false;
    }
    claimLinedUpWords(state);
    return true;
  }

  function tickTimer(state, dtMs) {
    if (state.phase !== 'playing') return;
    state.timeLeftMs = Math.max(0, state.timeLeftMs - dtMs);
    if (state.timeLeftMs <= 0) endGame(state, 'time');
  }

  function formatTime(ms) {
    var totalSec = Math.ceil(ms / 1000);
    var m = Math.floor(totalSec / 60);
    var s = totalSec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  window.Letterdrop = {
    COLS: COLS,
    ROWS: ROWS,
    ROUND_MS: ROUND_MS,
    createInitialState: createInitialState,
    startGame: startGame,
    endGame: endGame,
    tickDrop: tickDrop,
    hardDrop: hardDrop,
    moveLeft: moveLeft,
    moveRight: moveRight,
    softDrop: softDrop,
    rotate: rotate,
    clearSelection: clearSelection,
    toggleSelect: toggleSelect,
    selectionWord: selectionWord,
    submitWord: submitWord,
    tickTimer: tickTimer,
    formatTime: formatTime,
    claimLinedUpWords: claimLinedUpWords,
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
