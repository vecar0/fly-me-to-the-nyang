// 저해상도 버퍼(180x320)에 월드를 그린다: 배경, 방석, 고양이, 크레인, 파티클, 카메라.
import { VIEW_W, VIEW_H, extraH, CAT_TYPES, CFG } from './config.js?v=1.8.0';
import { P, Grid, makeCanvas, catSprite, catSpriteRot, catGhost, ROT_STEPS, getIcons, numText } from './sprites.js?v=1.8.0';
import { TEXTURES } from './textures.js?v=1.8.0';

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
  // 노을: 레퍼런스 컨셉처럼 주황 → 분홍 → 보라 → 하늘색
  [0, '#bfe6ff'], [300, '#ffc08a'], [400, '#ffa79e'], [520, '#d59bd0'], [640, '#a9b8ef'], [900, '#9fd3ff'],
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

// 하늘 전체를 한 번 그려 둔 세로 띠 (높이 0~SKY_H). 색 단계 사이는 4x4 바둑판(Bayer) 디더로 부드럽게 잇는다.
const SKY_H = 3200;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function buildSkyStrip() {
  const cv = makeCanvas(VIEW_W, SKY_H), c = cv.getContext('2d');
  const img = c.createImageData(VIEW_W, SKY_H), d = img.data;
  const rgbOf = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  for (let r = 0; r < SKY_H; r++) {
    const h = SKY_H - r;
    let i = 0;
    while (i < SKY.length - 1 && SKY[i + 1][0] <= h) i++;
    let lo, hi, f;
    if (i >= SKY.length - 1) { lo = hi = SKY[SKY.length - 1][1]; f = 0; }
    else {
      const [h0, c0] = SKY[i], [h1, c1] = SKY[i + 1];
      const t = Math.max(0, Math.min(1, (h - h0) / (h1 - h0))) * 6; // 구간마다 6단계 색
      const k = Math.floor(t);
      lo = lerpHex(c0, c1, k / 6); hi = lerpHex(c0, c1, Math.min(6, k + 1) / 6); f = t - k;
    }
    const a = rgbOf(lo), b = rgbOf(hi);
    for (let x = 0; x < VIEW_W; x++) {
      const col = f * 16 > BAYER[(r % 4) * 4 + (x % 4)] + 0.5 ? b : a;
      const o = (r * VIEW_W + x) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}

function hash(n) {
  n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 9); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}

// ---------- 배경 미리 그리기 ----------

// Higgsfield로 만든 seamless 텍스처를 픽셀화한 타일 (tools/pixelize_textures.py → js/textures.js)
// 벽지 꽃이 고양이와 시선을 다투지 않게 대비를 낮춘 색 (배경은 유닛보다 한 톤 조용하게)
const SOFT = {
  wallpaper: { '#f7a8b8': '#f9cdd0', '#f48fa6': '#f6b9c2', '#86c97a': '#cfe2b6', '#5a9a5f': '#b5d0a0', '#e9c4ab': '#f2d3bf' },
};
function tex(name, x, y) {
  const t = TEXTURES[name];
  const ty = ((y % t.h) + t.h) % t.h, tx = ((x % t.w) + t.w) % t.w;
  const c = t.colors[t.rows[ty].charCodeAt(tx) - 97];
  return SOFT[name]?.[c] ?? c;
}

const ROOM_TOP = -340, ROOM_BOT = 240; // 천장 위 40px는 기와 지붕

function buildRoom() {
  const H = ROOM_BOT - ROOM_TOP;
  const g = new Grid(VIEW_W, H);
  const Y = wy => wy - ROOM_TOP;
  // 벽지 (꽃무늬 타일) + 아래쪽 판자벽 (세로 나무 타일)
  for (let wy = -300; wy < 212; wy++) for (let x = 0; x < VIEW_W; x++)
    g.set(x, Y(wy), wy > 150 ? tex('wood', x, wy) : tex('wallpaper', x, wy));
  g.rect(0, Y(150), VIEW_W, 1, SC.woodS);
  g.rect(0, Y(151), VIEW_W, 2, SC.woodL);
  g.rect(0, Y(212), VIEW_W, 8, SC.woodS);
  g.rect(0, Y(212), VIEW_W, 1, SC.woodL);
  // 바닥 (나무 타일을 눕혀서 가로 마루)
  for (let wy = 220; wy < ROOM_BOT; wy++) for (let x = 0; x < VIEW_W; x++)
    g.set(x, Y(wy), wy === 220 ? SC.woodL : tex('wood', wy * 2, x));
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

  // 천장 가랜드: 처진 끈에 삼각 깃발 (분홍·노랑·하늘 번갈아, 벽지보다 한 톤 진하게)
  const FLAG = [['#f2a7b5', '#d98798'], ['#f6d78c', '#e0b65e'], ['#a9d3ee', '#7fb3d8']];
  const sag = x => Math.round(-291 + Math.sin((x / VIEW_W) * Math.PI) * 6);
  for (let x = 0; x < VIEW_W; x++) g.set(x, Y(sag(x)), SC.woodS);
  for (let i = 0, fx = 4; fx < VIEW_W - 6; i++, fx += 13) {
    if (fx > 132 && fx < 150) continue; // 전등 줄 자리
    const [fc, fs] = FLAG[i % 3], top = sag(fx + 3) + 1;
    for (let j = 0; j < 6; j++) for (let k = j; k < 7 - j; k++) g.set(fx + k, Y(top + j), k === 6 - j || j === 5 ? fs : fc);
  }

  // 벽시계 (액자 왼쪽)
  {
    const cx = 104, cy = -240, R = 8;
    for (let y = -R - 1; y <= R + 1; y++) for (let x = -R - 1; x <= R + 1; x++) {
      const dd = Math.hypot(x, y);
      if (dd > R + 0.6) continue;
      g.set(cx + x, Y(cy + y), dd > R - 0.6 ? SC.woodS : dd > R - 1.6 ? SC.wood : P.creamL);
    }
    for (const [x, y] of [[0, -6], [6, 0], [0, 6], [-6, 0]]) g.set(cx + x, Y(cy + y), SC.woodS);
    for (let k = 1; k <= 4; k++) g.set(cx, Y(cy - k), P.line); // 분침
    for (let k = 1; k <= 3; k++) g.set(cx + k, Y(cy + Math.round(k * 0.5)), P.line); // 시침
    g.set(cx, Y(cy), P.red);
  }

  // 벽걸이 책장 (창문 아래, 받침대 2개)
  {
    const x0 = 6, x1 = 44, t0 = -104, t1 = -54;
    const BOOK = ['#d98a8f', '#8fb8d9', '#9cc59a', '#e6c27a', '#b59ad1', '#e8a77a'];
    g.rect(x0, Y(t0), x1 - x0, t1 - t0, SC.woodS);
    g.rect(x0 + 2, Y(t0 + 2), x1 - x0 - 4, t1 - t0 - 2, '#b37d55');
    g.rect(x0, Y(t0), x1 - x0, 1, SC.woodL);
    const shelves = [-80, -56];
    for (const sy of shelves) { g.rect(x0 + 2, Y(sy), x1 - x0 - 4, 2, SC.wood); g.rect(x0 + 2, Y(sy), x1 - x0 - 4, 1, SC.woodL); }
    for (const bx of [x0 + 4, x1 - 7]) for (let k = 0; k < 6; k++) g.rect(bx, Y(t1 + k), Math.max(1, 4 - k), 1, SC.woodS); // 받침대
    let seed = 7;
    for (const shelf of shelves) {
      let bx = x0 + 3;
      while (bx < x1 - 5) {
        const r = hash(seed++), bw = 2 + Math.floor(r * 3), bh = 12 + Math.floor(hash(seed++) * 9);
        if (hash(seed++) < 0.12) { bx += 3; continue; } // 빈틈
        const col = BOOK[Math.floor(hash(seed++) * BOOK.length)];
        for (let x = bx; x < Math.min(bx + bw, x1 - 3); x++) for (let wy = shelf - bh; wy < shelf; wy++)
          g.set(x, Y(wy), x === bx ? lerpHex(col, '#ffffff', 0.25) : wy === shelf - bh + 3 ? lerpHex(col, '#3a2838', 0.35) : col);
        bx += bw + (hash(seed++) < 0.3 ? 1 : 0);
      }
    }
    // 맨 위 작은 고양이 인형 실루엣
    const fy = t0 - 1;
    g.rect(35, Y(fy - 4), 8, 5, P.line); g.rect(36, Y(fy - 5), 6, 1, P.line); g.set(36, Y(fy - 6), P.line); g.set(41, Y(fy - 6), P.line);
    g.set(37, Y(fy - 3), '#f6b9c2'); g.set(40, Y(fy - 3), '#f6b9c2');
  }

  // 행잉 화분: 천장에서 끈으로 매단 화분 + 늘어진 덩굴
  {
    const hx = 78, potTop = -262;
    // 고리에서 화분 양끝으로 벌어지는 끈 두 줄
    for (let wy = -289; wy < potTop; wy++) {
      const t = (wy + 289) / (potTop + 289);
      g.set(Math.round(hx - t * 5), Y(wy), SC.woodL);
      g.set(Math.round(hx + t * 5), Y(wy), SC.woodL);
    }
    g.rect(hx - 1, Y(-291), 3, 2, SC.woodS);
    for (let wy = potTop; wy < potTop + 9; wy++) {
      const inset = Math.floor((wy - potTop) / 4);
      for (let x = hx - 6 + inset; x <= hx + 6 - inset; x++) g.set(x, Y(wy), wy === potTop ? P.creamL : x === hx - 6 + inset ? P.creamL : x === hx + 6 - inset ? P.creamS : P.cream);
    }
    g.rect(hx - 6, Y(potTop + 3), 13, 1, '#e9a3b0'); // 화분 띠
    const LEAF = [P.green, P.greenS, '#a6d98f'];
    for (const [sx0, len, dir] of [[hx - 6, 22, -1], [hx - 3, 14, -1], [hx + 4, 18, 1], [hx + 7, 26, 1], [hx, 9, 0]]) {
      for (let k = 0; k < len; k++) {
        const x = sx0 + dir * Math.round(Math.sin(k * 0.35) * 2 + k * 0.15), wy = potTop + 1 + k;
        g.set(x, Y(wy), LEAF[1]);
        if (k % 3 === 1) { g.set(x - 1, Y(wy), LEAF[0]); g.set(x + 1, Y(wy), LEAF[2]); g.set(x, Y(wy - 1), LEAF[0]); }
      }
    }
    for (let x = hx - 6; x <= hx + 6; x++) if ((x + 1) % 2) g.set(x, Y(potTop - 1), LEAF[x % 3 === 0 ? 2 : 0]);
  }

  // 전등
  g.rect(140, Y(-300), 1, 22, P.line);
  for (let j = 0; j < 8; j++) g.rect(140 - 3 - j, Y(-278 + j), 7 + j * 2, 1, j < 2 ? SC.woodS : P.yellow);
  g.rect(138, Y(-270), 5, 2, P.white);

  // 천장 + 지붕 단면
  g.rect(0, Y(-300), VIEW_W, 6, SC.woodS);
  g.rect(0, Y(-300), VIEW_W, 1, SC.woodL);
  // 기와 (비늘 기와 타일), 맨 윗줄은 외곽선
  for (let wy = ROOM_TOP; wy < -300; wy++) for (let x = 0; x < VIEW_W; x++) {
    const ly = wy - ROOM_TOP;
    g.set(x, Y(wy), ly === 0 ? P.line : ly === 1 ? SC.roofL : tex('roof', x, wy));
  }

  // 캣타워 기둥 + 받침
  for (let wy = 10; wy < 214; wy++) for (let x = 83; x < 97; x++) {
    let c = tex('sisal', x, wy); // 밧줄 타일
    if (x === 83 || x === 96) c = P.line;
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
  // 노을 해: 아래쪽은 가로 줄무늬로 갈라진 레트로 해
  for (let y = -26; y <= 26; y++) for (let x = -26; x <= 26; x++) {
    const d = Math.hypot(x, y);
    if (d >= 24) continue;
    if (y > 4 && (y - 4) % 6 < Math.min(3, 1 + Math.floor((y - 4) / 8))) continue;
    g.set(132 + x, Y(-374 + y), d > 21 ? '#ffc879' : y < -12 ? '#ffe7a8' : SC.sun);
  }
  // 먼 건물: 연한 보라 스카이라인 + 드문 불빛
  const FAR = '#c49bbf', FARS = '#b58aaf';
  for (let x = 0, i = 0; x < VIEW_W; i++) {
    const w = 8 + Math.floor(hash(i * 13 + 1) * 14), h = 30 + Math.floor(hash(i * 13 + 2) * 26);
    for (let xx = x; xx < Math.min(VIEW_W, x + w); xx++) for (let wy = bot - h; wy < bot; wy++)
      g.set(xx, Y(wy), wy === bot - h ? FARS : FAR);
    if (hash(i * 13 + 3) > 0.5) g.rect(x + Math.floor(w / 2) - 1, Y(bot - h - 5), 1, 5, FARS); // 안테나
    for (let wy = bot - h + 4; wy < bot - 4; wy += 5) for (let xx = x + 2; xx < x + w - 2; xx += 3)
      if (hash(xx * 7 + wy * 3) > 0.86) g.set(xx, Y(wy), '#f3d6a0');
    x += w + Math.floor(hash(i * 13 + 4) * 3);
  }
  // 나무 (집 사이 동글동글)
  const TREE = '#7f6a95', TREEL = '#93809f';
  for (const [tx, r] of [[18, 7], [58, 6], [108, 8], [155, 6]]) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = x * x + y * y * 1.2;
      if (d < r * r) g.set(tx + x, Y(bot - 14 - r + y), d < (r - 2) * (r - 2) && x + y < -2 ? TREEL : TREE);
    }
    g.rect(tx, Y(bot - 14), 2, 14, '#6b587c');
  }
  // 가까운 집: 벽·지붕·창틀·문·굴뚝
  const WALLS = [['#a77a9e', '#94698c'], ['#b58aa6', '#a07893'], ['#9c7398', '#8a6387']];
  const houses = [[0, 22, 26], [24, 28, 34], [55, 18, 22], [76, 32, 30], [110, 22, 38], [134, 26, 24], [162, 24, 30]];
  houses.forEach(([x0, w, h], hi) => {
    const [wall, wallS] = WALLS[hi % 3];
    const base = bot, roofH = Math.min(9, Math.floor(w / 2));
    for (let x = x0; x < Math.min(VIEW_W, x0 + w); x++) {
      const rh = Math.min(x - x0, x0 + w - 1 - x, roofH);
      const roofTop = base - h - rh;
      for (let wy = roofTop; wy < base; wy++) {
        let c = wy < base - h ? SC.townS : (x === x0 + w - 1 ? wallS : wall);
        if (wy === roofTop) c = '#c99ac2'; // 지붕 끝 빛
        if (wy === base - h) c = '#73536f'; // 처마 그림자
        g.set(x, Y(wy), c);
      }
    }
    // 창: 십자 창틀, 대부분 불 켜짐
    for (let wy = base - h + 5; wy < base - 9; wy += 10) for (let x = x0 + 3; x < x0 + w - 6; x += 9) {
      const lit = hash(x * 31 + wy) > 0.25;
      g.rect(x - 1, Y(wy - 1), 6, 7, '#73536f');
      g.rect(x, Y(wy), 4, 5, lit ? P.yellow : '#8a7aa0');
      if (lit) { g.rect(x, Y(wy + 4), 4, 1, P.yellowS); g.set(x, Y(wy), '#fff5c8'); }
      g.rect(x + 2, Y(wy), 1, 5, '#73536f'); g.rect(x, Y(wy + 2), 4, 1, '#73536f');
    }
    // 문
    if (w >= 22) { const dx = x0 + w - 9; g.rect(dx - 1, Y(base - 10), 6, 10, '#73536f'); g.rect(dx, Y(base - 9), 4, 9, '#c48a5c'); g.set(dx + 3, Y(base - 5), P.yellow); }
    // 굴뚝 + 연기
    if (hi % 2 === 1) {
      const cx = x0 + 4, cy = base - h - roofH + 2;
      g.rect(cx, Y(cy - 9), 5, 9, SC.townS); g.rect(cx - 1, Y(cy - 10), 7, 2, '#73536f');
      for (const [ox, oy, r] of [[2, -15, 2.2], [4, -20, 2.8], [2, -26, 3.2]])
        for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y < r * r) g.set(cx + ox + x, Y(cy + oy + y), '#f0d4e6');
    }
  });
  return g.toCanvas();
}

