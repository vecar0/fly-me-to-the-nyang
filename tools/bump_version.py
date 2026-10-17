"""배포 버전 올리기. GitHub Pages는 파일을 10분간 캐시하므로,
모든 모듈 import와 index.html의 스크립트·CSS 주소에 ?v=버전 을 붙여 새 배포가 바로 보이게 한다.

사용: python tools/bump_version.py 1.2.0
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ver = sys.argv[1]

# 1) js/version.js
(ROOT / 'js' / 'version.js').write_text(f"export const VERSION = '{ver}';\n", encoding='utf-8')

# 2) js/*.js 안의 상대 import에 ?v= 붙이기 (기존 ?v= 는 교체)
imp = re.compile(r"""(from\s+['"])(\./[\w./-]+?\.js)(\?v=[\w.-]+)?(['"])""")
for p in (ROOT / 'js').glob('*.js'):
    s = p.read_text(encoding='utf-8')
    s2 = imp.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={ver}{m.group(4)}", s)
    if s2 != s:
        p.write_text(s2, encoding='utf-8')

# 2-b) tests/*.mjs 의 ../js/ import도 같은 버전으로 (모듈이 두 벌로 로드되지 않게)
imp2 = re.compile(r"""(from\s+['"]|import\(['"])(\.\./js/[\w./-]+?\.js)(\?v=[\w.-]+)?(['"])""")
for p in (ROOT / 'tests').glob('*.mjs'):
    s = p.read_text(encoding='utf-8')
    s2 = imp2.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={ver}{m.group(4)}", s)
    if s2 != s:
        p.write_text(s2, encoding='utf-8')

# 3) index.html 의 js/css 주소
p = ROOT / 'index.html'
s = p.read_text(encoding='utf-8')
s = re.sub(r'((?:src|href)="(?:js|css|vendor)/[\w./-]+?\.(?:js|css))(\?v=[\w.-]+)?"', lambda m: f'{m.group(1)}?v={ver}"', s)
p.write_text(s, encoding='utf-8')
print('version', ver)
