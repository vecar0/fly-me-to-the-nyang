// 팔레트 + 픽셀 스프라이트 생성. 모든 그림은 이 팔레트 색으로만 칠한다.
import { CAT_TYPES } from './config.js?v=1.5.0';

export const P = {
  line: '#3a2838', eye: '#2a1f2e', white: '#fffaf2', paper: '#f3ece4',
  cream: '#f6e3c4', creamS: '#e2c59d', creamL: '#fff3de',
  orange: '#f4a259', orangeS: '#d9793f', orangeL: '#ffcd8a',
  gray: '#a9adc4', grayS: '#8085a0', grayL: '#d2d5e4',
  dark: '#4b4a63', darkS: '#34334a', darkL: '#6d6c88',
  brown: '#7a4e3c', brownL: '#a06a4c',
  box: '#d4a373', boxS: '#b07d50', boxL: '#ecc79b',
  pink: '#f7a8b8', blush: '#f48fa6', red: '#e2566a', redS: '#b33d55',
  yellow: '#ffe27a', yellowS: '#f2b84b', green: '#86c97a', greenS: '#5a9a5f',
  eyeGreen: '#b8e05a', eyeBlue: '#79c6f0', sky: '#bfe6ff',
  glass: '#e3f6ff', glassS: '#9fd4ee', purple: '#8d6bb8', navy: '#1b1640',
};

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const rgbCache = new Map();
function rgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
  }
  return v;
}

export class Grid {
  constructor(w, h) { this.w = w; this.h = h; this.c = new Array(w * h).fill(null); }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, col) { if (this.in(x, y)) this.c[y * this.w + x] = col; }
  get(x, y) { return this.in(x, y) ? this.c[y * this.w + x] : null; }
  rect(x, y, w, h, col) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col); }
  toCanvas() {
    const cv = makeCanvas(this.w, this.h);
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(this.w, this.h);
    for (let i = 0; i < this.c.length; i++) {
      const col = this.c[i];
      if (!col) continue;
      const [r, g, b] = rgb(col);
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

// 문자열 그림 → 캔버스. 문자마다 색을 지정.
export function fromRows(rows, colors) {
  const g = new Grid(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (colors[ch]) g.set(x, y, colors[ch]); }));
  return g.toCanvas();
}

// ---------- 고양이 ----------