// 구름: 동글동글한 덩어리 합집합. 위·왼쪽은 하이라이트, 아래로 갈수록 하늘빛 그림자(디더로 이어짐)
function buildCloud(seed, small = false) {
  const w = small ? 18 + Math.floor(hash(seed) * 12) : 44 + Math.floor(hash(seed) * 30);
  const h = small ? 10 : 24;
  const base = small ? 8 : 19;
  const g = new Grid(w, h);
  const n = small ? 3 : 6;
  const blobs = [];
  for (let i = 0; i < n; i++) {
    const fx = (i + 0.5) / n;
    const r = (small ? 2.5 : 5) + Math.sin(fx * Math.PI) * (small ? 2.5 : 6) + hash(seed * 3 + i) * 2;
    blobs.push([fx * (w - 4) + 2, base - r * 0.7, r]);
  }
  const inC = (x, y) => y <= base && blobs.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 < r * r);
  const top = Math.min(...blobs.map(([, cy, r]) => cy - r));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inC(x, y)) continue;
    const t = (y - top) / (base - top); // 0 위 → 1 아래
    const chk = (x + y) % 2 === 0;
    let c;
    if (small) c = t > 0.6 ? '#dcecf8' : '#f3f8fd';
    else if (!inC(x, y + 1)) c = '#bcd6ee';                        // 맨 아래 가장자리
    else if (t > 0.78 || (t > 0.66 && chk)) c = '#d6ecfb';          // 아래 그림자
    else if (!inC(x - 1, y - 1) || (!inC(x, y - 2) && chk)) c = '#ffffff'; // 빛 받는 위·왼쪽
    else c = P.white;
    g.set(x, y, c);
  }
  return g.toCanvas();
}

