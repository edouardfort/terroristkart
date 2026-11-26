// Partie en cours : simulation, événements (locaux ou réseau), logique d'autorité de l'hôte, caméras et rendu split-screen.
import * as THREE from 'three';
import { GameMap } from './map.js';
import { Kart, KART_R, MAX_HP, wrapAngle } from './kart.js';
import { FX } from './fx.js';
import { WEAPONS, DMG, BLAST, Projectile, createShot, rollWeapon } from './weapons.js';
import { Bot } from './bot.js';
import { PlayerControl } from './input.js';
import { HUD } from './hud.js';
import { charById, paintById } from './characters.js';
import { canvasTex } from './map.js';

const STEP = 1 / 120;
const SEND_RATE = 1 / 30;
const RESPAWN_DELAY = 2.6;
const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;
const tmpV = new THREE.Vector3();

let boxTex = null;
function itemBoxTexture() {
  if (boxTex) return boxTex;
  boxTex = canvasTex(128, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 128, 128);
    g.addColorStop(0, '#ff5cc8'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#5ce1ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 118, 118);
    ctx.font = '900 92px "Lilita One", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 9; ctx.strokeStyle = '#3a1a7a'; ctx.strokeText('?', 64, 70); ctx.fillStyle = '#ffffff'; ctx.fillText('?', 64, 70);
  });
  return boxTex;
}

export class Game {
  constructor(o) {
    Object.assign(this, { renderer: o.renderer, audio: o.audio, input: o.input, net: o.net || null, onEnd: o.onEnd, onQuit: o.onQuit });
    this.settings = o.settings;
    this.isHost = o.isHost !== false;
    this.myPeer = o.myPeer || 'host';
    this.peerTag = o.peerTag || 'h';
    this.projCounter = 0;
    this.time = 0; this.acc = 0; this.sendAcc = 0;
    this.timeLeft = this.settings.duration;
    this.state = 'countdown'; this.countT = 4.2; this.lastCount = 99;
    this.paused = false;
    this.leaderId = -1; this.firstBlood = false;

    // Scène
    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#ffe0f2', 200, 620);
    const hemi = new THREE.HemisphereLight('#e8f6ff', '#c2a6ff', 1.35); scene.add(hemi);
    const sun = this.sun = new THREE.DirectionalLight('#fff6e8', 2.1);
    sun.position.set(70, 130, 45); sun.target.position.set(0, 0, 0); scene.add(sun, sun.target);
    const hq = this.settings.quality !== 'low';
    sun.castShadow = hq;
    if (hq) {
      const s = sun.shadow; s.mapSize.set(this.settings.quality === 'high' ? 4096 : 2048, this.settings.quality === 'high' ? 4096 : 2048);
      Object.assign(s.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 10, far: 400 });
      s.camera.updateProjectionMatrix(); s.bias = -0.0006; s.normalBias = 0.04; s.radius = 2;
    }
    this.map = new GameMap(scene, this.settings.quality);
    this.fx = new FX(scene);

    // Karts
    this.karts = []; this.kartById = new Map();
    for (const r of o.roster) this.addKart(r);
    this.bots = new Map();
    for (const k of this.karts) if (k.isBot && k.isLocal) this.bots.set(k.id, new Bot(this, k, this.settings.difficulty));

    // Boîtes d'armes
    this.boxes = this.map.itemSpots.map((p, i) => this.makeBox(p, i));
    this.projectiles = new Map();

