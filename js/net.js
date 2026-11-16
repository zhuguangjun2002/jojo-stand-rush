/* =========================================================
   JOJO 奇妙格斗 · STAND RUSH — LAN room client

   The local Python server relays tiny JSON messages between two
   browsers. Both clients run the same deterministic match in lockstep:
   each input frame is only simulated after both players' inputs arrive.
   ========================================================= */
(function () {
  'use strict';
  const JG = window.JG;
  const G = JG.Game;

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
    frames: new Map(),
    listeners: {},
    manualClose: false,
    lastError: null,

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
        this.emit('error', '局域网联机需要通过本地服务器地址打开游戏');
        return false;
      }
      if (!JG.Server || JG.Server.online !== true) {
        this.emit('error', '当前页面没有联机房间服务；请在项目目录运行 ./run.sh 后再试');
        return false;
      }
      const code = String(room || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(code)) {
        this.emit('error', '房间码需要 4-8 位字母或数字');
        return false;
      }
      if (role !== 'host' && role !== 'guest') return false;

      this.close(true);
      this.room = code;
      this.role = role;
      this.localIndex = role === 'host' ? 0 : 1;
      this.peerConnected = false;
      this.localChoice = null;
      this.remoteChoice = null;
      this.seed = 0;
      this.lastError = null;
      this.resetFrames();
      this.manualClose = false;

      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${scheme}://${location.host}/__ws?room=${encodeURIComponent(code)}&role=${role}`;
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        this.emit('error', '无法连接联机服务');
        return false;
      }
      this.ws = ws;

      ws.onopen = () => {
        if (this.ws === ws) this.emit('open');
      };
      ws.onmessage = (ev) => {
        if (this.ws !== ws) return;
        let msg;
        try { msg = JSON.parse(ev.data); } catch (err) { return; }
        if (msg && typeof msg === 'object') this.handleMessage(msg);
      };
      ws.onerror = () => {
        if (this.ws === ws) this.emit('error', '联机连接失败');
      };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        this.peerConnected = false;
        if (!this.manualClose) this.emit('close');
      };
      return true;
    },

    host(code) { return this.connect(code || this.newCode(), 'host'); },
    join(code) { return this.connect(code, 'guest'); },

    close(silent) {
      if (this.ws) {
        this.manualClose = true;
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

    start(p1, p2, seed) {
      this.seed = seed >>> 0;
      return this.send({ type: 'start', p1, p2, seed: this.seed });
    },

    rematch(p1, p2, seed) {
      this.seed = seed >>> 0;
      return this.send({ type: 'rematch', p1, p2, seed: this.seed });
    },

    resetFrames() {
      this.nextFrame = 0;
      this.sentFrame = -1;
      this.frames = new Map();
    },

    sendInput(frame) {
      if (!this.ws || this.ws.readyState !== 1) return null;
      // Each machine controls its own fighter, so both always sample the
      // local P1 layout instead of making the guest use P2's number keys.
      const input = G.humanInput(0);
      this.send({ type: 'input', frame, input });
      this.sentFrame = frame;
      // The input was captured for exactly one simulation frame; later presses
      // must belong to the next frame, not this buffered one.
      G.Input.pressed.clear();
      return input;
    },

    handleMessage(msg) {
      switch (msg.type) {
        case 'ready':
          this.role = msg.role === 'guest' ? 'guest' : 'host';
          this.room = msg.room || this.room;
          this.localIndex = this.role === 'host' ? 0 : 1;
          this.peerConnected = !!msg.peer;
          this.lastError = null;
          this.emit('ready', msg);
          break;
        case 'peer':
          this.peerConnected = !!msg.connected;
          this.emit('peer', msg);
          break;
        case 'peer-choice':
          this.remoteChoice = msg.char || null;
          this.emit('peer-choice', msg);
          break;
        case 'start':
        case 'rematch':
          this.seed = (msg.seed || 0) >>> 0;
          this.resetFrames();
          this.emit(msg.type, msg);
          break;
        case 'frame':
          if (typeof msg.frame === 'number' && Array.isArray(msg.inputs)) {
            this.frames.set(msg.frame, msg.inputs);
            this.emit('frame', msg);
          }
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
