// headless 시뮬레이션 테스트. DOM을 쓰지 않는 sim.js/spawner.js만 사용한다.
// 브라우저(tests/index.html)에서도, Matter를 globalThis에 올린 Node에서도 돈다.
import { Game, STEP } from '../js/sim.js?v=1.3.0';
import { CAT_TYPES, CFG } from '../js/config.js?v=1.3.0';
import { mulberry32, pickType, craneSpeed, createWind, updateWind, dailySeed } from '../js/spawner.js?v=1.3.0';
import { playOne } from './difficulty.mjs';

const results = [];
function test(name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail ?? '' });
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
  }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

// 크레인에 고양이가 있으면 x에 놓고, 다음 고양이가 올 때까지 진행
function runDrops(game, n, xFn, maxSec = 4) {
  for (let i = 0; i < n && !game.over; i++) {
    let guard = 0;
    while (!game.canDrop() && guard++ < 600) game.update(STEP);
    if (!game.canDrop()) break;
    game.drop(xFn(i, game));
    for (let s = 0; s < 60 * 0.75; s++) game.update(STEP);
  }
  for (let s = 0; s < 60 * maxSec && !game.over; s++) game.update(STEP);
}

test('놓으면 고양이가 생기고 0.7초 동안은 다시 놓을 수 없다', () => {
  const g = new Game({ seed: 1 });
  assert(g.drop(), '첫 드롭 실패');
  assert(g.cats.length === 1, '고양이 수 ' + g.cats.length);
  assert(!g.drop(), '바로 다시 놓아짐');
  for (let i = 0; i < 40; i++) g.update(STEP); // 0.67초
  assert(!g.canDrop(), '0.67초에 이미 놓을 수 있음');
  for (let i = 0; i < 5; i++) g.update(STEP);
  assert(g.canDrop(), '0.75초에도 못 놓음');
});

test('방석 위에 놓은 고양이는 안착하고 높이가 올라간다', () => {
  const g = new Game({ seed: 7 });
  runDrops(g, 1, () => CFG.cushionX, 2);
  const c = g.cats[0];
  assert(c && c.landed && c.settled, '안착 안 함');
  assert(g.height > 5, '높이 ' + g.height);
  return `높이 ${g.height.toFixed(1)}px`;
});

test('쌓은 고양이끼리 통과하지 않는다', () => {
  const g = new Game({ seed: 3 });
  runDrops(g, 5, () => CFG.cushionX, 2);
  const settled = g.cats.filter(c => c.settled);
  const sumH = settled.reduce((s, c) => s + CAT_TYPES[c.type].h, 0);
  assert(settled.length >= 3, '안착 수 ' + settled.length);
  // 겹쳐서 통과하면 높이가 거의 0에 머문다
  assert(g.height > Math.min(...settled.map(c => CAT_TYPES[c.type].h)) * 1.5, `높이 ${g.height.toFixed(1)} / 합 ${sumH}`);
  return `${settled.length}마리, 높이 ${g.height.toFixed(1)}px`;
});

test('방석 밖으로 떨어지면 하트가 줄고 3번이면 게임오버', () => {
  const g = new Game({ seed: 5 });
  runDrops(g, 1, () => 12, 3);
  assert(g.hearts === 2, '하트 ' + g.hearts);
  // 연쇄 붕괴 유예(collapseGrace)보다 간격을 띄워 따로따로 떨어뜨린다
  runDrops(g, 1, () => 168, 3);
  runDrops(g, 1, () => 168, 3);
  assert(g.hearts === 0 && g.over, `하트 ${g.hearts}, over ${g.over}`);
  assert(!g.drop(), '게임오버 후에도 놓아짐');
});

test(`크레인 속도: ${CFG.craneEvery}마리마다 +${CFG.craneStep}, 상한 ${CFG.craneMax}`, () => {
  const { craneBase: b, craneStep: st, craneEvery: ev, craneMax: mx } = CFG;
  assert(craneSpeed(0, 0, 0) === b, 'v0');
  assert(craneSpeed(ev - 1, 0, 0) === b, 'v(ev-1)');
  assert(craneSpeed(ev, 0, 0) === b + st, 'v(ev)');
  assert(craneSpeed(5000, 0, 0) === mx, 'cap');
  for (let t = 0; t < 20; t += 0.37) assert(craneSpeed(5000, 1600, t) <= mx * (1 + CFG.wobbleAmp) + 1e-9, 'wobble');
});

