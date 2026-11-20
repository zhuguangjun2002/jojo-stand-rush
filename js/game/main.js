/* =========================================================
   JOJO 奇妙格斗 · STAND RUSH — events, main loop and boot
   ========================================================= */
(function (G) {
  'use strict';
  const {
    $, ALL_GAME_KEYS, App, Audio, Fighter, H, Input, JG, Match, Net, STEP, W,
    KEY_ACTIONS, KEY_ACTION_LABELS, keyBinding, keyLabel, setKeyBinding,
    resetKeyBindings,
    buildRoster, canvas, clamp, closeHelp, closePause, ctx, dom, fitFrame, hideTouch,
    quitToSelect, randomPick, render, safeStorage, selectBack, selectCharacter,
    setFocus, setScreen, showHelp, showSelect, showNet, showNetRoom, showTitle,
    setNetStatus, startMatch, startNetMatch, toast, togglePause, updateSelectUI,
    updateTouch
  } = G;

  let keyBindTarget = null;

  function updateNetStats() {
    const pingEl = $('net-ping');
    const delayEl = $('net-delay');
    const hudEl = $('net-latency');
    const remote = Boolean(Net.usingRemote);
    const rtt = Net.rtt == null ? null : Math.round(Net.rtt);
    const peerRtt = Net.peerRtt == null ? null : Math.round(Net.peerRtt);
    const worstRtt = Math.max(rtt || 0, peerRtt || 0);
    const delay = remote ? Net.inputDelay : 0;
    const pingText = remote
      ? (rtt == null ? '测量中…' : `${rtt} ms`)
      : '本地';
    const peerText = peerRtt == null ? '测量中…' : `${peerRtt} ms`;

    if (pingEl) pingEl.textContent = remote ? `${pingText} / 对手 ${peerText}` : pingText;
    if (delayEl) delayEl.textContent = String(delay);
    if (hudEl) {
      const summary = remote
        ? (rtt == null ? `测量中… · ${delay} 帧` : `${rtt} ms · ${delay} 帧`)
        : `LAN · ${delay} 帧`;
      hudEl.textContent = summary + (Net.simulationFps == null ? ''
        : ` · 模拟 ${Math.round(Net.simulationFps)} FPS · 等待 ${Net.waitPercent}%`);
      hudEl.title = `本机 ${pingText}；对手 ${peerText}；输入配对往返 ${Net.inputRtt == null ? '--' : Net.inputRtt} ms`;
      hudEl.classList.toggle('hidden', App.mode !== 'net' || App.screen !== 'fight');
      hudEl.classList.toggle('warn', remote && (worstRtt > 120 || Net.waitPercent > 5));
      hudEl.classList.toggle('bad', remote && (worstRtt > 220 || Net.waitPercent > 20));
    }
  }

  /* =========================================================
     Key settings
     ========================================================= */
  function setKeysStatus(text, error) {
    const el = $('keys-status');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('error', !!error);
  }

  function renderKeySettings() {
    for (const player of ['p1', 'p2']) {
      const list = $(player === 'p1' ? 'keys-p1' : 'keys-p2');
      if (!list) continue;
      list.innerHTML = '';
      for (const action of KEY_ACTIONS) {
        const row = document.createElement('div');
        row.className = 'key-bind-row';
        const label = document.createElement('span');
        label.textContent = KEY_ACTION_LABELS[action];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'key-bind-btn';
        const listening = keyBindTarget &&
          keyBindTarget.player === player && keyBindTarget.action === action;
        btn.textContent = listening ? '按下新键…' : keyLabel(keyBinding(player, action));
        if (listening) btn.classList.add('listening');
        btn.addEventListener('click', () => {
          Audio.unlock();
          keyBindTarget = { player, action };
          renderKeySettings();
          setKeysStatus('请按下新的按键；按 Esc 取消。');
        });
        row.appendChild(label);
        row.appendChild(btn);
        list.appendChild(row);
      }
    }
  }

  function showKeySettings() {
    keyBindTarget = null;
    setScreen('keys');
    renderKeySettings();
    setKeysStatus('点击一个按键，然后按下新的键。联机对战时双方都使用 P1 键位。');
    Audio.setMusicMode('menu');
    Audio.ui();
  }

  function handleKeySettings(code) {
    if (!keyBindTarget) {
      if (code === 'Escape' || code === 'Enter') showTitle();
      return;
    }
    if (code === 'Escape') {
      keyBindTarget = null;
      renderKeySettings();
      setKeysStatus('已取消，未修改按键。');
      return;
    }
    const target = keyBindTarget;
    keyBindTarget = null;
    const res = setKeyBinding(target.player, target.action, code);
    renderKeySettings();
    if (res.ok) {
      setKeysStatus('已保存：' + KEY_ACTION_LABELS[target.action] + ' → ' + keyLabel(code));
      Audio.confirm();
    } else {
      setKeysStatus(res.error || '无法设置这个按键', true);
      Audio.whiff();
    }
  }

  /* =========================================================
     Events
     ========================================================= */
  function handleKeyDown(e) {
    if (App.screen === 'keys') {
      e.preventDefault();
      handleKeySettings(e.code);
      return;
    }
    const code = e.code;
    if (e.repeat) {
      if (ALL_GAME_KEYS.has(code) || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) e.preventDefault();
      return;
    }

    if (code === 'KeyM') {
      toggleMute();
      return;
    }

    if (App.touchEditing) {
      // The editor owns input while it is open; Esc/Enter closes it politely.
      if (code === 'Escape' || code === 'Enter') {
        e.preventDefault();
        setTouchEditor(false);
      }
      return;
    }

    if (App.screen === 'fight' && App.game && App.game.training) {
      if (code === 'KeyR') {
        e.preventDefault();
        App.game.resetTraining();
        return;
      }
      if (code === 'KeyT') {
        e.preventDefault();
        App.game.toggleDummyGuard();
        return;
      }
    }

    if (App.screen === 'title') {
      if (code === 'Digit1' || code === 'Enter' || code === 'Space') {
        e.preventDefault();
        showSelect('1p');
        return;
      }
      if (code === 'Digit2') {
        e.preventDefault();
        showSelect('2p');
        return;
      }
      if (code === 'Digit3') {
        e.preventDefault();
        showSelect('training');
        return;
      }
      if (code === 'Digit4') {
        e.preventDefault();
        showNet();
        return;
      }
      if (code === 'KeyH') { showHelp(); return; }
      return;
    }

    if (App.screen === 'select') {
      if (code === 'ArrowLeft' || code === 'KeyA') {
        e.preventDefault();
        setFocus(App.focusIndex - 1);
        Audio.ui();
        return;
      }
      if (code === 'ArrowRight' || code === 'KeyD') {
        e.preventDefault();
        setFocus(App.focusIndex + 1);
        Audio.ui();
        return;
      }
      if (code === 'ArrowDown' || code === 'ArrowUp') {
        e.preventDefault();
        setFocus(App.focusIndex + (code === 'ArrowDown' ? 2 : -2));
        Audio.ui();
        return;
      }
      if (code === 'Enter' || code === 'Space') {
        e.preventDefault();
        selectCharacter(JG.CHAR_LIST[App.focusIndex]);
        return;
      }
      if (code === 'Escape' || code === 'Backspace') {
        e.preventDefault();
        selectBack();
        return;
      }
      if (code === 'KeyR') { randomPick(); return; }
      return;
    }

    if (App.screen === 'net') {
      if (code === 'Escape' || code === 'Backspace') {
        e.preventDefault();
        Net.close();
        showTitle();
        Audio.ui();
      }
      return;
    }

    if (App.screen === 'help') {
      if (code === 'Escape' || code === 'Enter' || code === 'Space') {
        e.preventDefault();
        closeHelp();
      }
      return;
    }

    if (App.screen === 'result') {
      if (code === 'Enter' || code === 'Space') {
        e.preventDefault();
        rematch();
        return;
      }
      if (code === 'Escape') {
        e.preventDefault();
        quitToSelect();
      }
      return;
    }

    if (App.screen === 'fight') {
      if (code === 'Escape') {
        e.preventDefault();
        togglePause();
        return;
      }
      if (App.paused) return;
      if (ALL_GAME_KEYS.has(code) || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
        e.preventDefault();
        Input.press(code);
      }
    }
  }

  function handleKeyUp(e) {
    Input.release(e.code);
    if (ALL_GAME_KEYS.has(e.code)) e.preventDefault();
  }

  function syncMuteLabels() {
    const label = '声音：' + (App.muted ? '关' : '开');
    ['btn-mute', 'btn-pause-mute'].forEach((id) => {
      const btn = $(id);
      if (btn) btn.textContent = label;
    });
  }

  function toggleMute() {
    App.muted = !App.muted;
    Audio.setMuted(App.muted);
    safeStorage('jojo-mute', App.muted ? '1' : '0');
    syncMuteLabels();
    if (!App.muted) { Audio.unlock(); Audio.ui(); }
  }

  function canUseFullscreen() {
    const root = document.documentElement;
    return !!(root.requestFullscreen || root.webkitRequestFullscreen);
  }

  function toggleFullscreen() {
    Audio.unlock();
    const root = document.documentElement;
    const fsElement = document.fullscreenElement || document.webkitFullscreenElement;
    if (!fsElement) {
      const request = root.requestFullscreen || root.webkitRequestFullscreen;
      if (!request) return;
      Promise.resolve().then(() => request.call(root)).then(() => {
        // Phones rotate lazily after entering fullscreen; lock when allowed.
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(() => {});
        }
      }).catch(() => {});
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) Promise.resolve().then(() => exit.call(document)).catch(() => {});
    }
  }

  function hasCoarsePointer() {
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  function enableTouchMode() {
    if (document.body.classList.contains('touch')) return;
    document.body.classList.add('touch');
    applyTouchLayout();
    updateTouch();
    fitFrame();
  }

  let resetTouchStick = () => {};

  /* =========================================================
     Custom touch layout
     ========================================================= */
  const TOUCH_LAYOUT_KEY = 'jojo-touch-layout';
  const TOUCH_LAYOUT_KEYS = ['stick', 'light', 'heavy', 'special', 'follow', 'dodge', 'super', 'herb'];
  const TOUCH_CONTROL_NAMES = {
    stick: '虚拟轮盘',
    light: '轻攻击',
    heavy: '重攻击',
    special: '二技能',
    follow: '追击技',
    dodge: '闪避',
    super: '超必杀',
    herb: '乔尼·药草'
  };
  const TOUCH_MARGIN = 8;
  const TOUCH_SCALE_MIN = 0.7;
  const TOUCH_SCALE_MAX = 1.6;

  function loadTouchLayout() {
    const raw = safeStorage(TOUCH_LAYOUT_KEY, undefined, '');
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      const layout = {};
      TOUCH_LAYOUT_KEYS.forEach((key) => {
        const item = parsed[key];
        if (!item || !Number.isFinite(item.x) || !Number.isFinite(item.y)) return;
        layout[key] = {
          x: clamp(item.x, -1, 1),
          y: clamp(item.y, -1, 1),
          scale: Number.isFinite(item.scale)
            ? clamp(item.scale, TOUCH_SCALE_MIN, TOUCH_SCALE_MAX) : 1
        };
      });
      return layout;
    } catch (_) {
      return {};
    }
  }

  let touchLayout = loadTouchLayout();

  function saveTouchLayout() {
    safeStorage(TOUCH_LAYOUT_KEY, JSON.stringify(touchLayout));
  }

  function touchControlElement(key) {
    return document.querySelector(`[data-touch-key="${key}"]`);
  }

  function touchControlScale(el) {
    const value = parseFloat(getComputedStyle(el).getPropertyValue('--control-scale'));
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  function applyTouchLayout() {
    if (!document.body.classList.contains('touch')) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    TOUCH_LAYOUT_KEYS.forEach((key) => {
      const el = touchControlElement(key);
      if (!el) return;
      const item = touchLayout[key];
      if (!item) {
        el.style.left = '';
        el.style.top = '';
        el.style.removeProperty('--control-scale');
        return;
      }
      el.style.left = `${item.x * vw}px`;
      el.style.top = `${item.y * vh}px`;
      el.style.setProperty('--control-scale', item.scale || 1);
    });
  }

  function clampTouchLayoutToViewport() {
    if (dom.touch.classList.contains('hidden')) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const editorBar = $('touch-editor-bar');
    const topLimit = TOUCH_MARGIN + (App.touchEditing && editorBar
      ? editorBar.getBoundingClientRect().bottom : 0);
    let changed = false;
    TOUCH_LAYOUT_KEYS.forEach((key) => {
      const el = touchControlElement(key);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let dx = 0;
      let dy = 0;
      if (rect.left < TOUCH_MARGIN) dx = TOUCH_MARGIN - rect.left;
      else if (rect.right > vw - TOUCH_MARGIN) dx = (vw - TOUCH_MARGIN) - rect.right;
      if (rect.top < topLimit) dy = topLimit - rect.top;
      else if (rect.bottom > vh - TOUCH_MARGIN) dy = (vh - TOUCH_MARGIN) - rect.bottom;
      if (!dx && !dy) return;
      const item = touchLayout[key] || { x: 0, y: 0, scale: 1 };
      item.x += dx / vw;
      item.y += dy / vh;
      touchLayout[key] = item;
      el.style.left = `${item.x * vw}px`;
      el.style.top = `${item.y * vh}px`;
      changed = true;
    });
    if (changed) saveTouchLayout();
  }

  let selectedTouchKey = null;

  function syncTouchSizeUI() {
    const row = $('touch-editor-size');
    if (!row) return;
    if (!selectedTouchKey) {
      row.classList.add('hidden');
      return;
    }
    const item = touchLayout[selectedTouchKey];
    const scale = item && Number.isFinite(item.scale) ? item.scale : 1;
    row.classList.remove('hidden');
    const name = $('touch-size-name');
    if (name) name.textContent = TOUCH_CONTROL_NAMES[selectedTouchKey] || selectedTouchKey;
    const range = $('touch-size-range');
    if (range) range.value = String(scale);
    const out = $('touch-size-out');
    if (out) out.textContent = `${Math.round(scale * 100)}%`;
  }

  function selectTouchControl(key) {
    if (!App.touchEditing || !key) return;
    selectedTouchKey = key;
    document.querySelectorAll('[data-touch-key]').forEach((el) => {
      el.classList.toggle('touch-control-selected', el.dataset.touchKey === key);
    });
    syncTouchSizeUI();
    // The bar grows when the size row appears; keep controls out from under it.
    clampTouchLayoutToViewport();
  }

  function clearTouchSelection() {
    selectedTouchKey = null;
    document.querySelectorAll('.touch-control-selected').forEach((el) => {
      el.classList.remove('touch-control-selected');
    });
    syncTouchSizeUI();
  }

  function setTouchControlScale(key, scale) {
    if (!App.touchEditing || !key) return;
    const item = touchLayout[key] || { x: 0, y: 0 };
    item.scale = clamp(scale, TOUCH_SCALE_MIN, TOUCH_SCALE_MAX);
    touchLayout[key] = item;
    applyTouchLayout();
    clampTouchLayoutToViewport();
    syncTouchSizeUI();
  }

  function startTouchControlDrag(e, el) {
    if (!App.touchEditing) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    Audio.unlock();
    resetTouchStick();
    Input.clear();

    const key = el.dataset.touchKey;
    if (!key) return;
    selectTouchControl(key);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = el.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const editorBar = $('touch-editor-bar');
    // Keep controls below the editor bar so they cannot hide under it.
    const topLimit = TOUCH_MARGIN + (editorBar ? editorBar.getBoundingClientRect().bottom : 0);
    const item = touchLayout[key] || { x: 0, y: 0, scale: 1 };
    const startOffsetX = item.x * vw;
    const startOffsetY = item.y * vh;
    let moved = false;

    el.classList.add('dragging');

    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      ev.preventDefault();
      moved = true;
      const nextLeft = clamp(rect.left + (ev.clientX - startX), TOUCH_MARGIN,
        vw - TOUCH_MARGIN - rect.width);
      const nextTop = clamp(rect.top + (ev.clientY - startY), topLimit,
        vh - TOUCH_MARGIN - rect.height);
      const offsetX = startOffsetX + (nextLeft - rect.left);
      const offsetY = startOffsetY + (nextTop - rect.top);
      touchLayout[key] = {
        x: offsetX / vw,
        y: offsetY / vh,
        scale: item.scale || 1
      };
      el.style.left = `${offsetX}px`;
      el.style.top = `${offsetY}px`;
    };

    const stop = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', stop, true);
      window.removeEventListener('pointercancel', stop, true);
      el.classList.remove('dragging');
      if (moved) saveTouchLayout();
    };

    window.addEventListener('pointermove', move, { capture: true, passive: false });
    window.addEventListener('pointerup', stop, true);
    window.addEventListener('pointercancel', stop, true);
  }

  function setTouchEditor(editing) {
    if (!document.body.classList.contains('touch')) return;
    if (editing && !['fight', 'title', 'keys'].includes(App.screen)) return;
    if (editing && App.screen === 'fight' && !App.game) return;
    App.touchEditing = editing;
    document.body.classList.toggle('touch-editing', editing);
    const bar = $('touch-editor-bar');
    if (bar) bar.classList.toggle('hidden', !editing);
    clearTouchSelection();
    Input.clear();
    resetTouchStick();
    if (editing) {
      App.paused = App.screen === 'fight';
      dom.pause.classList.add('hidden');
      applyTouchLayout();
      requestAnimationFrame(() => {
        applyTouchLayout();
        clampTouchLayoutToViewport();
      });
    } else {
      saveTouchLayout();
      App.paused = false;
      if (App.screen === 'fight') dom.pause.classList.remove('hidden');
      else dom.pause.classList.add('hidden');
      applyTouchLayout();
    }
    updateTouch();
    Audio.ui();
  }

  function resetTouchLayout() {
    touchLayout = {};
    clearTouchSelection();
    saveTouchLayout();
    applyTouchLayout();
    toast('按键位置与大小已重置');
    Audio.ui();
  }

  function bindTouchLayoutEditor() {
    const open = $('btn-touch-layout');
    if (open) open.addEventListener('click', () => setTouchEditor(true));
    const quickOpen = $('btn-touch-layout-edit');
    if (quickOpen) quickOpen.addEventListener('click', () => setTouchEditor(true));
    const done = $('btn-touch-layout-done');
    if (done) done.addEventListener('click', () => setTouchEditor(false));
    const reset = $('btn-touch-layout-reset');
    if (reset) reset.addEventListener('click', resetTouchLayout);

    const sizeRange = $('touch-size-range');
    if (sizeRange) {
      sizeRange.addEventListener('input', () => {
        setTouchControlScale(selectedTouchKey, parseFloat(sizeRange.value));
      });
      sizeRange.addEventListener('change', () => saveTouchLayout());
    }

    const stepSize = (delta) => {
      if (!selectedTouchKey) return;
      const item = touchLayout[selectedTouchKey];
      const current = item && Number.isFinite(item.scale) ? item.scale : 1;
      setTouchControlScale(selectedTouchKey, current + delta);
      saveTouchLayout();
      Audio.ui();
    };
    const dec = $('btn-touch-size-dec');
    if (dec) dec.addEventListener('click', () => stepSize(-0.05));
    const inc = $('btn-touch-size-inc');
    if (inc) inc.addEventListener('click', () => stepSize(0.05));

    document.querySelectorAll('[data-touch-key]').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        if (!App.touchEditing) return;
        startTouchControlDrag(e, el);
      }, true);
    });
  }

  function bindTouchStick() {
    const stick = $('touch-stick');
    const knob = $('touch-stick-knob');
    if (!stick || !knob) return;

    const DEADZONE = 0.2;
    const JUMP_AT = 0.42;
    const GUARD_AT = 0.34;
    const keys = { KeyA: false, KeyD: false, Space: false, KeyS: false };
    let activePointer = null;

    const setKey = (code, down) => {
      if (keys[code] === down) return;
      keys[code] = down;
      if (down) Input.press(code);
      else Input.release(code);
    };

    const applyDirection = (x, y) => {
      setKey('KeyA', x < -DEADZONE);
      setKey('KeyD', x > DEADZONE);
      setKey('Space', y < -JUMP_AT);
      setKey('KeyS', y > GUARD_AT);
    };

    const reset = () => {
      stopTracking();
      Object.keys(keys).forEach((code) => setKey(code, false));
      activePointer = null;
      stick.classList.remove('active');
      knob.style.transform = 'translate3d(0, 0, 0)';
    };
    resetTouchStick = reset;

    const move = (e) => {
      if (e.pointerId !== activePointer) return;
      e.preventDefault();
      const rect = stick.getBoundingClientRect();
      const maxTravel = rect.width * 0.32;
      let dx = e.clientX - (rect.left + rect.width / 2);
      let dy = e.clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy);
      if (distance > maxTravel) {
        const scale = maxTravel / distance;
        dx *= scale;
        dy *= scale;
      }
      // The stick itself is scaled for custom sizing; divide the knob travel
      // so the visual knob still follows the finger one-to-one.
      const scale = touchControlScale(stick);
      knob.style.transform = `translate3d(${dx / scale}px, ${dy / scale}px, 0)`;
      applyDirection(dx / maxTravel, dy / maxTravel);
    };

    const release = (e) => {
      if (e.pointerId !== activePointer) return;
      e.preventDefault();
      reset();
    };

    // Track the active finger on the window, not just the stick. Pointer
    // capture helps, but some mobile browsers drop it once a drag leaves the
    // element; window tracking keeps the knob and held keys reliable.
    function stopTracking() {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
    }

    const press = (e) => {
      // One finger owns the stick; a second finger is for the attack buttons.
      if (activePointer !== null) return;
      e.preventDefault();
      Audio.unlock();
      activePointer = e.pointerId;
      stick.classList.add('active');
      if (stick.setPointerCapture) {
        try { stick.setPointerCapture(e.pointerId); } catch (_) { /* optional */ }
      }
      window.addEventListener('pointermove', move, { capture: true, passive: false });
      window.addEventListener('pointerup', release, true);
      window.addEventListener('pointercancel', release, true);
      move(e);
    };

    stick.addEventListener('pointerdown', press);
    stick.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function bindTouchControls() {
    document.querySelectorAll('[data-touch]').forEach((btn) => {
      const activeCode = btn.dataset.touch;
      // Track pointer ids per button so two fingers on the same control cannot
      // release each other's held input on pointerup.
      const pointers = new Set();

      const press = (e) => {
        e.preventDefault();
        Audio.unlock();
        pointers.add(e.pointerId);
        Input.press(activeCode);
        if (btn.setPointerCapture) {
          try { btn.setPointerCapture(e.pointerId); } catch (_) { /* optional */ }
        }
      };
      const release = (e) => {
        e.preventDefault();
        pointers.delete(e.pointerId);
        if (!pointers.size) Input.release(activeCode);
      };

      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', release);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    const pauseBtn = $('btn-touch-pause');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        resetTouchStick();
        if (App.screen === 'fight' && App.game) togglePause(true);
      });
    }
  }

  function rematch() {
    if (!App.game) { showSelect(App.mode); return; }
    const p1 = App.game.p1Id;
    const p2 = App.game.p2Id;
    if (App.mode === 'net') {
      if (!Net.isHost()) {
        toast('等待房主开始再战');
        return;
      }
      const seed = (Math.random() * 0x7FFFFFFF) | 0;
      const delay = Net.recommendedDelay();
      Net.rematch(p1, p2, seed, delay);
      Net.resetFrames();
      dom.result.classList.add('hidden');
      startNetMatch(p1, p2, seed);
      updateNetStats();
      return;
    }
    dom.result.classList.add('hidden');
    startMatch(p1, p2);
  }

  const AI_CUSTOM_FIELDS = [
    { key: 'reaction', input: 'ai-react', out: 'ai-react-out', fmt: (v) => v.toFixed(2) + 's' },
    { key: 'aggression', input: 'ai-aggression', out: 'ai-aggression-out', fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'block', input: 'ai-block', out: 'ai-block-out', fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'damage', input: 'ai-damage', out: 'ai-damage-out', fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'escape', input: 'ai-escape', out: 'ai-escape-out', fmt: (v) => (v * 100).toFixed(1) + '%' }
  ];

  function syncAiCustomPanel() {
    for (const f of AI_CUSTOM_FIELDS) {
      const input = $(f.input);
      const out = $(f.out);
      if (!input || !out) continue;
      input.value = JG.DIFFICULTY.custom[f.key];
      out.textContent = f.fmt(JG.DIFFICULTY.custom[f.key]);
    }
  }

  function loadAiCustom() {
    const preset = JG.DIFFICULTY.custom;
    const raw = safeStorage('jojo-ai-custom', undefined, '');
    let saved = null;
    try { saved = raw ? JSON.parse(raw) : null; } catch (e) { saved = null; }
    if (saved && typeof saved === 'object') {
      for (const f of AI_CUSTOM_FIELDS) {
        const v = Number(saved[f.key]);
        const input = $(f.input);
        if (!input || !Number.isFinite(v)) continue;
        preset[f.key] = Math.max(parseFloat(input.min), Math.min(parseFloat(input.max), v));
      }
    }
    syncAiCustomPanel();
  }

  function saveAiCustom() {
    const preset = JG.DIFFICULTY.custom;
    for (const f of AI_CUSTOM_FIELDS) {
      const input = $(f.input);
      const out = $(f.out);
      if (!input || !out) continue;
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) preset[f.key] = v;
      out.textContent = f.fmt(preset[f.key]);
    }
    safeStorage('jojo-ai-custom', JSON.stringify(preset));
  }

  function bindAiCustom() {
    loadAiCustom();
    for (const f of AI_CUSTOM_FIELDS) {
      const input = $(f.input);
      if (input) input.addEventListener('input', saveAiCustom);
    }
    const close = $('btn-ai-custom-close');
    if (close) close.addEventListener('click', () => $('ai-custom-panel').classList.add('hidden'));
  }

  const VIEWER_ID = 'v-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
  const HEARTBEAT_URL = '/__heartbeat?id=' + encodeURIComponent(VIEWER_ID);
  const BYE_URL = '/__bye?id=' + encodeURIComponent(VIEWER_ID);
  let heartbeatTimer = null;

  function sendHeartbeat() {
    if (document.hidden) return;
    // /__heartbeat only exists on server.py. A static host would answer 404,
    // so stay quiet unless the capability probe found the local server.
    if (!G.Server || G.Server.online !== true) return;
    fetch(HEARTBEAT_URL, { cache: 'no-store' }).catch(() => {});
  }

  function sendBye() {
    if (!G.Server || G.Server.online !== true) return;
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(BYE_URL)) return;
    } catch (_) {}
    fetch(BYE_URL, { cache: 'no-store', keepalive: true }).catch(() => {});
  }

  function startHeartbeat() {
    if (!G.Server) return;
    G.Server.probe().then((online) => {
      if (!online || heartbeatTimer) return;
      sendHeartbeat();
      heartbeatTimer = setInterval(sendHeartbeat, 3000);
    });
  }

  function bindUI() {
    $('btn-1p').addEventListener('click', () => { Audio.unlock(); showSelect('1p'); });
    $('btn-2p').addEventListener('click', () => { Audio.unlock(); showSelect('2p'); });
    $('btn-training').addEventListener('click', () => { Audio.unlock(); showSelect('training'); });
    $('btn-net').addEventListener('click', () => { Audio.unlock(); showNet(); updateNetStats(); });

    function maybeStartNet() {
      if (!Net.isHost() || App.screen !== 'select') return;
      if (!App.selected[0] || !App.selected[1]) return;
      const seed = (Math.random() * 0x7FFFFFFF) | 0;
      const delay = Net.recommendedDelay();
      Net.start(App.selected[0], App.selected[1], seed, delay);
      Net.resetFrames();
      startNetMatch(App.selected[0], App.selected[1], seed);
      updateNetStats();
    }

    const joinNet = () => {
      const code = ($('net-code').value || '').trim().toUpperCase();
      if (!code) {
        setNetStatus('请输入房间码', true);
        return;
      }
      if (Net.join(code)) {
        showNetRoom(null);
        setNetStatus('正在加入房间…');
      }
    };

    $('btn-net-host').addEventListener('click', () => {
      Audio.unlock();
      const code = Net.newCode();
      App.netRole = 'host';
      App.netLocalIndex = 0;
      App.netRemoteChoice = null;
      if (Net.host(code)) {
        showNetRoom(null);
        setNetStatus('正在创建房间…');
      }
    });
    $('btn-net-join').addEventListener('click', joinNet);
    $('net-code').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        joinNet();
      }
    });
    $('btn-net-back').addEventListener('click', () => {
      Net.close();
      showTitle();
      Audio.ui();
    });

    Net.on('open', () => {
      if (App.screen === 'net') setNetStatus('已连接，等待对手…');
      updateNetStats();
    });
    Net.on('ready', (msg) => {
      App.netRole = msg.role;
      App.netLocalIndex = Net.localIndex;
      App.netRemoteChoice = null;
      showNetRoom(msg.room);
      setNetStatus(msg.peer ? '对手已加入，请选择角色。' : '房间已创建，等待对手加入…');
      if (App.screen === 'net') {
        // Host stays in the lobby so the room code is visible. Once the guest
        // joins, the peer event moves both sides into character select.
        if (msg.role === 'guest' || msg.peer) showSelect('net');
      } else if (App.screen === 'select') {
        App.selectStep = App.netLocalIndex;
        updateSelectUI();
      }
      updateNetStats();
    });
    Net.on('reconnected', (msg) => {
      App.netRole = msg.role;
      App.netLocalIndex = Net.localIndex;
      App.netRemoteChoice = Net.remoteChoice;
      showNetRoom(msg.room);
      toast(msg.peer ? '已重新连接' : '已重新连接，等待对手…', 2);
      if (App.screen === 'select') updateSelectUI();
      updateNetStats();
    });
    Net.on('reconnecting', (info) => {
      toast(`连接中断，正在重连（${info.attempt}）…`, 4);
      if (App.screen === 'net' || App.screen === 'select') {
        setNetStatus('连接中断，正在重连…', true);
      }
    });
    Net.on('peer', (msg) => {
      if (msg.connected) {
        App.netRemoteChoice = null;
        if (App.screen === 'select') {
          App.selected[1 - (App.netLocalIndex || 0)] = null;
          updateSelectUI();
        }
        toast(App.screen === 'fight' ? '对手已重新连接' : '对手已加入');
        if (App.screen === 'net') showSelect('net');
      } else if (msg.reconnect) {
        toast('对手连接中断，等待重连…', 5);
        if (App.screen === 'net' || App.screen === 'select') {
          setNetStatus('对手连接中断，等待重连…', true);
        }
      } else {
        setNetStatus('对手已离开', true);
      }
      updateNetStats();
    });
    Net.on('choice', () => maybeStartNet());
    Net.on('peer-choice', (msg) => {
      App.netRemoteChoice = msg.char;
      App.selected[1 - (App.netLocalIndex || 0)] = msg.char;
      if (App.screen === 'select') updateSelectUI();
      maybeStartNet();
    });
    Net.on('start', (msg) => {
      App.netLocalIndex = Net.localIndex;
      startNetMatch(msg.p1, msg.p2, msg.seed);
      updateNetStats();
    });
    Net.on('rematch', (msg) => {
      App.netLocalIndex = Net.localIndex;
      startNetMatch(msg.p1, msg.p2, msg.seed);
      updateNetStats();
    });
    Net.on('latency', updateNetStats);
    Net.on('resync-required', () => {
      toast('掉线时间过长，无法恢复，请重新建房', 4);
      Net.close();
      App.game = null;
      showNet();
      setTimeout(() => setNetStatus('掉线时间过长，无法恢复，请重新建房', true), 100);
    });
    Net.on('error', (msg) => {
      showNetRoom(null);
      setNetStatus(msg, true);
      toast(msg);
    });
    Net.on('close', () => {
      if (Net.lastError) return;
      if (App.screen === 'fight' || App.screen === 'result') {
        App.game = null;
        showNet();
      }
      setNetStatus('联机连接已断开', true);
    });
    Net.on('peer-left', () => {
      toast('对手已离开');
      App.netRemoteChoice = null;
      if (App.screen === 'select') {
        App.selected[1 - (App.netLocalIndex || 0)] = null;
        updateSelectUI();
      }
      if (App.screen === 'fight' || App.screen === 'result') {
        App.game = null;
        showNet();
      }
      setNetStatus('对手已离开', true);
    });

    const trainingAction = (fn) => (e) => {
      if (!App.game || !App.game.training) return;
      Audio.unlock();
      Audio.ui();
      fn(App.game);
      e.currentTarget.blur();
    };
    $('btn-training-reset').addEventListener('click', trainingAction((game) => game.resetTraining()));
    $('btn-training-guard').addEventListener('click', trainingAction((game) => game.toggleDummyGuard()));
    $('btn-help').addEventListener('click', showHelp);
    $('btn-keys').addEventListener('click', () => { Audio.unlock(); showKeySettings(); });
    $('btn-keys-reset').addEventListener('click', () => {
      resetKeyBindings();
      keyBindTarget = null;
      renderKeySettings();
      setKeysStatus('已恢复默认按键。');
      Audio.confirm();
    });
    $('btn-keys-back').addEventListener('click', () => {
      keyBindTarget = null;
      showTitle();
      Audio.ui();
    });
    ['btn-touch-settings', 'btn-touch-settings-title'].forEach((id) => {
      const btn = $(id);
      if (btn) btn.addEventListener('click', () => {
        Audio.unlock();
        setTouchEditor(true);
      });
    });
    $('btn-mute').addEventListener('click', toggleMute);
    $('btn-pause-mute').addEventListener('click', toggleMute);
    $('btn-fullscreen').addEventListener('click', toggleFullscreen);
    $('btn-pause-fullscreen').addEventListener('click', toggleFullscreen);
    if (!canUseFullscreen()) {
      const fullscreenBtn = $('btn-fullscreen');
      fullscreenBtn.classList.add('hidden');
      // Drop the separator that belongs to the hidden title-screen button.
      const separator = fullscreenBtn.previousElementSibling;
      if (separator && separator.classList.contains('dot')) separator.classList.add('hidden');
      $('btn-pause-fullscreen').classList.add('hidden');
    }

    document.querySelectorAll('.diff-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        App.difficulty = chip.dataset.diff;
        document.querySelectorAll('.diff-chip').forEach((c) => c.classList.toggle('active', c.dataset.diff === App.difficulty));
        $('ai-custom-panel').classList.toggle('hidden', App.difficulty !== 'custom');
        safeStorage('jojo-diff', App.difficulty);
        Audio.ui();
      });
    });

    $('btn-random').addEventListener('click', randomPick);
    $('btn-select-back').addEventListener('click', selectBack);
    $('btn-help-close').addEventListener('click', closeHelp);
    $('btn-help-back').addEventListener('click', closeHelp);

    $('btn-resume').addEventListener('click', () => togglePause(false));
    $('btn-restart').addEventListener('click', () => {
      if (!App.game) return;
      const p1 = App.game.p1Id;
      const p2 = App.game.p2Id;
      closePause(true);
      startMatch(p1, p2);
    });
    $('btn-quit').addEventListener('click', quitToSelect);

    $('btn-rematch').addEventListener('click', rematch);
    $('btn-result-select').addEventListener('click', quitToSelect);

    document.addEventListener('pointerdown', (e) => {
      Audio.unlock();
      // Some tablets report a fine primary pointer but still get touched.
      if (e.pointerType === 'touch') enableTouchMode();
    }, true);

    bindTouchControls();
    bindTouchStick();
    bindTouchLayoutEditor();
    applyTouchLayout();
    if (hasCoarsePointer()) enableTouchMode();

    // Reapply the saved layout whenever the fight shows the touch controls.
    if (window.MutationObserver) {
      new MutationObserver(() => {
        if (!dom.touch.classList.contains('hidden')) {
          applyTouchLayout();
          clampTouchLayoutToViewport();
        }
      }).observe(dom.touch, { attributes: true, attributeFilter: ['class'] });
    }

    const relayoutTouch = () => {
      applyTouchLayout();
      clampTouchLayoutToViewport();
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp, { passive: false });
    window.addEventListener('blur', () => {
      Input.clear();
      resetTouchStick();
    });
    window.addEventListener('resize', () => {
      fitFrame();
      relayoutTouch();
    });
    window.addEventListener('orientationchange', () => setTimeout(() => {
      fitFrame();
      relayoutTouch();
    }, 200));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        fitFrame();
        relayoutTouch();
      });
    }
    document.addEventListener('fullscreenchange', () => {
      fitFrame();
      // Fullscreen dimensions settle a frame or two after the event.
      setTimeout(() => {
        fitFrame();
        relayoutTouch();
      }, 150);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        Input.clear();
        resetTouchStick();
        Audio.suspend();
        sendBye();
      } else {
        last = performance.now();
        acc = 0;
        Audio.resume();
        sendHeartbeat();
        if (Net.usingRemote) Net.retryNow();
      }
    });
    window.addEventListener('online', () => {
      if (Net.usingRemote) Net.retryNow();
    });
    window.addEventListener('offline', () => {
      if (Net.usingRemote) toast('网络已断开，等待恢复…', 3);
    });
    window.addEventListener('pagehide', () => {
      Net.close();
      Audio.suspend();
      sendBye();
    });

    syncMuteLabels();
    document.querySelectorAll('.diff-chip').forEach((c) => c.classList.toggle('active', c.dataset.diff === App.difficulty));
    bindAiCustom();
    $('ai-custom-panel').classList.toggle('hidden', App.difficulty !== 'custom');
  }

  /* =========================================================
     Boot / loop
     ========================================================= */
  function setupCanvas() {
    G.DPR = Math.min(1.25, window.devicePixelRatio || 1);
    canvas.width = Math.floor(W * G.DPR);
    canvas.height = Math.floor(H * G.DPR);
    ctx.setTransform(G.DPR, 0, 0, G.DPR, 0, 0);
    fitFrame();
  }

  let last = performance.now();
  let lastRender = 0;
  const MIN_RENDER_MS = 1000 / 100 - 0.5;
  let acc = 0;

  function stepNetMatch(elapsed) {
    if (!App.game) return;
    Net.advance(elapsed, (step, inputs) => App.game.update(step, inputs),
      () => App.screen === 'fight');
  }

  function loop(now) {
    const elapsed = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.05, elapsed);
    last = now;
    if (document.hidden) {
      acc = 0;
      requestAnimationFrame(loop);
      return;
    }
    App.elapsed += dt;

    if (App.mode === 'net' && App.game && !App.paused) {
      if (App.screen === 'fight') stepNetMatch(elapsed);
      acc = 0;
    } else if (App.screen === 'fight' && App.game && !App.paused) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 4) {
        const wasFrozen = App.game.hitstop > 0;
        App.game.update(STEP);
        // Keep attack presses alive through the whole hitstop, including the frame it ends.
        if (!wasFrozen) Input.pressed.clear();
        acc -= STEP;
        steps += 1;
      }
      if (steps >= 4) acc = 0;
    } else if (App.screen === 'result' && App.game) {
      App.game.update(STEP);
      Input.pressed.clear();
      acc = 0;
    } else {
      acc = 0;
    }

    if (lastRender === 0 || now - lastRender >= MIN_RENDER_MS) {
      lastRender = now;
      render(App.elapsed);
    }
    requestAnimationFrame(loop);
  }

  function boot() {
    setupCanvas();
    buildRoster();
    bindUI();
    startHeartbeat();
    Audio.setMuted(App.muted);
    setScreen('title');
    dom.hud.classList.remove('show');
    dom.pause.classList.add('hidden');
    dom.result.classList.add('hidden');
    hideTouch();
    // mark title menu visible after boot
    requestAnimationFrame(() => {
      dom.title.classList.remove('hidden');
    });
    requestAnimationFrame(loop);
  }

  window.__JOJO_DEBUG__ = { App, Input, Match, Fighter, JG };
  boot();
})(window.JG.Game);
