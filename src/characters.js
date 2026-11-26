// Personnages (skins) et karts, construits en primitives low-poly avec un rendu toon.
import * as THREE from 'three';

const GRAD = (() => {
  const t = new THREE.DataTexture(new Uint8Array([155, 210, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
})();

const matCache = new Map();
export function toon(color, opts = {}, cache = true) {
  const key = color + JSON.stringify(opts);
  if (cache && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: GRAD, ...opts });
  if (cache) matCache.set(key, m);
  return m;
}

export const G = {
  sph: new THREE.SphereGeometry(1, 22, 14),
  sphLo: new THREE.IcosahedronGeometry(1, 1),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 18),
  cone: new THREE.ConeGeometry(1, 1, 14),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  torus: new THREE.TorusGeometry(1, 0.22, 8, 20),
  arm: new THREE.CapsuleGeometry(0.075, 0.36, 4, 8),
};

export const CHARACTERS = [
  { id: 'matou', name: 'Matou', fur: '#ff9a3c', belly: '#fff1dc', ears: 'cat', nose: '#ff6b8b', whiskers: true },
  { id: 'toutou', name: 'Toutou', fur: '#e9c49c', belly: '#fff6ea', ears: 'dog', earColor: '#8a5a3b', muzzle: true, nose: '#3b2a22' },
  { id: 'crapouille', name: 'Crapouille', fur: '#7ed957', belly: '#e9ffd0', ears: 'frog' },
  { id: 'bambou', name: 'Bambou', fur: '#ffffff', belly: '#ffffff', ears: 'bear', earColor: '#2b2b33', patches: '#2b2b33', muzzle: true, nose: '#2b2b33' },
  { id: 'roux', name: 'Roux', fur: '#ff6a2b', belly: '#ffffff', ears: 'fox', earColor: '#ff6a2b', muzzle: true, nose: '#2b2b33' },
  { id: 'boulon', name: 'Boulon', fur: '#a9b8c9', belly: '#d7e0ea', ears: 'robot' },
  { id: 'glacon', name: 'Glaçon', fur: '#2d3a5a', belly: '#ffffff', ears: 'none', beak: '#ffb02e', face: '#ffffff' },
  { id: 'carotte', name: 'Carotte', fur: '#f6edff', belly: '#ffffff', ears: 'bunny', inner: '#ffb3d1', nose: '#ff7aa8' },
  { id: 'piou', name: 'Piou', fur: '#ffd93b', belly: '#fff3a8', ears: 'tuft', beak: '#ff8c1a' },
  { id: 'zorg', name: 'Zorg', fur: '#9b6bff', belly: '#c9b0ff', ears: 'antenna', eyes3: true },
  { id: 'groin', name: 'Groin', fur: '#ffa6c1', belly: '#ffd0de', ears: 'pig' },
  { id: 'nounours', name: 'Nounours', fur: '#9a6a43', belly: '#e9c89e', ears: 'bear', earColor: '#9a6a43', muzzle: true, nose: '#3b2a22' },
];

export const PAINTS = [
  { id: 'rouge', name: 'Rouge', main: '#ff4d4d', accent: '#2f6bff' },
  { id: 'bleu', name: 'Bleu', main: '#3b7cff', accent: '#ffd23f' },
  { id: 'jaune', name: 'Jaune', main: '#ffcf2e', accent: '#ff4d6d' },
  { id: 'vert', name: 'Vert', main: '#3ed46b', accent: '#ffffff' },
  { id: 'violet', name: 'Violet', main: '#9b5cff', accent: '#5cf2ff' },
  { id: 'rose', name: 'Rose', main: '#ff6fb5', accent: '#ffffff' },
  { id: 'noir', name: 'Carbone', main: '#2e3140', accent: '#ff7a1a' },
  { id: 'blanc', name: 'Neige', main: '#f2f4ff', accent: '#ff3b5c' },
];

export const charById = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
export const paintById = id => PAINTS.find(p => p.id === id) || PAINTS[0];

function partFactory(M, defaultParent) {
  return (geo, color, pos, scl, rot, parent = defaultParent) => {
    const m = new THREE.Mesh(geo, typeof color === 'string' ? M(color) : color);
    m.position.set(pos[0], pos[1], pos[2]);
    if (scl) m.scale.set(scl[0], scl[1], scl[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
}

// Tête seule (aussi utilisée pour les portraits du menu)
export function buildHead(def, M = c => toon(c)) {
  const head = new THREE.Group();
  const P = partFactory(M, head);
  const eyes = [];
  const robot = def.ears === 'robot';
  if (robot) {
    P(G.box, def.fur, [0, 0, 0], [1.0, 0.86, 0.9]);
    P(G.box, '#7f8ea3', [0, 0.45, 0], [0.7, 0.06, 0.6]);
    P(G.cyl, '#7f8ea3', [0, 0.6, 0], [0.03, 0.3, 0.03]);
    const ball = P(G.sph, '#ff3b5c', [0, 0.78, 0], [0.09, 0.09, 0.09]);
    ball.material = new THREE.MeshBasicMaterial({ color: '#ff5470' });
    P(G.box, '#3a4252', [0, -0.24, 0.46], [0.42, 0.12, 0.04]);
    for (let i = -2; i <= 2; i++) P(G.box, '#c3cedb', [i * 0.08, -0.24, 0.48], [0.02, 0.1, 0.02]);
    P(G.cyl, '#7f8ea3', [0.52, 0, 0], [0.12, 0.08, 0.12], [0, 0, Math.PI / 2]);
    P(G.cyl, '#7f8ea3', [-0.52, 0, 0], [0.12, 0.08, 0.12], [0, 0, Math.PI / 2]);
  } else {
    P(G.sph, def.fur, [0, 0, 0], [0.56, 0.5, 0.52]);
  }
  if (def.face) P(G.sph, def.face, [0, -0.04, 0.12], [0.46, 0.4, 0.44]);
  if (def.patches) {
    P(G.sph, def.patches, [0.2, 0.05, 0.38], [0.15, 0.19, 0.08], [0, 0, -0.5]);
    P(G.sph, def.patches, [-0.2, 0.05, 0.38], [0.15, 0.19, 0.08], [0, 0, 0.5]);
  }
  // Yeux globuleux
  const frog = def.ears === 'frog';
  const eyeY = frog ? 0.4 : 0.07, eyeZ = frog ? 0.22 : 0.4, eyeX = frog ? 0.24 : 0.2, eyeS = frog ? 0.2 : 0.19;
  const mkEye = (x, y, z, s) => {
    const e = new THREE.Group(); e.position.set(x, y, z); head.add(e);
    if (frog) P(G.sph, def.fur, [0, -0.02, -0.04], [s * 1.18, s * 1.18, s * 1.18], null, e);
    const white = robot ? new THREE.MeshBasicMaterial({ color: '#7ff6ff' }) : '#ffffff';
    P(G.sph, white, [0, 0, 0], [s, s, s * 0.95], null, e);
    const pupil = new THREE.Group(); pupil.position.set(0, 0, s * 0.72); e.add(pupil);
    P(G.sph, robot ? '#0f3b5a' : '#16161f', [0, 0, 0], [s * 0.5, s * 0.5, s * 0.4], null, pupil);
    P(G.sph, new THREE.MeshBasicMaterial({ color: '#ffffff' }), [s * 0.18, s * 0.2, s * 0.32], [s * 0.15, s * 0.15, s * 0.1], null, pupil);
    eyes.push({ group: e, pupil, s });
  };
  mkEye(eyeX, eyeY, eyeZ, eyeS); mkEye(-eyeX, eyeY, eyeZ, eyeS);
  if (def.eyes3) mkEye(0, 0.32, 0.38, 0.15);
  // Museau / bec / nez
  if (def.muzzle) {
    P(G.sph, def.belly, [0, -0.13, 0.42], [0.22, 0.15, 0.13]);
    P(G.sph, def.nose, [0, -0.06, 0.55], [0.08, 0.06, 0.05]);
  } else if (def.nose && !def.beak) {
    P(G.sph, def.nose, [0, -0.08, 0.51], [0.06, 0.045, 0.04]);
  }
  if (def.beak) P(G.cone, def.beak, [0, -0.1, 0.56], [0.1, 0.22, 0.08], [Math.PI / 2, 0, 0]);
  if (def.ears === 'pig') {
    P(G.cyl, '#ff8fb0', [0, -0.1, 0.5], [0.15, 0.12, 0.11], [Math.PI / 2, 0, 0]);
    P(G.sph, '#a8436a', [0.05, -0.1, 0.56], [0.025, 0.04, 0.02]);
    P(G.sph, '#a8436a', [-0.05, -0.1, 0.56], [0.025, 0.04, 0.02]);
  }
  if (def.whiskers) for (const s of [1, -1]) for (let i = 0; i < 2; i++) {
    P(G.box, '#5b3a2a', [s * 0.36, -0.12 - i * 0.06, 0.44], [0.26, 0.012, 0.012], [0, s * 0.2, s * (i ? -0.15 : 0.1)]);
  }
  // Bouche
  if (!robot) {
    const my = def.muzzle ? -0.25 : (def.beak ? -0.24 : -0.2);
    P(G.sph, '#5a1a2a', [0, my, 0.46], [0.13, 0.075, 0.06]);
    P(G.sph, '#ff6f8f', [0, my - 0.03, 0.48], [0.07, 0.035, 0.03]);
    P(G.box, '#ffffff', [0.035, my + 0.04, 0.5], [0.045, 0.05, 0.02]);
    P(G.box, '#ffffff', [-0.035, my + 0.04, 0.5], [0.045, 0.05, 0.02]);
    P(G.sph, '#ff9fb5', [0.33, -0.12, 0.34], [0.08, 0.05, 0.03], [0, 0.6, 0]);
    P(G.sph, '#ff9fb5', [-0.33, -0.12, 0.34], [0.08, 0.05, 0.03], [0, -0.6, 0]);
  }
  // Oreilles et accessoires
  const ec = def.earColor || def.fur;
  switch (def.ears) {
    case 'cat':
      for (const s of [1, -1]) {
        P(G.cone4, ec, [s * 0.3, 0.42, -0.02], [0.17, 0.3, 0.12], [0, Math.PI / 4, s * -0.35]);
        P(G.cone4, '#ffb3c6', [s * 0.29, 0.4, 0.03], [0.1, 0.2, 0.06], [0, Math.PI / 4, s * -0.35]);
      }
      break;
    case 'dog':
      for (const s of [1, -1]) P(G.sph, ec, [s * 0.52, 0.02, -0.02], [0.12, 0.3, 0.2], [0, 0, s * 0.35]);
      break;
    case 'bear':
      for (const s of [1, -1]) {
        P(G.sph, ec, [s * 0.36, 0.4, -0.04], [0.16, 0.16, 0.1]);
        P(G.sph, def.patches ? '#555566' : def.belly, [s * 0.36, 0.4, 0.02], [0.09, 0.09, 0.06]);
      }
      break;
    case 'fox':
      for (const s of [1, -1]) {
        P(G.cone4, ec, [s * 0.3, 0.48, -0.04], [0.2, 0.42, 0.12], [0, Math.PI / 4, s * -0.3]);
        P(G.cone4, '#2b2b33', [s * 0.36, 0.66, -0.04], [0.08, 0.12, 0.05], [0, Math.PI / 4, s * -0.3]);
      }
      break;
    case 'bunny':
      for (const s of [1, -1]) {
        const ear = new THREE.Group(); ear.position.set(s * 0.17, 0.4, -0.05); ear.rotation.z = s * -0.18; head.add(ear);
        P(G.sph, def.fur, [0, 0.36, 0], [0.11, 0.38, 0.08], null, ear);
        P(G.sph, def.inner, [0, 0.36, 0.04], [0.06, 0.3, 0.05], null, ear);
      }
      break;
    case 'tuft':
      for (let i = -1; i <= 1; i++) P(G.cone, def.fur, [i * 0.08, 0.55, 0], [0.06, 0.22, 0.06], [0, 0, i * -0.4]);
      break;
    case 'antenna':
      for (const s of [1, -1]) {
        P(G.cyl, def.fur, [s * 0.2, 0.62, 0], [0.025, 0.32, 0.025], [0, 0, s * -0.35]);
        const b = P(G.sph, '#b6ff3b', [s * 0.32, 0.8, 0], [0.08, 0.08, 0.08]);
        b.material = new THREE.MeshBasicMaterial({ color: '#c8ff5a' });
      }
      break;
    case 'pig':
      for (const s of [1, -1]) P(G.cone4, def.fur, [s * 0.32, 0.4, 0.05], [0.14, 0.2, 0.08], [0.5, Math.PI / 4, s * -0.5]);
      break;
    case 'frog':
      break;
  }
  return { head, eyes };
}

// Personnage complet assis dans le kart (face à +Z)
export function buildCharacter(def, M) {
  const g = new THREE.Group();
  const P = partFactory(M, g);
  P(G.sph, def.fur, [0, 0.8, -0.32], [0.38, 0.4, 0.34]);
  P(G.sph, def.belly || def.fur, [0, 0.76, -0.17], [0.27, 0.3, 0.2]);
  const { head, eyes } = buildHead(def, M);
  head.position.set(0, 1.42, -0.24);
  g.add(head);
  // Bras vers le volant
  const arm = (sx) => {
    const a = new THREE.Vector3(sx * 0.3, 0.94, -0.26), b = new THREE.Vector3(sx * 0.17, 0.97, 0.36);
    const m = new THREE.Mesh(G.arm, M(def.fur));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.castShadow = true; g.add(m);
    P(G.sph, def.belly || def.fur, [b.x, b.y, b.z], [0.09, 0.09, 0.09]);
  };
  arm(1); arm(-1);
  return { group: g, head, eyes };
}

const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb12e', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const flameCore = new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });

export function buildKart(charDef, paintDef, perInstance = true) {
  const mats = [];
  const cache = new Map();
  const M = c => {
    if (!perInstance) return toon(c);
    if (!cache.has(c)) { const m = toon(c, {}, false); cache.set(c, m); mats.push(m); }
    return cache.get(c);
  };
  const root = new THREE.Group();
  const tilt = new THREE.Group(); root.add(tilt);
  const body = new THREE.Group(); tilt.add(body);
  const P = partFactory(M, body);
  const main = paintDef.main, acc = paintDef.accent, dark = '#2c2d3a', metal = '#c9cfdb';

  P(G.box, dark, [0, 0.32, 0], [1.42, 0.18, 2.3]);
  P(G.box, main, [0, 0.56, 0.1], [1.08, 0.42, 1.5]);
  P(G.box, main, [0, 0.5, 0.95], [0.98, 0.3, 0.62], [0.12, 0, 0]);
  P(G.box, '#ffffff', [0, 0.78, 0.15], [0.26, 0.03, 1.3]);
  P(G.cyl, acc, [0, 0.4, 1.28], [0.15, 1.35, 0.15], [0, 0, Math.PI / 2]);
  for (const s of [1, -1]) {
    P(G.box, acc, [s * 0.68, 0.47, 0.02], [0.32, 0.34, 1.12]);
    P(G.box, '#ffffff', [s * 0.845, 0.5, 0.02], [0.02, 0.1, 0.9]);
  }
  P(G.box, dark, [0, 0.86, -0.5], [0.72, 0.56, 0.22]);
  P(G.box, '#45465a', [0, 0.66, -0.3], [0.7, 0.12, 0.5]);
  P(G.box, metal, [0, 0.64, -0.98], [0.92, 0.42, 0.5]);
  P(G.box, '#8e95a6', [0, 0.88, -0.98], [0.7, 0.08, 0.36]);
  const exhausts = [];
  for (const s of [1, -1]) {
    P(G.cyl, metal, [s * 0.26, 0.8, -1.28], [0.09, 0.5, 0.09], [-1.0, 0, 0]);
    P(G.cyl, '#3a3a44', [s * 0.26, 0.93, -1.47], [0.07, 0.04, 0.07], [-1.0, 0, 0]);
    exhausts.push(new THREE.Vector3(s * 0.26, 0.95, -1.5));
  }
  // Aileron
  P(G.box, acc, [0, 1.18, -1.15], [1.55, 0.08, 0.38]);
  P(G.box, main, [0.72, 1.12, -1.15], [0.06, 0.28, 0.42]);
  P(G.box, main, [-0.72, 1.12, -1.15], [0.06, 0.28, 0.42]);
  for (const s of [1, -1]) P(G.box, dark, [s * 0.35, 0.95, -1.12], [0.06, 0.4, 0.1]);
  // Volant
  P(G.cyl, dark, [0, 0.82, 0.48], [0.04, 0.32, 0.04], [-0.9, 0, 0]);
  P(G.torus, dark, [0, 0.96, 0.38], [0.19, 0.19, 0.19], [-0.65, 0, 0]);

  // Roues (sur tilt, pas sur body pour éviter le rebond)
  const W = partFactory(M, tilt);
  const mkWheel = (x, z, r, w, front) => {
    const pivot = new THREE.Group(); pivot.position.set(x, r, z); tilt.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    W(G.cyl, '#26262f', [0, 0, 0], [r, w, r], [0, 0, Math.PI / 2], spin);
    W(G.cyl, '#3a3b48', [Math.sign(x) * (w / 2 + 0.005), 0, 0], [r * 0.82, 0.02, r * 0.82], [0, 0, Math.PI / 2], spin);
    W(G.cyl, front ? acc : '#ffffff', [Math.sign(x) * (w / 2 + 0.015), 0, 0], [r * 0.45, 0.03, r * 0.45], [0, 0, Math.PI / 2], spin);
    W(G.box, '#ffffff', [Math.sign(x) * (w / 2 + 0.02), r * 0.25, 0], [0.02, r * 0.4, 0.08], null, spin);
    return { pivot, spin, r };
  };
  const wheels = {
    fl: mkWheel(0.84, 0.86, 0.38, 0.34, true), fr: mkWheel(-0.84, 0.86, 0.38, 0.34, true),
    rl: mkWheel(0.88, -0.86, 0.45, 0.44, false), rr: mkWheel(-0.88, -0.86, 0.45, 0.44, false),
  };

  const ch = buildCharacter(charDef, M);
  ch.group.position.set(0, 0.04, -0.12);
  body.add(ch.group);

  // Flammes de boost
  const flames = [];
  for (const e of exhausts) {
    const f = new THREE.Group(); f.position.copy(e); f.rotation.x = -1.0; body.add(f);
    const outer = new THREE.Mesh(G.cone, flameMat); outer.scale.set(0.16, 0.7, 0.16); outer.position.y = 0.35; f.add(outer);
    const core = new THREE.Mesh(G.cone, flameCore); core.scale.set(0.08, 0.4, 0.08); core.position.y = 0.2; f.add(core);
    f.visible = false;
    flames.push(f);
  }

  root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return { root, tilt, body, wheels, char: ch, head: ch.head, eyes: ch.eyes, flames, mats, exhausts };
}