// 부드러운 값 노이즈 (격자점 해시를 smoothstep으로 보간) → 성운이 네모 블록으로 안 보이게
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const h = (i, j) => hash((i * 73856093) ^ (j * 19349663) ^ (seed * 83492791));
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * sx, b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * sx;
  return a + (b - a) * sy;
}

// 우주 소품
function buildNebula(seed) {
  const W = 120, H = 90, g = new Grid(W, H);
  const COL = [['#2c2770', '#352a78'], ['#3b2a6e', '#4a3073']][seed % 2];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = (x - W / 2) / (W / 2), ny = (y - H / 2) / (H / 2);
    const fall = 1 - (nx * nx + ny * ny);
    if (fall <= 0) continue;
    const v = fall * 0.7 + vnoise(x / 11, y / 9, seed * 7 + 1) * 0.45 + vnoise(x / 4, y / 4, seed * 7 + 2) * 0.15;
    const chk = (x + y) % 2 === 0;
    if (v > 0.9) g.set(x, y, COL[1]);
    else if (v > 0.72 && chk) g.set(x, y, COL[0]);
  }
  return g.toCanvas();
}
function buildRingPlanet() {
  const W = 40, H = 24, g = new Grid(W, H), cx = 20, cy = 12, R = 8;
  const ring = (x, y) => { const e = ((x - cx) / 18) ** 2 + ((y - cy) / 4.5) ** 2; return e < 1 && e > 0.55; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ring(x, y) && y < cy) g.set(x, y, '#c99a62'); // 뒤쪽 고리
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > R) continue;
    const band = Math.floor((y - cy + R) / 3) % 2;
    let c = band ? '#e7a96b' : '#f0c08a';
    if ((x - cx) + (y - cy) > R * 0.6) c = band ? '#c9874f' : '#d79c66';
    if (d > R - 1) c = '#a86f45';
    g.set(x, y, c);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ring(x, y) && y >= cy) g.set(x, y, y === cy ? '#f6dca8' : '#f3d29b'); // 앞쪽 고리
  return g.toCanvas();
}
function buildSatellite() {
  return fromRowsLocal(['..BB.......BB..', '.BBBB.WWW.BBBB.', 'XXXXXXWGWXXXXXX', '.BBBB.WWW.BBBB.', '..BB...X...BB..', '.......Y.......'],
    { B: '#5b8fd6', X: '#8085a0', W: '#d2d5e4', G: '#a9adc4', Y: '#ffe27a' });
}
function fromRowsLocal(rows, colors) {
  const g = new Grid(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (colors[ch]) g.set(x, y, colors[ch]); }));
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

