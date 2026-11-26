// IA des bots : choisit une cible (boîte ou adversaire), suit le graphe de navigation, drifte et tire.
import { wrapAngle } from './kart.js';

const DIFF = {
  facile: { speed: 0.84, aim: 0.16, react: 0.55, drift: false, accuracy: 0.6 },
  normal: { speed: 0.94, aim: 0.08, react: 0.3, drift: true, accuracy: 0.8 },
  difficile: { speed: 1.0, aim: 0.03, react: 0.14, drift: true, accuracy: 1 },
};

export class Bot {
  constructor(game, kart, difficulty = 'normal') {
    this.g = game; this.k = kart; this.d = DIFF[difficulty] || DIFF.normal;
    kart.speedMul = this.d.speed;
    this.goal = null; this.goalKind = null; this.path = null; this.pi = 0;
    this.think = Math.random() * 0.5; this.replan = 0; this.stuck = 0; this.reverse = 0; this.revSteer = 1;
    this.fireWant = 0; this.holdTime = 0; this.target = null; this.lastAttacker = null; this.driftHold = false; this.wander = null;
  }

  onHit(attackerId) { this.lastAttacker = attackerId; this.lastHitAt = this.g.time; }

  update(dt) {
    const k = this.k, g = this.g;
    const out = { throttle: 1, steer: 0, drift: false, fire: false, driftPressed: false, firePressed: false };
    if (k.dead || g.state !== 'play') { out.throttle = 0; return out; }

    this.think -= dt;
    if (this.think <= 0) { this.think = 0.35 + Math.random() * 0.25; this.chooseGoal(); }
    if (!this.goal) return out;

    // Point à atteindre : direct si praticable, sinon chemin
    let tx = this.goal.x, tz = this.goal.z;
    this.replan -= dt;
    if (this.replan <= 0) {
      this.replan = 0.8 + Math.random() * 0.4;
      if (g.map.traversable(k.pos.x, k.pos.y, k.pos.z, tx, tz, null, 1.1) && Math.abs(this.goal.y - k.pos.y) < 1.2) this.path = null;
      else {
        const a = g.map.nearestNode(k.pos.x, k.pos.y, k.pos.z), b = g.map.nearestNode(this.goal.x, this.goal.y, this.goal.z, false);
        this.path = g.map.path(a, b); this.pi = 0;
      }
    }
    if (this.path && this.pi < this.path.length) {
      let n = this.path[this.pi];
      if (Math.hypot(n.x - k.pos.x, n.z - k.pos.z) < 5.5 && this.pi < this.path.length - 1) { this.pi++; n = this.path[this.pi]; }
      tx = n.x; tz = n.z;
    }

    const want = Math.atan2(tx - k.pos.x, tz - k.pos.z);
    let diff = wrapAngle(want - k.yaw);
    // évitement d'obstacles par antennes
    const probe = (ang, dist) => { const a = k.yaw + ang; return g.map.blockedCircle(k.pos.x + Math.sin(a) * dist, k.pos.z + Math.cos(a) * dist, k.pos.y, 1.0); };
    const sp = k.speed;
    const look = 4 + sp * 0.22;
    if (probe(0, look)) {
      const l = probe(0.5, look), r = probe(-0.5, look);
      if (!l && r) diff += 0.9; else if (l && !r) diff -= 0.9; else diff += diff >= 0 ? 0.9 : -0.9;
    } else {
      if (probe(0.45, look * 0.8)) diff -= 0.35;
      if (probe(-0.45, look * 0.8)) diff += 0.35;
    }
    out.steer = Math.max(-1, Math.min(1, -diff * 2.6));
    const ad = Math.abs(diff);
    out.throttle = ad > 1.6 && sp > 14 ? 0.3 : 1;

    // Drift dans les virages longs
    if (this.d.drift && k.grounded) {
      if (!this.driftHold && ad > 0.55 && ad < 1.6 && sp > 22 && (!this.path || this.pi < this.path.length)) { this.driftHold = true; out.driftPressed = true; }
      if (this.driftHold && (ad < 0.15 || sp < 12 || k.driftLevel >= 2 && ad < 0.35)) this.driftHold = false;
    } else if (!k.grounded && this.driftHold && k.drift === 0 && k.airTime > 0.5) this.driftHold = false;
    out.drift = this.driftHold;

    // Bloqué ?
    if (sp < 3 && out.throttle > 0 && this.reverse <= 0) { this.stuck += dt; if (this.stuck > 0.8) { this.reverse = 0.9; this.stuck = 0; this.revSteer = diff > 0 ? 1 : -1; } }
    else this.stuck = Math.max(0, this.stuck - dt);
    if (this.reverse > 0) { this.reverse -= dt; out.throttle = -1; out.steer = this.revSteer; out.drift = false; this.driftHold = false; }

    this.decideFire(dt, out);
    return out;
  }

