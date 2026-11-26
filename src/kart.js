// Kart : physique arcade (accélération, glisse, drift + mini-turbo, sauts) et animation du modèle.
import * as THREE from 'three';
import { buildKart, charById, paintById, G, toon } from './characters.js';

export const KART_R = 1.25;
const MAX_SPEED = 31, BOOST_SPEED = 46, ACCEL = 30, BRAKE = 55, REVERSE_MAX = 13;
const GRIP = 9, DRIFT_GRIP = 2.0, AIR_GRIP = 0.4, GRAVITY = 42, TURN = 2.5, HOP = 6.2;
export const MAX_HP = 100;
const DRIFT_LEVELS = [0.75, 1.7, 2.8];
const TURBO_TIME = [0, 0.6, 1.0, 1.5];
export const DRIFT_COLORS = ['#ffffff', '#4dc3ff', '#ff9a1a', '#d35cff'];

const v3 = new THREE.Vector3();
const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
export const wrapAngle = a => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

const shieldMat = new THREE.MeshBasicMaterial({ color: '#6fffd2', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
const shieldWire = new THREE.MeshBasicMaterial({ color: '#b8fff0', wireframe: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });

export class Kart {
  constructor(game, def) {
    this.game = game;
    this.id = def.id; this.name = def.name; this.charId = def.char; this.paintId = def.paint;
    this.owner = def.owner; this.isBot = !!def.isBot;
    this.isLocal = def.owner === game.myPeer;
    this.paint = paintById(def.paint);
    this.model = buildKart(charById(def.char), this.paint);
    game.scene.add(this.model.root);

    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0;
    this.grounded = true; this.airTime = 0; this.speedMul = 1;
    this.steerS = 0; this.throttle = 0;
    this.drift = 0; this.driftCharge = 0; this.driftLevel = 0; this.hopPending = false; this.driftHeld = false;
    this.boost = 0; this.spin = 0; this.spinAngle = 0; this.stun = 0;
    this.hp = MAX_HP; this.dead = false; this.invuln = 0; this.shield = 0;
    this.weapon = null; this.ammo = 0; this.roll = 0; this.cool = 0;
    this.kills = 0; this.deaths = 0; this.streak = 0; this.multi = 0; this.lastKill = -99;
    this.flash = 0; this.lastPad = 0; this.lastJump = 0; this.wallHit = 0;
    this.vis = { roll: 0, pitch: 0, sq: 0, sqV: 0, driftYaw: 0, wheel: 0, blink: 2 + Math.random() * 3, look: 0 };
    this.buf = [];
    this.emitAcc = 0;

    // Bouclier
    this.shieldMesh = new THREE.Group();
    const s1 = new THREE.Mesh(G.sph, shieldMat); s1.scale.setScalar(2.1); this.shieldMesh.add(s1);
    const s2 = new THREE.Mesh(new THREE.IcosahedronGeometry(2.15, 1), shieldWire); this.shieldMesh.add(s2);
    this.shieldMesh.position.y = 0.9; this.shieldMesh.visible = false;
    this.model.root.add(this.shieldMesh);

    // Couronne du meneur
    this.crown = new THREE.Group();
    const gold = toon('#ffc928', { emissive: '#4a2f00' });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.22, 10, 1, true), toon('#ffc928', { side: THREE.DoubleSide, emissive: '#4a2f00' })); this.crown.add(band);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const c = new THREE.Mesh(G.cone, gold); c.scale.set(0.09, 0.26, 0.09); c.position.set(Math.sin(a) * 0.3, 0.22, Math.cos(a) * 0.3); this.crown.add(c); }
    this.crown.position.set(0, 0.62, 0); this.crown.rotation.x = -0.15; this.crown.visible = false;
    this.model.head.add(this.crown);

    // Étiquette (nom + vie)
    this.tagCanvas = document.createElement('canvas'); this.tagCanvas.width = 256; this.tagCanvas.height = 72;
    this.tagTex = new THREE.CanvasTexture(this.tagCanvas); this.tagTex.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tagTex, depthTest: false, transparent: true }));
    this.tag.scale.set(3.4, 0.96, 1); this.tag.position.y = 2.75; this.tag.renderOrder = 10;
    this.model.root.add(this.tag);
    this.tagHp = -1; this.drawTag();
  }

  setTagLayer(layer) { this.tag.layers.set(layer); }

  drawTag() {
    const c = this.tagCanvas.getContext('2d'), W = 256;
    c.clearRect(0, 0, W, 72);
    c.font = '700 30px "Lilita One", "Fredoka", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 6; c.strokeStyle = 'rgba(20,16,60,0.85)'; c.strokeText(this.name, W / 2, 22);
    c.fillStyle = this.isBot ? '#ffffff' : '#ffe14d'; c.fillText(this.name, W / 2, 22);
    const w = 150, x = (W - w) / 2, y = 46, h = 14, f = Math.max(0, this.hp / MAX_HP);
    c.fillStyle = 'rgba(20,16,60,0.8)'; c.beginPath(); c.roundRect(x - 3, y - 3, w + 6, h + 6, 8); c.fill();
    c.fillStyle = f > 0.5 ? '#4dff7a' : f > 0.25 ? '#ffd23f' : '#ff4d4d';
    if (f > 0) { c.beginPath(); c.roundRect(x, y, w * f, h, 6); c.fill(); }
    this.tagTex.needsUpdate = true; this.tagHp = this.hp;
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get forward() { return v3.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  place(x, y, z, yaw) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.yaw = yaw;
    this.grounded = true; this.drift = 0; this.driftCharge = 0; this.driftLevel = 0; this.boost = 0; this.spin = 0; this.spinAngle = 0;
    this.buf.length = 0; this.vis.driftYaw = 0;
  }

  // ------------------------------------------------------------------ physique (karts simulés ici)
  physics(dt, inp, map) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = -fz, rz = fx;
    let fs = this.vel.x * fx + this.vel.z * fz;
    let ls = this.vel.x * rx + this.vel.z * rz;
    const controllable = !this.dead && this.spin <= 0;
    const throttle = controllable ? inp.throttle : 0;
    const steerIn = controllable ? inp.steer : 0;
    this.throttle = throttle;
    this.steerS += (steerIn - this.steerS) * Math.min(1, dt * 12);
    const maxS = (this.boost > 0 ? BOOST_SPEED : MAX_SPEED) * this.speedMul;

    // Hop / drift
    if (controllable && inp.driftPressed && this.grounded) {
      this.vel.y += HOP; this.grounded = false; this.hopPending = true; this.vis.sqV -= 3;
      this.game.onKartEvent(this, 'hop');
    }
    if (!inp.drift || !controllable) {
      if (this.drift !== 0) this.releaseDrift();
      this.hopPending = false;
    }
    if (this.drift !== 0 && (fs < 7 || !this.grounded && this.airTime > 0.6)) { this.drift = 0; this.driftCharge = 0; this.driftLevel = 0; }

    if (this.grounded) {
      if (throttle > 0.05) {
        if (fs < 0) fs += BRAKE * throttle * dt;
        else if (fs < maxS) fs += ACCEL * throttle * dt * (1.15 - 0.6 * fs / maxS) * (this.boost > 0 ? 2.2 : 1);
      } else if (throttle < -0.05) {
        if (fs > 0.5) fs -= BRAKE * -throttle * dt;
        else fs = Math.max(fs - 26 * -throttle * dt, -REVERSE_MAX);
      } else {
        fs *= Math.exp(-0.8 * dt);
      }
      if (fs > maxS) fs += (maxS - fs) * Math.min(1, dt * 1.5);
      if (this.boost > 0 && fs < maxS) fs = Math.min(maxS, fs + 50 * dt);
      if (this.spin > 0) fs *= Math.exp(-3 * dt);
    }

    // Rotation
    const absF = Math.abs(fs);
    let yawRate = 0;
    if (this.drift !== 0) {
      const rel = this.steerS * this.drift;
      yawRate = -this.drift * (1.25 + 0.75 * rel) * 1.15;
      this.driftCharge += dt * (1 + 0.6 * Math.max(0, rel));
      const lvl = this.driftCharge > DRIFT_LEVELS[2] ? 3 : this.driftCharge > DRIFT_LEVELS[1] ? 2 : this.driftCharge > DRIFT_LEVELS[0] ? 1 : 0;
      if (lvl > this.driftLevel) { this.driftLevel = lvl; this.game.onKartEvent(this, 'driftLevel'); }
    } else {
      const sf = Math.min(1, absF / 7) * (1 - 0.32 * Math.min(1, absF / MAX_SPEED));
      yawRate = -this.steerS * TURN * sf * Math.sign(fs || 1);
      if (!this.grounded) yawRate *= 0.55;
    }
    this.yaw += yawRate * dt;
    if (this.spin > 0) { this.spin -= dt; this.spinAngle += dt * 14; if (this.spin <= 0) this.spinAngle = 0; }

    // Recombine la vitesse dans le nouveau repère
    const grip = !this.grounded ? AIR_GRIP : this.drift !== 0 ? DRIFT_GRIP : (this.spin > 0 ? 1.5 : GRIP);
    ls *= Math.exp(-grip * dt);
    if (this.drift !== 0 && this.grounded) ls -= this.drift * fs * 0.6 * dt;
    const nfx = Math.sin(this.yaw), nfz = Math.cos(this.yaw), nrx = -nfz, nrz = nfx;
    // on garde la vitesse horizontale en vol (pas de virage instantané)
    if (this.grounded) {
      this.vel.x = nfx * fs + nrx * ls; this.vel.z = nfz * fs + nrz * ls;
    } else {
      const ax = nfx * fs + nrx * ls, az = nfz * fs + nrz * ls;
      const k = Math.min(1, dt * 2.5);
      this.vel.x += (ax - this.vel.x) * k; this.vel.z += (az - this.vel.z) * k;
    }

    // Déplacement horizontal + collisions
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    const n = map.collide(this.pos, KART_R, this.pos.y);
    if (n) {
      const vn = this.vel.x * n.nx + this.vel.z * n.nz;
      if (vn < 0) {
        this.vel.x -= n.nx * vn * 1.35; this.vel.z -= n.nz * vn * 1.35;
        this.vel.x *= 0.92; this.vel.z *= 0.92;
        if (-vn > 9 && this.wallHit <= 0) { this.wallHit = 0.25; this.game.onKartEvent(this, 'bump', -vn); if (this.drift) { this.drift = 0; this.driftCharge = 0; this.driftLevel = 0; } }
      }
    }
    this.wallHit -= dt;

    // Vertical
    const h = map.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    if (this.grounded) {
      const drop = this.pos.y - h;
      if (drop < 0.55) {
        const vy = (h - this.pos.y) / dt;
        this.pos.y = h;
        this.vel.y = Math.max(-20, Math.min(20, vy));
      } else {
        this.grounded = false; this.airTime = 0;
      }
    } else {
      this.vel.y -= GRAVITY * dt;
      this.pos.y += this.vel.y * dt;
      this.airTime += dt;
      if (this.pos.y <= h) {
        const impact = -this.vel.y;
        this.pos.y = h; this.vel.y = 0; this.grounded = true;
        if (this.airTime > 0.3 || impact > 9) { this.vis.sqV += Math.min(9, impact * 0.35); this.game.onKartEvent(this, 'land', impact); }
        // atterrissage après un hop : on démarre le drift
        if (this.hopPending && inp.drift && Math.abs(steerIn) > 0.25 && fs > 9) {
          this.drift = Math.sign(steerIn); this.driftCharge = 0; this.driftLevel = 0;
          this.game.onKartEvent(this, 'driftStart');
        }
        this.hopPending = false;
        this.airTime = 0;
      }
    }
    if (this.pos.y < -5) this.pos.y = 0;

    // Éléments de la carte
    if (this.grounded && !this.dead) {
      const pad = map.onBoostPad(this.pos.x, this.pos.z, this.pos.y);
      if (pad) { if (this.boost < 0.9) this.game.onKartEvent(this, 'boostpad'); this.boost = Math.max(this.boost, 1.1); }
      const jp = map.onJumpPad(this.pos.x, this.pos.z, this.pos.y);
      if (jp && this.lastJump <= 0) {
        this.vel.y = 21; this.grounded = false; this.airTime = 0; this.lastJump = 0.5; this.vis.sqV -= 5;
        const sp = this.speed; if (sp < 18) { this.vel.x += Math.sin(this.yaw) * (18 - sp); this.vel.z += Math.cos(this.yaw) * (18 - sp); }
        this.game.onKartEvent(this, 'jumppad');
      }
    }
    this.lastJump -= dt;
    if (this.boost > 0) this.boost -= dt;
  }

  releaseDrift() {
    if (this.driftLevel > 0) {
      this.boost = Math.max(this.boost, TURBO_TIME[this.driftLevel]);
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const fs = this.vel.x * fx + this.vel.z * fz;
      if (fs < MAX_SPEED + 4) { this.vel.x += fx * 6; this.vel.z += fz * 6; }
      this.game.onKartEvent(this, 'miniturbo', this.driftLevel);
    }
    this.drift = 0; this.driftCharge = 0; this.driftLevel = 0;
  }

  // Impulsion reçue (explosions)
  knock(kx, ky, kz, spin) {
    this.vel.x += kx; this.vel.z += kz;
    if (ky > 0) { this.vel.y = Math.max(this.vel.y, ky); this.grounded = false; this.airTime = 0; }
    if (spin) { this.spin = 0.85; this.drift = 0; this.driftCharge = 0; this.driftLevel = 0; }
  }

  // ------------------------------------------------------------------ karts distants : interpolation
  pushSnapshot(a, now) {
    // a = [id, x, y, z, yaw, vx, vy, vz, steer, flags, driftLevel, spinAngle]
    this.buf.push({ t: now, x: a[1], y: a[2], z: a[3], yaw: a[4], vx: a[5], vy: a[6], vz: a[7], st: a[8] / 100, f: a[9], dl: a[10], sa: a[11] / 100 });
    if (this.buf.length > 30) this.buf.shift();
  }

  interpolate(now) {
    const b = this.buf; if (!b.length) return;
    const rt = now - 110;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].t > rt) i--;
    let s;
    if (i > 0 && b[i].t >= rt) {
      const a = b[i - 1], c = b[i], t = (rt - a.t) / Math.max(1, c.t - a.t);
      this.pos.set(a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t, a.z + (c.z - a.z) * t);
      this.yaw = lerpAngle(a.yaw, c.yaw, t);
      s = c;
    } else {
      s = b[b.length - 1];
      const ex = Math.min(0.2, Math.max(0, (rt - s.t) / 1000));
      this.pos.set(s.x + s.vx * ex, s.y, s.z + s.vz * ex);
      this.yaw = s.yaw;
    }
    this.vel.set(s.vx, s.vy, s.vz);
    this.steerS += (s.st - this.steerS) * 0.3;
    const wasGround = this.grounded;
    this.grounded = !!(s.f & 1);
    if (!wasGround && this.grounded) this.vis.sqV += 3;
    this.boost = s.f & 2 ? 0.2 : 0;
    this.drift = s.f & 4 ? 1 : s.f & 8 ? -1 : 0;
    this.spinAngle = s.sa;
    this.driftLevel = s.dl;
  }

  snapshot() {
    const f = (this.grounded ? 1 : 0) | (this.boost > 0 ? 2 : 0) | (this.drift > 0 ? 4 : 0) | (this.drift < 0 ? 8 : 0);
    const r = v => Math.round(v * 100) / 100;
    return [this.id, r(this.pos.x), r(this.pos.y), r(this.pos.z), r(this.yaw), r(this.vel.x), r(this.vel.y), r(this.vel.z), Math.round(this.steerS * 100), f, this.driftLevel, Math.round(this.spinAngle * 100)];
  }

  // ------------------------------------------------------------------ rendu
  updateVisual(dt, time, fx) {
    const m = this.model, V = this.vis;
    m.root.visible = !this.dead;
    if (this.dead) return;
    const fwdX = Math.sin(this.yaw), fwdZ = Math.cos(this.yaw);
    const fs = this.vel.x * fwdX + this.vel.z * fwdZ;
    const sp01 = Math.min(1, Math.abs(fs) / MAX_SPEED);

    // Angle de dérapage visuel
    const targetDY = -this.drift * 0.42;
    V.driftYaw += (targetDY - V.driftYaw) * Math.min(1, dt * 8);
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw + V.driftYaw + this.spinAngle;

    // Inclinaison selon le sol
    let pitchT = 0, rollT = 0;
    const map = this.game.map;
    if (this.grounded) {
      const hf = map.groundHeight(this.pos.x + fwdX * 1.1, this.pos.z + fwdZ * 1.1, this.pos.y + 0.6);
      const hb = map.groundHeight(this.pos.x - fwdX * 1.1, this.pos.z - fwdZ * 1.1, this.pos.y + 0.6);
      pitchT = -Math.atan2(hf - hb, 2.2);
      rollT = this.steerS * sp01 * 0.1 + this.drift * 0.08;
      pitchT += -this.throttle * 0.03 * (1 - sp01);
    } else {
      pitchT = Math.max(-0.5, Math.min(0.5, -this.vel.y * 0.025));
    }
    V.pitch += (pitchT - V.pitch) * Math.min(1, dt * 10);
    V.roll += (rollT - V.roll) * Math.min(1, dt * 8);
    m.tilt.rotation.set(V.pitch, 0, V.roll, 'YXZ');

    // Ressort d'écrasement
    V.sqV += (-V.sq * 160 - V.sqV * 11) * dt;
    V.sq += V.sqV * dt;
    const sq = Math.max(-0.35, Math.min(0.35, V.sq));
    const vib = this.grounded ? Math.sin(time * 55) * 0.012 * (0.4 + sp01) : 0;
    m.body.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    m.body.position.y = vib - sq * 0.15;

    // Roues
    V.wheel += fs * dt / 0.42;
    for (const w of Object.values(m.wheels)) w.spin.rotation.x = V.wheel;
    m.wheels.fl.pivot.rotation.y = m.wheels.fr.pivot.rotation.y = -this.steerS * 0.45;

    // Tête et yeux
    m.head.rotation.z = this.steerS * 0.18 * sp01;
    m.head.rotation.y = -this.steerS * 0.25;
    m.head.position.y = 1.42 + Math.sin(time * 9 + this.id) * 0.02 * sp01;
    V.blink -= dt;
    const blinking = V.blink < 0.12;
    if (V.blink < 0) V.blink = 2 + Math.random() * 4;
    for (const e of m.eyes) {
      e.group.scale.y = blinking ? 0.12 : 1;
      e.pupil.position.x = -this.steerS * e.s * 0.25;
    }

    // Flammes de boost
    const boosting = this.boost > 0;
    for (const f of m.flames) {
      f.visible = boosting;
      if (boosting) { const s = 0.8 + Math.random() * 0.5; f.scale.set(s, s * (1.1 + Math.random() * 0.4), s); }
    }

    // Éclat blanc sur coup reçu + clignotement d'invincibilité
    if (this.flash > 0) {
      this.flash -= dt;
      const f = Math.max(0, this.flash) * 3;
      for (const mat of m.mats) mat.emissive.setRGB(f, f * 0.6, f * 0.6);
      if (this.flash <= 0) for (const mat of m.mats) mat.emissive.setRGB(0, 0, 0);
    }
    m.body.visible = !(this.invuln > 0 && Math.floor(time * 16) % 2 === 0);

    // Bouclier
    this.shieldMesh.visible = this.shield > 0;
    if (this.shield > 0) {
      const p = 1 + Math.sin(time * 10) * 0.04;
      this.shieldMesh.scale.setScalar(this.shield < 1.2 && Math.floor(time * 10) % 2 ? 0.0001 : p);
      this.shieldMesh.rotation.y = time * 1.5;
    }
    if (this.tagHp !== this.hp) this.drawTag();

    // Particules
    if (fx) this.emitParticles(dt, fs, fx);
  }

  emitParticles(dt, fs, fx) {
    const m = this.model;
    const c = Math.cos(m.root.rotation.y), s = Math.sin(m.root.rotation.y);
    const wp = (lx, ly, lz) => ({ x: this.pos.x + lx * c + lz * s, y: this.pos.y + ly, z: this.pos.z - lx * s + lz * c });
    this.emitAcc += dt;
    if (this.emitAcc < 1 / 60) return;
    const step = this.emitAcc; this.emitAcc = 0;
    // Étincelles de drift
    if (this.drift !== 0 && this.grounded) {
      const col = DRIFT_COLORS[this.driftLevel];
      for (const side of [1, -1]) {
        const p = wp(side * 0.85, 0.1, -0.95);
        const n = this.driftLevel > 0 ? 3 : 1;
        for (let i = 0; i < n; i++) fx.add.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 6 - Math.sin(this.yaw) * 4, 2 + Math.random() * 4, (Math.random() - 0.5) * 6 - Math.cos(this.yaw) * 4, 0.25 + Math.random() * 0.2, this.driftLevel > 0 ? 0.55 : 0.35, 0.05, col, 1, 0.2, 10);
        if (Math.random() < 0.5) fx.alpha.spawn(p.x, p.y + 0.2, p.z, 0, 1.5, 0, 0.6, 0.6, 1.8, '#ffffff', 0.45, 0.5, 0);
      }
    }
    // Fumée d'échappement / flammes de boost
    for (const e of m.exhausts) {
      const p = wp(e.x, e.y + m.body.position.y, e.z);
      if (this.boost > 0) {
        fx.add.spawn(p.x, p.y, p.z, -Math.sin(this.yaw) * 6 + (Math.random() - 0.5) * 2, 1 + Math.random(), -Math.cos(this.yaw) * 6 + (Math.random() - 0.5) * 2, 0.25, 0.9, 0.2, Math.random() < 0.5 ? '#ffb12e' : '#ff5a1f', 1, 0.5, 0);
      } else if (Math.random() < 0.25 * step * 60) {
        fx.alpha.spawn(p.x, p.y, p.z, -Math.sin(this.yaw) * 1.5, 1.2, -Math.cos(this.yaw) * 1.5, 0.7, 0.3, 0.9, '#e8e4f5', 0.35, 0.3, 0);
      }
    }
    // Poussière à grande vitesse
    if (this.grounded && Math.abs(fs) > 20 && Math.random() < 0.4) {
      const p = wp((Math.random() < 0.5 ? 1 : -1) * 0.85, 0.1, -0.9);
      fx.alpha.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, 0.5, 0.5, 1.4, '#f4fff0', 0.3, 0.6, 0);
    }
  }

  dispose() {
    this.game.scene.remove(this.model.root);
    this.model.mats.forEach(m => m.dispose());
    this.tagTex.dispose();
  }
}
