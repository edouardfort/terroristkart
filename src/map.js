// Carte « Candy Arena » : géométrie de collision analytique + rendu + graphe de navigation des bots.
import * as THREE from 'three';
import { toon, G } from './characters.js';

export const STEP = 0.75;   // hauteur franchissable sans sauter
export const H = 90;        // demi-taille de l'arène
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const box = (minX, maxX, minZ, maxZ, top, style, extra = {}) => ({ type: 'box', minX, maxX, minZ, maxZ, top, maxH: top, style, heightAt: () => top, ...extra });
const ramp = (minX, maxX, minZ, maxZ, axis, h0, h1, style = 'ramp') => ({
  type: 'ramp', minX, maxX, minZ, maxZ, axis, h0, h1, maxH: Math.max(h0, h1), style,
  heightAt(x, z) {
    const t = axis === 'x' ? (x - minX) / (maxX - minX) : (z - minZ) / (maxZ - minZ);
    return h0 + (h1 - h0) * clamp(t, 0, 1);
  },
});
const span = (a, b, s) => (s > 0 ? [a, b] : [-b, -a]);

export function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export class GameMap {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.anim = [];
    this.defineLayout();
    this.buildVisuals(quality);
    this.buildNav();
  }

  // ------------------------------------------------------------------ disposition
  defineLayout() {
    const B = this.blocks = [];
    const C = this.cylinders = [];
    // Murs d'enceinte
    B.push(box(-H - 4, H + 4, -H - 4, -H, 7, 'wall'), box(-H - 4, H + 4, H, H + 4, 7, 'wall'));
    B.push(box(-H - 4, -H, -H, H, 7, 'wall'), box(H, H + 4, -H, H, 7, 'wall'));
    // Plateau central + 4 rampes
    B.push(box(-18, 18, -18, 18, 5, 'plateau'));
    B.push(ramp(-5, 5, -34, -18, 'z', 0, 5), ramp(-5, 5, 18, 34, 'z', 5, 0));
    B.push(ramp(-34, -18, -5, 5, 'x', 0, 5), ramp(18, 34, -5, 5, 'x', 5, 0));
    // Plateformes d'angle + rampes
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const [x0, x1] = span(52, 74, sx), [z0, z1] = span(52, 74, sz);
      B.push(box(x0, x1, z0, z1, 3, 'corner'));
      const [rx0, rx1] = span(38, 52, sx), [rz0, rz1] = span(57, 69, sz);
      B.push(ramp(rx0, rx1, rz0, rz1, 'x', sx > 0 ? 0 : 3, sx > 0 ? 3 : 0));
      const [qx0, qx1] = span(57, 69, sx), [qz0, qz1] = span(38, 52, sz);
      B.push(ramp(qx0, qx1, qz0, qz1, 'z', sz > 0 ? 0 : 3, sz > 0 ? 3 : 0));
    }
    // Tremplins + haies à survoler
    B.push(ramp(-4, 4, -56, -48, 'z', 2.4, 0, 'kicker'), ramp(-4, 4, 48, 56, 'z', 0, 2.4, 'kicker'));
    B.push(ramp(-56, -48, -4, 4, 'x', 2.4, 0, 'kicker'), ramp(48, 56, -4, 4, 'x', 0, 2.4, 'kicker'));
    B.push(box(-11, 11, -68, -65, 1.8, 'hedge'), box(-11, 11, 65, 68, 1.8, 'hedge'));
    B.push(box(-68, -65, -11, 11, 1.8, 'hedge'), box(65, 68, -11, 11, 1.8, 'hedge'));
    // Cadeaux géants (abris)
    const gifts = [[30, 44], [-30, 44], [30, -44], [-30, -44], [44, 30], [-44, 30], [44, -30], [-44, -30]];
    const giftCols = [['#ff6fb5', '#ffe14d'], ['#5cc8ff', '#ff4d6d'], ['#9b6bff', '#7dff9b'], ['#ffb347', '#5c7bff']];
    gifts.forEach(([x, z], i) => B.push(box(x - 2.2, x + 2.2, z - 2.2, z + 2.2, 2.8, 'gift', { colors: giftCols[i % 4] })));
    // Arbres sucettes
    const trees = [[72, 28], [-72, 28], [72, -28], [-72, -28], [28, 72], [-28, 72], [28, -72], [-28, -72],
      [44, 12], [-44, 12], [44, -12], [-44, -12], [12, 44], [-12, 44], [12, -44], [-12, -44]];
    trees.forEach(([x, z]) => C.push({ x, z, r: 1.2, top: 12, kind: 'tree' }));
    C.push({ x: 0, z: 0, r: 3.2, top: 8.5, kind: 'trophy' });

    this.jumpPads = [[27, 27], [-27, 27], [27, -27], [-27, -27]].map(([x, z]) => ({ x, z, r: 2.4, y: 0 }));
    this.boostPads = [
      { x: 0, z: -40, yaw: 0 }, { x: 0, z: 40, yaw: Math.PI }, { x: -40, z: 0, yaw: Math.PI / 2 }, { x: 40, z: 0, yaw: -Math.PI / 2 },
      { x: 0, z: -84, yaw: Math.PI / 2 }, { x: 84, z: 0, yaw: 0 }, { x: 0, z: 84, yaw: -Math.PI / 2 }, { x: -84, z: 0, yaw: Math.PI },
      { x: -63, z: -63, yaw: Math.PI / 4 + Math.PI / 2 }, { x: 63, z: 63, yaw: -Math.PI / 4 - Math.PI / 2 + Math.PI }, { x: 63, z: -63, yaw: -Math.PI / 4 }, { x: -63, z: 63, yaw: Math.PI - Math.PI / 4 + Math.PI / 2 },
    ].map(p => ({ ...p, w: 2.6, d: 3.2, y: 0 }));
    for (const p of this.boostPads) p.y = this.groundHeight(p.x, p.z, 10);

    const spots = [];
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      spots.push([sx * 9, sz * 9], [sx * 63, sz * 63]);
      for (const o of [-3.4, 0, 3.4]) spots.push([sx * 44 + o, sz * 44]);
    }
    for (const s of [1, -1]) for (const o of [-3.4, 0, 3.4]) { spots.push([o, s * 77]); spots.push([s * 77, o]); }
    this.itemSpots = spots.map(([x, z]) => new THREE.Vector3(x, this.groundHeight(x, z, 20) + 1.25, z));

    this.spawns = [];
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 + 15) * Math.PI / 180;
      let x = Math.sin(a) * 50, z = Math.cos(a) * 50;
      const p = new THREE.Vector3(x, 0, z);
      for (let k = 0; k < 8 && this.blockedCircle(p.x, p.z, 0, 2.2); k++) { p.multiplyScalar(0.94); }
      this.spawns.push({ x: p.x, z: p.z, y: this.groundHeight(p.x, p.z, 1), yaw: Math.atan2(-p.x, -p.z) });
    }
  }

  // ------------------------------------------------------------------ requêtes physiques
  groundHeight(x, z, y) {
    let best = 0;
    for (const b of this.blocks) {
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      const h = b.heightAt(x, z);
      if (h <= y + STEP && h > best) best = h;
    }
    return best;
  }

  onBoostPad(x, z, y) {
    for (const p of this.boostPads) {
      if (Math.abs(y - p.y) > 0.6) continue;
      const dx = x - p.x, dz = z - p.z, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < p.w + 0.6 && Math.abs(lz) < p.d + 0.6) return p;
    }
    return null;
  }

  onJumpPad(x, z, y) {
    for (const p of this.jumpPads) if (Math.abs(y - p.y) < 0.5 && (x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r) return p;
    return null;
  }

  // Repousse un cercle hors des obstacles. Retourne la normale moyenne ou null.
  collide(pos, r, y) {
    let hit = false, nx = 0, nz = 0;
    for (const b of this.blocks) {
      if (pos.x < b.minX - r || pos.x > b.maxX + r || pos.z < b.minZ - r || pos.z > b.maxZ + r) continue;
      if (b.maxH <= y + STEP) continue;
      const cx = clamp(pos.x, b.minX, b.maxX), cz = clamp(pos.z, b.minZ, b.maxZ);
      if (b.heightAt(cx, cz) <= y + STEP) continue;
      const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      let px, pz, depth;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); px = dx / d; pz = dz / d; depth = r - d; }
      else {
        const l = pos.x - b.minX, rr = b.maxX - pos.x, t = pos.z - b.minZ, bb = b.maxZ - pos.z, m = Math.min(l, rr, t, bb);
        if (m === l) { px = -1; pz = 0; depth = l + r; } else if (m === rr) { px = 1; pz = 0; depth = rr + r; }
        else if (m === t) { px = 0; pz = -1; depth = t + r; } else { px = 0; pz = 1; depth = bb + r; }
      }
      pos.x += px * depth; pos.z += pz * depth; nx += px; nz += pz; hit = true;
    }
    for (const c of this.cylinders) {
      if (c.top <= y + STEP) continue;
      const dx = pos.x - c.x, dz = pos.z - c.z, d2 = dx * dx + dz * dz, rr = r + c.r;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-4, px = dx / d, pz = dz / d;
      pos.x = c.x + px * rr; pos.z = c.z + pz * rr; nx += px; nz += pz; hit = true;
    }
    if (!hit) return null;
    const l = Math.hypot(nx, nz) || 1;
    return { nx: nx / l, nz: nz / l };
  }

  blockedCircle(x, z, y, r) {
    for (const b of this.blocks) {
      if (x < b.minX - r || x > b.maxX + r || z < b.minZ - r || z > b.maxZ + r) continue;
      if (b.maxH <= y + STEP) continue;
      const cx = clamp(x, b.minX, b.maxX), cz = clamp(z, b.minZ, b.maxZ);
      if (b.heightAt(cx, cz) <= y + STEP) continue;
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
    }
    for (const c of this.cylinders) if (c.top > y + STEP && (x - c.x) ** 2 + (z - c.z) ** 2 < (r + c.r) ** 2) return true;
    return false;
  }

  pointBlocked(x, y, z) {
    if (y < 0) return true;
    for (const b of this.blocks) if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && y < b.heightAt(x, z)) return true;
    for (const c of this.cylinders) if (y < c.top && (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true;
    return false;
  }

  // Marche le long d'un rayon ; retourne la distance au premier obstacle (ou maxD)
  rayDistance(o, d, maxD) {
    for (let t = 0.5; t < maxD; t += 0.7) if (this.pointBlocked(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t)) return t;
    return maxD;
  }

  // Le trajet a→b est-il praticable en kart ?
  traversable(ax, ay, az, bx, bz, by = null, r = 1.3) {
    const dist = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(dist / 1.0));
    let y = ay, grace = 0;
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const h = this.groundHeight(x, z, y);
      if (h < y - 1) grace = 4;
      y = h;
      if (grace > 0) { grace--; continue; }
      if (this.blockedCircle(x, z, y, r)) return false;
    }
    return by === null || Math.abs(y - by) < 0.8;
  }

  // ------------------------------------------------------------------ navigation
  buildNav() {
    const nodes = this.nodes = [];
    for (let x = -84; x <= 84; x += 7) for (let z = -84; z <= 84; z += 7) {
      const cands = new Set([0]);
      for (const b of this.blocks) if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) cands.add(b.heightAt(x, z));
      for (const y of cands) {
        if (Math.abs(this.groundHeight(x, z, y + 0.01) - y) > 0.01) continue;
        if (this.blockedCircle(x, z, y, 1.6)) continue;
        nodes.push({ x, y, z, n: [] });
      }
    }
    for (const a of nodes) for (const b of nodes) {
      if (a === b) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > 10.5) continue;
      if (this.traversable(a.x, a.y, a.z, b.x, b.z, b.y)) a.n.push(b);
    }
    nodes.forEach((n, i) => { n.i = i; });
  }

  nearestNode(x, y, z, needDirect = true) {
    const list = this.nodes.map(n => ({ n, d: (n.x - x) ** 2 + (n.z - z) ** 2 + ((n.y - y) * 4) ** 2 })).sort((a, b) => a.d - b.d);
    for (let i = 0; i < Math.min(8, list.length); i++) {
      const n = list[i].n;
      if (!needDirect || this.traversable(x, y, z, n.x, n.z, n.y)) return n;
    }
    return list[0]?.n || null;
  }

  path(from, to) {
    if (!from || !to) return null;
    const N = this.nodes.length, g = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open = [from.i]; g[from.i] = 0;
    const hz = n => Math.hypot(n.x - to.x, n.z - to.z) + Math.abs(n.y - to.y);
    while (open.length) {
      let bi = 0, bf = Infinity;
      for (let k = 0; k < open.length; k++) { const f = g[open[k]] + hz(this.nodes[open[k]]); if (f < bf) { bf = f; bi = k; } }
      const ci = open.splice(bi, 1)[0];
      if (ci === to.i) break;
      closed[ci] = 1;
      const c = this.nodes[ci];
      for (const nb of c.n) {
        if (closed[nb.i]) continue;
        const ng = g[ci] + Math.hypot(nb.x - c.x, nb.z - c.z) + Math.max(0, nb.y - c.y) * 2;
        if (ng < g[nb.i]) { if (g[nb.i] === Infinity) open.push(nb.i); g[nb.i] = ng; prev[nb.i] = ci; }
      }
    }
    if (prev[to.i] === -1 && to !== from) return null;
    const out = [];
    for (let i = to.i; i !== -1; i = prev[i]) out.unshift(this.nodes[i]);
    return out;
  }

  // ------------------------------------------------------------------ rendu
  buildVisuals(quality) {
    const g = this.group;
    // Ciel en dégradé
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#4aa8ff') }, mid: { value: new THREE.Color('#9fd6ff') }, bot: { value: new THREE.Color('#ffd6f0') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.7, h)) : mix(bot, mid, smoothstep(-0.05, 0.12, h)); gl_FragColor = vec4(c, 1.0);\n#include <colorspace_fragment>\n}',
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
    sky.renderOrder = -10; sky.frustumCulled = false; g.add(sky);
    this.sky = sky;

    // Sol extérieur
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), toon('#9ee07a'));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; outer.receiveShadow = true; g.add(outer);

    // Sol de l'arène (une grande texture peinte)
    const S = 2048, k = S / (2 * H), P = v => (v + H) * k;
    const groundTex = canvasTex(S, S, (ctx) => {
      const T = 6;
      for (let i = 0; i < 2 * H / T; i++) for (let j = 0; j < 2 * H / T; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#86dc5c' : '#79d04f';
        ctx.fillRect(i * T * k, j * T * k, T * k + 1, T * k + 1);
      }
      // petites fleurs
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = ['#ffffff', '#fff27a', '#ff9fd6', '#b3f0ff'][i % 4];
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(Math.random() * S, Math.random() * S, 1.5 + Math.random() * 2, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Route périphérique
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#a7a3c4'; ctx.lineWidth = 12 * k;
      rrect(ctx, P(-82), P(-82), 164 * k, 164 * k, 16 * k); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.7 * k;
      rrect(ctx, P(-88), P(-88), 176 * k, 176 * k, 22 * k); ctx.stroke();
      rrect(ctx, P(-76), P(-76), 152 * k, 152 * k, 10 * k); ctx.stroke();
      ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 0.6 * k; ctx.setLineDash([4 * k, 4 * k]);
      rrect(ctx, P(-82), P(-82), 164 * k, 164 * k, 16 * k); ctx.stroke(); ctx.setLineDash([]);
      // Damiers d'angle
      for (const sx of [1, -1]) for (const sz of [1, -1]) {
        const x0 = sx > 0 ? 46 : -78, z0 = sz > 0 ? 46 : -78;
        ctx.fillStyle = '#b8f5e4'; rrect(ctx, P(x0), P(z0), 32 * k, 32 * k, 5 * k); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8 * k; ctx.stroke();
      }
      // Place rose autour du plateau
      ctx.save(); rrect(ctx, P(-42), P(-42), 84 * k, 84 * k, 12 * k); ctx.clip();
      for (let i = -42; i < 42; i += 4) for (let j = -42; j < 42; j += 4) {
        ctx.fillStyle = ((i + j) / 4) % 2 === 0 ? '#ffc4e3' : '#ffb2d9';
        ctx.fillRect(P(i), P(j), 4 * k + 1, 4 * k + 1);
      }
      ctx.restore();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2 * k; rrect(ctx, P(-42), P(-42), 84 * k, 84 * k, 12 * k); ctx.stroke();
      // Couloirs des tremplins
      ctx.fillStyle = '#ffe9a8';
      for (const s of [1, -1]) {
        ctx.fillRect(P(-6), P(s > 0 ? 42 : -64), 12 * k, 22 * k);
        ctx.fillRect(P(s > 0 ? 42 : -64), P(-6), 22 * k, 12 * k);
      }
      // Cercles sous les trampolines
      for (const p of [[27, 27], [-27, 27], [27, -27], [-27, -27]]) {
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(P(p[0]), P(p[1]), 4.2 * k, 0, 7); ctx.fill();
        ctx.fillStyle = '#c7b5ff'; ctx.beginPath(); ctx.arc(P(p[0]), P(p[1]), 3.6 * k, 0, 7); ctx.fill();
      }
      // Occlusion douce au pied des obstacles
      ctx.filter = 'blur(10px)'; ctx.fillStyle = 'rgba(40,20,80,0.22)';
      for (const b of this.blocks) {
        if (b.style === 'wall') continue;
        if (b.type === 'ramp') continue;
        ctx.fillRect(P(b.minX) - 6, P(b.minZ) - 6, (b.maxX - b.minX) * k + 12, (b.maxZ - b.minZ) * k + 12);
      }
      for (const c of this.cylinders) { ctx.beginPath(); ctx.arc(P(c.x), P(c.z), (c.r + 0.8) * k, 0, 7); ctx.fill(); }
      ctx.filter = 'none';
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2 * H, 2 * H), new THREE.MeshToonMaterial({ map: groundTex, gradientMap: toon('#fff').gradientMap }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);

    // Textures des dessus
    const checker = (a, b, border) => canvasTex(128, 128, (ctx) => {
      ctx.fillStyle = a; ctx.fillRect(0, 0, 128, 128); ctx.fillStyle = b; ctx.fillRect(0, 0, 64, 64); ctx.fillRect(64, 64, 64, 64);
      if (border) { ctx.strokeStyle = border; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, 125, 125); }
    }, true);
    const chevron = (bg, fg) => canvasTex(128, 128, (ctx) => {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(64, 14); ctx.lineTo(118, 64); ctx.lineTo(118, 92); ctx.lineTo(64, 46); ctx.lineTo(10, 92); ctx.lineTo(10, 64); ctx.closePath(); ctx.fill();
    }, true);
    const texPlateau = checker('#ffb3dc', '#ff9fd0'), texCorner = checker('#a8f0dc', '#8fe6cf'), texRamp = chevron('#ffd84d', '#ff9a1a'), texKick = chevron('#ff7a59', '#ffffff');
    const texHedge = canvasTex(64, 64, (ctx) => { ctx.fillStyle = '#4fbf5a'; ctx.fillRect(0, 0, 64, 64); for (let i = 0; i < 40; i++) { ctx.fillStyle = i % 2 ? '#5fd46a' : '#43ad4e'; ctx.beginPath(); ctx.arc(Math.random() * 64, Math.random() * 64, 4 + Math.random() * 4, 0, 7); ctx.fill(); } }, true);
    const sideMat = { plateau: toon('#a07bff'), corner: toon('#3fc9b0'), wall: toon('#b9a3ff'), hedge: toon('#3f9f4a'), ramp: toon('#ff9a1a', { side: THREE.DoubleSide }), kicker: toon('#ff5a3c', { side: THREE.DoubleSide }) };
    const edgeMat = new THREE.LineBasicMaterial({ color: '#2a1a5e', transparent: true, opacity: 0.28 });
    const topTex = { plateau: [texPlateau, 4], corner: [texCorner, 4], hedge: [texHedge, 3], ramp: [texRamp, 3], kicker: [texKick, 2.6] };
    const topMat = (style, w, d) => {
      const [t, tile] = topTex[style];
      const tt = t.clone(); tt.needsUpdate = true; tt.repeat.set(w / tile, d / tile);
      return new THREE.MeshToonMaterial({ map: tt, gradientMap: toon('#fff').gradientMap, side: style === 'ramp' || style === 'kicker' ? THREE.DoubleSide : THREE.FrontSide });
    };

    for (const b of this.blocks) {
      const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
      let mesh;
      if (b.type === 'box') {
        const geo = new THREE.BoxGeometry(w, b.top, d);
        if (b.style === 'gift') {
          const [c1, c2] = b.colors;
          mesh = new THREE.Mesh(geo, toon(c1));
          const rib = toon(c2);
          const r1 = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, b.top + 0.08, 0.7), rib); mesh.add(r1);
          const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, b.top + 0.08, d + 0.08), rib); mesh.add(r2);
          for (const s of [1, -1]) {
            const bow = new THREE.Mesh(G.torus, rib); bow.scale.set(0.7, 0.7, 1.4); bow.position.set(s * 0.55, b.top / 2 + 0.45, 0); bow.rotation.set(0, Math.PI / 2, s * 0.6); mesh.add(bow);
          }
          [r1, r2, ...mesh.children].forEach(m => { m.castShadow = true; });
        } else if (b.style === 'wall') {
          mesh = new THREE.Mesh(geo, sideMat.wall);
          const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), toon('#ff8fd0'));
          cap.position.y = b.top / 2 + 0.25; cap.castShadow = true; mesh.add(cap);
        } else {
          const tm = topMat(b.style, w, d), sm = sideMat[b.style];
          mesh = new THREE.Mesh(geo, [sm, sm, tm, sm, sm, sm]);
        }
        mesh.position.set((b.minX + b.maxX) / 2, b.top / 2, (b.minZ + b.maxZ) / 2);
        if (b.style !== 'wall') { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat); mesh.add(e); }
      } else {
        mesh = new THREE.Mesh(this.rampGeometry(b), [topMat(b.style, b.axis === 'x' ? d : w, b.axis === 'x' ? w : d), sideMat[b.style]]);
      }
      mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh);
    }

    // Bordure blanche lumineuse sur le plateau
    const rail = toon('#ffffff');
    for (const [x, z, w, d] of [[0, -18, 36, 0.5], [0, 18, 36, 0.5], [-18, 0, 0.5, 36], [18, 0, 0.5, 36]]) {
      const m = new THREE.Mesh(G.box, rail); m.scale.set(w, 0.12, d); m.position.set(x, 5.06, z); g.add(m);
    }

    // Arbres
    const canopyCols = ['#ff5cc8', '#c86bff', '#5ce1ff', '#ff8a5c', '#ff6f9f'];
    for (const c of this.cylinders) {
      if (c.kind !== 'tree') continue;
      const t = new THREE.Group(); t.position.set(c.x, 0, c.z);
      const trunk = new THREE.Mesh(G.cyl, toon('#f6c48f')); trunk.scale.set(0.55, 4.2, 0.55); trunk.position.y = 2.1; t.add(trunk);
      const col = canopyCols[Math.abs(Math.round(c.x * 3 + c.z * 7)) % canopyCols.length];
      const cm = toon(col, { flatShading: true });
      const c1 = new THREE.Mesh(G.sphLo, cm); c1.scale.set(2.6, 2.3, 2.6); c1.position.y = 5.6; t.add(c1);
      const c2 = new THREE.Mesh(G.sphLo, cm); c2.scale.set(1.6, 1.5, 1.6); c2.position.set(0.9, 7.4, -0.4); t.add(c2);
      t.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      t.rotation.y = c.x * 0.37;
      g.add(t);
      this.anim.push((dt, time) => { c1.scale.y = 2.3 + Math.sin(time * 1.6 + c.x) * 0.06; });
    }

    // Trophée central (couronne géante)
    const trophy = new THREE.Group(); trophy.position.set(0, 5, 0); g.add(trophy);
    const ped = new THREE.Mesh(G.cyl, toon('#ffffff')); ped.scale.set(3.2, 1.4, 3.2); ped.position.y = 0.7; trophy.add(ped);
    const pedBand = new THREE.Mesh(G.cyl, toon('#ff4d8d')); pedBand.scale.set(3.3, 0.35, 3.3); pedBand.position.y = 1.2; trophy.add(pedBand);
    const crown = new THREE.Group(); crown.position.y = 1.4; trophy.add(crown);
    const gold = toon('#ffc928', { emissive: '#5a3a00' });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.9, 1.6, 20, 1, true), gold); ring.material = toon('#ffc928', { side: THREE.DoubleSide, emissive: '#4a2f00' }); ring.position.y = 0.8; crown.add(ring);
    const gems = ['#ff3b6b', '#3bd1ff', '#7dff5c', '#b36bff', '#ff9a1a'];
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const sp = new THREE.Mesh(G.cone, gold); sp.scale.set(0.55, 1.6, 0.55); sp.position.set(Math.sin(a) * 2.05, 2.3, Math.cos(a) * 2.05); crown.add(sp);
      const b = new THREE.Mesh(G.sph, gold); b.scale.setScalar(0.32); b.position.set(Math.sin(a) * 2.05, 3.15, Math.cos(a) * 2.05); crown.add(b);
      const gem = new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({ color: gems[i] })); gem.scale.set(0.3, 0.38, 0.15);
      gem.position.set(Math.sin(a) * 2.2, 0.8, Math.cos(a) * 2.2); gem.lookAt(0, 0.8, 0); gem.position.y = 0.8; crown.add(gem);
    }
    trophy.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.anim.push((dt, time) => { crown.rotation.y = time * 0.5; crown.position.y = 1.4 + Math.sin(time * 2) * 0.15; });

    // Trampolines
    const ringTex = canvasTex(128, 128, (ctx) => {
      for (let r = 64, i = 0; r > 0; r -= 9, i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#ff5cc8'; ctx.beginPath(); ctx.arc(64, 64, r, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(64, 30); ctx.lineTo(90, 62); ctx.lineTo(74, 62); ctx.lineTo(74, 96); ctx.lineTo(54, 96); ctx.lineTo(54, 62); ctx.lineTo(38, 62); ctx.closePath(); ctx.fill();
    });
    for (const p of this.jumpPads) {
      const base = new THREE.Mesh(G.cyl, toon('#7b5cff')); base.scale.set(p.r + 0.3, 0.3, p.r + 0.3); base.position.set(p.x, 0.15, p.z); base.receiveShadow = true; g.add(base);
      const top = new THREE.Mesh(new THREE.CircleGeometry(p.r, 32), new THREE.MeshBasicMaterial({ map: ringTex })); top.rotation.x = -Math.PI / 2; top.position.set(p.x, 0.31, p.z); g.add(top);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(p.r, 0.12, 8, 32), new THREE.MeshBasicMaterial({ color: '#ff9be0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.rotation.x = -Math.PI / 2; halo.position.set(p.x, 0.4, p.z); g.add(halo);
      p.y = 0.3;
      this.anim.push((dt, time) => { const k = (time * 0.9 + p.x * 0.01) % 1; halo.position.y = 0.4 + k * 3.5; halo.scale.setScalar(1 - k * 0.4); halo.material.opacity = 1 - k; });
    }

    // Pads de boost
    const boostTex = canvasTex(64, 128, (ctx) => {
      ctx.fillStyle = '#ff8a00'; ctx.fillRect(0, 0, 64, 128);
      ctx.fillStyle = '#ffe14d';
      for (const y of [8, 72]) { ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(60, y + 30); ctx.lineTo(60, y + 48); ctx.lineTo(32, y + 20); ctx.lineTo(4, y + 48); ctx.lineTo(4, y + 30); ctx.closePath(); ctx.fill(); }
    }, true);
    boostTex.repeat.set(1, 1.5);
    this.boostTex = boostTex;
    for (const p of this.boostPads) {
      const grp = new THREE.Group(); grp.position.set(p.x, p.y + 0.04, p.z); grp.rotation.y = p.yaw; g.add(grp);
      const rim = new THREE.Mesh(new THREE.PlaneGeometry(p.w * 2 + 0.6, p.d * 2 + 0.6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      rim.rotation.x = -Math.PI / 2; grp.add(rim);
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(p.w * 2, p.d * 2), new THREE.MeshBasicMaterial({ map: boostTex }));
      pad.rotation.x = -Math.PI / 2; pad.rotation.z = Math.PI; pad.position.y = 0.02; grp.add(pad);
    }

    // Tribunes + public
    const standMat = [toon('#ff8fd0'), toon('#ffb3e2'), toon('#ffd0ee')];
    const crowdGeo = new THREE.SphereGeometry(0.75, 10, 8);
    const crowdN = 2 * 4 * 46;
    const crowd = new THREE.InstancedMesh(crowdGeo, new THREE.MeshToonMaterial({ gradientMap: toon('#fff').gradientMap }), crowdN);
    const crowdCols = ['#ff5c5c', '#ffd23f', '#3b7cff', '#3ed46b', '#9b5cff', '#ff6fb5', '#ffffff', '#ff9a3c', '#5ce1ff'];
    const crowdData = [];
    let ci = 0;
    for (const s of [1, -1]) for (let row = 0; row < 4; row++) {
      const top = 7.5 + row * 2.2, z0 = H + 5 + row * 3.4;
      const st = new THREE.Mesh(G.box, standMat[row % 3]); st.scale.set(150, top, 3.4); st.position.set(0, top / 2, s * (z0 + 1.7)); st.receiveShadow = true; g.add(st);
      for (let i = 0; i < 46; i++) {
        const x = -72 + i * 3.2 + (row % 2) * 1.6;
        crowdData.push({ x, y: top + 0.9, z: s * (z0 + 1.7), ph: Math.random() * 7, sp: 5 + Math.random() * 4 });
        crowd.setColorAt(ci++, new THREE.Color(crowdCols[(i * 7 + row * 3 + (s > 0 ? 0 : 5)) % crowdCols.length]));
      }
    }
    crowd.castShadow = false; g.add(crowd);
    this.cheer = 0.3;
    const m4 = new THREE.Matrix4();
    this.anim.push((dt, time) => {
      this.cheer = Math.max(0.25, this.cheer - dt * 0.35);
      for (let i = 0; i < crowdData.length; i++) {
        const c = crowdData[i];
        const j = Math.max(0, Math.sin(time * c.sp + c.ph)) * this.cheer * 1.6;
        m4.makeTranslation(c.x, c.y + j, c.z); crowd.setMatrixAt(i, m4);
      }
      crowd.instanceMatrix.needsUpdate = true;
    });

    // Bannières sur les murs
    const bannerTex = canvasTex(1024, 128, (ctx) => {
      const gr = ctx.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#5a2dff'); gr.addColorStop(1, '#ff3d9a');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, 1024, 128);
      ctx.font = '900 italic 78px "Lilita One", Impact, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      ctx.lineWidth = 10; ctx.strokeStyle = '#1b0f4a'; ctx.strokeText('TERRORISTKART', 512, 68);
      ctx.fillStyle = '#ffe14d'; ctx.fillText('TERRORISTKART', 512, 68);
      ctx.fillStyle = '#ffffff'; for (const x of [70, 954]) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = i % 2 ? 18 : 40; ctx.lineTo(x + Math.sin(a) * r, 64 - Math.cos(a) * r); } ctx.fill(); }
    });
    this.bannerTex = bannerTex;
    for (const [x, z, ry] of [[H - 0.05, -40, -Math.PI / 2], [H - 0.05, 40, -Math.PI / 2], [-H + 0.05, -40, Math.PI / 2], [-H + 0.05, 40, Math.PI / 2], [-40, -H + 0.05, 0], [40, -H + 0.05, 0], [-40, H - 0.05, Math.PI], [40, H - 0.05, Math.PI]]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(32, 4), new THREE.MeshBasicMaterial({ map: bannerTex }));
      b.position.set(x, 4, z); b.rotation.y = ry; g.add(b);
    }

    // Ballons sur les murs
    const balloonCols = ['#ff4d6d', '#ffd23f', '#3b7cff', '#3ed46b', '#c86bff', '#ff9a3c'];
    const lineMat = new THREE.LineBasicMaterial({ color: '#ffffff' });
    for (let i = 0; i < 28; i++) {
      const side = i % 4, t = (Math.floor(i / 4) / 7) * 2 - 1;
      const x = side < 2 ? t * 80 : (side === 2 ? H + 2 : -H - 2), z = side < 2 ? (side === 0 ? H + 2 : -H - 2) : t * 80;
      const bl = new THREE.Group(); bl.position.set(x, 7.5, z); g.add(bl);
      const ball = new THREE.Mesh(G.sph, toon(balloonCols[i % balloonCols.length])); ball.scale.set(1.1, 1.3, 1.1); ball.position.y = 4; bl.add(ball);
      const knot = new THREE.Mesh(G.cone, ball.material); knot.scale.set(0.2, 0.3, 0.2); knot.position.y = 2.6; bl.add(knot);
      bl.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.5, 0)]), lineMat));
      ball.castShadow = true;
      this.anim.push((dt, time) => { bl.rotation.z = Math.sin(time * 1.3 + i) * 0.12; bl.rotation.x = Math.cos(time * 1.1 + i * 2) * 0.1; });
    }

    // Montagnes pastel
    const mCols = ['#c9a7ff', '#ffb3d9', '#a7c7ff', '#b9f0d8'];
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2 + Math.random() * 0.1, r = 260 + Math.random() * 120, hgt = 60 + Math.random() * 90, rad = 50 + Math.random() * 50;
      const m = new THREE.Mesh(new THREE.ConeGeometry(rad, hgt, 7), toon(mCols[i % 4], { flatShading: true }));
      m.position.set(Math.sin(a) * r, hgt / 2 - 2, Math.cos(a) * r); m.rotation.y = Math.random() * 3; g.add(m);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.32, hgt * 0.32, 7), toon('#ffffff', { flatShading: true }));
      cap.position.y = hgt * 0.34 + 0.5; m.add(cap);
    }
    // Nuages
    const clouds = new THREE.Group(); g.add(clouds);
    const cloudMat = toon('#ffffff');
    for (let i = 0; i < 22; i++) {
      const c = new THREE.Group(), a = i / 22 * Math.PI * 2, r = 170 + Math.random() * 130;
      c.position.set(Math.sin(a) * r, 55 + Math.random() * 50, Math.cos(a) * r);
      for (let j = 0; j < 5; j++) { const s = new THREE.Mesh(G.sphLo, cloudMat); s.scale.set(9 + Math.random() * 7, 6 + Math.random() * 3, 8); s.position.set(j * 9 - 18, Math.random() * 4, Math.random() * 6); c.add(s); }
      c.lookAt(0, c.position.y, 0); clouds.add(c);
    }
    this.anim.push((dt) => { clouds.rotation.y += dt * 0.008; });
  }

  rampGeometry(b) {
    const corners = [[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]];
    const top = corners.map(([x, z]) => new THREE.Vector3(x, b.heightAt(x, z), z));
    const bot = corners.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const pos = [], uv = [];
    const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    const uvOf = (v) => {
      if (b.axis === 'z') { let t = (v.z - b.minZ) / d; if (b.h0 > b.h1) t = 1 - t; return [(v.x - b.minX) / w, t]; }
      let t = (v.x - b.minX) / w; if (b.h0 > b.h1) t = 1 - t; return [(v.z - b.minZ) / d, t];
    };
    const tri = (a, c, e, uvs) => { pos.push(a.x, a.y, a.z, c.x, c.y, c.z, e.x, e.y, e.z); uv.push(...(uvs || [0, 0, 0, 0, 0, 0])); };
    tri(top[0], top[3], top[2], [...uvOf(top[0]), ...uvOf(top[3]), ...uvOf(top[2])]);
    tri(top[0], top[2], top[1], [...uvOf(top[0]), ...uvOf(top[2]), ...uvOf(top[1])]);
    const topCount = 6;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      if (top[i].y < 0.01 && top[j].y < 0.01) continue;
      tri(bot[i], bot[j], top[j]); tri(bot[i], top[j], top[i]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    // normales du dessus vers le haut
    const n = geo.attributes.normal;
    for (let i = 0; i < topCount; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    geo.addGroup(0, topCount, 0);
    geo.addGroup(topCount, pos.length / 3 - topCount, 1);
    return geo;
  }

  update(dt, time) {
    this.boostTex.offset.y -= dt * 2.2;
    for (const f of this.anim) f(dt, time);
  }
}
