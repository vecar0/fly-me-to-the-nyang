// 탭/클릭/키 입력 → 저해상도 버퍼 좌표로 변환해서 넘긴다.
import { VIEW_W, VIEW_H } from './config.js?v=1.6.0';

export function bindInput(canvas, { onTap, onKey, onFirst }) {
  let first = true;
  const wake = () => { if (first) { first = false; onFirst?.(); } else onFirst?.(); };

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    wake();
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * VIEW_W;
    const y = ((e.clientY - r.top) / r.height) * VIEW_H;
    onTap(x, y);
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if ([' ', 'enter', 'p', 'escape', 'r', 'm'].includes(k)) {
      e.preventDefault();
      wake();
      onKey(k);
    }
  });
}
