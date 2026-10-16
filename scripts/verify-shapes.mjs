import { createServer } from 'vite';

const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
});

const pieces = await server.ssrLoadModule('/src/game/pieces.ts');
const board = await server.ssrLoadModule('/src/game/board.ts');
const game = await server.ssrLoadModule('/src/game/game.ts');

const { SHAPE_IDS, SHAPES, createPiece, absoluteCells } = pieces;
const { spawnPiece, tryMoveDown, tryRotate, lockPiece, createEmptyBoard, removeCellsAndApplyGravity, pieceFits } = board;
const { createInitialState, startGame, toggleSelect, submitWord, selectionWord } = game;

console.log('shapes', SHAPE_IDS.join(','));
for (const id of SHAPE_IDS) {
  console.log(id, 'cells', SHAPES[id].length, SHAPES[id]);
}

const b = createEmptyBoard();
const seen = new Set();
for (let i = 0; i < 200; i++) {
  const p = spawnPiece(createEmptyBoard());
  if (p) seen.add(p.shape);
}
console.log('spawned shapes in 200 tries', [...seen].sort().join(','), 'count', seen.size);

const state = createInitialState();
startGame(state);
console.log('active shape', state.active?.shape, 'cells', state.active?.cells.length);
console.log(
  'abs',
  absoluteCells(state.active).map((c) => `${c.letter}@${c.row},${c.col}`),
);

// Move / rotate / lock
const piece = state.active;
if (piece) {
  tryRotate(state.board, piece);
  while (tryMoveDown(state.board, piece)) {}
  lockPiece(state.board, piece);
  state.active = null;
}
console.log('locked filled', state.board.flat().filter(Boolean).length);

// Word clear
state.board[11][0] = 'C';
state.board[11][1] = 'A';
state.board[11][2] = 'T';
state.board[10][1] = 'X';
toggleSelect(state, 11, 0);
toggleSelect(state, 11, 1);
toggleSelect(state, 11, 2);
console.log('word', selectionWord(state));
const ok = submitWord(state);
console.log({
  ok,
  score: state.score,
  words: state.wordsFound,
  bottom: state.board[11].map((c) => c ?? '.').join(''),
  xSettled: state.board[11][1] === 'X',
});

await server.close();
