// Armes : définitions, icônes SVG, création des tirs (côté propriétaire du kart) et projectiles.
import * as THREE from 'three';
import { G, toon } from './characters.js';

export const WEAPONS = {
  minigun: { name: 'Minigun', ammo: 32, color: '#ffd23f', weight: 15, cd: 0.07, auto: true },
  cannon: { name: 'Canon', ammo: 3, color: '#5a5a70', weight: 13, cd: 0.55 },
  fireball: { name: 'Boule de feu', ammo: 3, color: '#ff6a1a', weight: 13, cd: 0.4 },
  rocket: { name: 'Roquettes', ammo: 2, color: '#ff3b5c', weight: 11, cd: 0.6 },
  mine: { name: 'Mines', ammo: 3, color: '#9b5cff', weight: 11, cd: 0.35 },
  laser: { name: 'Laser', ammo: 2, color: '#33e1ff', weight: 9, cd: 0.8 },
  shock: { name: 'Onde de choc', ammo: 1, color: '#ffe14d', weight: 8, cd: 0.5 },
  shield: { name: 'Bouclier', ammo: 1, color: '#4dffb8', weight: 8, cd: 0.5 },
  turbo: { name: 'Turbo', ammo: 3, color: '#ff8a00', weight: 8, cd: 0.6 },
};
export const WEAPON_IDS = Object.keys(WEAPONS);

export const DMG = { bullet: 5, cannon: 45, fireball: 32, rocket: 55, mine: 60, laser: 70, shock: 50, shieldBump: 22 };
export const BLAST = { cannon: 5.5, rocket: 5, mine: 4.8 };

export function rollWeapon(rng = Math.random) {
  const total = WEAPON_IDS.reduce((a, k) => a + WEAPONS[k].weight, 0);
  let t = rng() * total;
  for (const k of WEAPON_IDS) { t -= WEAPONS[k].weight; if (t <= 0) return k; }
  return WEAPON_IDS[0];
}