test('해금 전 고양이는 나오지 않고, 같은 종 3연속이 없다', () => {
  const rng = mulberry32(99);
  for (const h of [0, 150, 300, 700, 1200]) {
    const hist = [];
    for (let i = 0; i < 3000; i++) {
      const t = pickType(rng, h, hist);
      assert(CAT_TYPES[t].unlock <= h, `높이 ${h}에서 ${CAT_TYPES[t].name}`);
      hist.push(t);
      const n = hist.length;
      if (n >= 3) assert(!(hist[n - 1] === hist[n - 2] && hist[n - 2] === hist[n - 3]), '3연속');
    }
  }
});

test('동글냥 비율은 15% 이하', () => {
  const rng = mulberry32(1234);
  const hist = [];
  let ball = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) { const t = pickType(rng, 3000, hist); hist.push(t); if (hist.length > 4) hist.shift(); if (CAT_TYPES[t].key === 'ball') ball++; }
  assert(ball / N <= 0.15, (ball / N * 100).toFixed(1) + '%');
  return (ball / N * 100).toFixed(1) + '%';
});

test('바람은 7~12m에서만, 1초 예고 후 2초', () => {
  const rng = mulberry32(1);
  for (const h of [0, 500, 699, 1200, 1500]) {
    const w = createWind();
    for (let i = 0; i < 60 * 20; i++) { updateWind(w, STEP, h, rng); assert(w.phase === 'idle', `높이 ${h}에서 바람`); }
  }
  const w = createWind();
  const seq = [];
  for (let i = 0; i < 60 * 12; i++) { updateWind(w, STEP, 900, rng); if (seq[seq.length - 1]?.p !== w.phase) seq.push({ p: w.phase, t: i * STEP }); }
  const warn = seq.find(s => s.p === 'warn'), blow = seq.find(s => s.p === 'blow');
  assert(warn && blow, '바람이 안 붐');
  assert(Math.abs(blow.t - warn.t - 1) < 0.05, '예고 시간 ' + (blow.t - warn.t));
  const after = seq[seq.indexOf(blow) + 1];
  assert(after && Math.abs(after.t - blow.t - 2) < 0.05, '지속 시간');
});

test('같은 시드(데일리)는 같은 고양이 순서', () => {
  const { seed } = dailySeed(new Date(2026, 9, 17));
  const order = s => { const g = new Game({ seed: s }); const o = [g.crane.type]; for (let i = 0; i < 30; i++) { g.drop(); for (let k = 0; k < 45; k++) g.update(STEP); o.push(g.crane.type); } return o.join(','); };
  assert(order(seed) === order(seed), '순서 다름');
  assert(order(seed) !== order(seed + 1), '다른 시드인데 같음');
});