function inPoly(px, py, verts) {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const [xi, yi] = verts[i], [xj, yj] = verts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inShape(t, px, py) {
  if (px < 0 || py < 0 || px > t.w || py > t.h) return false;
  if (t.shape === 'circle') {
    const r = t.w / 2;
    return (px - r) ** 2 + (py - r) ** 2 <= r * r;
  }
  if (t.shape === 'poly') return inPoly(px, py, t.verts);
  const r = t.r;
  const dx = Math.max(r - px, 0, px - (t.w - r));
  const dy = Math.max(r - py, 0, py - (t.h - r));
  return dx * dx + dy * dy <= r * r + 0.01;
}

const FUR = {
  orange: ['orange', 'orangeS', 'orangeL'],
  gray: ['gray', 'grayS', 'grayL'],
  white: ['white', 'paper', 'white'],
  dark: ['dark', 'darkS', 'darkL'],
  cream: ['cream', 'creamS', 'creamL'],
};

// face: 두 눈 사이 중심, gap: 중심에서 눈까지 거리. 얼굴은 왼쪽(뒤집으면 오른쪽).
const DESIGN = {
  loaf:    { fur: 'orange', pattern: 'stripes', face: [6, 6], gap: 3, ears: [[3, 2], [9, 2]], paws: [2, 8], chest: true,
             tail: [[27, 10], [28, 9], [29, 8], [30, 7], [30, 6], [29, 5]] },
  box:     { fur: 'gray', pattern: 'box', face: [10, 4], gap: 3, ears: [[5, 2], [15, 2]] },
  kitten:  { fur: 'white', pattern: 'kitten', face: [6, 4], gap: 2, ears: [[2, 1], [9, 1]], paws: [2, 7],
             tail: [[11, 6], [12, 5], [13, 4], [13, 3]] },
  sit:     { fur: 'dark', pattern: 'sit', face: [9, 6], gap: 2, ears: [[7, 1], [11, 1]], eye: 'eyeGreen', mouth: 'darkL',
             tail: [[16, 21], [18, 20], [19, 19], [20, 17], [20, 15], [19, 13], [18, 12]] },
  ball:    { fur: 'cream', pattern: 'ball', face: [6, 9], gap: 2, ears: [[4, 3], [9, 2]] },
  stretch: { fur: 'gray', pattern: 'stripes', face: [5, 3], gap: 2, ears: [[3, 1], [8, 1]], paws: [1, 30], chest: true,
             tail: [[39, 4], [40, 3], [41, 2], [42, 2], [43, 3]] },
  chonk:   { fur: 'white', pattern: 'calico', face: [8, 8], gap: 3, ears: [[4, 2], [12, 2]], paws: [3, 10, 22],
             tail: [[31, 15], [32, 14], [33, 12], [34, 10], [34, 8], [33, 7]] },
  flat:    { fur: 'cream', pattern: 'siamese', face: [5, 2], gap: 2, ears: [[3, 1], [7, 1]], eye: 'eyeBlue',
             tail: [[35, 4], [36, 3], [37, 3], [38, 4], [39, 5]] },
  ears:    { fur: 'white', pattern: 'ears', face: [9, 12], gap: 3, ears: [], eye: 'eyeBlue' },
  space:   { fur: 'orange', pattern: 'space', face: [11, 12], gap: 3, ears: [] },
};

export const EXPRS = ['calm', 'blink', 'surprise', 'fall', 'yawn'];
export const PAD = 6;

const EAR = ['..X..', '.XXX.', '.XPX.', 'XXPXX'];
const BIG_EAR = ['X....', 'XX...', 'XPX..', 'XPPX.', 'XPPXX', 'XXXXX'];

function buildCat(ti, expr) {
  const t = CAT_TYPES[ti];
  const d = DESIGN[t.key];
  const W = t.w + PAD * 2, H = t.h + PAD * 2;
  const g = new Grid(W, H);
  const [fb, fs, fl] = FUR[d.fur].map(k => P[k]);
  const mask = new Uint8Array(W * H);
  const M = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? mask[y * W + x] : 0);
  const put = (x, y, col) => { const X = x + PAD, Y = y + PAD; if (g.in(X, Y)) { g.set(X, Y, col); mask[Y * W + X] = 1; } };
  const paint = (x, y, col) => { const X = x + PAD, Y = y + PAD; if (M(X, Y)) g.set(X, Y, col); };

  // 몸통
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    let inside = inShape(t, x + 0.5, y + 0.5);
    if (t.key === 'box' && y < 8) inside = inShape({ shape: 'rect', w: 16, h: 14, r: 4 }, x - 2 + 0.5, y + 0.5);
    if (inside) put(x, y, fb);
  }
  // 음영: 아래 2칸은 그림자, 그 위 1칸은 바둑판 디더로 부드럽게 / 위·왼쪽 가장자리는 빛, 그 안쪽 1칸은 디더 하이라이트
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const X = x + PAD, Y = y + PAD;
    if (!M(X, Y)) continue;
    const chk = (x + y) % 2 === 0;
    if (!M(X, Y + 1) || !M(X, Y + 2)) g.set(X, Y, fs);
    else if (!M(X, Y + 3) && chk) g.set(X, Y, fs);
    else if (!M(X, Y - 1) || !M(X - 1, Y)) g.set(X, Y, fl);
    else if ((!M(X, Y - 2) || !M(X - 2, Y)) && chk && fl !== fb) g.set(X, Y, fl);
    else if (hash2(x, y, ti) < 0.05 && M(X + 1, Y) && M(X, Y + 3)) g.set(X, Y, hash2(y, x, ti) < 0.5 ? fs : fl); // 털 질감 점
  }

  const [fx, fy] = d.face;
  const nearFace = (x, y, r = 5) => (x - fx) ** 2 + (y - fy - 1) ** 2 < r * r;

  // 무늬
  if (d.pattern === 'stripes') {
    for (let y = 0; y < t.h * 0.55; y++) for (let x = 0; x < t.w; x++)
      if (x % 4 === 0 && !nearFace(x, y, 6) && x < t.w - 2) paint(x, y, fs);
  } else if (d.pattern === 'calico') {
    const blob = (cx, cy, r, col) => { for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r && !nearFace(x, y, 5)) paint(x, y, col); };
    blob(21, 5, 6, P.orange); blob(27, 14, 4.5, P.dark); blob(14, 0, 3.5, P.dark); blob(3, 0, 3, P.orange);
    for (let x = 6; x < 26; x++) paint(x, t.h - 2, P.paper);
  } else if (d.pattern === 'siamese') {
    for (let y = -1; y < t.h; y++) for (let x = 0; x < t.w; x++)
      if ((x - fx) ** 2 + ((y - fy - 1) * 1.3) ** 2 < 14) paint(x, y, P.brownL);
    for (let x = 0; x < 3; x++) for (let y = 5; y < 8; y++) paint(x, y, P.brown);
  } else if (d.pattern === 'sit') {
    for (let y = 9; y < 15; y++) for (let x = 7; x < 11; x++) if (Math.abs(x - 8.5) < 2 - (y - 9) * 0.25) paint(x, y, P.darkL);
    for (const x of [4, 5, 12, 13]) { paint(x, 21, P.white); paint(x, 20, P.white); }
  } else if (d.pattern === 'ball') {
    for (let a = 0.2; a < 2.4; a += 0.08) {
      const x = Math.round(9 + Math.cos(a) * 6.5), y = Math.round(9 + Math.sin(a) * 6.5);
      paint(x, y, P.creamS);
    }
    for (let a = -1.2; a < 0.6; a += 0.1) paint(Math.round(9 + Math.cos(a) * 5), Math.round(9 + Math.sin(a) * 5), P.brownL);
    for (let a = -1.0; a < 0.4; a += 0.1) paint(Math.round(9 + Math.cos(a) * 7.5), Math.round(9 + Math.sin(a) * 7.5), P.brownL);
  } else if (d.pattern === 'box') {
    for (let y = 8; y < t.h; y++) for (let x = 0; x < t.w; x++) {
      let c = P.box;
      if (y <= 9) c = P.boxL;
      else if (y >= t.h - 2 || x === 0 || x === t.w - 1) c = P.boxS;
      else if (x === 10 && y > 11) c = P.boxS;
      else if (y === 12 && x > 3 && x < 8) c = P.boxL;
      else if (y === 15 && x > 13 && x < 17) c = P.line; // 손잡이 구멍
      else if (y === 16 && x > 13 && x < 17) c = P.boxS;
      paint(x, y, c);
    }
    for (const x of [5, 6, 13, 14]) paint(x, 8, P.grayL);
    for (const x of [5, 6, 13, 14]) paint(x, 9, P.gray);
  } else if (d.pattern === 'kitten') {
    for (let x = 1; x < 5; x++) for (let y = 0; y < 3; y++) if ((x - 2.5) ** 2 + (y - 0.5) ** 2 < 3) paint(x + 6, y, P.creamS);
  } else if (d.pattern === 'space') {
    // 헬멧 유리 + 안쪽 고양이 머리
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
      const r = Math.hypot(x + 0.5 - 11, y + 0.5 - 11);
      if (r > 11) continue;
      const head = Math.hypot(x + 0.5 - 11, (y + 0.5 - 12.5) * 1.1);
      let c = P.glass;
      if (r > 9.6) c = P.glassS;
      if (head < 7) c = y > 15 ? P.orangeS : (head > 6 ? P.orangeS : P.orange);
      paint(x, y, c);
    }
    // 헬멧 안의 귀
    for (const [ex, sgn] of [[6, 1], [16, -1]]) for (let i = 0; i < 4; i++) for (let j = 0; j <= i; j++) paint(ex + sgn * j * 0 + (sgn > 0 ? j : -j), 4 + i, i === 3 || j === 0 ? P.orange : P.pink);
    for (const [x, y] of [[5, 4], [4, 5], [4, 6], [6, 3]]) paint(x, y, P.white);
    for (const [x, y] of [[2, 19], [3, 20], [1, 18]]) paint(x, y, P.grayL);
  } else if (d.pattern === 'ears') {
    for (let y = 14; y < t.h; y++) for (let x = 4; x < 14; x++) if ((x - 9) ** 2 / 25 + (y - 19) ** 2 / 16 < 1) paint(x, y, P.creamL);
  }

  // 가슴털: 얼굴 아래 밝은 털
  if (d.chest) for (let y = fy + 3; y < t.h - 1; y++) for (let x = fx - 3; x <= fx + 3; x++)
    if ((x - fx) ** 2 / 7 + (y - fy - 5) ** 2 / 5 < 1) paint(x, y, (x + y) % 2 && y === fy + 3 ? fb : fl);
  // 앞발: 바닥줄에 밝은 발 3칸 + 발가락 사이 선
  if (d.paws) for (const px of d.paws) {
    const pc = d.fur === 'white' ? P.paper : fl, toe = fs;
    paint(px, t.h - 2, pc); paint(px + 1, t.h - 2, pc); paint(px + 2, t.h - 2, pc);
    paint(px, t.h - 1, pc); paint(px + 1, t.h - 1, toe); paint(px + 2, t.h - 1, pc);
  }

  // 귀
  for (const [cx, by] of d.ears) {
    EAR.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === '.') return;
      const x = cx - 2 + i, y = by - 3 + j;
      let col = ch === 'P' ? P.pink : fb;
      if (d.pattern === 'siamese') col = ch === 'P' ? P.brownL : P.brown;
      if (d.pattern === 'sit' && ch === 'P') col = P.darkL;
      put(x, y, col);
    }));
  }
  if (t.key === 'ears') {
    BIG_EAR.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === '.') return;
      put(1 + i, j - 1, ch === 'P' ? P.pink : P.white);
      put(16 - i, j - 1, ch === 'P' ? P.pink : P.white);
    }));
  }
  if (t.key === 'space') { put(11, -1, P.grayS); put(11, -2, P.grayS); put(11, -3, P.red); put(10, -3, P.red); put(11, -4, P.red); put(10, -4, P.red); }

  // 꼬리
  if (d.tail) {
    const tailCol = d.pattern === 'siamese' ? P.brown : (d.pattern === 'calico' ? P.orange : fs);
    d.tail.forEach(([x, y], i) => { put(x, y, i % 3 === 1 && d.pattern === 'stripes' ? fb : tailCol); });
  }

  // 외곽선 (4방향)
  const outline = [];
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    if (M(X, Y)) continue;
    if (M(X - 1, Y) || M(X + 1, Y) || M(X, Y - 1) || M(X, Y + 1)) outline.push([X, Y]);
  }
  // 선택적 외곽선(selout): 빛 받는 위·왼쪽은 옆 털색을 어둡게, 그늘진 아래·오른쪽은 진한 선
  for (const [X, Y] of outline) {
    const lit = M(X + 1, Y) || M(X, Y + 1);
    const shadow = M(X - 1, Y) || M(X, Y - 1);
    const nb = M(X + 1, Y) ? g.get(X + 1, Y) : M(X, Y + 1) ? g.get(X, Y + 1) : null;
    g.set(X, Y, lit && !shadow && nb ? deepen(nb) : P.line);
  }

  // 얼굴
  const eye = P[d.eye || 'eye'];
  const ink = d.mouth ? P[d.mouth] : P.eye;
  const gp = d.gap;
  const L = fx - gp, R = fx + gp;
  const f = (x, y, c) => { const X = x + PAD, Y = y + PAD; if (M(X, Y)) g.set(X, Y, c); };
  // 눈 두 칸: 왼눈 [L-1, L], 오른눈 [R, R+1] (얼굴 중심 기준 대칭)
  const eyes = [[L - 1, L], [R, R + 1]];
  if (expr === 'calm') {
    for (const [a, b] of eyes) {
      f(a, fy, P.white); f(b, fy, eye); f(a, fy + 1, eye); f(b, fy + 1, d.eye ? P.eye : eye); // 반짝임 + 동공
    }
  } else if (expr === 'blink' || expr === 'yawn') {
    for (const [a, b] of eyes) { f(a, fy + 1, ink); f(b, fy + 1, ink); }
  } else if (expr === 'surprise') {
    for (const [a, b] of eyes) { f(a, fy - 1, eye); f(b, fy - 1, eye); f(a, fy, P.white); f(b, fy, eye); f(a, fy + 1, eye); f(b, fy + 1, eye); }
    f(R + 4, fy - 2, P.eyeBlue); f(R + 4, fy - 1, P.eyeBlue); f(R + 3, fy - 1, P.eyeBlue); f(R + 4, fy, P.glass);
  } else if (expr === 'fall') {
    f(L - 1, fy - 1, ink); f(L, fy, ink); f(L - 1, fy + 1, ink);
    f(R + 1, fy - 1, ink); f(R, fy, ink); f(R + 1, fy + 1, ink);
  }
  // 코, 입, 볼터치
  const cheekY = fy + 2;
  f(L - 1, cheekY, P.blush); f(R + 1, cheekY, P.blush);
  if (expr === 'yawn' || expr === 'fall') {
    f(fx, fy + 1, P.pink); f(fx, fy + 2, ink); f(fx, fy + 3, P.red);
    if (expr === 'yawn') { f(fx - 1, fy + 2, ink); f(fx + 1, fy + 2, ink); f(fx - 1, fy + 3, P.red); f(fx + 1, fy + 3, P.red); }
  } else {
    f(fx, fy + 1, P.pink);
    f(fx - 1, fy + 2, ink); f(fx + 1, fy + 2, ink);
  }
  // 수염: 볼에서 바깥으로 나가다가 몸 밖(빈칸)에 닿으면 2칸씩, 위아래로 살짝 벌어지게
  for (const side of [-1, 1]) {
    let x = side < 0 ? L - 2 : R + 2;
    let steps = 0;
    while (steps++ < 6 && g.get(x + PAD, fy + 2 + PAD)) x += side;
    if (steps > 6) continue;
    for (const [dx, dy] of [[0, 1], [side, 1], [0, 3], [side, 3]]) {
      const X = x + dx + PAD, Y = fy + dy + PAD;
      if (g.in(X, Y) && !g.get(X, Y)) g.set(X, Y, WHISKER);
    }
  }
  return { canvas: g.toCanvas(), mask, W, H };
}

