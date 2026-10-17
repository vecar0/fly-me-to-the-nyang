# 냥탑 (Cat Tower)

위에서 좌우로 움직이는 고양이를 탭해서 떨어뜨리고, 최대한 높이 쌓는 픽셀 물리 게임.

- 고양이 10종, 높이 구간 5개 (방 → 지붕 → 구름 → 우주 → 달)
- 하트 3개, 퍼펙트 착지, 데일리 모드, 도감, 탑 사진 저장
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
| `vendor/matter.min.js` | Matter.js 0.20.0 (MIT) |
| `design/plan.md` | 기획서 |
