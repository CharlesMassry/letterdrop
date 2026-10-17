import { WORD_SET } from '../data/words';
import { scoreWord } from '../data/letters';
import {
  COLS,
  ROWS,
  areAdjacent,
  createEmptyBoard,
  isBoardFull,
  lockPiece,
  pieceFits,
  removeCellsAndApplyGravity,
  spawnPiece,
  tryMoveDown,
  tryMoveHorizontal,
  tryRotate,
} from './board';
import type { ActivePiece, Cell } from './board';
import { absoluteCells } from './pieces';
import { findLinedUpWords, isDictionaryWord } from './words-on-board';

export type GamePhase = 'title' | 'playing' | 'ended';

export interface GameState {
  phase: GamePhase;
  board: Cell[][];
  active: ActivePiece | null;
  selection: Array<{ row: number; col: number }>;
  score: number;
  wordsFound: number;
  timeLeftMs: number;
  dropIntervalMs: number;
  feedback: string | null;
  feedbackKind: 'ok' | 'error' | 'info' | null;
  /** True when current selection is a dictionary word ready to score. */
  selectionValid: boolean;
  endReason: 'time' | 'full' | null;
}

export const ROUND_MS = 120_000;
const INITIAL_DROP_MS = 900;
const MIN_DROP_MS = 350;

