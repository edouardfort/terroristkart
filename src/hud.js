// HUD en DOM : un panneau par joueur local (split-screen) + éléments globaux.
import * as THREE from 'three';
import { WEAPONS, ICONS, WEAPON_IDS } from './weapons.js';
import { MAX_HP } from './kart.js';
import { H } from './map.js';
import { paintById } from './characters.js';

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ord = n => n === 1 ? '<sup>er</sup>' : '<sup>e</sup>';
const fmt = t => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const v = new THREE.Vector3();

export class HUD {
  constructor(root, game) {
    this.g = game; this.root = root; root.innerHTML = ''; root.classList.add('on');
    this.panels = [];
    this.feed = el('div', 'killfeed', root);
    this.center = el('div', 'bigcenter', root);
    this.mini = el('canvas', 'minimap', root); this.mini.width = 220; this.mini.height = 220;
    this.miniBg = this.drawMiniBg();
  }

  addPanel(lp) {
    const p = el('div', 'vp', this.root);
    p.innerHTML = `
      <div class="tl">
        <div class="pill rank"><span class="icon-trophy">★</span><b class="pos">1<sup>er</sup></b><span class="tot">/ 1</span></div>
        <div class="board"></div>
      </div>
      <div class="tc">
        <div class="hp"><div class="heart">❤</div><div class="bar"><div class="fill"></div><div class="ghost"></div></div><span class="hpn">100</span></div>
        <div class="pill timer"><span class="clock">⏱</span><b class="time">3:00</b></div>
      </div>
      <div class="br">
        <div class="wname"></div>
        <div class="slot empty"><img class="wicon" alt=""><div class="ammo"></div></div>
      </div>
      <div class="kills pill"><span>💥</span><b class="kn">0</b></div>
      <div class="announce"><div class="a1"></div><div class="a2"></div></div>
      <div class="floaters"></div>
      <div class="hitmark"></div>
      <div class="lock"></div>
      <div class="vignette"></div>
      <div class="speedlines"></div>
      <div class="respawn"></div>
      <div class="plabel"></div>`;
    const q = s => p.querySelector(s);
    const panel = { lp, root: p, pos: q('.pos'), tot: q('.tot'), board: q('.board'), fill: q('.fill'), ghost: q('.ghost'), hpn: q('.hpn'), hp: q('.hp'), time: q('.time'), timer: q('.timer'),
      wname: q('.wname'), slot: q('.slot'), wicon: q('.wicon'), ammo: q('.ammo'), kn: q('.kn'), a1: q('.a1'), a2: q('.a2'), ann: q('.announce'), floaters: q('.floaters'),
      hit: q('.hitmark'), lock: q('.lock'), vig: q('.vignette'), speed: q('.speedlines'), respawn: q('.respawn'), plabel: q('.plabel'), ghostHp: MAX_HP, annT: 0, rollT: 0, speedT: 0, hurtT: 0, lastBoard: '' };
    panel.plabel.textContent = `J${lp.idx + 1}`;
    panel.plabel.style.background = paintById(lp.kart.paintId).main;
    this.panels.push(panel);
    return panel;
  }

