/* =========================================================
   JOJO 奇妙格斗 · STAND RUSH — room client

   A tiny JSON relay connects two browsers. Local play uses server.py;
   the public static build uses the Cloudflare Durable Object relay from
   js/config.js. Both clients run the same deterministic match in lockstep:
   each input frame is only simulated after both players' inputs arrive.

   Online play pre-sends input frames (onlineInputDelay) so a normal
   internet round trip does not throttle the simulation. A temporary
   socket drop freezes the match and retries the same room/role; the relay
   keeps a short frame history so the reconnecting side can catch up.
   ========================================================= */
(function () {
  'use strict';
  const JG = window.JG;
  const G = JG.Game;

  // Must match the object returned by Game.humanInput(0).
  const NEUTRAL_INPUT = {
    left: false, right: false, down: false, heavy: false, second: false,
    dodge: false, pUp: false, pLeft: false, pRight: false, pLight: false,
    pHeavy: false, pSpecial: false, pSecond: false, pSuper: false,
    pDodge: false
  };

  const RECONNECT_DELAYS = [500, 1000, 2000, 3000, 5000, 5000, 5000, 5000];

  function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  const Net = {
    ws: null,
    room: '',
    role: '',            // 'host' | 'guest'
    localIndex: 0,       // host = P1, guest = P2
    peerConnected: false,
    localChoice: null,
    remoteChoice: null,
    seed: 0,
    nextFrame: 0,
    sentFrame: -1,
    inputDelay: 0,
    frames: new Map(),
    sentInputs: new Map(),
    listeners: {},
    manualClose: false,
    lastError: null,

    // Online / reconnect state.
    usingRemote: false,
    endpoint: '',
    resuming: false,
    connectedOnce: false,
    reconnectAttempt: 0,
    reconnectTimer: null,
    pingTimer: null,
    rtt: null,
    peerRtt: null,
    rttSamples: [],
    peerRttSamples: [],

    on(event, fn) {
      (this.listeners[event] || (this.listeners[event] = [])).push(fn);
      return this;
    },

    emit(event, data) {
      for (const fn of this.listeners[event] || []) {
        try { fn(data); } catch (err) { console.error('[net]', err); }
      }
    },

    isHost() { return this.role === 'host'; },

    newCode() {
      const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 4; i++) code += pool[Math.floor(Math.random() * pool.length)];
      return code;
    },

    connect(room, role) {
      if (location.protocol !== 'http:' && location.protocol !== 'https:') {
        this.emit('error', '联机需要通过 http 或 https 地址打开游戏');
        return false;
      }
      const remoteWs = (JG.Config && JG.Config.onlineWs) || '';
      const localServer = JG.Server && JG.Server.online === true;
      if (!localServer && !remoteWs) {
        this.emit('error', '当前页面没有可用的联机服务；请刷新页面或在本机运行 ./run.sh');
        return false;
      }
      const configuredDelay = Number(window.JG_CONFIG && window.JG_CONFIG.onlineInputDelay);
      this.inputDelay = localServer
        ? 0
        : Math.max(0, Math.min(30, Number.isFinite(configuredDelay) ? Math.round(configuredDelay) : 12));
      const code = String(room || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(code)) {
        this.emit('error', '房间码需要 4-8 位字母或数字');
        return false;
      }
      if (role !== 'host' && role !== 'guest') return false;

      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      this.usingRemote = !localServer && Boolean(remoteWs);
      this.endpoint = this.usingRemote
        ? remoteWs
        : `${scheme}://${location.host}/__ws`;

      this.close(true);
      this.room = code;
      this.role = role;
      this.localIndex = role === 'host' ? 0 : 1;
      this.peerConnected = false;
      this.localChoice = null;
      this.remoteChoice = null;
      this.seed = 0;
      this.lastError = null;
      this.connectedOnce = false;
      this.resuming = false;
      this.reconnectAttempt = 0;
      this.rtt = null;
      this.peerRtt = null;
      this.rttSamples = [];
      this.peerRttSamples = [];
      this.resetFrames();
      this.manualClose = false;

      let url;
      try {
        url = this.buildUrl();
      } catch (err) {
        this.emit('error', '联机服务地址配置无效');
        return false;
      }
      this.openSocket(url, false);
      return true;
    },

    buildUrl() {
      const target = new URL(this.endpoint, location.href);
      if (target.protocol === 'http:') target.protocol = 'ws:';
      if (target.protocol === 'https:') target.protocol = 'wss:';
      target.searchParams.set('room', this.room);
      target.searchParams.set('role', this.role);
      return target.toString();
    },

    openSocket(url, resuming) {
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        if (resuming) this.scheduleReconnect();
        else this.emit('error', '无法连接联机服务');
        return;
      }
      this.ws = ws;
      this.resuming = resuming;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        if (this.usingRemote) this.startPing();
        if (resuming) {
          // Ask the relay to replay paired frames from our last simulated
          // frame, then resend any future inputs that were in flight.
          this.send({ type: 'resume', frame: this.nextFrame });
          this.resendPendingInputs();
          this.emit('reconnected-open');
        } else {
          this.emit('open');
        }
      };
      ws.onmessage = (ev) => {
        if (this.ws !== ws) return;
        let msg;
        try { msg = JSON.parse(ev.data); } catch (err) { return; }
        if (msg && typeof msg === 'object') this.handleMessage(msg);
      };
      ws.onerror = () => {
        if (this.ws === ws && !resuming && !this.connectedOnce) {
          this.emit('error', '联机连接失败');
        }
      };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        this.stopPing();
        this.peerConnected = false;
        if (this.manualClose) return;
        if (this.usingRemote && this.connectedOnce && this.room && this.role) {
          this.scheduleReconnect();
        } else {
          this.emit('close');
        }
      };
    },

    scheduleReconnect() {
      if (this.reconnectTimer || this.manualClose) return;
      if (!this.usingRemote) {
        this.emit('close');
        return;
      }
      if (this.reconnectAttempt >= RECONNECT_DELAYS.length) {
        this.emit('close');
        return;
      }
      const delay = RECONNECT_DELAYS[this.reconnectAttempt++];
      this.emit('reconnecting', { attempt: this.reconnectAttempt, delay });
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (this.manualClose) return;
        let url;
        try {
          url = this.buildUrl();
        } catch (err) {
          this.scheduleReconnect();
          return;
        }
        this.openSocket(url, true);
      }, delay);
    },

    retryNow() {
      if (!this.usingRemote || this.manualClose) return;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this.openSocket(this.buildUrl(), true);
      } else if (!this.ws && this.connectedOnce) {
        this.openSocket(this.buildUrl(), true);
      }
    },

    startPing() {
      if (!this.usingRemote) return;
      this.stopPing();
      const ping = () => {
        if (!this.ws || this.ws.readyState !== 1) return;
        this.send({ type: 'ping', t: performance.now() });
        if (this.rtt != null) this.send({ type: 'latency', rtt: this.rtt });
      };
      ping();
      this.pingTimer = setInterval(ping, 2000);
    },

    stopPing() {
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
    },

    clearReconnect() {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    },

    host(code) { return this.connect(code || this.newCode(), 'host'); },
    join(code) { return this.connect(code, 'guest'); },

    close(silent) {
      this.manualClose = true;
      this.clearReconnect();
      this.stopPing();
      if (this.ws) {
        try {
          if (!silent && this.ws.readyState === 1) {
            this.ws.send(JSON.stringify({ type: 'leave' }));
          }
          this.ws.close();
        } catch (err) { /* already closed */ }
        this.ws = null;
      }
      this.peerConnected = false;
      this.localChoice = null;
      this.remoteChoice = null;
      this.resuming = false;
      this.connectedOnce = false;
      this.reconnectAttempt = 0;
      this.resetFrames();
    },

    send(obj) {
      if (!this.ws || this.ws.readyState !== 1) return false;
      try { this.ws.send(JSON.stringify(obj)); return true; }
      catch (err) { return false; }
    },

    choose(char) {
      this.localChoice = char;
      const sent = this.send({ type: 'choice', char });
      if (sent) this.emit('choice', char);
      return sent;
    },

    setInputDelay(value) {
      const n = Number(value);
      if (Number.isFinite(n)) {
        this.inputDelay = Math.max(0, Math.min(30, Math.round(n)));
      }
      return this.inputDelay;
    },

    recommendedDelay() {
      if (!this.usingRemote) return 0;
      const rtt = Math.max(this.rtt || 0, this.peerRtt || 0);
      if (!rtt) return this.inputDelay || 12;
      // Inputs only need to cover one-way latency; RTT / 2 is the useful
      // number here. Three extra frames cover jitter and scheduling.
      const oneWay = rtt / 2;
      return Math.max(4, Math.min(24, Math.ceil(oneWay / (1000 / 60)) + 3));
    },

    latencyInfo() {
      return {
        rtt: this.rtt,
        peerRtt: this.peerRtt,
        delay: this.inputDelay,
        remote: this.usingRemote
      };
    },

    start(p1, p2, seed, delay) {
      this.setInputDelay(delay == null ? this.recommendedDelay() : delay);
      this.seed = seed >>> 0;
      return this.send({
        type: 'start', p1, p2, seed: this.seed, delay: this.inputDelay
      });
    },

    rematch(p1, p2, seed, delay) {
      this.setInputDelay(delay == null ? this.recommendedDelay() : delay);
      this.seed = seed >>> 0;
      return this.send({
        type: 'rematch', p1, p2, seed: this.seed, delay: this.inputDelay
      });
    },

    resetFrames() {
      this.nextFrame = 0;
      this.sentFrame = -1;
      this.frames = new Map();
      this.sentInputs = new Map();
    },

    sendInputAt(frame, input) {
      if (!this.ws || this.ws.readyState !== 1) return null;
      this.send({ type: 'input', frame, input });
      this.sentFrame = frame;
      this.sentInputs.set(frame, input);
      const cutoff = this.nextFrame - 120;
      for (const key of this.sentInputs.keys()) {
        if (key < cutoff) this.sentInputs.delete(key);
      }
      return input;
    },

    // Seed the delay pipeline with neutral frames. Without this the first
    // real input would still have to make a full network round trip before
    // frame 0 can be simulated.
    primeInputs() {
      if (this.inputDelay <= 0 || this.sentFrame >= 0) return;
      for (let frame = 0; frame < this.inputDelay; frame++) {
        if (!this.sendInputAt(frame, NEUTRAL_INPUT)) return;
      }
    },

    sendNextInput() {
      const target = this.nextFrame + this.inputDelay;
      if (this.sentFrame >= target) return null;
      const input = G.humanInput(0);
      const sent = this.sendInputAt(target, input);
      // The input was captured for exactly one simulation frame; later presses
      // must belong to the next frame, not this buffered one.
      G.Input.pressed.clear();
      return sent;
    },

    sendInput(frame) {
      // Each machine controls its own fighter, so both always sample the
      // local P1 layout instead of making the guest use P2's number keys.
      const input = G.humanInput(0);
      const sent = this.sendInputAt(frame, input);
      G.Input.pressed.clear();
      return sent;
    },

    resendPendingInputs() {
      for (const [frame, input] of this.sentInputs) {
        if (frame >= this.nextFrame) {
          this.send({ type: 'input', frame, input });
        }
      }
    },

    handleMessage(msg) {
      switch (msg.type) {
        case 'ready': {
          const wasResuming = this.resuming;
          this.resuming = false;
          this.connectedOnce = true;
          this.reconnectAttempt = 0;
          this.clearReconnect();
          this.role = msg.role === 'guest' ? 'guest' : 'host';
          this.room = msg.room || this.room;
          this.localIndex = this.role === 'host' ? 0 : 1;
          this.peerConnected = !!msg.peer;
          this.lastError = null;
          if (wasResuming && !msg.resumed) {
            this.connectedOnce = false;
            this.emit('resync-required', { reason: 'room-reset' });
            this.close(true);
            break;
          }
          if (wasResuming) this.emit('reconnected', msg);
          else this.emit('ready', msg);
          this.emit('latency', this.latencyInfo());
          break;
        }
        case 'peer':
          this.peerConnected = !!msg.connected;
          this.emit('peer', msg);
          break;
        case 'peer-choice':
          this.remoteChoice = msg.char || null;
          this.emit('peer-choice', msg);
          break;
        case 'peer-latency': {
          const rtt = Number(msg.rtt);
          if (Number.isFinite(rtt)) {
            this.peerRttSamples.push(Math.max(0, Math.min(10000, rtt)));
            if (this.peerRttSamples.length > 5) this.peerRttSamples.shift();
            this.peerRtt = median(this.peerRttSamples);
            this.emit('latency', this.latencyInfo());
          }
          break;
        }
        case 'start':
        case 'rematch':
          if (msg.delay != null) this.setInputDelay(msg.delay);
          this.seed = (msg.seed || 0) >>> 0;
          this.resetFrames();
          this.emit(msg.type, msg);
          this.emit('latency', this.latencyInfo());
          break;
        case 'frame':
          if (typeof msg.frame === 'number' &&
              msg.frame >= this.nextFrame &&
              Array.isArray(msg.inputs)) {
            this.frames.set(msg.frame, msg.inputs);
            this.emit('frame', msg);
          }
          break;
        case 'pong': {
          const sent = Number(msg.t);
          if (Number.isFinite(sent)) {
            const sample = performance.now() - sent;
            if (sample >= 0 && sample < 10000) {
              this.rttSamples.push(sample);
              if (this.rttSamples.length > 5) this.rttSamples.shift();
              this.rtt = median(this.rttSamples);
              this.send({ type: 'latency', rtt: this.rtt });
              this.emit('latency', this.latencyInfo());
            }
          }
          break;
        }
        case 'resync-required':
          this.emit('resync-required', msg);
          break;
        case 'peer-left':
          this.peerConnected = false;
          this.emit('peer-left');
          break;
        case 'error':
          this.lastError = msg.message || '联机错误';
          this.emit('error', this.lastError);
          break;
        default:
          break;
      }
    }
  };

  JG.Net = Net;
  if (G) G.Net = Net;
})();
