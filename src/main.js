// TerroristKart : démarrage, menus, garage, lobby (local + en ligne), lancement des parties, résultats.
import * as THREE from 'three';
import { CHARACTERS, PAINTS, charById, paintById, buildKart, buildHead, toon, G } from './characters.js';
import { Input, DEVICE_LABEL, IS_TOUCH, TouchControls } from './input.js';
import { Audio } from './audio.js';
import { Game } from './game.js';
import { Net } from './net.js';
import { WEAPONS, ICONS } from './weapons.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------ réglages
const DEFAULTS = { name: '', char: 'matou', paint: 'rouge', music: 0, sfx: 0, quality: IS_TOUCH ? 'low' : 'medium', bots: 5, duration: 3, difficulty: 'normal' };
const S = Object.assign({}, DEFAULTS, (() => { try { return JSON.parse(localStorage.getItem('terroristkart') || '{}'); } catch (e) { return {}; } })());
// v2 : le son démarre coupé (une seule fois pour les joueurs qui avaient déjà des réglages)
if (S.v !== 2) { S.music = 0; S.sfx = 0; S.v = 2; }
if (!S.name) S.name = ['Turbo', 'Nitro', 'Boum', 'Zigzag', 'Pneu', 'Vroum'][Math.floor(Math.random() * 6)] + Math.floor(Math.random() * 90 + 10);
const save = () => { try { localStorage.setItem('terroristkart', JSON.stringify(S)); } catch (e) { /* stockage indisponible */ } };
const DURATIONS = [2, 3, 5, 8], DIFFS = ['facile', 'normal', 'difficile'], DIFF_LABEL = { facile: 'Facile', normal: 'Normal', difficile: 'Difficile' };
const BOT_NAMES = ['TurboGlouton', 'Pneu-Crevé', 'MissileMax', 'Vroumette', 'Kamikaze', 'DriftKing', 'Chaussette', 'BoumBoum', 'Zigzag', 'Patatras', 'Nitroglu', 'Sacripant', 'Gros Bidou', 'Fusée Rose'];

// ------------------------------------------------------------------ moteur
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.domElement.id = 'c';
document.body.insertBefore(renderer.domElement, $('#hud'));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);
const applyQuality = () => { renderer.setPixelRatio(Math.min(devicePixelRatio, S.quality === 'high' ? 2 : S.quality === 'medium' ? 1.5 : 1)); renderer.setSize(innerWidth, innerHeight); };
applyQuality();

const input = new Input();
const audio = new Audio();
audio.setVolumes(S.music, S.sfx);
let game = null, net = null, lastDevice = IS_TOUCH ? 'touch' : 'kbL';
input.touch = new TouchControls($('#touch'));
addEventListener('pointerdown', e => { if (e.pointerType === 'touch') lastDevice = 'touch'; }, true);
const unlockAudio = () => { audio.init(); };
addEventListener('pointerdown', unlockAudio); addEventListener('keydown', unlockAudio);

