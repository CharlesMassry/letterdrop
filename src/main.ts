import './style.css';
import { COLS, ROWS } from './game/board';
import {
  clearSelection,
  createInitialState,
  formatTime,
  hardDrop,
  moveLeft,
  moveRight,
  selectionWord,
  softDrop,
  startGame,
  submitWord,
  tickDrop,
  tickTimer,
  toggleSelect,
} from './game/game';
import type { GameState } from './game/game';

const app = document.querySelector<HTMLDivElement>('#app')!;
const state: GameState = createInitialState();

let lastTs = 0;
let dropAccum = 0;
let feedbackClearTimer: number | null = null;
let needsRender = true;
let lastRenderedPhase = state.phase;
let lastTimerText = '';

function brandSpans(text: string): string {
  return [...text]
    .map((ch) => `<span>${ch === ' ' ? '&nbsp;' : ch}</span>`)
    .join('');
}

function markDirty(): void {
  needsRender = true;
}

function renderTitle(): string {
  return `
    <div class="atmosphere" aria-hidden="true"></div>
    <main class="screen title-screen">
      <h1 class="brand" aria-label="Letterdrop">${brandSpans('Letterdrop')}</h1>
      <p class="tagline">Falling letters. Rising words. Two minutes to spell your way up the board.</p>
      <ul class="howto">
        <li><strong>← → ↓</strong> move · <strong>Space</strong> hard drop</li>
        <li><strong>Click / tap</strong> adjacent letters to spell</li>
        <li><strong>Enter</strong> submit · <strong>Esc</strong> clear selection</li>
        <li>Longer words &amp; rare letters score more</li>
      </ul>
      <div class="title-actions">
        <button type="button" class="btn" data-action="start">Play</button>
      </div>
    </main>
  `;
}

function renderEnd(): string {
  const reason =
    state.endReason === 'full'
      ? 'Board full — no room to drop.'
      : "Time's up.";
  return `
    <div class="atmosphere" aria-hidden="true"></div>
    <main class="screen end-screen">
      <p class="end-brand">Letterdrop</p>
      <h1>${state.endReason === 'full' ? 'Stacked out' : 'Round over'}</h1>
      <p class="end-score">${state.score}</p>
      <p class="end-meta">${reason} · ${state.wordsFound} word${state.wordsFound === 1 ? '' : 's'}</p>
      <div class="end-actions">
        <button type="button" class="btn" data-action="start">Play again</button>
        <button type="button" class="btn btn-ghost" data-action="title">Title</button>
      </div>
    </main>
  `;
}

function cellClass(row: number, col: number): string {
  const classes = ['cell'];
  const active = state.active;
  if (active && active.row === row && active.col === col) {
    classes.push('active');
  } else if (state.board[row][col]) {
    classes.push('filled');
  }
  const selIdx = state.selection.findIndex((s) => s.row === row && s.col === col);
  if (selIdx >= 0) classes.push('selected');
  return classes.join(' ');
}

function renderBoard(): string {
  const cells: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let letter = state.board[r][c] ?? '';
      if (state.active && state.active.row === r && state.active.col === c) {
        letter = state.active.letter;
      }
      const selIdx = state.selection.findIndex((s) => s.row === r && s.col === c);
      const order =
        selIdx >= 0 ? `<span class="sel-order">${selIdx + 1}</span>` : '';
      cells.push(
        `<button type="button" class="${cellClass(r, c)}" data-row="${r}" data-col="${c}" aria-label="${letter ? `Letter ${letter}` : 'Empty'}">${letter}${order}</button>`,
      );
    }
  }
  return `<div class="board" role="grid" aria-label="Letter board">${cells.join('')}</div>`;
}

function renderPlay(): string {
  const word = selectionWord(state);
  const urgent = state.timeLeftMs <= 30_000;
  const fbClass = [
    'feedback',
    state.feedbackKind === 'ok' ? 'ok' : '',
    state.feedbackKind === 'error' ? 'error' : '',
  ]
    .filter(Boolean)
    .join(' ');

  lastTimerText = formatTime(state.timeLeftMs);

  return `
    <div class="atmosphere" aria-hidden="true"></div>
    <main class="screen play-screen">
      <div class="hud">
        <div class="hud-stat">
          <span class="label">Score</span>
          <span class="value" data-hud="score">${state.score}</span>
        </div>
        <div class="hud-stat timer${urgent ? ' urgent' : ''}" data-hud="timer-wrap">
          <span class="label">Time</span>
          <span class="value" data-hud="timer">${lastTimerText}</span>
        </div>
        <div class="hud-stat">
          <span class="label">Words</span>
          <span class="value" data-hud="words">${state.wordsFound}</span>
        </div>
      </div>
      <div class="board-wrap">${renderBoard()}</div>
      <div class="word-bar">
        <div class="word-preview${word ? '' : ' empty'}" aria-live="polite" data-hud="word">
          ${word || 'Select adjacent letters…'}
        </div>
        <div class="${fbClass}" aria-live="assertive" data-hud="feedback">${state.feedback ?? ''}</div>
        <div class="actions">
          <button type="button" class="btn btn-ghost" data-action="clear">Clear</button>
          <button type="button" class="btn btn-coral" data-action="submit">Submit</button>
        </div>
      </div>
      <div class="touch-pad" aria-label="Move controls">
        <span class="spacer"></span>
        <button type="button" class="btn" data-action="hard">↓↓</button>
        <span class="spacer"></span>
        <button type="button" class="btn" data-action="left">←</button>
        <button type="button" class="btn" data-action="down">↓</button>
        <button type="button" class="btn" data-action="right">→</button>
      </div>
      <p class="hint-keys">Arrows move · Space drop · Enter submit · Esc clear</p>
    </main>
  `;
}

