export const COLS = 8;
export const ROWS = 12;

export type Cell = string | null;

export interface ActivePiece {
  col: number;
  row: number;
  letter: string;
}

export function createEmptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
}

export function cloneBoard(board: Cell[][]): Cell[][] {
  return board.map((row) => [...row]);
}

export function canPlace(board: Cell[][], col: number, row: number): boolean {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  return board[row][col] === null;
}

export function lockPiece(board: Cell[][], piece: ActivePiece): void {
  if (piece.row >= 0 && piece.row < ROWS && piece.col >= 0 && piece.col < COLS) {
    board[piece.row][piece.col] = piece.letter;
  }
}

/** Soft drop one row; returns false if blocked (should lock). */
export function tryMoveDown(board: Cell[][], piece: ActivePiece): boolean {
  if (!canPlace(board, piece.col, piece.row + 1)) return false;
  piece.row += 1;
  return true;
}

export function tryMoveHorizontal(
  board: Cell[][],
  piece: ActivePiece,
  dir: -1 | 1,
): boolean {
  const next = piece.col + dir;
  if (!canPlace(board, next, piece.row)) return false;
  piece.col = next;
  return true;
}

export function isBoardFull(board: Cell[][]): boolean {
  return board[0].some((cell) => cell !== null);
}

export function boardHasSpawnSpace(board: Cell[][], col: number): boolean {
  return board[0][col] === null;
}

/**
 * Remove selected cells (list of {r,c}), then apply gravity column-wise.
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

/** Count filled cells — useful for UI. */
export function filledCount(board: Cell[][]): number {
  let n = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell) n += 1;
    }
  }
  return n;
}
