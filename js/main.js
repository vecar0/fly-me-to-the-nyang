// 루프 연결: 모드(title/play/pause/over/dex), 이벤트 → 연출/사운드/저장.
import { VIEW_W, VIEW_H, CAT_TYPES, ZONES, CFG } from './config.js';
import { Game, STEP } from './sim.js';
import { dailySeed } from './spawner.js';
import { Renderer } from './render.js';
import { UI, pxText } from './ui.js';
import { Audio } from './audio.js';
import { bindInput } from './input.js';
import { load, save } from './storage.js';

const canvas = document.getElementById('game');
const screen = canvas.getContext('2d');
const renderer = new Renderer();
const ui = new UI();
const audio = new Audio();
const store = load();
audio.muted = store.muted;

let mode = 'title';
let game = makeDemo();
let isDaily = false;
let dailyKey = '';
let overT = 0;
let overInfo = { best: 0, newBest: false };
let slowmo = 0;
let acc = 0;
let lastWind = 'idle';
let demoAim = 0;
// ?cam=-1500 : 배경 확인용으로 카메라를 그 높이에 고정
const camParam = new URLSearchParams(location.search).get('cam');
const DEBUG_CAM = camParam === null ? null : Number(camParam);

function makeDemo() {
  return new Game({ hearts: 999 });
}

function startGame(daily) {
  isDaily = daily;
  let seed;
  if (daily) { const d = dailySeed(); seed = d.seed; dailyKey = d.key; }
  game = seed === undefined ? new Game() : new Game({ seed });
  renderer.reset();
  acc = 0; slowmo = 0; lastWind = 'idle';
  mode = 'play';
  audio.setZone(0);
  audio.startMusic();
}

function goHome() {
  mode = 'title';
  game = makeDemo();
  renderer.reset();
  audio.stopMusic();
}

function finish() {
  mode = 'over';
  overT = 0;
  const prev = isDaily ? (store.daily.key === dailyKey ? store.daily.best : 0) : store.best;
  overInfo = { newBest: game.best > prev && game.best > 0, best: Math.max(prev, game.best) };
  if (game.best > store.best) store.best = game.best;
  if (isDaily) {
    if (store.daily.key !== dailyKey) store.daily = { key: dailyKey, best: 0 };
    store.daily.best = Math.max(store.daily.best, game.best);
  }
  save(store);
  audio.gameover();
}

function handleEvents() {
  const real = mode === 'play' || mode === 'over';
  for (const ev of game.drainEvents()) {
    renderer.onEvent(ev, game);
    if (!real) continue;
    switch (ev.type) {
      case 'spawn':
        if (!store.cats.includes(ev.catType)) {
          store.cats.push(ev.catType);
          save(store);
          ui.showToast(ev.catType);
          audio.newFriend();
        }
        break;
      case 'drop': audio.drop(); break;
      case 'land': {
        const h = -game.catPos(ev.cat).y;
        audio.meow(Math.max(0, h), Math.min(1, ev.speed / 3));
        break;
      }
      case 'perfect': audio.perfect(); break;
      case 'fall':
        audio.fall();
        slowmo = 0.4;
        renderer.heartBreak(6 + game.hearts * 9, 20);
        break;
      case 'zone':
        ui.showBanner(ZONES[ev.zone].name + ' 도착!');
        audio.zone();
        audio.setZone(ev.zone);
        if (!store.zones.includes(ev.zone)) { store.zones.push(ev.zone); save(store); }
        break;
      case 'gameover': finish(); break;
    }
  }
  if (real && game.wind.phase === 'warn' && lastWind !== 'warn') audio.wind();
  lastWind = game.wind.phase;
}

// 타이틀 데모: 크레인이 목표 지점을 지나면 놓는다
function demoAI() {
  if (!game.canDrop()) return;
  if (Math.abs(game.crane.x - (CFG.cushionX + demoAim)) < 2) {
    game.drop();
    demoAim = (Math.random() - 0.5) * 14;
  }
  if (game.count > 22 || game.height > 220) { game = makeDemo(); renderer.reset(); }
}

function savePhoto() {
  const label = pxText(`냥탑  ${(game.best / 100).toFixed(2)}m`, { size: 12, color: P_LINE, outline: null });
  const img = renderer.snapshot(game, label);
  const name = `nyangtop-${(game.best / 100).toFixed(2)}m.png`;
  const done = blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  if (img.toBlob) img.toBlob(done, 'image/png');
}
const P_LINE = '#3a2838';

