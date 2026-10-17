// 실제 게임 페이지(index.html)에서 도는 브라우저 테스트.
// 진짜 pointerdown/keydown 이벤트를 캔버스·window에 보내고, 화면 버퍼 픽셀까지 확인한다.
// 사용: 게임 페이지에서 `const { run } = await import('/tests/e2e.mjs'); await run()`
import { VIEW_W, VIEW_H, CAT_TYPES, CFG } from '../js/config.js?v=1.5.1';
import { Audio } from '../js/audio.js?v=1.5.1';
import * as storage from '../js/storage.js?v=1.5.1';

const N = () => window.__nyang;
const canvas = () => document.getElementById('game');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function tap(x, y) {
  const r = canvas().getBoundingClientRect();
  canvas().dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'touch',
    clientX: r.left + (x / VIEW_W) * r.width, clientY: r.top + (y / VIEW_H) * r.height,
  }));
  N().advance(0.05);
}
function key(k) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  N().advance(0.05);
}
function waitCrane() { let t = 0; while (!N().game.canDrop() && t++ < 300) N().advance(1 / 60); }
function hasButton(id) { return N().ui.buttons.some(b => b.id === id); }
function pixel(x, y) {
  const d = N().renderer.ctx.getImageData(x, y, 1, 1).data;
  return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
}
function colorsIn(x0, y0, w, h) {
  const d = N().renderer.ctx.getImageData(x0, y0, w, h).data;
  const s = new Set();
  for (let i = 0; i < d.length; i += 4) s.add('#' + [d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''));
  return s;
}
function home() { N().onAction('home'); N().advance(0.1); }