// 바닥에 있을 때 카메라 윗변. 화면이 길어진 만큼 위(천장 쪽)를 더 보여 주되 천장(-300) 위 지붕까지는 안 올라가고, 나머지는 바닥 쪽으로.
const camRest = () => Math.max(-300, -280 - Math.round(extraH() * 0.6));

export class Renderer {
  constructor() {
    this.buf = makeCanvas(VIEW_W, VIEW_H);
    this.ctx = this.buf.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.sky = buildSkyStrip();
    this.room = buildRoom();
    this.town = buildTown();
    this.clouds = [0, 1, 2, 3].map(i => buildCloud(i + 1));
    this.smallClouds = [0, 1, 2].map(i => buildCloud(i + 11, true));
    this.nebulae = [buildNebula(0), buildNebula(1)];
    this.ringPlanet = buildRingPlanet();
    this.satellite = buildSatellite();
    this.earth = buildEarth();
    this.moon = buildMoon();
    this.icons = getIcons();
    this.camTop = camRest();
    this.shake = 0;
    this.shakeAmp = 0;
    this.particles = [];
    this.screenParticles = [];
    this.fx = new Map(); // cat id → { landT, surpriseUntil }
    this.streaks = [];
    this.time = 0;
    this.tour = null;
  }

  // 화면 세로 칸 수(VIEW_H)가 바뀌면 버퍼를 새로 만든다
  resize() {
    this.buf = makeCanvas(VIEW_W, VIEW_H);
    this.ctx = this.buf.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.camTop = Math.min(this.camTop, camRest());
  }

