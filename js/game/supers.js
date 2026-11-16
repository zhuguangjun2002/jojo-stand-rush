/* =========================================================
   JOJO 奇妙格斗 · STAND RUSH — super & finisher cinematics
   Prototype mixin for Match: pure drawing, no combat rules.
   Kept apart because these overlays change with the art, not the fight.
   ========================================================= */
(function (G) {
  'use strict';
  const { Art, GROUND, H, W, clamp, easeOut, lerp } = G;

  // User-provided character plates for the finisher cinematic. They are
  // optional: if a file is missing the quote overlay still works.
  const FINISHER_IMAGES = {
    jotaro: 'assets/finishers/jotaro.jpg',
    dio: 'assets/finishers/dio.png',
    giorno: 'assets/finishers/giorno.jpg',
    kakyoin: 'assets/finishers/kakyoin.jpg',
    tooru: 'assets/finishers/tooru.png',
    josuke: 'assets/finishers/josuke.jpg'
  };
  // Where the face sits inside each plate, so tall images do not show only a
  // chest when they are cropped to 16:9.
  const FINISHER_FOCUS = {
    jotaro: { x: 0.5, y: 0.26 },
    dio: { x: 0.5, y: 0.42 },
    giorno: { x: 0.5, y: 0.4 },
    kakyoin: { x: 0.5, y: 0.38 },
    tooru: { x: 0.5, y: 0.32 },
    josuke: { x: 0.5, y: 0.52 }
  };
  const finisherImages = {};
  if (typeof Image !== 'undefined') {
    for (const id of Object.keys(FINISHER_IMAGES)) {
      const img = new Image();
      img.decoding = 'async';
      img.src = FINISHER_IMAGES[id];
      finisherImages[id] = img;
    }
  }

  function rgba(hex, alpha) {
    const h = String(hex || '#ffffff').replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16) || 0xffffff;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  Object.assign(G.Match.prototype, {
    drawFinisher(ctx) {
      const f = this.finisher;
      if (!f) return;
      const fadeIn = clamp(f.time / 0.28, 0, 1);
      const fadeOut = clamp((f.duration - f.time) / 0.5, 0, 1);
      const alpha = Math.min(fadeIn, fadeOut);
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;

      // Character plate: slow push-in, accent duotone, then a dark veil so the
      // quote underneath stays readable.
      const plate = finisherImages[f.charId];
      if (plate && plate.complete && plate.naturalWidth) {
        const zoom = 1.045 + 0.055 * clamp(f.time / f.duration, 0, 1);
        const iw = plate.naturalWidth;
        const ih = plate.naturalHeight;
        const cover = Math.max(W / iw, (H - 20) / ih) * zoom;
        const dw = iw * cover;
        const dh = ih * cover;
        const focus = FINISHER_FOCUS[f.charId] || { x: 0.5, y: 0.5 };
        const dx = (W - dw) * focus.x + Math.sin(f.time * 1.6) * 5;
        const dy = (H - dh) * focus.y - 14 + Math.cos(f.time * 1.3) * 3;
        ctx.save();
        ctx.globalAlpha = alpha * 0.86;
        ctx.drawImage(plate, dx, dy, dw, dh);
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = alpha * 0.22;
        ctx.fillStyle = f.accent;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        ctx.fillStyle = 'rgba(4,3,9,.32)';
        ctx.fillRect(0, 0, W, H);
        const vignette = ctx.createRadialGradient(W / 2, H / 2, 170, W / 2, H / 2, 760);
        vignette.addColorStop(0, 'rgba(4,3,9,0)');
        vignette.addColorStop(1, 'rgba(4,3,9,.58)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, W, H);
      } else if (f.charId === 'tooru') {
        // Procedural fallback when assets/finishers/tooru.png is absent:
        // a tight, red-lit Wonder of U face instead of an empty frame.
        ctx.fillStyle = '#060408';
        ctx.fillRect(0, 0, W, H);
        const g = ctx.createRadialGradient(W / 2, H * 0.42, 25, W / 2, H * 0.42, 470);
        g.addColorStop(0, 'rgba(170, 18, 38, .45)');
        g.addColorStop(.55, 'rgba(50, 5, 16, .25)');
        g.addColorStop(1, 'rgba(4,3,9,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        const cx = W / 2;
        const cy = H * 0.43;
        // coat shoulders
        ctx.fillStyle = '#121016';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 300, 360, 210, 0, Math.PI, 0);
        ctx.fill();
        // face
        ctx.fillStyle = '#d7c49e';
        ctx.strokeStyle = '#1b130c';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 50, 150, 205, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // eye band / grille
        ctx.fillStyle = '#2e241d';
        ctx.beginPath();
        ctx.ellipse(cx + 12, cy + 5, 126, 76, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#6f5b41';
        ctx.lineWidth = 3;
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + i * 26, cy - 60);
          ctx.lineTo(cx + i * 26, cy + 68);
          ctx.stroke();
        }
        // glowing eyes
        for (const ex of [cx - 62, cx + 76]) {
          const eg = ctx.createRadialGradient(ex, cy - 12, 2, ex, cy - 12, 75);
          eg.addColorStop(0, 'rgba(255,255,255,.98)');
          eg.addColorStop(.22, 'rgba(255,70,90,.9)');
          eg.addColorStop(1, 'rgba(255,20,45,0)');
          ctx.fillStyle = eg;
          ctx.beginPath();
          ctx.arc(ex, cy - 12, 75, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff8f2';
          ctx.beginPath();
          ctx.arc(ex, cy - 12, 16, 0, Math.PI * 2);
          ctx.fill();
        }
        // fedora
        ctx.fillStyle = '#07060a';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 178, 300, 52, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 190, cy - 200);
        ctx.quadraticCurveTo(cx - 170, cy - 360, cx - 40, cy - 390);
        ctx.lineTo(cx + 170, cy - 390);
        ctx.quadraticCurveTo(cx + 230, cy - 310, cx + 200, cy - 195);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#d6b45a';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(cx - 180, cy - 230);
        ctx.quadraticCurveTo(cx, cy - 215, cx + 190, cy - 235);
        ctx.stroke();
        // dark vignette
        const vg = ctx.createRadialGradient(cx, cy, 170, cx, cy, 700);
        vg.addColorStop(0, 'rgba(4,3,9,0)');
        vg.addColorStop(1, 'rgba(4,3,9,.72)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
      }

      // cinematic letterbox
      const top = ctx.createLinearGradient(0, 0, 0, 76);
      top.addColorStop(0, 'rgba(4,3,9,.92)');
      top.addColorStop(1, 'rgba(4,3,9,0)');
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, W, 76);
      const bottom = ctx.createLinearGradient(0, H - 180, 0, H);
      bottom.addColorStop(0, 'rgba(4,3,9,0)');
      bottom.addColorStop(.55, 'rgba(4,3,9,.88)');
      bottom.addColorStop(1, 'rgba(4,3,9,.96)');
      ctx.fillStyle = bottom;
      ctx.fillRect(0, H - 180, W, 180);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      // accent rule
      ctx.strokeStyle = f.accent;
      ctx.globalAlpha = alpha * 0.9;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 230, H - 116);
      ctx.lineTo(W / 2 + 230, H - 116);
      ctx.stroke();
      // character name
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.accent;
      ctx.font = '700 15px "Noto Serif SC", "Microsoft YaHei", serif';
      ctx.fillText(f.name, W / 2, H - 88);
      // finisher quote
      ctx.fillStyle = '#fff3d6';
      ctx.shadowColor = 'rgba(0,0,0,.8)';
      ctx.shadowBlur = 10;
      ctx.font = '700 28px "Noto Serif SC", "Microsoft YaHei", serif';
      ctx.fillText('“' + f.quote + '”', W / 2, H - 42);
      ctx.restore();
    },

    drawRequiemVines(ctx, s) {
      const opp = s.opp;
      const p = clamp((s.time - 0.2) / 1.4, 0, 1);
      const rnd = Art.seeded(s.seed || 4);
      ctx.save();
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 12; i++) {
        const baseX = opp.x - 110 + i * 20;
        const h = (90 + rnd() * 170) * easeOut(p);
        const sway = Math.sin(s.time * 4 + i) * 20;
        ctx.strokeStyle = i % 3 === 0 ? '#ffe06a' : '#82ffa2';
        ctx.lineWidth = 3 + rnd() * 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(baseX, GROUND);
        ctx.bezierCurveTo(baseX - 40, GROUND - h * 0.4, baseX + sway, GROUND - h * 0.7, baseX + sway * 1.4, GROUND - h);
        ctx.stroke();
      }
      ctx.restore();
    },

    drawRequiemForeground(ctx, s, t) {
      const opp = s.opp;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(opp.x, opp.y - 120, 10, opp.x, opp.y - 120, 260);
      g.addColorStop(0, 'rgba(255,224,106,.28)');
      g.addColorStop(1, 'rgba(255,224,106,0)');
      ctx.fillStyle = g;
      ctx.fillRect(opp.x - 300, opp.y - 400, 600, 500);
      for (let i = 0; i < 10; i++) {
        const a = t * 0.7 + i * 0.63;
        const rr = 70 + i * 18 + Math.sin(t * 2 + i) * 10;
        Art.circle(ctx, opp.x + Math.cos(a) * rr, opp.y - 130 + Math.sin(a) * rr * 0.55, 2.5, '#fff3b0');
      }
      ctx.restore();
      Art.drawMangaText(ctx, '帰零', 640, 160, 72, 'rgba(255,235,160,.18)', -0.08, 1, 'rgba(0,0,0,.1)');
    },

    drawTruthForeground(ctx, s, t) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = 'rgba(255,224,106,.32)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const r = 70 + i * 48 + Math.sin(t * 1.6 + i) * 8;
        ctx.beginPath();
        ctx.arc(640, 355, r, -0.6 + t * 0.18 + i * 0.2, 2.1 + t * 0.18 + i * 0.2);
        ctx.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const a = t * 0.8 + i * Math.PI / 4;
        const rr = 150 + (i % 3) * 62;
        const x = 640 + Math.cos(a) * rr;
        const y = 355 + Math.sin(a) * rr * 0.42;
        Art.starPath(ctx, x, y, 4.5, 1.6, 4);
        ctx.fillStyle = i % 2 ? 'rgba(255,245,196,.8)' : 'rgba(255,206,76,.7)';
        ctx.fill();
      }
      ctx.restore();
      if (s.truthHit) {
        Art.drawMangaText(ctx, '无 法 到 达 的 真 实', 640, 432, 44, '#fff2b0', -0.035, 1);
        Art.drawMangaText(ctx, 'NEVER REACH THE TRUTH', 640, 480, 13, '#ffe06a', 0, 0.9, 'rgba(0,0,0,.75)');
        Art.drawMangaText(ctx, '∞', 640, 565, 58, 'rgba(255,235,160,.38)', 0.04, 1, 'rgba(0,0,0,.08)');
      } else {
        Art.drawMangaText(ctx, '归 零', 640, 435, 38, 'rgba(255,241,180,.42)', -0.04, 1, 'rgba(0,0,0,.15)');
      }
    },

    drawEmeraldSuper(ctx, s, t) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const opp = s.opp;
      const rnd = Art.seeded(s.seed || 9);
      for (let i = 0; i < 22; i++) {
        const a = rnd() * Art.TAU;
        const dist = 300 + rnd() * 300;
        const x1 = opp.x + Math.cos(a) * dist;
        const y1 = opp.y - 120 + Math.sin(a) * dist;
        const prog = clamp((s.time * 1.7 + rnd()) % 1, 0, 1);
        const x2 = lerp(x1, opp.x, prog);
        const y2 = lerp(y1, opp.y - 120, prog);
        ctx.strokeStyle = `rgba(94,255,184,${0.12 + prog * 0.3})`;
        ctx.lineWidth = 1 + prog * 3;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (prog > 0.8) Art.circle(ctx, x2, y2, 3, '#d8fff0');
      }
      ctx.restore();
      Art.drawMangaText(ctx, '20m', 1060, 165, 80, 'rgba(100,255,188,.17)', 0.08, 1, 'rgba(0,0,0,.1)');
    },

    drawSuperForeground(ctx, t, s) {
      if (s.type === 'gobeyondshot') {
        const b = s.bubble;
        if (b) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const bubbleFade = s.exploded
            ? clamp(1 - (s.time - s.explodeTime) / 0.3, 0.15, 1)
            : 1;
          ctx.globalAlpha = bubbleFade;
          for (let i = 1; i <= 5; i++) {
            const tx = b.x - b.vx * 0.018 * i;
            const tr = b.r * (0.8 - i * 0.1);
            const g = ctx.createRadialGradient(tx, b.y, 1, tx, b.y, tr);
            g.addColorStop(0, `rgba(255,255,255,${0.22 * (1 - i / 6)})`);
            g.addColorStop(1, 'rgba(143,232,255,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(tx, b.y, tr, 0, Art.TAU);
            ctx.fill();
          }
          const g = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.35, 2, b.x, b.y, b.r);
          g.addColorStop(0, 'rgba(255,255,255,.98)');
          g.addColorStop(0.34, 'rgba(220,250,255,.82)');
          g.addColorStop(0.78, 'rgba(143,232,255,.25)');
          g.addColorStop(1, 'rgba(143,232,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Art.TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.9)';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Art.TAU);
          ctx.stroke();
          ctx.restore();
        }
        if (s.pierced) {
          const p = clamp((s.time - s.pierceTime) / 0.5, 0, 1);
          const a = 1 - p;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a * 0.85;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(s.opp.x - 120, s.opp.y - 145);
          ctx.lineTo(s.opp.x + 160, s.opp.y - 145);
          ctx.stroke();
          Art.drawRing(ctx, s.opp.x, s.opp.y - 140, 30 + p * 80, '#eaf8ff', a * 0.8, 3);
          ctx.restore();
        }
        if (s.exploded) {
          const e = clamp((s.time - s.explodeTime) / 0.7, 0, 1);
          const fade = 1 - e;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 4; i++) {
            Art.drawRing(ctx, s.opp.x, s.opp.y - 130, 40 + e * (130 + i * 45),
              i % 2 ? '#eaf8ff' : s.color, fade * (0.55 - i * 0.1), 3);
          }
          for (let i = 0; i < 16; i++) {
            const a2 = i / 16 * Art.TAU + 0.2;
            const dist = 20 + e * 170;
            const x = s.opp.x + Math.cos(a2) * dist;
            const y = s.opp.y - 130 + Math.sin(a2) * dist * 0.8;
            ctx.globalAlpha = fade * 0.8;
            ctx.fillStyle = i % 2 ? '#ffffff' : '#bdefff';
            ctx.beginPath();
            ctx.arc(x, y, 3 + (i % 3), 0, Art.TAU);
            ctx.fill();
          }
          ctx.restore();
        }
      }
      if (s.type === 'timestop') {
        // impact pulses around the victim
        for (let i = 0; i < 3; i++) {
          const rr = 40 + ((s.time * 180 + i * 90) % 220);
          Art.drawRing(ctx, s.opp.x, s.opp.y - 120, rr, s.color, 0.22, 2);
        }
      }
      if (s.type === 'roadroller') {
        const p = clamp((s.time - 0.3) / 0.85, 0, 1);
        const drop = 1 - Math.pow(1 - p, 3);
        const bottom = s.opp.y + 12;
        const y = s.opp.y - 500 + drop * 500;
        Art.drawRoadRoller(ctx, s.opp.x, y, 1.05, 1);
        if (p >= 1) {
          for (let i = 0; i < 3; i++) {
            Art.drawRing(ctx, s.opp.x, bottom - i * 24, 90 + i * 48, s.color, 0.24 - i * 0.05, 2);
          }
        }
      }
      if (s.knifeFlash) {
        for (const k of s.knifeFlash) {
          const p = k.t / k.max;
          const x = lerp(k.x, k.tx, p);
          const y = lerp(k.y, k.ty, p);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(k.rot);
          ctx.globalAlpha = 0.7;
          ctx.strokeStyle = '#fff0b8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-38, 0);
          ctx.lineTo(10, 0);
          ctx.stroke();
          ctx.fillStyle = '#e9edf8';
          ctx.beginPath();
          ctx.moveTo(0, -2);
          ctx.lineTo(20, 0);
          ctx.lineTo(0, 2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    },

    /* =========================================================
       Victory / defeat tableau
       ========================================================= */
    outroInfo() {
      const phase = this.phase;
      if (phase !== 'ko' && phase !== 'roundEnd' && phase !== 'matchEnd' && phase !== 'timeup') return null;
      const winnerIndex = this.outroWinner;
      if (winnerIndex == null || winnerIndex < 0) return null;
      const winner = this.fighters[winnerIndex];
      const loser = this.fighters[1 - winnerIndex];
      if (!winner || !loser) return null;
      return { phase, winner, loser, winnerIndex, time: this.outroTime || 0 };
    },

    drawFighterOutro(ctx, f, t) {
      const o = this.outroInfo();
      if (!o || o.loser !== f || f.state !== 'ko') {
        Art.drawFighter(ctx, f, t);
        return;
      }

      // Jotaro: a clean two-piece split. The normal fighter is clipped in
      // half and the halves slide apart; no blood, only a bright seam.
      if (f.charId === 'jotaro') {
        const p = clamp((o.time - 0.12) / 0.95, 0, 1);
        const spread = 5 + 30 * easeOut(p);
        ctx.save();
        ctx.translate(f.x, GROUND + 2);
        ctx.scale(1, 0.22);
        const sg = ctx.createRadialGradient(0, 0, 2, 0, 0, 82);
        sg.addColorStop(0, 'rgba(0,0,0,.48)');
        sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(0, 0, 82, 0, Art.TAU);
        ctx.fill();
        ctx.restore();
        for (const dir of [-1, 1]) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(dir < 0 ? f.x - 190 : f.x, f.y - 340, 190, 370);
          ctx.clip();
          ctx.translate(dir * spread, dir * 2.5 * p);
          Art.drawFighter(ctx, f, t, { noShadow: true });
          ctx.restore();
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 + 0.35 * (1 - p);
        ctx.strokeStyle = 'rgba(190,238,255,.95)';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(f.x - 2, f.y - 250);
        ctx.lineTo(f.x + 2, f.y + 2);
        ctx.stroke();
        ctx.restore();
        return;
      }

      // DIO: fade the body while the shards fly out (drawn in drawDeathFx).
      if (f.charId === 'dio') {
        const p = clamp((o.time - 0.18) / 1.1, 0, 1);
        Art.drawFighter(ctx, f, t, { alpha: clamp(1 - p * 1.35, 0.05, 1) });
        return;
      }

      Art.drawFighter(ctx, f, t);
    },

    drawOutroFx(ctx, t) {
      const o = this.outroInfo();
      if (!o) return;
      const ot = o.time;
      this.drawVictoryFx(ctx, o.winner, o.loser, t, ot);
      if (o.loser.state === 'ko' || o.loser.hp <= 0) this.drawDeathFx(ctx, o.loser, t, ot);
    },

    drawVictoryFx(ctx, f, loser, t, ot) {
      if (!f) return;
      const aura = clamp((ot - 0.35) / 0.8, 0, 1);
      if (aura <= 0) return;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(f.x, f.y - 120, 8, f.x, f.y - 120, 170);
      g.addColorStop(0, rgba(f.data.accent, 0.2 * aura));
      g.addColorStop(1, rgba(f.data.accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(f.x - 220, f.y - 360, 440, 460);
      ctx.restore();

      if (f.charId === 'jotaro') {
        const tw = 0.5 + 0.5 * Math.sin(t * 7);
        const hx = f.x + f.facing * 16;
        const hy = f.y - 208;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = aura * (0.55 + tw * 0.45);
        Art.starPath(ctx, hx, hy, 7 + tw * 4, 2.3, 4);
        ctx.fillStyle = '#eaf9ff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,220,255,.8)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(hx - 18, hy + 9);
        ctx.lineTo(hx + 18, hy + 9);
        ctx.stroke();
        ctx.restore();
        Art.drawMangaText(ctx, 'YARE YARE', f.x, f.y - 285, 15,
          'rgba(190,238,255,.5)', -0.03, aura * 0.8, 'rgba(0,0,0,.35)');
        return;
      }

      if (f.charId === 'dio') {
        const shake = Math.sin(t * 17) * 3;
        ctx.save();
        ctx.globalAlpha = aura;
        Art.drawMangaText(ctx, 'WRYYYY', f.x + shake, f.y - 292, 36, '#ffd447',
          -0.07, 1, 'rgba(0,0,0,.55)');
        ctx.strokeStyle = 'rgba(255,212,71,.55)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const r = 44 + i * 17;
          ctx.beginPath();
          ctx.arc(f.x, f.y - 190, r, -1.22 + Math.sin(t * 2) * 0.05, -0.34);
          ctx.stroke();
        }
        ctx.restore();
        return;
      }

      if (f.charId === 'giorno') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = aura;
        for (let i = 0; i < 9; i++) {
          const a = t * 1.2 + i * 0.78;
          const r = 34 + ((i * 37) % 48);
          Art.starPath(ctx, f.x + Math.cos(a) * r, f.y - 136 + Math.sin(a) * r * 0.7,
            4.2, 1.6, 4);
          ctx.fillStyle = i % 2 ? '#fff3b0' : '#ffd447';
          ctx.fill();
        }
        ctx.restore();
        Art.drawMangaText(ctx, '我乔鲁诺', f.x, f.y - 285, 16,
          'rgba(255,224,106,.5)', -0.03, aura * 0.75, 'rgba(0,0,0,.35)');
        return;
      }

      if (f.charId === 'josuke') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = aura;
        for (let i = 0; i < 8; i++) {
          const a = t * 1.3 + i * 0.78;
          const r = 38 + ((i * 29) % 48);
          const bx = f.x + Math.cos(a) * r;
          const by = f.y - 142 + Math.sin(a) * r * 0.72;
          const br = 5 + (i % 3);
          const bg = ctx.createRadialGradient(bx - 1, by - 1, 0, bx, by, br);
          bg.addColorStop(0, 'rgba(255,255,255,.95)');
          bg.addColorStop(0.6, 'rgba(143,232,255,.55)');
          bg.addColorStop(1, 'rgba(143,232,255,0)');
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Art.TAU);
          ctx.fill();
        }
        ctx.restore();
        Art.drawMangaText(ctx, f.goBeyond ? 'GO BEYOND' : 'SOFT & WET',
          f.x, f.y - 285, 18, 'rgba(143,232,255,.7)', -0.03, aura * 0.85, 'rgba(0,0,0,.35)');
        return;
      }

      // Kakyoin: pointing taunt + emerald line toward the loser.
      const targetX = loser ? loser.x : f.x + f.facing * 240;
      const hy = f.y - 150;
      ctx.save();
      ctx.globalAlpha = aura * 0.8;
      ctx.strokeStyle = 'rgba(102,242,178,.65)';
      ctx.lineWidth = 2;
      ctx.setLineDash([9, 9]);
      ctx.lineDashOffset = -t * 42;
      ctx.beginPath();
      ctx.moveTo(f.x + f.facing * 66, hy);
      ctx.lineTo(targetX, hy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        Art.starPath(ctx, f.x + f.facing * (72 + i * 34),
          hy + Math.sin(t * 4 + i) * 6, 3.4, 1.3, 4);
        ctx.fillStyle = '#b6ffcf';
        ctx.fill();
      }
      ctx.restore();
      Art.drawMangaText(ctx, 'そこだ', f.x + f.facing * 76, f.y - 238, 20,
        'rgba(102,242,178,.6)', 0.03, aura * 0.85, 'rgba(0,0,0,.4)');
    },

    drawDeathFx(ctx, f, t, ot) {
      if (!f) return;

      // DIO: break into clean, non-gory polygonal pieces.
      if (f.charId === 'dio') {
        const p = clamp((ot - 0.22) / 1.4, 0, 1);
        if (p <= 0) return;
        const rnd = Art.seeded((f.seed || 0) + 17);
        const fade = clamp(1 - Math.max(0, p - 0.62) / 0.38, 0, 1);
        ctx.save();
        for (let i = 0; i < 24; i++) {
          const a = rnd() * Art.TAU;
          const dist = 18 + rnd() * 190 * easeOut(p);
          const x = f.x + Math.cos(a) * dist;
          const y = f.y - 110 + Math.sin(a) * dist * 0.82 - 48 * p;
          const rot = rnd() * Art.TAU + p * (rnd() - 0.5) * 11;
          const s = 5 + rnd() * 16;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rot);
          ctx.globalAlpha = fade * (0.55 + rnd() * 0.45);
          ctx.fillStyle = i % 3 === 0 ? '#ffd447' : i % 3 === 1 ? '#fff3c4' : '#b98a18';
          ctx.beginPath();
          ctx.moveTo(-s, -s * 0.6);
          ctx.lineTo(s * 0.8, -s);
          ctx.lineTo(s, s * 0.5);
          ctx.lineTo(-s * 0.4, s);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(40,20,10,.55)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
        Art.drawMangaText(ctx, 'ド ド ド', f.x, f.y - 252, 30,
          'rgba(255,212,71,.5)', -0.06, fade);
        return;
      }

      // Kakyoin: a clean, bloodless chest void with emerald residue.
      if (f.charId === 'kakyoin') {
        const q = clamp(ot / 0.65, 0, 1);
        ctx.save();
        ctx.translate(f.x - 6, f.y - 8);
        ctx.rotate(-1.32 * (f.koP || 0));
        ctx.beginPath();
        ctx.ellipse(0, -152, 15, 18, 0, 0, Art.TAU);
        ctx.fillStyle = 'rgba(8,10,14,.92)';
        ctx.fill();
        ctx.strokeStyle = '#66f2b2';
        ctx.lineWidth = 4 * q;
        ctx.stroke();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(190,255,222,.8)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) {
          const a = i * 1.05 + t * 1.6;
          const r = 24 + 16 * Math.sin(t * 3 + i);
          Art.starPath(ctx, Math.cos(a) * r, -152 + Math.sin(a) * r * 0.7,
            3.4, 1.3, 4);
          ctx.fillStyle = '#8dffc0';
          ctx.fill();
        }
        ctx.restore();
        return;
      }

      // Giorno: collapse into a bed of golden motes.
      if (f.charId === 'giorno') {
        const q = clamp(ot / 1.1, 0, 1);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 * (1 - q * 0.35);
        Art.drawRing(ctx, f.x, GROUND + 4, 54 + 44 * q, '#ffd447', 0.3, 2);
        for (let i = 0; i < 8; i++) {
          const a = i * 0.9 + t * 0.6;
          Art.starPath(ctx, f.x + Math.cos(a) * (38 + 22 * q),
            GROUND - 8 - Math.sin(a * 1.3) * 20 * q, 3 + (i % 2), 1.2, 4);
          ctx.fillStyle = i % 2 ? '#fff3b0' : '#ffd447';
          ctx.fill();
        }
        ctx.restore();
        return;
      }

      // Jotaro: cold sparks along the seam.
      if (f.charId === 'jotaro') {
        const p = clamp((ot - 0.15) / 0.9, 0, 1);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - p) * 0.6;
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI / 2 + (i - 3) * 0.28;
          const r = 20 + p * 90;
          Art.starPath(ctx, f.x + Math.cos(a) * r, f.y - 130 + Math.sin(a) * r,
            4, 1.6, 4);
          ctx.fillStyle = i % 2 ? '#c8f4ff' : '#ffffff';
          ctx.fill();
        }
        ctx.restore();
      }
    }
  });
})(window.JG.Game);