const WHISKER = '#9b8a9a';
function hash2(x, y, k) {
  let n = Math.imul(x * 374761393 + y * 668265263 + k * 2246822519, 3266489917);
  n = (n ^ (n >>> 15)) >>> 0;
  return n / 4294967296;
}
// 외곽선용으로 털색을 어둡게: 원색 55% + 진한 보라 45%
const deepCache = new Map();
function deepen(hex) {
  let c = deepCache.get(hex);
  if (c) return c;
  const a = parseInt(hex.slice(1), 16), b = parseInt(P.line.slice(1), 16);
  const ch = sh => Math.round(((a >> sh) & 255) * 0.55 * 0.9 + ((b >> sh) & 255) * 0.45);
  c = '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  deepCache.set(hex, c);
  return c;
}

const catCache = new Map();
export function catSprite(ti, expr = 'calm') {
  const k = ti + ':' + expr;
  let s = catCache.get(k);
  if (!s) { s = buildCat(ti, expr).canvas; catCache.set(k, s); }
  return s;
}

// ---- 기울어진 고양이: RotSprite 방식 ----
// 캔버스로 바로 돌리면 픽셀이 빠지거나 겹쳐서 눈·입이 깨진다.
// Scale2x를 두 번 해 4배로 매끈하게 키운 뒤, 회전된 각 칸의 중심 한 점만 집어 와 원래 크기로 되돌린다.
export const ROT_STEPS = 64; // 한 바퀴를 64단계(5.6°)로 나눠 미리 만든다
const SUP = 4;
const pixCache = new Map();
const rotCache = new Map();

