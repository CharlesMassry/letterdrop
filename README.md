# Letterdrop

Falling letter tetrominoes meet word-building. Line up dictionary words on an 8×12 board before the two-minute timer ends.

## Play (easiest — do this)

```bash
npm install
npm start
```

Then open **http://127.0.0.1:3847** in your browser.

`npm start` = build a static site into `dist/` + serve it. Leave the terminal open while you play. Ctrl+C stops the server.

Already built once?

```bash
npm run play
```

### If the page “hangs” or never loads (Windows / WSL)

That almost always means **no game server is running**, or the browser opened a bad URL:

| What you did | What happens |
| --- | --- |
| Opened `http://127.0.0.1:3847` with no terminal server | Browser spins / pending forever |
| Double-clicked `index.html` (`file://…`) | ES modules fail — blank or hung page |
| Used Vite `npm run dev` then closed the terminal | Dev server died; refresh hangs |

**Fix:** in the project folder run `npm start`, wait until you see `Letterdrop (static build)`, then visit **http://127.0.0.1:3847** (not `file://`).

WSL tip: run the commands inside your WSL distro, then open that URL in Windows Chrome/Edge.

### Public hosted URL

This repo is **private on Origin** with no GitHub Pages / public static host hooked up, so there is **no shareable https play link** from this environment. Anyone who can clone can run `npm start` locally. If you later enable GitHub Pages (or any static host), publish the contents of `dist/` — it is plain HTML/CSS/JS with relative asset paths.

## How to play

1. **Move** with `←` `→` `↓` (on-screen controls on touch).
2. **↑** / **X** rotates; **Space** hard-drops.
3. **Line up** letters in a row or column — dictionary words score when a piece lands.
4. Or **tap** adjacent landed letters — a valid word auto-scores (**Submit** / **Enter** also work).
5. When time runs out or the board fills, see your score and play again.

## Dev (optional)

```bash
npm run dev       # Vite HMR on port 3847
npm run build     # writes static files to dist/
npm run preview   # Vite’s static preview of dist/
```

## Stack

Vanilla TypeScript + Vite. `dist/` after build is fully static (no backend, no auth, no database). Dictionary (~7k common English words) is bundled into the JS.
