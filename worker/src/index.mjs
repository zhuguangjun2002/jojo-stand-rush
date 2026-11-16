/* =========================================================
   JOJO 奇妙格斗 · STAND RUSH — online room relay

   One Durable Object per 4-8 character room code. The relay mirrors
   server.py's small JSON protocol so the browser lockstep code does not
   need a second implementation for online play.

   It also keeps a short grace window for temporary disconnects:
   - a dropped socket does not immediately end the match
   - the same role may reconnect and receive recent paired frames
   - if nobody returns before GRACE_MS, the peer gets peer-left

   The Durable Object only forwards control messages. Gameplay, damage,
   hit detection and RNG remain on the two browsers.
   ========================================================= */

const ROOM_RE = /^[A-Z0-9]{4,8}$/;
const MAX_FRAME = 10_000_000;
const GRACE_MS = 30_000;
const HISTORY_FRAMES = 1_200; // ~20 seconds at 60 fps
const PING = 'ping';
const PONG = 'pong';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function cleanText(value, max = 24) {
  return String(value || '').slice(0, max);
}

function cleanFrame(value) {
  const frame = Number(value);
  if (!Number.isInteger(frame) || frame < 0 || frame > MAX_FRAME) return null;
  return frame;
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
    this.seen = { host: false, guest: false };
    this.disconnectedAt = { host: null, guest: null };
    this.latency = { host: null, guest: null };
    this.history = [];
    this.lastPaired = -1;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const room = (url.searchParams.get('room') || '').trim().toUpperCase();
    const role = (url.searchParams.get('role') || '').trim().toLowerCase();
    const otherRole = role === 'host' ? 'guest' : 'host';

    if (!ROOM_RE.test(room) || (role !== 'host' && role !== 'guest')) {
      return jsonResponse({ error: 'Invalid room or role' }, 400);
    }

    // A network drop may not have fired close yet. Replacing the old socket
    // makes a quick reconnect work instead of returning "role occupied".
    if (this.clients[role]) {
      try {
        this.clients[role].close(4000, 'replaced by reconnect');
      } catch (err) {
        // Already gone.
      }
      this.clients[role] = null;
    }

    // A guest may only join after this room has had a host. After a host
    // disconnect we keep that fact during the grace window.
    if (role === 'guest' && !this.seen.host && !this.clients.host) {
      return jsonResponse({ error: 'Room not found' }, 404);
    }

    const resumed = this.seen[role];
    this.seen[role] = true;
    this.disconnectedAt[role] = null;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    this.clients[role] = server;
    const peer = this.clients[otherRole];

    this.send(server, {
      type: 'ready',
      role,
      room,
      peer: Boolean(peer),
      resumed
    });
    if (peer) this.send(peer, { type: 'peer', connected: true });

    // Replay the other side's lobby choice and measured latency.
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
    if (this.latency[otherRole] != null) {
      this.send(server, {
        type: 'peer-latency',
        role: otherRole,
        rtt: this.latency[otherRole]
      });
    }
    if (this.latency[role] != null && peer) {
      this.send(peer, {
        type: 'peer-latency',
        role,
        rtt: this.latency[role]
      });
    }

    server.addEventListener('message', (event) => {
      this.onMessage(role, server, event.data);
    });
    server.addEventListener('close', () => this.leave(role, server, false));
    server.addEventListener('error', () => this.leave(role, server, false));

    await this.scheduleAlarm();
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
      case PING:
        this.send(socket, { type: PONG, t: message.t });
        return;

      case 'latency': {
        const rtt = Number(message.rtt);
        if (!Number.isFinite(rtt) || rtt < 0 || rtt > 10_000) return;
        this.latency[role] = Math.round(rtt);
        if (other) {
          this.send(other, {
            type: 'peer-latency',
            role,
            rtt: this.latency[role]
          });
        }
        return;
      }

      case 'resume': {
        const from = cleanFrame(message.frame);
        if (from == null) return;
        this.sendHistory(socket, from);
        return;
      }

      case 'choice': {
        const char = cleanText(message.char);
        this.choices[role] = char;
        if (other) {
          this.send(other, { type: 'peer-choice', role, char });
        }
        return;
      }

      case 'start':
      case 'rematch': {
        if (role !== 'host') return;
        // Each match starts at frame 0 again.
        this.inputs.host.clear();
        this.inputs.guest.clear();
        this.history = [];
        this.lastPaired = -1;
        const p1 = cleanText(message.p1);
        const p2 = cleanText(message.p2);
        const rawSeed = Number(message.seed);
        const seed = Number.isFinite(rawSeed)
          ? (rawSeed | 0) & 0x7fffffff
          : 0;
        const rawDelay = Number(message.delay);
        const delay = Number.isFinite(rawDelay)
          ? Math.max(0, Math.min(30, Math.round(rawDelay)))
          : null;
        if (other) {
          this.send(other, {
            type: message.type,
            p1,
            p2,
            seed,
            ...(delay == null ? {} : { delay })
          });
        }
        return;
      }

      case 'input': {
        const frame = cleanFrame(message.frame);
        if (frame == null || frame <= this.lastPaired) return;
        if (!message.input || typeof message.input !== 'object') return;
        this.inputs[role].set(frame, message.input);
        this.flushFrames();
        return;
      }

      case 'leave':
        this.leave(role, socket, true);
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
      .filter((frame) => frame > this.lastPaired && guestInputs.has(frame))
      .sort((a, b) => a - b);

    for (const frame of frames) {
      const inputs = [hostInputs.get(frame), guestInputs.get(frame)];
      hostInputs.delete(frame);
      guestInputs.delete(frame);
      this.lastPaired = frame;

      const payload = { type: 'frame', frame, inputs };
      this.history.push({ frame, inputs });
      if (this.history.length > HISTORY_FRAMES) {
        this.history.splice(0, this.history.length - HISTORY_FRAMES);
      }
      this.send(host, payload);
      this.send(guest, payload);
    }
  }

  sendHistory(socket, from) {
    if (!this.history.length) {
      if (from > 0) {
        this.send(socket, {
          type: 'resync-required',
          frame: from,
          oldest: null
        });
      }
      return;
    }
    const oldest = this.history[0].frame;
    if (from < oldest) {
      this.send(socket, {
        type: 'resync-required',
        frame: from,
        oldest
      });
      return;
    }
    for (const entry of this.history) {
      if (entry.frame >= from) {
        this.send(socket, {
          type: 'frame',
          frame: entry.frame,
          inputs: entry.inputs
        });
      }
    }
  }

  leave(role, socket, permanent) {
    if (this.clients[role] !== socket) return;
    this.clients[role] = null;

    if (permanent) {
      this.seen[role] = false;
      this.disconnectedAt[role] = null;
      this.choices[role] = null;
      this.latency[role] = null;
      this.inputs[role].clear();
    } else {
      this.disconnectedAt[role] = Date.now();
    }

    const other = this.clients[role === 'host' ? 'guest' : 'host'];
    if (other) {
      if (permanent) {
        this.send(other, { type: 'peer-left' });
      } else {
        this.send(other, {
          type: 'peer',
          connected: false,
          reconnect: true,
          graceMs: GRACE_MS
        });
      }
    }

    try {
      socket.close();
    } catch (err) {
      // Already closed.
    }
    this.scheduleAlarm();
  }

  async scheduleAlarm() {
    if (this.clients.host && this.clients.guest) {
      await this.state.storage.deleteAlarm();
      return;
    }
    const times = Object.values(this.disconnectedAt).filter((value) => value != null);
    if (!times.length) return;
    const next = Math.min(...times) + GRACE_MS;
    await this.state.storage.setAlarm(next);
  }

  async alarm() {
    const now = Date.now();
    let next = null;

    for (const role of ['host', 'guest']) {
      if (this.clients[role] || this.disconnectedAt[role] == null) continue;
      if (now >= this.disconnectedAt[role] + GRACE_MS) {
        this.seen[role] = false;
        this.disconnectedAt[role] = null;
        this.choices[role] = null;
        this.latency[role] = null;
        this.inputs[role].clear();
        const other = this.clients[role === 'host' ? 'guest' : 'host'];
        if (other) this.send(other, { type: 'peer-left' });
      } else {
        const at = this.disconnectedAt[role] + GRACE_MS;
        next = next == null ? at : Math.min(next, at);
      }
    }

    if (!this.clients.host && !this.clients.guest) {
      this.history = [];
      this.lastPaired = -1;
    }
    if (next != null) {
      await this.state.storage.setAlarm(next);
    }
  }
}
