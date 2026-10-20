# Letterdrop

Falling letter tetrominoes meet word-building. Line up dictionary words on an 8×12 board — keep going until the stack reaches the top. Scoring uses **Scrabble letter values** (shown on each tile); words you find this round appear in a live list.

## Play (no install)

1. Open this folder.
2. Double-click **`index.html`** (or right-click → Open with your browser).

That’s it — plain HTML + CSS + JavaScript. No npm, no Vite, no build step.

Files that must stay together:

```
index.html
favicon.svg
css/style.css
js/words.js
js/game.js
js/main.js
```

### If the page is blank

Very old browsers sometimes block local scripts; if so, run any tiny static server from this folder, then visit the printed URL:

```bash
python3 -m http.server 3847
```

Then open http://127.0.0.1:3847/

## How to play

1. **Move** with `←` `→` `↓` (on-screen controls on touch).
2. **↑** / **X** rotates; **Space** hard-drops (locks immediately).
3. When a piece **rests** on the floor or another tile, you get **0.5s** to slide/rotate before it locks. A successful move resets the timer; moving off a ledge clears it and falling resumes.
4. **Line up** letters in a row or column — dictionary words score automatically when a piece lands (and after cascades).
5. Cleared letters disintegrate; remaining tiles **glide** down into place.
6. When the board fills (no room to spawn), see your score and play again.

## Stack

Static HTML/CSS/JS only. The dictionary (~7k common English words) lives in `js/words.js` as a global.