  layout(locals, overview) {
    const n = locals.length;
    for (const pn of this.panels) {
      const [x, y, w, h] = pn.lp.rect;
      Object.assign(pn.root.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
      pn.root.classList.toggle('multi', n > 1);
      pn.root.classList.toggle('small', n > 2);
    }
    const m = this.mini.style;
    m.top = m.left = m.right = m.bottom = m.transform = '';
    if (document.body.classList.contains('touch-play')) { m.right = 'calc(16px + env(safe-area-inset-right, 0px))'; m.top = '64px'; m.width = m.height = '108px'; }
    else if (n <= 1) { m.left = '18px'; m.bottom = '18px'; m.width = m.height = '190px'; }
    else if (n === 2) { m.right = '14px'; m.top = '50%'; m.transform = 'translateY(-50%)'; m.width = m.height = '150px'; }
    else if (overview) { m.left = (overview[0] + overview[2] / 2) + 'px'; m.top = (overview[1] + overview[3] / 2) + 'px'; m.transform = 'translate(-50%,-50%)'; m.width = m.height = Math.min(overview[3] * 0.8, 260) + 'px'; }
    else { m.left = '50%'; m.top = '50%'; m.transform = 'translate(-50%,-50%)'; m.width = m.height = '140px'; }
  }

  drawMiniBg() {
    const c = document.createElement('canvas'); c.width = c.height = 220;
    const x = c.getContext('2d'), S = 220 / (2 * H + 8), P = q => (q + H + 4) * S;
    x.fillStyle = '#7fd357'; x.beginPath(); x.roundRect(0, 0, 220, 220, 26); x.fill();
    const col = { plateau: '#ff9fd0', corner: '#57d8bd', ramp: '#ffd84d', kicker: '#ff7a59', hedge: '#3f9f4a', gift: '#ffffff', wall: '#b9a3ff' };
    for (const b of this.g.map.blocks) { x.fillStyle = col[b.style] || '#fff'; x.fillRect(P(b.minX), P(b.minZ), (b.maxX - b.minX) * S, (b.maxZ - b.minZ) * S); }
    for (const cy of this.g.map.cylinders) { x.fillStyle = cy.kind === 'trophy' ? '#ffc928' : '#ff5cc8'; x.beginPath(); x.arc(P(cy.x), P(cy.z), Math.max(2, cy.r * S), 0, 7); x.fill(); }
    this.miniP = P;
    return c;
  }

  drawMini() {
    const x = this.mini.getContext('2d'), P = this.miniP, g = this.g;
    x.clearRect(0, 0, 220, 220);
    x.globalAlpha = 0.92; x.drawImage(this.miniBg, 0, 0); x.globalAlpha = 1;
    for (const b of g.boxes) if (b.active) { x.fillStyle = '#ffffff'; x.fillRect(P(b.pos.x) - 2, P(b.pos.z) - 2, 4, 4); }
    for (const k of g.karts) {
      if (k.dead) continue;
      const lp = g.locals.find(l => l.kart === k);
      x.save(); x.translate(P(k.pos.x), P(k.pos.z));
      if (lp) {
        x.rotate(-k.yaw + Math.PI);
        x.fillStyle = k.paint.main; x.strokeStyle = '#ffffff'; x.lineWidth = 2.5;
        x.beginPath(); x.moveTo(0, -9); x.lineTo(7, 7); x.lineTo(0, 3); x.lineTo(-7, 7); x.closePath(); x.fill(); x.stroke();
      } else {
        x.fillStyle = k.paint.main; x.strokeStyle = '#1b1440'; x.lineWidth = 2;
        x.beginPath(); x.arc(0, 0, 5, 0, 7); x.fill(); x.stroke();
      }
      if (k.id === g.leaderId) { x.fillStyle = '#ffc928'; x.font = '12px sans-serif'; x.textAlign = 'center'; x.fillText('♛', 0, -9); }
      x.restore();
    }
  }

  ranking() {
    return [...this.g.karts].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  }

  update(dt) {
    const g = this.g, rank = this.ranking();
    for (const pn of this.panels) {
      const k = pn.lp.kart, lp = pn.lp;
      const r = rank.indexOf(k) + 1;
      pn.pos.innerHTML = r + ord(r); pn.tot.textContent = '/ ' + rank.length;
      pn.kn.textContent = k.kills;
      // mini classement
      const top = rank.slice(0, pn.root.classList.contains('small') ? 3 : 4);
      const key = top.map(t => t.id + ':' + t.kills).join(',') + '|' + k.id;
      if (key !== pn.lastBoard) {
        pn.lastBoard = key;
        pn.board.innerHTML = top.map((t, i) => `<div class="row ${t === k ? 'me' : ''}"><span class="n">${i + 1}</span><span class="dot" style="background:${t.paint.main}"></span><span class="nm">${esc(t.name)}</span><b>${t.kills}</b></div>`).join('');
      }
      // vie
      const f = Math.max(0, k.hp / MAX_HP);
      pn.fill.style.width = f * 100 + '%';
      pn.fill.className = 'fill' + (f < 0.3 ? ' low' : f < 0.6 ? ' mid' : '');
      pn.ghostHp += (k.hp - pn.ghostHp) * Math.min(1, dt * 3);
      if (pn.ghostHp < k.hp) pn.ghostHp = k.hp;
      pn.ghost.style.width = Math.max(0, pn.ghostHp / MAX_HP) * 100 + '%';
      pn.hpn.textContent = Math.ceil(k.hp);
      pn.hp.classList.toggle('shield', k.shield > 0);
      pn.time.textContent = fmt(g.timeLeft);
      pn.timer.classList.toggle('hurry', g.timeLeft < 30 && g.state === 'play');
      // arme
      if (k.roll > 0) {
        pn.rollT -= dt;
        if (pn.rollT <= 0) {
          pn.rollT = 0.06 + (1 - k.roll) * 0.1;
          const w = WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)];
          pn.wicon.src = ICONS[w]; pn.slot.classList.remove('empty'); pn.slot.classList.add('rolling');
          g.audio.play('tick', 0.7);
        }
        pn.ammo.textContent = ''; pn.wname.textContent = '';
      } else if (k.weapon) {
        const W = WEAPONS[k.weapon];
        if (pn.curW !== k.weapon) { pn.curW = k.weapon; pn.wicon.src = ICONS[k.weapon]; pn.slot.style.setProperty('--wc', W.color); }
        pn.slot.classList.remove('empty', 'rolling');
        pn.ammo.textContent = k.ammo > 1 || W.ammo > 1 ? k.ammo : '';
        pn.wname.textContent = W.name;
      } else {
        pn.curW = null; pn.slot.classList.add('empty'); pn.slot.classList.remove('rolling'); pn.ammo.textContent = ''; pn.wname.textContent = '';
      }
      // annonces
      if (pn.annT > 0) { pn.annT -= dt; if (pn.annT <= 0) pn.ann.classList.remove('show'); }
      if (pn.speedT > 0) pn.speedT -= dt;
      pn.speed.classList.toggle('on', k.boost > 0 || pn.speedT > 0);
      if (pn.hurtT > 0) { pn.hurtT -= dt; pn.vig.style.opacity = Math.min(1, pn.hurtT * 2.2); }
      pn.vig.classList.toggle('low', k.hp > 0 && k.hp < 30 && !k.dead);
      // réapparition
      if (k.dead) {
        pn.respawn.classList.add('show');
      } else pn.respawn.classList.remove('show');
      // viseur sur la cible auto
      let tgt = null;
      if (k.weapon && !k.dead && ['minigun', 'cannon', 'fireball', 'rocket', 'laser'].includes(k.weapon)) {
        const cone = { minigun: 16, cannon: 12, fireball: 14, rocket: 45, laser: 8 }[k.weapon], range = { minigun: 70, cannon: 70, fireball: 55, rocket: 100, laser: 120 }[k.weapon];
        tgt = g.findAimTarget(k, cone, range);
      }
      if (tgt) {
        v.set(tgt.pos.x, tgt.pos.y + 1, tgt.pos.z).project(lp.cam);
        if (v.z < 1) {
          pn.lock.style.transform = `translate(${(v.x * 0.5 + 0.5) * lp.rect[2]}px, ${(-v.y * 0.5 + 0.5) * lp.rect[3]}px) translate(-50%,-50%)`;
          pn.lock.classList.add('on'); pn.lock.classList.toggle('rocket', k.weapon === 'rocket');
        } else pn.lock.classList.remove('on');
      } else pn.lock.classList.remove('on');
      // nombres flottants
      for (const fl of [...pn.floaters.children]) {
        fl._t += dt;
        if (fl._t > 0.9) { fl.remove(); continue; }
        v.copy(fl._p).setY(fl._p.y + 2.2 + fl._t * 2).project(lp.cam);
        fl.style.transform = `translate(${(v.x * 0.5 + 0.5) * lp.rect[2]}px, ${(-v.y * 0.5 + 0.5) * lp.rect[3]}px) translate(-50%,-50%) scale(${fl._t < 0.1 ? 0.6 + fl._t * 6 : 1.2 - fl._t * 0.3})`;
        fl.style.opacity = fl._t > 0.6 ? (0.9 - fl._t) / 0.3 : 1;
        fl.style.display = v.z < 1 ? '' : 'none';
      }
    }
    for (const it of [...this.feed.children]) { it._t -= dt; if (it._t <= 0) it.remove(); else if (it._t < 0.4) it.style.opacity = it._t / 0.4; }
    if (this.centerT > 0) { this.centerT -= dt; if (this.centerT <= 0) this.center.classList.remove('show'); }
    this.drawMini();
  }

  announce(lp, a, b, cls) {
    const pn = lp.panel; if (!pn) return;
    pn.a1.textContent = a; pn.a2.textContent = b || '';
    pn.ann.className = 'announce ' + (cls || '');
    void pn.ann.offsetWidth; pn.ann.classList.add('show');
    pn.annT = cls === 'dead' ? RESP() : 2.2;
  }

  floater(lp, pos, text, cls) {
    const f = el('div', 'floater ' + (cls || ''), lp.panel.floaters, esc(text));
    f._t = 0; f._p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2));
  }

  hitmarker(lp, big) {
    const h = lp.panel.hit; h.className = 'hitmark'; void h.offsetWidth; h.className = 'hitmark on' + (big ? ' big' : '');
  }

  hurt(lp, n) { const pn = lp.panel; pn.hurtT = Math.min(0.6, 0.2 + n / 100); }
  speedBurst(lp) { lp.panel.speedT = 0.6; }
  rollStart(lp) { lp.panel.rollT = 0; }
  rollEnd(lp) { const s = lp.panel.slot; s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); }
  ammoPulse(lp) { const a = lp.panel.slot; a.classList.remove('fire'); void a.offsetWidth; a.classList.add('fire'); }

  killfeed(a, v, w) {
    const it = el('div', 'kf');
    const icon = w && ICONS[w] ? `<img src="${ICONS[w]}">` : '💥';
    it.innerHTML = a && a !== v ? `<b style="color:${a.paint.main}">${esc(a.name)}</b>${icon}<b style="color:${v.paint.main}">${esc(v.name)}</b>` : `${icon}<b style="color:${v.paint.main}">${esc(v.name)}</b>`;
    it._t = 4.5;
    this.feed.prepend(it);
    while (this.feed.children.length > 5) this.feed.lastChild.remove();
  }

  feedText(t) { const it = el('div', 'kf', null, esc(t)); it._t = 4; this.feed.prepend(it); }

  countdown(text, go) {
    this.center.innerHTML = `<div class="count ${go ? 'go' : ''}">${esc(text)}</div>`;
    this.center.classList.remove('show'); void this.center.offsetWidth; this.center.classList.add('show');
    this.centerT = go ? 0.9 : 0.95;
  }

  banner(title, sub) {
    this.center.innerHTML = `<div class="banner"><div class="t">${esc(title)}</div><div class="s">${esc(sub || '')}</div></div>`;
    this.center.classList.remove('show'); void this.center.offsetWidth; this.center.classList.add('show');
    this.centerT = 2.4;
  }

  destroy() { this.root.innerHTML = ''; this.root.classList.remove('on'); }
}
const RESP = () => 2.4;