export async function run() {
  const results = [];
  const test = async (name, fn) => {
    try { results.push({ name, ok: true, detail: (await fn()) ?? '' }); }
    catch (e) { results.push({ name, ok: false, detail: e.message }); }
  };
  const assert = (c, m) => { if (!c) throw new Error(m); };

  await test('[1] 타이틀 → [시작] → 3초 안에 첫 고양이가 크레인에서 좌우로 움직인다', () => {
    home();
    assert(N().mode === 'title' && hasButton('start') && hasButton('daily') && hasButton('dex'), '타이틀 버튼 없음');
    { const b = N().ui.buttons.find(x => x.id === 'start'); tap(b.x + b.w / 2, b.y + b.h / 2); }
    assert(N().mode === 'play', '시작 안 됨: ' + N().mode);
    let t = 0;
    while (N().game.crane.type === null && t < 3) { N().advance(0.1); t += 0.1; }
    assert(N().game.crane.type !== null, '3초 안에 고양이 없음');
    const x0 = N().game.crane.x;
    N().advance(0.5);
    assert(Math.abs(N().game.crane.x - x0) > 5, '크레인이 안 움직임');
    return `${t.toFixed(1)}초에 등장, 0.5초에 ${Math.abs(N().game.crane.x - x0).toFixed(0)}px 이동`;
  });

  await test('[2] 화면 탭과 Space로 고양이가 떨어진다', () => {
    const n0 = N().game.cats.length;
    tap(90, 150);
    assert(N().game.cats.length === n0 + 1, '탭으로 안 떨어짐');
    N().advance(0.8);
    waitCrane();
    key(' ');
    assert(N().game.cats.length === n0 + 2, 'Space로 안 떨어짐');
  });

  await test('[3] 놓은 직후 다시 탭해도 아무 일도 없다 (실제 입력)', () => {
    N().advance(0.8); waitCrane();
    tap(90, 150);
    const n = N().game.cats.length;
    tap(90, 150); tap(90, 150);
    assert(N().game.cats.length === n, '연타로 추가됨');
  });

  await test('[16] ⏸·🔈 버튼을 눌러도 고양이가 떨어지지 않는다', () => {
    N().advance(0.8); waitCrane();
    // 놓은 횟수(count)로 판정: 앞서 놓은 고양이가 방석 밖으로 떨어져 cats가 줄어드는 건 상관없다
    const n = N().game.count;
    const m0 = N().store.muted; // 저장된 이전 상태에 상관없이 '바뀌는지'를 본다
    tap(32, VIEW_H - 13); // 소리
    assert(N().store.muted === !m0, '소리 버튼 반응 없음');
    tap(32, VIEW_H - 13);
    assert(N().store.muted === m0, '소리 버튼 두 번째 반응 없음');
    assert(N().game.count === n, '소리 버튼에서 고양이를 놓음');
    tap(13, VIEW_H - 13); // 일시정지
    assert(N().mode === 'pause', '일시정지 안 됨');
    assert(N().game.count === n, '일시정지 버튼에서 고양이를 놓음');
  });

  await test('[17] 일시정지 중에는 물리와 크레인이 멈춘다', () => {
    const g = N().game;
    const cx = g.crane.x, snap = g.cats.map(c => c.body.position.y);
    N().advance(1.5);
    const c0 = g.count;
    tap(90, 150); // 일시정지 중 화면 탭 → 무시
    assert(g.crane.x === cx, '크레인 이동');
    assert(g.cats.every((c, i) => c.body.position.y === snap[i]), '고양이 이동');
    assert(g.count === c0, '일시정지 중 놓아짐');
    key('p');
    assert(N().mode === 'play', 'P로 재개 안 됨');
  });

  await test('[21] 착지하면 찌부러짐 연출과 "냥" 소리, 높을수록 음정이 높다', () => {
    const calls = [];
    const orig = N().audio.meow;
    N().audio.meow = (h, imp) => { calls.push(h); };
    N().advance(0.8); waitCrane();
    tap(90, 150);
    const cat = N().game.cats[N().game.cats.length - 1];
    let t = 0; while (!cat.landed && t++ < 120) N().advance(1 / 60);
    N().audio.meow = orig;
    assert(calls.length >= 1, 'meow 호출 없음');
    const fx = N().renderer.fx.get(cat.id);
    assert(fx && Math.abs(fx.landT - N().renderer.time) < 0.1, '찌부러짐 시작 시각 없음');
    const hz = [0, 100, 300, 700, 1200, 2000, 3000].map(h => Audio.meowHz(h));
    assert(hz.every((v, i) => i === 0 || v > hz[i - 1]), '음정이 안 올라감: ' + hz.map(v => v.toFixed(0)));
    assert(Audio.meowHz(99999) <= 1400, '너무 높은 음 ' + Audio.meowHz(99999).toFixed(0));
    return 'Hz ' + hz.map(v => v.toFixed(0)).join(' → ');
  });

  await test('[22] 퍼펙트 착지 시 반짝임과 전용 효과음', () => {
    N().startGame(false); N().advance(0.1);
    let perf = 0;
    const orig = N().audio.perfect;
    N().audio.perfect = () => perf++;
    N().game.crane.type = CAT_TYPES.findIndex(t => t.key === 'box');
    N().game.drop(CFG.cushionX);
    let t = 0, stars = 0;
    while (t++ < 150) { N().advance(1 / 60); stars = Math.max(stars, N().renderer.particles.filter(p => p.kind === 'star').length); }
    N().audio.perfect = orig;
    assert(N().game.perfects === 1, '퍼펙트 판정 ' + N().game.perfects);
    assert(perf === 1, '효과음 호출 ' + perf);
    assert(stars > 0, '반짝임 없음');
    return `반짝임 파티클 ${stars}개`;
  });

  await test('[23] 🔈로 끄면 어떤 소리도 만들어지지 않는다', () => {
    const a = N().audio;
    a.unlock();
    assert(a.ctx, 'AudioContext 없음');
    let made = 0;
    const orig = a.ctx.createOscillator.bind(a.ctx);
    a.ctx.createOscillator = () => { made++; return orig(); };
    N().onAction('mute'); // 버튼 클릭음은 음소거 전에 난다
    made = 0;
    a.perfect(); a.meow(100, 1); a.fall(); a.zone(); a.click(); a._schedule();
    const mutedCount = made;
    N().onAction('mute');
    a.perfect();
    a.ctx.createOscillator = orig;
    assert(mutedCount === 0, '음소거 중 오실레이터 ' + mutedCount);
    assert(made > 0, '소리를 켠 뒤에도 소리 없음');
  });

  await test('[12] 구간 도착 배너가 뜨고 배경이 구간마다 다르다', () => {
    N().startGame(false); N().advance(0.1);
    N().game.best = 305;
    N().advance(0.1);
    assert(N().ui.banner && N().ui.banner.text === '지붕 도착!', '배너: ' + JSON.stringify(N().ui.banner));
    const r = N().renderer;
    const colors = [-150, -560, -1000, -1500, -2600].map(cam => { r.drawWorld(N().game, { camTop: cam, noCrane: true }); return pixel(100, 300); });
    assert(new Set(colors).size === 5, '같은 배경색: ' + colors.join(','));
    return colors.join(' ');
  });

  await test('[13] 바람이 불 때 화면에 바람 표시가 나온다', () => {
    const r = N().renderer;
    r.streaks.length = 0;
    const fake = { ...N().game, wind: { phase: 'blow', dir: 1 }, cats: [], crane: N().game.crane };
    for (let i = 0; i < 60; i++) r.update(1 / 60, fake, 'play');
    assert(r.streaks.length > 0, '바람 줄무늬 없음');
    N().ui.begin();
    N().ui.hud(r.ctx, fake, { best: 0, daily: false, muted: false });
    return `줄무늬 ${r.streaks.length}개`;
  });

  await test('[15] 카메라가 크레인을 부드럽게 따라간다', () => {
    const r = N().renderer;
    const target = r.camTarget(N().game);
    r.camTop = target + 120;
    N().advance(0.05);
    const mid = Math.abs(r.camTop - r.camTarget(N().game));
    N().advance(1.5);
    const end = Math.abs(r.camTop - r.camTarget(N().game));
    assert(mid > 20 && mid < 120, '순간이동함 ' + mid.toFixed(1));
    assert(end < 2, '못 따라감 ' + end.toFixed(1));
  });

  await test('[18][8] 게임오버 화면 통계 표시 → R로 즉시 새 판, 최고 기록 저장', () => {
    N().startGame(false); N().advance(0.1);
    // 하나 안착시켜 기록을 만든 뒤 3번 떨어뜨린다
    N().game.crane.type = CAT_TYPES.findIndex(t => t.key === 'box');
    N().game.drop(CFG.cushionX);
    N().advance(2);
    const best = N().game.best;
    for (let i = 0; i < 3; i++) { waitCrane(); N().game.drop(12); N().advance(2.2); }
    assert(N().mode === 'over', '게임오버 아님: ' + N().mode);
    N().advance(1.5);
    for (const id of ['retry', 'photo', 'home']) assert(hasButton(id), id + ' 버튼 없음');
    const saved = JSON.parse(localStorage.getItem('nyangtop.v1'));
    assert(saved && saved.best >= best && best > 0, `저장된 최고 ${saved?.best}, 이번 ${best}`);
    key('r');
    assert(N().mode === 'play' && N().game.count === 0 && N().game.hearts === 3, '재시작 안 됨');
    return `기록 ${(best / 100).toFixed(2)}m 저장됨`;
  });

  await test('[18] 게임오버 [다시하기] 버튼 탭으로도 새 판', () => {
    for (let i = 0; i < 3; i++) { waitCrane(); N().game.drop(12); N().advance(2.2); }
    N().advance(1.5);
    const b = N().ui.buttons.find(x => x.id === 'retry');
    tap(b.x + b.w / 2, b.y + b.h / 2);
    assert(N().mode === 'play' && N().game.hearts === 3, '재시작 안 됨');
  });

  await test('[19] [사진 저장]을 누르면 탑 전체 PNG가 다운로드된다', async () => {
    for (let i = 0; i < 3; i++) { waitCrane(); N().game.drop(12); N().advance(2.2); }
    N().advance(1.5);
    let got = null;
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { got = { href: this.href, name: this.download }; };
    const b = N().ui.buttons.find(x => x.id === 'photo');
    tap(b.x + b.w / 2, b.y + b.h / 2);
    for (let i = 0; i < 30 && !got; i++) await sleep(50);
    HTMLAnchorElement.prototype.click = orig;
    assert(got, '다운로드 없음');
    const blob = await (await fetch(got.href)).blob();
    assert(blob.type === 'image/png' && blob.size > 1000, `${blob.type} ${blob.size}B`);
    assert(/\.png$/.test(got.name), got.name);
    const bmp = await createImageBitmap(blob);
    return `${got.name} ${bmp.width}x${bmp.height}`;
  });

  await test('[20] 도감: 만난 고양이는 컬러, 못 만난 고양이는 실루엣', () => {
    home();
    const saved = N().store.cats.slice();
    N().store.cats.length = 0; N().store.cats.push(0);
    N().onAction('dex'); N().advance(0.05);
    const cell0 = colorsIn(7, 43, 40, 26), cell1 = colorsIn(49, 43, 40, 26);
    N().store.cats.length = 0; N().store.cats.push(...saved);
    N().onAction('close');
    assert(cell0.has('#f4a259'), '식빵냥이 컬러가 아님');
    for (const fur of ['#a9adc4', '#d4a373', '#8085a0']) assert(!cell1.has(fur), '박스냥 실루엣에 색 ' + fur);
    assert(cell1.has('#34334a'), '실루엣 색 없음');
  });

  await test('[24] 화면 배율: PC는 정수 배율, 세로 칸 수는 화면 비율에 맞춤', () => {
    const c = canvas();
    const k = c.width / VIEW_W;
    const dpr = window.devicePixelRatio || 1;
    if (dpr < 2) assert(Number.isInteger(k) && c.height / VIEW_H === k, `캔버스 ${c.width}x${c.height}`);
    assert(VIEW_H >= 320 && VIEW_H <= 440 && N().renderer.buf.height === VIEW_H, `VIEW_H ${VIEW_H}, 버퍼 ${N().renderer.buf.height}`);
    assert(Math.abs(parseFloat(c.style.width) * dpr - c.width) < 0.5, 'CSS 크기 불일치');
    assert(getComputedStyle(c).imageRendering.includes('pixel') || getComputedStyle(c).imageRendering.includes('crisp'), 'image-rendering');
    assert(c.getContext('2d').imageSmoothingEnabled === false, '스무딩 켜짐');
    return `${k}배 (${c.width}x${c.height}, 세로 ${VIEW_H}칸, dpr ${dpr})`;
  });

  await test('[25] 가로 스크롤 없이 게임 화면 전체가 보인다', () => {
    const r = canvas().getBoundingClientRect();
    assert(document.documentElement.scrollWidth <= innerWidth, '가로 스크롤');
    assert(r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, `캔버스 ${r.left},${r.top},${r.right},${r.bottom} / ${innerWidth}x${innerHeight}`);
    return `${innerWidth}x${innerHeight}: 캔버스 ${Math.round(r.width)}x${Math.round(r.height)}`;
  });

  await test('[29] localStorage가 막혀도 게임이 정상 동작한다', () => {
    const p = Storage.prototype;
    const og = p.getItem, os = p.setItem;
    p.getItem = () => { throw new Error('blocked'); };
    p.setItem = () => { throw new Error('blocked'); };
    try {
      const d = storage.load();
      assert(d.best === 0 && Array.isArray(d.cats), '기본값 아님');
      storage.save(d);
      N().startGame(false); N().advance(0.1);
      for (let i = 0; i < 3; i++) { waitCrane(); N().game.drop(12); N().advance(2.2); }
      N().advance(1.5);
      assert(N().mode === 'over', '진행 안 됨');
    } finally { p.getItem = og; p.setItem = os; }
  });

  await test('[30] 기울어진 고양이: 모든 종·각도에서 픽셀이 빠지지 않고 눈이 남는다', async () => {
    const s = await import('../js/sprites.js?v=1.5.1');
    const stat = cv => {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let n = 0, holes = 0, eye = 0;
      const on = (x, y) => x >= 0 && y >= 0 && x < cv.width && y < cv.height && d[(y * cv.width + x) * 4 + 3] > 0;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4;
        if (on(x, y)) { n++; if (d[i] === 0x2a && d[i + 1] === 0x1f && d[i + 2] === 0x2e) eye++; } // P.eye
        else if (on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1)) holes++; // 사방이 막힌 빈칸 = 회전 구멍
      }
      return { n, holes, eye };
    };
    let worst = 1, worstEye = 9;
    for (let ti = 0; ti < CAT_TYPES.length; ti++) {
      const base = stat(s.catSprite(ti, 'calm'));
      for (let step = 1; step < 64; step++) for (const flip of [false, true]) {
        const r = stat(s.catSpriteRot(ti, 'calm', flip, step));
        const ratio = r.n / base.n, eyes = r.eye / base.eye;
        worst = Math.min(worst, ratio); worstEye = Math.min(worstEye, eyes);
        assert(ratio > 0.85 && ratio < 1.15, `${CAT_TYPES[ti].name} ${step}단계 픽셀 수 ${(ratio * 100).toFixed(0)}%`);
        assert(r.holes <= 1, `${CAT_TYPES[ti].name} ${step}단계 구멍 ${r.holes}개`);
        // 눈동자는 1칸짜리라 그냥 돌리면 어떤 각도에선 0%가 된다 (예전 캔버스 회전 0~200%)
        assert(eyes >= 0.6 && eyes <= 1, `${CAT_TYPES[ti].name} ${step}단계 눈 픽셀 ${(eyes * 100).toFixed(0)}%`);
      }
    }
    return `64각도 × 좌우 × 10종: 최소 픽셀 보존 ${(worst * 100).toFixed(0)}%, 눈 보존 ${(worstEye * 100).toFixed(0)}% 이상`;
  });

  await test('[31] 숫자·영문 도트 글자: 게임에 쓰는 글자가 모두 정의돼 있다', async () => {
    const s = await import('../js/sprites.js?v=1.5.1');
    const blank = s.numText(' ');
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.!?/+-:m') {
      const c = s.numText(ch).getContext('2d'), d = c.getImageData(0, 0, c.canvas.width, c.canvas.height).data;
      let ink = 0; for (let i = 3; i < d.length; i += 4) ink += d[i] > 0;
      assert(ink > 0 && (c.canvas.width !== blank.width || ink > 0), `'${ch}' 글자 없음`);
    }
  });

  home();
  return results;
}
