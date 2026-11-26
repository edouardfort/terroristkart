// Entrées : clavier (deux moitiés possibles) et manettes. Fournit l'état de conduite et des événements de menu.
const KB = {
  kbL: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], fire: ['Space', 'KeyE'], drift: ['ShiftLeft', 'KeyQ'], look: ['KeyC'], confirm: ['Space'], back: ['Escape'] },
  kbR: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], fire: ['Enter', 'NumpadEnter', 'ControlRight', 'KeyL'], drift: ['ShiftRight', 'Numpad0', 'KeyK'], look: ['Numpad1', 'KeyJ'], confirm: ['Enter', 'NumpadEnter'], back: ['Backspace'] },
};
KB.kb = Object.fromEntries(Object.keys(KB.kbL).map(k => [k, [...new Set([...KB.kbL[k], ...KB.kbR[k]])]]));

export const DEVICE_LABEL = id => id === 'touch' ? 'Écran tactile' : id === 'kbL' ? 'Clavier ZQSD' : id === 'kbR' ? 'Clavier flèches' : id === 'kb' ? 'Clavier' : 'Manette ' + (Number(id.slice(2)) + 1);
export const IS_TOUCH = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || new URLSearchParams(location.search).has('touch');

// Commandes tactiles : joystick flottant à gauche (direction, tirer vers le bas = freiner), boutons à droite.
// L'accélération est automatique.
export class TouchControls {
  constructor(root) {
    this.root = root;
    this.s = { steer: 0, brake: false, fire: false, drift: false, look: false, pause: false };
    const zone = root.querySelector('.t-zone'), base = root.querySelector('.t-base'), knob = root.querySelector('.t-knob');
    let id = null, cx = 0, cy = 0;
    const R = 62;
    const move = e => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      let st = dx / R; st = Math.abs(st) < 0.1 ? 0 : Math.sign(st) * (Math.abs(st) - 0.1) / 0.9;
      this.s.steer = st; this.s.brake = dy / R > 0.6;
    };
    zone.addEventListener('pointerdown', e => {
      if (id !== null) return;
      id = e.pointerId; try { zone.setPointerCapture(id); } catch (err) { /* rien */ }
      cx = e.clientX; cy = e.clientY;
      base.style.left = cx + 'px'; base.style.top = cy + 'px'; base.classList.add('on');
      move(e); e.preventDefault();
    });
    zone.addEventListener('pointermove', move);
    const end = e => {
      if (e.pointerId !== id) return;
      id = null; this.s.steer = 0; this.s.brake = false;
      knob.style.transform = ''; base.classList.remove('on'); base.style.left = ''; base.style.top = '';
    };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    const hold = (sel, key) => {
      const el = root.querySelector(sel);
      el.addEventListener('pointerdown', e => {
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
        this.s[key] = true; el.classList.add('down'); e.preventDefault();
        if (navigator.vibrate) navigator.vibrate(8);
      });
      const up = () => { this.s[key] = false; el.classList.remove('down'); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    };
    hold('.t-fire', 'fire'); hold('.t-drift', 'drift'); hold('.t-look', 'look'); hold('.t-pause', 'pause');
    root.addEventListener('contextmenu', e => e.preventDefault());
  }
  show(on) {
    this.root.classList.toggle('on', on);
    if (!on) Object.assign(this.s, { steer: 0, brake: false, fire: false, drift: false, look: false, pause: false });
  }
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.mouse = false;
    this.prevMenu = {};
    this.pads = [];
    this.touch = null;
    addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousedown', e => { if (e.button === 0 && e.target.tagName === 'CANVAS') this.mouse = true; });
    addEventListener('mouseup', () => { this.mouse = false; });
  }

  poll() {
    this.pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
  }

  padConnected(i) { return !!this.pads[i]; }

  key(list) { for (const k of list) if (this.keys.has(k)) return true; return false; }

  // État brut de conduite pour un appareil
  drive(device) {
    const o = { throttle: 0, steer: 0, drift: false, fire: false, look: false, pause: false };
    if (device === 'touch') {
      const t = this.touch ? this.touch.s : {};
      o.throttle = t.brake ? -1 : 1; o.steer = t.steer || 0;
      o.drift = !!t.drift; o.fire = !!t.fire; o.look = !!t.look; o.pause = !!t.pause;
    } else if (device.startsWith('kb')) {
      const m = KB[device];
      o.throttle = (this.key(m.up) ? 1 : 0) - (this.key(m.down) ? 1 : 0);
      o.steer = (this.key(m.right) ? 1 : 0) - (this.key(m.left) ? 1 : 0);
      o.drift = this.key(m.drift); o.fire = this.key(m.fire) || (device === 'kb' && this.mouse); o.look = this.key(m.look);
      o.pause = this.keys.has('Escape');
    } else {
      const p = this.pads[Number(device.slice(2))];
      if (!p) return o;
      const b = i => p.buttons[i] ? p.buttons[i].value : 0;
      const pressed = i => p.buttons[i] && p.buttons[i].pressed;
      let ax = p.axes[0] || 0;
      if (Math.abs(ax) < 0.15) ax = 0; else ax = Math.sign(ax) * (Math.abs(ax) - 0.15) / 0.85;
      ax = Math.sign(ax) * Math.pow(Math.abs(ax), 1.3);
      if (pressed(14)) ax = -1; if (pressed(15)) ax = 1;
      o.steer = ax;
      o.throttle = Math.max(b(7), b(0)) - Math.max(b(6), b(1));
      o.drift = pressed(5);
      o.fire = pressed(4) || pressed(2);
      o.look = pressed(3);
      o.pause = pressed(9);
    }
    return o;
  }

  // Événements de menu (front montant) pour tous les appareils
  menuEvents() {
    const ev = [];
    const states = {};
    for (const d of ['kbL', 'kbR']) {
      const m = KB[d];
      states[d] = { up: this.key(m.up), down: this.key(m.down), left: this.key(m.left), right: this.key(m.right), confirm: this.key(m.confirm), back: this.key(m.back) };
    }
    this.pads.forEach((p, i) => {
      if (!p) return;
      const pr = j => p.buttons[j] && p.buttons[j].pressed;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      states['gp' + i] = { up: pr(12) || ay < -0.6, down: pr(13) || ay > 0.6, left: pr(14) || ax < -0.6, right: pr(15) || ax > 0.6, confirm: pr(0), back: pr(1), start: pr(9), x: pr(2), y: pr(3) };
    });
    const now = performance.now();
    for (const [d, s] of Object.entries(states)) {
      const prev = this.prevMenu[d] || {};
      for (const k of Object.keys(s)) {
        if (s[k] && !prev[k]) { ev.push({ device: d, type: k }); if (['up', 'down', 'left', 'right'].includes(k)) s['_t' + k] = now + 380; }
        else if (s[k] && ['up', 'down', 'left', 'right'].includes(k)) {
          s['_t' + k] = prev['_t' + k];
          if (now > s['_t' + k]) { ev.push({ device: d, type: k }); s['_t' + k] = now + 110; }
        }
      }
      this.prevMenu[d] = s;
    }
    return ev;
  }

  rumble(device, strong = 0.5, weak = 0.5, ms = 120) {
    if (!device || !device.startsWith('gp')) return;
    const p = this.pads[Number(device.slice(2))];
    const a = p && p.vibrationActuator;
    if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }
}

// État de conduite d'un joueur avec fronts montants
export class PlayerControl {
  constructor(input, device) { this.input = input; this.device = device; this.prev = {}; }
  read() {
    const s = this.input.drive(this.device);
    s.driftPressed = s.drift && !this.prev.drift;
    s.firePressed = s.fire && !this.prev.fire;
    s.pausePressed = s.pause && !this.prev.pause;
    this.prev = s;
    return s;
  }
}
