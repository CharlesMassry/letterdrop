import { WORD_SET } from '../data/words';
import { scoreWord } from '../data/letters';
import { COLS, ROWS } from './board';
import type { Cell } from './board';

export interface BoardWord {
  word: string;
  cells: Array<{ row: number; col: number }>;
  points: number;
}

/**
 * Find dictionary words spelled by contiguous horizontal or vertical
 * letter runs on the board (case-insensitive). Prefers longer matches;
 * returns non-overlapping claims (longest / highest score first).
 */
export function findLinedUpWords(board: Cell[][]): BoardWord[] {
  const candidates: BoardWord[] = [];

  const considerRun = (
    cells: Array<{ row: number; col: number; letter: string }>,
  ) => {
    if (cells.length < 3) return;
    const letters = cells.map((c) => c.letter.toLowerCase());
    // Every substring length >= 3
    for (let start = 0; start < letters.length; start++) {
      for (let end = start + 3; end <= letters.length; end++) {
        const word = letters.slice(start, end).join('');
        if (WORD_SET.has(word)) {
          const slice = cells.slice(start, end).map(({ row, col }) => ({
            row,
            col,
          }));
          candidates.push({
            word,
            cells: slice,
            points: scoreWord(word),
          });
        }
      }
    }
  };

  // Horizontal runs
  for (let r = 0; r < ROWS; r++) {
    let run: Array<{ row: number; col: number; letter: string }> = [];
    for (let c = 0; c <= COLS; c++) {
      const letter = c < COLS ? board[r][c] : null;
      if (letter) {
        run.push({ row: r, col: c, letter });
      } else if (run.length) {
        considerRun(run);
        run = [];
      }
    }
  }

  // Vertical runs
  for (let c = 0; c < COLS; c++) {
    let run: Array<{ row: number; col: number; letter: string }> = [];
    for (let r = 0; r <= ROWS; r++) {
      const letter = r < ROWS ? board[r][c] : null;
      if (letter) {
        run.push({ row: r, col: c, letter });
      } else if (run.length) {
        considerRun(run);
        run = [];
      }
    }
  }

  // Longest first, then highest points — greedily take non-overlapping
  candidates.sort((a, b) => {
    if (b.cells.length !== a.cells.length) return b.cells.length - a.cells.length;
    return b.points - a.points;
  });

  const used = new Set<string>();
  const key = (r: number, c: number) => `${r},${c}`;
  const claimed: BoardWord[] = [];

  for (const cand of candidates) {
    if (cand.cells.some(({ row, col }) => used.has(key(row, col)))) continue;
    for (const { row, col } of cand.cells) used.add(key(row, col));
    claimed.push(cand);
  }

  return claimed;
}

/** True if `word` (any case) is in the bundled dictionary. */
export function isDictionaryWord(word: string): boolean {
  return WORD_SET.has(word.toLowerCase());
}
