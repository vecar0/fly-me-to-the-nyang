// 고양이 뽑기, 크레인 속도, 바람. DOM 없음.
import { CAT_TYPES, CFG } from './config.js?v=1.4.0';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function dailySeed(date = new Date()) {
  const k = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  return { key: k, seed: hashStr('nyangtop:' + k) };
}

export function unlockedTypes(bestHeight) {
  const out = [];
  CAT_TYPES.forEach((t, i) => { if (bestHeight >= t.unlock) out.push(i); });
  return out;
}

// history: 최근에 나온 타입 목록. 같은 종 3연속 금지.
export function pickType(rng, bestHeight, history) {
  let pool = unlockedTypes(bestHeight);
  const n = history.length;
  if (n >= 2 && history[n - 1] === history[n - 2]) pool = pool.filter(i => i !== history[n - 1]);
  let total = 0;
  for (const i of pool) total += CAT_TYPES[i].weight;
  let r = rng() * total;
  for (const i of pool) {
    r -= CAT_TYPES[i].weight;
    if (r < 0) return i;
  }
  return pool[pool.length - 1];
}

export function craneSpeed(count, height, time) {
  let v = Math.min(CFG.craneMax, CFG.craneBase + CFG.craneStep * Math.floor(count / CFG.craneEvery));
  if (height >= CFG.wobbleFrom) v *= 1 + CFG.wobbleAmp * Math.sin(time * 1.3);
  return v;
}

export function createWind() {
  return { timer: CFG.windEvery, phase: 'idle', t: 0, dir: 1 };
}

// 바람 상태 진행. 구름 구간 밖이면 즉시 꺼진다.
export function updateWind(w, dt, height, rng) {
  if (height < CFG.windFrom || height >= CFG.windTo) {
    w.phase = 'idle'; w.timer = CFG.windEvery; w.t = 0;
    return w;
  }
  if (w.phase === 'idle') {
    w.timer -= dt;
    if (w.timer <= 0) { w.phase = 'warn'; w.t = 0; w.dir = rng() < 0.5 ? -1 : 1; }
  } else if (w.phase === 'warn') {
    w.t += dt;
    if (w.t >= CFG.windWarn) { w.phase = 'blow'; w.t = 0; }
  } else if (w.phase === 'blow') {
    w.t += dt;
    if (w.t >= CFG.windDur) { w.phase = 'idle'; w.timer = CFG.windEvery; w.t = 0; }
  }
  return w;
}
