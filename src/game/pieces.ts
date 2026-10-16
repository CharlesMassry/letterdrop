import { randomLetter } from '../data/letters';

/** Local offsets from piece origin (row, col). */
export type Offset = readonly [number, number];

export type ShapeId = 'I' | 'L' | 'J' | 'O' | 'T' | 'S' | 'Z';

/** Base orientations matching the requested varieties. */
export const SHAPES: Record<ShapeId, readonly Offset[]> = {
  // 4 vertical
  I: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ],
  // 3 vertical + bottom right
  L: [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
  ],
  // 3 vertical + bottom left
  J: [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, -1],
  ],
  // 2×2 square
  O: [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ],
  // 3 vertical + middle right
  T: [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1],
  ],
  // 2 top horizontal, 2 bottom offset right
  S: [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 2],
  ],
  // 2 top horizontal, 2 bottom offset left
  Z: [
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 1],
  ],
};

export const SHAPE_IDS = Object.keys(SHAPES) as ShapeId[];

export interface PieceCell {
  /** Offset from piece origin. */
  dr: number;
  dc: number;
  letter: string;
}

export interface ActivePiece {
  shape: ShapeId;
  /** Board row of origin. */
  row: number;
  /** Board column of origin. */
  col: number;
  cells: PieceCell[];
}

/** Rotate offsets 90° clockwise around origin. */
export function rotateOffsetsClockwise(
  cells: PieceCell[],
): Array<{ dr: number; dc: number }> {
  return cells.map(({ dr, dc }) => ({ dr: dc, dc: -dr }));
}

/** Normalize so min dr/dc become the new origin offsets (keeps bounding box tidy). */
export function normalizeCells(
  cells: Array<{ dr: number; dc: number; letter?: string }>,
  letters?: string[],
): PieceCell[] {
  const minR = Math.min(...cells.map((c) => c.dr));
  const minC = Math.min(...cells.map((c) => c.dc));
  return cells.map((c, i) => ({
    dr: c.dr - minR,
    dc: c.dc - minC,
    letter: c.letter ?? letters?.[i] ?? 'A',
  }));
}

export function absoluteCells(
  piece: ActivePiece,
): Array<{ row: number; col: number; letter: string }> {
  return piece.cells.map(({ dr, dc, letter }) => ({
    row: piece.row + dr,
    col: piece.col + dc,
    letter,
  }));
}

export function randomShapeId(): ShapeId {
  return SHAPE_IDS[Math.floor(Math.random() * SHAPE_IDS.length)]!;
}

export function createPiece(
  shape: ShapeId,
  row: number,
  col: number,
): ActivePiece {
  const offsets = SHAPES[shape];
  const cells: PieceCell[] = offsets.map(([dr, dc]) => ({
    dr,
    dc,
    letter: randomLetter(),
  }));
  // Normalize J (has negative col) so origin is top-left of bbox
  const normalized = normalizeCells(cells);
  return { shape, row, col, cells: normalized };
}

export function pieceWidth(piece: ActivePiece): number {
  return Math.max(...piece.cells.map((c) => c.dc)) + 1;
}

export function pieceHeight(piece: ActivePiece): number {
  return Math.max(...piece.cells.map((c) => c.dr)) + 1;
}