export function createInitialState(): GameState {
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

function refreshSelectionValid(state: GameState): void {
  const word = selectionWord(state);
  state.selectionValid =
    word.length >= 3 && isDictionaryWord(word);
}

function applyScoreClear(
  state: GameState,
  word: string,
  cells: Array<{ row: number; col: number }>,
): boolean {
  const points = scoreWord(word);
  const cleared = removeCellsAndApplyGravity(state.board, cells);
  if (cleared.length === 0) return false;

  state.selection = [];
  state.selectionValid = false;
  state.score += points;
  state.wordsFound += 1;
  state.feedback = `+${points} · ${word.toUpperCase()}`;
  state.feedbackKind = 'ok';
  state.dropIntervalMs = Math.max(
    MIN_DROP_MS,
    INITIAL_DROP_MS - state.wordsFound * 25,
  );
  resolveActiveOverlap(state);
  return true;
}

/**
 * After pieces land, auto-score contiguous horizontal/vertical dictionary
 * words (e.g. lined-up SAY). Longer matches win when cells overlap.
 */
export function claimLinedUpWords(state: GameState): number {
  if (state.phase !== 'playing') return 0;
  let claimed = 0;
  // Loop: gravity may create new lined-up words after a clear
  for (let guard = 0; guard < 8; guard++) {
    const words = findLinedUpWords(state.board);
    if (words.length === 0) break;
    // Claim one best word per pass so gravity can open new ones
    const best = words[0]!;
    if (!applyScoreClear(state, best.word, best.cells)) break;
    claimed += 1;
  }
  return claimed;
}

function lockAndSpawn(state: GameState): void {
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

export function startGame(state: GameState): void {
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

export function endGame(state: GameState, reason: 'time' | 'full'): void {
  state.phase = 'ended';
  state.active = null;
  state.selection = [];
  state.selectionValid = false;
  state.endReason = reason;
  state.feedback = null;
  state.feedbackKind = null;
}

export function tickDrop(state: GameState): void {
  if (state.phase !== 'playing' || !state.active) return;
  if (!tryMoveDown(state.board, state.active)) {
    lockAndSpawn(state);
  }
}

export function hardDrop(state: GameState): void {
  if (state.phase !== 'playing' || !state.active) return;
  while (tryMoveDown(state.board, state.active)) {
    /* fall */
  }
  lockAndSpawn(state);
}

export function moveLeft(state: GameState): void {
  if (state.phase !== 'playing' || !state.active) return;
  tryMoveHorizontal(state.board, state.active, -1);
}

export function moveRight(state: GameState): void {
  if (state.phase !== 'playing' || !state.active) return;
  tryMoveHorizontal(state.board, state.active, 1);
}

export function softDrop(state: GameState): void {
  if (state.phase !== 'playing' || !state.active) return;
  if (!tryMoveDown(state.board, state.active)) {
    lockAndSpawn(state);
  }
}

export function rotate(state: GameState): void {
  if (state.phase !== 'playing' || !state.active) return;
  tryRotate(state.board, state.active);
}

export function clearSelection(state: GameState): void {
  state.selection = [];
  state.selectionValid = false;
}

/**
 * If (row,col) sits inside a lined-up dictionary word and nothing is selected yet,
 * select that whole word (so one tap can claim SAY).
 */
function trySelectLinedUpAt(
  state: GameState,
  row: number,
  col: number,
): boolean {
  const words = findLinedUpWords(state.board);
  const hit = words.find((w) =>
    w.cells.some((c) => c.row === row && c.col === col),
  );
  if (!hit) return false;
  applyScoreClear(state, hit.word, hit.cells);
  // Gravity may create more lined-up words
  claimLinedUpWords(state);
  return true;
}

export function toggleSelect(
  state: GameState,
  row: number,
  col: number,
): void {
  if (state.phase !== 'playing') return;
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
  if (!state.board[row][col]) return;

  // Empty selection + tap on a lined-up word → claim it immediately
  if (state.selection.length === 0 && trySelectLinedUpAt(state, row, col)) {
    return;
  }

  const idx = state.selection.findIndex((s) => s.row === row && s.col === col);
  if (idx >= 0) {
    if (idx === state.selection.length - 1) {
      state.selection.pop();
      refreshSelectionValid(state);
    }
    return;
  }

  if (state.selection.length === 0) {
    state.selection.push({ row, col });
    refreshSelectionValid(state);
    return;
  }

  const last = state.selection[state.selection.length - 1]!;
  if (!areAdjacent(last, { row, col })) {
    state.feedback = 'Letters must be adjacent (up/down/left/right).';
    state.feedbackKind = 'error';
    return;
  }

  if (state.selection.some((s) => s.row === row && s.col === col)) return;

  state.selection.push({ row, col });
  refreshSelectionValid(state);

  // Auto-score as soon as the path is a valid dictionary word
  if (state.selectionValid) {
    const word = selectionWord(state).toLowerCase();
    applyScoreClear(state, word, [...state.selection]);
    claimLinedUpWords(state);
  }
}

export function selectionWord(state: GameState): string {
  return state.selection
    .map(({ row, col }) => state.board[row][col] ?? '')
    .join('');
}

function resolveActiveOverlap(state: GameState): void {
  if (!state.active) return;
  while (state.active.row >= 0 && !pieceFits(state.board, state.active)) {
    state.active.row -= 1;
  }
  if (state.active.row < 0 || !pieceFits(state.board, state.active)) {
    endGame(state, 'full');
  }
}

export function submitWord(state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  const word = selectionWord(state).toLowerCase();

  if (state.selection.length === 0) {
    // Try claiming any lined-up words if player hits Submit with nothing selected
    const n = claimLinedUpWords(state);
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

  if (!WORD_SET.has(word)) {
    state.feedback = `"${word.toUpperCase()}" isn't in the dictionary.`;
    state.feedbackKind = 'error';
    return false;
  }

  const cells = [...state.selection];
  const ok = applyScoreClear(state, word, cells);
  if (!ok) {
    state.feedback = 'Could not clear those letters — try again.';
    state.feedbackKind = 'error';
    return false;
  }
  claimLinedUpWords(state);
  return true;
}

export function tickTimer(state: GameState, dtMs: number): void {
  if (state.phase !== 'playing') return;
  state.timeLeftMs = Math.max(0, state.timeLeftMs - dtMs);
  if (state.timeLeftMs <= 0) {
    endGame(state, 'time');
  }
}

export function formatTime(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export { absoluteCells, isDictionaryWord, findLinedUpWords };