function onAction(id) {
  if (id) audio.click();
  switch (id) {
    case 'start': startGame(false); break;
    case 'daily': startGame(true); break;
    case 'dex': mode = 'dex'; break;
    case 'close': mode = 'title'; break;
    case 'pause': if (mode === 'play') { mode = 'pause'; audio.stopMusic(); } break;
    case 'resume': mode = 'play'; audio.startMusic(); break;
    case 'home': goHome(); break;
    case 'retry': startGame(isDaily); break;
    case 'photo': savePhoto(); break;
    case 'mute':
      store.muted = !store.muted;
      audio.setMuted(store.muted);
      save(store);
      break;
  }
}

bindInput(canvas, {
  onFirst: () => audio.unlock(),
  onTap: (x, y) => {
    const id = ui.hit(x, y);
    if (id) return onAction(id);
    if (mode === 'play') game.drop();
  },
  onKey: k => {
    if (k === 'm') return onAction('mute');
    if (k === ' ' || k === 'enter') {
      if (mode === 'play') game.drop();
      else if (mode === 'title') onAction('start');
      else if (mode === 'pause') onAction('resume');
      else if (mode === 'over' && overT > 0.6) onAction('retry');
      else if (mode === 'dex') onAction('close');
    } else if (k === 'p' || k === 'escape') {
      if (mode === 'play') onAction('pause');
      else if (mode === 'pause') onAction('resume');
      else if (mode === 'dex') onAction('close');
    } else if (k === 'r' && mode === 'over') onAction('retry');
  },
});

// ---- 화면 크기: 정수 배율 ----
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const k = Math.max(1, Math.floor(Math.min((window.innerWidth * dpr) / VIEW_W, (window.innerHeight * dpr) / VIEW_H)));
  canvas.width = VIEW_W * k;
  canvas.height = VIEW_H * k;
  canvas.style.width = (VIEW_W * k) / dpr + 'px';
  canvas.style.height = (VIEW_H * k) / dpr + 'px';
  screen.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  tick(dt);
  requestAnimationFrame(frame);
}

function tick(dt) {
  if (mode !== 'pause') {
    const scale = slowmo > 0 ? 0.35 : 1;
    slowmo -= dt;
    acc += dt * scale;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      if (mode === 'title' || mode === 'dex') demoAI();
      game.update(STEP);
      handleEvents();
      acc -= STEP;
      steps++;
    }
    if (steps >= 5) acc = 0;
  }
  if (mode === 'over') overT += dt;
  renderer.update(mode === 'pause' ? 0 : dt, game, mode === 'over' ? 'over' : 'play');
  ui.update(dt);

  const ctx = renderer.ctx;
  ui.begin();
  if (DEBUG_CAM !== null) renderer.drawWorld(game, { camTop: DEBUG_CAM, noCrane: true });
  else if (mode === 'dex') ui.dex(ctx, store);
  else {
    renderer.drawWorld(game, { noCrane: mode === 'title' && false });
    if (mode === 'title') { ui.dim(ctx, 0.25); ui.title(ctx, store); }
    else {
      ui.hud(ctx, game, { best: isDaily ? (store.daily.key === dailyKey ? store.daily.best : 0) : store.best, daily: isDaily, muted: store.muted, buttons: mode === 'play' });
      renderer.drawScreenParticles();
      ui.overlays(ctx);
      if (mode === 'pause') ui.pause(ctx);
      if (mode === 'over' && overT > 1) ui.over(ctx, game, overInfo, overT - 1);
    }
  }

  screen.drawImage(renderer.buf, 0, 0, canvas.width, canvas.height);
  document.body.style.background = mode === 'dex' ? '#1b1640' : '#2b2236';
}
requestAnimationFrame(frame);

// 디버그/테스트용: advance(초)로 탭이 숨겨져 있어도 진행시킬 수 있다
window.__nyang = {
  get game() { return game; }, get mode() { return mode; }, renderer, ui, store, CAT_TYPES, startGame, onAction,
  advance(sec) { for (let t = 0; t < sec; t += 1 / 60) tick(1 / 60); },
  tap(x, y) { const id = ui.hit(x, y); if (id) onAction(id); else if (mode === 'play') game.drop(); },
};