// ------------------------------------------------------------------ vitrine 3D des menus
const menu = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(32, 1, 0.1, 200), karts: [], t: 0, mode: 'title', shapes: [] };
{
  const sc = menu.scene;
  sc.add(new THREE.HemisphereLight('#eaf4ff', '#9a86ff', 1.5));
  const d = new THREE.DirectionalLight('#ffffff', 2.2); d.position.set(4, 8, 6); d.castShadow = true; d.shadow.mapSize.set(1024, 1024);
  Object.assign(d.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); sc.add(d);
  const rim = new THREE.DirectionalLight('#ff9be0', 1.2); rim.position.set(-6, 3, -6); sc.add(rim);
  const shapeCols = ['#ff5cc8', '#ffd23f', '#5ce1ff', '#7dff9b', '#b36bff', '#ff8a5c'];
  const geos = [G.box, G.sphLo, G.torus, G.cone];
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(geos[i % 4], toon(shapeCols[i % shapeCols.length], { flatShading: true }));
    const a = Math.random() * Math.PI * 2, r = 9 + Math.random() * 10;
    m.position.set(Math.sin(a) * r, -3 + Math.random() * 10, -8 - Math.random() * 14);
    m.scale.setScalar(0.4 + Math.random() * 0.8);
    m.userData = { rs: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(0.8), base: m.position.y, ph: Math.random() * 7 };
    sc.add(m); menu.shapes.push(m);
  }
}
function makeTurntable() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.35, 0.3, 40), toon('#ffffff')); disc.position.y = -0.15; disc.receiveShadow = true; g.add(disc);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.37, 2.37, 0.12, 40), toon('#ff5cc8')); band.position.y = -0.2; g.add(band);
  return g;
}
function setMenuKarts(list) {
  for (const k of menu.karts) menu.scene.remove(k.g);
  menu.karts = list.map((d, i) => {
    const g = new THREE.Group();
    const tt = makeTurntable(); g.add(tt);
    const kart = buildKart(charById(d.char), paintById(d.paint), false);
    kart.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.add(kart.root);
    menu.scene.add(g);
    return { g, kart, d, i, spin: Math.random() * 6, hop: 0 };
  });
  layoutMenuKarts();
}
function layoutMenuKarts() {
  const n = menu.karts.length, m = menu.mode, aspect = innerWidth / innerHeight;
  menu.cam.aspect = aspect; menu.cam.updateProjectionMatrix();
  if (m === 'lobby') {
    menu.cam.position.set(0, 3.2, 17); menu.cam.lookAt(0, 1.6, 0);
    const w = Math.min(15, 9.2 * aspect / 1.78);
    menu.karts.forEach((k, i) => { k.g.position.set(-w / 2 + w * (k.d.slot + 0.5) / 4, 1.6, 0); k.g.scale.setScalar(0.85); });
  } else if (m === 'garage') {
    menu.cam.position.set(0, 2.6, 11); menu.cam.lookAt(0, 0.6, 0);
    menu.karts.forEach(k => { k.g.position.set(aspect > 1.2 ? 2.3 : 0, -0.4, 0); k.g.scale.setScalar(1.1); });
  } else {
    menu.cam.position.set(0, 2.2, 13); menu.cam.lookAt(0, -1.0, 0);
    menu.karts.forEach(k => { k.g.position.set(0, -0.2, 0); k.g.scale.setScalar(0.78); });
  }
}
function renderMenu(dt) {
  menu.t += dt;
  for (const k of menu.karts) {
    k.spin += dt * 0.6;
    k.kart.root.rotation.y = menu.mode === 'garage' ? Math.sin(menu.t * 0.5) * 0.9 + 0.5 : k.spin;
    k.g.children[0].rotation.y = k.kart.root.rotation.y;
    k.hop = Math.max(0, k.hop - dt * 3);
    k.kart.root.position.y = Math.sin(k.hop * Math.PI) * 0.6;
    k.kart.body.scale.y = 1 + Math.sin(menu.t * 6 + k.i) * 0.015;
    for (const w of Object.values(k.kart.wheels)) w.spin.rotation.x += dt * 4;
    for (const e of k.kart.eyes) { const b = (menu.t + k.i * 1.3) % 3.4 < 0.12; e.group.scale.y = b ? 0.1 : 1; }
    k.kart.head.rotation.z = Math.sin(menu.t * 2 + k.i) * 0.08;
  }
  for (const m of menu.shapes) { m.rotation.x += m.userData.rs.x * dt; m.rotation.y += m.userData.rs.y * dt; m.position.y = m.userData.base + Math.sin(menu.t + m.userData.ph) * 0.6; }
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderer.render(menu.scene, menu.cam);
}
function hopKart(slot) { const k = menu.karts.find(x => x.d.slot === slot) || menu.karts[0]; if (k) k.hop = 1; }

// ------------------------------------------------------------------ portraits
const PORTRAITS = {};
function makePortraits() {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(160, 160); r.setClearColor(0x000000, 0);
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight('#ffffff', '#b9a7ff', 1.6));
  const d = new THREE.DirectionalLight('#ffffff', 2); d.position.set(2, 3, 4); sc.add(d);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20); cam.position.set(0.5, 0.25, 3.2); cam.lookAt(0, 0.08, 0);
  for (const c of CHARACTERS) {
    const { head } = buildHead(c);
    head.rotation.y = 0.25;
    sc.add(head); r.render(sc, cam); PORTRAITS[c.id] = r.domElement.toDataURL(); sc.remove(head);
  }
  r.dispose(); r.forceContextLoss();
}

