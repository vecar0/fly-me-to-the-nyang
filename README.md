# 하늘까지 냥 · Fly Me to the Nyang

위에서 좌우로 움직이는 고양이를 탭해서 떨어뜨리고, 하늘(그리고 달)까지 쌓아 올리는 픽셀 물리 게임.
(옛 이름: 냥탑)

- 고양이 10종, 높이 구간 5개 (방 → 지붕 → 구름 → 우주 → 달)
- 하트 3개 (한 번 무너지면 하트 1개, 새 구간 도착 시 1개 회복), 퍼펙트 착지, 데일리 모드, 도감, 탑 사진 저장
- 외부 이미지·사운드 파일 없음 (픽셀아트와 효과음 모두 코드로 생성)

## 실행

ES 모듈을 쓰므로 로컬 서버로 연다.

```bash
python serve.py
```

- 게임: http://127.0.0.1:8765
- 테스트: http://127.0.0.1:8765/tests/index.html

조작: 탭 / 스페이스 = 놓기, P·Esc = 일시정지, M = 소리, R = 다시하기

## 구조

| 파일 | 역할 |
|---|---|
| `js/config.js` | 모든 수치 (고양이, 구간, 난이도) |
| `js/sim.js` | 물리 월드, 안착·낙하 판정, 점수 (DOM 없음) |
| `js/spawner.js` | 고양이 뽑기, 크레인 속도, 바람 |
| `js/sprites.js` | 팔레트와 픽셀 스프라이트 |
| `js/render.js` | 배경, 카메라, 파티클 |
| `js/ui.js` | HUD, 타이틀, 게임오버, 도감 |
| `js/audio.js` | WebAudio 효과음과 BGM |
| `js/textures.js` | 배경 타일 (벽지·나무·기와·밧줄), 자동 생성 |
| `tools/pixelize_textures.py` | `textures/src/` 원본 → 픽셀 타일 변환 (seam 검사 포함) |
| `vendor/matter.min.js` | Matter.js 0.20.0 (MIT) |
| `fonts/` | 한글 픽셀 폰트 Galmuri 2.40.3 (SIL OFL 1.1, `fonts/OFL-Galmuri.txt`), 게임용으로 줄인 버전 |
| `tools/subset_fonts.py` | Galmuri 원본 → `fonts/` 서브셋 (한글 2350자 + 게임에 쓰인 글자) |
| `tools/bump_version.py` | 배포 버전 올리기 (`?v=` 캐시 무효화) |
| `design/plan.md` | 기획서 |
