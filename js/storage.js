// localStorage 저장. 막힌 환경(시크릿 모드 등)에서도 게임은 그대로 돈다.
const KEY = 'nyangtop.v1'; // 옛 이름(냥탑) 그대로 둠: 바꾸면 기존 기록이 사라진다
const defaults = () => ({ best: 0, daily: { key: '', best: 0 }, cats: [], zones: [0], muted: false });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = { ...defaults(), ...JSON.parse(raw) };
    if (!Array.isArray(d.cats)) d.cats = [];
    if (!Array.isArray(d.zones)) d.zones = [0];
    return d;
  } catch {
    return defaults();
  }
}

export function save(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 저장 불가 환경 */ }
}