// ------------------------------------------------------------------ écrans + navigation
let screen = null;
const history = [];
function show(id, push = true) {
  if (screen && push && screen !== id) history.push(screen);
  screen = id;
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 's-' + id));
  setFocus(null);
  const first = $(`#s-${id} [data-autofocus]`) || navables()[0];
  if (id !== 'lobby') setFocus(first);
  if (['title', 'garage', 'lobby', 'online', 'options', 'help'].includes(id)) {
    const mode = id === 'lobby' ? 'lobby' : id === 'garage' ? 'garage' : 'title';
    if (mode !== menu.mode || id === 'title' || id === 'garage') { menu.mode = mode; refreshMenuKarts(); }
  }
}
function back() {
  audio.play('back', 0.8);
  if (screen === 'lobby') return leaveLobby();
  const prev = history.pop() || 'title';
  show(prev, false);
}
function refreshMenuKarts() {
  if (menu.mode === 'lobby') setMenuKarts(lobby.slots.map((s, i) => ({ char: s.char, paint: s.paint, slot: i })));
  else setMenuKarts([{ char: S.char, paint: S.paint, slot: 0 }]);
}
let focusEl = null;
function navables() { return screen ? [...$(`#s-${screen}`).querySelectorAll('[data-nav]')].filter(e => e.offsetParent !== null && !e.disabled) : []; }
function setFocus(e) {
  if (focusEl) focusEl.classList.remove('focus');
  focusEl = e;
  if (e) { e.classList.add('focus'); if (e.tagName !== 'INPUT') e.scrollIntoView?.({ block: 'nearest' }); }
}
function moveFocus(dir) {
  const list = navables(); if (!list.length) return;
  if (!focusEl || !list.includes(focusEl)) { setFocus(list[0]); return; }
  const a = focusEl.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bs = Infinity;
  for (const e of list) {
    if (e === focusEl) continue;
    const b = e.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2, dx = bx - ax, dy = by - ay;
    const ok = dir === 'left' ? dx < -4 : dir === 'right' ? dx > 4 : dir === 'up' ? dy < -4 : dy > 4;
    if (!ok) continue;
    const main = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy), cross = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const s = main + cross * 2.5;
    if (s < bs) { bs = s; best = e; }
  }
  if (best) { setFocus(best); audio.play('ui', 0.6); }
}
function activate(e) {
  if (!e) return;
  if (e.tagName === 'INPUT' && e.type === 'text') { e.focus(); return; }
  e.click();
}
document.addEventListener('mouseover', e => { const t = e.target.closest('[data-nav]'); if (t && navables().includes(t)) setFocus(t); });
document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (t) { audio.init(); audio.play('ok', 0.6); if (!lastDevice.startsWith('gp') && lastDevice !== 'touch') lastDevice = 'kbL'; }
  const go = e.target.closest('[data-go]'); if (go) show(go.dataset.go);
  if (e.target.closest('[data-back]')) back();
});
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), ms); }

// ------------------------------------------------------------------ titre / garage / options
const nameIn = $('#name');
nameIn.value = S.name;
nameIn.addEventListener('input', () => { S.name = nameIn.value.trim().slice(0, 14) || 'Pilote'; save(); if (lobby.slots[0]) { lobby.slots[0].name = S.name; renderSlots(); syncSlots(); } });
nameIn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') nameIn.blur(); });
const updateTitleSkin = () => { $('#title-skin').textContent = `${charById(S.char).name} · ${paintById(S.paint).name}`; $('#garage-name').textContent = charById(S.char).name; };

function buildGarage() {
  $('#grid-chars').innerHTML = CHARACTERS.map(c => `<button class="char-btn ${c.id === S.char ? 'sel' : ''}" data-char="${c.id}" data-nav><img src="${PORTRAITS[c.id]}" alt=""><span>${c.name}</span></button>`).join('');
  $('#paints').innerHTML = PAINTS.map(p => `<button class="paint-btn ${p.id === S.paint ? 'sel' : ''}" data-paint="${p.id}" style="background:${p.main}" title="${p.name}" data-nav><i style="background:${p.accent}"></i></button>`).join('');
}
$('#grid-chars').addEventListener('click', e => { const b = e.target.closest('[data-char]'); if (!b) return; S.char = b.dataset.char; save(); $$('.char-btn').forEach(x => x.classList.toggle('sel', x === b)); updateTitleSkin(); refreshMenuKarts(); hopKart(0); });
$('#paints').addEventListener('click', e => { const b = e.target.closest('[data-paint]'); if (!b) return; S.paint = b.dataset.paint; save(); $$('.paint-btn').forEach(x => x.classList.toggle('sel', x === b)); updateTitleSkin(); refreshMenuKarts(); hopKart(0); });

// Volume : un seul point d'entrée, synchronise tous les curseurs (options, pause, en jeu)
let lastVol = { music: 0.5, sfx: 0.8 };
function setVol(music, sfx) {
  S.music = Math.max(0, Math.min(1, music)); S.sfx = Math.max(0, Math.min(1, sfx));
  audio.setVolumes(S.music, S.sfx); save();
  for (const id of ['#o-music', '#p-music']) { const e = $(id); if (e) e.value = S.music; }
  for (const id of ['#o-sfx', '#p-sfx']) { const e = $(id); if (e) e.value = S.sfx; }
  const muted = S.music === 0 && S.sfx === 0;
  const pm = $('#p-mute'); if (pm) pm.textContent = muted ? '🔊 Remettre le son' : '🔇 Couper le son';
}
function toggleMute() {
  if (S.music === 0 && S.sfx === 0) setVol(lastVol.music || 0.5, lastVol.sfx || 0.8);
  else { lastVol = { music: S.music, sfx: S.sfx }; setVol(0, 0); }
  audio.init(); audio.play('ui', 1);
}
const bindVol = (m, f) => {
  $(m).addEventListener('input', e => setVol(+e.target.value, S.sfx));
  $(f).addEventListener('input', e => { setVol(S.music, +e.target.value); audio.play('ui', 1); });
};
bindVol('#o-music', '#o-sfx'); bindVol('#p-music', '#p-sfx');
$('#p-mute').addEventListener('click', toggleMute);
addEventListener('keydown', e => { if (e.code === 'KeyM' && game && !(e.target && e.target.tagName === 'INPUT')) toggleMute(); });
setVol(S.music, S.sfx);