function pixelsOf(src, flip) {
  const w = src.width, h = src.height;
  const cv = makeCanvas(w, h), c = cv.getContext('2d', { willReadFrequently: true });
  if (flip) { c.translate(w, 0); c.scale(-1, 1); }
  c.drawImage(src, 0, 0);
  return { w, h, d: new Uint32Array(c.getImageData(0, 0, w, h).data.buffer.slice(0)) };
}

// EPX/Scale2x: 대각선 계단을 매끈한 선으로 바꿔 두 배로
function scale2x({ w, h, d }) {
  const W = w * 2, o = new Uint32Array(W * h * 2);
  const at = (x, y) => d[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = d[y * w + x], A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    const i = y * 2 * W + x * 2;
    o[i] = C === A && C !== D && A !== B ? A : p;
    o[i + 1] = A === B && A !== C && B !== D ? B : p;
    o[i + W] = D === C && D !== B && C !== A ? C : p;
    o[i + W + 1] = B === D && B !== A && D !== C ? D : p;
  }
  return { w: W, h: h * 2, d: o };
}

// step: 0..ROT_STEPS-1. 결과 캔버스의 정중앙이 원래 그림의 정중앙.
export function catSpriteRot(ti, expr, flip, step) {
  step = ((step % ROT_STEPS) + ROT_STEPS) % ROT_STEPS;
  if (step === 0 && !flip) return catSprite(ti, expr);
  const k = ti + ':' + expr + ':' + (flip ? 1 : 0) + ':' + step;
  let out = rotCache.get(k);
  if (out) return out;
  const src = catSprite(ti, expr);
  const pk = ti + ':' + expr + ':' + (flip ? 1 : 0);
  let big = pixCache.get(pk);
  if (!big) { big = scale2x(scale2x(pixelsOf(src, flip))); pixCache.set(pk, big); }
  const a = (step / ROT_STEPS) * Math.PI * 2, cos = Math.cos(a), sin = Math.sin(a);
  const w = src.width, h = src.height;
  // 회전한 바운딩 박스 (+2 여유). 원본과 홀짝을 맞춰 중심이 반 칸 어긋나지 않게
  let ow = Math.ceil(Math.abs(w * cos) + Math.abs(h * sin)) + 2, oh = Math.ceil(Math.abs(w * sin) + Math.abs(h * cos)) + 2;
  if ((ow - w) % 2) ow++;
  if ((oh - h) % 2) oh++;
  const cv = makeCanvas(ow, oh), c = cv.getContext('2d');
  const img = c.createImageData(ow, oh), od = new Uint32Array(img.data.buffer);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const dx = x + 0.5 - ow / 2, dy = y + 0.5 - oh / 2;
    const sx = (dx * cos + dy * sin + w / 2) * SUP, sy = (-dx * sin + dy * cos + h / 2) * SUP;
    if (sx < 0 || sy < 0 || sx >= big.w || sy >= big.h) continue;
    od[y * ow + x] = big.d[(sy | 0) * big.w + (sx | 0)];
  }
  // 샘플링 틈으로 생긴 1칸 구멍(사방이 막힌 빈칸)은 위쪽 색으로 메운다
  for (let y = 1; y < oh - 1; y++) for (let x = 1; x < ow - 1; x++) {
    const i = y * ow + x;
    if (!od[i] && od[i - 1] && od[i + 1] && od[i - ow] && od[i + ow]) od[i] = od[i - ow];
  }
  // 얼굴 지키기: 눈동자는 1칸이라 어떤 회전 샘플링이든 특정 각도에선 사라진다.
  // 얼굴 상자 안 원본 픽셀을 회전된 자리로 직접 찍는다. 털색 먼저, 눈·입(진한 색)은 나중에 찍어 항상 이기게.
  const { face: [fx, fy], gap } = DESIGN[CAT_TYPES[ti].key];
  const sp = pixelsOf(src, flip);
  const fx0 = fx - gap - 2 + PAD, fx1 = fx + gap + 2 + PAD;
  const dark = new Set([P.eye, P.line, P.darkL, P.eyeBlue, P.eyeGreen].map(h => { const [r, g, b] = rgb(h); return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; }));
  // 얼굴 상자에서 가장 흔한 밝은 색 = 얼굴 털색
  const cnt = new Map();
  for (let y = fy - 2 + PAD; y <= fy + 2 + PAD; y++) for (let X = fx0; X <= fx1; X++) {
    const col = sp.d[y * w + (flip ? w - 1 - X : X)];
    if (col && !dark.has(col)) cnt.set(col, (cnt.get(col) || 0) + 1);
  }
  const skin = [...cnt].sort((p, q) => q[1] - p[1])[0]?.[0];
  // 회전 샘플링이 얼굴 상자 안에 만든 진한 픽셀은 털색으로 지운다 (눈이 두 배로 굵어지지 않게)
  if (skin) for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const i = y * ow + x;
    if (!dark.has(od[i])) continue;
    const dx = x + 0.5 - ow / 2, dy = y + 0.5 - oh / 2;
    let sx = Math.floor(dx * cos + dy * sin + w / 2), sy = Math.floor(-dx * sin + dy * cos + h / 2);
    if (flip) sx = w - 1 - sx;
    if (sy >= fy - 2 + PAD && sy <= fy + 2 + PAD && sx >= fx0 && sx <= fx1) od[i] = skin;
  }
  for (const pass of [0, 1]) for (let y = fy - 2 + PAD; y <= fy + 2 + PAD; y++) for (let X = fx0; X <= fx1; X++) {
    const x = flip ? w - 1 - X : X;
    const col = sp.d[y * w + x];
    if (!col || dark.has(col) !== (pass === 1)) continue;
    const ux = x + 0.5 - w / 2, uy = y + 0.5 - h / 2;
    const tx = Math.floor(ux * cos - uy * sin + ow / 2), ty = Math.floor(ux * sin + uy * cos + oh / 2);
    if (tx >= 0 && ty >= 0 && tx < ow && ty < oh && od[ty * ow + tx]) od[ty * ow + tx] = col;
  }
  c.putImageData(img, 0, 0);
  rotCache.set(k, cv);
  return cv;
}

