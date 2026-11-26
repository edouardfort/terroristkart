// Effets : particules en un seul draw call, explosions, anneaux, rayons, flashs lumineux.
import * as THREE from 'three';
import { G } from './characters.js';

const colorCache = new Map();
function rgb(c) {
  let v = colorCache.get(c);
  if (!v) { const col = new THREE.Color(c); v = [col.r, col.g, col.b]; colorCache.set(c, v); }
  return v;
}

class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr); geo.setAttribute('aColor', this.colAttr); geo.setAttribute('aSize', this.sizeAttr);
    this.uniforms = { uScale: { value: 500 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vC;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize > 0.0 ? clamp(aSize * uScale / max(0.2, -mv.z), 1.0, 400.0) : 0.0; vC = aColor; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
        float a = smoothstep(0.5, ${additive ? '0.0' : '0.3'}, r); gl_FragColor = vec4(vC.rgb, vC.a * a);
#include <colorspace_fragment>
}`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = additive ? 6 : 5;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, color, alpha = 1, drag = 0, grav = 0) {
    const i = this.i; this.i = (this.i + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const c = rgb(color);
    this.col[i * 4] = c[0]; this.col[i * 4 + 1] = c[1]; this.col[i * 4 + 2] = c[2]; this.col[i * 4 + 3] = alpha;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = alpha;
    this.drag[i] = drag; this.grav[i] = grav; this.size[i] = s0;
  }

  update(dt) {
    const P = this.pos, V = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.size[i] !== 0) this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const d = Math.exp(-this.drag[i] * dt);
      V[i * 3] *= d; V[i * 3 + 1] = V[i * 3 + 1] * d - this.grav[i] * dt; V[i * 3 + 2] *= d;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      if (P[i * 3 + 1] < 0.05 && V[i * 3 + 1] < 0) { P[i * 3 + 1] = 0.05; V[i * 3 + 1] *= -0.4; }
      this.size[i] = this.life[i] <= 0 ? 0 : this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i * 4 + 3] = this.a0[i] * (1 - t * t);
    }
    this.posAttr.needsUpdate = true; this.colAttr.needsUpdate = true; this.sizeAttr.needsUpdate = true;
  }
}

const addMat = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.add = new Particles(scene, 5000, true);
    this.alpha = new Particles(scene, 3000, false);
    this.items = [];
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight('#ffaa55', 0, 30, 1.6); l.position.set(0, -100, 0); scene.add(l);
      this.lights.push({ l, t: 0, d: 1, i: 0 });
    }
    this.debrisGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  }

  setScale(viewportH, fovDeg) {
    const s = viewportH / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    this.add.uniforms.uScale.value = s; this.alpha.uniforms.uScale.value = s;
  }

  light(pos, color, intensity, dur) {
    const L = this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    L.l.position.copy(pos); L.l.color.set(color); L.t = dur; L.d = dur; L.i = intensity;
  }

  mesh(geo, mat, pos, update) {
    const m = new THREE.Mesh(geo, mat); m.position.copy(pos); m.frustumCulled = false; this.scene.add(m);
    this.items.push({ m, t: 0, update });
    return m;
  }

  explosion(pos, radius = 4, opts = {}) {
    const col = opts.color || '#ff8a1f';
    // boule de feu
    this.mesh(G.sph, addMat(col, 1), pos, (m, t) => { const k = Math.min(1, t / 0.12); m.scale.setScalar(radius * (0.3 + 0.75 * k)); m.material.opacity = Math.max(0, 1 - (t - 0.1) / 0.35); return t < 0.45; });
    this.mesh(G.sph, addMat('#fff6c9', 1), pos, (m, t) => { m.scale.setScalar(radius * (0.25 + t * 2.5)); m.material.opacity = Math.max(0, 1 - t / 0.18); return t < 0.18; });
    // anneau au sol
    const rp = pos.clone(); rp.y = Math.max(0.1, pos.y - 0.8);
    this.ring(rp, radius * 1.6, opts.ring || '#ffe7a8', 0.4);
    // étincelles + fumée
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 0.9 + 0.1, s = (10 + Math.random() * 14) * radius / 4;
      this.add.spawn(pos.x, pos.y, pos.z, Math.cos(a) * s * Math.sqrt(1 - u * u), u * s, Math.sin(a) * s * Math.sqrt(1 - u * u), 0.4 + Math.random() * 0.4, 0.5, 0.1, Math.random() < 0.5 ? '#ffd23f' : col, 1, 1.5, 22);
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * 3 * radius / 4;
      this.alpha.spawn(pos.x + Math.cos(a) * radius * 0.3, pos.y + Math.random(), pos.z + Math.sin(a) * radius * 0.3, Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s, 0.9 + Math.random() * 0.7, radius * 0.6, radius * 1.4, Math.random() < 0.5 ? '#6b6080' : '#8a80a0', 0.75, 1.2, -1);
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 4;
      this.add.spawn(pos.x, pos.y, pos.z, Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s, 0.35, radius * 0.7, radius * 1.1, '#ff5a1f', 0.6, 2, 0);
    }
    if (opts.debris) this.debris(pos, opts.debris, 10);
    this.light(pos, '#ffa040', 280 * radius / 4, 0.35);
  }

  debris(pos, colors, n) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshToonMaterial({ color: colors[i % colors.length] });
      const v = new THREE.Vector3((Math.random() - 0.5) * 18, 8 + Math.random() * 10, (Math.random() - 0.5) * 18);
      const rs = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      const sc = 0.5 + Math.random() * 0.9;
      this.mesh(this.debrisGeo, mat, pos, (m, t, dt) => {
        v.y -= 30 * dt; m.position.addScaledVector(v, dt);
        if (m.position.y < 0.2) { m.position.y = 0.2; v.y *= -0.45; v.x *= 0.7; v.z *= 0.7; }
        m.rotation.x += rs.x * dt; m.rotation.y += rs.y * dt;
        if (Math.random() < 0.3) this.alpha.spawn(m.position.x, m.position.y, m.position.z, 0, 1, 0, 0.5, 0.4, 1, '#55506a', 0.5, 0, 0);
        m.scale.setScalar(sc * Math.min(1, (2.2 - t) * 2));
        return t < 2.2;
      });
    }
  }

  ring(pos, radius, color, dur) {
    const m = this.mesh(ringGeo, addMat(color, 0.9), pos, (m, t) => { const k = t / dur; m.scale.setScalar(0.3 * radius + radius * 0.8 * Math.sqrt(k)); m.material.opacity = 0.9 * (1 - k); return t < dur; });
    m.rotation.x = -Math.PI / 2;
    m.material.side = THREE.DoubleSide;
  }

  shockwave(pos, radius) {
    for (let k = 0; k < 2; k++) {
      const m = this.mesh(new THREE.TorusGeometry(1, 0.18, 8, 48), addMat(k ? '#fff7b0' : '#ffe14d', 1), pos, (m, t) => {
        const d = 0.55 + k * 0.1, q = t / d; m.scale.set(radius * q, radius * q, 1 + q * 3); m.material.opacity = 1 - q; return t < d;
      });
      m.rotation.x = -Math.PI / 2; m.position.y += 0.6 + k * 0.5;
    }
    this.mesh(G.sph, addMat('#fff2a0', 0.5), pos, (m, t) => { m.scale.setScalar(radius * t / 0.4); m.material.opacity = 0.5 * (1 - t / 0.4); return t < 0.4; });
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * Math.PI * 2;
      this.add.spawn(pos.x, pos.y + 0.5, pos.z, Math.cos(a) * 28, 2, Math.sin(a) * 28, 0.4, 0.8, 0.2, '#ffe14d', 1, 2, 0);
      this.alpha.spawn(pos.x, pos.y + 0.3, pos.z, Math.cos(a) * 16, 1, Math.sin(a) * 16, 0.7, 1, 2.5, '#fffbe0', 0.5, 2, 0);
    }
    this.light(pos, '#ffe14d', 400, 0.4);
  }

  beam(from, to, color) {
    const d = to.clone().sub(from), len = d.length();
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    for (const [r, c, dur] of [[0.45, color, 0.35], [0.16, '#ffffff', 0.25]]) {
      const m = this.mesh(beamGeo, addMat(c, 1), mid, (m, t) => { const k = t / dur; m.scale.set(r * (1 - k * 0.7), len, r * (1 - k * 0.7)); m.material.opacity = 1 - k; return t < dur; });
      m.quaternion.copy(q);
    }
    for (let i = 0; i < 30; i++) {
      const t = Math.random();
      this.add.spawn(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, from.z + (to.z - from.z) * t, (Math.random() - 0.5) * 4, Math.random() * 4, (Math.random() - 0.5) * 4, 0.4, 0.5, 0, color, 1, 1, 0);
    }
    this.burst(to, color, 16, 10);
    this.light(from, color, 150, 0.2);
  }

  burst(pos, color, n = 12, speed = 8, size = 0.45) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = speed * (0.4 + Math.random() * 0.6), r = Math.sqrt(1 - u * u);
      this.add.spawn(pos.x, pos.y, pos.z, Math.cos(a) * r * s, u * s + 2, Math.sin(a) * r * s, 0.3 + Math.random() * 0.3, size, 0.05, color, 1, 2, 12);
    }
  }

  muzzle(pos, color) {
    this.add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.06, 1.6, 0.6, '#fff4c2', 1, 0, 0);
    this.add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.1, 1.1, 0.2, color, 1, 0, 0);
  }

  pickup(pos) {
    const cols = ['#ff4d6d', '#ffd23f', '#3ed46b', '#3b7cff', '#c86bff'];
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 8;
      this.add.spawn(pos.x, pos.y, pos.z, Math.cos(a) * s, 3 + Math.random() * 8, Math.sin(a) * s, 0.5 + Math.random() * 0.4, 0.5, 0.1, cols[i % 5], 1, 1.5, 18);
    }
    this.ring(pos, 3, '#ffffff', 0.3);
  }

  confetti(pos, n = 80) {
    const cols = ['#ff4d6d', '#ffd23f', '#3ed46b', '#3b7cff', '#c86bff', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 10;
      this.alpha.spawn(pos.x, pos.y, pos.z, Math.cos(a) * s, 10 + Math.random() * 12, Math.sin(a) * s, 2 + Math.random(), 0.45, 0.45, cols[i % cols.length], 1, 1.2, 9);
    }
  }

  update(dt) {
    this.add.update(dt); this.alpha.update(dt);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.t += dt;
      if (!it.update(it.m, it.t, dt)) {
        this.scene.remove(it.m);
        if (it.m.material.dispose && it.m.material !== this._keep) it.m.material.dispose();
        if (it.m.geometry !== G.sph && it.m.geometry !== ringGeo && it.m.geometry !== beamGeo && it.m.geometry !== this.debrisGeo) it.m.geometry.dispose();
        this.items.splice(i, 1);
      }
    }
    for (const L of this.lights) {
      if (L.t > 0) { L.t -= dt; L.l.intensity = L.i * Math.max(0, L.t / L.d); } else if (L.l.intensity !== 0) L.l.intensity = 0;
    }
  }

  dispose() {
    for (const it of this.items) this.scene.remove(it.m);
    this.items.length = 0;
  }
}