const markQuality = () => $$('#o-quality [data-q]').forEach(b => b.classList.toggle('sel', b.dataset.q === S.quality));
$('#o-quality').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (!b) return; S.quality = b.dataset.q; save(); markQuality(); applyQuality(); });
markQuality();
$('#o-full').addEventListener('click', () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); });
$('#help-weapons').innerHTML = Object.entries(WEAPONS).map(([k, w]) => `<div><img src="${ICONS[k]}"><span><b>${w.name}</b><br>${{ minigun: 'Rafale continue, maintiens le tir', cannon: 'Boulet en cloche, grosse explosion', fireball: 'Rebondit au sol', rocket: 'Tête chercheuse', mine: 'Posée derrière toi', laser: 'Rayon instantané, très précis', shock: 'Explosion autour de toi', shield: 'Invincible 6 s, percute !', turbo: '3 accélérations' }[k]}</span></div>`).join('');

// ------------------------------------------------------------------ lobby
const lobby = { mode: 'local', slots: [], remote: [], peers: new Map(), host: true, busy: false };
function freeChar(exclude) { const used = new Set(exclude); return (CHARACTERS.find(c => !used.has(c.id)) || CHARACTERS[0]).id; }
function enterLobby(mode) {
  lobby.mode = mode; lobby.slots = [];
  addSlot(lastDevice, true);
  $('#lobby-title').textContent = mode === 'local' ? 'Partie locale' : 'Salon en ligne';
  $('#room-box').classList.toggle('hidden', mode === 'local');
  $('#lobby-spacer').classList.toggle('hidden', mode !== 'local');
  $('#remote').classList.toggle('hidden', mode === 'local');
  const canEdit = mode === 'local' || (net && net.isHost);
  $('#lobby-settings').classList.toggle('hidden', !canEdit);
  $('#b-start').classList.toggle('hidden', !canEdit);
  $('#lobby-wait').classList.toggle('hidden', canEdit);
  renderSettings(); renderSlots(); renderRemote();
  show('lobby');
  audio.music('menu');
}
function addSlot(device, first = false) {
  if (lobby.slots.length >= 4 || lobby.slots.some(s => s.device === device)) return;
  const i = lobby.slots.length;
  const s = { device, char: first ? S.char : freeChar(lobby.slots.map(x => x.char).concat(S.char)), paint: first ? S.paint : PAINTS[(PAINTS.findIndex(p => p.id === S.paint) + i * 2) % PAINTS.length].id, name: first ? S.name : `Joueur ${i + 1}`, ready: false, nav: false };
  lobby.slots.push(s);
  audio.play('ok', 0.8);
  renderSlots(); refreshMenuKarts(); hopKart(i); syncSlots();
}
function removeSlot(i) { lobby.slots.splice(i, 1); renderSlots(); refreshMenuKarts(); syncSlots(); }
function renderSlots() {
  const html = [];
  for (let i = 0; i < 4; i++) {
    const s = lobby.slots[i];
    if (!s) { html.push(`<div class="slot-card card empty"><span class="pn">J${i + 1}</span><div class="join">Appuie sur<br>A · Entrée · Espace<br>pour rejoindre</div></div>`); continue; }
    const c = charById(s.char), p = paintById(s.paint);
    html.push(`<div class="slot-card card ${s.ready ? 'ready' : ''} ${s.nav ? 'navmode' : ''}" data-slot="${i}"><span class="pn" style="background:${p.main}">J${i + 1}</span>
      <img class="por" src="${PORTRAITS[s.char]}" alt="">
      <div class="nm">${esc(s.name)}</div>
      <div class="pick"><button data-sa="char:-1">◀</button><span>${c.name}</span><button data-sa="char:1">▶</button></div>
      <div class="pick"><button data-sa="paint:-1">◀</button><span class="sw" style="background:${p.main}"></span><span>${p.name}</span><button data-sa="paint:1">▶</button></div>
      <div class="dev">${DEVICE_LABEL(s.device)}${i > 0 ? ' · <a data-sa="leave" style="cursor:pointer;text-decoration:underline">retirer</a>' : ''}</div></div>`);
  }
  $('#slots').innerHTML = html.join('');
}
$('#slots').addEventListener('click', e => {
  const b = e.target.closest('[data-sa]'); if (!b) return;
  const i = +b.closest('[data-slot]').dataset.slot, [what, d] = b.dataset.sa.split(':');
  if (what === 'leave') return removeSlot(i);
  changeSlot(i, what, +d);
});
function changeSlot(i, what, d) {
  const s = lobby.slots[i]; if (!s) return;
  if (what === 'char') { const idx = CHARACTERS.findIndex(c => c.id === s.char); s.char = CHARACTERS[(idx + d + CHARACTERS.length) % CHARACTERS.length].id; if (i === 0) { S.char = s.char; save(); updateTitleSkin(); } }
  if (what === 'paint') { const idx = PAINTS.findIndex(p => p.id === s.paint); s.paint = PAINTS[(idx + d + PAINTS.length) % PAINTS.length].id; if (i === 0) { S.paint = s.paint; save(); updateTitleSkin(); } }
  audio.play('ui', 0.7);
  renderSlots(); refreshMenuKarts(); hopKart(i); syncSlots();
}
function renderSettings() {
  $('#v-bots').textContent = S.bots; $('#v-duration').textContent = S.duration + ' min'; $('#v-difficulty').textContent = DIFF_LABEL[S.difficulty];
}
$('#lobby-settings').addEventListener('click', e => {
  const b = e.target.closest('[data-step]'); if (!b) return;
  const [k, d] = b.dataset.step.split(':'), n = +d;
  if (k === 'bots') S.bots = Math.max(0, Math.min(11, S.bots + n));
  if (k === 'duration') S.duration = DURATIONS[Math.max(0, Math.min(DURATIONS.length - 1, DURATIONS.indexOf(S.duration) + n))] || 3;
  if (k === 'difficulty') S.difficulty = DIFFS[Math.max(0, Math.min(2, DIFFS.indexOf(S.difficulty) + n))];
  save(); renderSettings(); broadcastLobby();
});
function renderRemote() {
  if (lobby.mode !== 'online') return;
  const list = net && net.isHost ? lobbyPlayers() : lobby.remote;
  $('#remote').innerHTML = list.map(p => `<div class="rp"><img src="${PORTRAITS[p.char]}" alt=""><span>${esc(p.name)}</span>${p.pid === 'host' ? '<span class="tag">HÔTE</span>' : ''}${p.pid === (net && net.id) || (net && net.isHost && p.pid === 'host') ? '<span class="tag">TOI</span>' : ''}</div>`).join('')
    + (net && net.isHost ? `<div class="rp" style="opacity:.75">+ ${S.bots} bot${S.bots > 1 ? 's' : ''}</div>` : (lobby.botsInfo !== undefined ? `<div class="rp" style="opacity:.75">+ ${lobby.botsInfo} bots · ${lobby.durInfo} min</div>` : ''));
}
$('#lobby-back').addEventListener('click', () => leaveLobby());
$('#copy-code').addEventListener('click', () => { navigator.clipboard?.writeText(net ? net.code : ''); toast('Code copié : ' + (net ? net.code : '')); });
$('#b-start').addEventListener('click', () => startFromLobby());
function leaveLobby() {
  if (net) { net.close(); net = null; }
  lobby.slots = []; lobby.remote = []; lobby.peers.clear();
  history.length = 0; show('title', false);
}