export function catSilhouette(ti) {
  const k = ti + ':sil';
  let s = catCache.get(k);
  if (!s) {
    const { mask, W, H } = buildCat(ti, 'calm');
    const g = new Grid(W, H);
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
      if (mask[Y * W + X]) g.set(X, Y, P.darkS);
      else if (mask[Y * W + X - 1] || mask[Y * W + X + 1] || mask[(Y - 1) * W + X] || mask[(Y + 1) * W + X]) g.set(X, Y, P.line);
    }
    s = g.toCanvas();
    catCache.set(k, s);
  }
  return s;
}

// ---------- 작은 아이콘 ----------

let icons = null;
export function getIcons() {
  if (icons) return icons;
  const c = { X: P.line, R: P.red, r: P.redS, W: P.white, G: P.gray, g: P.grayS, Y: P.yellow, y: P.yellowS, B: P.boxS, b: P.box, D: P.darkS, P: P.pink };
  icons = {
    heart: fromRows([
      '.XX.XX.', 'XRWXRRX', 'XRRRRrX', 'XRRRRrX', '.XRRrX.', '..XrX..', '...X...'], c),
    heartEmpty: fromRows([
      '.XX.XX.', 'XDDXDDX', 'XDDDDDX', 'XDDDDDX', '.XDDDX.', '..XDX..', '...X...'], c),
    trophy: fromRows([
      'XXXXXXX', 'XYWYYyX', 'XYWYYyX', '.XYYyX.', '..XyX..', '..XyX..', '.XXXXX.'], c),
    claw: fromRows([
      '....XXXX....', '...XGGGGX...', 'XXXGGGGGgXXX', 'XGgXXXXXXgGX', 'XGX......XGX', 'XgX......XgX', '.X........X.'], c),
    pause: fromRows([
      'XX.XX', 'XX.XX', 'XX.XX', 'XX.XX', 'XX.XX'], { X: P.white }),
    sound: fromRows([
      '..X...', '.XX.X.', 'XXX..X', 'XXX..X', '.XX.X.', '..X...'], { X: P.white }),
    mute: fromRows([
      '..X...', '.XX...', 'XXXX.X', 'XXX.X.', '.XXX.X', '..X...'], { X: P.white }),
    shard: fromRows(['XR', 'Rr'], c),
    flag: fromRows([
      'XXXXX.', 'XRRRRX', 'XRRRX.', 'XXXX..', 'X.....', 'X.....', 'X.....'], c),
  };
  return icons;
}

