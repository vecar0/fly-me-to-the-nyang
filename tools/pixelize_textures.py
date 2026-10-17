"""생성한 고해상도 타일 텍스처 → 게임용 픽셀 타일 (js/textures.js).

1. Moisan 주기+매끈 분해로 가장자리 불연속 제거 (진짜 seamless)
2. 면적 평균 축소 (tile 크기)
3. 텍스처별로 허용한 게임 팔레트 색으로 스냅
4. seam ratio = 경계(마지막↔첫 줄) 차이 / 내부 인접 줄 차이. 1.3 이하면 통과
5. 2x2 미리보기 PNG + js/textures.js (팔레트 인덱스 문자열) 출력

사용: python tools/pixelize_textures.py <원본폴더> <미리보기폴더>
"""
import json
import os
import sys

import numpy as np
from PIL import Image

# 텍스처별 출력 크기와 허용 색 (게임 팔레트 P / SC 와 같은 값)
# motif: 규칙 무늬면 실제 반복 주기를 찾아 그 정수배로 잘라내고, 주기 하나를 motif px로 만든다
SPECS = {
    'wallpaper': {'motif': 12, 'colors': ['#f7dcc6', '#fbe8d8', '#e9c4ab', '#f7a8b8', '#f48fa6', '#86c97a', '#5a9a5f']},
    'wood':      {'size': (64, 64), 'colors': ['#c48a5c', '#ddaa78', '#9c6644', '#7a4e3c', '#a06a4c']},
    'roof':      {'motif': 10, 'colors': ['#d9645f', '#f08a78', '#a8474f', '#3a2838', '#e2566a']},
    'sisal':     {'size': (64, 64), 'colors': ['#f6e3c4', '#e2c59d', '#fff3de', '#c99a6b']},
}


def find_period(gray, axis, lo=40, hi=420):
    """자기상관으로 한 축의 반복 주기(px)를 찾는다."""
    g = gray - gray.mean()
    f = np.fft.fft(g, axis=axis)
    ac = np.real(np.fft.ifft(f * np.conj(f), axis=axis)).mean(axis=1 - axis)
    ac /= ac[0]
    seg = ac[lo:hi]
    # 전역 최대의 70%를 넘는 첫 번째 국소 최대 = 기본 주기
    thr = seg.max() * 0.7
    for i in range(1, len(seg) - 1):
        if seg[i] >= thr and seg[i] >= seg[i - 1] and seg[i] >= seg[i + 1]:
            return lo + i
    return lo + int(seg.argmax())


def crop_periods(a, motif):
    gray = a.mean(-1)
    px, py = find_period(gray, 1), find_period(gray, 0)
    kx, ky = max(1, (a.shape[1] - 40) // px), max(1, (a.shape[0] - 40) // py)
    x0, y0 = (a.shape[1] - kx * px) // 2, (a.shape[0] - ky * py) // 2
    my = max(1, round(motif * py / px))  # 무늬 가로세로 비율 유지
    return a[y0:y0 + ky * py, x0:x0 + kx * px], (kx * motif, ky * my), (px, py, kx, ky)


def periodic_component(img):
    """Moisan (2011) periodic + smooth decomposition. img: HxWxC float."""
    h, w = img.shape[:2]
    out = np.empty_like(img)
    cx = 2 * np.cos(2 * np.pi * np.arange(w) / w)
    cy = 2 * np.cos(2 * np.pi * np.arange(h) / h)
    denom = cx[None, :] + cy[:, None] - 4
    denom[0, 0] = 1
    for c in range(img.shape[2]):
        u = img[:, :, c]
        v = np.zeros_like(u)
        v[0, :] += u[-1, :] - u[0, :]
        v[-1, :] += u[0, :] - u[-1, :]
        v[:, 0] += u[:, -1] - u[:, 0]
        v[:, -1] += u[:, 0] - u[:, -1]
        s_hat = np.fft.fft2(v) / denom
        s_hat[0, 0] = 0
        out[:, :, c] = u - np.real(np.fft.ifft2(s_hat))
    return out


def hex_rgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)


def snap(img, colors):
    pal = np.stack([hex_rgb(c) for c in colors])
    # 밝기에 더 민감한 가중 거리
    wgt = np.array([0.3, 0.59, 0.11]) * 3
    d = (((img[:, :, None, :] - pal[None, None, :, :]) ** 2) * wgt).sum(-1)
    idx = d.argmin(-1)
    return idx, pal


def seam_ratio(arr):
    a = arr.astype(float)
    boundary = (np.abs(a[:, -1] - a[:, 0]).mean() + np.abs(a[-1, :] - a[0, :]).mean()) / 2
    interior = (np.abs(np.diff(a, axis=1)).mean() + np.abs(np.diff(a, axis=0)).mean()) / 2
    return boundary / max(interior, 1e-6)


def main(src, prev):
    os.makedirs(prev, exist_ok=True)
    out = {}
    report = []
    for name, spec in SPECS.items():
        im = Image.open(os.path.join(src, name + '.png')).convert('RGB')
        a = np.asarray(im, dtype=float)
        raw_ratio = seam_ratio(a.mean(-1))
        note = 'Moisan'
        size = spec.get('size')
        if 'motif' in spec:
            a, size, (px, py, kx, ky) = crop_periods(a, spec['motif'])
            note = f'주기 {px}x{py}px ×{kx}x{ky}'
        a = np.clip(periodic_component(a), 0, 255)
        small = np.asarray(Image.fromarray(a.astype(np.uint8)).resize(size, Image.BOX), dtype=float)
        idx, pal = snap(small, spec['colors'])
        rgb = pal[idx].astype(np.uint8)
        ratio = seam_ratio(rgb.mean(-1))
        h, w = idx.shape
        tile = Image.fromarray(rgb)
        tile.save(os.path.join(prev, name + '_tile.png'))
        big = Image.new('RGB', (w * 2, h * 2))
        for x in (0, w):
            for y in (0, h):
                big.paste(tile, (x, y))
        big.resize((w * 2 * 6, h * 2 * 6), Image.NEAREST).save(os.path.join(prev, name + '_tiled2x2.png'))
        used = sorted(set(idx.flatten().tolist()))
        chars = 'abcdefghij'
        out[name] = {
            'w': w, 'h': h,
            'colors': spec['colors'],
            'rows': [''.join(chars[v] for v in row) for row in idx.tolist()],
        }
        report.append(f'{name:10s} {w}x{h}  [{note}]  원본 seam {raw_ratio:.2f} → 픽셀 타일 seam {ratio:.2f}  색 {len(used)}개  {"통과" if ratio <= 1.3 else "실패"}')

    js = ['// tools/pixelize_textures.py가 생성. 직접 고치지 말 것.',
          '// Higgsfield로 만든 seamless 텍스처를 게임 팔레트로 픽셀화한 타일 (문자 = colors 인덱스).',
          'export const TEXTURES = ' + json.dumps(out, ensure_ascii=False, indent=1) + ';', '']
    with open(os.path.join(os.path.dirname(__file__), '..', 'js', 'textures.js'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(js))
    print('\n'.join(report))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
