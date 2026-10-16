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
    endReason: null,
  };
}

function lockAndSpawn(state: GameState): void {
  if (state.active) {
    lockPiece(state.board, state.active);
    state.active = null;
  }
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
  state.score = 0;
  state.wordsFound = 0;
  state.timeLeftMs = ROUND_MS;
  state.dropIntervalMs = INITIAL_DROP_MS;
  state.feedback = 'Form words from landed letters — tap or click to select.';
  state.feedbackKind = 'info';
  state.endReason = null;
  state.active = spawnPiece(state.board);
}

export function endGame(state: GameState, reason: 'time' | 'full'): void {
  state.phase = 'ended';
  state.active = null;
  state.selection = [];
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
}

export function toggleSelect(
  state: GameState,
  row: number,
  col: number,
): void {
  if (state.phase !== 'playing') return;
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
  if (!state.board[row][col]) return;

  const idx = state.selection.findIndex((s) => s.row === row && s.col === col);
  if (idx >= 0) {
    if (idx === state.selection.length - 1) {
      state.selection.pop();
    }
    return;
  }

  if (state.selection.length === 0) {
    state.selection.push({ row, col });
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
  state.feedback = null;
  state.feedbackKind = null;
}

export function selectionWord(state: GameState): string {
  return state.selection
    .map(({ row, col }) => state.board[row][col] ?? '')
    .join('');
}

/** If gravity filled cells under the active piece, nudge it up into free space. */
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
    if (state.feedbackKind === 'ok') return false;
    state.feedback = 'Select adjacent letters, then submit.';
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

  const points = scoreWord(word);
  const cleared = removeCellsAndApplyGravity(state.board, state.selection);
  state.selection = [];
  state.score += points;
  state.wordsFound += 1;
  state.feedback = `+${points} · ${word.toUpperCase()}`;
  state.feedbackKind = 'ok';
  resolveActiveOverlap(state);

  state.dropIntervalMs = Math.max(
    MIN_DROP_MS,
    INITIAL_DROP_MS - state.wordsFound * 25,
  );

  if (cleared.length === 0) {
    state.feedback = 'Could not clear those letters — try again.';
    state.feedbackKind = 'error';
    return false;
  }
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

export { absoluteCells };