function lobbyMenuEvent(ev) {
  const i = lobby.slots.findIndex(s => s.device === ev.device);
  if (ev.type === 'start') { if (i < 0) addSlot(ev.device); else startFromLobby(); return; }
  if (i < 0) { if (ev.type === 'confirm') addSlot(ev.device); else if (ev.type === 'back' && lobby.slots.length === 0) leaveLobby(); return; }
  const s = lobby.slots[i];
  if (s.nav) {
    if (ev.type === 'back') { s.nav = false; s.ready = false; setFocus(null); renderSlots(); audio.play('back', 0.7); return; }
    if (ev.type === 'confirm') return activate(focusEl);
    return moveFocus(ev.type);
  }
  switch (ev.type) {
    case 'left': changeSlot(i, 'char', -1); break;
    case 'right': changeSlot(i, 'char', 1); break;
    case 'up': changeSlot(i, 'paint', -1); break;
    case 'down': changeSlot(i, 'paint', 1); break;
    case 'confirm':
      s.ready = true; audio.play('ok', 0.8); hopKart(i);
      if (i === 0) { s.nav = true; setFocus($('#b-start').offsetParent ? $('#b-start') : navables()[0]); }
      renderSlots(); break;
    case 'back':
      if (s.ready) { s.ready = false; renderSlots(); } else if (i === 0) leaveLobby(); else removeSlot(i);
      break;
  }
}