function render(): void {
  if (state.phase === 'title') {
    app.innerHTML = renderTitle();
  } else if (state.phase === 'ended') {
    app.innerHTML = renderEnd();
  } else {
    app.innerHTML = renderPlay();
  }
  lastRenderedPhase = state.phase;
  needsRender = false;
}

function updateTimerHud(): void {
  const text = formatTime(state.timeLeftMs);
  if (text === lastTimerText) return;
  lastTimerText = text;
  const el = app.querySelector<HTMLElement>('[data-hud="timer"]');
  const wrap = app.querySelector<HTMLElement>('[data-hud="timer-wrap"]');
  if (el) el.textContent = text;
  if (wrap) wrap.classList.toggle('urgent', state.timeLeftMs <= 30_000);
}

function scheduleFeedbackClear(): void {
  if (feedbackClearTimer !== null) window.clearTimeout(feedbackClearTimer);
  if (state.feedbackKind === 'ok' || state.feedbackKind === 'error') {
    feedbackClearTimer = window.setTimeout(() => {
      if (state.phase === 'playing' && state.feedbackKind !== 'info') {
        state.feedback = null;
        state.feedbackKind = null;
        markDirty();
      }
    }, 2200);
  }
}

function onStart(): void {
  startGame(state);
  lastTs = performance.now();
  dropAccum = 0;
  markDirty();
}

app.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>(
    '[data-action], [data-row]',
  );
  if (!target) return;

  const action = target.dataset.action;
  if (action === 'start') {
    onStart();
    return;
  }
  if (action === 'title') {
    Object.assign(state, createInitialState());
    markDirty();
    return;
  }
  if (action === 'submit') {
    submitWord(state);
    scheduleFeedbackClear();
    markDirty();
    return;
  }
  if (action === 'clear') {
    clearSelection(state);
    markDirty();
    return;
  }
  if (action === 'left') {
    moveLeft(state);
    markDirty();
    return;
  }
  if (action === 'right') {
    moveRight(state);
    markDirty();
    return;
  }
  if (action === 'down') {
    softDrop(state);
    markDirty();
    return;
  }
  if (action === 'hard') {
    hardDrop(state);
    markDirty();
    return;
  }

  if (target.dataset.row !== undefined && target.dataset.col !== undefined) {
    toggleSelect(state, Number(target.dataset.row), Number(target.dataset.col));
    scheduleFeedbackClear();
    markDirty();
  }
});

window.addEventListener('keydown', (e) => {
  if (state.phase === 'title' && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    onStart();
    return;
  }
  if (state.phase === 'ended' && e.key === 'Enter') {
    e.preventDefault();
    onStart();
    return;
  }
  if (state.phase !== 'playing') return;

  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault();
      moveLeft(state);
      markDirty();
      break;
    case 'ArrowRight':
      e.preventDefault();
      moveRight(state);
      markDirty();
      break;
    case 'ArrowDown':
      e.preventDefault();
      softDrop(state);
      markDirty();
      break;
    case ' ':
      e.preventDefault();
      hardDrop(state);
      markDirty();
      break;
    case 'Enter':
      e.preventDefault();
      submitWord(state);
      scheduleFeedbackClear();
      markDirty();
      break;
    case 'Escape':
    case 'Backspace':
      e.preventDefault();
      clearSelection(state);
      markDirty();
      break;
    default:
      break;
  }
});

function frame(ts: number): void {
  if (state.phase === 'playing') {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(64, ts - lastTs);
    lastTs = ts;

    const prevPhase = state.phase;
    tickTimer(state, dt);
    dropAccum += dt;
    let dropped = false;
    while (dropAccum >= state.dropIntervalMs && state.phase === 'playing') {
      dropAccum -= state.dropIntervalMs;
      tickDrop(state);
      dropped = true;
    }

    if (state.phase !== prevPhase || dropped) {
      markDirty();
    } else if (state.phase === 'playing' && lastRenderedPhase === 'playing') {
      updateTimerHud();
    }
  } else {
    lastTs = 0;
    dropAccum = 0;
  }

  if (needsRender) render();
  requestAnimationFrame(frame);
}

render();
requestAnimationFrame(frame);
