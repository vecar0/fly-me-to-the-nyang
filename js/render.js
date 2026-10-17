// 저해상도 버퍼(180x320)에 월드를 그린다: 배경, 방석, 고양이, 크레인, 파티클, 카메라.
import { VIEW_W, VIEW_H, CAT_TYPES, CFG } from './config.js';
import { P, Grid, makeCanvas, catSprite, getIcons, numText } from './sprites.js';

const SC = {
  wall: '#f7dcc6', wallL: '#fbe8d8', wallD: '#e9c4ab',
  wood: '#c48a5c', woodS: '#9c6644', woodL: '#ddaa78',
  roof: '#d9645f', roofS: '#a8474f', roofL: '#f08a78',
  town: '#a77a9e', townS: '#86607f', sun: '#ffd98a',
  ocean: '#4f8fd8', oceanS: '#3a6fb8', land: '#74c27a', atmo: '#9fdcff',
  moon: '#e9e4d4', moonS: '#c9c1ab', moonD: '#a89f8a',
};

// 높이(px) → 하늘색. 8px 띠로 끊어서 픽셀 느낌을 낸다.
const SKY = [
  [0, '#bfe6ff'], [300, '#ffb38a'], [450, '#ffcf9e'], [650, '#bfe3ff'], [900, '#9fd3ff'],
  [1150, '#7fb6f5'], [1300, '#4a4fa3'], [1600, '#2a2466'], [2000, '#171238'], [3000, '#100c28'],
];
function lerpHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = s => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}
const skyCache = new Map();
function skyAt(h) {
  const band = Math.floor(h / 8) * 8;
  let c = skyCache.get(band);
  if (c) return c;
  let i = 0;
  while (i < SKY.length - 1 && SKY[i + 1][0] <= band) i++;
  if (i >= SKY.length - 1) c = SKY[SKY.length - 1][1];
  else {
    const [h0, c0] = SKY[i], [h1, c1] = SKY[i + 1];
    const t = Math.round(Math.max(0, Math.min(1, (band - h0) / (h1 - h0))) * 6) / 6;
    c = lerpHex(c0, c1, t);
  }
  skyCache.set(band, c);
  return c;
}

function hash(n) {
  n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 9); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}

// ---------- 배경 미리 그리기 ----------

const ROOM_TOP = -318, ROOM_BOT = 240;

