// 게임 규칙 + 물리. DOM 없이 돌아간다 (Matter는 globalThis.Matter).
// 좌표: 월드 픽셀, y는 아래로 증가. 방석 윗면이 y=0, 높이 h = -y.
import { CAT_TYPES, ZONES, CFG, S } from './config.js?v=1.8.0';
import { mulberry32, pickType, craneSpeed, createWind, updateWind } from './spawner.js?v=1.8.0';

const STEP = 1 / 60;
const SUBSTEPS = 6; // 2로는 쌓인 탑이 10여 마리에서 저절로 무너져서 6으로 올림 (비용은 스텝당 0.1ms 미만)

export function zoneIndexAt(h) {
  let z = 0;
  for (let i = 0; i < ZONES.length; i++) if (h >= ZONES[i].from) z = i;
  return z;
}

export class Game {
  constructor({ seed = (Math.random() * 2 ** 32) >>> 0, hearts = CFG.hearts } = {}) {
    const { Engine, Bodies, Composite, Events } = globalThis.Matter;
    this.rng = mulberry32(seed);
    this.engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    this.engine.gravity.y = CFG.gravity;
    this.cushion = Bodies.rectangle(CFG.cushionX * S, (CFG.cushionH / 2) * S, CFG.cushionW * S, CFG.cushionH * S, {
      isStatic: true, friction: 1, frictionStatic: 1.2, chamfer: { radius: 2 * S }, label: 'cushion',
    });
    Composite.add(this.engine.world, this.cushion);
    this.statics = [this.cushion]; // 고정된 바디: 방석 + 동결 고양이 (동결 판정 받침 후보)

    this.cats = [];
    this.byBody = new Map();
    this.events = [];
    this.time = 0;
    this.hearts = hearts;
    this.maxHearts = hearts;
    this.height = 0;
    this.landedTop = 0;
    this.aimX = CFG.cushionX; // 다음 고양이를 놓기 좋은 x = 꼭대기 안착 고양이의 중심 (없으면 방석 가운데)
    this.best = 0;
    this.count = 0;
    this.perfects = 0;
    this.lastHeartLoss = -99;
    this.over = false;
    this.zone = 0;
    this.nextId = 1;
    this.history = [];
    this.wind = createWind();
    this.crane = { x: CFG.cushionX, dir: 1, y: -CFG.craneAbove, type: null, flip: false, cooldown: 0, speed: CFG.craneBase };
    this.nextType = this._pick();
    this.nextFlip = this.rng() < 0.5;
    this._loadCrane();

    Events.on(this.engine, 'collisionStart', e => this._onCollide(e));
  }

  _pick() {
    const t = pickType(this.rng, this.best, this.history);
    this.history.push(t);
    if (this.history.length > 4) this.history.shift();
    return t;
  }

  _loadCrane() {
    this.crane.type = this.nextType;
    this.crane.flip = this.nextFlip;
    this.nextType = this._pick();
    this.nextFlip = this.rng() < 0.5;
    this.events.push({ type: 'spawn', catType: this.crane.type });
  }

  // 크레인에 매달린 고양이의 중심 y
  heldY() {
    const t = CAT_TYPES[this.crane.type ?? 0];
    return this.crane.y + t.h / 2 + 3;
  }

  canDrop() { return !this.over && this.crane.type !== null; }

  // 크레인이 꼭대기 위를 지날 때 속도 배율 (가운데에서 slowMin, slowZone 밖에서 1)
  slowFactor(x) {
    if (this.crane.type === null) return 1;
    const d = Math.abs(x - this.aimX) / CFG.slowZone;
    if (d >= 1) return 1;
    const e = d * d * (3 - 2 * d); // smoothstep: 속도가 덜컥 바뀌지 않게
    return CFG.slowMin + (1 - CFG.slowMin) * e;
  }

  // x를 주면 그 위치에서 놓는다 (테스트용)
  drop(x) {
    if (!this.canDrop()) return false;
    const typeIdx = this.crane.type;
    const t = CAT_TYPES[typeIdx];
    const px = x ?? this.crane.x;
    // 자석 보정: 꼭대기 중심 근처로 놓으면 떨어지는 동안 정중앙 쪽으로 스르륵 끌어당긴다
    // (순간이동하면 딱딱해 보여서 물리 속도로). 테스트처럼 x를 직접 주면 그대로
    const magnet = x === undefined && Math.abs(px - this.aimX) <= CFG.snapTol ? this.aimX : null;
    const body = this._makeBody(t, px, this.heldY());
    const b = body.bounds;
    const cat = {
      id: this.nextId++, type: typeIdx, body, flip: this.crane.flip,
      off: { x: body.position.x / S - (b.min.x + b.max.x) / 2 / S, y: body.position.y / S - (b.min.y + b.max.y) / 2 / S },
      landed: false, landT: -1, settled: false, still: 0, frozen: false, support: null, magnet,
    };
    this.cats.push(cat);
    this.byBody.set(body.id, cat);
    globalThis.Matter.Composite.add(this.engine.world, body);
    this.crane.type = null;
    this.crane.cooldown = CFG.respawnDelay;
    this.count++;
    this.events.push({ type: 'drop', cat });
    return true;
  }