test('시드 고정 + 정중앙 300번: 예외 없이 끝나고 결과가 매번 같다', () => {
  const run = () => { const g = new Game({ seed: 4242 }); runDrops(g, 300, () => CFG.cushionX, 3); return { h: g.best.toFixed(3), n: g.count, over: g.over }; };
  const a = run(), b = run();
  assert(a.h === b.h && a.n === b.n, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  return `최고 ${(a.h / 100).toFixed(2)}m, ${a.n}마리, 게임오버 ${a.over}`;
});

test('최악 장면: 150마리에서 움직이는 바디 ≤ 40, 물리 스텝 ≤ 4ms', () => {
  const g = new Game({ seed: 77, hearts: 9999 });
  // 안정적인 박스냥·엎드린냥만 꼭대기 위치에 놓아서 150마리를 실제로 쌓는다
  const box = CAT_TYPES.findIndex(t => t.key === 'box');
  const flat = CAT_TYPES.findIndex(t => t.key === 'flat');
  let i = 0;
  while (g.count < 150) {
    let guard = 0;
    while (!g.canDrop() && guard++ < 600) g.update(STEP);
    g.crane.type = i++ % 4 === 3 ? flat : box;
    const top = g.cats.length ? g.cats.reduce((a, c) => (c.body.position.y < a.body.position.y ? c : a)).body.position.x / 3 : CFG.cushionX;
    g.drop(top);
    for (let s = 0; s < 75; s++) g.update(STEP);
  }
  for (let s = 0; s < 120; s++) g.update(STEP);
  assert(g.cats.length >= 120, '탑이 무너져서 최악 장면이 안 만들어짐: ' + g.cats.length);
  let maxDyn = 0, maxMs = 0, total = 0;
  const now = () => (globalThis.performance ? performance.now() : Date.now());
  for (let s = 0; s < 300; s++) {
    const t0 = now();
    g.update(STEP);
    const ms = now() - t0;
    total += ms;
    maxMs = Math.max(maxMs, ms);
    maxDyn = Math.max(maxDyn, g.dynamicCount());
  }
  assert(maxDyn <= CFG.maxDynamic, '움직이는 바디 ' + maxDyn);
  const avg = total / 300;
  assert(avg <= 4, '평균 스텝 ' + avg.toFixed(2) + 'ms');
  return `고양이 ${g.cats.length}마리, 움직이는 바디 최대 ${maxDyn}, 스텝 평균 ${avg.toFixed(2)}ms / 최대 ${maxMs.toFixed(2)}ms`;
});

test('[5] 고양이 10종의 충돌 모양이 표의 크기·형태와 같다', () => {
  const g = new Game({ seed: 1 });
  const out = [];
  CAT_TYPES.forEach((t, i) => {
    g.crane.type = i;
    g.crane.cooldown = 0;
    g.drop(90);
    const c = g.cats[g.cats.length - 1];
    const b = c.body.bounds;
    const w = (b.max.x - b.min.x) / 3, h = (b.max.y - b.min.y) / 3;
    assert(Math.abs(w - t.w) < 1 && Math.abs(h - t.h) < 1, `${t.name} ${w.toFixed(1)}x${h.toFixed(1)} ≠ ${t.w}x${t.h}`);
    const nv = c.body.vertices.length;
    if (t.shape === 'circle') assert(nv >= 20, `${t.name} 원이 아님 (꼭짓점 ${nv})`);
    if (t.shape === 'poly') assert(nv === t.verts.length, `${t.name} 꼭짓점 ${nv}`);
    out.push(`${t.name} ${w.toFixed(0)}x${h.toFixed(0)}`);
    globalThis.Matter.Composite.remove(g.engine.world, c.body);
    g.cats.pop();
    g.crane.type = 0;
  });
  return out.join(', ');
});

test('[5] 동글냥은 구르고 박스냥은 멈춘다', () => {
  const roll = key => {
    const g = new Game({ seed: 2 });
    g.crane.type = CAT_TYPES.findIndex(t => t.key === key);
    g.drop(90);
    for (let s = 0; s < 60; s++) g.update(STEP);
    const c = g.cats[0];
    const x0 = c.body.position.x;
    globalThis.Matter.Sleeping.set(c.body, false);
    globalThis.Matter.Body.setVelocity(c.body, { x: 1.5, y: 0 });
    const a0 = c.body.angle;
    for (let s = 0; s < 40; s++) g.update(STEP);
    return { dx: (c.body.position.x - x0) / 3, rot: Math.abs(c.body.angle - a0) };
  };
  const ball = roll('ball'), box = roll('box');
  assert(ball.dx > box.dx * 3, `이동 동글냥 ${ball.dx.toFixed(1)}px, 박스냥 ${box.dx.toFixed(1)}px`);
  assert(ball.rot > 0.4 && box.rot < 0.05, `회전 동글냥 ${ball.rot.toFixed(2)}, 박스냥 ${box.rot.toFixed(2)}rad`);
  return `같은 힘: 동글냥 ${ball.dx.toFixed(1)}px·${ball.rot.toFixed(2)}rad 굴러감, 박스냥 ${box.dx.toFixed(1)}px·${box.rot.toFixed(2)}rad`;
});

test('[12] 3m·7m·12m·20m를 넘으면 구간 이벤트가 한 번씩 나온다', () => {
  const g = new Game({ seed: 3 });
  const got = [];
  for (const h of [100, 299, 301, 650, 701, 1199, 1201, 1999, 2001, 2500]) {
    g.best = h;
    g.update(STEP);
    for (const e of g.drainEvents()) if (e.type === 'zone') got.push(`${h}→${e.zone}`);
  }
  assert(got.join(',') === '301→1,701→2,1201→3,2001→4', got.join(','));
  return got.join(', ');
});

test('[10] 해금은 최고 높이 기준: 높이가 오르면 실제 게임에서도 새 종이 나온다', () => {
  const g = new Game({ seed: 11 });
  const seen = new Set();
  g.best = 1300;
  for (let i = 0; i < 200; i++) { g._loadCrane(); seen.add(g.crane.type); }
  const all = CAT_TYPES.map((_, i) => i).every(i => seen.has(i));
  assert(all, '못 나온 종: ' + CAT_TYPES.filter((_, i) => !seen.has(i)).map(t => t.name).join(','));
});

test(`[15] 크레인은 탑 꼭대기보다 약 ${CFG.craneAbove}px 위에 있다`, () => {
  const g = new Game({ seed: 77, hearts: 99 });
  const box = CAT_TYPES.findIndex(t => t.key === 'box');
  for (let i = 0; i < 10; i++) {
    while (!g.canDrop()) g.update(STEP);
    g.crane.type = box;
    const top = g.cats.reduce((a, c) => (!a || c.body.position.y < a.body.position.y ? c : a), null);
    g.drop(top ? top.body.position.x / 3 : 90);
    for (let s = 0; s < 90; s++) g.update(STEP);
  }
  for (let s = 0; s < 120; s++) g.update(STEP);
  const gap = -g.crane.y - g.height;
  assert(Math.abs(gap - CFG.craneAbove) < 4, `간격 ${gap.toFixed(1)}px (높이 ${g.height.toFixed(0)})`);
  return `높이 ${g.height.toFixed(0)}px, 크레인 간격 ${gap.toFixed(1)}px`;
});

test('게임오버 후에는 기록이 더 오르지 않는다', () => {
  const g = new Game({ seed: 5 });
  g.best = 200; g.over = true; g.hearts = 0;
  g.height = 0;
  const b = g.best;
  g.cats.length = 0;
  g.update(STEP);
  assert(g.best === b, '기록 변함');
});

test('한 번에 무너져 여러 마리가 떨어져도 하트는 1개만 깎인다', () => {
  const g = new Game({ seed: 21 });
  const box = CAT_TYPES.findIndex(t => t.key === 'box');
  // 방석 밖 같은 자리에 연달아 3마리를 떨어뜨린다 (간격 < collapseGrace)
  for (let i = 0; i < 3; i++) { g.crane.type = box; g.crane.cooldown = 0; g.drop(14); for (let s = 0; s < 20; s++) g.update(STEP); }
  for (let s = 0; s < 120; s++) g.update(STEP);
  assert(g.cats.length === 0, '안 떨어짐 ' + g.cats.length);
  assert(g.hearts === CFG.hearts - 1, '하트 ' + g.hearts);
  // 유예 시간이 지난 뒤 낙하는 다시 하트를 깎는다
  for (let s = 0; s < 60 * CFG.collapseGrace; s++) g.update(STEP);
  while (!g.canDrop()) g.update(STEP);
  g.drop(14);
  for (let s = 0; s < 150; s++) g.update(STEP);
  assert(g.hearts === CFG.hearts - 2, '두 번째 낙하 후 하트 ' + g.hearts);
});

test('새 구간에 도착하면 하트가 1개 회복된다 (최대치 이하)', () => {
  const g = new Game({ seed: 22 });
  g.hearts = 1;
  g.best = 305; g.update(STEP);
  const ev = g.drainEvents().find(e => e.type === 'zone');
  assert(ev && ev.heal && g.hearts === 2, `하트 ${g.hearts}`);
  g.hearts = CFG.hearts;
  g.best = 705; g.update(STEP);
  assert(g.hearts === CFG.hearts, '최대치 초과 ' + g.hearts);
});

test('착지 순간 속도를 흡수해서 정중앙 낙하는 튕겨 나가지 않는다', () => {
  let lost = 0;
  for (const key of ['loaf', 'box', 'kitten', 'sit']) {
    const g = new Game({ seed: 23 });
    const ti = CAT_TYPES.findIndex(t => t.key === key);
    g.crane.type = ti; g.drop(90);
    for (let s = 0; s < 90; s++) g.update(STEP);
    for (const k2 of ['loaf', 'box', 'kitten', 'sit']) {
      while (!g.canDrop()) g.update(STEP);
      g.crane.type = CAT_TYPES.findIndex(t => t.key === k2);
      const top = g.cats.reduce((a, c) => (c.body.position.y < a.body.position.y ? c : a));
      g.drop(top.body.position.x / 3);
      for (let s = 0; s < 150; s++) g.update(STEP);
    }
    lost += CFG.hearts - g.hearts;
  }
  assert(lost === 0, '정중앙에 놓았는데 떨어진 횟수 ' + lost);
  return '4×4 조합 16번 모두 안착';
});

test('[난이도] 보통 실력(조준 오차 ±4px) 자동 플레이 중간 기록 ≥ 3m', () => {
  const bests = [];
  for (let i = 0; i < 6; i++) bests.push(playOne(3000 + i, { aimNoise: 4, maxCats: 120 }).best / 100);
  bests.sort((a, b) => a - b);
  const median = (bests[2] + bests[3]) / 2;
  assert(median >= 3, `중간 ${median.toFixed(2)}m (${bests.map(b => b.toFixed(1)).join(' ')})`);
  return `중간 ${median.toFixed(2)}m: ${bests.map(b => b.toFixed(1)).join(' ')}`;
});

export { results };