  chooseGoal() {
    const k = this.k, g = this.g;
    const enemies = g.karts.filter(o => o !== k && !o.dead);
    // cible : proximité, meneur, vengeance
    let best = null, bs = Infinity;
    for (const e of enemies) {
      const d = Math.hypot(e.pos.x - k.pos.x, e.pos.z - k.pos.z) + Math.abs(e.pos.y - k.pos.y) * 3;
      let s = d - (e.id === this.lastAttacker && g.time - (this.lastHitAt || -99) < 6 ? 25 : 0) - (e.id === g.leaderId ? 8 : 0) + (e.invuln > 0 ? 40 : 0) - (e === this.target ? 10 : 0);
      if (s < bs) { bs = s; best = e; }
    }
    this.target = best;
    const needBox = !k.weapon && k.roll <= 0;
    if (needBox) {
      let bb = null, bd = Infinity;
      for (const b of g.boxes) {
        if (!b.active) continue;
        const d = Math.hypot(b.pos.x - k.pos.x, b.pos.z - k.pos.z) + Math.abs(b.pos.y - 1.25 - k.pos.y) * 6;
        if (d < bd) { bd = d; bb = b; }
      }
      if (bb && (!best || bd < 60 || Math.hypot(best.pos.x - k.pos.x, best.pos.z - k.pos.z) > 25)) { this.setGoal(bb.pos, 'box'); return; }
    }
    if (k.weapon === 'mine' || k.weapon === 'shield' && !best) {
      // poser des mines en roulant : on erre vers des boîtes / points éloignés
      if (!this.wander || Math.hypot(this.wander.x - k.pos.x, this.wander.z - k.pos.z) < 8) {
        const n = g.map.nodes[Math.floor(Math.random() * g.map.nodes.length)];
        this.wander = { x: n.x, y: n.y, z: n.z };
      }
      this.setGoal(this.wander, 'wander'); return;
    }
    if (best) this.setGoal(best.pos, 'kart');
  }

  setGoal(p, kind) {
    const changed = !this.goal || kind !== this.goalKind || Math.hypot(p.x - this.goal.x, p.z - this.goal.z) > 6;
    this.goal = { x: p.x, y: p.y, z: p.z }; this.goalKind = kind;
    if (changed) this.replan = 0;
  }

  decideFire(dt, out) {
    const k = this.k, g = this.g, w = k.weapon;
    if (!w || k.roll > 0) { this.fireWant = 0; return; }
    this.holdTime += dt;
    const t = this.target;
    let want = false;
    if (t && !t.dead) {
      const dx = t.pos.x - k.pos.x, dz = t.pos.z - k.pos.z, d = Math.hypot(dx, dz);
      const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - k.yaw)) * 180 / Math.PI;
      const dy = Math.abs(t.pos.y - k.pos.y);
      const clear = d < 6 || g.map.rayDistance({ x: k.pos.x, y: k.pos.y + 1, z: k.pos.z }, { x: dx / d, y: (t.pos.y - k.pos.y) / d, z: dz / d }, d) >= d - 1;
      switch (w) {
        case 'minigun': want = ang < 20 && d < 55 && clear; break;
        case 'cannon': want = ang < 12 && d > 8 && d < 60 && clear; break;
        case 'fireball': want = ang < 14 && d < 45 && dy < 2 && clear; break;
        case 'rocket': want = ang < 45 && d < 90; break;
        case 'laser': want = ang < 6 && d < 100 && clear; break;
        case 'shock': want = d < 9 && dy < 3; break;
        case 'mine': want = ang > 130 && d < 25; break;
        case 'turbo': want = ang < 20 && d > 25 && k.grounded; break;
        case 'shield': want = d < 22 || k.hp < 50; break;
      }
    }
    if (w === 'mine' && this.holdTime > 5) want = Math.random() < dt * 0.8;
    if (w === 'turbo' && this.holdTime > 6) want = k.grounded;
    if (w === 'shield' && k.hp < 60 && g.time - (this.lastHitAt || -99) < 1) want = true;
    if (want) this.fireWant += dt; else this.fireWant = Math.max(0, this.fireWant - dt * 2);
    if (this.fireWant > this.d.react && Math.random() < this.d.accuracy + 0.2) {
      out.fire = true; out.firePressed = true;
    }
  }

  get aimError() { return this.d.aim; }
  resetHold() { this.holdTime = 0; }
}