  _makeBody(t, x, y) {
    const { Bodies, Body } = globalThis.Matter;
    const o = { friction: Math.min(1, t.friction + 0.15), frictionStatic: CFG.catFrictionStatic, restitution: t.bounce ?? 0, frictionAir: CFG.catFrictionAir, label: 'cat' };
    let body;
    // 둥근 모서리를 그림만큼 크게 주면 착지 후 2초 가까이 흔들려서 물리는 최대 2px만 깎는다
    if (t.shape === 'rect') body = Bodies.rectangle(x * S, y * S, t.w * S, t.h * S, { ...o, chamfer: { radius: Math.min(t.r, 2) * S } });
    else if (t.shape === 'circle') body = Bodies.circle(x * S, y * S, (t.w / 2) * S, o, 24);
    else {
      body = Bodies.fromVertices(x * S, y * S, [t.verts.map(([vx, vy]) => ({ x: vx * S, y: vy * S }))], o);
    }
    Body.setMass(body, t.mass * 10);
    // 넘어짐 방지용. 원(동글냥·우주냥)은 넘어질 일이 없고 굴러야 하니 제외
    if (t.shape !== 'circle') Body.setInertia(body, body.inertia * CFG.inertiaScale);
    return body;
  }

  _onCollide(e) {
    for (const p of e.pairs) {
      for (const [a, b] of [[p.bodyA, p.bodyB], [p.bodyB, p.bodyA]]) {
        const cat = this.byBody.get(a.id);
        if (!cat || cat.landed) continue;
        cat.landed = true;
        cat.landT = this.time;
        cat.support = b;
        this.events.push({ type: 'land', cat, speed: a.speed / S });
        // 말랑한 착지: 첫 접촉에서 속도와 회전을 흡수해 튕겨 나가지 않게
        const { Body } = globalThis.Matter;
        Body.setVelocity(a, { x: a.velocity.x * CFG.landDamp, y: a.velocity.y * CFG.landDamp });
        Body.setAngularVelocity(a, a.angularVelocity * CFG.landDamp);
      }
    }
  }

  update(dt = STEP) {
    const { Engine, Sleeping, Body } = globalThis.Matter;
    this.time += dt;
    const c = this.crane;

    if (!this.over) {
      const held = c.type !== null ? CAT_TYPES[c.type] : null;
      const half = held ? held.w / 2 : 0;
      c.speed = craneSpeed(this.count, this.height, this.time) * this.slowFactor(c.x);
      c.x += c.dir * c.speed * dt;
      const lo = CFG.craneMargin + half, hi = 180 - CFG.craneMargin - half;
      if (c.x > hi) { c.x = hi; c.dir = -1; }
      if (c.x < lo) { c.x = lo; c.dir = 1; }
      if (c.type === null) {
        c.cooldown -= dt;
        if (c.cooldown <= 0) this._loadCrane();
      }
    }
    // 안착 판정이 늦어도 크레인이 탑에 파묻히지 않게, 착지한 고양이 꼭대기도 함께 본다
    const targetY = -Math.max(this.height, this.landedTop) - CFG.craneAbove;
    c.y += (targetY - c.y) * Math.min(1, dt * 3);

    updateWind(this.wind, dt, this.height, this.rng);
    const blowing = this.wind.phase === 'blow';
    const g = this.engine.gravity.y * this.engine.gravity.scale;
    const slowFall = this.height >= CFG.spaceFrom;

    const sub = this.substeps ?? SUBSTEPS;
    for (let s = 0; s < sub; s++) {
      for (const cat of this.cats) {
        const b = cat.body;
        if (b.isStatic) continue;
        if (blowing && cat.landed) {
          if (b.isSleeping) Sleeping.set(b, false);
          b.force.x += this.wind.dir * b.mass * g * CFG.windG;
        }
        if (slowFall && !cat.landed) b.force.y -= b.mass * g * (1 - CFG.spaceFallScale);
        if (cat.magnet !== null && !cat.landed) {
          const dx = cat.magnet * S - b.position.x;
          Body.setVelocity(b, { x: dx * CFG.magnetPull, y: b.velocity.y });
        }
      }
      Engine.update(this.engine, (dt * 1000) / sub);
    }

    this._afterPhysics(dt);
  }

