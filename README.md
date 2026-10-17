# Letterdrop

Falling letter tetrominoes meet word-building. Line up dictionary words on an 8×12 board before the two-minute timer ends.

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
2. **↑** / **X** rotates; **Space** hard-drops.
3. **Line up** letters in a row or column — dictionary words score when a piece lands.
4. Or **tap** adjacent landed letters — a valid word auto-scores (**Submit** / **Enter** also work).
5. When time runs out or the board fills, see your score and play again.

## Stack

Static HTML/CSS/JS only. The dictionary (~7k common English words) lives in `js/words.js` as a global.
