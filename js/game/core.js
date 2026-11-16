/* =========================================================
   JOJO 奇妙格斗 · STAND RUSH — shared game scope
   Constants, DOM handles, input maps, HUD and screen helpers.
   Anything later files need is published on JG.Game.
   ========================================================= */
(function () {
  'use strict';
  const JG = (window.JG = window.JG || {});
  const G = (JG.Game = JG.Game || {});
  const Art = JG.Art;
  const Audio = JG.Audio;
  const { clamp, lerp, easeOut } = Art;

  const W = 1280;
  const H = 720;
  const WORLD_W = 2800;
  const GROUND = 596;
  const LEFT = 100;
  const RIGHT = 2700;
  const GRAVITY = 2650;
  const STEP = 1 / 60;

  const $ = (id) => document.getElementById(id);

  /* The game runs either from the bundled Python server (local / LAN) or as
     a pure static site (Cloudflare Pages, GitHub Pages, file://). Only the
     Python server answers /__net/info and relays /__ws rooms, so probe once
     and let the UI hide LAN-only controls on a static deployment instead of
     firing failing heartbeats and WebSocket attempts forever. */
  const Server = {
    info: null,
    online: null,
    _probe: null,
    probe() {
      if (this._probe) return this._probe;
      if (location.protocol !== 'http:' && location.protocol !== 'https:') {
        this.online = false;
        this._probe = Promise.resolve(false);
        return this._probe;
      }
      this._probe = fetch('/__net/info', { cache: 'no-store' })
        // Static hosts often rewrite unknown paths to index.html with a 200.
        // Only a JSON response proves that server.py is actually running.
        .then((res) => {
          const type = res.headers.get('content-type') || '';
          if (!res.ok || !type.includes('application/json')) return null;
          return res.json();
        })
        .then((info) => {
          if (!info || typeof info.port !== 'number') {
            this.online = false;
            return false;
          }
          this.info = info;
          this.online = true;
          return true;
        })
        .catch(() => {
          this.online = false;
          return false;
        });
      return this._probe;
    }
  };
  G.Server = Server;
  JG.Server = Server;

  const Config = {
    onlineWs: (window.JG_CONFIG && typeof window.JG_CONFIG.onlineWs === 'string')
      ? window.JG_CONFIG.onlineWs.trim()
      : ''
  };
  G.Config = Config;
  JG.Config = Config;

  function rectsOverlap(a, b) {
    return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
  }
  function approach(cur, target, delta) {
    return cur < target ? Math.min(cur + delta, target) : Math.max(cur - delta, target);
  }
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  let DPR = Math.min(1.25, window.devicePixelRatio || 1);

  const hudEl = {
    p1hp: $('p1-hp-fill'), p2hp: $('p2-hp-fill'),
    p1ghost: $('p1-hp-ghost'), p2ghost: $('p2-hp-ghost'),
    p1portrait: $('p1-portrait'), p2portrait: $('p2-portrait'),
    p1meter: $('p1-meter'), p2meter: $('p2-meter'),
    p1special: $('p1-special-meter'), p2special: $('p2-special-meter'),
    p1specialTrack: $('p1-special-track'), p2specialTrack: $('p2-special-track'),
    p1meterRow: $('p1-meter').parentElement.parentElement,
    p2meterRow: $('p2-meter').parentElement.parentElement,
    timer: $('timer'), round: $('round-label'),
    combo1: $('combo-p1'), combo2: $('combo-p2'),
    combo1b: $('combo-p1').querySelector('b'),
    combo2b: $('combo-p2').querySelector('b'),
    quote1: $('quote-p1'), quote2: $('quote-p2'),
    quotes: $('battle-quotes'), controlHint: $('control-hint')
  };
  const hudCache = {
    hp1: -1, hp2: -1, ghost1: -1, ghost2: -1,
    meter1: -1, meter2: -1, full1: false, full2: false,
    special1: -1, special2: -1, specialVisible1: false, specialVisible2: false,
    specialFull1: false, specialFull2: false,
    timer: '', timerLow: false, round: '',
    quotes: false, hint: false, combo1: false, combo2: false,
    combo1n: -1, combo2n: -1, awaken1: false, awaken2: false
  };

  const dom = {
    frame: $('frame'),
    hud: $('hud'),
    title: $('screen-title'),
    net: $('screen-net'),
    keys: $('screen-keys'),
    select: $('screen-select'),
    help: $('screen-help'),
    result: $('screen-result'),
    pause: $('pause-modal'),
    combo1: $('combo-p1'),
    combo2: $('combo-p2'),
    announce: $('announce-layer'),
    announceMain: $('announce-main'),
    announceSub: $('announce-sub'),
    superBanner: $('super-banner'),
    superName: $('super-name'),
    superStand: $('super-stand'),
    quotes: $('battle-quotes'),
    quote1: $('quote-p1'),
    quote2: $('quote-p2'),
    controlHint: $('control-hint'),
    clash: $('clash-overlay'),
    clashP1Name: $('clash-p1-name'),
    clashP2Name: $('clash-p2-name'),
    clashP1Fill: $('clash-p1-fill'),
    clashP2Fill: $('clash-p2-fill'),
    clashP1Count: $('clash-p1-count'),
    clashP2Count: $('clash-p2-count'),
    netAddress: $('net-address'),
    netStatus: $('net-status'),
    netRoom: $('net-room'),
    netRoomCode: $('net-room-code'),
    netCode: $('net-code'),
    trainingPanel: $('training-panel'),
    trainingDummy: $('training-dummy'),
    toast: $('toast'),
    flash: $('flash'),
    touch: $('touch-controls')
  };

  const Input = {
    down: new Set(),
    pressed: new Set(),
    press(code) {
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    },
    release(code) { this.down.delete(code); },
    clear() { this.down.clear(); this.pressed.clear(); },
    held(code) { return this.down.has(code); },
    hit(code) { return this.pressed.has(code); }
  };

  const KEY_ACTIONS = [
    'left', 'right', 'up', 'down', 'light', 'heavy',
    'special', 'second', 'super', 'dodge'
  ];
  const KEY_ACTION_LABELS = {
    left: '向左', right: '向右', up: '跳跃', down: '防御',
    light: '轻攻击', heavy: '重攻击', special: 'L 技能',
    second: 'H 技能', super: 'U 超必杀', dodge: '闪避'
  };
  const DEFAULT_KEY_BINDINGS = {
    p1: {
      left: 'KeyA', right: 'KeyD', up: 'Space', down: 'KeyS',
      light: 'KeyJ', heavy: 'KeyK', special: 'KeyL', second: 'KeyH',
      super: 'KeyU', dodge: 'KeyF'
    },
    p2: {
      left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
      light: 'Digit1', heavy: 'Digit2', special: 'Digit3', second: 'Digit5',
      super: 'Digit4', dodge: 'ShiftRight'
    }
  };
  const KEY_BINDINGS = {
    p1: Object.assign({}, DEFAULT_KEY_BINDINGS.p1),
    p2: Object.assign({}, DEFAULT_KEY_BINDINGS.p2)
  };
  // P1 gets the arrow/digit cluster as a secondary layout in 1P / LAN modes.
  const SOLO_FALLBACK = {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    light: ['Digit1', 'Numpad1'], heavy: ['Digit2', 'Numpad2'],
    special: ['Digit3', 'Numpad3'], second: ['Digit5', 'Numpad5'],
    super: ['Digit4', 'Numpad0'], dodge: []
  };
  const P1_KEYS = {};
  const P2_KEYS = {};
  const P1_SOLO_KEYS = {};
  const ALL_GAME_KEYS = new Set();

  function rebuildKeyMaps() {
    for (const action of KEY_ACTIONS) {
      P1_KEYS[action] = [KEY_BINDINGS.p1[action]];
      P2_KEYS[action] = [KEY_BINDINGS.p2[action]];
      P1_SOLO_KEYS[action] = Array.from(new Set([
        KEY_BINDINGS.p1[action], ...SOLO_FALLBACK[action]
      ]));
    }
    ALL_GAME_KEYS.clear();
    [P1_KEYS, P2_KEYS].forEach((map) => {
      Object.values(map).forEach((arr) => arr.forEach((code) => ALL_GAME_KEYS.add(code)));
    });
    ALL_GAME_KEYS.add('Space');
  }

  function keyLabel(code) {
    const arrows = {
      ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
      Space: 'Space', ShiftLeft: '左Shift', ShiftRight: '右Shift',
      ControlLeft: '左Ctrl', ControlRight: '右Ctrl',
      AltLeft: '左Alt', AltRight: '右Alt', Enter: 'Enter', Backspace: 'Backspace'
    };
    if (arrows[code]) return arrows[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return '小键盘' + code.slice(6);
    if (/^F([1-9]|1[0-2])$/.test(code)) return code;
    return code;
  }

  function loadKeyBindings() {
    const raw = safeStorage('jojo-keys', undefined, '');
    let saved = null;
    try { saved = raw ? JSON.parse(raw) : null; } catch (e) { saved = null; }
    if (saved && typeof saved === 'object') {
      for (const player of ['p1', 'p2']) {
        const src = saved[player];
        if (!src || typeof src !== 'object') continue;
        for (const action of KEY_ACTIONS) {
          if (typeof src[action] === 'string' && src[action]) {
            KEY_BINDINGS[player][action] = src[action];
          }
        }
      }
    }
    rebuildKeyMaps();
  }

  function saveKeyBindings() {
    safeStorage('jojo-keys', JSON.stringify(KEY_BINDINGS));
  }

  function keyBinding(player, action) {
    return KEY_BINDINGS[player] && KEY_BINDINGS[player][action] || '';
  }

  function setKeyBinding(player, action, code) {
    if (!KEY_BINDINGS[player] || !KEY_ACTIONS.includes(action)) {
      return { ok: false, error: '无效的按键位置' };
    }
    if (!code) return { ok: false, error: '没有收到按键' };
    if (['Escape', 'KeyM', 'Tab', 'F5', 'F11'].includes(code)) {
      return { ok: false, error: '这个键被系统功能占用' };
    }
    for (const p of ['p1', 'p2']) {
      for (const a of KEY_ACTIONS) {
        if (KEY_BINDINGS[p][a] === code && (p !== player || a !== action)) {
          return { ok: false, error: '这个键已经被「' + (p === 'p1' ? 'P1' : 'P2') + ' · ' + KEY_ACTION_LABELS[a] + '」占用' };
        }
      }
    }
    KEY_BINDINGS[player][action] = code;
    saveKeyBindings();
    rebuildKeyMaps();
    return { ok: true };
  }

  function resetKeyBindings() {
    KEY_BINDINGS.p1 = Object.assign({}, DEFAULT_KEY_BINDINGS.p1);
    KEY_BINDINGS.p2 = Object.assign({}, DEFAULT_KEY_BINDINGS.p2);
    saveKeyBindings();
    rebuildKeyMaps();
  }

  rebuildKeyMaps();

  const App = {
    screen: 'title',
    underScreen: 'title',
    mode: '1p',
    difficulty: 'normal',
    muted: false,
    selected: [null, null],
    selectStep: 0,
    selectLocked: false,
    focusIndex: 0,
    netRole: '',
    netLocalIndex: 0,
    netRemoteChoice: null,
    netSeed: 0,
    game: null,
    paused: false,
    touchEditing: false,
    ghostHp: [JG.MAX_HP, JG.MAX_HP],
    resultShown: false,
    hintUntil: 0,
    elapsed: 0
  };
  JG.App = App;

  function safeStorage(key, value, fallback) {
    try {
      if (value === undefined) {
        const v = localStorage.getItem(key);
        return v == null ? fallback : v;
      }
      localStorage.setItem(key, value);
    } catch (e) { /* file:// or privacy mode */ }
    return fallback;
  }

  App.difficulty = safeStorage('jojo-diff', undefined, 'normal');
  if (!JG.DIFFICULTY[App.difficulty]) App.difficulty = 'normal';
  App.muted = safeStorage('jojo-mute', undefined, '0') === '1';
  loadKeyBindings();

  /* =========================================================
     Screen / UI helpers
     ========================================================= */
  const screens = {
    title: dom.title, net: dom.net, keys: dom.keys,
    select: dom.select, help: dom.help, result: dom.result
  };

  function setScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      el.classList.toggle('hidden', key !== name);
    });
    App.screen = name;
    // Leaving the fight must never leave the layout editor floating on top.
    if (App.touchEditing) {
      App.touchEditing = false;
      document.body.classList.remove('touch-editing');
      const editor = $('touch-editor-bar');
      if (editor) editor.classList.add('hidden');
    }
    hideTouch();
  }

  let announceTimer = 0;
  function announce(main, sub, duration) {
    duration = duration == null ? 1.2 : duration;
    clearTimeout(announceTimer);
    dom.announce.classList.remove('show', 'pop');
    dom.announceMain.textContent = main || '';
    dom.announceSub.textContent = sub || '';
    // restart pop animation
    void dom.announce.offsetWidth;
    dom.announce.classList.add('show', 'pop');
    announceTimer = setTimeout(() => {
      dom.announce.classList.remove('show', 'pop');
    }, Math.max(220, duration * 1000));
  }
  App.announce = announce;

  function hideAnnounce() {
    clearTimeout(announceTimer);
    dom.announce.classList.remove('show', 'pop');
  }

  let toastTimer = 0;
  function toast(text, duration) {
    clearTimeout(toastTimer);
    dom.toast.textContent = text;
    dom.toast.classList.add('show');
    toastTimer = setTimeout(() => dom.toast.classList.remove('show'), (duration || 1.4) * 1000);
  }
  App.toast = toast;

  function flash(strong) {
    dom.flash.classList.remove('fire');
    void dom.flash.offsetWidth;
    dom.flash.style.setProperty('--strength', strong ? '1' : '.7');
    dom.flash.classList.add('fire');
  }
  App.flash = flash;

  function showSuperBanner(char) {
    dom.superName.textContent = char.super.name;
    dom.superStand.textContent = char.super.en;
    dom.superBanner.classList.add('show');
  }
  function hideSuperBanner() {
    dom.superBanner.classList.remove('show');
  }

  function showClash(match) {
    dom.clashP1Name.textContent = match.p1.data.short;
    dom.clashP2Name.textContent = match.p2.data.short;
    dom.clashP1Fill.style.transform = 'scaleX(0)';
    dom.clashP2Fill.style.transform = 'scaleX(0)';
    dom.clashP1Count.textContent = '0 / 50';
    dom.clashP2Count.textContent = '0 / 50';
    dom.clash.classList.remove('hidden');
  }

  function updateClashUI(clash) {
    const max = clash.maxTaps || 50;
    const t1 = Math.min(max, clash.taps[0]);
    const t2 = Math.min(max, clash.taps[1]);
    dom.clashP1Fill.style.transform = `scaleX(${t1 / max})`;
    dom.clashP2Fill.style.transform = `scaleX(${t2 / max})`;
    dom.clashP1Count.textContent = t1 + ' / ' + max;
    dom.clashP2Count.textContent = t2 + ' / ' + max;
  }

  function hideClash() {
    dom.clash.classList.add('hidden');
  }

  function setHudNames(match) {
    resetHudCache();
    const p1 = match.p1;
    const p2 = match.p2;
    $('p1-name').textContent = p1.data.name;
    $('p1-stand').textContent = p1.data.stand;
    $('p2-name').textContent = p2.data.name;
    $('p2-stand').textContent = p2.data.stand;
    $('p1-hp-fill').style.background = p1.data.colors.hp;
    $('p2-hp-fill').style.background = p2.data.colors.hp;
    Art.drawBust($('p1-portrait'), p1.charId, p1.variant);
    Art.drawBust($('p2-portrait'), p2.charId, p2.variant);
    dom.quote1.querySelector('p').textContent = p1.data.intro;
    dom.quote2.querySelector('p').textContent = p2.data.intro;
    dom.quote1.style.setProperty('--accent', p1.data.accent);
    dom.quote2.style.setProperty('--accent', p2.data.accent);
    App.ghostHp = [p1.hp, p2.hp];
    updatePips(match);
  }

  function updatePips(match) {
    const p1pips = $('p1-pips').children;
    const p2pips = $('p2-pips').children;
    for (let i = 0; i < 2; i++) {
      p1pips[i].classList.toggle('won', match.wins[0] > i);
      p2pips[i].classList.toggle('won', match.wins[1] > i);
    }
  }

  function updateHUD(match) {
    if (!match || App.screen !== 'fight') return;
    const p1 = match.p1;
    const p2 = match.p2;

    // HUD updates are cached: only write DOM/style when a displayed value changes.
    App.ghostHp[0] = p1.hp > App.ghostHp[0] ? p1.hp : lerp(App.ghostHp[0], p1.hp, 0.09);
    App.ghostHp[1] = p2.hp > App.ghostHp[1] ? p2.hp : lerp(App.ghostHp[1], p2.hp, 0.09);
    if (Math.abs(App.ghostHp[0] - hudCache.ghost1) > 0.6) {
      hudCache.ghost1 = App.ghostHp[0];
      hudEl.p1ghost.style.transform = `scaleX(${clamp(App.ghostHp[0] / p1.maxHp, 0, 1)})`;
    }
    if (Math.abs(App.ghostHp[1] - hudCache.ghost2) > 0.6) {
      hudCache.ghost2 = App.ghostHp[1];
      hudEl.p2ghost.style.transform = `scaleX(${clamp(App.ghostHp[1] / p2.maxHp, 0, 1)})`;
    }
    if (hudCache.hp1 !== p1.hp) {
      hudCache.hp1 = p1.hp;
      hudEl.p1hp.style.transform = `scaleX(${clamp(p1.hp / p1.maxHp, 0, 1)})`;
    }
    if (hudCache.hp2 !== p2.hp) {
      hudCache.hp2 = p2.hp;
      hudEl.p2hp.style.transform = `scaleX(${clamp(p2.hp / p2.maxHp, 0, 1)})`;
    }
    if (hudCache.meter1 !== p1.meter) {
      hudCache.meter1 = p1.meter;
      hudEl.p1meter.style.transform = `scaleX(${clamp(p1.meter / 100, 0, 1)})`;
    }
    if (hudCache.meter2 !== p2.meter) {
      hudCache.meter2 = p2.meter;
      hudEl.p2meter.style.transform = `scaleX(${clamp(p2.meter / 100, 0, 1)})`;
    }
    const full1 = p1.meter >= 100;
    const full2 = p2.meter >= 100;
    if (full1 !== hudCache.full1) {
      hudCache.full1 = full1;
      hudEl.p1meterRow.classList.toggle('full', full1);
    }
    if (full2 !== hudCache.full2) {
      hudCache.full2 = full2;
      hudEl.p2meterRow.classList.toggle('full', full2);
    }

    const specialVisible1 = p1.charId === 'josuke' && !p1.goBeyond;
    if (specialVisible1 !== hudCache.specialVisible1) {
      hudCache.specialVisible1 = specialVisible1;
      hudEl.p1specialTrack.classList.toggle('visible', specialVisible1);
    }
    if (specialVisible1) {
      const special1 = Math.round(p1.specialMeter || 0);
      if (special1 !== hudCache.special1) {
        hudCache.special1 = special1;
        hudEl.p1special.style.transform = `scaleX(${clamp(special1 / 50, 0, 1)})`;
        hudEl.p1specialTrack.title = `特殊能量 ${special1}/50`;
      }
      const specialFull1 = special1 >= 50;
      if (specialFull1 !== hudCache.specialFull1) {
        hudCache.specialFull1 = specialFull1;
        hudEl.p1specialTrack.classList.toggle('full', specialFull1);
      }
    }

    const specialVisible2 = p2.charId === 'josuke' && !p2.goBeyond;
    if (specialVisible2 !== hudCache.specialVisible2) {
      hudCache.specialVisible2 = specialVisible2;
      hudEl.p2specialTrack.classList.toggle('visible', specialVisible2);
    }
    if (specialVisible2) {
      const special2 = Math.round(p2.specialMeter || 0);
      if (special2 !== hudCache.special2) {
        hudCache.special2 = special2;
        hudEl.p2special.style.transform = `scaleX(${clamp(special2 / 50, 0, 1)})`;
        hudEl.p2specialTrack.title = `特殊能量 ${special2}/50`;
      }
      const specialFull2 = special2 >= 50;
      if (specialFull2 !== hudCache.specialFull2) {
        hudCache.specialFull2 = specialFull2;
        hudEl.p2specialTrack.classList.toggle('full', specialFull2);
      }
    }

    const timerValue = Math.max(0, Math.ceil(match.timer));
    const timerText = match.training ? '∞' : (timerValue < 10 ? '0' + timerValue : String(timerValue));
    if (timerText !== hudCache.timer) {
      hudCache.timer = timerText;
      hudEl.timer.textContent = timerText;
    }
    const timerLow = !match.training && timerValue <= 10 && match.phase === 'fight';
    if (timerLow !== hudCache.timerLow) {
      hudCache.timerLow = timerLow;
      hudEl.timer.classList.toggle('low', timerLow);
    }
    const roundText = match.training ? 'TRAINING' : 'ROUND ' + match.round;
    if (roundText !== hudCache.round) {
      hudCache.round = roundText;
      hudEl.round.textContent = roundText;
    }

    const awaken1 = p1.charId === 'giorno' && !p1.requiem && p1.hp > 0 && p1.hp < p1.maxHp * 0.25;
    const awaken2 = p2.charId === 'giorno' && !p2.requiem && p2.hp > 0 && p2.hp < p2.maxHp * 0.25;
    if (awaken1 !== hudCache.awaken1) {
      hudCache.awaken1 = awaken1;
      hudEl.p1portrait.classList.toggle('awaken', awaken1);
    }
    if (awaken2 !== hudCache.awaken2) {
      hudCache.awaken2 = awaken2;
      hudEl.p2portrait.classList.toggle('awaken', awaken2);
    }

    const inIntro = match.phase === 'intro';
    if (inIntro !== hudCache.quotes) {
      hudCache.quotes = inIntro;
      hudEl.quotes.classList.toggle('show', inIntro);
    }
    const hintOn = match.phase === 'fight' && match.round === 1 && !match.super &&
      performance.now() < App.hintUntil && !document.body.classList.contains('touch');
    if (hintOn !== hudCache.hint) {
      hudCache.hint = hintOn;
      hudEl.controlHint.classList.toggle('show', hintOn);
    }

    const c1on = p1.combo >= 2 && p1.comboTimer > 0 && !match.super;
    const c2on = p2.combo >= 2 && p2.comboTimer > 0 && !match.super;
    if (c1on !== hudCache.combo1) {
      hudCache.combo1 = c1on;
      hudEl.combo1.classList.toggle('show', c1on);
    }
    if (c2on !== hudCache.combo2) {
      hudCache.combo2 = c2on;
      hudEl.combo2.classList.toggle('show', c2on);
    }
    if (c1on && p1.combo !== hudCache.combo1n) {
      hudCache.combo1n = p1.combo;
      hudEl.combo1b.textContent = p1.combo;
    }
    if (c2on && p2.combo !== hudCache.combo2n) {
      hudCache.combo2n = p2.combo;
      hudEl.combo2b.textContent = p2.combo;
    }
  }

  function resetHudCache() {
    hudCache.hp1 = -1; hudCache.hp2 = -1;
    hudCache.ghost1 = -1; hudCache.ghost2 = -1;
    hudCache.meter1 = -1; hudCache.meter2 = -1;
    hudCache.full1 = false; hudCache.full2 = false;
    hudCache.special1 = -1; hudCache.special2 = -1;
    hudCache.specialVisible1 = false; hudCache.specialVisible2 = false;
    hudCache.specialFull1 = false; hudCache.specialFull2 = false;
    hudCache.timer = ''; hudCache.timerLow = false; hudCache.round = '';
    hudCache.quotes = false; hudCache.hint = false;
    hudCache.combo1 = false; hudCache.combo2 = false;
    hudCache.combo1n = -1; hudCache.combo2n = -1;
    hudCache.awaken1 = false; hudCache.awaken2 = false;
  }

  function hideTouch() {
    dom.touch.classList.add('hidden');
  }
  function updateTouch() {
    const show = document.body.classList.contains('touch') &&
      (App.touchEditing || (App.screen === 'fight' && !App.paused));
    dom.touch.classList.toggle('hidden', !show);
  }

  /* =========================================================
     Title / character select
     ========================================================= */
  function fitFrame() {
    // visualViewport tracks the area actually visible above mobile browser UI;
    // innerHeight can lag behind on iOS when the toolbar collapses.
    const vv = window.visualViewport;
    const width = vv ? vv.width : window.innerWidth;
    const height = vv ? vv.height : window.innerHeight;
    const s = Math.min(width / W, height / H);
    dom.frame.style.transform = `scale(${s})`;
  }

  function setNetStatus(text, error) {
    dom.netStatus.textContent = text;
    dom.netStatus.classList.toggle('error', !!error);
  }

  function showNetRoom(code) {
    if (!code) {
      dom.netRoom.classList.add('hidden');
      dom.netRoomCode.textContent = '----';
      return;
    }
    dom.netRoomCode.textContent = code;
    dom.netRoom.classList.remove('hidden');
  }

  function updateNetAddress() {
    const fallback = location.host || '—';
    dom.netAddress.textContent = fallback;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    Server.probe().then((online) => {
      if (!online) {
        dom.netAddress.textContent = fallback + (Config.onlineWs ? '（在线中继）' : '（无联机服务）');
        return;
      }
      const info = Server.info || {};
      const port = info.port || location.port;
      const ips = (info.addresses || []).filter((ip) => ip && ip !== '0.0.0.0');
      if (!ips.length) {
        if (info.wsl) dom.netAddress.textContent = fallback + '（WSL）';
        return;
      }
      const parts = [`${fallback}（本机）`].concat(
        ips.map((ip) => `${ip}:${port}（局域网）`)
      );
      if (info.wsl) parts.push('WSL 跨设备请优先在 Windows 双击「启动局域网服务器.bat」');
      dom.netAddress.textContent = parts.join('  ·  ');
    }).catch(() => {});
  }

  function setNetAvailability(online) {
    const actions = $('net-actions');
    const lead = $('net-lead');
    const remote = Boolean(Config.onlineWs);
    const available = online || remote;
    if (actions) actions.classList.toggle('hidden', !available);
    if (lead) {
      if (online) {
        lead.textContent = '局域网联机：两台设备连接同一局域网。房主请用 HOST=0.0.0.0 ./run.sh 启动；Windows 下双击「启动局域网服务器.bat」。对方用房主的局域网 IP 访问。';
      } else if (remote) {
        lead.textContent = '在线联机：房主创建房间后，把 4 位房间码告诉对方。两台设备可以在不同网络，通过 Cloudflare 中继连接。';
      } else {
        lead.textContent = '当前页面没有可用的联机服务。请确认网络，或在本机运行 server.py（./run.sh）。';
      }
    }
    if (available) {
      setNetStatus('创建房间后，把房间码告诉另一台设备。');
    } else {
      setNetStatus('此页面没有联机房间服务，创建 / 加入房间按钮已隐藏。', true);
    }
  }

  function showNet() {
    closePause(true);
    setScreen('net');
    hideAnnounce();
    dom.hud.classList.remove('show');
    dom.hud.classList.add('hidden');
    dom.quotes.classList.remove('show');
    dom.controlHint.classList.remove('show');
    dom.trainingPanel.classList.add('hidden');
    hideSuperBanner();
    hideTouch();
    dom.netAddress.textContent = location.host || '—';
    updateNetAddress();
    dom.netRoom.classList.add('hidden');
    dom.netCode.value = '';
    const actions = $('net-actions');
    if (actions) actions.classList.add('hidden');
    setNetStatus('正在检测联机服务…');
    Server.probe().then((online) => {
      if (App.screen !== 'net') return;
      setNetAvailability(online);
    });
    Audio.setMusicMode('menu');
    Audio.select();
  }

  function showTitle() {
    closePause(true);
    hideClash();
    if (JG.Net) JG.Net.close(true);
    Audio.setMusicMode('menu');
    setScreen('title');
    hideAnnounce();
    dom.hud.classList.remove('show');
    dom.hud.classList.add('hidden');
    dom.quotes.classList.remove('show');
    dom.controlHint.classList.remove('show');
    dom.trainingPanel.classList.add('hidden');
    hideSuperBanner();
    dom.result.classList.add('hidden');
    App.game = null;
    App.paused = false;
    hideTouch();
    Input.clear();
  }

  function buildRoster() {
    const roster = $('roster');
    roster.innerHTML = '';
    JG.CHAR_LIST.forEach((id, index) => {
      const char = JG.CHARACTERS[id];
      const btn = document.createElement('button');
      btn.className = 'char-card';
      btn.type = 'button';
      btn.dataset.id = id;
      btn.dataset.index = index;
      btn.style.setProperty('--accent', char.accent);
      btn.style.setProperty('--accent-2', char.accent2);
      btn.innerHTML = `
        <span class="char-index">${char.index}</span>
        <span class="char-tag">${char.tag}</span>
        <canvas class="char-art" width="300" height="322"></canvas>
        <span class="char-player-stamp"></span>
        <span class="char-info">
          <h3>${char.name}</h3>
          <div class="char-stand">${char.stand} / ${char.standJp}</div>
          <div class="char-style">${char.style}</div>
          <div class="mini-stats">
            <span class="mini-stat"><span>POWER</span><i><b style="width:${char.stats.power * 20}%"></b></i></span>
            <span class="mini-stat"><span>SPEED</span><i><b style="width:${char.stats.speed * 20}%"></b></i></span>
            <span class="mini-stat"><span>RANGE</span><i><b style="width:${char.stats.range * 20}%"></b></i></span>
          </div>
        </span>`;
      Art.drawPortrait(btn.querySelector('canvas'), id, 0);
      btn.addEventListener('click', () => selectCharacter(id));
      btn.addEventListener('mouseenter', () => setFocus(index));
      roster.appendChild(btn);
    });
    setFocus(0);
  }

  function setFocus(index) {
    App.focusIndex = ((index % JG.CHAR_LIST.length) + JG.CHAR_LIST.length) % JG.CHAR_LIST.length;
    document.querySelectorAll('.char-card').forEach((card, i) => {
      card.classList.toggle('focused', i === App.focusIndex);
    });
  }

  function updateSelectUI() {
    const step = App.selectStep;
    const mode = App.mode;
    const net = mode === 'net';
    $('select-step-no').textContent = net ? 'LAN' : (step === 0 ? '01' : '02');
    $('select-title').textContent = net ? '联机对战 · 选择角色' : step === 0
      ? (mode === 'training' ? '训练场 · 选择角色' : '选择你的替身使者')
      : (mode === '1p' ? '选择你的对手' : mode === 'training' ? '选择训练假人' : '选择 P2 的角色');
    $('select-player-label').textContent = net
      ? (App.netLocalIndex === 0 ? 'HOST / PLAYER 1' : 'GUEST / PLAYER 2')
      : (step === 0 ? 'PLAYER 1'
        : (mode === '1p' ? 'CPU OPPONENT' : mode === 'training' ? 'TRAINING DUMMY' : 'PLAYER 2'));
    $('select-step-hint').textContent = net
      ? (App.selected[App.netLocalIndex] ? '已选择，等待对手…' : '请选择你的角色')
      : (step === 0 ? 'P1 请选择角色'
        : (mode === '1p' ? 'CPU 将使用该角色' : mode === 'training' ? '假人不会主动攻击' : 'P2 请选择角色'));

    document.querySelectorAll('.char-card').forEach((card, i) => {
      const id = card.dataset.id;
      const isP1 = App.selected[0] === id;
      const isP2 = App.selected[1] === id;
      card.classList.toggle('selected', isP1 || isP2);
      const stamp = card.querySelector('.char-player-stamp');
      if (isP1 && isP2) {
        stamp.textContent = mode === '1p' ? 'P1 + CPU' : mode === 'training' ? 'P1 + DUMMY' : 'P1 + P2';
      } else if (isP1) stamp.textContent = 'P1';
      else if (isP2) stamp.textContent = mode === '1p' ? 'CPU' : mode === 'training' ? 'DUMMY' : 'P2';
      card.classList.toggle('focused', i === App.focusIndex);
    });
  }

  function showSelect(mode) {
    closePause(true);
    App.mode = mode;
    App.selectStep = mode === 'net' ? (App.netLocalIndex || 0) : 0;
    App.selectLocked = false;
    App.selected = [null, null];
    if (mode === 'net' && App.netRemoteChoice) {
      App.selected[1 - (App.netLocalIndex || 0)] = App.netRemoteChoice;
    }
    App.focusIndex = 0;
    Audio.setMusicMode('menu');
    setScreen('select');
    hideAnnounce();
    dom.hud.classList.remove('show');
    dom.hud.classList.add('hidden');
    dom.quotes.classList.remove('show');
    dom.controlHint.classList.remove('show');
    dom.trainingPanel.classList.add('hidden');
    hideSuperBanner();
    updateSelectUI();
    Audio.select();
  }

  function selectCharacter(id) {
    if (App.selectLocked || App.screen !== 'select') return;
    const index = JG.CHAR_LIST.indexOf(id);
    if (index >= 0) setFocus(index);
    if (App.mode === 'net') {
      const slot = App.netLocalIndex || 0;
      App.selected[slot] = id;
      App.selectLocked = true;
      updateSelectUI();
      Audio.confirm();
      if (JG.Net) JG.Net.choose(id);
      return;
    }
    if (App.selectStep === 0) {
      App.selected[0] = id;
      App.selectLocked = true;
      updateSelectUI();
      Audio.confirm();
      setTimeout(() => {
        App.selectStep = 1;
        App.selectLocked = false;
        updateSelectUI();
        Audio.select();
      }, 440);
    } else {
      App.selected[1] = id;
      App.selectLocked = true;
      updateSelectUI();
      Audio.confirm();
      setTimeout(() => {
        App.selectLocked = false;
        if (App.selected[0] && App.selected[1]) startMatch(App.selected[0], App.selected[1]);
      }, 460);
    }
  }

  function randomPick() {
    if (App.selectLocked) return;
    let id = JG.CHAR_LIST[Math.floor(Math.random() * JG.CHAR_LIST.length)];
    if (App.selectStep === 0 && App.selected[0] === id) {
      id = JG.CHAR_LIST[(JG.CHAR_LIST.indexOf(id) + 1) % JG.CHAR_LIST.length];
    }
    selectCharacter(id);
  }

  function selectBack() {
    if (App.mode === 'net') {
      if (JG.Net) JG.Net.close();
      showNet();
      Audio.ui();
      return;
    }
    if (App.selectLocked) return;
    if (App.selectStep === 1) {
      App.selected[1] = null;
      App.selected[0] = null;
      App.selectStep = 0;
      updateSelectUI();
      Audio.ui();
    } else {
      showTitle();
      Audio.ui();
    }
  }

  function showHelp() {
    if (App.screen === 'help') return;
    App.underScreen = App.screen;
    setScreen('help');
  }
  function closeHelp() {
    setScreen(App.underScreen || 'title');
  }

  /* =========================================================
     Match start / result / pause
     ========================================================= */
  function startMatch(p1Id, p2Id, opts) {
    closePause(true);
    hideClash();
    hideAnnounce();
    Audio.setMusicMode('battle');
    const variant2 = p1Id === p2Id ? 1 : 0;
    const seed = opts && opts.seed;
    const match = new G.Match(p1Id, p2Id, App.mode, 0, variant2, seed);
    App.game = match;
    App.netSeed = seed >>> 0;
    App.paused = false;
    App.resultShown = false;
    App.selected = [p1Id, p2Id];
    setScreen('fight');
    dom.hud.classList.remove('hidden');
    dom.hud.classList.add('show');
    dom.hud.classList.toggle('training', App.mode === 'training');
    $('timer-rule').textContent = App.mode === 'training' ? 'SANDBOX' : 'FIRST TO 2';
    dom.trainingPanel.classList.toggle('hidden', App.mode !== 'training');
    if (App.mode === 'training') match.updateTrainingPanel();
    setHudNames(match);
    updateSelectUI();
    const advancedHint = '<span class="hint-adv">进阶：长按 K 替身连打 <i>·</i> 空中 K 替身下击 <i>·</i> F 闪避 <i>·</i> S 下蹲由替身格挡 <i>·</i> S+K 挑空 <i>·</i> 冲刺 J 突进 <i>·</i> H 技能（CD 5s）</span>';
    dom.controlHint.innerHTML = App.mode === 'net'
      ? `<b>联机</b>双方都使用 A/D 移动 <i>·</i> Space 跳 <i>·</i> S 防 <i>·</i> J/K 攻击 <i>·</i> F 闪避 <i>·</i> L 二技能（CD 8s） <i>·</i> H 追击 <i>·</i> U 超必杀 <i>·</i> Esc 暂停<br>${advancedHint}`
      : App.mode === '2p'
        ? `<b>P1</b>A/D 移动 <i>·</i> Space 跳 <i>·</i> S 防 <i>·</i> J/K 攻击 <i>·</i> F 闪避 <i>·</i> L 二技能（CD 8s） <i>·</i> H 追击 <i>·</i> U 超必杀　<b>P2</b>方向键 + 1/2/3/5/4 + 右Shift闪避<br>${advancedHint}`
        : `<b>P1</b>A/D 或 ←/→ 移动 <i>·</i> Space/↑ 跳跃 <i>·</i> S/↓ 防御 <i>·</i> J/K 攻击 <i>·</i> F 闪避 <i>·</i> L 二技能（CD 8s） <i>·</i> H 追击 <i>·</i> U 超必杀 <i>·</i> Esc 暂停<br>${advancedHint}`;
    App.hintUntil = performance.now() + 7200;
    Input.clear();
    updateTouch();
    match.start();
    App.ghostHp = [JG.MAX_HP, JG.MAX_HP];
    hideSuperBanner();
  }
  App.startMatch = startMatch;

  function startNetMatch(p1Id, p2Id, seed) {
    App.mode = 'net';
    startMatch(p1Id, p2Id, { seed });
  }
  App.startNetMatch = startNetMatch;

  function showResult(match) {
    if (App.resultShown) return;
    App.resultShown = true;
    Audio.setMusicMode('menu');
    App.screen = 'result';
    hideAnnounce();
    dom.hud.classList.remove('show');
    dom.hud.classList.add('hidden');
    dom.quotes.classList.remove('show');
    dom.controlHint.classList.remove('show');
    dom.trainingPanel.classList.add('hidden');
    dom.combo1.classList.remove('show');
    dom.combo2.classList.remove('show');
    dom.superBanner.classList.remove('show');
    hideTouch();

    const winnerIndex = match.matchWinner;
    const winner = winnerIndex >= 0 ? match.fighters[winnerIndex] : match.p1;
    const title = winnerIndex >= 0 ? 'WINNER' : 'DRAW';
    $('result-title').textContent = title;
    $('result-name').textContent = winnerIndex >= 0 ? winner.data.name : '平局';
    const resultStand = winnerIndex >= 0 && winner.charId === 'josuke' && winner.goBeyond
      ? 'SOFT & WET: GO BEYOND / 软又湿·超越'
      : winnerIndex >= 0 ? winner.data.stand + ' / ' + winner.data.standJp : 'NO CONTEST';
    $('result-stand').textContent = resultStand;
    $('result-quote').textContent = winnerIndex >= 0 ? winner.data.win : '“这场战斗，还没有结束。”';
    $('result-combo').textContent = winner.maxCombo || 0;
    $('result-damage').textContent = Math.round(winner.damageDealt || 0);
    $('result-super').textContent = winner.supersUsed || 0;

    setScreen('result');
    if (winnerIndex >= 0) Audio.victory();
    else Audio.ko();
  }
  App.showResult = showResult;

  function togglePause(force) {
    if (App.screen !== 'fight' || !App.game || App.touchEditing) return;
    const next = force == null ? !App.paused : force;
    App.paused = next;
    dom.pause.classList.toggle('hidden', !next);
    Input.clear();
    updateTouch();
    if (next) Audio.ui();
    else Audio.ui();
  }
  function closePause(silent) {
    App.paused = false;
    dom.pause.classList.add('hidden');
    updateTouch();
    if (!silent) Audio.ui();
  }

  function quitToSelect() {
    closePause(true);
    hideClash();
    App.game = null;
    if (App.mode === 'net') {
      if (JG.Net) JG.Net.close();
      showNet();
      return;
    }
    showSelect(App.mode);
  }

  /* =========================================================
     Input
     ========================================================= */
  function humanInput(index) {
    // LAN clients both drive one fighter from their own keyboard, so both
    // sides use the P1 layout (WASD / Space / J-K-L-H-U-F). The arrow + digit
    // cluster stays available as a secondary layout.
    const map = index === 0
      ? ((App.mode === '1p' || App.mode === 'net') ? P1_SOLO_KEYS : P1_KEYS)
      : P2_KEYS;
    const held = (arr) => arr.some((c) => Input.down.has(c));
    const hit = (arr) => arr.some((c) => Input.pressed.has(c));
    return {
      left: held(map.left),
      right: held(map.right),
      down: held(map.down),
      heavy: held(map.heavy),
      second: held(map.second),
      dodge: held(map.dodge),
      pUp: hit(map.up),
      pLeft: hit(map.left),
      pRight: hit(map.right),
      pLight: hit(map.light),
      pHeavy: hit(map.heavy),
      pSpecial: hit(map.special),
      pSecond: hit(map.second),
      pSuper: hit(map.super),
      pDodge: hit(map.dodge)
    };
  }

  function aiRangeForSpecial(sp) {
    switch (sp && sp.type) {
      case 'rush': return [58, 210];
      case 'timestop': return [80, 330];
      case 'projectile': return [230, 760];
      case 'spread': return [210, 620];
      case 'trap': return [110, 470];
      case 'bubbleShot': return [180, 620];
      case 'goBeyondBubble': return [180, 760];
      default: return [70, 330];
    }
  }

  function aiRangeForSecond(f) {
    const sp = f.requiem && f.data.secondRequiem ? f.data.secondRequiem : f.data.second;
    switch (sp && sp.type) {
      case 'beam': return [150, 780];
      case 'timestopstrike': return [70, 340];
      case 'spread': return [190, 640];
      case 'tree': return [0, 9999];
      case 'frog': return [120, 640];
      case 'bubbleSteal': return [120, 560];
      default: return [70, 350];
    }
  }

  function aiChooseAttackPlan(opp, dist, pressGuard) {
    if (pressGuard) {
      return Math.random() < 0.45 ? ['heavy', 'barrage'] : ['heavy', 'light'];
    }
    if (dist > 150) return ['heavy', 'light'];
    if (dist > 120) return Math.random() < 0.5 ? ['heavy', 'light'] : ['light', 'heavy'];
    if (Math.random() < 0.22) return ['light', 'light', 'heavy'];
    if (Math.random() < 0.35) return ['heavy', 'light'];
    return ['light', 'heavy'];
  }

  function aiInput(f, opp, dt, match) {
    const diff = JG.DIFFICULTY[App.difficulty] || JG.DIFFICULTY.normal;
    const ai = f.ai;
    const out = {
      left: false, right: false, down: false, heavy: false, second: false, dodge: false,
      pUp: false, pLeft: false, pRight: false,
      pLight: false, pHeavy: false, pSpecial: false, pSecond: false, pSuper: false, pDodge: false
    };
    const dist = Math.abs(opp.x - f.x);
    const toward = opp.x >= f.x ? 1 : -1;
    const away = -toward;
    const preferred = f.data.ai.range;
    const lowHp = f.hp > 0 && f.hp < f.maxHp * 0.35;
    const oppLowHp = opp.hp > 0 && opp.hp < opp.maxHp * 0.35;
    const cornered = f.x < LEFT + 150 || f.x > RIGHT - 150;
    const oppAir = opp.y < GROUND - 90;

    ai.think -= dt;
    ai.intentTime -= dt;
    ai.superLock = Math.max(0, ai.superLock - dt);
    ai.skillLock = Math.max(0, ai.skillLock - dt);
    ai.guardHold = Math.max(0, ai.guardHold - dt);
    ai.threatDelay = Math.max(0, ai.threatDelay - dt);
    ai.holdHeavy = Math.max(0, ai.holdHeavy - dt);
    ai.holdSecond = Math.max(0, ai.holdSecond - dt);
    ai.jumpLock = Math.max(0, ai.jumpLock - dt);
    ai.dodgeLock = Math.max(0, ai.dodgeLock - dt);
    ai.attackTimer = Math.max(0, ai.attackTimer - dt);
    ai.perfectPress = Math.max(0, ai.perfectPress - dt);
    ai.reactLock = Math.max(0, ai.reactLock - dt);

    // Getting hit is not a decision point; only the optional burst matters.
    if (f.hitstun > 0) {
      if (f.burstCd <= 0 && f.meter >= 25 && Math.random() < (diff.escape || 0.012)) {
        out.pDodge = true;
      }
      return out;
    }
    if (f.blockstun > 0 || f.frozen) return out;

    // After a perfect dodge, use the free H follow-up immediately.
    if (f.perfectWindow > 0 && ai.perfectPress <= 0 && !f.attack && !f.specialAction) {
      out.pLight = true;
      ai.perfectPress = 0.55;
      ai.attackPlan = null;
      return out;
    }

    if (ai.holdHeavy > 0) out.heavy = true;
    if (ai.holdSecond > 0) out.second = true;

    /* ---- perceive incoming threats ---- */
    let threat = null;
    if (opp.attack) {
      const a = opp.attack;
      const activeEnd = (a.startup || 0.12) + (a.active || 0.1);
      const reach = (a.box ? a.box.x + a.box.w : 120) + 55;
      if (opp.attackTime <= activeEnd + 0.04 && Math.abs(opp.y - f.y) < 200 && dist < reach) {
        if (ai.seenAttack !== a) {
          ai.seenAttack = a;
          ai.threatDelay = Math.max(0.015, diff.reaction * 0.30) * (0.75 + Math.random() * 0.5);
          ai.threatAnswered = false;
          ai.threatKind = 'attack';
          ai.reactLock = 0;
        }
        threat = { kind: 'attack', a };
      }
    }
    if (!threat && opp.specialAction) {
      const sa = opp.specialAction;
      const type = sa.type;
      const melee = type === 'rush' || type === 'barrage' || type === 'timestopstrike' || type === 'gergrab';
      const maxTime = type === 'barrage' ? 1.0 : 0.62;
      const reach = type === 'rush' ? 235 : type === 'barrage' ? 190 : 320;
      if (melee && sa.time < maxTime && dist < reach) {
        if (ai.seenSpecial !== sa) {
          ai.seenSpecial = sa;
          ai.threatDelay = Math.max(0.02, diff.reaction * 0.42) * (0.8 + Math.random() * 0.5);
          ai.threatAnswered = false;
          ai.threatKind = 'special';
          ai.reactLock = 0;
        }
        threat = { kind: 'special', sa };
      }
    }
    if (!threat && match && (match.projectiles || match.josukeBubbles)) {
      let closest = null;
      const incoming = (match.projectiles || []).concat(match.josukeBubbles || []);
      for (const p of incoming) {
        if (p.owner !== opp) continue;
        const dx = f.x - p.x;
        if (Math.sign(dx) !== Math.sign(p.vx) && Math.abs(dx) < 480 &&
            Math.abs((f.y - 110) - p.y) < 210) {
          if (!closest || Math.abs(dx) < Math.abs(f.x - closest.p.x)) closest = { p, dx };
        }
      }
      if (closest) {
        if (ai.seenProjectile !== closest.p) {
          ai.seenProjectile = closest.p;
          ai.threatDelay = Math.max(0.02, diff.reaction * 0.55) * (0.8 + Math.random() * 0.5);
          ai.threatAnswered = false;
          ai.threatKind = 'projectile';
          ai.reactLock = 0;
        }
        threat = { kind: 'projectile', p: closest.p, dist: Math.abs(closest.dx) };
      }
    }

    /* ---- reactive defense: block, jump the beam, or dodge ---- */
    if (threat && f.onGround && !f.attack && !f.specialAction && !ai.attackPlan) {
      if (ai.threatDelay <= 0 && !ai.threatAnswered) {
        ai.threatAnswered = true;
        const p = threat.p;
        const beam = p && (p.kind === 'meteor' || p.kind === 'starfinger' || p.kind === 'gerray' || p.kind === 'lifeline');
        const blockChance = Math.min(0.98, diff.block + (threat.kind === 'projectile' ? 0.08 : 0));
        if (f.guardBroken <= 0 && Math.random() < blockChance) {
          const jumpChance = threat.kind === 'projectile' ? (beam ? 0.68 : 0.26) : 0.02;
          if (ai.jumpLock <= 0 && Math.random() < jumpChance) {
            out.pUp = true;
            if (toward > 0) out.right = true; else out.left = true;
            ai.jumpLock = 0.9;
            ai.intent = 'jump';
            ai.intentTime = 0.35;
            return out;
          }
          if (threat.kind === 'attack' && diff.block > 0.78 && f.perfectCd <= 0 && ai.dodgeLock <= 0 && Math.random() < 0.2) {
            out.pDodge = true;
            ai.dodgeLock = 1.1;
            ai.intent = 'dodge';
            ai.intentTime = 0.3;
            return out;
          }
          const hold = threat.kind === 'special' ? 0.7 : 0.22;
          ai.guardHold = Math.max(ai.guardHold, hold + diff.block * 0.35);
          ai.intent = 'guard';
          ai.intentTime = ai.guardHold;
          out.down = true;
          return out;
        }
      }
      // If the reaction check failed but a projectile is already close, make
      // an emergency backdash instead of eating it for free.
      if (threat.kind === 'projectile' && threat.dist < 220 && ai.dodgeLock <= 0 &&
          Math.random() < (diff.reaction < 0.2 ? 0.55 : 0.16)) {
        out.pDodge = true;
        if (away > 0) out.right = true; else out.left = true;
        ai.dodgeLock = 1.0;
        ai.intent = 'dodge';
        ai.intentTime = 0.25;
        return out;
      }
    }

    // Keep guarding while the attack is still active.
    if (ai.guardHold > 0 && f.onGround && !f.attack && !f.specialAction) {
      if (!threat && ai.guardHold < 0.10) ai.guardHold = 0;
      else {
        out.down = true;
        return out;
      }
    }

    /* ---- punish whiffs, recovery, and jump-ins ---- */
    if (f.onGround && !f.attack && !f.specialAction && !ai.attackPlan) {
      const oppRecover = opp.attack &&
        opp.attackTime > (opp.attack.startup + opp.attack.active);
      const oppSpecialRecover = opp.specialAction &&
        opp.specialAction.type !== 'barrage' && opp.specialAction.type !== 'rush' &&
        opp.specialAction.time > 0.62;
      if ((oppRecover || oppSpecialRecover) && dist < preferred + 110 && ai.reactLock <= 0) {
        if (Math.random() < Math.min(0.98, diff.aggression + 0.18)) {
          ai.attackPlan = dist < 120 ? ['light', 'heavy'] : ['heavy'];
          ai.attackStep = 0;
          ai.attackTimer = 0;
          ai.intent = 'attack';
          ai.intentTime = 0.3;
          ai.reactLock = 0.35;
        }
      }
      if (!ai.attackPlan && oppAir && opp.vy > -120 && dist < 210 && ai.reactLock <= 0) {
        ai.attackPlan = ['launcher', 'heavy'];
        ai.attackStep = 0;
        ai.attackTimer = 0;
        ai.intent = 'attack';
        ai.intentTime = 0.35;
        ai.reactLock = 0.35;
      }
    }

    /* ---- commit to a combo / pressure string ---- */
    if (ai.attackPlan) {
      if (f.hitstun > 0 || f.blockstun > 0) {
        ai.attackPlan = null;
      } else {
        if (ai.attackTimer <= 0 && ai.attackStep < ai.attackPlan.length) {
          const step = ai.attackPlan[ai.attackStep++];
          if (step === 'light') out.pLight = true;
          else if (step === 'heavy') out.pHeavy = true;
          else if (step === 'launcher') { out.down = true; out.pHeavy = true; }
          else if (step === 'barrage') { out.pHeavy = true; out.heavy = true; ai.holdHeavy = 0.52; }
          ai.attackTimer = 0.15 + Math.random() * 0.1;
        }
        if (ai.attackStep >= ai.attackPlan.length && !f.attack) {
          ai.attackPlan = null;
          ai.think = Math.min(ai.think, 0.08);
        }
        if (ai.attackPlan) return out;
      }
    }

    /* ---- slower decision tick: skills, pressure and spacing ---- */
    // While a threat is still inside the reaction window, do not commit to a
    // new attack/approach. Otherwise the AI would walk into the hit before its
    // block decision is allowed to fire.
    if ((ai.think <= 0 || ai.intentTime <= 0) && !ai.attackPlan && !(threat && !ai.threatAnswered)) {
      ai.think = Math.max(0.06, diff.reaction * (0.55 + Math.random() * 0.75));
      ai.intentTime = 0.16 + Math.random() * 0.3;
      const canUse = f.onGround && !f.attack && !f.specialAction && f.hitstun <= 0 && f.blockstun <= 0;

      // Super: save it for a range where it can actually connect. Tooru's
      // domain is a 50 SP skill rather than a 100 SP cinematic.
      const superCost = f.charId === 'tooru' ? 50 : 100;
      const superReady = (f.charId === 'josuke' && !f.goBeyond)
        ? f.meter >= 100 && (f.specialMeter || 0) >= 50
        : f.meter >= superCost;
      if (canUse && superReady && ai.superLock <= 0 &&
          dist < Math.max(preferred + 150, 280) && Math.random() < diff.aggression * 0.55) {
        out.pSuper = true;
        ai.superLock = 2.2;
        ai.think = 0.5;
        return out;
      }

      // L: use the move at its effective range instead of spamming it.
      const sp = (f.goBeyond && f.data.specialEvolved)
        ? f.data.specialEvolved
        : f.data.special;
      const [sMin, sMax] = aiRangeForSpecial(sp);
      const lReady = (sp.type === 'bubbleShot'
        ? f.bubbleCd <= 0 && f.bubbleCharges > 0
        : f.specialCd <= 0) && (f.charId !== 'tooru' || f.abilityLock <= 0);
      if (canUse && f.meter >= sp.cost && lReady && ai.skillLock <= 0 &&
          dist >= sMin && dist <= sMax &&
          Math.random() < diff.aggression * (f.data.ai.special || 0.5) * 0.75) {
        out.pSpecial = true;
        ai.skillLock = 0.7;
        ai.think = 0.3;
        ai.intent = 'approach';
        return out;
      }

      // H: Giorno picks tree when low, frog when he wants space; other
      // characters use their own second skill at its proper range.
      if (canUse && f.secondCd <= 0 && ai.skillLock <= 0) {
        const isGiorno = f.charId === 'giorno' && !f.requiem;
        if (isGiorno) {
          if (f.meter >= f.data.second.cost) {
            if (lowHp && dist > 180 && (!opp.attack || dist > 260)) {
              out.pSecond = true;
              out.second = true;
              ai.holdSecond = 0.45;
              ai.skillLock = 0.9;
              ai.think = 0.5;
              return out;
            }
            if (dist >= 220 && dist <= 620 && Math.random() < 0.35 + diff.aggression * 0.25) {
              out.pSecond = true;
              ai.skillLock = 0.8;
              ai.think = 0.35;
              return out;
            }
          }
        } else {
          const sp2 = f.requiem && f.data.secondRequiem ? f.data.secondRequiem : f.data.second;
          const [hMin, hMax] = aiRangeForSecond(f);
          if (f.meter >= sp2.cost && dist >= hMin && dist <= hMax &&
              Math.random() < 0.25 + diff.aggression * 0.35) {
            out.pSecond = true;
            ai.skillLock = 0.7;
            ai.think = 0.3;
            return out;
          }
        }
      }

      const ideal = preferred + (lowHp ? 70 : 0) - (oppLowHp ? 30 : 0);
      // Melee characters want to get inside normal range. Zoners can poke from
      // roughly 200 px, then back out; the lower retreat line keeps them from
      // walking away before they ever throw a normal.
      const attackLine = Math.min(preferred > 280 ? 180 : 165, ideal + 30);
      const retreatLine = ideal * (lowHp ? (preferred > 280 ? 0.65 : 0.58) : (preferred > 280 ? 0.4 : 0.58));
      if (cornered && dist < 170 && ai.dodgeLock <= 0 && Math.random() < 0.35 + diff.aggression * 0.2) {
        // Escape the corner by dodging through the opponent.
        out.pDodge = true;
        if (f.x < WORLD_W / 2) out.right = true; else out.left = true;
        ai.dodgeLock = 1.2;
        ai.think = 0.3;
        return out;
      }
      if (dist <= attackLine) {
        const oppGuard = opp.guarding;
        if (Math.random() < diff.aggression * (oppGuard ? 0.7 : 0.92)) {
          ai.attackPlan = aiChooseAttackPlan(opp, dist, oppGuard);
          ai.attackStep = 0;
          ai.attackTimer = 0;
          ai.intent = 'attack';
          ai.intentTime = 0.3;
        } else if (dist < 110 && Math.random() < 0.35) {
          ai.intent = 'retreat';
          ai.intentTime = 0.22;
        } else {
          ai.intent = 'guard';
          ai.intentTime = 0.18 + Math.random() * 0.2;
        }
      } else if (dist < retreatLine) {
        ai.intent = 'retreat';
        ai.intentTime = 0.28 + Math.random() * 0.22;
      } else if (dist > ideal + 70) {
        ai.intent = 'approach';
        ai.intentTime = 0.3 + Math.random() * 0.25;
      } else if (preferred > 280) {
        // Zoner mid-range: keep moving instead of parking in guard. Mix in
        // approach so it still creates pressure when skills are on cooldown.
        const oppClosing = (opp.x - f.x) * opp.vx < -80;
        if (oppClosing || opp.attack) {
          ai.intent = 'guard';
          ai.intentTime = 0.18 + Math.random() * 0.18;
        } else if (dist > ideal * 0.75 || Math.random() < 0.65) {
          ai.intent = 'approach';
          ai.intentTime = 0.24 + Math.random() * 0.2;
        } else {
          ai.intent = 'retreat';
          ai.intentTime = 0.22 + Math.random() * 0.18;
        }
      } else {
        ai.intent = 'approach';
        ai.intentTime = 0.25 + Math.random() * 0.25;
      }
    }

    /* ---- map intent to this frame's input ---- */
    if (ai.intent === 'guard') {
      out.down = true;
      return out;
    }
    if (ai.intent === 'retreat') {
      if (cornered && ai.dodgeLock <= 0 && Math.random() < 0.25) {
        out.pDodge = true;
        if (f.x < WORLD_W / 2) out.right = true; else out.left = true;
        ai.dodgeLock = 1.1;
        return out;
      }
      if (away > 0) out.right = true; else out.left = true;
      return out;
    }
    if (ai.intent === 'jump') {
      if (toward > 0) out.right = true; else out.left = true;
      return out;
    }
    if (ai.intent === 'approach') {
      if (toward > 0) out.right = true; else out.left = true;
      if (f.onGround && ai.dodgeLock <= 0 && dist > 180 && dist < 380 &&
          Math.random() < diff.aggression * 0.004) {
        // Close the gap with a forward dodge instead of walking into range.
        out.pDodge = true;
        ai.dodgeLock = 1.1;
        return out;
      }
      if (f.onGround && dist > 130 && dist < 300 && ai.jumpLock <= 0 &&
          Math.random() < diff.aggression * 0.018) {
        out.pUp = true;
        ai.jumpLock = 1.0;
      }
      return out;
    }
    if (ai.intent === 'attack' && !ai.attackPlan) {
      ai.attackPlan = aiChooseAttackPlan(opp, dist, opp.guarding);
      ai.attackStep = 0;
      ai.attackTimer = 0;
    }
    return out;
  }

  function trainingInput(match) {
    return {
      left: false, right: false, down: !!match.dummyGuard, heavy: false, second: false, dodge: false,
      pUp: false, pLeft: false, pRight: false, pLight: false, pHeavy: false,
      pSpecial: false, pSecond: false, pSuper: false, pDodge: false
    };
  }

  /* The shared surface. Later files destructure exactly what they need, so
     anything missing here shows up as a ReferenceError on boot, not silently. */
  Object.assign(G, {
    JG, Art, Audio,
    W, H, WORLD_W, GROUND, LEFT, RIGHT, GRAVITY, STEP,
    $, rectsOverlap, approach, canvas, ctx, clamp, lerp, easeOut,
    hudCache, dom, Input, ALL_GAME_KEYS, App, safeStorage,
    setScreen, announce, toast, flash,
    showSuperBanner, hideSuperBanner, showClash, updateClashUI, hideClash, setHudNames, updatePips, updateHUD, resetHudCache,
    hideTouch, updateTouch, fitFrame, buildRoster, setFocus, updateSelectUI,
    showSelect, selectCharacter, randomPick, selectBack, showHelp, closeHelp, showTitle,
    showNet, setNetStatus, showNetRoom, startNetMatch,
    startMatch, showResult, togglePause, closePause, quitToSelect,
    humanInput, aiInput, trainingInput,
    KEY_ACTIONS, KEY_ACTION_LABELS, keyBinding, setKeyBinding, resetKeyBindings, keyLabel
  });

  // DPR changes on resize, so it needs accessors: every other file destructures
  // once at load time, and a plain copy would go stale after setupCanvas().
  Object.defineProperty(G, "DPR", {
    get: () => DPR,
    set: (value) => { DPR = value; }
  });
})();
