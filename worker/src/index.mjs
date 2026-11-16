/* =========================================================
   JOJO 奇妙格斗 · STAND RUSH — online room relay

   One Durable Object per 4-8 character room code. The relay mirrors
   server.py's small JSON protocol so the browser lockstep code does not
   need a second implementation for online play.

   The Durable Object only forwards control messages. Gameplay, damage,
   hit detection and RNG remain on the two browsers.
   ========================================================= */

const ROOM_RE = /^[A-Z0-9]{4,8}$/;
const MAX_FRAME = 10_000_000;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response('ok', {
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }

    const room = (url.searchParams.get('room') || '').trim().toUpperCase();
    const role = (url.searchParams.get('role') || '').trim().toLowerCase();
    if (!ROOM_RE.test(room) || (role !== 'host' && role !== 'guest')) {
      return jsonResponse({ error: 'Invalid room or role' }, 400);
    }
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return jsonResponse({ error: 'WebSocket upgrade required' }, 426);
    }

    const id = env.ROOMS.idFromName(room);
    return env.ROOMS.get(id).fetch(request);
  }
};

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = { host: null, guest: null };
    this.choices = { host: null, guest: null };
    this.inputs = { host: new Map(), guest: new Map() };
  }

  async fetch(request) {
    const url = new URL(request.url);
    const room = (url.searchParams.get('room') || '').trim().toUpperCase();
    const role = (url.searchParams.get('role') || '').trim().toLowerCase();
    const otherRole = role === 'host' ? 'guest' : 'host';

    if (!ROOM_RE.test(room) || (role !== 'host' && role !== 'guest')) {
      return jsonResponse({ error: 'Invalid room or role' }, 400);
    }
    if (this.clients[role]) {
      return jsonResponse({ error: 'Role already occupied' }, 409);
    }
    if (role === 'guest' && !this.clients.host) {
      return jsonResponse({ error: 'Room not found' }, 404);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    this.clients[role] = server;
    const peer = this.clients[otherRole];

    this.send(server, {
      type: 'ready',
      role,
      room,
      peer: Boolean(peer)
    });
    if (peer) this.send(peer, { type: 'peer', connected: true });

    // Replay the other side's lobby choice so a late joiner catches up.
    if (peer && this.choices[otherRole]) {
      this.send(server, {
        type: 'peer-choice',
        role: otherRole,
        char: this.choices[otherRole]
      });
    }
    if (peer && this.choices[role]) {
      this.send(peer, {
        type: 'peer-choice',
        role,
        char: this.choices[role]
      });
    }

    server.addEventListener('message', (event) => {
      this.onMessage(role, server, event.data);
    });
    server.addEventListener('close', () => this.leave(role, server));
    server.addEventListener('error', () => this.leave(role, server));

    return new Response(null, { status: 101, webSocket: client });
  }

  send(socket, message) {
    try {
      socket.send(JSON.stringify(message));
    } catch (err) {
      // A dead socket is cleaned up by its close handler.
    }
  }

  onMessage(role, socket, raw) {
    if (this.clients[role] !== socket) return;
    let message;
    try {
      message = JSON.parse(raw);
    } catch (err) {
      return;
    }
    if (!message || typeof message !== 'object') return;

    const other = this.clients[role === 'host' ? 'guest' : 'host'];

    switch (message.type) {
      case 'choice': {
        const char = String(message.char || '').slice(0, 24);
        this.choices[role] = char;
        if (other) {
          this.send(other, { type: 'peer-choice', role, char });
        }
        return;
      }

      case 'start':
      case 'rematch': {
        if (role !== 'host') return;
        const p1 = String(message.p1 || '').slice(0, 24);
        const p2 = String(message.p2 || '').slice(0, 24);
        const rawSeed = Number(message.seed);
        const seed = Number.isFinite(rawSeed)
          ? (rawSeed | 0) & 0x7fffffff
          : 0;
        if (other) {
          this.send(other, { type: message.type, p1, p2, seed });
        }
        return;
      }

      case 'input': {
        const frame = Number(message.frame);
        if (!Number.isInteger(frame) || frame < 0 || frame > MAX_FRAME) return;
        if (!message.input || typeof message.input !== 'object') return;
        this.inputs[role].set(frame, message.input);
        this.flushFrames();
        return;
      }

      case 'leave':
        this.leave(role, socket);
        return;

      default:
        return;
    }
  }

  flushFrames() {
    const host = this.clients.host;
    const guest = this.clients.guest;
    if (!host || !guest) return;

    const hostInputs = this.inputs.host;
    const guestInputs = this.inputs.guest;
    const frames = [...hostInputs.keys()]
      .filter((frame) => guestInputs.has(frame))
      .sort((a, b) => a - b);

    for (const frame of frames) {
      const inputs = [hostInputs.get(frame), guestInputs.get(frame)];
      hostInputs.delete(frame);
      guestInputs.delete(frame);
      const payload = { type: 'frame', frame, inputs };
      this.send(host, payload);
      this.send(guest, payload);
    }
  }

  leave(role, socket) {
    if (this.clients[role] !== socket) return;
    this.clients[role] = null;
    this.choices[role] = null;
    this.inputs[role].clear();

    const other = this.clients[role === 'host' ? 'guest' : 'host'];
    if (other) this.send(other, { type: 'peer-left' });

    try {
      socket.close();
    } catch (err) {
      // Already closed.
    }
  }
}