function buildRoom() {
  const H = ROOM_BOT - ROOM_TOP;
  const g = new Grid(VIEW_W, H);
  const Y = wy => wy - ROOM_TOP;
  // 벽지
  for (let wy = -300; wy < 212; wy++) for (let x = 0; x < VIEW_W; x++) {
    let c = SC.wall;
    if (x % 16 < 2) c = SC.wallL;
    if (x % 16 === 8 && ((wy % 16) + 16) % 16 === 8) c = P.pink;
    if (wy > 150) c = (x % 12 === 0) ? SC.woodS : (wy < 153 ? SC.woodL : SC.wood);
    g.set(x, Y(wy), c);
  }
  g.rect(0, Y(150), VIEW_W, 1, SC.woodS);
  g.rect(0, Y(212), VIEW_W, 8, SC.woodS);
  g.rect(0, Y(212), VIEW_W, 1, SC.woodL);
  // 바닥
  for (let wy = 220; wy < ROOM_BOT; wy++) for (let x = 0; x < VIEW_W; x++)
    g.set(x, Y(wy), (x + (wy > 230 ? 20 : 0)) % 40 === 0 ? SC.woodS : (wy === 220 ? SC.woodL : SC.wood));

  // 창문
  const wx0 = 16, wx1 = 60, wy0 = -205, wy1 = -130;
  for (let wy = wy0; wy < wy1; wy++) for (let x = wx0; x < wx1; x++) {
    const edge = x < wx0 + 2 || x >= wx1 - 2 || wy < wy0 + 2 || wy >= wy1 - 2;
    const bar = Math.abs(x - (wx0 + wx1) / 2) < 1 || Math.abs(wy - (wy0 + wy1) / 2) < 1;
    let c = edge || bar ? P.white : (wy < -170 ? '#a9dcff' : P.sky);
    g.set(x, Y(wy), c);
  }
  for (const [cx, cy, r] of [[28, -185, 4], [33, -186, 5], [38, -184, 3.5], [48, -152, 3], [52, -153, 4]])
    for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (x * x + y * y * 2 < r * r && y < 2) g.set(cx + x, Y(cy + y), P.white);
  g.rect(wx0 - 4, Y(wy1), wx1 - wx0 + 8, 3, P.white);
  g.rect(wx0 - 4, Y(wy1 + 3), wx1 - wx0 + 8, 1, SC.wallD);
  // 커튼
  for (const [x0, dir] of [[wx0 - 6, 1], [wx1 - 2, -1]]) for (let wy = wy0 - 6; wy < wy1 + 8; wy++) for (let i = 0; i < 8; i++) {
    const x = x0 + i;
    const fold = (i + (dir > 0 ? 0 : 1)) % 3 === 0;
    g.set(x, Y(wy), fold ? P.blush : P.pink);
  }
  g.rect(wx0 - 10, Y(wy0 - 8), wx1 - wx0 + 20, 2, SC.woodS);

  // 액자
  for (let wy = -252; wy < -224; wy++) for (let x = 126; x < 160; x++) {
    const edge = x < 128 || x >= 158 || wy < -250 || wy >= -226;
    g.set(x, Y(wy), edge ? SC.woodS : P.creamL);
  }
  const fish = ['..XX....X', '.XOOX..XX', 'XOWOOXXOX', 'XOOOOXXOX', '.XOOX..XX', '..XX....X'];
  fish.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') g.set(138 + i, Y(-241 + j), ch === 'X' ? P.line : ch === 'W' ? P.eye : P.orange); }));

  // 선반 + 화분 + 털실
  g.rect(118, Y(-112), 56, 3, SC.wood); g.rect(118, Y(-109), 56, 1, SC.woodS);
  g.rect(122, Y(-108), 2, 6, SC.woodS); g.rect(168, Y(-108), 2, 6, SC.woodS);
  g.rect(126, Y(-122), 10, 10, SC.roof); g.rect(125, Y(-122), 12, 2, SC.roofL); g.rect(126, Y(-114), 10, 2, SC.roofS);
  for (const [x, y] of [[131, -123], [130, -125], [129, -127], [132, -126], [133, -128], [134, -130], [128, -129], [131, -131], [127, -126], [135, -125], [136, -127]]) {
    g.set(x, Y(y), P.green); g.set(x + 1, Y(y), P.greenS);
  }
  for (let y = -10; y <= 0; y++) for (let x = -6; x <= 6; x++) {
    const d = x * x + (y + 5) * (y + 5);
    if (d <= 26) g.set(156 + x, Y(-112 + y), d > 18 ? P.blush : ((x + y) % 3 === 0 ? P.blush : P.pink));
  }
  for (let i = 0; i < 9; i++) g.set(162 + i, Y(-113 + Math.round(Math.sin(i * 0.8))), P.blush);

  // 전등
  g.rect(140, Y(-300), 1, 22, P.line);
  for (let j = 0; j < 8; j++) g.rect(140 - 3 - j, Y(-278 + j), 7 + j * 2, 1, j < 2 ? SC.woodS : P.yellow);
  g.rect(138, Y(-270), 5, 2, P.white);

  // 천장 + 지붕 단면
  g.rect(0, Y(-300), VIEW_W, 6, SC.woodS);
  g.rect(0, Y(-300), VIEW_W, 1, SC.woodL);
  for (let wy = ROOM_TOP; wy < -300; wy++) for (let x = 0; x < VIEW_W; x++) {
    const ly = wy - ROOM_TOP;
    const row = Math.floor(ly / 6);
    const lx = (x + (row % 2) * 5) % 10;
    let c = SC.roof;
    if (ly % 6 === 5 || lx === 0) c = SC.roofS;
    else if (ly % 6 === 0) c = SC.roofL;
    if (ly === 0) c = P.line;
    g.set(x, Y(wy), c);
  }

  // 캣타워 기둥 + 받침
  for (let wy = 10; wy < 214; wy++) for (let x = 83; x < 97; x++) {
    let c = wy % 3 === 0 ? P.creamS : P.cream;
    if (x === 83 || x === 96) c = P.line;
    else if (x === 84) c = P.creamL;
    else if (x === 95) c = P.creamS;
    g.set(x, Y(wy), c);
  }
  for (let x = 66; x < 114; x++) { g.set(x, Y(212), P.line); for (let wy = 213; wy < 219; wy++) g.set(x, Y(wy), x === 66 || x === 113 ? P.line : (wy === 213 ? SC.woodL : SC.wood)); g.set(x, Y(219), P.line); }

  // 방석 (물리 바디와 같은 64x10, 모서리 2)
  const cx0 = CFG.cushionX - CFG.cushionW / 2;
  const CW = CFG.cushionW, CH = CFG.cushionH;
  const inCushion = (lx, ly) => lx >= 0 && lx < CW && ly >= 0 && ly < CH &&
    !((lx < 1 || lx >= CW - 1) && (ly < 1 || ly >= CH - 1));
  for (let ly = -1; ly <= CH; ly++) for (let lx = -1; lx <= CW; lx++) {
    const x = cx0 + lx;
    if (inCushion(lx, ly)) {
      let c = P.pink;
      if (ly <= 1) c = '#fbc6d0';
      if (ly >= CH - 2) c = P.blush;
      if (ly === 4 && lx % 4 < 2 && lx > 3 && lx < CW - 4) c = P.white;
      g.set(x, Y(ly), c);
    } else if (inCushion(lx + 1, ly) || inCushion(lx - 1, ly) || inCushion(lx, ly + 1) || inCushion(lx, ly - 1)) {
      g.set(x, Y(ly), P.line);
    }
  }
  // 술
  for (const tx of [cx0 + 1, cx0 + CFG.cushionW - 2]) { g.set(tx, Y(11), P.yellowS); g.set(tx, Y(12), P.yellow); g.set(tx, Y(13), P.yellow); }
  return g.toCanvas();
}

