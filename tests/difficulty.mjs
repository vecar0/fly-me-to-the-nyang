// 난이도 측정: 사람처럼 꼭대기를 노리고 놓는 자동 플레이어로 여러 판을 돌려 기록 분포를 낸다.
// 사용: `const { measure } = await import('/tests/difficulty.mjs'); measure({ games: 20, aimNoise: 3 })`
import { Game, STEP } from '../js/sim.js?v=1.6.1';
import { CFG } from '../js/config.js?v=1.6.1';
import { mulberry32 } from '../js/spawner.js?v=1.6.1';

function gauss(rng) {
  const u = Math.max(1e-9, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// 꼭대기 안착 고양이의 x를 노리고, 크레인이 그 근처(조준 오차 포함)를 지날 때 놓는다
export function playOne(seed, { aimNoise = 3, maxCats = 400, maxSec = 900 } = {}) {
  const g = new Game({ seed });
  const rng = mulberry32(seed ^ 0x9e3779b9);
  let t = 0;
  while (!g.over && g.count < maxCats && t < maxSec) {
    let top = null;
    for (const c of g.cats) if (c.settled && (!top || c.body.bounds.min.y < top.body.bounds.min.y)) top = c;
    const target = (top ? top.body.position.x / 3 : CFG.cushionX) + gauss(rng) * aimNoise;
    let guard = 0;
    while (!g.over && !(g.canDrop() && Math.abs(g.crane.x - target) < 1.2) && guard++ < 60 * 20) { g.update(STEP); t += STEP; }
    if (g.over) break;
    g.drop();
    // 사람처럼 탑이 잠잠해질 때까지 (최대 3초) 기다린다
    const cat = g.cats[g.cats.length - 1];
    let w = 0;
    while (!g.over && w++ < 180 && !(cat.settled || !g.cats.includes(cat))) { g.update(STEP); t += STEP; }
  }
  return { best: g.best, cats: g.count, over: g.over };
}

export function measure({ games = 20, aimNoise = 3, seed0 = 1000 } = {}) {
  const res = [];
  for (let i = 0; i < games; i++) res.push(playOne(seed0 + i, { aimNoise }));
  const bests = res.map(r => r.best / 100).sort((a, b) => a - b);
  const q = p => bests[Math.min(bests.length - 1, Math.floor(p * bests.length))];
  const reached = h => res.filter(r => r.best >= h * 100).length / res.length;
  return {
    aimNoise,
    median: +q(0.5).toFixed(2), p25: +q(0.25).toFixed(2), p75: +q(0.75).toFixed(2), max: +bests[bests.length - 1].toFixed(2),
    medianCats: res.map(r => r.cats).sort((a, b) => a - b)[Math.floor(res.length / 2)],
    reach3m: reached(3), reach7m: reached(7), reach12m: reached(12),
  };
}
