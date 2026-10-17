// HUD, 타이틀, 일시정지, 게임오버, 도감. 전부 저해상도 버퍼에 픽셀로 그린다.
import { VIEW_W, VIEW_H, extraH, CAT_TYPES, ZONES } from './config.js?v=1.5.1';
import { P, Grid, makeCanvas, catSprite, catSilhouette, numText, getIcons } from './sprites.js?v=1.5.1';
import { VERSION } from './version.js?v=1.5.1';

// 한글 픽셀 폰트 Galmuri(OFL, fonts/OFL-Galmuri.txt). 정해진 크기(11 Bold=12px, 9=10px)로만 그려야 픽셀이 칸에 딱 맞는다.
// size 10 이하는 작은 글씨, 그 외는 굵은 글씨. 더 크게는 drawCentered의 정수 배율로 키운다.
const FALLBACK = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
const FACES = {
  big: { family: 'Galmuri11B', file: 'Galmuri11-Bold', px: 12 },
  small: { family: 'Galmuri9', file: 'Galmuri9', px: 10 },
};
const faceFor = size => (size <= 10 ? FACES.small : FACES.big);

const textCache = new Map();
// 폰트가 늦게 오면 그 전에 대체 글꼴로 만든 글씨를 버린다
export const fontsReady = typeof FontFace === 'undefined' ? Promise.resolve() : Promise.all(Object.values(FACES).map(f =>
  new FontFace(f.family, `url(${new URL(`../fonts/${f.file}.woff2?v=${VERSION}`, import.meta.url)})`).load().then(ff => document.fonts.add(ff)),
)).then(() => textCache.clear(), () => {});

// 픽셀 폰트를 원래 크기로 그린 뒤 알파를 이진화 → 픽셀 글씨 + 1px 외곽선
export function pxText(str, { size = 11, color = P.white, outline = P.line, thresh = 128 } = {}) {
  const key = [str, size, color, outline, thresh].join('|');
  let out = textCache.get(key);
  if (out) return out;
  const face = faceFor(size);
  const font = `${face.px}px "${face.family}", ${FALLBACK}`;
  const tmp = makeCanvas(8, 8);
  let tc = tmp.getContext('2d', { willReadFrequently: true }); // 글자마다 픽셀을 읽는다
  tc.font = font;
  const m = tc.measureText(str);
  const asc = Math.round(m.fontBoundingBoxAscent ?? face.px), desc = Math.round(m.fontBoundingBoxDescent ?? 2);
  const w = Math.ceil(m.width) + 2;
  const h = asc + desc;
  tmp.width = w; tmp.height = h;
  tc = tmp.getContext('2d', { willReadFrequently: true });
  tc.font = font;
  tc.textBaseline = 'alphabetic';
  tc.fillStyle = '#000';
  tc.fillText(str, 1, asc);
  const a = tc.getImageData(0, 0, w, h).data;
  const g = new Grid(w + 2, h + 2);
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] >= thresh;
  // 글자 바깥 빈칸만 표시 (ㅇ·ㅁ·A 속 구멍은 제외) → 외곽선이 글자 속을 메워 뭉개지지 않게
  const outside = new Uint8Array((w + 2) * (h + 2));
  if (outline) {
    const q = [0];
    outside[0] = 1;
    while (q.length) {
      const i = q.pop(), x = i % (w + 2), y = (i / (w + 2)) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy, j = Y * (w + 2) + X;
        if (X < 0 || Y < 0 || X >= w + 2 || Y >= h + 2 || outside[j] || on(X - 1, Y - 1)) continue;
        outside[j] = 1;
        q.push(j);
      }
    }
  }
  // 작은 글씨(10px)는 획 사이가 1칸이라 테두리를 두르면 붙어 버린다 → 아래쪽 1칸 그림자만
  const shadowOnly = face === FACES.small;
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    if (on(x, y)) g.set(x + 1, y + 1, color);
    else if (outline && outside[(y + 1) * (w + 2) + x + 1]) {
      let near = false;
      if (shadowOnly) near = on(x, y - 1) || on(x - 1, y - 1);
      else for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (on(x + dx, y + dy)) { near = true; break; }
      if (near) g.set(x + 1, y + 1, outline);
    }
  }
  out = g.toCanvas();
  textCache.set(key, out);
  return out;
}

function drawCentered(ctx, img, cx, y, scale = 1) {
  ctx.drawImage(img, Math.round(cx - (img.width * scale) / 2), Math.round(y), img.width * scale, img.height * scale);
}