function buildTown() {
  const top = -430, bot = ROOM_TOP;
  const g = new Grid(VIEW_W, bot - top);
  const Y = wy => wy - top;
  // 노을 해
  for (let y = -26; y <= 26; y++) for (let x = -26; x <= 26; x++) {
    const d = Math.hypot(x, y);
    if (d < 24) g.set(132 + x, Y(-352 + y), d > 21 ? '#ffc879' : SC.sun);
  }
  // 집들 실루엣
  const houses = [[0, 22, 26], [20, 30, 36], [46, 18, 22], [62, 34, 30], [94, 22, 40], [114, 30, 26], [142, 20, 34], [160, 24, 28]];
  for (const [x0, w, h] of houses) {
    const base = bot;
    for (let x = x0; x < x0 + w; x++) {
      const roofH = Math.min(x - x0, x0 + w - 1 - x, 8);
      const topY = base - h - roofH;
      for (let wy = topY; wy < base; wy++) g.set(x, Y(wy), wy === topY ? SC.townS : SC.town);
    }
    for (let wy = base - h + 6; wy < base - 6; wy += 9) for (let x = x0 + 4; x < x0 + w - 5; x += 8)
      if (hash(x * 31 + wy) > 0.35) { g.rect(x, Y(wy), 3, 4, P.yellow); g.rect(x, Y(wy + 3), 3, 1, P.yellowS); }
  }
  // 굴뚝
  g.rect(70, Y(bot - 50), 6, 16, SC.townS);
  g.rect(69, Y(bot - 51), 8, 2, SC.townS);
  return g.toCanvas();
}

function buildCloud(seed) {
  const w = 44 + Math.floor(hash(seed) * 30), h = 22;
  const g = new Grid(w, h);
  const blobs = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const fx = (i + 0.5) / n;
    const r = 5 + Math.sin(fx * Math.PI) * 5 + hash(seed * 3 + i) * 2;
    blobs.push([fx * (w - 4) + 2, 17 - r * 0.7, r]);
  }
  const base = 17;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (y > base) continue;
    if (blobs.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 < r * r)) g.set(x, y, y >= base - 2 ? '#d6ecfb' : P.white);
  }
  return g.toCanvas();
}

