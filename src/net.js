// Multijoueur en ligne pair-à-pair (WebRTC via PeerJS). L'hôte fait autorité ; un code de 5 lettres suffit pour rejoindre,
// même depuis un autre réseau (le serveur public PeerJS ne sert qu'à la mise en relation).
import { Peer } from 'peerjs';

const PREFIX = 'terroristkart-v1-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
const genCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

export class Net {
  constructor() {
    this.peer = null; this.isHost = false; this.code = null; this.id = null;
    this.conns = new Map();   // peerId -> { ev, st }
    this.onMessage = () => {}; this.onJoin = () => {}; this.onLeave = () => {}; this.onClose = () => {};
  }

  host() {
    this.isHost = true;
    return new Promise((resolve, reject) => {
      let tries = 0;
      const attempt = () => {
        const code = genCode();
        const peer = new Peer(PREFIX + code, { config: { iceServers: ICE }, debug: 1 });
        peer.on('open', () => { this.peer = peer; this.code = code; this.id = 'host'; resolve(code); });
        peer.on('error', (e) => {
          if (e.type === 'unavailable-id' && tries++ < 5) { peer.destroy(); attempt(); return; }
          if (!this.peer) reject(new Error(errText(e))); else console.warn('PeerJS', e);
        });
        peer.on('connection', conn => this.accept(conn));
        peer.on('disconnected', () => { if (this.peer && !this.peer.destroyed) this.peer.reconnect(); });
      };
      attempt();
    });
  }

  accept(conn) {
    const pid = conn.peer;
    conn.on('open', () => {
      const e = this.conns.get(pid) || {};
      e[conn.label === 'st' ? 'st' : 'ev'] = conn;
      this.conns.set(pid, e);
    });
    conn.on('data', d => this.onMessage(pid, d));
    conn.on('close', () => {
      if (this.conns.has(pid)) { this.conns.delete(pid); this.onLeave(pid); }
    });
    conn.on('error', () => {});
  }

  join(code) {
    this.isHost = false;
    code = code.trim().toUpperCase();
    return new Promise((resolve, reject) => {
      const peer = this.peer = new Peer({ config: { iceServers: ICE }, debug: 1 });
      let done = false;
      const fail = (msg) => { if (!done) { done = true; reject(new Error(msg)); try { peer.destroy(); } catch (e) { /* rien */ } } };
      const timer = setTimeout(() => fail('Impossible de joindre la partie (délai dépassé). Vérifie le code ou ton réseau.'), 15000);
      peer.on('error', e => fail(errText(e)));
      peer.on('open', (myId) => {
        this.id = myId;
        const ev = peer.connect(PREFIX + code, { label: 'ev', reliable: true, serialization: 'json' });
        const st = peer.connect(PREFIX + code, { label: 'st', reliable: false, serialization: 'json' });
        const host = { ev: null, st: null };
        ev.on('open', () => {
          host.ev = ev; this.conns.set('host', host);
          if (!done) { done = true; clearTimeout(timer); this.code = code; resolve(myId); }
        });
        st.on('open', () => { host.st = st; });
        for (const c of [ev, st]) {
          c.on('data', d => this.onMessage('host', d));
          c.on('error', () => {});
        }
        ev.on('close', () => { this.conns.delete('host'); this.onClose(); });
      });
    });
  }

  send(pid, msg, reliable = true) {
    const e = this.conns.get(pid); if (!e) return;
    const c = (!reliable && e.st && e.st.open) ? e.st : e.ev;
    if (c && c.open) { try { c.send(msg); } catch (err) { /* canal fermé */ } }
  }

  broadcast(msg, reliable = true, except = null) {
    for (const pid of this.conns.keys()) if (pid !== except) this.send(pid, msg, reliable);
  }

  toHost(msg, reliable = true) { this.send('host', msg, reliable); }

  peers() { return [...this.conns.keys()]; }

  close() {
    for (const e of this.conns.values()) { try { e.ev && e.ev.close(); e.st && e.st.close(); } catch (err) { /* rien */ } }
    this.conns.clear();
    if (this.peer) { try { this.peer.destroy(); } catch (err) { /* rien */ } }
    this.peer = null;
  }
}

function errText(e) {
  switch (e.type) {
    case 'peer-unavailable': return 'Aucune partie avec ce code.';
    case 'network': case 'server-error': case 'socket-error': return 'Serveur de mise en relation injoignable. Vérifie ta connexion internet.';
    case 'browser-incompatible': return 'Ton navigateur ne gère pas WebRTC.';
    default: return 'Erreur réseau : ' + (e.type || e.message);
  }
}
