// HUD, 타이틀, 일시정지, 게임오버, 도감. 전부 저해상도 버퍼에 픽셀로 그린다.
import { VIEW_W, VIEW_H, CAT_TYPES, ZONES } from './config.js';
import { P, Grid, makeCanvas, catSprite, catSilhouette, numText, getIcons } from './sprites.js';

const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

// 시스템 글꼴을 작게 그린 뒤 알파를 이진화 → 픽셀 글씨 + 1px 외곽선
const textCache = new Map();
export function pxText(str, { size = 11, color = P.white, outline = P.line, thresh = 100 } = {}) {
  const key = [str, size, color, outline, thresh].join('|');
  let out = textCache.get(key);
  if (out) return out;
  const tmp = makeCanvas(8, 8);
  let tc = tmp.getContext('2d', { willReadFrequently: true }); // 글자마다 픽셀을 읽는다
  tc.font = `bold ${size}px ${FONT}`;
  const w = Math.ceil(tc.measureText(str).width) + 4;
  const h = size + 6;
  tmp.width = w; tmp.height = h;
  tc = tmp.getContext('2d', { willReadFrequently: true });
  tc.font = `bold ${size}px ${FONT}`;
  tc.textBaseline = 'middle';
  tc.fillStyle = '#000';
  tc.fillText(str, 2, h / 2 + 1);
  const a = tc.getImageData(0, 0, w, h).data;
  const g = new Grid(w + 2, h + 2);
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] >= thresh;
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    if (on(x, y)) g.set(x + 1, y + 1, color);
    else if (outline) {
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (on(x + dx, y + dy)) { near = true; break; }
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
    const m = ((game.over ? game.best : game.height) / 100).toFixed(2) + 'm';
    ctx.drawImage(numText(m, P.white, P.line, 2), 5, 5);
    for (let i = 0; i < 3; i++) ctx.drawImage(i < game.hearts ? this.icons.heart : this.icons.heartEmpty, 6 + i * 9, 20);
    if (daily) ctx.drawImage(numText('DAILY', P.yellow), 34, 21);

    const bestImg = numText((Math.max(best, game.best) / 100).toFixed(2) + 'm', P.yellow);
    ctx.drawImage(bestImg, VIEW_W - bestImg.width - 4, 6);
    ctx.drawImage(this.icons.trophy, VIEW_W - bestImg.width - 13, 5);

    const nx = VIEW_W - 26;
    ctx.fillStyle = 'rgba(58,40,56,0.35)';
    ctx.fillRect(nx - 22, 16, 45, 42);
    ctx.fillRect(nx - 21, 15, 43, 44);
    ctx.drawImage(numText('NEXT', P.white), nx - 9, 18);
    const img = catSprite(game.nextType, 'calm');
    ctx.drawImage(img, Math.round(nx - img.width / 2 + 1), Math.round(41 - img.height / 2));

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
      const w = img.width * 2 + 16;
      const y = 110 + Math.round(slide);
      ctx.fillStyle = 'rgba(27,22,64,0.55)';
      ctx.fillRect(0, y - 4, VIEW_W, img.height * 2 + 8);
      drawCentered(ctx, img, VIEW_W / 2, y, 2);
      void w;
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
    const bob = Math.round(Math.sin(this.time * 2) * 2);
    const logo = pxText('냥탑', { size: 18, color: P.yellow, outline: P.line });
    const shadow = pxText('냥탑', { size: 18, color: P.line, outline: P.line });
    drawCentered(ctx, shadow, VIEW_W / 2 + 0, 34 + bob + 3, 3);
    drawCentered(ctx, logo, VIEW_W / 2, 34 + bob, 3);
    drawCentered(ctx, pxText('고양이를 높이높이 쌓아라!', { size: 11, color: P.white }), VIEW_W / 2, 108);

    const best = numText((store.best / 100).toFixed(2) + 'm', P.yellow);
    const bw = best.width + 10;
    ctx.drawImage(this.icons.trophy, Math.round(VIEW_W / 2 - bw / 2), 128);
    ctx.drawImage(best, Math.round(VIEW_W / 2 - bw / 2 + 10), 129);

    this.button(ctx, 'start', 40, 196, 100, 24, '시작', 'pink');
    this.button(ctx, 'daily', 40, 226, 100, 20, '데일리', 'yellow');
    this.button(ctx, 'dex', 40, 252, 100, 20, '도감', 'blue');
    drawCentered(ctx, pxText('탭 · 스페이스로 고양이 놓기', { size: 10, color: P.white }), VIEW_W / 2, 292);
  }

  pause(ctx) {
    this.dim(ctx, 0.55);
    drawCentered(ctx, pxText('일시정지', { size: 14, color: P.white }), VIEW_W / 2, 110, 2);
    this.button(ctx, 'resume', 40, 170, 100, 24, '계속하기', 'pink');
    this.button(ctx, 'home', 40, 202, 100, 20, '처음으로', 'gray');
  }

  over(ctx, game, info, t) {
    const k = Math.min(1, t / 0.35);
    const ease = 1 - (1 - k) ** 3;
    const y0 = Math.round(VIEW_H - ease * 170);
    this.panel(ctx, 14, y0, VIEW_W - 28, 160);
    drawCentered(ctx, pxText('게임 오버', { size: 12, color: P.blush, outline: null }), VIEW_W / 2, y0 + 6);
    drawCentered(ctx, numText((game.best / 100).toFixed(2) + 'm', P.yellow, P.line, 3), VIEW_W / 2, y0 + 24);

    const bestLine = pxText('최고 기록 ' + (info.best / 100).toFixed(2) + 'm', { size: 11, color: P.line, outline: null });
    drawCentered(ctx, bestLine, VIEW_W / 2 - (info.newBest ? 12 : 0), y0 + 50);
    if (info.newBest && Math.floor(this.time * 4) % 2 === 0) {
      ctx.drawImage(numText('NEW!', P.white, P.red), Math.round(VIEW_W / 2 + bestLine.width / 2 - 8), y0 + 53);
    }
    const stats = pxText(`고양이 ${game.count}마리 · 퍼펙트 ${game.perfects}`, { size: 10, color: P.darkL, outline: null });
    drawCentered(ctx, stats, VIEW_W / 2, y0 + 66);

    this.button(ctx, 'retry', 26, y0 + 88, VIEW_W - 52, 24, '다시하기', 'pink');
    this.button(ctx, 'photo', 26, y0 + 118, 62, 20, '사진 저장', 'yellow');
    this.button(ctx, 'home', 92, y0 + 118, 62, 20, '처음으로', 'gray');
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

    const zy = 186;
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

    this.button(ctx, 'close', 40, 280, 100, 22, '닫기', 'pink');
  }
}