  reset() {
    this.camTop = camRest();
    this.particles.length = 0;
    this.screenParticles.length = 0;
    this.fx.clear();
    this.streaks.length = 0;
    this.tour = null;
  }

  camTarget(game) {
    return Math.min(game.crane.y - 60, camRest());
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
      target = target + (camRest() - target) * k;
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

    // 하늘: 디더 띠에서 화면 높이만큼 잘라 그린다 (띠 위쪽은 맨 위 색으로)
    {
      const r0 = SKY_H + camTop; // 화면 맨 위 줄에 해당하는 띠의 줄
      if (r0 < 0) { ctx.fillStyle = SKY[SKY.length - 1][1]; ctx.fillRect(-4, -4, VIEW_W + 8, Math.min(vh, -r0) + 8); }
      const r1 = Math.max(0, r0), dy = r1 - r0, hh = Math.min(SKY_H - r1, vh + 8 - dy);
      if (hh > 0) ctx.drawImage(this.sky, 0, r1, VIEW_W, hh, 0, dy, VIEW_W, hh);
      if (sx || sy) { // 흔들림으로 비는 가장자리
        ctx.fillStyle = skyAt(Math.max(0, -camTop));
        ctx.fillRect(-4, -4, 4, vh + 8); ctx.fillRect(VIEW_W, -4, 4, vh + 8); ctx.fillRect(-4, -4, VIEW_W + 8, 4); ctx.fillRect(-4, vh, VIEW_W + 8, 4);
      }
    }
    const hTop = -camTop, hBot = -(camTop + vh);

    // 성운 (패럴랙스 0.35): 우주 구간 배경의 은은한 구름
    if (hTop > 1250) {
      for (const [i, wh0, x] of [[0, 1550, 30], [1, 2050, 70], [0, 2600, 10]]) {
        const img = this.nebulae[i];
        const y = Math.round((-wh0 - camTop) * 0.35 + vh * 0.5 - img.height / 2);
        if (y < vh && y > -img.height) ctx.drawImage(img, x, y);
      }
    }
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
    // 고리 행성 (패럴랙스 0.25)
    if (hTop > 1350) {
      const y = Math.round((-1900 - camTop) * 0.25 + vh * 0.3 - this.ringPlanet.height / 2);
      if (y < vh && y > -this.ringPlanet.height) ctx.drawImage(this.ringPlanet, 128, y);
    }
    // 별똥별: 우주 구간에서 7초마다 한 번, 0.5초 동안 대각선으로
    if (hTop > 1300) {
      const k = Math.floor(T / 7), ph = T - k * 7;
      if (ph < 0.5) {
        const x0 = 20 + hash(k * 3 + 1) * 140, y0 = 20 + hash(k * 3 + 2) * (vh * 0.4);
        const p = ph / 0.5;
        for (let i = 0; i < 7; i++) {
          const q = p * 40 - i * 2;
          if (q < 0) continue;
          ctx.fillStyle = i === 0 ? P.white : i < 3 ? P.yellow : 'rgba(255,226,122,0.5)';
          ctx.fillRect(Math.round(x0 - q), Math.round(y0 + q * 0.5), 1, 1);
        }
      }
    }
    // 인공위성 (우주 초입을 천천히 가로지름)
    if (hTop > 1200 && hBot < 1900) {
      const y = Math.round((-1450 - camTop) * 0.6 + vh * 0.3);
      const x = Math.round(((T * 6) % 260) - 40);
      if (y < vh && y > -10) ctx.drawImage(this.satellite, x, y);
    }
    // 멀리 보이는 지구 (패럴랙스 0.3)
    if (hTop > 1150 && hBot < 2300) {
      const y = Math.round(-390 - camTop * 0.3) - this.earth.height / 2;
      if (y < vh && y > -this.earth.height) ctx.drawImage(this.earth, 14, y);
    }
    // 먼 작은 구름 (패럴랙스 0.5, 느리게)
    if (hTop > 420 && hBot < 1400) {
      const L = camTop * 0.5;
      const c0 = Math.floor(L / 40) - 1, c1 = Math.floor((L + vh) / 40) + 1;
      for (let c = c0; c <= c1; c++) {
        if (hash(c * 53 + 9) < 0.35) continue;
        const y = Math.round(c * 40 + hash(c * 59) * 20 - L);
        const wh = -(camTop + y);
        if (wh < 450 || wh > 1350) continue;
        const img = this.smallClouds[Math.floor(hash(c * 61) * 3)];
        const x = Math.round(((hash(c * 67) * 240 + T * (1.5 + hash(c * 71) * 2)) % 240) - 30);
        ctx.drawImage(img, x, y);
      }
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
    const f = this._fx(cat);
    const p = game.catPos(cat);
    const y = p.y - camTop;
    if (y < -40 || y > VIEW_H + 400) return;
    // 미리 돌려 둔 도트 그림(RotSprite)을 쓴다. 캔버스 회전은 얼굴 픽셀을 깨뜨린다.
    const step = Math.round((p.angle / (Math.PI * 2)) * ROT_STEPS);
    const img = catSpriteRot(cat.type, this._expr(game, cat, f), cat.flip, step);
    const cos = Math.cos(p.angle), sin = Math.sin(p.angle);
    const cx = p.x - (cat.off.x * cos - cat.off.y * sin), cy = y - (cat.off.x * sin + cat.off.y * cos);
    // 착지 찌부러짐: 0.85 → 1.05 → 1.0 (120ms)
    let sy = 1;
    const lt = this.time - f.landT;
    if (lt >= 0 && lt < 0.12) {
      const a = 0.15 * (0.4 + f.impact * 0.6);
      if (lt < 0.04) sy = 1 - a * (lt / 0.04);
      else if (lt < 0.08) sy = 1 - a + (a + 0.05) * ((lt - 0.04) / 0.04);
      else sy = 1.05 - 0.05 * ((lt - 0.08) / 0.04);
    }
    const x0 = Math.round(cx - img.width / 2), y0 = Math.round(cy - img.height / 2);
    if (sy === 1) { ctx.drawImage(img, x0, y0); return; }
    ctx.save();
    ctx.translate(x0 + img.width / 2, y0 + img.height);
    ctx.scale(2 - sy, sy);
    ctx.drawImage(img, -img.width / 2, -img.height);
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
    // 착지 지점: 고양이 폭 아래로 가장 높은 윗면(고양이·방석)
    const half = t.w / 2;
    let land = Infinity, onCat = false;
    const over = b => b.bounds.max.x / 3 > c.x - half && b.bounds.min.x / 3 < c.x + half;
    if (over(game.cushion)) land = game.cushion.bounds.min.y / 3;
    for (const cat of game.cats) if (cat.landed && over(cat.body) && cat.body.bounds.min.y / 3 < land) { land = cat.body.bounds.min.y / 3; onCat = true; }
    const ly = Math.round(land - camTop);
    // 조준선: 떨어질 자리가 고양이 위면 노랗게
    ctx.fillStyle = onCat ? P.yellowS : 'rgba(58,40,56,0.28)';
    for (let y = hy + t.h / 2 + 3; y < Math.min(vh, ly - t.h - 1); y += 4) ctx.fillRect(cx, y, 1, 2);
    // 착지 미리보기: 들고 있는 고양이 모양 실루엣을 그 자리에 반투명으로 (아무것도 없으면 생략)
    if (land !== Infinity && ly - t.h < vh) {
      const gh = catGhost(c.type, onCat);
      ctx.save();
      ctx.globalAlpha = onCat ? 0.55 : 0.25;
      ctx.translate(cx, ly - t.h / 2);
      if (c.flip) ctx.scale(-1, 1);
      ctx.drawImage(gh, -gh.width / 2, -gh.height / 2);
      ctx.restore();
    }
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
