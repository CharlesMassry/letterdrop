/** Scrabble-style letter values. */
export const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

/** Approximate Scrabble bag weights for spawning. */
const SPAWN_WEIGHTS: [string, number][] = [
  ['E', 12], ['A', 9], ['I', 9], ['O', 8], ['N', 6], ['R', 6], ['T', 6],
  ['L', 4], ['S', 4], ['U', 4], ['D', 4], ['G', 3], ['B', 2], ['C', 2],
  ['M', 2], ['P', 2], ['F', 2], ['H', 2], ['V', 2], ['W', 2], ['Y', 2],
  ['K', 1], ['J', 1], ['X', 1], ['Q', 1], ['Z', 1],
];

const totalWeight = SPAWN_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);

export function randomLetter(): string {
  let roll = Math.random() * totalWeight;
  for (const [letter, weight] of SPAWN_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) return letter;
  }
  return 'E';
}

export function letterValue(letter: string): number {
  return LETTER_VALUES[letter.toUpperCase()] ?? 1;
}

/** Base score = sum of letter values × length bonus (≥3). */
export function scoreWord(word: string): number {
  const upper = word.toUpperCase();
  const base = [...upper].reduce((sum, ch) => sum + letterValue(ch), 0);
  const lengthBonus = Math.max(0, upper.length - 2);
  return base * (1 + lengthBonus);
}
