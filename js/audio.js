/* =========================================================
   Synthesized audio — no external assets required
   ========================================================= */
(function () {
  'use strict';
  const JG = (window.JG = window.JG || {});

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicBus = null;
      this.sfxBus = null;
      this.noiseBuffer = null;
      this.muted = false;
      this.musicTimer = null;
      this.nextNoteTime = 0;
      this.step = 0;
      this.playing = false;
      this.bpm = 92;
      this.musicMode = 'menu';
      this.debug = false;
      this.lastSpeechAt = 0;
      this.voiceCache = {};
      this.voiceFailed = new Set();
      this.activeVoices = new Set();
      this.chantTimer = null;
      this.chantAudios = new Set();
      this.chantToken = 0;
      this.chantOwner = null;
      this.shortVoiceCache = {};
      this.activeShortVoice = null;
      this.speechPrimed = false;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.72;
      this.master.connect(this.ctx.destination);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicMode === 'battle' ? 0.19 : 0.14;
      this.musicBus.connect(this.master);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.78;
      this.sfxComp = this.ctx.createDynamicsCompressor();
      this.sfxComp.threshold.value = -16;
      this.sfxComp.knee.value = 14;
      this.sfxComp.ratio.value = 3.2;
      this.sfxComp.attack.value = 0.003;
      this.sfxComp.release.value = 0.18;
      this.sfxBus.connect(this.sfxComp);
      this.sfxComp.connect(this.master);

      const len = Math.floor(this.ctx.sampleRate * 1.2);
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      this.startMusic();
    }

    unlock() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      this.primeSpeech();
    }

    setMuted(v) {
      this.muted = v;
      if (this.master) {
        this.master.gain.setTargetAtTime(v ? 0 : 0.72, this.ctx.currentTime, 0.04);
      }
      if (v) {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        this.pauseVoices();
        this.stopChant();
      }
    }

    suspend() {
      if (this.musicTimer) {
        clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
      this.playing = false;
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      this.pauseVoices();
      this.stopChant();
      if (this.ctx && this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    }

    resume() {
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      if (!this.muted) this.startMusic();
    }

    now() { return this.ctx ? this.ctx.currentTime : 0; }

    tone(freq, dur, type, vol, when, glide) {
      if (!this.ctx || this.muted) return;
      const t0 = when == null ? this.ctx.currentTime : when;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(Math.max(20, freq), t0);
      if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(this.sfxBus);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    noise(dur, vol, filterType, freq, q, when, bus) {
      if (!this.ctx || this.muted) return;
      const t0 = when == null ? this.ctx.currentTime : when;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType || 'lowpass';
      filter.frequency.value = freq || 1200;
      filter.Q.value = q || 0.8;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(bus || this.sfxBus);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    }

    ui() {
      this.init();
      this.tone(420, 0.06, 'triangle', 0.12);
      this.tone(760, 0.08, 'sine', 0.06, this.now() + 0.03);
    }

    select() {
      this.init();
      this.tone(330, 0.1, 'square', 0.07);
      this.tone(660, 0.16, 'triangle', 0.1, this.now() + 0.08);
      this.tone(990, 0.2, 'sine', 0.08, this.now() + 0.16);
    }

    confirm() {
      this.init();
      this.tone(180, 0.18, 'sawtooth', 0.1, this.now(), 90);
      this.noise(0.2, 0.08, 'highpass', 1800);
      [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.07, this.now() + i * 0.055));
    }

    perfectDodge() {
      this.init();
      const t = this.now();
      // Sharp bell-like "ting": high sine + glassy overtone + click.
      this.tone(2850, 0.16, 'sine', 0.2, t, 3350);
      this.tone(4200, 0.1, 'triangle', 0.08, t + 0.005, 3900);
      this.tone(1400, 0.12, 'sine', 0.045, t + 0.02, 1100);
      this.noise(0.035, 0.14, 'highpass', 5200, 1.1, t);
      this.tone(3150, 0.09, 'sine', 0.055, t + 0.075, 3000);
    }

    hitLight() {
      this.init();
      const t = this.now();
      const p = 160 + Math.random() * 42;
      // knuckle transient, mid crack, body thump, tiny snap
      this.noise(0.022, 0.18, 'highpass', 4600, 1.0, t);
      this.noise(0.06, 0.22, 'bandpass', 1350 + Math.random() * 850, 1.2, t + 0.002);
      this.tone(p, 0.1, 'sine', 0.3, t, 58);
      this.tone(72, 0.1, 'triangle', 0.23, t, 40);
      this.tone(980 + Math.random() * 220, 0.025, 'square', 0.045, t + 0.001, 480);
    }

    hitHeavy() {
      this.init();
      const t = this.now();
      // heavy: paper-thin click, low body, chest crack, metal tail
      this.noise(0.038, 0.28, 'highpass', 3900, 0.9, t);
      this.noise(0.16, 0.4, 'lowpass', 820, 0.7, t);
      this.tone(108, 0.26, 'sine', 0.5, t, 35);
      this.tone(52, 0.3, 'triangle', 0.38, t, 27);
      this.tone(250 + Math.random() * 90, 0.055, 'square', 0.09, t, 110);
      this.noise(0.09, 0.16, 'bandpass', 2100, 1.4, t + 0.012);
      this.tone(430, 0.18, 'triangle', 0.045, t + 0.02, 180);
    }

    hitBarrage() {
      this.init();
      const t = this.now();
      // shorter than hitLight so rapid ORA/MUDA hits do not smother each other
      this.noise(0.016, 0.14, 'highpass', 5200, 1.2, t);
      this.noise(0.045, 0.14, 'bandpass', 2100 + Math.random() * 1100, 1.8, t + 0.002);
      this.tone(190 + Math.random() * 55, 0.06, 'sine', 0.2, t, 88);
      this.tone(78, 0.06, 'triangle', 0.12, t, 48);
    }

    block() {
      this.init();
      const t = this.now();
      // metal-on-metal guard: hard transient, tight ring, low brace
      this.noise(0.035, 0.2, 'highpass', 4300, 1.1, t);
      this.noise(0.07, 0.2, 'bandpass', 2600, 3.2, t + 0.003);
      this.tone(760, 0.1, 'triangle', 0.12, t, 520);
      this.tone(1320, 0.05, 'sine', 0.05, t + 0.004);
      this.tone(125, 0.13, 'sine', 0.18, t, 78);
      this.noise(0.15, 0.06, 'lowpass', 800, 0.8, t + 0.02);
    }

    jump() {
      this.init();
      const t = this.now();
      this.noise(0.12, 0.07, 'bandpass', 850 + Math.random() * 300, 1.1, t);
      this.tone(240, 0.16, 'sine', 0.055, t, 540);
      this.noise(0.06, 0.04, 'highpass', 3100, 0.8, t + 0.02);
    }

    land() {
      this.init();
      const t = this.now();
      this.noise(0.16, 0.24, 'lowpass', 380, 0.8, t);
      this.tone(70, 0.18, 'sine', 0.26, t, 34);
      this.tone(180, 0.055, 'triangle', 0.06, t, 90);
      this.noise(0.08, 0.08, 'bandpass', 1500, 1.2, t + 0.01);
    }

    whiff() {
      this.init();
      const t = this.now();
      this.noise(0.16, 0.11, 'bandpass', 760 + Math.random() * 420, 1.2, t);
      this.noise(0.08, 0.05, 'highpass', 3100, 0.9, t + 0.02);
      this.tone(300, 0.12, 'triangle', 0.025, t, 620);
    }

    rush() {
      this.init();
      const t = this.now();
      for (let i = 0; i < 5; i++) {
        this.noise(0.04, 0.085, 'bandpass', 1800 + Math.random() * 900, 2, t + i * 0.045);
      }
      this.tone(120, 0.08, 'square', 0.05, t);
      this.noise(0.18, 0.08, 'lowpass', 520, 0.8, t);
    }

    projectile() {
      this.init();
      const t = this.now();
      this.tone(920, 0.2, 'sawtooth', 0.08, t, 280);
      this.noise(0.16, 0.09, 'bandpass', 1700, 1.2, t);
      this.tone(120, 0.13, 'sine', 0.1, t, 55);
      this.noise(0.1, 0.05, 'highpass', 3200, 0.8, t + 0.01);
    }

    special() {
      this.init();
      const t = this.now();
      this.noise(0.34, 0.19, 'bandpass', 700, 0.8, t);
      this.tone(88, 0.42, 'sawtooth', 0.24, t, 38);
      this.tone(44, 0.5, 'sine', 0.28, t, 26);
      this.tone(523, 0.4, 'triangle', 0.07, t + 0.02);
      this.tone(784, 0.35, 'triangle', 0.06, t + 0.08);
      this.tone(1046, 0.28, 'sine', 0.04, t + 0.13, 1318);
      this.noise(0.22, 0.08, 'highpass', 3800, 0.7, t + 0.06);
    }

    standSummon() {
      this.init();
      const t = this.now();
      this.tone(58, 0.85, 'sawtooth', 0.18, t, 30);
      this.noise(0.55, 0.12, 'bandpass', 900, 1.1, t);
      this.noise(0.24, 0.11, 'highpass', 1900, 0.8, t);
      this.tone(170, 0.32, 'sawtooth', 0.14, t, 560);
      this.tone(880, 0.24, 'triangle', 0.07, t + 0.05);
      this.tone(1320, 0.28, 'sine', 0.06, t + 0.1, 1760);
      this.tone(264, 0.5, 'sine', 0.06, t + 0.08, 528);
    }

    guardBreak() {
      this.init();
      const t = this.now();
      this.noise(0.18, 0.3, 'bandpass', 2300, 2.6, t);
      this.tone(1180, 0.2, 'square', 0.09, t, 380);
      this.tone(150, 0.3, 'sine', 0.28, t, 52);
      this.tone(48, 0.36, 'triangle', 0.3, t, 28);
      this.noise(0.32, 0.16, 'highpass', 4800, 0.7, t + 0.03);
      this.tone(2350, 0.08, 'triangle', 0.045, t + 0.02, 1700);
    }

    secondSkill() {
      this.init();
      const t = this.now();
      this.noise(0.26, 0.09, 'bandpass', 2500, 1.4, t);
      this.tone(330, 0.18, 'triangle', 0.08, t);
      this.tone(660, 0.28, 'triangle', 0.07, t + 0.07, 880);
      this.tone(990, 0.34, 'sine', 0.05, t + 0.14, 1320);
      this.tone(82, 0.3, 'sine', 0.16, t, 42);
      this.noise(0.18, 0.05, 'highpass', 4200, 0.7, t + 0.12);
    }

    beam() {
      this.init();
      const t = this.now();
      this.noise(0.2, 0.16, 'highpass', 4100, 0.7, t);
      this.tone(2100, 0.2, 'sawtooth', 0.1, t, 320);
      this.tone(460, 0.28, 'square', 0.06, t + 0.02, 1900);
      this.tone(82, 0.24, 'sine', 0.13, t, 48);
      this.tone(58, 0.3, 'triangle', 0.12, t, 38);
    }

    heal() {
      this.init();
      const t = this.now();
      const notes = [523.3, 659.3, 784, 1046.5];
      notes.forEach((f, i) => this.tone(f, 0.5, 'sine', 0.07, t + i * 0.055));
      this.noise(0.35, 0.05, 'highpass', 5200, 0.6, t);
      this.tone(261.6, 0.6, 'triangle', 0.05, t, 392);
    }

    requiem() {
      this.init();
      const t = this.now();
      this.noise(0.7, 0.18, 'highpass', 900, 0.7, t);
      this.tone(55, 1.25, 'sawtooth', 0.22, t, 36);
      [220, 277.2, 329.6, 440, 554.4, 659.3].forEach((f, i) => {
        this.tone(f, 1.1, 'triangle', 0.06, t + i * 0.055);
      });
      this.tone(1568, 0.9, 'sine', 0.05, t + 0.12, 392);
    }

    truth() {
      this.init();
      const t = this.now();
      this.noise(0.55, 0.25, 'lowpass', 700, 0.8, t);
      this.tone(70, 1.2, 'sawtooth', 0.23, t, 28);
      this.tone(1400, 0.8, 'sine', 0.08, t, 110);
      this.tone(2100, 0.4, 'square', 0.05, t + 0.04, 220);
      this.noise(0.8, 0.12, 'highpass', 5200, 0.6, t + 0.12);
    }

    super() {
      this.init();
      const t = this.now();
      this.noise(0.7, 0.22, 'highpass', 1100, 0.7, t);
      this.tone(55, 1.1, 'sawtooth', 0.22, t, 34);
      this.tone(110, 0.9, 'square', 0.09, t + 0.02, 55);
      this.tone(40, 1.3, 'sine', 0.22, t, 24);
      this.tone(220, 0.4, 'sine', 0.06, t, 1760);
      [220, 261.6, 329.6, 440, 523.3].forEach((f, i) => {
        this.tone(f, 0.85, 'triangle', 0.07, t + 0.06 + i * 0.035);
      });
      this.noise(0.3, 0.26, 'lowpass', 700, 0.7, t + 0.55);
      this.tone(70, 0.35, 'triangle', 0.2, t + 0.55, 38);
    }

    timeStop() {
      this.init();
      const t = this.now();
      // time folds upward, then the world drops into a sub drone
      this.tone(220, 0.42, 'sine', 0.08, t, 2400);
      this.tone(1400, 1.2, 'sine', 0.08, t, 45);
      this.tone(70, 1.4, 'sine', 0.3, t, 30);
      this.tone(52, 1.6, 'sawtooth', 0.1, t, 28);
      this.noise(0.9, 0.1, 'lowpass', 300, 0.8, t);
      this.tone(1046, 0.8, 'triangle', 0.04, t + 0.04, 260);
      // clock ticks
      this.tone(2300, 0.02, 'square', 0.05, t + 0.28, 2150);
      this.tone(2300, 0.02, 'square', 0.04, t + 0.62, 2150);
      this.tone(2300, 0.02, 'square', 0.035, t + 0.94, 2100);
    }

    roadRollerStart() {
      this.init();
      const t = this.now();
      // diesel idle + metal creak + warning beep
      this.tone(48, 1.3, 'sawtooth', 0.18, t, 42);
      this.tone(96, 1.0, 'square', 0.05, t, 74);
      this.noise(1.1, 0.1, 'lowpass', 240, 0.8, t);
      this.tone(720, 0.42, 'sawtooth', 0.045, t + 0.12, 260);
      this.noise(0.2, 0.08, 'bandpass', 1800, 2.2, t + 0.12);
      this.tone(1320, 0.16, 'square', 0.04, t + 0.58, 1180);
    }

    roadRollerImpact() {
      this.init();
      const t = this.now();
      this.noise(0.24, 0.5, 'lowpass', 460, 0.7, t);
      this.tone(46, 0.62, 'sine', 0.72, t, 23);
      this.tone(92, 0.42, 'triangle', 0.42, t, 34);
      this.noise(0.34, 0.24, 'bandpass', 1250, 0.8, t + 0.015);
      this.tone(220, 0.5, 'square', 0.075, t, 70);
      this.tone(880, 0.22, 'triangle', 0.06, t + 0.03, 320);
      this.noise(0.28, 0.12, 'highpass', 4200, 0.7, t + 0.04);
    }

    emerald() {
      this.init();
      const t = this.now();
      for (let i = 0; i < 7; i++) {
        this.tone(1200 + Math.random() * 1100, 0.12, 'triangle', 0.04, t + i * 0.032, 2200);
      }
      this.noise(0.18, 0.09, 'highpass', 4800, 0.8, t);
      this.tone(320, 0.2, 'sine', 0.08, t, 120);
      this.noise(0.12, 0.06, 'bandpass', 2600, 2.0, t + 0.02);
    }

    ko() {
      this.init();
      const t = this.now();
      // final blow: sub impact, crumbling noise, long dark ring
      this.tone(220, 0.9, 'sawtooth', 0.15, t, 42);
      this.tone(110, 1.2, 'square', 0.1, t, 32);
      this.tone(48, 1.1, 'sine', 0.3, t, 22);
      this.noise(0.5, 0.24, 'lowpass', 500, 0.8, t);
      this.noise(0.75, 0.12, 'bandpass', 1500, 1.0, t + 0.04);
      this.tone(1760, 0.8, 'sine', 0.04, t + 0.06, 440);
      this.tone(440, 1.0, 'triangle', 0.06, t + 0.12, 220);
    }

    round() {
      this.init();
      const t = this.now();
      this.tone(110, 0.5, 'triangle', 0.14, t, 80);
      this.tone(220, 0.3, 'triangle', 0.09, t + 0.2);
      this.tone(330, 0.45, 'triangle', 0.08, t + 0.36);
      this.tone(55, 0.7, 'sine', 0.14, t, 40);
      this.noise(0.4, 0.05, 'lowpass', 450, 0.7, t);
    }

    victory() {
      this.init();
      const t = this.now();
      const notes = [261.6, 329.6, 392, 523.3, 659.3, 784];
      notes.forEach((f, i) => {
        this.tone(f, 0.4, 'triangle', 0.075, t + i * 0.09);
        this.tone(f / 2, 0.45, 'sawtooth', 0.035, t + i * 0.09);
      });
      this.noise(0.5, 0.06, 'highpass', 4000, 0.7, t + 0.4);
    }

    pauseVoices() {
      for (const a of this.activeVoices) {
        try { a.pause(); } catch (_) {}
      }
      this.activeVoices.clear();
      if (this.activeShortVoice) {
        try { this.activeShortVoice.pause(); } catch (_) {}
        this.activeShortVoice = null;
      }
    }

    stopChant(owner) {
      if (owner && this.chantOwner && this.chantOwner !== owner) return;
      this.chantOwner = null;
      this.chantToken += 1;
      if (this.chantTimer) {
        clearTimeout(this.chantTimer);
        this.chantTimer = null;
      }
      for (const a of this.chantAudios) {
        try { a.pause(); } catch (_) {}
      }
      this.chantAudios.clear();
    }

    shortChant(charId) {
      if (this.muted || typeof Audio === 'undefined' || charId === 'tooru') return;
      const map = {
        jotaro: 'jotaro_ora_short',
        dio: 'dio_muda_short',
        giorno: 'giorno_muda_short',
        kakyoin: 'kakyoin_emerald_short',
        josuke: 'josuke_bubble_short'
      };
      const name = map[charId] || map.jotaro;
      try {
        let a = this.shortVoiceCache[name];
        if (!a) {
          a = new Audio('voices/' + name + '.mp3');
          a.preload = 'auto';
          this.shortVoiceCache[name] = a;
        }
        if (this.activeShortVoice && this.activeShortVoice !== a) {
          try { this.activeShortVoice.pause(); } catch (_) {}
        }
        a.currentTime = 0;
        a.volume = 0.42;
        this.activeShortVoice = a;
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
      } catch (_) {}
    }

    startChant(charId, duration, owner) {
      this.stopChant();
      if (this.muted || typeof Audio === 'undefined' || charId === 'tooru') return;
      this.chantOwner = owner || null;
      const map = {
        jotaro: { clip: 'jotaro_ora_short', interval: 230, cut: 520 },
        dio: { clip: 'dio_muda_short', interval: 250, cut: 540 },
        giorno: { clip: 'giorno_muda_short', interval: 215, cut: 500 },
        kakyoin: { clip: 'kakyoin_emerald_short', interval: 620, cut: 900 },
        josuke: { clip: 'josuke_bubble_short', interval: 300, cut: 560 }
      };
      const cfg = map[charId] || map.jotaro;
      const token = this.chantToken;
      const end = performance.now() + Math.max(300, (duration || 1) * 1000) + 120;
      const tick = () => {
        if (token !== this.chantToken || performance.now() > end) {
          if (token === this.chantToken) this.stopChant();
          return;
        }
        try {
          const a = new Audio('voices/' + cfg.clip + '.mp3');
          a.preload = 'auto';
          a.volume = 0.44;
          this.chantAudios.add(a);
          const cutTimer = setTimeout(() => {
            try { a.pause(); } catch (_) {}
            this.chantAudios.delete(a);
          }, cfg.cut);
          a.addEventListener('ended', () => {
            clearTimeout(cutTimer);
            this.chantAudios.delete(a);
          });
          const p = a.play();
          if (p && p.catch) p.catch(() => {});
        } catch (_) {}
        this.chantTimer = setTimeout(tick, cfg.interval);
      };
      tick();
    }

    voiceClip(name, fallback, opts) {
      if (this.muted || typeof Audio === 'undefined' || this.voiceFailed.has(name)) return false;
      opts = opts || {};
      const file = /\.(mp3|wav)$/i.test(name) ? name : name + '.mp3';
      let a = this.voiceCache[name];
      if (!a) {
        a = new Audio('voices/' + file);
        a.preload = 'auto';
        a.volume = 0.86;
        a.addEventListener('ended', () => this.activeVoices.delete(a));
        this.voiceCache[name] = a;
      }
      try {
        this.pauseVoices();
        a.currentTime = 0;
        a.volume = opts.volume == null ? 0.86 : opts.volume;
        a.playbackRate = opts.rate == null ? 1 : opts.rate;
        // HTMLAudio preserves pitch by default in Chrome; disabling it lowers
        // the voice together with the speed for Tooru's deeper delivery.
        a.preservesPitch = false;
        a.mozPreservesPitch = false;
        a.webkitPreservesPitch = false;
        this.activeVoices.add(a);
        const p = a.play();
        if (p && p.catch) p.catch((err) => {
          this.activeVoices.delete(a);
          // Do not permanently disable a clip just because autoplay was blocked;
          // the next user gesture should be allowed to play it.
          if (err && err.name === 'NotAllowedError') return;
          this.voiceFailed.add(name);
          fallback();
        });
        return true;
      } catch (_) {
        this.voiceFailed.add(name);
        fallback();
        return false;
      }
    }

    shout(name, jaText, enText, opts) {
      const fallback = () => this.speak(jaText, enText, opts);
      if (!this.voiceClip(name, fallback)) fallback();
    }

    tooruLine(kind) {
      const lines = {
        stone: ['オブラディ、オブラダ……', 'Ob-la-di, ob-la-da...', 'OB-LA-DI-OB-LA-DA……'],
        grab: ['災厄は、あなたを追いかけます。', 'Calamity will follow you.', '灾厄会追上你。'],
        guard: ['私に触れるな……', "You'd better not touch me...", '你最好不要动我。'],
        counter: ['私を【追跡】するつもりか。', 'Are you trying to pursue me?', '你是打算要【追查】我吗。'],
        rain: ['あなたの行為は【追跡】とみなします。', 'Your actions count as pursuit.', '你刚才的行为算是【追击】了哦。'],
        domain: ['災厄の悪……', 'The evil of calamity...', '灾厄的恶……'],
        finisher: ['私は、やめろと言ったはずです……', 'I already told you to stop...', '我已经告诉过你要住手了.......']
      };
      const line = lines[kind] || lines.guard;
      const fallback = () => {
        // Old Chinese WAVs are only a fallback if the Japanese MP3 is missing.
        if (this.voiceClip('tooru_' + kind + '.wav', () => this.speak(line[0], line[1], {
          gender: 'male', rate: 0.82, pitch: 0.58, volume: 0.82
        }, line[2]), { rate: 0.8, volume: 0.9 })) return;
        this.speak(line[0], line[1], {
          gender: 'male', rate: 0.82, pitch: 0.58, volume: 0.82
        }, line[2]);
      };
      // Japanese VOICEVOX male clips. The deeper, slower delivery is baked
      // into the files themselves, so playback stays at 1x — stacking another
      // rate reduction here made Tooru sound like a tape player running dry.
      if (this.voiceClip('tooru_' + kind + '.mp3', fallback, { rate: 1, volume: 0.9 })) return;
      fallback();
    }

    josukeLine(kind) {
      const lines = {
        evolve: ['ソフト・アンド・ウェット・ゴー・ビヨンド！', 'SOFT & WET: GO BEYOND!', '软又湿·超越！'],
        bubble: ['その力、奪わせてもらう。', "I'll be taking that.", '那份力量，我收下了。'],
        steal: ['いただき。', 'Got it.', '夺走了。'],
        finisher: ['泡沫は、すべてを奪う。', 'Bubbles take everything.', '泡沫，会夺走一切。']
      };
      const line = lines[kind] || lines.bubble;
      const fallback = () => this.speak(line[0], line[1], {
        gender: 'male', rate: 0.98, pitch: 0.72, volume: 0.86
      }, line[2]);
      if (this.voiceClip('josuke_' + kind + '.mp3', fallback, { rate: 1, volume: 0.92 })) return;
      fallback();
    }

    johnnyLine(kind) {
      if (this.muted) return;
      const lines = {
        intro: ['ぼくは、自分の道を進む。', 'I will follow my own path.', '我要走自己的道路。'],
        nail: ['タスク！回転しろ！', 'Tusk! Spin!', '牙！回转吧！'],
        barrage: ['オラオラオラオラ！', 'ORA ORA ORA ORA!', '欧拉欧拉欧拉！'],
        super: ['タスク、アクトフォー！無限の回転！', 'Tusk ACT FOUR! Infinite rotation!', '牙 ACT4！无限回转！'],
        evolve: ['これが、黄金の回転だ！', 'This is the golden spin!', '这就是黄金回旋！'],
        herb: ['まだ、進める。', 'I can keep going.', '还能继续前进。'],
        hurt: ['まだ、終わらない！', 'It is not over yet!', '还没有结束！'],
        finisher: ['回転は、止まらない。', 'The rotation never stops.', '回转不会停止。']
      };
      const line = lines[kind];
      if (!line) return;
      const now = performance.now();
      const priority = ['super', 'evolve', 'finisher'].includes(kind);
      // Nail spam and barrage ticks must not restart speech every frame or
      // interrupt the longer ACT4 line. Audio timing never changes simulation.
      if (!priority && now < (this.johnnyVoiceUntil || 0)) return;
      this.johnnyVoiceUntil = now + (priority ? 2800 : kind === 'barrage' ? 1400 : 1100);
      const fallback = () => this.speak(line[0], line[1], {
        gender: 'male', rate: 1.02, pitch: 0.95, volume: 0.86
      }, line[2]);
      if (!this.voiceClip('johnny_' + kind + '.mp3', fallback, { rate: 1, volume: 0.9 })) fallback();
    }

    primeSpeech() {
      if (this.speechPrimed || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
      this.speechPrimed = true;
      try {
        // Unlock the speech channel during the first real user gesture. Chrome
        // can otherwise defer or drop later utterances even though Web Audio is
        // already running.
        const warm = new SpeechSynthesisUtterance(' ');
        warm.volume = 0.01;
        warm.rate = 1;
        window.speechSynthesis.speak(warm);
      } catch (_) { /* optional */ }
    }

    speak(jaText, enText, opts, zhText) {
      if (this.muted || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
      const now = performance.now();
      if (now - this.lastSpeechAt < 320) return;
      this.lastSpeechAt = now;
      opts = opts || {};
      try {
        const speakNow = () => {
          const voices = window.speechSynthesis.getVoices();
          const pick = (list, gender) => {
            if (!list.length) return null;
            const natural = list.filter((v) => /natural|neural|online|premium|enhanced/i.test(v.name || ''));
            const male = list.filter((v) => /male|男|keita|ichiro|takumi|daichi|naoki|kaito|haruto/i.test(v.name || ''));
            if (gender === 'male') return male[0] || natural[0] || list[0];
            return natural[0] || list[0];
          };
          const zh = zhText ? pick(voices.filter((v) => /^zh/i.test(v.lang || '')), opts.gender || 'male') : null;
          const ja = pick(voices.filter((v) => /^ja/i.test(v.lang || '')), opts.gender || 'male');
          const en = pick(voices.filter((v) => /^en/i.test(v.lang || '')), opts.gender || 'male');
          const useZh = zh && !ja;
          const u = new SpeechSynthesisUtterance(useZh ? zhText : ja ? jaText : enText);
          u.voice = useZh ? zh : (ja || en || null);
          u.lang = useZh ? 'zh-CN' : ja ? 'ja-JP' : 'en-US';
          u.rate = opts.rate == null ? 1.2 : opts.rate;
          u.pitch = opts.pitch == null ? 0.9 : opts.pitch;
          u.volume = opts.volume == null ? 0.62 : opts.volume;
          window.speechSynthesis.cancel();
          window.speechSynthesis.resume();
          window.speechSynthesis.speak(u);
        };
        // Chrome/Windows sometimes exposes zero voices until voiceschanged.
        if (window.speechSynthesis.getVoices().length) speakNow();
        else setTimeout(speakNow, 220);
      } catch (_) {
        // Speech synthesis is optional; the synth SFX still carries the hit.
      }
    }

    barrageShout(charId) {
      const o = { gender: 'male', volume: 0.52 };
      if (charId === 'jotaro') this.shout('jotaro_ora', 'オラオラオラッ！', 'ORA ORA ORA!', { ...o, rate: 1.32, pitch: 0.78 });
      else if (charId === 'dio') this.shout('dio_muda', '無駄無駄無駄ッ！', 'MUDA MUDA MUDA!', { ...o, rate: 1.3, pitch: 0.66 });
      else if (charId === 'giorno') this.shout('giorno_muda', '無駄無駄ッ！', 'MUDA MUDA!', { ...o, rate: 1.28, pitch: 0.78 });
      else if (charId === 'josuke') this.shout('josuke_bubble', 'その力、奪わせてもらう。', "I'll be taking that.", { ...o, rate: 1.0, pitch: 0.8 });
      else this.shout('kakyoin_emerald', 'エメラルドスプラッシュ！', 'EMERALD SPLASH!', { ...o, rate: 1.15, pitch: 0.9 });
    }

    superShout(charId, type) {
      const o = { gender: 'male', volume: 0.7 };
      if (charId === 'dio' && type === 'roadroller') {
        this.shout('dio_road_roller', 'ロードローラーだッ！', 'ROAD ROLLER DA!', { ...o, rate: 0.98, pitch: 0.62 });
      } else if (charId === 'dio') {
        this.shout('dio_time_stop', 'ザ・ワールド！時よ止まれ！', 'ZA WARUDO! TIME STOP!', { ...o, rate: 0.9, pitch: 0.6 });
      } else if (charId === 'jotaro') {
        this.shout('jotaro_super', 'スタープラチナ・ザ・ワールド！', 'STAR PLATINUM: THE WORLD!', { ...o, rate: 0.98, pitch: 0.7 });
      } else if (charId === 'giorno') {
        this.shout('giorno_super', 'ゴールド・エクスペリエンス！', 'GOLD EXPERIENCE!', { ...o, rate: 1.02, pitch: 0.82 });
      } else if (charId === 'josuke') {
        this.shout('josuke_super', 'ソフト・アンド・ウェット・ゴー・ビヨンド！', 'SOFT & WET: GO BEYOND!', { ...o, rate: 0.96, pitch: 0.78 });
      } else {
        this.shout('kakyoin_super', 'エメラルドスプラッシュ！', 'EMERALD SPLASH!', { ...o, rate: 1.05, pitch: 0.9 });
      }
    }

    requiemShout() {
      this.shout('giorno_requiem', 'ゴールド・エクスペリエンス・レクイエム！', 'GOLD EXPERIENCE REQUIEM!', {
        gender: 'male', rate: 0.86, pitch: 0.78, volume: 0.7
      });
    }

    starFingerShout() {
      this.shout('jotaro_star_finger', 'スターフィンガー！', 'STAR FINGER!', {
        gender: 'male', rate: 1.18, pitch: 0.82, volume: 0.65
      });
    }

    /* ---- music loop ---- */
    setMusicMode(mode) {
      const next = mode === 'battle' ? 'battle' : 'menu';
      if (this.musicMode === next) return;
      this.musicMode = next;
      this.bpm = next === 'battle' ? 138 : 92;
      this.step = 0;
      if (this.ctx) {
        this.nextNoteTime = this.ctx.currentTime + 0.08;
        if (this.musicBus) {
          this.musicBus.gain.setTargetAtTime(next === 'battle' ? 0.19 : 0.14, this.ctx.currentTime, 0.35);
        }
      }
    }

    startMusic() {
      if (!this.ctx || this.playing) return;
      this.playing = true;
      this.nextNoteTime = this.ctx.currentTime + 0.15;
      this.step = 0;
      this.musicTimer = setInterval(() => this.scheduleMusic(), 30);
    }

    scheduleMusic() {
      if (!this.ctx || !this.playing) return;
      // If audio was muted or the tab was suspended, do not try to catch up
      // hundreds of missed notes when it resumes.
      if (this.nextNoteTime < this.ctx.currentTime - 0.25) {
        this.nextNoteTime = this.ctx.currentTime + 0.06;
      }
      if (this.muted) {
        this.nextNoteTime = Math.max(this.nextNoteTime, this.ctx.currentTime + 0.1);
        return;
      }
      const spb = 60 / this.bpm / 4; // 16th note
      while (this.nextNoteTime < this.ctx.currentTime + 0.18) {
        this.playStep(this.step, this.nextNoteTime, spb);
        this.nextNoteTime += spb;
        this.step = (this.step + 1) % 64;
      }
    }

    playStep(step, t, spb) {
      const s = step % 16;
      const bar = Math.floor(step / 16) % 4;
      const bus = this.musicBus;
      if (!bus) return;
      if (this.musicMode === 'battle') {
        this.playBattleStep(s, bar, t, spb, bus);
        return;
      }

      // kick
      if (s === 0 || s === 6 || s === 10 || (bar === 3 && s === 14)) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
        g.gain.setValueAtTime(0.55, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.24);
      }
      // snare
      if (s === 4 || s === 12) {
        this.noise(0.16, 0.16, 'bandpass', 1700, 0.7, t, bus);
        this.toneIn(180, 0.08, 'triangle', 0.08, t, bus);
      }
      // hats
      if (s % 2 === 0) this.noise(0.035, s % 4 === 0 ? 0.055 : 0.032, 'highpass', 7800, 0.7, t, bus);
      if (s === 14 && bar === 1) this.noise(0.18, 0.04, 'highpass', 5000, 0.5, t, bus);

      // bass line in D minor-ish
      const roots = [55, 58.27, 49, 55];
      const root = roots[bar];
      const pattern = [0, 0, 12, 0, 0, 10, 0, 7, 0, 0, 12, 10, 0, 7, 5, 3];
      if ([0, 2, 3, 5, 7, 8, 10, 11, 13, 14].includes(s)) {
        const semi = pattern[s];
        const f = root * Math.pow(2, semi / 12);
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const filt = this.ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.value = f;
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(320, t);
        filt.frequency.exponentialRampToValueAtTime(700, t + 0.08);
        filt.Q.value = 5;
        g.gain.setValueAtTime(0.17, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(filt); filt.connect(g); g.connect(bus);
        o.start(t); o.stop(t + 0.22);
      }

      // sparse organ chord stabs
      if (s === 0 && (bar === 0 || bar === 2)) {
        const chord = bar === 0 ? [220, 261.6, 329.6] : [196, 233.1, 293.7];
        chord.forEach((f) => {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.type = 'triangle';
          o.frequency.value = f;
          g.gain.setValueAtTime(0.025, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 7);
          o.connect(g); g.connect(bus);
          o.start(t); o.stop(t + spb * 7);
        });
      }
    }

    playBattleStep(s, bar, t, spb, bus) {
      const kickSteps = [0, 3, 6, 8, 11, 14];
      if (kickSteps.includes(s) || (bar === 3 && s === 15)) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(38, t + 0.15);
        g.gain.setValueAtTime(0.62, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.22);
      }
      if (s === 4 || s === 12) {
        this.noise(0.14, 0.2, 'bandpass', 1900, 0.8, t, bus);
        this.toneIn(170, 0.07, 'triangle', 0.1, t, bus);
      }
      if (s % 2 === 0) {
        this.noise(0.028, s % 4 === 0 ? 0.065 : 0.035, 'highpass', 8200, 0.7, t, bus);
      }
      if (s === 15 && bar % 2 === 1) this.noise(0.12, 0.05, 'highpass', 5200, 0.6, t, bus);

      const roots = [55, 49, 58.27, 49];
      const root = roots[bar];
      const pattern = [0, 0, 12, 7, 0, 10, 12, 3, 0, 0, 12, 7, 10, 3, 7, 2];
      if ([0, 2, 3, 5, 7, 8, 10, 11, 13, 14].includes(s)) {
        const f = root * Math.pow(2, pattern[s] / 12);
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const filt = this.ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.value = f;
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(360, t);
        filt.frequency.exponentialRampToValueAtTime(900, t + 0.07);
        filt.Q.value = 6;
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(filt); filt.connect(g); g.connect(bus);
        o.start(t); o.stop(t + 0.2);
      }

      // brass stabs on the off-beats
      if (s === 0 || s === 6 || s === 10) {
        const chord = s === 10 ? [233.1, 293.7, 349.2] : [220, 261.6, 329.6];
        chord.forEach((f) => {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          const filt = this.ctx.createBiquadFilter();
          o.type = 'sawtooth';
          o.frequency.value = f;
          filt.type = 'lowpass';
          filt.frequency.value = 1700;
          g.gain.setValueAtTime(0.026, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
          o.connect(filt); filt.connect(g); g.connect(bus);
          o.start(t); o.stop(t + 0.22);
        });
      }

      // low choir/organ pad every other bar
      if (s === 0 && (bar === 0 || bar === 2)) {
        const chord = bar === 0 ? [110, 130.8, 164.8, 220] : [98, 116.5, 146.8, 196];
        chord.forEach((f) => {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.type = 'triangle';
          o.frequency.value = f;
          g.gain.setValueAtTime(0.014, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 26);
          o.connect(g); g.connect(bus);
          o.start(t); o.stop(t + spb * 27);
        });
      }

      // timpani accent at the top of each bar
      if (s === 0) this.toneIn(55, 0.32, 'sine', 0.22, t, bus);
    }

    toneIn(freq, dur, type, vol, t, bus) {
      if (!this.ctx || this.muted) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(bus || this.sfxBus);
      o.start(t); o.stop(t + dur + 0.02);
    }
  }

  JG.Audio = new AudioEngine();
})();