// ---------- 숫자 폰트 (3x5) ----------

const GLYPH = {
  '0': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'], '1': ['.X.', 'XX.', '.X.', '.X.', 'XXX'],
  '2': ['XXX', '..X', 'XXX', 'X..', 'XXX'], '3': ['XXX', '..X', '.XX', '..X', 'XXX'],
  '4': ['X.X', 'X.X', 'XXX', '..X', '..X'], '5': ['XXX', 'X..', 'XXX', '..X', 'XXX'],
  '6': ['XXX', 'X..', 'XXX', 'X.X', 'XXX'], '7': ['XXX', '..X', '.X.', '.X.', '.X.'],
  '8': ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'], '9': ['XXX', 'X.X', 'XXX', '..X', 'XXX'],
  '.': ['.', '.', '.', '.', 'X'], 'm': ['.....', 'XXXX.', 'X.X.X', 'X.X.X', 'X.X.X'],
  'x': ['...', 'X.X', '.X.', 'X.X', '...'], ':': ['.', 'X', '.', 'X', '.'], ' ': ['..', '..', '..', '..', '..'],
  'N': ['X..X', 'XX.X', 'X.XX', 'X..X', 'X..X'], 'E': ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
  'W': ['X...X', 'X...X', 'X.X.X', 'X.X.X', '.X.X.'], '!': ['X', 'X', 'X', '.', 'X'],
  'D': ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'], 'A': ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
  'I': ['XXX', '.X.', '.X.', '.X.', 'XXX'], 'L': ['X..', 'X..', 'X..', 'X..', 'XXX'],
  'Y': ['X.X', 'X.X', '.X.', '.X.', '.X.'], 'T': ['XXX', '.X.', '.X.', '.X.', '.X.'],
  'X': ['X.X', 'X.X', '.X.', 'X.X', 'X.X'], '-': ['...', '...', 'XXX', '...', '...'],
  '/': ['..X', '..X', '.X.', 'X..', 'X..'], '+': ['...', '.X.', 'XXX', '.X.', '...'],
  'V': ['X.X', 'X.X', 'X.X', 'X.X', '.X.'],
  // 나머지 영문 대문자 (빠진 글자는 빈칸으로 나와 'PERFECT'가 깨졌었다)
  'B': ['XX.', 'X.X', 'XX.', 'X.X', 'XX.'], 'C': ['.XX', 'X..', 'X..', 'X..', '.XX'],
  'F': ['XXX', 'X..', 'XX.', 'X..', 'X..'], 'G': ['.XX', 'X..', 'X.X', 'X.X', '.XX'],
  'H': ['X.X', 'X.X', 'XXX', 'X.X', 'X.X'], 'J': ['..X', '..X', '..X', 'X.X', '.X.'],
  'K': ['X.X', 'X.X', 'XX.', 'X.X', 'X.X'], 'M': ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'],
  'O': ['.X.', 'X.X', 'X.X', 'X.X', '.X.'], 'P': ['XX.', 'X.X', 'XX.', 'X..', 'X..'],
  'Q': ['.X.', 'X.X', 'X.X', 'XX.', '.XX'], 'R': ['XX.', 'X.X', 'XX.', 'X.X', 'X.X'],
  'S': ['.XX', 'X..', '.X.', '..X', 'XX.'], 'U': ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'],
  'Z': ['XXX', '..X', '.X.', 'X..', 'XXX'], '?': ['XX.', '..X', '.X.', '...', '.X.'],
};

const numCache = new Map();
// 테두리 있는 숫자 문자열 캔버스. scale은 정수.
export function numText(str, color = P.white, outline = P.line, scale = 1) {
  const k = str + color + outline + scale;
  let c = numCache.get(k);
  if (c) return c;
  const chars = [...str].map(ch => GLYPH[ch] || GLYPH[' ']);
  const w = chars.reduce((s, gl) => s + gl[0].length + 1, 0) - 1;
  const g = new Grid(w * scale + 2, 5 * scale + 2);
  let ox = 1;
  for (const gl of chars) {
    gl.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') g.rect(ox + x * scale, 1 + y * scale, scale, scale, color); }));
    ox += (gl[0].length + 1) * scale;
  }
  // 외곽선 (8방향)
  const base = g.c.slice();
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (base[y * g.w + x]) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < g.w && yy < g.h && base[yy * g.w + xx]) { near = true; break; }
    }
    if (near && outline) g.set(x, y, outline);
  }
  c = g.toCanvas();
  numCache.set(k, c);
  return c;
}