const BTN = {
  pink: [P.pink, '#fbc6d0', P.blush],
  yellow: [P.yellow, '#fff0b0', P.yellowS],
  blue: [P.eyeBlue, '#b5e3fb', '#4fa3d6'],
  gray: [P.grayL, P.white, P.gray],
  dark: ['#5b4a6b', '#76638a', '#3f3150'],
};

export class UI {
  constructor() {
    this.buttons = [];
    this.icons = getIcons();
    this.banner = null;  // { text, t }
    this.toast = null;   // { type, t }
    this.pressed = null; // { id, t }
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 1.8) this.banner = null; }
    if (this.toast) { this.toast.t += dt; if (this.toast.t > 2.2) this.toast = null; }
    if (this.pressed) { this.pressed.t += dt; if (this.pressed.t > 0.12) this.pressed = null; }
  }

  begin() { this.buttons = []; }

  hit(x, y) {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (x >= b.x - 2 && x < b.x + b.w + 2 && y >= b.y - 2 && y < b.y + b.h + 2) {
        this.pressed = { id: b.id, t: 0 };
        return b.id;
      }
    }
    return null;
  }

  showBanner(text) { this.banner = { text, t: 0 }; }
  showToast(type) { this.toast = { type, t: 0 }; }

  button(ctx, id, x, y, w, h, label, style = 'pink') {
    const [base, light, shade] = BTN[style];
    const down = this.pressed?.id === id;
    const oy = down ? 1 : 0;
    ctx.fillStyle = P.line;
    ctx.fillRect(x + 1, y, w - 2, h + 1);
    ctx.fillRect(x, y + 1, w, h - 1);
    ctx.fillStyle = shade;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 1);
    ctx.fillStyle = base;
    ctx.fillRect(x + 1, y + 1 + oy, w - 2, h - 3);
    ctx.fillStyle = light;
    ctx.fillRect(x + 2, y + 1 + oy, w - 4, 1);
    if (typeof label === 'string') {
      const img = pxText(label, { size: h >= 20 ? 12 : 11, color: P.white, outline: P.line });
      drawCentered(ctx, img, x + w / 2, y + (h - 2 - img.height) / 2 + oy);
    } else if (label) {
      drawCentered(ctx, label, x + w / 2, y + (h - 2 - label.height) / 2 + oy);
    }
    this.buttons.push({ id, x, y, w, h });
  }

  dim(ctx, a = 0.45) {
    ctx.fillStyle = `rgba(27,22,64,${a})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  panel(ctx, x, y, w, h) {
    ctx.fillStyle = P.line;
    ctx.fillRect(x + 2, y, w - 4, h); ctx.fillRect(x, y + 2, w, h - 4); ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = P.creamL;
    ctx.fillRect(x + 2, y + 1, w - 4, h - 2); ctx.fillRect(x + 1, y + 2, w - 2, h - 4);
    ctx.fillStyle = P.cream;
    ctx.fillRect(x + 2, y + h - 4, w - 4, 2);
  }

  // ---- 플레이 HUD ----
  hud(ctx, game, { best, daily, muted, buttons = true }) {
    // 왼쪽 위: 지금 높이 / 하트 / 최고 기록, 오른쪽 위: 다음 고양이
    const m = ((game.over ? game.best : game.height) / 100).toFixed(2) + 'm';
    ctx.drawImage(numText(m, P.white, P.line, 2), 5, 5);
    for (let i = 0; i < 3; i++) ctx.drawImage(i < game.hearts ? this.icons.heart : this.icons.heartEmpty, 6 + i * 9, 20);
    if (daily) ctx.drawImage(numText('DAILY', P.yellow), 34, 21);
    ctx.drawImage(this.icons.trophy, 5, 30);
    ctx.drawImage(numText((Math.max(best, game.best) / 100).toFixed(2) + 'm', P.yellow), 14, 31);

    const nx = VIEW_W - 26;
    ctx.fillStyle = 'rgba(58,40,56,0.35)';
    ctx.fillRect(nx - 22, 5, 45, 42);
    ctx.fillRect(nx - 21, 4, 43, 44);
    ctx.drawImage(numText('NEXT', P.white), nx - 9, 7);
    const img = catSprite(game.nextType, 'calm');
    ctx.drawImage(img, Math.round(nx - img.width / 2 + 1), Math.round(30 - img.height / 2));

    if (buttons) {
      this.button(ctx, 'pause', 5, VIEW_H - 21, 16, 16, this.icons.pause, 'dark');
      this.button(ctx, 'mute', 24, VIEW_H - 21, 16, 16, muted ? this.icons.mute : this.icons.sound, 'dark');
    }

    if (game.wind.phase !== 'idle') {
      const show = game.wind.phase === 'blow' || Math.floor(this.time * 6) % 2 === 0;
      if (show) {
        const t = pxText(game.wind.dir > 0 ? '바람 →' : '← 바람', { size: 11, color: P.eyeBlue });
        drawCentered(ctx, t, VIEW_W / 2, 40);
      }
    }
  }

  overlays(ctx) {
    if (this.banner) {
      const t = this.banner.t;
      const slide = t < 0.2 ? (1 - t / 0.2) * -40 : (t > 1.5 ? ((t - 1.5) / 0.3) * -40 : 0);
      const img = pxText(this.banner.text, { size: 13, color: P.yellow });
      const s = img.width * 2 <= VIEW_W - 8 ? 2 : 1; // 긴 문구는 1배로
      const y = 110 + Math.round(slide);
      ctx.fillStyle = 'rgba(27,22,64,0.55)';
      ctx.fillRect(0, y - 4, VIEW_W, img.height * s + 8);
      drawCentered(ctx, img, VIEW_W / 2, y, s);
    }
    if (this.toast) {
      const t = this.toast.t;
      const off = t < 0.2 ? (1 - t / 0.2) * 30 : (t > 1.9 ? ((t - 1.9) / 0.3) * 30 : 0);
      const x = 20 + Math.round(off * 3), y = 58;
      this.panel(ctx, x, y, 140, 38);
      const head = pxText('새 친구 발견!', { size: 11, color: P.blush, outline: null });
      ctx.drawImage(head, x + 46, y + 4);
      const name = pxText(CAT_TYPES[this.toast.type].name, { size: 12, color: P.line, outline: null });
      ctx.drawImage(name, x + 46, y + 17);
      const img = catSprite(this.toast.type, 'calm');
      ctx.drawImage(img, Math.round(x + 22 - img.width / 2), Math.round(y + 19 - img.height / 2));
    }
  }

  // ---- 타이틀 ----
  title(ctx, store) {
    // 로고: "하늘까지" 위에 큰 "냥", 아래 영어 부제
    const bob = Math.round(Math.sin(this.time * 2) * 2);
    const bob2 = Math.round(Math.sin(this.time * 2 + 1.2) * 2);
    const top = pxText('하늘까지', { size: 14, color: P.eyeBlue, outline: P.line });
    const topS = pxText('하늘까지', { size: 14, color: P.line, outline: P.line });
    drawCentered(ctx, topS, VIEW_W / 2, 14 + bob + 2, 2);
    drawCentered(ctx, top, VIEW_W / 2, 14 + bob, 2);
    const nyang = pxText('냥!', { size: 18, color: P.yellow, outline: P.line });
    const nyangS = pxText('냥!', { size: 18, color: P.line, outline: P.line });
    drawCentered(ctx, nyangS, VIEW_W / 2, 40 + bob2 + 4, 4);
    drawCentered(ctx, nyang, VIEW_W / 2, 40 + bob2, 4);
    // 부제: '냥!' 그림자 아래끝(약 100, 흔들림 ±2)에서 10px 정도 띄운다
    drawCentered(ctx, pxText('FLY ME TO THE NYANG', { size: 11, color: P.pink, outline: P.line }), VIEW_W / 2, 112);

    // 최고 기록: 반투명 알약 위에 트로피 + 숫자
    const best = numText((store.best / 100).toFixed(2) + 'm', P.yellow);
    const bw = best.width + 18, bx = Math.round(VIEW_W / 2 - bw / 2);
    ctx.fillStyle = 'rgba(58,40,56,0.55)';
    ctx.fillRect(bx + 1, 134, bw - 2, 13); ctx.fillRect(bx, 135, bw, 11);
    ctx.drawImage(this.icons.trophy, bx + 4, 136);
    ctx.drawImage(best, bx + 13, 137);

    // 방석은 화면 위에서부터 같은 자리(카메라가 천장에서 멈춤)라 버튼도 고정. 늘어난 높이는 방석 아래 바닥으로 간다
    const by = 196;
    this.button(ctx, 'start', 40, by, 100, 24, '시작', 'pink');
    this.button(ctx, 'daily', 40, by + 30, 100, 20, '데일리', 'yellow');
    this.button(ctx, 'dex', 40, by + 56, 100, 20, '도감', 'blue');
    // 맨 아래 띠: 조작 안내 (방석·데모 고양이와 안 겹치게 어두운 띠 위에)
    ctx.fillStyle = 'rgba(27,22,64,0.6)';
    ctx.fillRect(0, VIEW_H - 18, VIEW_W, 18);
    drawCentered(ctx, pxText('탭 · 스페이스로 고양이 놓기', { size: 10, color: P.white, outline: null }), VIEW_W / 2, VIEW_H - 16);
    const v = numText('V' + VERSION, P.grayL, P.line);
    ctx.drawImage(v, 3, 3);
  }

  pause(ctx) {
    this.dim(ctx, 0.55);
    const oy = Math.round(extraH() / 2);
    drawCentered(ctx, pxText('일시정지', { size: 14, color: P.white }), VIEW_W / 2, 110 + oy, 2);
    this.button(ctx, 'resume', 40, 170 + oy, 100, 24, '계속하기', 'pink');
    this.button(ctx, 'home', 40, 202 + oy, 100, 20, '처음으로', 'gray');
  }

  over(ctx, game, info, t) {
    const k = Math.min(1, t / 0.35);
    const ease = 1 - (1 - k) ** 3;
    const y0 = Math.round(VIEW_H - ease * 156);
    this.panel(ctx, 14, y0, VIEW_W - 28, 146);
    drawCentered(ctx, pxText('게임 오버', { size: 12, color: P.blush, outline: null }), VIEW_W / 2, y0 + 6);
    drawCentered(ctx, numText((game.best / 100).toFixed(2) + 'm', P.yellow, P.line, 3), VIEW_W / 2, y0 + 23);

    const bestLine = pxText('최고 기록 ' + (info.best / 100).toFixed(2) + 'm', { size: 11, color: P.line, outline: null });
    drawCentered(ctx, bestLine, VIEW_W / 2 - (info.newBest ? 12 : 0), y0 + 46);
    if (info.newBest && Math.floor(this.time * 4) % 2 === 0) {
      ctx.drawImage(numText('NEW!', P.white, P.red), Math.round(VIEW_W / 2 + bestLine.width / 2 - 8), y0 + 50);
    }
    const stats = pxText(`고양이 ${game.count}마리 · 퍼펙트 ${game.perfects}`, { size: 10, color: P.darkL, outline: null });
    drawCentered(ctx, stats, VIEW_W / 2, y0 + 63);

    this.button(ctx, 'retry', 22, y0 + 82, VIEW_W - 44, 24, '다시하기', 'pink');
    this.button(ctx, 'photo', 22, y0 + 112, 66, 20, '사진 저장', 'yellow');
    this.button(ctx, 'home', 92, y0 + 112, 66, 20, '처음으로', 'gray');
  }

  dex(ctx, store) {
    ctx.fillStyle = P.navy;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = i % 5 ? P.darkL : P.yellow;
      ctx.fillRect(Math.floor((i * 97) % VIEW_W), Math.floor((i * 53) % VIEW_H), 1, 1);
    }
    drawCentered(ctx, pxText('도감', { size: 14, color: P.yellow }), VIEW_W / 2, 8);
    const found = store.cats.length;
    drawCentered(ctx, numText(`${found}/${CAT_TYPES.length}`, P.white), VIEW_W / 2, 30);

    const cw = 42, ch = 44, x0 = 6, y0 = 42;
    CAT_TYPES.forEach((t, i) => {
      const cx = x0 + (i % 4) * cw, cy = y0 + Math.floor(i / 4) * ch;
      const seen = store.cats.includes(i);
      ctx.fillStyle = seen ? '#2f2860' : '#231d4a';
      ctx.fillRect(cx + 1, cy + 1, cw - 2, ch - 2);
      const img = seen ? catSprite(i, (Math.floor(this.time * 0.7 + i) % 5 === 0) ? 'blink' : 'calm') : catSilhouette(i);
      const s = img.width > cw - 2 ? 1 : 1;
      ctx.drawImage(img, Math.round(cx + cw / 2 - img.width / 2), Math.round(cy + 18 - img.height / 2), img.width * s, img.height * s);
      const name = pxText(seen ? t.name : '???', { size: 10, color: seen ? P.white : P.darkL, outline: null });
      drawCentered(ctx, name, cx + cw / 2, cy + ch - 15);
    });

    const zy = 186 + Math.round(extraH() * 0.5);
    drawCentered(ctx, pxText('구간', { size: 11, color: P.yellow }), VIEW_W / 2, zy);
    ZONES.forEach((z, i) => {
      const seen = store.zones.includes(i);
      const x = 6 + i * 34, y = zy + 18;
      ctx.fillStyle = seen ? '#2f2860' : '#231d4a';
      ctx.fillRect(x, y, 32, 30);
      const img = pxText(seen ? z.name : '?', { size: 11, color: seen ? P.white : P.darkL, outline: null });
      drawCentered(ctx, img, x + 16, y + 3);
      drawCentered(ctx, numText(z.from / 100 + 'm', seen ? P.yellow : P.darkL, null), x + 16, y + 20);
    });

    this.button(ctx, 'close', 40, VIEW_H - 40, 100, 22, '닫기', 'pink');
  }
}
