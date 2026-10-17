# Letterdrop

Falling letter **tetrominoes** meet word-building. Guide multi-cell letter blocks (7 shapes: I, L, J, O, T, S, Z) down an 8×12 board, then chain adjacent landed letters into English words before the two-minute round ends.

Longer words and rarer letters score more (Scrabble-style values). Scoring a word clears those tiles and the board settles. Invalid submissions give quick feedback without stopping play.

## How to play

1. **Move** the falling piece with `←` `→` `↓` (or on-screen controls on touch).
2. **↑** (or **X**) rotates; **Space** hard-drops.
3. **Line up** letters in a contiguous row or column — dictionary words score automatically when a piece lands (and clear with gravity).
4. Or **tap** adjacent landed letters in order — a valid word auto-scores (you can also press **Submit** / **Enter**). **Esc** clears a partial selection.
5. Survive the stack and the clock — when time runs out (or the board fills), see your score and play again.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default in this project: port **3847**).

```bash
npm run build   # production build to dist/
npm run preview # preview the production build
```

## Stack

Vanilla TypeScript + Vite. No backend, auth, or database — the dictionary is bundled (~7k common English words, 3–8 letters).
