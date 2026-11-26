// Audio 100 % synthétisé : effets, moteurs, dérapages et musique procédurale.
export class Audio {
  constructor() { this.ctx = null; this.musicVol = 0.5; this.sfxVol = 0.8; this.track = null; this.engines = []; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.connect(this.comp);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master);
    this.mus = ctx.createGain(); this.mus.gain.value = this.musicVol * 0.55; this.mus.connect(this.master);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.step = 0; this.nextTime = 0;
    setInterval(() => this.schedule(), 25);
    if (this.pendingTrack) this.music(this.pendingTrack);
  }

  setVolumes(m, s) {
    this.musicVol = m; this.sfxVol = s;
    if (this.ctx) { this.mus.gain.value = m * 0.55; this.sfx.gain.value = s; }
  }

  get t() { return this.ctx.currentTime; }

  // --------------------------------------------------------------- briques
  osc(type, f0, f1, dur, vol, when = 0, dest = this.sfx, curve = 'exp') {
    const ctx = this.ctx, t = this.t + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) { if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur); else o.frequency.linearRampToValueAtTime(f1, t + dur); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  noise(dur, vol, filter = 'lowpass', f0 = 2000, f1 = f0, q = 1, when = 0, dest = this.sfx, attack = 0.005) {
    const ctx = this.ctx, t = this.t + when;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // --------------------------------------------------------------- effets
  play(name, vol = 1, opt = 0) {
    if (!this.ctx || vol < 0.02) return;
    const v = vol;
    switch (name) {
      case 'minigun': this.noise(0.07, 0.35 * v, 'bandpass', 2400, 900, 1.2); this.osc('square', 180, 70, 0.06, 0.12 * v); break;
      case 'cannon': this.osc('sine', 130, 35, 0.4, 0.8 * v); this.noise(0.35, 0.5 * v, 'lowpass', 1800, 200); break;
      case 'fireball': this.noise(0.45, 0.35 * v, 'bandpass', 400, 2500, 2); this.osc('sawtooth', 120, 300, 0.3, 0.08 * v); break;
      case 'rocket': this.noise(0.6, 0.3 * v, 'bandpass', 600, 3000, 1.5); this.osc('sawtooth', 200, 600, 0.4, 0.06 * v); break;
      case 'mine': this.osc('triangle', 700, 350, 0.12, 0.3 * v); this.osc('triangle', 500, 250, 0.12, 0.25 * v, 0.1); break;
      case 'laser': this.osc('sawtooth', 2200, 180, 0.45, 0.22 * v); this.osc('square', 1400, 90, 0.4, 0.1 * v); this.noise(0.2, 0.15 * v, 'highpass', 3000); break;
      case 'shock': this.osc('sine', 90, 25, 0.8, 0.9 * v); this.noise(0.7, 0.4 * v, 'lowpass', 3000, 100); this.osc('sawtooth', 300, 60, 0.5, 0.1 * v); break;
      case 'shield': [523, 659, 784, 1046].forEach((f, i) => this.osc('triangle', f, f, 0.35, 0.18 * v, i * 0.05)); break;
      case 'turbo': case 'miniturbo': case 'boostpad':
        this.noise(0.5, (name === 'miniturbo' ? 0.25 : 0.35) * v, 'bandpass', 500, 4000, 1.2);
        this.osc('sawtooth', 150, name === 'boostpad' ? 500 : 420, 0.35, 0.1 * v);
        if (name === 'miniturbo') this.osc('triangle', 600 + opt * 200, 1200 + opt * 300, 0.2, 0.12 * v);
        break;
      case 'explosion': {
        const s = opt || 1;
        this.osc('sine', 110, 28, 0.9 * s, 0.9 * v); this.noise(1.0 * s, 0.7 * v, 'lowpass', 2500, 80, 0.7);
        this.noise(0.2, 0.4 * v, 'highpass', 1500, 4000);
        break;
      }
      case 'hit': this.osc('square', 320, 120, 0.12, 0.22 * v); this.noise(0.1, 0.25 * v, 'bandpass', 1500, 600); break;
      case 'hitmarker': this.osc('square', 1900, 1900, 0.04, 0.12 * v); this.osc('square', 2400, 2400, 0.04, 0.08 * v, 0.03); break;
      case 'block': this.osc('triangle', 1200, 900, 0.15, 0.2 * v); this.osc('sine', 2400, 2000, 0.2, 0.08 * v); break;
      case 'kill': [523, 659, 784, 1046, 1318].forEach((f, i) => this.osc('square', f, f, 0.14, 0.1 * v, i * 0.06)); this.osc('triangle', 1046, 1568, 0.4, 0.15 * v, 0.3); break;
      case 'death': this.osc('sawtooth', 500, 60, 0.9, 0.2 * v, 0, this.sfx, 'lin'); this.osc('square', 300, 40, 0.9, 0.1 * v, 0.05); break;
      case 'pickup': [880, 1175, 1568].forEach((f, i) => this.osc('triangle', f, f * 1.02, 0.12, 0.2 * v, i * 0.04)); this.noise(0.25, 0.15 * v, 'highpass', 5000, 8000); break;
      case 'tick': this.osc('square', 1500 + Math.random() * 400, 1200, 0.03, 0.06 * v); break;
      case 'item': this.osc('triangle', 1046, 1046, 0.1, 0.2 * v); this.osc('triangle', 1568, 1568, 0.25, 0.2 * v, 0.08); break;
      case 'jumppad': this.osc('sine', 180, 720, 0.35, 0.5 * v); this.osc('triangle', 360, 1100, 0.3, 0.12 * v); break;
      case 'hop': this.osc('sine', 300, 500, 0.08, 0.12 * v); break;
      case 'land': this.osc('sine', 120, 50, 0.15, Math.min(0.5, 0.2 + opt * 0.02) * v); this.noise(0.12, 0.15 * v, 'lowpass', 900, 200); break;
      case 'bump': this.osc('sine', 150, 50, 0.18, 0.4 * v); this.noise(0.12, 0.3 * v, 'bandpass', 800, 300); break;
      case 'boing': { const k = 0.6 + opt * 0.4; this.osc('sine', 140, 420 * k, 0.12, 0.45 * v); this.osc('sine', 420 * k, 180, 0.28, 0.3 * v, 0.1); this.osc('triangle', 300, 900 * k, 0.1, 0.08 * v); this.noise(0.08, 0.18 * v, 'lowpass', 900, 300); break; }
      case 'drift': this.osc('triangle', 700 + opt * 250, 900 + opt * 300, 0.12, 0.12 * v); break;
      case 'count': this.osc('square', 520, 520, 0.18, 0.18 * v); break;
      case 'go': this.osc('square', 1040, 1040, 0.5, 0.2 * v); this.osc('square', 1560, 1560, 0.5, 0.08 * v); break;
      case 'ui': this.osc('triangle', 900, 1100, 0.05, 0.12 * v); break;
      case 'ok': this.osc('triangle', 700, 700, 0.08, 0.18 * v); this.osc('triangle', 1050, 1050, 0.12, 0.18 * v, 0.06); break;
      case 'back': this.osc('triangle', 700, 450, 0.1, 0.15 * v); break;
      case 'streak': [392, 523, 659, 784].forEach((f, i) => this.osc('sawtooth', f, f, 0.18, 0.08 * v, i * 0.07)); break;
      case 'horn': this.osc('square', 440, 440, 0.25, 0.15 * v); this.osc('square', 554, 554, 0.25, 0.12 * v); break;
      case 'win': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.osc('square', f, f, 0.2, 0.1 * v, i * 0.12)); break;
    }
  }

  // --------------------------------------------------------------- moteurs des joueurs locaux
  createEngine() {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 3; g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfx);
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1800; nf.Q.value = 6;
    const ng = ctx.createGain(); ng.gain.value = 0;
    n.connect(nf); nf.connect(ng); ng.connect(this.sfx);
    o1.start(); o2.start(); n.start();
    const e = {
      update: (speed01, throttle, boost, drift, alive, scale = 1) => {
        const t = ctx.currentTime;
        const base = 55 + speed01 * 120 + (boost ? 40 : 0);
        o1.frequency.setTargetAtTime(base, t, 0.06); o2.frequency.setTargetAtTime(base * 0.502, t, 0.06);
        f.frequency.setTargetAtTime(350 + speed01 * 1400 + Math.abs(throttle) * 300 + (boost ? 900 : 0), t, 0.08);
        g.gain.setTargetAtTime(alive ? (0.045 + 0.05 * speed01 + (boost ? 0.03 : 0)) * scale : 0, t, 0.1);
        ng.gain.setTargetAtTime(alive && drift ? 0.08 * scale : 0, t, 0.05);
        nf.frequency.setTargetAtTime(1500 + speed01 * 900, t, 0.1);
      },
      stop: () => { try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); ng.gain.setTargetAtTime(0, ctx.currentTime, 0.05); setTimeout(() => { o1.stop(); o2.stop(); n.stop(); }, 300); } catch (err) { /* déjà arrêté */ } },
    };
    this.engines.push(e);
    return e;
  }

  stopEngines() { this.engines.forEach(e => e.stop()); this.engines = []; }

  // --------------------------------------------------------------- musique
  music(name) {
    if (!this.ctx) { this.pendingTrack = name; return; }
    if (this.track === name) return;
    this.track = name; this.step = 0; this.nextTime = this.t + 0.1;
  }
  setIntense(v) { this.intense = v; }

  schedule() {
    if (!this.ctx || !this.track) return;
    const T = TRACKS[this.track];
    const bpm = T.bpm * (this.intense ? 1.12 : 1), st = 60 / bpm / 4;
    while (this.nextTime < this.t + 0.15) {
      this.playStep(T, this.step, this.nextTime - this.t, st);
      this.step++; this.nextTime += st;
    }
  }

  playStep(T, step, when, st) {
    const bar = Math.floor(step / 16) % T.chords.length, s = step % 16, chord = T.chords[bar], m = this.mus;
    const hz = n => 440 * Math.pow(2, (n - 69) / 12);
    // batterie
    if (T.kick.includes(s)) { this.osc('sine', 150, 40, 0.22, 0.8, when, m); }
    if (T.snare.includes(s)) { this.noise(0.16, 0.35, 'bandpass', 1800, 1200, 0.8, when, m); this.osc('triangle', 220, 160, 0.08, 0.15, when, m); }
    if (T.hat.includes(s) || (this.intense && s % 2 === 1)) this.noise(0.04, s % 4 === 2 ? 0.12 : 0.06, 'highpass', 7000, 9000, 1, when, m);
    // basse
    if (T.bass[s] !== undefined && T.bass[s] !== null) this.osc(T.bassWave, hz(chord[0] - 24 + T.bass[s]), hz(chord[0] - 24 + T.bass[s]), st * 1.6, 0.22, when, m);
    // arpège
    if (T.arp && s % T.arpEvery === 0) {
      const notes = [...chord, chord[0] + 12, chord[1] + 12];
      const n = notes[(step / T.arpEvery | 0) % notes.length] + (bar % 2 && T.arpUp ? 12 : 0);
      this.osc(T.arpWave, hz(n), hz(n), st * 1.4, T.arpVol, when, m);
    }
    // nappe sur le premier temps
    if (s === 0 && T.pad) chord.forEach(n => this.osc('triangle', hz(n), hz(n), st * 15, 0.04, when, m));
  }
}

const TRACKS = {
  race: {
    bpm: 140, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
    kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14],
    bass: [0, null, 12, 0, null, 12, 0, 12, 0, null, 12, 0, 7, null, 12, 10], bassWave: 'square',
    arp: true, arpEvery: 1, arpWave: 'square', arpVol: 0.035, arpUp: true, pad: true,
  },
  menu: {
    bpm: 104, chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]],
    kick: [0, 8, 10], snare: [4, 12], hat: [2, 6, 10, 14],
    bass: [0, null, null, 0, null, null, 7, null, 0, null, null, 0, null, 12, 7, null], bassWave: 'triangle',
    arp: true, arpEvery: 2, arpWave: 'triangle', arpVol: 0.06, arpUp: false, pad: true,
  },
};
