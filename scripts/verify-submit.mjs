import { createServer } from 'vite';

const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
});

const mod = await server.ssrLoadModule('/src/game/game.ts');
const boardMod = await server.ssrLoadModule('/src/game/board.ts');
const wordsMod = await server.ssrLoadModule('/src/data/words.ts');

const { createInitialState, startGame, toggleSelect, submitWord, selectionWord } = mod;
const { filledCount } = boardMod;
const { WORD_SET } = wordsMod;

const state = createInitialState();
startGame(state);

state.board[11][0] = 'C';
state.board[11][1] = 'A';
state.board[11][2] = 'T';
state.board[10][1] = 'X';
console.log('has cat', WORD_SET.has('cat'), 'before', filledCount(state.board));

toggleSelect(state, 11, 0);
toggleSelect(state, 11, 1);
toggleSelect(state, 11, 2);
console.log('selection', selectionWord(state));

const ok = submitWord(state);
console.log({
  ok,
  score: state.score,
  words: state.wordsFound,
  fb: state.feedback,
  kind: state.feedbackKind,
  after: filledCount(state.board),
  bottom: state.board[11].map((c) => c ?? '.').join(''),
  row10: state.board[10].map((c) => c ?? '.').join(''),
  xSettled: state.board[11][1] === 'X',
});

state.board[11][3] = 'Q';
state.board[11][4] = 'Q';
state.board[11][5] = 'Q';
toggleSelect(state, 11, 3);
toggleSelect(state, 11, 4);
toggleSelect(state, 11, 5);
const scoreBefore = state.score;
const bad = submitWord(state);
console.log({
  bad,
  fb: state.feedback,
  qqq: [state.board[11][3], state.board[11][4], state.board[11][5]],
  scoreUnchanged: state.score === scoreBefore,
});

await server.close();