    // Joueurs locaux
    this.hud = new HUD(o.hudRoot, this);
    this.locals = o.localPlayers.map((lp, idx) => {
      const kart = this.kartById.get(lp.id);
      const cam = new THREE.PerspectiveCamera(68, 1, 0.1, 2000);
      cam.layers.enable(0);
      for (let l = 1; l <= 4; l++) if (l !== idx + 1) cam.layers.enable(l);
      kart.setTagLayer(idx + 1);
      const p = { idx, kart, device: lp.device, control: new PlayerControl(this.input, lp.device), cam, inp: {}, cs: { yaw: kart.yaw, y: kart.pos.y + 14, fov: 68, trauma: 0, orbit: 0, intro: 1, look: false }, engine: this.audio.createEngine() };
      p.panel = this.hud.addPanel(p);
      return p;
    });
    this.overview = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
    this.resize();
    this.audio.music('race');
    this.audio.setIntense(false);
    this.hud.banner('CANDY ARENA', 'Fais un max d\'éliminations !');
  }

  addKart(r) {
    const k = new Kart(this, r);
    const sp = this.map.spawns[r.spawn % this.map.spawns.length];
    k.place(sp.x, sp.y, sp.z, sp.yaw);
    k.model.root.position.copy(k.pos); k.model.root.rotation.y = k.yaw;
    this.karts.push(k); this.kartById.set(k.id, k);
    return k;
  }

  makeBox(pos, i) {
    const g = new THREE.Group(); g.position.copy(pos);
    const mat = new THREE.MeshBasicMaterial({ map: itemBoxTexture(), transparent: true, opacity: 0.92 });
    const cube = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), mat); g.add(cube);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(core);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(cube.geometry), new THREE.LineBasicMaterial({ color: '#ffffff' })); cube.add(edges);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), new THREE.MeshBasicMaterial({ color: '#3a1a6a', transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(pos.x, pos.y - 1.2, pos.z);
    this.scene.add(g, shadow);
    return { i, pos: pos.clone(), active: true, respawnAt: 0, g, cube, core, shadow, pop: 1, phase: i * 0.7, pending: 0 };
  }

  newProjId() { return this.peerTag + (this.projCounter++); }

  // ------------------------------------------------------------------ événements
  emit(e) {
    this.apply(e);
    if (!this.net) return;
    if (this.isHost) this.net.broadcast({ t: 'ev', e });
    else this.net.toHost({ t: 'ev', e });
  }

  // requête au serveur (non appliquée localement chez un client)
  request(e) {
    if (this.isHost) this.handleRequest(e, this.myPeer);
    else this.net.toHost({ t: 'rq', e });
  }

  onNet(pid, m) {
    if (m.t === 'ev') {
      if (this.isHost) {
        // l'hôte valide : un client ne peut émettre que pour ses karts
        const k = this.kartById.get(m.e.k);
        if (m.e.t === 'fire' && (!k || k.owner !== pid)) return;
        if (m.e.t !== 'fire' && m.e.t !== 'hopfx') return;
        this.apply(m.e);
        this.net.broadcast(m, true, pid);
      } else this.apply(m.e);
    } else if (m.t === 'rq' && this.isHost) this.handleRequest(m.e, pid);
    else if (m.t === 'k' && this.isHost) {
      const now = performance.now();
      for (const a of m.k) { const k = this.kartById.get(a[0]); if (k && k.owner === pid) k.pushSnapshot(a, now); }
    } else if (m.t === 's' && !this.isHost) {
      const now = performance.now();
      for (const a of m.k) { const k = this.kartById.get(a[0]); if (k && !k.isLocal) k.pushSnapshot(a, now); }
      for (const [id, hp, kills, deaths, sh] of m.h) {
        const k = this.kartById.get(id); if (!k) continue;
        if (!k.dead) k.hp = hp; k.kills = kills; k.deaths = deaths;
        if (sh && k.shield <= 0) k.shield = 0.5;
      }
      this.timeLeft = m.tl;
      if (this.state === 'countdown' && m.st === 'play') this.startPlay();
    }
  }

  handleRequest(e, pid) {
    if (e.t === 'pick') {
      const k = this.kartById.get(e.k), b = this.boxes[e.i];
      if (!k || k.owner !== pid || !b || !b.active || k.dead) return;
      // l'hôte voit les karts distants avec un peu de retard : on accepte aussi la position annoncée par le client
      const seen = k.pos.distanceTo(b.pos);
      const told = Number.isFinite(e.x) ? Math.hypot(e.x - b.pos.x, e.y + 0.9 - b.pos.y, e.z - b.pos.z) : Infinity;
      if (Math.min(told < 3.5 && seen < 25 ? 0 : Infinity, seen) > 6.5) return;
      b.respawnAt = this.time + 4.5;
      this.emit({ t: 'box', i: e.i, on: 0, k: k.id });
      // l'état d'arme fait foi chez le propriétaire du kart (l'hôte ne voit pas toujours ses munitions à jour)
      const armed = k.isLocal ? (k.weapon || k.roll > 0) : !!e.armed;
      if (!armed) this.emit({ t: 'give', k: k.id, w: rollWeapon() });
    }
  }

  apply(e) {
    const K = id => this.kartById.get(id);
    switch (e.t) {
      case 'fire': {
        const k = K(e.k); if (!k) return;
        // copie distante : on suit aussi les munitions pour que tout le monde soit d'accord
        if (!k.isLocal && k.weapon === e.w) { k.ammo--; if (k.ammo <= 0) { k.weapon = null; k.ammo = 0; } }
        for (const s of e.s) {
          if (s.ty === 'laser') this.doLaser(k, s);
          else if (!this.projectiles.has(s.id)) this.projectiles.set(s.id, new Projectile(this, s, k.id));
        }
        const vol = this.volAt(k.pos, k);
        const W = WEAPONS[e.w];
        const mz = tmpV.set(k.pos.x + Math.sin(k.yaw) * 2, k.pos.y + 1, k.pos.z + Math.cos(k.yaw) * 2);
        if (e.w === 'minigun' || e.w === 'cannon' || e.w === 'fireball') this.fx.muzzle(mz, W.color);
        if (e.w === 'cannon') { this.fx.alpha.spawn(mz.x, mz.y, mz.z, Math.sin(k.yaw) * 4, 1, Math.cos(k.yaw) * 4, 0.6, 1, 2.6, '#ece6f8', 0.8, 2, 0); this.shakeFor(k, 0.25); }
        if (e.w === 'shield') { k.shield = 6; this.fx.ring(k.pos.clone().setY(k.pos.y + 0.3), 4, '#6fffd2', 0.4); }
        if (e.w === 'shock') {
          this.fx.shockwave(k.pos.clone(), 12); this.shakeNear(k.pos, 0.6, 20);
          if (this.isHost) this.areaDamage(k.pos.x, k.pos.y + 0.8, k.pos.z, 12, DMG.shock, k.id, 'shock', 26);
        }
        if (e.w === 'turbo') {
          if (k.isLocal) { k.boost = Math.max(k.boost, 1.5); const f = k.forward; k.vel.x += f.x * 10; k.vel.z += f.z * 10; }
          this.fx.ring(k.pos.clone().setY(k.pos.y + 0.5), 3, '#ffb12e', 0.3);
        }
        this.audio.play(e.w, vol);
        break;
      }
      case 'boom': {
        const p = this.projectiles.get(e.id);
        if (p) { this.boomFx(p.type, new THREE.Vector3(e.x, e.y, e.z), e.r); this.removeProj(p); }
        break;
      }
      case 'dmg': {
        const v = K(e.v), a = K(e.a); if (!v) return;
        const at = this.locals.find(l => l.kart === a), vl = this.locals.find(l => l.kart === v);
        if (e.blocked) {
          this.fx.burst(v.pos.clone().setY(v.pos.y + 1), '#6fffd2', 10, 8);
          if (at) this.hud.floater(at, v.pos, 'BLOQUÉ', 'blocked');
          this.audio.play('block', this.volAt(v.pos));
          return;
        }
        v.hp = e.hp; v.flash = 0.3;
        if (v.isLocal && (e.kx || e.ky || e.kz || e.sp)) v.knock(e.kx || 0, e.ky || 0, e.kz || 0, !!e.sp);
        const bot = this.bots.get(v.id); if (bot) bot.onHit(e.a);
        this.fx.burst(v.pos.clone().setY(v.pos.y + 1), e.w === 'minigun' ? '#ffe680' : '#ffffff', e.w === 'minigun' ? 4 : 14, 8);
        if (at && at !== vl) { this.hud.hitmarker(at, e.n >= 30); this.hud.floater(at, v.pos, '-' + e.n, e.n >= 30 ? 'big' : ''); this.audio.play('hitmarker', 0.8); }
        if (vl) {
          this.hud.hurt(vl, e.n); vl.cs.trauma = Math.min(1, vl.cs.trauma + (e.n >= 30 ? 0.7 : 0.15));
          this.input.rumble(vl.device, e.n >= 30 ? 1 : 0.3, 0.6, e.n >= 30 ? 300 : 80);
          this.audio.play('hit', 0.9);
        } else if (e.n >= 30) this.audio.play('hit', this.volAt(v.pos) * 0.6);
        break;
      }
      case 'kill': this.onKill(K(e.v), K(e.a), e.w); break;
      case 'respawn': {
        const k = K(e.k); if (!k) return;
        k.dead = false; k.hp = MAX_HP; k.invuln = 2.5; k.shield = 0; k.weapon = null; k.roll = 0; k.flash = 0;
        k.place(e.x, e.y, e.z, e.yaw);
        this.fx.ring(k.pos.clone().setY(k.pos.y + 0.2), 5, '#ffffff', 0.5);
        this.fx.burst(k.pos.clone().setY(k.pos.y + 1), '#ffe14d', 24, 10);
        const lp = this.locals.find(l => l.kart === k);
        if (lp) { lp.cs.yaw = k.yaw; lp.cs.y = k.pos.y + 3; this.hud.announce(lp, 'C\'EST REPARTI !', '', 'go'); }
        break;
      }
      case 'box': {
        const b = this.boxes[e.i]; if (!b) return;
        b.active = !!e.on; b.pending = 0;
        if (!e.on) { this.fx.pickup(b.pos); this.audio.play('pickup', this.volAt(b.pos)); }
        else b.pop = 0;
        break;
      }
      case 'give': {
        const k = K(e.k); if (!k) return;
        k.roll = 1.0; k.rollW = e.w; k.weapon = null; k.ammo = 0;
        const lp = this.locals.find(l => l.kart === k);
        if (lp) this.hud.rollStart(lp);
        break;
      }
      case 'leave': {
        for (const id of e.ids) { const k = K(id); if (k) { this.fx.explosion(k.pos.clone().setY(k.pos.y + 1), 3); k.dispose(); this.karts = this.karts.filter(x => x !== k); this.kartById.delete(id); } }
        if (e.name) this.hud.feedText(`${e.name} a quitté la partie`);
        break;
      }
      case 'end': this.finish(e.res); break;
      case 'go': this.startPlay(); break;
    }
  }

  onKill(v, a, w) {
    if (!v) return;
    v.dead = true; v.hp = 0; v.deaths++; v.streak = 0; v.weapon = null; v.roll = 0; v.shield = 0; v.drift = 0;
    v.deathPos = v.pos.clone();
    const p = v.paint;
    this.fx.explosion(v.pos.clone().setY(v.pos.y + 1), 5, { debris: [p.main, p.accent, '#2c2d3a', charById(v.charId).fur] });
    this.fx.confetti(v.pos.clone().setY(v.pos.y + 1), 30);
    this.shakeNear(v.pos, 0.7, 30);
    this.audio.play('explosion', this.volAt(v.pos), 1.3);
    this.map.cheer = 1.4;
    const vl = this.locals.find(l => l.kart === v);
    if (vl) { vl.cs.trauma = 1; this.hud.announce(vl, a && a !== v ? `ÉLIMINÉ PAR ${a.name.toUpperCase()}` : 'ÉLIMINÉ', 'Réapparition…', 'dead'); this.audio.play('death', 0.7); this.input.rumble(vl.device, 1, 1, 450); }
    if (a && a !== v) {
      a.kills++; a.streak++;
      a.multi = this.time - a.lastKill < 4.5 ? a.multi + 1 : 1; a.lastKill = this.time;
      const al = this.locals.find(l => l.kart === a);
      if (al) {
        let title = `TU AS ÉLIMINÉ ${v.name.toUpperCase()}`, sub = '+1 KILL';
        if (!this.firstBlood) sub = 'PREMIER SANG !';
        if (a.multi === 2) sub = 'DOUBLE KILL !'; else if (a.multi === 3) sub = 'TRIPLE KILL !'; else if (a.multi >= 4) sub = 'CARNAGE !!!';
        else if (a.streak === 3) sub = 'SÉRIE DE 3 !'; else if (a.streak === 5) sub = 'INARRÊTABLE !'; else if (a.streak >= 7 && a.streak % 2) sub = 'LÉGENDAIRE !';
        this.hud.announce(al, title, sub, 'kill');
        this.audio.play(a.multi >= 2 || a.streak >= 3 ? 'streak' : 'kill', 0.9);
      }
      this.firstBlood = true;
    }
    this.hud.killfeed(a, v, w);
    if (this.isHost) v.respawnAt = this.time + RESPAWN_DELAY;
    this.updateLeader();
  }

  updateLeader() {
    let best = null, bk = 0, tie = false;
    for (const k of this.karts) { if (k.kills > bk) { bk = k.kills; best = k; tie = false; } else if (k.kills === bk && bk > 0) tie = true; }
    this.leaderId = best && !tie ? best.id : -1;
    for (const k of this.karts) k.crown.visible = k.id === this.leaderId;
  }

  boomFx(type, pos, r) {
    if (type === 'bullet') { this.fx.burst(pos, '#ffe680', 6, 7, 0.35); return; }
    if (type === 'fireball') { this.fx.explosion(pos, 2.4, { color: '#ff6a1a' }); this.audio.play('explosion', this.volAt(pos) * 0.6, 0.6); return; }
    const rad = r || BLAST[type] || 4;
    this.fx.explosion(pos, rad * 0.8, { color: type === 'mine' ? '#c86bff' : '#ff8a1f', ring: type === 'mine' ? '#e0c8ff' : undefined });
    this.audio.play('explosion', this.volAt(pos), 1);
    this.shakeNear(pos, 0.55, rad * 4);
  }

  removeProj(p) { p.dispose(); this.projectiles.delete(p.id); }

  // ------------------------------------------------------------------ autorité de l'hôte
  damage(v, n, attackerId, w, kn = {}) {
    if (!v || v.dead || v.invuln > 0 || this.state !== 'play') return;
    if (v.shield > 0) { this.emit({ t: 'dmg', v: v.id, a: attackerId, n: 0, w, blocked: 1 }); return; }
    const hp = Math.max(0, v.hp - n);
    const r = x => Math.round((x || 0) * 10) / 10;
    this.emit({ t: 'dmg', v: v.id, a: attackerId, n, w, hp, kx: r(kn.kx), ky: r(kn.ky), kz: r(kn.kz), sp: kn.spin ? 1 : 0 });
    if (hp <= 0) this.emit({ t: 'kill', v: v.id, a: attackerId, w });
  }

  areaDamage(x, y, z, r, maxD, attackerId, w, knock) {
    for (const k of this.karts) {
      if (k.dead || k.id === attackerId) continue;
      const dx = k.pos.x - x, dy = k.pos.y + 0.8 - y, dz = k.pos.z - z, d = Math.hypot(dx, dy, dz);
      if (d > r + KART_R) continue;
      const f = d < r * 0.35 ? 1 : Math.max(0, 1 - (d - r * 0.35) / (r * 0.65 + KART_R));
      const dmg = Math.round(maxD * (0.35 + 0.65 * f));
      const l = Math.hypot(dx, dz) || 1;
      this.damage(k, dmg, attackerId, w, { kx: dx / l * knock * (0.5 + f * 0.5), ky: 8 + 6 * f, kz: dz / l * knock * (0.5 + f * 0.5), spin: true });
    }
  }

  hostExplode(p, pos) {
    const r = BLAST[p.type] || 4;
    this.areaDamage(pos.x, pos.y, pos.z, r, DMG[p.type], p.owner, p.type, 16);
    this.emit({ t: 'boom', id: p.id, x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), r });
  }

  hostStep(h) {
    for (const p of [...this.projectiles.values()]) {
      if (p.type === 'mine') {
        if (!p.grounded || p.age < 0.6) continue;
        for (const k of this.karts) {
          if (k.dead || (k.id === p.owner && p.age < 3)) continue;
          if (Math.hypot(k.pos.x - p.pos.x, k.pos.z - p.pos.z) < p.radius && Math.abs(k.pos.y - p.pos.y) < 2) { this.hostExplode(p, p.pos.clone().setY(p.pos.y + 0.6)); break; }
        }
        continue;
      }
      for (const k of this.karts) {
        if (k.dead || k.id === p.owner) continue;
        const d = Math.hypot(k.pos.x - p.pos.x, k.pos.y + 0.8 - p.pos.y, k.pos.z - p.pos.z);
        if (d > 1.45 + p.radius * 0.6) continue;
        if (p.type === 'bullet') {
          const l = p.vel.length() || 1;
          this.damage(k, DMG.bullet, p.owner, 'minigun', { kx: p.vel.x / l * 1.5, kz: p.vel.z / l * 1.5 });
          this.emit({ t: 'boom', id: p.id, x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2) });
        } else if (p.type === 'fireball') {
          const l = Math.hypot(p.vel.x, p.vel.z) || 1;
          this.damage(k, DMG.fireball, p.owner, 'fireball', { kx: p.vel.x / l * 10, ky: 7, kz: p.vel.z / l * 10, spin: true });
          this.emit({ t: 'boom', id: p.id, x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2) });
        } else this.hostExplode(p, p.pos.clone());
        break;
      }
    }
    // Bouclier : percuter les autres fait mal
    for (const a of this.karts) {
      if (a.dead || a.shield <= 0) continue;
      for (const b of this.karts) {
        if (b === a || b.dead || b.shield > 0) continue;
        if (a.pos.distanceTo(b.pos) < KART_R * 2 + 0.6) {
          a.bumpCd = a.bumpCd || {};
          if ((a.bumpCd[b.id] || 0) > this.time) continue;
          a.bumpCd[b.id] = this.time + 1;
          const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, l = Math.hypot(dx, dz) || 1;
          this.damage(b, DMG.shieldBump, a.id, 'shield', { kx: dx / l * 18, ky: 7, kz: dz / l * 18, spin: true });
        }
      }
    }
    // Réapparitions
    for (const k of this.karts) if (k.dead && k.respawnAt && this.time >= k.respawnAt) {
      k.respawnAt = 0;
      const sp = this.pickSpawn(k);
      this.emit({ t: 'respawn', k: k.id, x: sp.x, y: sp.y, z: sp.z, yaw: sp.yaw });
    }
    // Boîtes
    for (const b of this.boxes) if (!b.active && this.time >= b.respawnAt) this.emit({ t: 'box', i: b.i, on: 1 });
    // Chrono
    if (this.state === 'play') {
      this.timeLeft -= h;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        const res = this.karts.map(k => ({ id: k.id, name: k.name, char: k.charId, paint: k.paintId, kills: k.kills, deaths: k.deaths, isBot: k.isBot, owner: k.owner }))
          .sort((x, y) => y.kills - x.kills || x.deaths - y.deaths);
        this.emit({ t: 'end', res });
      }
    }
  }

  pickSpawn(k) {
    let best = null, bd = -1;
    for (const s of this.map.spawns) {
      let md = Infinity;
      for (const o of this.karts) if (o !== k && !o.dead) md = Math.min(md, Math.hypot(o.pos.x - s.x, o.pos.z - s.z));
      md += Math.random() * 12;
      if (md > bd) { bd = md; best = s; }
    }
    return best;
  }

  doLaser(k, s) {
    const o = new THREE.Vector3(s.x, s.y, s.z), d = new THREE.Vector3(s.vx, s.vy, s.vz).normalize();
    let maxD = this.map.rayDistance(o, d, 130), hit = null;
    for (const t of this.karts) {
      if (t === k || t.dead) continue;
      const c = tmpV.set(t.pos.x, t.pos.y + 0.8, t.pos.z).sub(o);
      const along = c.dot(d);
      if (along < 0 || along > maxD) continue;
      const perp = c.addScaledVector(d, -along).length();
      if (perp < 1.7) { maxD = along; hit = t; }
    }
    const end = o.clone().addScaledVector(d, maxD);
    this.fx.beam(o, end, '#33e1ff');
    this.shakeFor(k, 0.2);
    if (hit && this.isHost) this.damage(hit, DMG.laser, k.id, 'laser', { kx: d.x * 14, ky: 6, kz: d.z * 14, spin: true });
  }

  findAimTarget(k, coneDeg, range) {
    let best = null, bs = Infinity;
    const cone = coneDeg * Math.PI / 180;
    for (const t of this.karts) {
      if (t === k || t.dead) continue;
      const dx = t.pos.x - k.pos.x, dz = t.pos.z - k.pos.z, d = Math.hypot(dx, dz);
      if (d > range || Math.abs(t.pos.y - k.pos.y) > 6) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - k.yaw));
      if (ang > cone) continue;
      const s = ang * 40 + d;
      if (s < bs) { bs = s; best = t; }
    }
    return best;
  }

  // ------------------------------------------------------------------ retours du kart (sons, fx)
  onKartEvent(k, type, val, n) {
    const vol = this.volAt(k.pos, k);
    const lp = this.locals.find(l => l.kart === k);
    switch (type) {
      case 'hop': this.audio.play('hop', vol * 0.6); break;
      case 'land':
        this.audio.play('land', vol, val);
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; this.fx.alpha.spawn(k.pos.x + Math.sin(a), k.pos.y + 0.2, k.pos.z + Math.cos(a), Math.sin(a) * 5, 1, Math.cos(a) * 5, 0.5, 0.8, 1.8, '#ffffff', 0.5, 3, 0); }
        if (lp && val > 14) { lp.cs.trauma = Math.min(1, lp.cs.trauma + 0.25); this.input.rumble(lp.device, 0.4, 0.2, 90); }
        break;
      case 'bump': {
        this.audio.play('boing', vol, Math.min(1, val / 30));
        const hit = n ? k.pos.clone().addScaledVector(new THREE.Vector3(-n.nx, 0, -n.nz), 1.3).setY(k.pos.y + 0.6) : k.pos.clone().setY(k.pos.y + 0.8);
        this.fx.burst(hit, '#ffe14d', 10, 7);
        this.fx.burst(hit, '#ff4d6d', 6, 5);
        if (val > 14) this.fx.ring(hit, 2.2, '#ffffff', 0.25);
        this.map.flashBumper && this.map.flashBumper(hit);
      }
        if (lp) { lp.cs.trauma = Math.min(1, lp.cs.trauma + 0.2); this.input.rumble(lp.device, 0.5, 0.3, 100); }
        break;
      case 'boostpad': this.audio.play('boostpad', vol); if (lp) this.hud.speedBurst(lp); break;
      case 'jumppad': this.audio.play('jumppad', vol); this.fx.burst(k.pos.clone().setY(k.pos.y + 0.5), '#ff9be0', 20, 10); break;
      case 'driftStart': break;
      case 'driftLevel': this.audio.play('drift', vol * 0.8, k.driftLevel); break;
      case 'miniturbo': this.audio.play('miniturbo', vol, val); if (lp) this.hud.speedBurst(lp); break;
    }
  }

  volAt(pos, src) {
    if (src && src.isLocal && !src.isBot && this.locals.some(l => l.kart === src)) return 1;
    let v = 0;
    for (const l of this.locals) { const d = l.kart.pos.distanceTo(pos); v = Math.max(v, Math.pow(Math.max(0, 1 - d / 95), 1.6)); }
    return v;
  }

  shakeNear(pos, amount, radius) {
    for (const l of this.locals) { const d = l.kart.pos.distanceTo(pos); if (d < radius) l.cs.trauma = Math.min(1, l.cs.trauma + amount * (1 - d / radius)); }
  }
  shakeFor(k, a) { const l = this.locals.find(x => x.kart === k); if (l) l.cs.trauma = Math.min(1, l.cs.trauma + a); }

  // ------------------------------------------------------------------ boucle
  startPlay() {
    if (this.state !== 'countdown') return;
    this.state = 'play'; this.countT = 0;
    this.hud.countdown('GO !', true);
    this.audio.play('go', 0.9);
    for (const l of this.locals) if (l.inp.throttle > 0.5) { l.kart.boost = 1.0; this.hud.announce(l, 'DÉPART TURBO !', '', 'go'); }
  }

  finish(res) {
    if (this.state === 'end') return;
    this.state = 'end'; this.endT = 0; this.results = res;
    this.hud.banner('TERMINÉ !', res[0] ? `${res[0].name} remporte la manche` : '');
    this.audio.play('win', 0.8); this.audio.setIntense(false);
    for (const k of this.karts) if (!k.dead) this.fx.confetti(k.pos.clone().setY(k.pos.y + 2), 40);
    this.map.cheer = 2;
  }

  update(dtRaw) {
    const dt = Math.min(dtRaw, 0.1);
    for (const l of this.locals) {
      l.inp = l.control.read();
      if (l.inp.pausePressed && !this.paused && this.state !== 'end') { this.onPause && this.onPause(); }
    }
    if (this.paused && !this.net) { this.render(); return; }

    // Compte à rebours
    if (this.state === 'countdown') {
      this.countT -= dt;
      const n = Math.ceil(this.countT);
      if (n <= 3 && n >= 1 && n !== this.lastCount) { this.lastCount = n; this.hud.countdown(String(n)); this.audio.play('count', 0.8); }
      if (this.countT <= 0 && this.isHost) { if (this.net) this.emit({ t: 'go' }); else this.startPlay(); }
    }
    if (this.state === 'end') { this.endT += dt; if (this.endT > 3.2 && !this.endCalled) { this.endCalled = true; this.onEnd(this.results); } }
    this.time += dt;

    // Entrées
    const play = this.state === 'play';
    const inputs = new Map();
    for (const l of this.locals) inputs.set(l.kart.id, play ? l.inp : { throttle: 0, steer: 0 });
    for (const [id, b] of this.bots) inputs.set(id, b.update(dt));

    // Tirs (une fois par image)
    if (play) for (const k of this.karts) if (k.isLocal) {
      const inp = inputs.get(k.id); if (inp) this.tryFire(k, inp, dt);
    }

    // Pas fixes
    this.acc += dt;
    let n = 0, first = true;
    while (this.acc >= STEP && n++ < 8) {
      this.fixedStep(STEP, inputs, first);
      first = false; this.acc -= STEP;
    }

    // Karts distants
    const now = performance.now();
    for (const k of this.karts) if (!k.isLocal) k.interpolate(now);
    for (const k of this.karts) {
      if (k.invuln > 0) k.invuln -= dt;
      if (k.shield > 0) k.shield -= dt;
      if (k.cool > 0) k.cool -= dt;
      if (k.roll > 0) {
        k.roll -= dt;
        if (k.roll <= 0) {
          k.weapon = k.rollW; k.ammo = WEAPONS[k.weapon].ammo; k.cool = 0.25;
          const lp = this.locals.find(l => l.kart === k); if (lp) { this.audio.play('item', 0.8); this.hud.rollEnd(lp); }
          const b = this.bots.get(k.id); if (b) b.resetHold();
        }
      }
    }

    // Visuels
    for (const k of this.karts) k.updateVisual(dt, this.time, this.fx);
    this.updateBoxes(dt);
    this.fx.update(dt);
    this.map.update(dt, this.time);
    for (const l of this.locals) this.updateCamera(l, dt);
    for (const l of this.locals) if (l.engine) { const k = l.kart; l.engine.update(Math.min(1, k.speed / 31), l.inp.throttle || 0, k.boost > 0, k.drift !== 0 && k.grounded, !k.dead && this.state !== 'end', this.locals.length > 1 ? 0.7 : 1); }
    if (this.timeLeft < 30 && this.state === 'play' && !this.intense) { this.intense = true; this.audio.setIntense(true); this.hud.banner('30 SECONDES !', 'Tout donner !'); this.audio.play('horn', 0.8); }
    this.hud.update(dt);

    // Réseau
    if (this.net) {
      this.sendAcc += dt;
      if (this.sendAcc >= SEND_RATE) { this.sendAcc = 0; this.sendState(); }
    }
    this.render();
  }

  tryFire(k, inp, dt) {
    if (!k.weapon || k.roll > 0 || k.dead || k.cool > 0) return;
    const W = WEAPONS[k.weapon];
    if (!(W.auto ? inp.fire : inp.firePressed)) return;
    k.cool = W.cd;
    const bot = this.bots.get(k.id);
    const ev = createShot(this, k, k.weapon, bot ? bot.aimError : 0);
    ev.t = 'fire';
    k.ammo--; if (k.ammo <= 0) { k.weapon = null; k.ammo = 0; }
    this.emit(ev);
    const lp = this.locals.find(l => l.kart === k);
    if (lp) { this.hud.ammoPulse(lp); if (W.auto) this.input.rumble(lp.device, 0.1, 0.3, 40); else this.input.rumble(lp.device, 0.5, 0.5, 120); }
  }

  fixedStep(h, inputs, first) {
    for (const k of this.karts) {
      if (!k.isLocal || k.dead) continue;
      const src = inputs.get(k.id) || { throttle: 0, steer: 0 };
      const inp = first ? src : { ...src, driftPressed: false, firePressed: false };
      k.physics(h, inp, this.map);
    }
    // Collisions entre karts (on ne pousse que ses propres karts)
    for (const a of this.karts) {
      if (!a.isLocal || a.dead) continue;
      for (const b of this.karts) {
        if (a === b || b.dead || Math.abs(a.pos.y - b.pos.y) > 1.6) continue;
        const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, d2 = dx * dx + dz * dz, R = KART_R * 2;
        if (d2 >= R * R || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = R - d;
        const share = b.isLocal ? 0.5 : 1;
        a.pos.x += nx * pen * share; a.pos.z += nz * pen * share;
        const rv = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
        if (rv < 0) {
          const j = -rv * (b.isLocal ? 0.6 : 0.9);
          a.vel.x += nx * j; a.vel.z += nz * j;
          if (b.isLocal) { b.vel.x -= nx * j; b.vel.z -= nz * j; }
          if (-rv > 8) { this.audio.play('bump', this.volAt(a.pos) * 0.8); this.fx.burst(a.pos.clone().lerp(b.pos, 0.5).setY(a.pos.y + 0.8), '#ffffff', 8, 6); }
        }
      }
    }
    // Projectiles
    for (const p of [...this.projectiles.values()]) {
      const res = p.update(h);
      if (!this.projectiles.has(p.id)) continue;
      if (res) {
        const explosive = p.type === 'cannon' || p.type === 'rocket';
        if (res === 'world' && explosive) { if (this.isHost) this.hostExplode(p, p.pos.clone()); else { this.boomFx(p.type, p.pos.clone()); this.removeProj(p); } }
        else { if (res === 'world') this.boomFx(p.type === 'bullet' ? 'bullet' : 'fireball', p.pos.clone()); else if (p.type === 'mine') this.fx.burst(p.pos.clone(), '#c9b0ff', 10, 5); this.removeProj(p); }
        continue;
      }
      if (!this.isHost && p.type !== 'mine') {
        // retour visuel immédiat chez le client
        for (const k of this.karts) {
          if (k.dead || k.id === p.owner) continue;
          if (Math.hypot(k.pos.x - p.pos.x, k.pos.y + 0.8 - p.pos.y, k.pos.z - p.pos.z) < 1.45 + p.radius * 0.6) { this.boomFx(p.type, p.pos.clone()); this.removeProj(p); break; }
        }
      }
    }
    if (this.isHost) this.hostStep(h);
    // Ramassage des boîtes (par le propriétaire du kart)
    for (const k of this.karts) {
      if (!k.isLocal || k.dead) continue;
      for (const b of this.boxes) {
        if (!b.active || b.pending > this.time) continue;
        if (Math.hypot(k.pos.x - b.pos.x, k.pos.y + 0.9 - b.pos.y, k.pos.z - b.pos.z) < 2.3) { b.pending = this.time + 0.5; this.request({ t: 'pick', k: k.id, i: b.i, armed: k.weapon || k.roll > 0 ? 1 : 0, x: +k.pos.x.toFixed(2), y: +k.pos.y.toFixed(2), z: +k.pos.z.toFixed(2) }); }
      }
    }
  }

  updateBoxes(dt) {
    for (const b of this.boxes) {
      const vis = b.active;
      b.g.visible = vis; b.shadow.visible = vis;
      if (!vis) continue;
      b.pop = Math.min(1, b.pop + dt * 2.5);
      const p = b.pop, s = p < 1 ? 1 + Math.sin(p * Math.PI) * 0.35 - (1 - p) : 1;
      b.g.scale.setScalar(Math.max(0.01, s));
      b.g.position.y = b.pos.y + Math.sin(this.time * 2.4 + b.phase) * 0.22;
      b.cube.rotation.set(this.time * 0.6 + b.phase, this.time * 1.2 + b.phase, 0);
      b.core.rotation.set(-this.time * 1.4, -this.time * 0.9, 0);
      b.core.material.opacity = 0.35 + Math.sin(this.time * 6 + b.phase) * 0.2;
    }
  }

  updateCamera(l, dt) {
    const k = l.kart, c = l.cam, s = l.cs;
    const sp01 = Math.min(1, k.speed / 31);
    let pos, look;
    if (k.dead && k.deathPos) {
      s.orbit += dt * 0.5;
      const d = k.deathPos;
      pos = tmpV.set(d.x + Math.sin(s.orbit) * 13, d.y + 9, d.z + Math.cos(s.orbit) * 13);
      c.position.lerp(pos, 1 - Math.exp(-dt * 3));
      look = d.clone().setY(d.y + 1);
      s.y = c.position.y;
    } else {
      let head = k.yaw;
      const fs = k.vel.x * Math.sin(k.yaw) + k.vel.z * Math.cos(k.yaw);
      if (k.speed > 6 && fs > 0) head = lerpAngle(k.yaw, Math.atan2(k.vel.x, k.vel.z), 0.4);
      if (k.spin > 0) head = s.yaw;
      const lookBack = !!l.inp.look;
      if (lookBack !== s.look) { s.look = lookBack; s.yaw = head + (lookBack ? Math.PI : 0); }
      const want = head + (lookBack ? Math.PI : 0);
      s.yaw = lerpAngle(s.yaw, want, 1 - Math.exp(-dt * (k.drift ? 4 : 6.5)));
      const intro = s.intro; if (this.state === 'countdown') s.intro = Math.max(0, this.countT - 3) ; else s.intro = Math.max(0, s.intro - dt * 2);
      const dist = 6.7 + sp01 * 1.5 + (k.boost > 0 ? 0.9 : 0) + intro * 18;
      const hgt = 2.7 + sp01 * 0.3 + intro * 12;
      const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      let cx = k.pos.x - fx * dist, cz = k.pos.z - fz * dist;
      // évite de passer derrière un mur
      const head3 = { x: k.pos.x, y: k.pos.y + 1.6, z: k.pos.z };
      const dir = { x: -fx, y: (hgt - 1.6) / dist, z: -fz }; const dl = Math.hypot(dir.x, dir.y, dir.z);
      dir.x /= dl; dir.y /= dl; dir.z /= dl;
      const free = this.map.rayDistance(head3, dir, dist * dl);
      let dd = dist;
      if (free < dist * dl - 0.1) { dd = Math.max(2.5, free / dl - 0.6); cx = k.pos.x - fx * dd; cz = k.pos.z - fz * dd; }
      const ty = k.pos.y + hgt * (dd / dist);
      s.y += (ty - s.y) * (1 - Math.exp(-dt * (k.grounded ? 9 : 5)));
      const gh = this.map.groundHeight(cx, cz, s.y + 1);
      if (s.y < gh + 1) s.y = gh + 1;
      c.position.set(cx, s.y, cz);
      look = tmpV.set(k.pos.x + fx * 3.5, k.pos.y + 1.25, k.pos.z + fz * 3.5).clone();
    }
    // Secousses
    s.trauma = Math.max(0, s.trauma - dt * 1.6);
    const sh = s.trauma * s.trauma;
    c.lookAt(look);
    if (sh > 0) { c.rotation.z += (Math.random() - 0.5) * sh * 0.12; c.position.x += (Math.random() - 0.5) * sh * 0.5; c.position.y += (Math.random() - 0.5) * sh * 0.5; }
    const fov = 68 + sp01 * 9 + (k.boost > 0 ? 9 : 0);
    s.fov += (fov - s.fov) * (1 - Math.exp(-dt * 5));
    if (Math.abs(c.fov - s.fov) > 0.01) { c.fov = s.fov; c.updateProjectionMatrix(); }
  }

  sendState() {
    if (this.isHost) {
      const h = this.karts.map(k => [k.id, k.hp, k.kills, k.deaths, k.shield > 0 ? 1 : 0]);
      const all = this.karts.map(k => [k, k.snapshot()]);
      for (const pid of this.net.peers()) {
        const ks = all.filter(([k]) => k.owner !== pid).map(([, s]) => s);
        this.net.send(pid, { t: 's', k: ks, h, tl: Math.round(this.timeLeft * 10) / 10, st: this.state }, false);
      }
    } else {
      const ks = this.karts.filter(k => k.isLocal).map(k => k.snapshot());
      if (ks.length) this.net.toHost({ t: 'k', k: ks }, false);
    }
  }

  // ------------------------------------------------------------------ rendu
  resize() {
    const W = innerWidth, Hh = innerHeight, n = this.locals.length;
    let rects;
    if (n <= 1) rects = [[0, 0, W, Hh]];
    else if (n === 2) rects = [[0, 0, W, Hh / 2], [0, Hh / 2, W, Hh / 2]];
    else rects = [[0, 0, W / 2, Hh / 2], [W / 2, 0, W / 2, Hh / 2], [0, Hh / 2, W / 2, Hh / 2], [W / 2, Hh / 2, W / 2, Hh / 2]];
    rects = rects.map(r => r.map(Math.round));
    this.rects = rects;
    this.locals.forEach((l, i) => { l.rect = rects[i]; l.cam.aspect = rects[i][2] / rects[i][3]; l.cam.updateProjectionMatrix(); });
    this.overviewRect = n === 3 ? rects[3] : null;
    if (this.overviewRect) { this.overview.aspect = rects[3][2] / rects[3][3]; this.overview.updateProjectionMatrix(); }
    this.hud.layout(this.locals, this.overviewRect);
  }

  render() {
    const r = this.renderer, Hh = innerHeight, pr = r.getPixelRatio();
    r.setScissorTest(true);
    const draw = (cam, rect) => {
      const [x, y, w, h] = rect;
      r.setViewport(x, Hh - y - h, w, h); r.setScissor(x, Hh - y - h, w, h);
      this.fx.setScale(h * pr, cam.fov);
      r.render(this.scene, cam);
    };
    for (const l of this.locals) draw(l.cam, l.rect);
    if (this.overviewRect) {
      const t = this.time * 0.12;
      this.overview.position.set(Math.sin(t) * 120, 75, Math.cos(t) * 120); this.overview.lookAt(0, 0, 0);
      draw(this.overview, this.overviewRect);
    }
    r.setScissorTest(false);
  }

  dispose() {
    this.audio.stopEngines();
    this.hud.destroy();
    this.fx.dispose();
    for (const k of this.karts) k.dispose();
    this.scene.traverse(o => { if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });
    this.renderer.setScissorTest(false);
  }
}