// ------------------------------------------------------------------ en ligne
function lobbyPlayers() {
  const out = lobby.slots.map(s => ({ pid: 'host', name: s.name, char: s.char, paint: s.paint }));
  for (const [pid, p] of lobby.peers) for (const s of p.slots) out.push({ pid, name: s.name, char: s.char, paint: s.paint });
  return out;
}
function broadcastLobby() {
  renderRemote();
  if (!net || !net.isHost) return;
  net.broadcast({ t: 'lobby', players: lobbyPlayers(), bots: S.bots, duration: S.duration });
}
function syncSlots() {
  renderRemote();
  if (!net) return;
  if (net.isHost) broadcastLobby();
  else net.toHost({ t: 'slots', slots: lobby.slots.map(s => ({ name: s.name, char: s.char, paint: s.paint })) });
}
function setupNet() {
  net.onMessage = (pid, m) => {
    if (game && ['ev', 'rq', 'k', 's'].includes(m.t)) return game.onNet(pid, m);
    if (net.isHost) {
      if (m.t === 'hello') {
        if (game || lobby.busy) { net.send(pid, { t: 'busy' }); return; }
        if (lobbyPlayers().length + (m.slots || []).length > 12) { net.send(pid, { t: 'full' }); return; }
        lobby.peers.set(pid, { slots: (m.slots || []).slice(0, 4).map(cleanSlot) });
        toast(`${cleanSlot(m.slots?.[0] || {}).name} a rejoint le salon !`);
        audio.play('pickup', 0.6);
        broadcastLobby();
      } else if (m.t === 'slots' && lobby.peers.has(pid)) {
        lobby.peers.get(pid).slots = (m.slots || []).slice(0, 4).map(cleanSlot);
        broadcastLobby();
      }
    } else {
      if (m.t === 'lobby') { lobby.remote = m.players; lobby.botsInfo = m.bots; lobby.durInfo = m.duration; renderRemote(); }
      else if (m.t === 'start') startOnlineGame(m);
      else if (m.t === 'tolobby') { if (game) endGameCleanup(); $('#lobby-wait').classList.remove('hidden'); enterLobbyClient(); }
      else if (m.t === 'busy') { toast('Partie déjà en cours, réessaie à la fin de la manche.'); leaveLobby(); }
      else if (m.t === 'full') { toast('Le salon est plein.'); leaveLobby(); }
    }
  };
  net.onLeave = (pid) => {
    const p = lobby.peers.get(pid);
    lobby.peers.delete(pid);
    if (game) {
      const ids = game.karts.filter(k => k.owner === pid).map(k => k.id);
      if (ids.length) game.emit({ t: 'leave', ids, name: p && p.slots[0] ? p.slots[0].name : 'Un joueur' });
    } else { toast(`${p && p.slots[0] ? p.slots[0].name : 'Un joueur'} est parti.`); broadcastLobby(); }
  };
  net.onClose = () => {
    toast('Connexion avec l\'hôte perdue.', 3500);
    if (game) endGameCleanup();
    net = null; lobby.slots = []; history.length = 0; show('title', false); audio.music('menu');
  };
}
const cleanSlot = s => ({ name: String(s.name || 'Pilote').replace(/[<>]/g, '').slice(0, 14), char: charById(s.char).id, paint: paintById(s.paint).id });
function enterLobbyClient() {
  lobby.mode = 'online';
  if (!lobby.slots.length) addSlot(lastDevice, true);
  enterLobbyKeep();
}
function enterLobbyKeep() {
  $('#lobby-title').textContent = 'Salon en ligne';
  $('#room-box').classList.remove('hidden'); $('#lobby-spacer').classList.add('hidden'); $('#remote').classList.remove('hidden');
  const canEdit = net && net.isHost;
  $('#lobby-settings').classList.toggle('hidden', !canEdit); $('#b-start').classList.toggle('hidden', !canEdit); $('#lobby-wait').classList.toggle('hidden', canEdit);
  $('#room-code').textContent = net ? net.code : '-----';
  renderSettings(); renderSlots(); renderRemote();
  show('lobby', false); menu.mode = 'lobby'; refreshMenuKarts();
  audio.music('menu');
}
$('#b-online').addEventListener('click', () => { $('#online-status').textContent = ''; $('#online-status').className = 'status'; show('online'); });
$('#b-local').addEventListener('click', () => enterLobby('local'));
$('#b-host').addEventListener('click', async () => {
  const st = $('#online-status'); st.className = 'status'; st.textContent = 'Création de la partie…';
  try {
    net = new Net(); setupNet();
    const code = await net.host();
    st.textContent = '';
    enterLobby('online');
    $('#room-code').textContent = code;
    broadcastLobby();
  } catch (err) { st.className = 'status err'; st.textContent = err.message; net = null; }
});
const joinIn = $('#join-code');
joinIn.addEventListener('keydown', e => { if (e.key === 'Enter') { joinIn.blur(); $('#b-join').click(); } if (e.key === 'Escape') joinIn.blur(); });
$('#b-join').addEventListener('click', async () => {
  const code = joinIn.value.trim().toUpperCase(), st = $('#online-status');
  if (code.length !== 5) { st.className = 'status err'; st.textContent = 'Le code fait 5 caractères.'; return; }
  st.className = 'status'; st.textContent = 'Connexion à ' + code + '…';
  try {
    net = new Net(); setupNet();
    await net.join(code);
    st.textContent = '';
    lobby.slots = []; lobby.mode = 'online';
    addSlot(lastDevice, true);
    enterLobbyKeep();
    net.toHost({ t: 'hello', slots: lobby.slots.map(s => ({ name: s.name, char: s.char, paint: s.paint })) });
  } catch (err) { st.className = 'status err'; st.textContent = err.message; if (net) net.close(); net = null; }
});

