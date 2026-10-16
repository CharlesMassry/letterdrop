# Letterdrop

Falling letters meet word-building. Guide letter blocks down an 8×12 board, then chain adjacent landed letters into English words before the two-minute round ends.

Longer words and rarer letters score more (Scrabble-style values). Invalid submissions give quick feedback without stopping play.

## How to play

1. **Move** the falling letter with `←` `→` `↓` (or on-screen controls on touch).
2. **Space** hard-drops the piece.
3. **Click / tap** adjacent letters (up/down/left/right) to spell a word of 3+ letters.
4. **Enter** (or **Submit**) scores a valid dictionary word and clears those tiles; **Esc** clears your selection.
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