  _afterPhysics(dt) {
    const { Composite, Body, Sleeping } = globalThis.Matter;
    let top = 0, landedTop = 0, topX = CFG.cushionX, removed = false;
    for (let i = this.cats.length - 1; i >= 0; i--) {
      const cat = this.cats[i];
      const b = cat.body;
      if (b.position.y / S > CFG.fallY) {
        Composite.remove(this.engine.world, b);
        this.byBody.delete(b.id);
        this.cats.splice(i, 1);
        removed = true;
        if (!this.over) {
          // 한 번 무너질 때 여러 마리가 떨어져도 하트는 1개만
          const free = this.time - this.lastHeartLoss < CFG.collapseGrace;
          if (!free) { this.hearts--; this.lastHeartLoss = this.time; }
          this.events.push({ type: 'fall', cat, x: b.position.x / S, free });
          if (this.hearts <= 0) { this.over = true; this.events.push({ type: 'gameover' }); }
        }
        continue;
      }
      if (cat.landed) landedTop = Math.max(landedTop, -b.bounds.min.y / S);
      if (b.isStatic) {
        const ct = -b.bounds.min.y / S;
        if (ct > top) { top = ct; topX = b.position.x / S; }
        continue;
      }
      const moving = b.speed > CFG.settleSpeed || b.angularSpeed > CFG.settleAngular;
      cat.still = cat.landed && !moving ? cat.still + dt : 0;
      if (!cat.settled && cat.still >= CFG.settleTime) {
        cat.settled = true;
        const sup = cat.support && (cat.support.label === 'cushion' || this.byBody.has(cat.support.id)) ? cat.support : null;
        if (sup && Math.abs(b.position.x - sup.position.x) / S <= CFG.perfectTol) {
          this.perfects++;
          this.events.push({ type: 'perfect', cat });
        }
        this.events.push({ type: 'settle', cat });
      }
      if (cat.settled) {
        const ct = -b.bounds.min.y / S;
        if (ct > top) { top = ct; topX = b.position.x / S; }
      }
    }

    // 떨어져 나간 고양이가 있으면 잠든 고양이를 깨운다: 받침이 사라졌는데 잠든 채 공중에 남지 않게
    if (removed) for (const c of this.cats) if (c.body.isSleeping) Sleeping.set(c.body, false);

    this.height = top;
    this.aimX = topX;
    this.landedTop = landedTop;
    if (top > this.best && !this.over) this.best = top; // 게임오버 후엔 기록 고정
    const z = zoneIndexAt(this.best);
    if (z > this.zone) {
      this.zone = z;
      // 새 구간 도착 보상: 하트 1개 회복 (최대치까지)
      const heal = !this.over && this.hearts < this.maxHearts;
      if (heal) this.hearts++;
      this.events.push({ type: 'zone', zone: z, heal });
    }

    // 동결: 꼭대기에서 멀리 내려간 안착 고양이. 아래에서부터 차례로, 이미 고정된 것(방석·동결 고양이) 위에
    // 얹힌 고양이만 고정한다. 움직이는 고양이에 기대어 있을 때 고정하면 받침이 무너진 뒤 공중에 남는다.
    const limit = (-this.height + CFG.freezeDepth) * S;
    const cand = this.cats.filter(c => !c.body.isStatic && c.settled).sort((a, b) => b.body.position.y - a.body.position.y);
    for (const cat of cand) if (cat.body.bounds.min.y > limit && this._onStatic(cat.body)) this._freeze(cat);
    let extra = this.dynamicCount() - CFG.maxDynamic;
    for (const cat of cand) {
      if (extra <= 0) break;
      if (!cat.body.isStatic && this._onStatic(cat.body)) { this._freeze(cat); extra--; }
    }
  }

  // 바디가 고정된 것(방석·동결 고양이) 위에 얹혀 있나: 살짝 아래로 내려 겹치는 고정 바디가 있고, 닿는 점이 몸 아래쪽일 때
  _onStatic(b) {
    const { Body, Query } = globalThis.Matter;
    const near = [];
    for (const o of this.statics) {
      if (o.bounds.max.x <= b.bounds.min.x || o.bounds.min.x >= b.bounds.max.x) continue;
      if (o.bounds.min.y > b.bounds.max.y + 2 * S || o.bounds.max.y < b.position.y) continue;
      near.push(o);
    }
    if (!near.length) return false;
    Body.translate(b, { x: 0, y: 0.5 * S });
    const hits = Query.collides(b, near);
    Body.translate(b, { x: 0, y: -0.5 * S });
    return hits.some(h => h.supports.some(p => p && p.y > b.position.y));
  }

  _freeze(cat) {
    globalThis.Matter.Body.setStatic(cat.body, true);
    cat.frozen = true;
    this.statics.push(cat.body);
  }

  dynamicCount() {
    let n = 0;
    for (const c of this.cats) if (!c.body.isStatic) n++;
    return n;
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // 화면 표시용 픽셀 좌표
  catPos(cat) {
    const b = cat.body;
    return { x: b.position.x / S, y: b.position.y / S, angle: b.angle };
  }
}

export { STEP };