function buildEarth() {
  // 우주에서 멀리 보이는 작은 지구 (반지름 26)
  const r = 26, W = r * 2 + 6, c0 = W / 2;
  const g = new Grid(W, W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - c0, y + 0.5 - c0);
    if (d > r + 2) continue;
    if (d > r + 1) { g.set(x, y, SC.oceanS); continue; }
    if (d > r) { g.set(x, y, SC.atmo); continue; }
    const n = hash(Math.floor(x / 4) * 977 + Math.floor(y / 3) * 131) + hash(Math.floor(x / 7) * 37 + Math.floor(y / 6) * 71);
    let c = n > 1.2 ? SC.land : SC.ocean;
    if (hash(Math.floor(x / 6) * 11 + Math.floor(y / 2) * 7) > 0.9) c = P.white;
    // 오른쪽 아래는 밤
    if ((x - c0) * 0.7 + (y - c0) * 0.7 > r * 0.45) c = c === SC.land ? P.greenS : (c === P.white ? P.grayL : SC.oceanS);
    if (d > r - 1.5 && (x - c0) + (y - c0) < 0) c = '#a9dcff';
    g.set(x, y, c);
  }
  return g.toCanvas();
}

function buildMoon() {
  const R = 72, W = R * 2 + 4;
  const g = new Grid(W, W);
  const craters = [[50, 50, 12], [96, 40, 8], [80, 90, 16], [40, 100, 9], [110, 100, 7], [64, 24, 6], [116, 70, 5]];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - W / 2, y - W / 2);
    if (d > R + 1) continue;
    if (d > R) { g.set(x, y, P.line); continue; }
    let c = SC.moon;
    if (x + y > W * 1.25) c = SC.moonS;
    for (const [cx, cy, cr] of craters) {
      const cd = Math.hypot(x - cx, y - cy);
      if (cd < cr) c = cd > cr - 2 && x - cx + y - cy < 0 ? SC.moonD : SC.moonS;
    }
    g.set(x, y, c);
  }
  return g.toCanvas();
}

// ---------- 렌더러 ----------

export class Renderer {
  constructor() {
    this.buf = makeCanvas(VIEW_W, VIEW_H);
    this.ctx = this.buf.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.room = buildRoom();
    this.town = buildTown();
    this.clouds = [0, 1, 2, 3].map(i => buildCloud(i + 1));
    this.earth = buildEarth();
    this.moon = buildMoon();
    this.icons = getIcons();
    this.camTop = -280;
    this.shake = 0;
    this.shakeAmp = 0;
    this.particles = [];
    this.screenParticles = [];
    this.fx = new Map(); // cat id → { landT, surpriseUntil }
    this.streaks = [];
    this.time = 0;
    this.tour = null;
  }

  reset() {
    this.camTop = -280;
    this.particles.length = 0;
    this.screenParticles.length = 0;
    this.fx.clear();
    this.streaks.length = 0;
    this.tour = null;
  }

  camTarget(game) {
    return Math.min(game.crane.y - 60, -280);
  }

