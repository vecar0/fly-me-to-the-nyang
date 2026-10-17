"""Galmuri 픽셀 폰트를 게임용으로 줄인다 (원본 400~500KB → 수십 KB).
남기는 글자: 완성형 한글 2350자(KS X 1001) + 영문·숫자·기호 + js/ 안에 실제로 쓰인 모든 글자.

준비: pip install fonttools brotli / npm pack galmuri 로 받은 dist 폴더
사용: python tools/subset_fonts.py <galmuri dist 폴더>
"""
import pathlib
import sys

from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = pathlib.Path(sys.argv[1])
OUT = ROOT / 'fonts'
FONTS = ['Galmuri11-Bold', 'Galmuri9']

chars = set(chr(c) for c in range(0x20, 0x7f))
for hi in range(0xB0, 0xC9):
    for lo in range(0xA1, 0xFF):
        try:
            chars.add(bytes([hi, lo]).decode('euc-kr'))
        except UnicodeDecodeError:
            pass
for p in (ROOT / 'js').glob('*.js'):
    chars.update(ch for ch in p.read_text(encoding='utf-8') if ord(ch) > 0x7f)
chars.update('·→←↑↓…!?♥★')

OUT.mkdir(exist_ok=True)
text = ''.join(sorted(chars))
for name in FONTS:
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.hinting = True  # 비트맵처럼 보이게 하는 힌팅 유지
    font = subset.load_font(str(SRC / f'{name}.ttf'), opts)
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    out = OUT / f'{name}.woff2'
    subset.save_font(font, str(out), opts)
    print(name, len(text), 'chars', out.stat().st_size // 1024, 'KB')
