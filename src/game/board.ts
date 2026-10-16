import type { ActivePiece } from './pieces';
import { absoluteCells, createPiece, normalizeCells, randomShapeId, rotateOffsetsClockwise } from './pieces';

export const COLS = 8;
export const ROWS = 12;

export type Cell = string | null;

export type { ActivePiece };

export function createEmptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
}

export function cloneBoard(board: Cell[][]): Cell[][] {
  return board.map((row) => [...row]);
}

export function cellsFit(
  board: Cell[][],
  abs: Array<{ row: number; col: number }>,
): boolean {
  for (const { row, col } of abs) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
    if (board[row][col] !== null) return false;
  }
  return true;
}

export function pieceFits(
  board: Cell[][],
  piece: ActivePiece,
  row = piece.row,
  col = piece.col,
  cells = piece.cells,
): boolean {
  const abs = cells.map(({ dr, dc }) => ({
    row: row + dr,
    col: col + dc,
  }));
  return cellsFit(board, abs);
}

export function lockPiece(board: Cell[][], piece: ActivePiece): void {
  for (const { row, col, letter } of absoluteCells(piece)) {
    if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
      board[row][col] = letter;
    }
  }
}

/** Soft drop one row; returns false if blocked (should lock). */
export function tryMoveDown(board: Cell[][], piece: ActivePiece): boolean {
  if (!pieceFits(board, piece, piece.row + 1, piece.col)) return false;
  piece.row += 1;
  return true;
}

export function tryMoveHorizontal(
  board: Cell[][],
  piece: ActivePiece,
  dir: -1 | 1,
): boolean {
  if (!pieceFits(board, piece, piece.row, piece.col + dir)) return false;
  piece.col += dir;
  return true;
}

/** Rotate 90° clockwise with simple wall kicks (shift left/right/up). */
export function tryRotate(board: Cell[][], piece: ActivePiece): boolean {
  if (piece.shape === 'O') return true; // square — rotation is a no-op visually

  const rotated = normalizeCells(
    rotateOffsetsClockwise(piece.cells).map((c, i) => ({
      ...c,
      letter: piece.cells[i]!.letter,
    })),
  );

  const kicks: Array<[number, number]> = [
    [0, 0],
    [0, -1],
    [0, 1],
    [0, -2],
    [0, 2],
    [-1, 0],
    [-1, -1],
    [-1, 1],
  ];

  for (const [dRow, dCol] of kicks) {
    const row = piece.row + dRow;
    const col = piece.col + dCol;
    if (pieceFits(board, piece, row, col, rotated)) {
      piece.row = row;
      piece.col = col;
      piece.cells = rotated;
      return true;
    }
  }
  return false;
}

export function isBoardFull(board: Cell[][]): boolean {
  return board[0].some((cell) => cell !== null);
}

/** Spawn a random tetromino near the top center if it fits. */
export function spawnPiece(board: Cell[][]): ActivePiece | null {
  const shape = randomShapeId();
  // Try a few horizontal positions near center
  const centers = [3, 2, 4, 1, 5, 0, 6];
  for (const col of centers) {
    const piece = createPiece(shape, 0, col);
    if (pieceFits(board, piece)) return piece;
  }
  // Last resort: any column
  for (let col = 0; col < COLS; col++) {
    const piece = createPiece(shape, 0, col);
    if (pieceFits(board, piece)) return piece;
  }
  return null;
}

/**
 * Remove selected cells, then apply gravity column-wise.
 * Returns letters removed in selection order.
 */
export function removeCellsAndApplyGravity(
  board: Cell[][],
  cells: Array<{ row: number; col: number }>,
): string[] {
  const removed: string[] = [];
  const key = (r: number, c: number) => `${r},${c}`;
  const toRemove = new Set(cells.map(({ row, col }) => key(row, col)));

  for (const { row, col } of cells) {
    const letter = board[row]?.[col];
    if (letter) removed.push(letter);
  }

  for (let c = 0; c < COLS; c++) {
    const stack: string[] = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (toRemove.has(key(r, c))) continue;
      const letter = board[r][c];
      if (letter) stack.push(letter);
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      const fromBottom = ROWS - 1 - r;
      board[r][c] = stack[fromBottom] ?? null;
    }
  }

  return removed;
}

export function areAdjacent(
  a: { row: number; col: number },
  b: { row: number; col: number },
): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

export function filledCount(board: Cell[][]): number {
  let n = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell) n += 1;
    }
  }
  return n;
}

/** Map of active letter by "row,col" for rendering. */
export function activeCellMap(
  piece: ActivePiece | null,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!piece) return map;
  for (const { row, col, letter } of absoluteCells(piece)) {
    map.set(`${row},${col}`, letter);
  }
  return map;
}