// ------------------------------------------------------------------ icônes
const O = 'stroke="#1b1440" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"';
const SVG = {
  minigun: `<rect x="6" y="22" width="30" height="20" rx="5" fill="#8d93a8" ${O}/><rect x="34" y="20" width="24" height="7" rx="3" fill="#c9cfdb" ${O}/><rect x="34" y="28.5" width="26" height="7" rx="3" fill="#c9cfdb" ${O}/><rect x="34" y="37" width="24" height="7" rx="3" fill="#c9cfdb" ${O}/><rect x="12" y="40" width="10" height="14" rx="3" fill="#ffd23f" ${O}/><circle cx="20" cy="32" r="4" fill="#ffd23f" ${O}/>`,
  cannon: `<path d="M8 30 L44 18 Q54 16 56 26 Q58 36 48 38 L12 44 Z" fill="#4a4a5e" ${O}/><circle cx="22" cy="44" r="11" fill="#b5703a" ${O}/><circle cx="22" cy="44" r="3.5" fill="#ffd23f" ${O}/><path d="M56 22 l5 -5 M57 28 l6 0" ${O} fill="none"/>`,
  fireball: `<path d="M34 6 Q44 18 40 24 Q52 18 50 8 Q62 22 58 38 Q54 56 34 58 Q12 58 8 40 Q6 28 16 20 Q16 30 22 32 Q20 16 34 6 Z" fill="#ff6a1a" ${O}/><path d="M34 26 Q42 34 40 42 Q38 50 32 50 Q24 50 24 42 Q24 36 30 34 Q30 30 34 26 Z" fill="#ffe14d"/>`,
  rocket: `<path d="M44 8 Q58 6 56 20 L30 46 L18 34 Z" fill="#f2f4ff" ${O}/><path d="M44 8 Q58 6 56 20 L50 26 L38 14 Z" fill="#ff3b5c" ${O}/><path d="M20 36 L8 36 L16 26 L26 26 Z M28 44 L28 56 L38 48 L38 38 Z" fill="#ff3b5c" ${O}/><path d="M18 46 Q10 50 6 58 Q14 54 18 46 Z" fill="#ffb12e" ${O}/><circle cx="42" cy="22" r="4" fill="#5cc8ff" ${O}/>`,
  mine: `<path d="M10 46 Q10 22 32 22 Q54 22 54 46 Z" fill="#7b5cff" ${O}/><rect x="6" y="44" width="52" height="8" rx="4" fill="#4a3a8a" ${O}/><path d="M32 22 L32 12 M16 30 L10 24 M48 30 L54 24" ${O} fill="none"/><circle cx="32" cy="34" r="5" fill="#ff3b5c" ${O}/>`,
  laser: `<path d="M6 40 L30 30 L26 40 L58 20 L36 44 L40 34 Z" fill="#33e1ff" ${O}/><circle cx="12" cy="44" r="7" fill="#ffffff" ${O}/>`,
  shock: `<circle cx="32" cy="32" r="8" fill="#ffe14d" ${O}/><circle cx="32" cy="32" r="17" fill="none" ${O}/><circle cx="32" cy="32" r="26" fill="none" ${O} stroke-dasharray="7 6"/>`,
  shield: `<path d="M32 6 L54 14 Q54 42 32 58 Q10 42 10 14 Z" fill="#4dffb8" ${O}/><path d="M32 14 L46 19 Q46 38 32 49 Z" fill="#b8fff0"/>`,
  turbo: `<path d="M10 20 L26 32 L10 44 L18 44 L34 32 L18 20 Z" fill="#ffb12e" ${O}/><path d="M28 20 L44 32 L28 44 L36 44 L52 32 L36 20 Z" fill="#ff6a1a" ${O}/>`,
};
export const ICONS = Object.fromEntries(Object.entries(SVG).map(([k, v]) => [k, 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${v}</svg>`)]));

// ------------------------------------------------------------------ création des tirs (propriétaire)
const tmp = new THREE.Vector3();
export function createShot(game, kart, w, aimErr = 0) {
  const fx = Math.sin(kart.yaw), fz = Math.cos(kart.yaw);
  const fs = Math.max(0, kart.vel.x * fx + kart.vel.z * fz);
  const ox = kart.pos.x + fx * 1.9, oy = kart.pos.y + 1.0, oz = kart.pos.z + fz * 1.9;
  const id = () => game.newProjId();
  const aimDir = (cone, range, speed) => {
    const t = game.findAimTarget(kart, cone, range);
    let dx = fx, dz = fz, dy = 0;
    if (t) {
      const d = Math.hypot(t.pos.x - ox, t.pos.z - oz), lead = d / speed;
      const tx = t.pos.x + t.vel.x * lead * 0.8, tz = t.pos.z + t.vel.z * lead * 0.8;
      const l = Math.hypot(tx - ox, tz - oz) || 1; dx = (tx - ox) / l; dz = (tz - oz) / l;
      dy = (t.pos.y + 0.8 - oy) / Math.max(1, d);
    }
    if (aimErr) { const a = (Math.random() - 0.5) * 2 * aimErr, c = Math.cos(a), s = Math.sin(a); [dx, dz] = [dx * c + dz * s, -dx * s + dz * c]; }
    return { dx, dz, dy: Math.max(-0.3, Math.min(0.3, dy)), t };
  };
  const ev = { k: kart.id, w, s: [] };
  switch (w) {
    case 'minigun': {
      const a = aimDir(16, 70, 120), sp = 0.035, j = (Math.random() - 0.5) * sp * 2;
      const dx = a.dx * Math.cos(j) + a.dz * Math.sin(j), dz = -a.dx * Math.sin(j) + a.dz * Math.cos(j);
      const side = (game.time * 30 | 0) % 2 ? 0.35 : -0.35;
      ev.s.push({ id: id(), ty: 'bullet', x: ox - fz * side, y: oy, z: oz + fx * side, vx: dx * 120 + fx * fs, vy: a.dy * 120 + (Math.random() - 0.5) * 2, vz: dz * 120 + fz * fs });
      break;
    }
    case 'cannon': {
      const a = aimDir(12, 70, 72);
      let vy = 6;
      if (a.t) { const d = Math.hypot(a.t.pos.x - ox, a.t.pos.z - oz), t = d / 72; vy = Math.max(1, Math.min(14, (a.t.pos.y + 0.8 - oy + 0.5 * 20 * t * t) / t)); }
      ev.s.push({ id: id(), ty: 'cannon', x: ox, y: oy + 0.2, z: oz, vx: a.dx * 72 + fx * fs * 0.5, vy, vz: a.dz * 72 + fz * fs * 0.5 });
      break;
    }
    case 'fireball': {
      const a = aimDir(14, 55, 50);
      ev.s.push({ id: id(), ty: 'fireball', x: ox, y: oy, z: oz, vx: a.dx * 50 + fx * fs * 0.5, vy: 4, vz: a.dz * 50 + fz * fs * 0.5 });
      break;
    }
    case 'rocket': {
      const a = aimDir(45, 100, 60);
      ev.s.push({ id: id(), ty: 'rocket', x: ox, y: oy + 0.3, z: oz, vx: a.dx * 40 + fx * fs, vy: 3, vz: a.dz * 40 + fz * fs, tg: a.t ? a.t.id : -1 });
      break;
    }
    case 'mine': {
      ev.s.push({ id: id(), ty: 'mine', x: kart.pos.x - fx * 2.2, y: kart.pos.y + 0.9, z: kart.pos.z - fz * 2.2, vx: -fx * 5 + kart.vel.x * 0.2, vy: 4, vz: -fz * 5 + kart.vel.z * 0.2 });
      break;
    }
    case 'laser': {
      const a = aimDir(8, 120, 1e4);
      const l = Math.hypot(a.dx, a.dy, a.dz);
      ev.s.push({ id: id(), ty: 'laser', x: ox, y: oy, z: oz, vx: a.dx / l, vy: a.dy / l, vz: a.dz / l });
      break;
    }
    // shock, shield, turbo : effet immédiat sans projectile
  }
  return ev;
}

// ------------------------------------------------------------------ projectiles
const bulletMat = new THREE.MeshBasicMaterial({ color: '#ffe680', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const fireMat = new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
const fireCore = new THREE.MeshBasicMaterial({ color: '#fff0a0' });
const mineLight = new THREE.MeshBasicMaterial({ color: '#ff2a4a' });
const bulletGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.8, 6); bulletGeo.rotateX(Math.PI / 2);

function makeMesh(ty) {
  const g = new THREE.Group();
  switch (ty) {
    case 'bullet': g.add(new THREE.Mesh(bulletGeo, bulletMat)); break;
    case 'cannon': {
      const b = new THREE.Mesh(G.sph, toon('#2e2e3c')); b.scale.setScalar(0.6); g.add(b);
      const hl = new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({ color: '#ffffff' })); hl.scale.setScalar(0.14); hl.position.set(0.25, 0.3, 0.25); g.add(hl);
      break;
    }
    case 'fireball': {
      const o = new THREE.Mesh(G.sphLo, fireMat); o.scale.setScalar(0.85); g.add(o);
      const c = new THREE.Mesh(G.sph, fireCore); c.scale.setScalar(0.45); g.add(c);
      break;
    }
    case 'rocket': {
      const inner = new THREE.Group(); g.add(inner);
      const body = new THREE.Mesh(G.cyl, toon('#f2f4ff')); body.scale.set(0.22, 1.2, 0.22); body.rotation.x = Math.PI / 2; inner.add(body);
      const nose = new THREE.Mesh(G.cone, toon('#ff3b5c')); nose.scale.set(0.22, 0.5, 0.22); nose.rotation.x = Math.PI / 2; nose.position.z = 0.85; inner.add(nose);
      for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(G.box, toon('#ff3b5c')); f.scale.set(0.05, 0.5, 0.4); f.position.z = -0.5; f.rotation.z = i * Math.PI / 2; f.position.x = Math.sin(i * Math.PI / 2) * 0.22; f.position.y = Math.cos(i * Math.PI / 2) * 0.22; f.rotation.z = -i * Math.PI / 2; inner.add(f); }
      break;
    }
    case 'mine': {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon('#7b5cff')); g.add(d);
      const base = new THREE.Mesh(G.cyl, toon('#3d2f7a')); base.scale.set(0.95, 0.18, 0.95); g.add(base);
      for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(G.cone, toon('#c9cfdb')); s.scale.set(0.12, 0.35, 0.12); const a = i / 6 * Math.PI * 2; s.position.set(Math.sin(a) * 0.55, 0.5, Math.cos(a) * 0.55); s.lookAt(Math.sin(a) * 2, 1.4, Math.cos(a) * 2); s.rotateX(Math.PI / 2); g.add(s); }
      const l = new THREE.Mesh(G.sph, mineLight); l.scale.setScalar(0.2); l.position.y = 0.78; g.add(l); g.userData.light = l;
      break;
    }
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = ty !== 'bullet'; });
  return g;
}

export class Projectile {
  constructor(game, spec, ownerId) {
    this.game = game; this.id = spec.id; this.type = spec.ty; this.owner = ownerId;
    this.pos = new THREE.Vector3(spec.x, spec.y, spec.z);
    this.vel = new THREE.Vector3(spec.vx, spec.vy, spec.vz);
    this.target = spec.tg ?? -1;
    this.age = 0; this.bounces = 0; this.dead = false; this.grounded = false;
    this.life = { bullet: 0.7, cannon: 3, fireball: 3.6, rocket: 4.5, mine: 35 }[this.type] || 3;
    this.radius = { bullet: 0.5, cannon: 0.9, fireball: 1.0, rocket: 0.8, mine: 2.6 }[this.type] || 1;
    this.mesh = makeMesh(this.type);
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
  }

  update(dt) {
    const g = this.game, map = g.map, fx = g.fx;
    this.age += dt;
    if (this.age > this.life) return 'expire';
    const p = this.pos, v = this.vel;
    switch (this.type) {
      case 'bullet':
        p.addScaledVector(v, dt);
        if (map.pointBlocked(p.x, p.y, p.z)) return 'world';
        break;
      case 'cannon':
        v.y -= 20 * dt; p.addScaledVector(v, dt);
        if (Math.random() < 0.7) fx.alpha.spawn(p.x, p.y, p.z, 0, 0.5, 0, 0.5, 0.5, 1.2, '#d8d2e8', 0.5, 0, 0);
        if (map.pointBlocked(p.x, p.y - 0.5, p.z)) return 'world';
        break;
      case 'fireball': {
        v.y -= 30 * dt; p.addScaledVector(v, dt);
        const h = map.groundHeight(p.x, p.z, p.y + 0.5);
        if (p.y - 0.8 < h) {
          p.y = h + 0.8; v.y = 10; this.bounces++;
          fx.burst(new THREE.Vector3(p.x, h + 0.2, p.z), '#ff9a1a', 6, 5);
        }
        const n = map.collide(p, 0.8, p.y - 0.8);
        if (n) { const vn = v.x * n.nx + v.z * n.nz; if (vn < 0) { v.x -= 2 * vn * n.nx; v.z -= 2 * vn * n.nz; } this.bounces++; }
        if (this.bounces > 9) return 'expire';
        for (let i = 0; i < 2; i++) fx.add.spawn(p.x + (Math.random() - 0.5) * 0.6, p.y + (Math.random() - 0.5) * 0.6, p.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, 0.35, 1.0, 0.2, Math.random() < 0.5 ? '#ff6a1a' : '#ffd23f', 0.9, 1, 0);
        this.mesh.rotation.x += dt * 10;
        break;
      }
      case 'rocket': {
        const sp = Math.min(72, v.length() + 50 * dt);
        const t = g.kartById.get(this.target);
        const dir = v.clone().setY(0).normalize();
        if (t && !t.dead && this.age > 0.12) {
          const want = new THREE.Vector3(t.pos.x - p.x, 0, t.pos.z - p.z).normalize();
          const cross = dir.x * want.z - dir.z * want.x, dot = dir.dot(want);
          const ang = Math.atan2(cross, dot), maxTurn = 3.2 * dt;
          const a = Math.max(-maxTurn, Math.min(maxTurn, ang));
          const c = Math.cos(a), s = Math.sin(a);
          dir.set(dir.x * c - dir.z * s, 0, dir.x * s + dir.z * c);
        }
        const groundY = map.groundHeight(p.x, p.z, p.y + 0.5);
        const targetY = (t && !t.dead ? Math.max(groundY, t.pos.y) : groundY) + 1.1;
        v.set(dir.x * sp, (targetY - p.y) * 6, dir.z * sp);
        p.addScaledVector(v, dt);
        this.mesh.lookAt(p.x + v.x, p.y + v.y * 0.2, p.z + v.z);
        fx.add.spawn(p.x - dir.x, p.y, p.z - dir.z, -dir.x * 4, 0, -dir.z * 4, 0.18, 0.9, 0.2, '#ffb12e', 1, 0, 0);
        fx.alpha.spawn(p.x - dir.x * 1.3, p.y, p.z - dir.z * 1.3, (Math.random() - 0.5), 1, (Math.random() - 0.5), 0.9, 0.5, 1.6, '#eeeaf6', 0.6, 0.5, -0.5);
        if (map.pointBlocked(p.x + dir.x * 0.8, p.y, p.z + dir.z * 0.8)) return 'world';
        break;
      }
      case 'mine': {
        if (!this.grounded) {
          v.y -= 30 * dt; p.addScaledVector(v, dt);
          map.collide(p, 0.8, p.y);
          const h = map.groundHeight(p.x, p.z, p.y + 0.5);
          if (p.y <= h) { p.y = h; this.grounded = true; v.set(0, 0, 0); fx.burst(p.clone(), '#c9b0ff', 8, 4); }
        }
        const l = this.mesh.userData.light;
        l.visible = this.age < 0.6 || Math.floor(this.age * (this.age > 30 ? 10 : 3)) % 2 === 0;
        break;
      }
    }
    this.mesh.position.copy(p);
    if (this.type === 'bullet') this.mesh.lookAt(p.x + v.x, p.y + v.y, p.z + v.z);
    return null;
  }

  dispose() { this.game.scene.remove(this.mesh); }
}
