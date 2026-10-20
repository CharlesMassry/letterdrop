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

  /** Real English words that use only roman-numeral letters (keep these). */
  var ROMAN_LETTER_ALLOW = {
    did: 1, ill: 1, dim: 1, mid: 1, mix: 1, lid: 1, mil: 1, vim: 1,
    mill: 1, mild: 1, midi: 1, dill: 1, civil: 1, civic: 1, vivid: 1, mimic: 1,
    livid: 1, lipid: 1,
  };

  function isJunkToken(word) {
    if (!word || word.length < 3) return true;
    // aaa / iii / ooo — repeated single letter
    if (/^(.)\1+$/.test(word)) return true;
    // Pure roman-numeral tokens (vii, viii, xii…) that aren't real English
    if (
      /^[ivxlcdm]+$/.test(word) &&
      /^m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/.test(word) &&
      !ROMAN_LETTER_ALLOW[word]
    ) {
      return true;
    }
    return false;
  }

  function wordSetHas(word) {
    if (isJunkToken(word)) return false;
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

  /** Neon faces for the active falling piece — one random pick per tetromino. */
  var NEON_PALETTE = [
    { hi: '#ff5ec8', lo: '#ff2a9e', glow: 'rgba(255, 94, 200, 0.55)' }, // hot pink
    { hi: '#5ce1ff', lo: '#00b8e6', glow: 'rgba(92, 225, 255, 0.55)' }, // cyan
    { hi: '#b8ff3c', lo: '#7aef00', glow: 'rgba(184, 255, 60, 0.5)' }, // lime
    { hi: '#c77dff', lo: '#9b4dff', glow: 'rgba(199, 125, 255, 0.55)' }, // violet
    { hi: '#ff9f43', lo: '#ff6b00', glow: 'rgba(255, 159, 67, 0.55)' }, // orange
    { hi: '#4dffa6', lo: '#00e676', glow: 'rgba(77, 255, 166, 0.5)' }, // mint
    { hi: '#ffe566', lo: '#ffd000', glow: 'rgba(255, 229, 102, 0.55)' }, // electric yellow
    { hi: '#ff6b6b', lo: '#ff3344', glow: 'rgba(255, 107, 107, 0.55)' }, // coral red
  ];

  function randomNeon() {
    return NEON_PALETTE[Math.floor(Math.random() * NEON_PALETTE.length)];
  }

  /** Board cells are null or { letter, neon }. Accept legacy bare strings. */
  function tileLetter(cell) {
    if (!cell) return null;
    if (typeof cell === 'string') return cell;
    return cell.letter || null;
  }

  function tileNeon(cell) {
    if (!cell || typeof cell === 'string') return null;
    return cell.neon || null;
  }

  function makeTile(letter, neon) {
    return {
      letter: String(letter).toUpperCase(),
      neon: neon || randomNeon(),
    };
  }

  function createPiece(shape, row, col) {
    var offsets = SHAPES[shape];
    var cells = [];
    var neon = randomNeon();
    for (var i = 0; i < offsets.length; i++) {
      cells.push({ dr: offsets[i][0], dc: offsets[i][1], letter: randomLetter() });
    }
    return {
      shape: shape,
      row: row,
      col: col,
      cells: normalizeCells(cells),
      neon: neon,
    };
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
    var neon = piece.neon || randomNeon();
    for (var i = 0; i < abs.length; i++) {
      var a = abs[i];
      if (a.row >= 0 && a.row < ROWS && a.col >= 0 && a.col < COLS) {
        board[a.row][a.col] = makeTile(a.letter, neon);
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
   * Remove cleared cells, then settle only tiles that are not attached to the
   * floor via an orthogonally connected grounded structure.
   *
   * - Grounded = reachable from any bottom-row tile through 4-connected tiles.
   *   Overhangs that are still part of that structure stay put (no column pack).
   * - Unattached tiles fall down their column until they rest on the floor or
   *   another tile. Only tiles whose row changes are listed in moves (for UI).
   * Neon travels with each tile object.
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
      var gone = board[cells[i].row] && board[cells[i].row][cells[i].col];
      if (gone) removed.push(tileLetter(gone));
      board[cells[i].row][cells[i].col] = null;
    }

    // Mark every tile attached (4-connected) to the floor.
    var grounded = {};
    var queue = [];
    var qh = 0;
    for (c = 0; c < COLS; c++) {
      if (board[ROWS - 1][c]) {
        key = ROWS - 1 + ',' + c;
        grounded[key] = true;
        queue.push({ row: ROWS - 1, col: c });
      }
    }
    var dirs = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    while (qh < queue.length) {
      var cur = queue[qh++];
      for (i = 0; i < dirs.length; i++) {
        var nr = cur.row + dirs[i][0];
        var nc = cur.col + dirs[i][1];
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        if (!board[nr][nc]) continue;
        key = nr + ',' + nc;
        if (grounded[key]) continue;
        grounded[key] = true;
        queue.push({ row: nr, col: nc });
      }
    }

    // Lift unattached tiles, then drop them bottom-first onto support.
    var floaters = [];
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        if (!board[r][c]) continue;
        key = r + ',' + c;
        if (grounded[key]) continue;
        floaters.push({ tile: board[r][c], fromRow: r, col: c });
        board[r][c] = null;
      }
    }
    floaters.sort(function (a, b) {
      if (b.fromRow !== a.fromRow) return b.fromRow - a.fromRow;
      return a.col - b.col;
    });

    for (i = 0; i < floaters.length; i++) {
      var f = floaters[i];
      var toRow = f.fromRow;
      while (toRow + 1 < ROWS && !board[toRow + 1][f.col]) toRow += 1;
      board[toRow][f.col] = f.tile;
      if (toRow !== f.fromRow) {
        var fall = toRow - f.fromRow;
        moves.push({
          letter: tileLetter(f.tile),
          neon: tileNeon(f.tile),
          col: f.col,
          fromRow: f.fromRow,
          toRow: toRow,
          durationMs: settleDurationForFall(fall),
        });
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
        var hLetter = c < COLS ? tileLetter(board[r][c]) : null;
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
        var vLetter = r < ROWS ? tileLetter(board[r][c]) : null;
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
      var cell = state.board[row] && state.board[row][col];
      var letter = tileLetter(cell);
      if (letter) {
        snapshot.push({
          row: row,
          col: col,
          letter: letter,
          neon: tileNeon(cell),
        });
      }
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
    tileLetter: tileLetter,
    tileNeon: tileNeon,
    makeTile: makeTile,
    plant: function (state, cells) {
      for (var i = 0; i < cells.length; i++) {
        state.board[cells[i].row][cells[i].col] = makeTile(
          cells[i].letter,
          cells[i].neon || null
        );
      }
    },
  };
})();
