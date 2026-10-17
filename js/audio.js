// WebAudio로 직접 합성하는 효과음 + 칩튠 BGM. 외부 파일 없음.

const PENTA = [0, 2, 4, 7, 9];
const noteHz = semi => 440 * Math.pow(2, (semi - 9) / 12); // semi 0 = C4
const pentaSemi = i => PENTA[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5);

// 구간별 BGM: 근음(반음), 템포, 멜로디 음색
const ZONE_MUSIC = [
  { root: 0, bpm: 92, wave: 'triangle' },
  { root: 2, bpm: 104, wave: 'square' },
  { root: 5, bpm: 108, wave: 'square' },
  { root: -3, bpm: 84, wave: 'triangle' },
  { root: -1, bpm: 80, wave: 'sine' },
];
const MELODY = [0, 2, 4, 2, 3, 4, 5, 4, 2, 1, 2, 4, 3, 2, 1, -1, 0, 2, 4, 5, 7, 5, 4, 2, 3, 4, 2, 1, 0, -1, 0, -9];
const BASS = [0, 0, 3, 3, -2, -2, 2, 1];

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.zoneIdx = 0;
    this.music = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  // 첫 사용자 입력에서 호출
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.28; this.musicBus.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  _tone({ freq, freq2, type = 'square', dur = 0.12, vol = 0.15, at = 0, bus, attack = 0.005, bend }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (bend) bend(o.frequency, t0);
    else if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus || this.sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  // 착지 "냥": 높이가 높을수록 음정이 올라간다 (펜타토닉)
  meow(heightPx, impact = 0.5) {
    if (!this.ctx) return;
    const i = Math.min(14, Math.floor(heightPx / 45));
    const f = noteHz(pentaSemi(i) + 7);
    const bend = (p, t0) => {
      p.setValueAtTime(f * 0.85, t0);
      p.exponentialRampToValueAtTime(f * 1.22, t0 + 0.05);
      p.exponentialRampToValueAtTime(f * 0.92, t0 + 0.2);
    };
    const vol = 0.07 + impact * 0.07;
    this._tone({ freq: f, type: 'triangle', dur: 0.22, vol, bend });
    this._tone({ freq: f * 2, type: 'sine', dur: 0.16, vol: vol * 0.35, bend: (p, t0) => { p.setValueAtTime(f * 1.7, t0); p.exponentialRampToValueAtTime(f * 2.4, t0 + 0.05); p.exponentialRampToValueAtTime(f * 1.8, t0 + 0.16); } });
  }

  thud(impact) {
    this._tone({ freq: 140, freq2: 60, type: 'sine', dur: 0.09, vol: 0.05 + impact * 0.1 });
  }

  drop() { this._tone({ freq: 700, freq2: 380, type: 'square', dur: 0.06, vol: 0.035 }); }

  perfect() {
    [0, 2, 4, 7].forEach((n, i) => this._tone({ freq: noteHz(pentaSemi(n + 10)), type: 'square', dur: 0.12, vol: 0.06, at: i * 0.055 }));
  }

  fall() {
    this._tone({ freq: 620, freq2: 120, type: 'triangle', dur: 0.5, vol: 0.12 });
    this._tone({ freq: 300, freq2: 70, type: 'square', dur: 0.35, vol: 0.04, at: 0.08 });
  }

  zone() {
    [0, 4, 7, 12, 16].forEach((n, i) => this._tone({ freq: noteHz(n + 12), type: 'square', dur: 0.16, vol: 0.06, at: i * 0.08 }));
    this._tone({ freq: noteHz(24), type: 'triangle', dur: 0.5, vol: 0.08, at: 0.4 });
  }

  gameover() {
    [7, 4, 2, 0].forEach((n, i) => this._tone({ freq: noteHz(n), type: 'triangle', dur: 0.3, vol: 0.1, at: i * 0.18 }));
  }

  click() { this._tone({ freq: 900, freq2: 1300, type: 'square', dur: 0.05, vol: 0.04 }); }

  newFriend() {
    [4, 7, 9, 12].forEach((n, i) => this._tone({ freq: noteHz(n + 12), type: 'triangle', dur: 0.14, vol: 0.07, at: i * 0.07 }));
  }

  wind() { this._tone({ freq: 220, freq2: 330, type: 'sawtooth', dur: 0.6, vol: 0.015, attack: 0.2 }); }

  // ---- BGM ----
  startMusic() {
    if (!this.ctx || this.music) return;
    this.music = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this._schedule(), 30);
  }

  stopMusic() {
    this.music = false;
    clearInterval(this.timer);
    this.timer = null;
  }

  setZone(z) { this.zoneIdx = z; }

  _schedule() {
    if (!this.ctx) return;
    const m = ZONE_MUSIC[this.zoneIdx] || ZONE_MUSIC[0];
    const stepDur = 60 / m.bpm / 2;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      const s = this.step % 32;
      const at = this.nextTime - this.ctx.currentTime;
      const mel = MELODY[s];
      if (mel > -9 && s % 2 === 0 || (s % 4 === 3 && mel > -9)) {
        this._tone({ freq: noteHz(pentaSemi(mel + 5) + m.root), type: m.wave, dur: stepDur * 1.6, vol: 0.05, at, bus: this.musicBus });
      }
      if (s % 4 === 0) {
        const b = BASS[(s / 4) % 8];
        this._tone({ freq: noteHz(b + m.root - 12), type: 'triangle', dur: stepDur * 3.5, vol: 0.09, at, bus: this.musicBus });
      }
      if (s % 8 === 4) this._tone({ freq: 1800, freq2: 900, type: 'square', dur: 0.025, vol: 0.012, at, bus: this.musicBus });
      this.nextTime += stepDur;
      this.step++;
    }
  }
}
