// 모든 숫자는 여기서 조정한다. 단위: 내부 픽셀(1px = 1cm), 초.

export const VIEW_W = 180;
export const VIEW_H = 320;
export const S = 3; // 물리 단위 / 픽셀 (Matter.js는 작은 물체에서 불안정해서 3배로 키워 계산)

// shape: rect(w,h,r=모서리) | circle(w=지름) | poly(verts, 바운딩박스 기준 좌표)
export const CAT_TYPES = [
  { key: 'loaf',    name: '식빵냥',   shape: 'rect',   w: 28, h: 16, r: 4, mass: 1.0, friction: 0.9, unlock: 0,    weight: 20 },
  { key: 'box',     name: '박스냥',   shape: 'rect',   w: 20, h: 20, r: 1, mass: 1.0, friction: 1.0, unlock: 0,    weight: 16 },
  { key: 'kitten',  name: '아기냥',   shape: 'rect',   w: 12, h: 10, r: 3, mass: 0.4, friction: 0.8, unlock: 0,    weight: 12 },
  { key: 'sit',     name: '앉은냥',   shape: 'poly',   w: 16, h: 24, verts: [[0, 24], [16, 24], [12, 0], [4, 0]], mass: 1.0, friction: 0.8, unlock: 0, weight: 14 },
  { key: 'ball',    name: '동글냥',   shape: 'circle', w: 18, h: 18, mass: 0.9, friction: 0.5, unlock: 150,  weight: 9 },
  { key: 'stretch', name: '기지개냥', shape: 'rect',   w: 40, h: 10, r: 3, mass: 1.2, friction: 0.9, unlock: 150,  weight: 12 },
  { key: 'chonk',   name: '뚱냥',     shape: 'rect',   w: 32, h: 22, r: 6, mass: 2.0, friction: 0.9, unlock: 300,  weight: 8 },
  { key: 'flat',    name: '엎드린냥', shape: 'rect',   w: 36, h: 8,  r: 3, mass: 0.9, friction: 1.0, unlock: 300,  weight: 10 },
  { key: 'ears',    name: '귀쫑긋냥', shape: 'poly',   w: 18, h: 22, verts: [[0, 22], [18, 22], [18, 9], [9, 0], [0, 9]], mass: 0.8, friction: 0.7, unlock: 700, weight: 8 },
  { key: 'space',   name: '우주냥',   shape: 'circle', w: 22, h: 22, mass: 0.7, friction: 0.6, unlock: 1200, weight: 8, bounce: 0.3 },
];

export const ZONES = [
  { key: 'room',  name: '방',   from: 0 },
  { key: 'roof',  name: '지붕', from: 300 },
  { key: 'cloud', name: '구름', from: 700 },
  { key: 'space', name: '우주', from: 1200 },
  { key: 'moon',  name: '달',   from: 2000 },
];

export const CFG = {
  gravity: 1.3,
  cushionX: 90, cushionW: 64, cushionH: 10,
  fallY: 40,             // 방석 윗면에서 이만큼 아래로 내려가면 낙하
  hearts: 3,

  settleSpeed: 0.3,      // 물리 단위/스텝 (쌓인 탑의 미세 떨림은 무시)
  settleAngular: 0.015,
  settleTime: 1.0,
  perfectTol: 2,

  craneBase: 40, craneStep: 4, craneEvery: 5, craneMax: 110,
  craneMargin: 12, craneAbove: 110,
  respawnDelay: 0.7,
  wobbleFrom: 1500, wobbleAmp: 0.15,

  windFrom: 700, windTo: 1200,
  windEvery: 8, windWarn: 1, windDur: 2,
  windG: 0.035,          // 중력 대비 옆바람 세기 (기획서 0.00025는 탑을 바로 쓰러뜨려서 조정)

  spaceFrom: 1200, spaceFallScale: 0.8,

  freezeDepth: 160,      // 탑 꼭대기에서 이만큼 아래 있는 안착 고양이는 정적 바디로 동결 (위쪽 7~8마리만 흔들림)
  maxDynamic: 40,
  maxParticles: 150,
};