  // 게임 이벤트에 맞춘 연출
  onEvent(ev, game) {
    if (ev.type === 'land') {
      const f = this._fx(ev.cat);
      f.landT = this.time;
      f.impact = Math.min(1, ev.speed / 3);
      const p = game.catPos(ev.cat), t = CAT_TYPES[ev.cat.type];
      const n = 3 + Math.round(f.impact * 3);
      for (let i = 0; i < n; i++) this.addParticle(this.particles, {
        x: p.x + (Math.random() - 0.5) * t.w, y: p.y + t.h / 2, vx: (Math.random() - 0.5) * 40, vy: -10 - Math.random() * 15,
        g: 40, life: 0.35 + Math.random() * 0.2, color: Math.random() < 0.5 ? P.white : P.paper, size: 1 + (Math.random() < 0.3 ? 1 : 0),
      });
    } else if (ev.type === 'perfect') {
      const p = game.catPos(ev.cat), t = CAT_TYPES[ev.cat.type];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        this.addParticle(this.particles, { x: p.x + Math.cos(a) * 6, y: p.y - t.h / 2 + Math.sin(a) * 4, vx: Math.cos(a) * 30, vy: Math.sin(a) * 20 - 15, g: 0, life: 0.7, color: P.yellow, kind: 'star' });
      }
      this.addParticle(this.particles, { x: p.x, y: p.y - t.h / 2 - 8, vx: 0, vy: -18, g: 0, life: 0.9, img: numText('PERFECT', P.yellow) });
      this.kick(1, 0.12);
    } else if (ev.type === 'fall') {
      this.kick(2, 0.25);
    } else if (ev.type === 'zone') {
      const cols = [P.pink, P.yellow, P.eyeBlue, P.green, P.white, P.orange];
      for (let i = 0; i < 50; i++) this.addParticle(this.screenParticles, {
        x: Math.random() * VIEW_W, y: -5 - Math.random() * 30, vx: (Math.random() - 0.5) * 30, vy: 20 + Math.random() * 40,
        g: 20, life: 2 + Math.random(), color: cols[i % cols.length], size: 2, kind: 'confetti',
      });
    }
  }

  heartBreak(x, y) {
    for (let i = 0; i < 6; i++) this.addParticle(this.screenParticles, {
      x: x + 3, y: y + 3, vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 30, g: 160, life: 0.8, color: i % 2 ? P.red : P.redS, size: 2,
    });
  }

  kick(amp, dur) { this.shakeAmp = Math.max(this.shakeAmp, amp); this.shake = Math.max(this.shake, dur); }

  addParticle(list, p) {
    p.t = 0;
    const total = this.particles.length + this.screenParticles.length;
    if (total >= CFG.maxParticles) {
      const victim = this.particles.length ? this.particles : this.screenParticles;
      victim.shift();
    }
    list.push(p);
  }

  _fx(cat) {
    let f = this.fx.get(cat.id);
    if (!f) { f = { landT: -9, surpriseUntil: -9, impact: 0, phase: (cat.id * 1.37) % 5 }; this.fx.set(cat.id, f); }
    return f;
  }

  update(dt, game, mode) {
    this.time += dt;
    let target = this.camTarget(game);
    if (mode === 'over') {
      this.tour = (this.tour ?? 0) + dt;
      const k = (1 - Math.cos(Math.max(0, this.tour - 0.8) * 0.45)) / 2;
      target = target + (-280 - target) * k;
    } else this.tour = null;
    this.camTop += (target - this.camTop) * Math.min(1, dt * 4);
    if (this.shake > 0) this.shake -= dt; else this.shakeAmp = 0;

    for (const list of [this.particles, this.screenParticles]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.t += dt;
        if (p.t >= p.life) { list.splice(i, 1); continue; }
        p.vy += (p.g ?? 0) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.kind === 'confetti') p.vx += Math.sin(this.time * 5 + i) * 2;
      }
    }

    // 바람 줄무늬
    const w = game.wind;
    if (w.phase !== 'idle') {
      const rate = w.phase === 'blow' ? 18 : 5;
      if (Math.random() < rate * dt) this.streaks.push({ x: w.dir > 0 ? -20 : VIEW_W + 20, y: 30 + Math.random() * 260, len: 6 + Math.floor(Math.random() * 12), v: (w.phase === 'blow' ? 220 : 140) * w.dir });
    }
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.x += s.v * dt;
      if (s.x < -40 || s.x > VIEW_W + 40) this.streaks.splice(i, 1);
    }

    // 고양이 표정용 상태
    for (const cat of game.cats) {
      const f = this._fx(cat);
      if (cat.landed && cat.body.speed / 3 > 0.45 && !cat.body.isStatic) f.surpriseUntil = this.time + 0.7;
    }
  }

  // 월드 + 고양이 그리기. camTop을 주면 그 위치 기준 (사진 저장용).
  drawWorld(game, opts = {}) {
    const ctx = opts.ctx || this.ctx;
    const vh = opts.height || VIEW_H;
    let camTop = opts.camTop ?? this.camTop;
    let sx = 0, sy = 0;
    if (!opts.camTop && this.shakeAmp > 0) { sx = Math.round((Math.random() - 0.5) * 2 * this.shakeAmp); sy = Math.round((Math.random() - 0.5) * 2 * this.shakeAmp); }
    camTop = Math.round(camTop);
    const T = this.time;
    ctx.save();
    ctx.translate(sx, sy);

    // 하늘 띠
    for (let row = -8; row < vh + 8; row += 8) {
      const wy = camTop + row;
      const band = Math.floor(-wy / 8) * 8;
      const y = -band - camTop;
      ctx.fillStyle = skyAt(band);
      ctx.fillRect(-4, y - 8 + 1, VIEW_W + 8, 8);
    }
    const hTop = -camTop, hBot = -(camTop + vh);

    // 별 (패럴랙스 0.4)
    if (hTop > 1050) {
      const L = camTop * 0.4;
      const c0 = Math.floor(L / 24) - 1, c1 = Math.floor((L + vh) / 24) + 1;
      for (let c = c0; c <= c1; c++) for (let k = 0; k < 4; k++) {
        const seed = c * 4 + k;
        const x = Math.floor(hash(seed * 3 + 1) * VIEW_W);
        const ly = c * 24 + Math.floor(hash(seed * 5 + 2) * 24);
        const y = Math.round(ly - L);
        const wh = -(camTop + y);
        const dens = Math.min(1, (wh - 1100) / 400);
        if (hash(seed * 7 + 3) > dens) continue;
        const tw = Math.sin(T * (1 + hash(seed) * 2) + seed) > 0.6;
        ctx.fillStyle = hash(seed * 11) > 0.7 ? P.yellow : P.white;
        ctx.fillRect(x, y, 1, 1);
        if (tw && hash(seed * 13) > 0.6) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
      }
    }
    // 달 (패럴랙스 0.5)
    if (hTop > 1700) {
      const y = Math.round(-1095 - camTop * 0.5) - this.moon.height / 2;
      if (y < vh && y > -this.moon.height) ctx.drawImage(this.moon, Math.round(118 - this.moon.width / 2), y);
    }
    // 멀리 보이는 지구 (패럴랙스 0.3)
    if (hTop > 1150 && hBot < 2300) {
      const y = Math.round(-390 - camTop * 0.3) - this.earth.height / 2;
      if (y < vh && y > -this.earth.height) ctx.drawImage(this.earth, 14, y);
    }
    // 구름 (패럴랙스 0.7)
    if (hTop > 520 && hBot < 1500) {
      const L = camTop * 0.7;
      const c0 = Math.floor(L / 50) - 1, c1 = Math.floor((L + vh) / 50) + 1;
      for (let c = c0; c <= c1; c++) {
        if (hash(c * 17 + 5) < 0.12) continue;
        const y = Math.round(c * 50 + hash(c * 3) * 26 - L);
        const wh = -(camTop + y);
        if (wh < 560 || wh > 1300) continue;
        const img = this.clouds[Math.floor(hash(c * 29) * 4)];
        const speed = 3 + hash(c * 31) * 5;
        const x = Math.round(((hash(c * 37) * 260 + T * speed) % 260) - 50);
        ctx.drawImage(img, x, y);
      }
    }
    // 새 (구름 구간)
    if (hTop > 650 && hBot < 1250) {
      const L = camTop * 0.85;
      const c0 = Math.floor(L / 90) - 1, c1 = Math.floor((L + vh) / 90) + 1;
      ctx.fillStyle = P.line;
      for (let c = c0; c <= c1; c++) {
        if (hash(c * 41) < 0.5) continue;
        const y = Math.round(c * 90 + hash(c * 43) * 50 - L);
        const wh = -(camTop + y);
        if (wh < 680 || wh > 1220) continue;
        const x = Math.round(((hash(c * 47) * 240 + T * 14) % 240) - 30);
        const up = Math.floor(T * 6 + c) % 2 === 0;
        ctx.fillRect(x, y, 1, 1); ctx.fillRect(x + 4, y, 1, 1); ctx.fillRect(x + 2, y + 1, 1, 1);
        if (up) { ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillRect(x + 5, y - 1, 1, 1); } else { ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + 3, y + 1, 1, 1); }
      }
    }
    // 마을 + 방
    const townTop = -430 - camTop;
    if (townTop < vh && townTop + this.town.height > 0) ctx.drawImage(this.town, 0, townTop);
    const roomTop = ROOM_TOP - camTop;
    if (roomTop < vh && roomTop + this.room.height > 0) ctx.drawImage(this.room, 0, roomTop);

    // 고양이
    for (const cat of game.cats) this._drawCat(ctx, game, cat, camTop);

    // 크레인
    if (!opts.noCrane) this._drawCrane(ctx, game, camTop, vh);

    // 바람 줄무늬
    if (!opts.camTop) {
      ctx.fillStyle = P.white;
      for (const s of this.streaks) ctx.fillRect(Math.round(s.x), Math.round(s.y), s.len, 1);
    }

    // 월드 파티클
    for (const p of this.particles) this._drawParticle(ctx, p, camTop);
    ctx.restore();
  }

  drawScreenParticles() {
    for (const p of this.screenParticles) this._drawParticle(this.ctx, p, 0);
  }

  _drawParticle(ctx, p, camTop) {
    const x = Math.round(p.x), y = Math.round(p.y - camTop);
    if (p.img) {
      const blink = p.t > p.life * 0.7 && Math.floor(p.t * 20) % 2 === 0;
      if (!blink) ctx.drawImage(p.img, Math.round(x - p.img.width / 2), y);
      return;
    }
    ctx.fillStyle = p.color;
    if (p.kind === 'star') {
      const big = p.t < p.life * 0.5;
      ctx.fillRect(x, y, 1, 1);
      if (big) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
      return;
    }
    const s = p.size || 1;
    ctx.fillRect(x, y, s, s);
  }

  _expr(game, cat, f) {
    if (!cat.landed) return 'fall';
    if (this.time < f.surpriseUntil) return 'surprise';
    // 꼭대기 고양이는 가끔 하품
    if (cat.settled && cat.body.bounds.min.y / 3 <= -game.height + 0.5 && ((this.time + f.phase) % 9) < 1.1) return 'yawn';
    if (((this.time + f.phase) % 4.2) < 0.14) return 'blink';
    return 'calm';
  }

  _drawCat(ctx, game, cat, camTop) {
    const t = CAT_TYPES[cat.type];
    const f = this._fx(cat);
    const p = game.catPos(cat);
    const y = p.y - camTop;
    if (y < -40 || y > VIEW_H + 400) return;
    const img = catSprite(cat.type, this._expr(game, cat, f));
    // 착지 찌부러짐: 0.85 → 1.05 → 1.0 (120ms)
    let sy = 1;
    const lt = this.time - f.landT;
    if (lt >= 0 && lt < 0.12) {
      const a = 0.15 * (0.4 + f.impact * 0.6);
      if (lt < 0.04) sy = 1 - a * (lt / 0.04);
      else if (lt < 0.08) sy = 1 - a + (a + 0.05) * ((lt - 0.04) / 0.04);
      else sy = 1.05 - 0.05 * ((lt - 0.08) / 0.04);
    }
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(y));
    ctx.rotate(p.angle);
    ctx.translate(-cat.off.x, -cat.off.y);
    if (sy !== 1) { ctx.translate(0, t.h / 2); ctx.scale(2 - sy, sy); ctx.translate(0, -t.h / 2); }
    if (cat.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }

  _drawCrane(ctx, game, camTop, vh) {
    const c = game.crane;
    const cx = Math.round(c.x);
    const cy = Math.round(c.y - camTop);
    ctx.fillStyle = P.line;
    ctx.fillRect(cx, -4, 1, Math.max(0, cy - 4 + 4));
    const claw = this.icons.claw;
    ctx.drawImage(claw, cx - 6, cy - 4);
    if (c.type === null) return;
    const t = CAT_TYPES[c.type];
    const bob = Math.round(Math.sin(this.time * 4) * 0.6);
    const hy = Math.round(game.heldY() - camTop) + bob;
    // 조준선
    ctx.fillStyle = 'rgba(58,40,56,0.28)';
    for (let y = hy + t.h / 2 + 3; y < vh; y += 4) ctx.fillRect(cx, y, 1, 2);
    const img = catSprite(c.type, 'calm');
    ctx.save();
    ctx.translate(cx, hy);
    if (c.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }

  // 탑 전체 사진
  snapshot(game, label) {
    let top = 0;
    for (const cat of game.cats) top = Math.min(top, cat.body.bounds.min.y / 3);
    const camTop = Math.floor(Math.min(top, -game.best) - 50);
    const bottom = 34;
    const h = bottom - camTop;
    const c = makeCanvas(VIEW_W, h);
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    this.drawWorld(game, { ctx: cx, camTop, height: h, noCrane: true });
    const scale = h > 900 ? 2 : 3;
    const frame = 8;
    const out = makeCanvas(VIEW_W * scale + frame * 2, h * scale + frame * 2 + 40);
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = false;
    o.fillStyle = P.line; o.fillRect(0, 0, out.width, out.height);
    o.fillStyle = P.creamL; o.fillRect(3, 3, out.width - 6, out.height - 6);
    o.drawImage(c, frame, frame, VIEW_W * scale, h * scale);
    if (label) o.drawImage(label, Math.round(out.width / 2 - (label.width * 2) / 2), out.height - 34, label.width * 2, label.height * 2);
    return out;
  }
}
