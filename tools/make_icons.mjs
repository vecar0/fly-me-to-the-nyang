// 앱 아이콘 만들기: 게임 스프라이트(박스냥 + 아기냥 + 방석)로 픽셀 아이콘을 그려 icons/ 에 PNG로 저장.
// 정수 배율로만 키우고, 남는 테두리는 가장자리 색을 늘려 채운다 (흐려지지 않게).
// 사용: node tools/make_icons.mjs   (playwright 필요. 다른 위치면 PLAYWRIGHT=/경로/playwright/index.mjs)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'icons');
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');

// [파일, 최종 크기, 원본 그림 크기, 배율]
const TARGETS = [
  ['favicon-32.png', 32, 32, 1],
  ['apple-touch-icon.png', 180, 44, 4],
  ['icon-192.png', 192, 44, 4],
  ['icon-512.png', 512, 44, 11],
  ['icon-maskable-512.png', 512, 44, 9], // 안드로이드가 둥글게 잘라도 고양이가 안 잘리게 여백 크게
];

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage();
await page.goto(base + '/tests/index.html').catch(() => {});
const shots = await page.evaluate(async ({ base, targets }) => {
  const { VERSION } = await import(base + '/js/version.js');
  const s = await import(`${base}/js/sprites.js?v=${VERSION}`);
  const { P } = s;

  // 스프라이트를 내용이 있는 부분만 잘라낸다
  function crop(src) {
    const c = src.getContext('2d'), d = c.getImageData(0, 0, src.width, src.height).data;
    let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
    for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (d[(y * src.width + x) * 4 + 3]) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
    o.getContext('2d').drawImage(src, -x0, -y0);
    return o;
  }

  function art(n) {
    const c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d');
    // 하늘: 위는 진하고 아래로 갈수록 연한 띠
    const bands = ['#79c6f0', '#8fd0f3', '#a6daf6', '#bfe6ff'];
    bands.forEach((col, i) => { x.fillStyle = col; x.fillRect(0, Math.round((i * n) / bands.length), n, n); });
    // 반짝이 별
    const star = (sx, sy) => { x.fillStyle = P.white; x.fillRect(sx, sy - 1, 1, 3); x.fillRect(sx - 1, sy, 3, 1); };
    // 방석
    const cw = n - 10, cx = 5, cy = n - 6;
    x.fillStyle = P.line; x.fillRect(cx, cy - 1, cw, 5); x.fillRect(cx - 1, cy, cw + 2, 3);
    x.fillStyle = P.blush; x.fillRect(cx, cy, cw, 3);
    x.fillStyle = P.pink; x.fillRect(cx, cy, cw, 2);
    x.fillStyle = '#fbc6d0'; x.fillRect(cx + 1, cy, cw - 2, 1);
    // 박스냥 + (큰 아이콘만) 머리 위 아기냥
    const boxCat = crop(s.catSprite(1, 'calm'));
    const bx = Math.round(n / 2 - boxCat.width / 2), by = cy - boxCat.height + 1;
    x.drawImage(boxCat, bx, by);
    if (n >= 44) {
      const kit = crop(s.catSprite(2, 'calm'));
      const ky = by - kit.height + 4;
      if (ky < 3) throw new Error('아기냥이 위에 닿음: ' + ky); // 여백 늘이기에 귀가 같이 늘어나지 않게
      x.drawImage(kit, Math.round(n / 2 - kit.width / 2) + 1, ky);
      star(7, 10); star(n - 8, 15);
    } else {
      star(5, 6); star(n - 6, 9);
    }
    return c;
  }

  const out = {};
  for (const [file, size, n, k] of targets) {
    const src = art(n).getContext('2d').getImageData(0, 0, n, n).data;
    const big = document.createElement('canvas'); big.width = big.height = size;
    const g = big.getContext('2d'), img = g.createImageData(size, size);
    const off = Math.floor((size - n * k) / 2);
    // 정수 배율 최근접 샘플링. 그림 밖(여백)은 가장 가까운 가장자리 칸 색
    const at = v => Math.min(n - 1, Math.max(0, Math.floor((v - off) / k)));
    for (let Y = 0; Y < size; Y++) for (let X = 0; X < size; X++) {
      const i = (at(Y) * n + at(X)) * 4, o = (Y * size + X) * 4;
      img.data[o] = src[i]; img.data[o + 1] = src[i + 1]; img.data[o + 2] = src[i + 2]; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    out[file] = big.toDataURL('image/png');
  }
  return out;
}, { base, targets: TARGETS });

fs.mkdirSync(OUT, { recursive: true });
for (const [file, url] of Object.entries(shots)) {
  fs.writeFileSync(path.join(OUT, file), Buffer.from(url.split(',')[1], 'base64'));
  console.log('icons/' + file);
}
await browser.close();
server.close();