// ------------------------------------------------------------------ lancement
function buildRoster(players, botCount) {
  const roster = [];
  const used = new Set();
  let id = 1;
  const spawns = [...Array(12).keys()].sort(() => Math.random() - 0.5);
  players.forEach((p, i) => { roster.push({ id: id++, name: p.name, char: p.char, paint: p.paint, owner: p.pid, slot: p.slot, isBot: false, spawn: spawns[roster.length] }); used.add(p.char + p.paint); });
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  for (let b = 0; b < botCount && roster.length < 12; b++) {
    let c, pt, n = 0;
    do { c = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id; pt = PAINTS[Math.floor(Math.random() * PAINTS.length)].id; } while (used.has(c + pt) && n++ < 30);
    used.add(c + pt);
    roster.push({ id: id++, name: names[b % names.length], char: c, paint: pt, owner: 'host', isBot: true, spawn: spawns[roster.length] });
  }
  return roster;
}

function startFromLobby() {
  if (!lobby.slots.length) return;
  if (lobby.mode === 'online' && !(net && net.isHost)) return;
  // un seul joueur au clavier = toutes les touches
  const kbPlayers = lobby.slots.filter(s => s.device.startsWith('kb'));
  const deviceFor = s => (kbPlayers.length === 1 && s.device.startsWith('kb')) ? 'kb' : s.device;
  if (lobby.mode === 'local') {
    const players = lobby.slots.map((s, i) => ({ pid: 'host', name: s.name, char: s.char, paint: s.paint, slot: i }));
    const roster = buildRoster(players, Math.min(S.bots, 12 - players.length));
    const locals = roster.filter(r => !r.isBot).map(r => ({ id: r.id, device: deviceFor(lobby.slots[r.slot]) }));
    launch({ roster, locals, isHost: true, myPeer: 'host', peerTag: 'h' });
  } else {
    const players = lobby.slots.map((s, i) => ({ pid: 'host', name: s.name, char: s.char, paint: s.paint, slot: i }));
    for (const [pid, p] of lobby.peers) p.slots.forEach((s, i) => players.push({ pid, name: s.name, char: s.char, paint: s.paint, slot: i }));
    const roster = buildRoster(players, Math.min(S.bots, 12 - players.length));
    const settings = { duration: S.duration * 60, difficulty: S.difficulty };
    let tag = 0;
    for (const pid of lobby.peers.keys()) net.send(pid, { t: 'start', roster, settings, tag: 'p' + (++tag) + '_' });
    const locals = roster.filter(r => r.owner === 'host' && !r.isBot).map(r => ({ id: r.id, device: deviceFor(lobby.slots[r.slot]) }));
    launch({ roster, locals, isHost: true, myPeer: 'host', peerTag: 'h', net });
  }
}

function startOnlineGame(m) {
  const kbPlayers = lobby.slots.filter(s => s.device.startsWith('kb'));
  const deviceFor = s => (kbPlayers.length === 1 && s.device.startsWith('kb')) ? 'kb' : s.device;
  const locals = m.roster.filter(r => r.owner === net.id).map(r => ({ id: r.id, device: deviceFor(lobby.slots[r.slot] || lobby.slots[0]) }));
  launch({ roster: m.roster, locals, isHost: false, myPeer: net.id, peerTag: m.tag, net, settings: m.settings });
}

let lastLaunch = null;
function launch(o) {
  lastLaunch = o;
  lobby.busy = true;
  history.length = 0;
  $$('.screen').forEach(s => s.classList.remove('active')); screen = null;
  document.body.classList.add('ingame');
  for (const k of menu.karts) menu.scene.remove(k.g);
  menu.karts = [];
  const touch = o.locals.some(l => l.device === 'touch');
  document.body.classList.toggle('touch-play', touch);
  input.touch.show(touch);
  if (touch) {
    const de = document.documentElement;
    if (!document.fullscreenElement && de.requestFullscreen) de.requestFullscreen().then(() => window.screen.orientation?.lock?.("landscape")).catch(() => {});
  }
  game = new Game({
    renderer, audio, input, net: o.net || null, isHost: o.isHost, myPeer: o.myPeer, peerTag: o.peerTag,
    settings: { duration: o.settings ? o.settings.duration : S.duration * 60, difficulty: o.settings ? o.settings.difficulty : S.difficulty, quality: S.quality },
    roster: o.roster, localPlayers: o.locals, hudRoot: $('#hud'),
    onEnd: (res) => showResults(res),
  });
  game.onPause = () => pause(true);
}

function endGameCleanup() {
  if (!game) return;
  game.dispose(); game = null;
  document.body.classList.remove('ingame', 'touch-play');
  input.touch.show(false);
  lobby.busy = false;
  renderer.setClearColor(0x000000, 0);
}

function pause(on) {
  if (!game) return;
  game.paused = on;
  input.touch.show(!on && document.body.classList.contains('touch-play'));
  if (on) { show('pause', false); $('#b-quit').textContent = net ? 'QUITTER LE SALON' : 'QUITTER LA PARTIE'; }
  else { $$('.screen').forEach(s => s.classList.remove('active')); screen = null; }
}
$('#b-resume').addEventListener('click', () => pause(false));
$('#b-quit').addEventListener('click', () => { endGameCleanup(); if (net) { net.close(); net = null; } lobby.slots = []; history.length = 0; show('title', false); audio.music('menu'); });

function showResults(res) {
  const myIds = new Set(game.locals.map(l => l.kart.id));
  const podium = [res[1], res[0], res[2]].map((r, j) => {
    if (!r) return '<div></div>';
    const place = j === 1 ? 1 : j === 0 ? 2 : 3;
    return `<div class="pod p${place}">${place === 1 ? '<div class="crown">👑</div>' : ''}<img src="${PORTRAITS[r.char]}" alt=""><div class="nm">${esc(r.name)}</div><div class="blk" style="border-color:${paintById(r.paint).main === '#f2f4ff' ? '#fff' : '#fff'}"><span class="place">${place}</span><span class="k">${r.kills} kill${r.kills > 1 ? 's' : ''}</span></div></div>`;
  }).join('');
  $('#podium').innerHTML = podium;
  $('#res-table').innerHTML = `<div class="r h"><span>#</span><span></span><span>Pilote</span><span>Kills</span><span>Morts</span></div>` + res.map((r, i) => `<div class="r ${myIds.has(r.id) ? 'me' : ''}"><span>${i + 1}</span><img src="${PORTRAITS[r.char]}" alt=""><span>${esc(r.name)}${r.isBot ? ' 🤖' : ''}</span><span>${r.kills}</span><span>${r.deaths}</span></div>`).join('');
  const isClient = net && !net.isHost;
  $('#b-again').classList.toggle('hidden', !!isClient);
  $('#b-again').textContent = net ? 'RETOUR AU SALON' : 'REJOUER';
  endGameCleanup();
  menu.mode = 'title';
  setMenuKarts([{ char: res[0].char, paint: res[0].paint, slot: 0 }]);
  show('results', false);
  audio.music('menu');
  if (isClient) toast('En attente de l\'hôte pour la prochaine manche…', 4000);
}
$('#b-again').addEventListener('click', () => {
  if (net && net.isHost) { net.broadcast({ t: 'tolobby' }); enterLobbyKeep(); broadcastLobby(); return; }
  if (lastLaunch && !net) { lobby.slots.forEach(s => { s.ready = false; s.nav = false; }); startFromLobby(); }
});
$('#b-menu').addEventListener('click', () => { if (net) { net.close(); net = null; } lobby.slots = []; history.length = 0; show('title', false); });

// ------------------------------------------------------------------ boucle
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); if (game) game.resize(); layoutMenuKarts(); });
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  input.poll();
  const evs = input.menuEvents();
  for (const ev of evs) if (ev.device) lastDevice = ev.device;
  if (game) {
    if (game.paused) {
      for (const ev of evs) {
        if (ev.type === 'back' || ev.type === 'start') { pause(false); break; }
        if (ev.type === 'confirm') activate(focusEl);
        else if (focusEl && focusEl.type === 'range' && (ev.type === 'left' || ev.type === 'right')) { focusEl.value = +focusEl.value + (ev.type === 'left' ? -0.05 : 0.05); focusEl.dispatchEvent(new Event('input')); }
        else if (['up', 'down', 'left', 'right'].includes(ev.type)) moveFocus(ev.type);
      }
    }
    game.update(dt);
    return;
  }
  for (const ev of evs) handleMenuEvent(ev);
  renderMenu(dt);
}
function handleMenuEvent(ev) {
  if (document.activeElement && document.activeElement.tagName === 'INPUT' && ev.device.startsWith('kb')) return;
  audio.init();
  if (screen === 'lobby') return lobbyMenuEvent(ev);
  if (ev.type === 'back') { if (screen !== 'title') back(); return; }
  if (ev.type === 'confirm' || ev.type === 'start') {
    if (screen === 'title' && ev.type === 'start') return enterLobby('local');
    return activate(focusEl);
  }
  if (['up', 'down', 'left', 'right'].includes(ev.type)) {
    if (focusEl && focusEl.type === 'range' && (ev.type === 'left' || ev.type === 'right')) {
      focusEl.value = Math.max(0, Math.min(1, +focusEl.value + (ev.type === 'left' ? -0.05 : 0.05)));
      focusEl.dispatchEvent(new Event('input')); return;
    }
    moveFocus(ev.type);
  }
}

// ------------------------------------------------------------------ démarrage
async function boot() {
  try { await document.fonts.load('40px "Lilita One"'); } catch (e) { /* police de secours */ }
  makePortraits();
  buildGarage();
  updateTitleSkin();
  show('title', false);
  audio.music('menu');
  $('#loading').classList.add('gone');
  requestAnimationFrame(frame);
}
boot();
// accès console pour le débogage : __tk.game()
window.__tk = { game: () => game, lobby, S };
