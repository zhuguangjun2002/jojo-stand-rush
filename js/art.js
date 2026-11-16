/* =========================================================
   Canvas art: stages, fighters, stands, portraits, FX
   ========================================================= */
(function () {
  'use strict';
  const JG = (window.JG = window.JG || {});
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const STAGE_W = 2800;

  function tint(hex, amount) {
    if (typeof hex !== 'string' || hex[0] !== '#') return hex;
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    const r = clamp((n >> 16) + amount, 0, 255);
    const g = clamp(((n >> 8) & 255) + amount, 0, 255);
    const b = clamp((n & 255) + amount, 0, 255);
    return `rgb(${r},${g},${b})`;
  }
  const STAGE_PAD_Y = 200;
  const STAGE_TOP = { morioh: '#160f2e', cairo: '#1a1332', rome: '#0b1029' };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  const easeIn = (k) => Math.pow(clamp(k, 0, 1), 2);
  const easeInOut = (k) => {
    k = clamp(k, 0, 1);
    return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  };

  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function starPath(ctx, x, y, outer, inner, points) {
    points = points || 5;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / points;
      const r = i % 2 === 0 ? outer : inner;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBone(ctx, ax, ay, bx, by, width, color, outline, ow) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = width + (ow == null ? 7 : ow);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  function circle(ctx, x, y, r, fill, stroke, sw) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = sw || 2;
      ctx.stroke();
    }
  }

  function poly(ctx, pts, fill, stroke, sw) {
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = sw || 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  function solveIK(hx, hy, fx, fy, l1, l2, bend) {
    let dx = fx - hx;
    let dy = fy - hy;
    let d = Math.hypot(dx, dy);
    const max = l1 + l2 - 0.01;
    if (d > max) {
      dx *= max / d;
      dy *= max / d;
      d = max;
    }
    if (d < 0.01) d = 0.01;
    const a = Math.atan2(dy, dx);
    const cosA = clamp((d * d + l1 * l1 - l2 * l2) / (2 * d * l1), -1, 1);
    const off = Math.acos(cosA);
    const kneeA = a + bend * off;
    return {
      x: hx + Math.cos(kneeA) * l1,
      y: hy + Math.sin(kneeA) * l1,
      fx: hx + dx,
      fy: hy + dy
    };
  }

  function joint(origin, length, angleDeg) {
    const a = angleDeg * DEG;
    return {
      x: origin.x + Math.sin(a) * length,
      y: origin.y + Math.cos(a) * length
    };
  }

  function drawHeart(ctx, x, y, s, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.82);
    ctx.bezierCurveTo(x - s * 1.45, y - s * 0.15, x - s * 0.72, y - s * 1.02, x, y - s * 0.32);
    ctx.bezierCurveTo(x + s * 0.72, y - s * 1.02, x + s * 1.45, y - s * 0.15, x, y + s * 0.82);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /* =========================================================
     Stage data
     ========================================================= */
  const stageCache = {};

  function buildStage(id) {
    const r = seeded(id === 'morioh' ? 917 : id === 'cairo' ? 431 : 772);
    const stars = [];
    for (let i = 0; i < 105; i++) {
      stars.push({ x: r() * STAGE_W, y: r() * 350, s: r() * 1.7 + 0.35, p: r() * TAU, sp: r() * 1.5 + 0.4 });
    }
    const petals = [];
    for (let i = 0; i < 58; i++) {
      petals.push({ x: r() * STAGE_W, y: r() * 500, s: r() * 3.2 + 1.2, sp: r() * 18 + 8, p: r() * TAU, sw: r() * 22 + 8 });
    }
    const houses = [];
    for (let i = 0; i < 34; i++) {
      houses.push({ x: i * 64 - 40 + r() * 20, w: r() * 46 + 28, h: r() * 95 + 40, win: r() > 0.3 });
    }
    const dust = [];
    for (let i = 0; i < 78; i++) {
      dust.push({ x: r() * STAGE_W, y: 250 + r() * 360, s: r() * 1.8 + 0.4, sp: r() * 12 + 4, p: r() * TAU });
    }
    const arches = [];
    for (let i = 0; i < 16; i++) arches.push({ x: 30 + i * 132, w: 92, h: 140 + (i % 3) * 22, gap: 26 });
    const cracks = [];
    for (let i = 0; i < 46; i++) {
      cracks.push({ x: r() * STAGE_W, y: 600 + r() * 100, l: r() * 50 + 12, a: r() * TAU });
    }
    return { stars, petals, houses, dust, arches, cracks };
  }

  function getStage(id) {
    if (!stageCache[id]) stageCache[id] = buildStage(id);
    return stageCache[id];
  }

  function sky(ctx, top, mid, low, horizon) {
    const g = ctx.createLinearGradient(0, 0, 0, horizon || 600);
    g.addColorStop(0, top);
    g.addColorStop(0.58, mid);
    g.addColorStop(1, low);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, STAGE_W, horizon || 600);
  }

  function moon(ctx, x, y, r, color, glow) {
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 4);
    g.addColorStop(0, glow || 'rgba(255,244,208,.4)');
    g.addColorStop(1, 'rgba(255,244,208,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    circle(ctx, x, y, r, color, null);
    ctx.globalAlpha = 0.18;
    circle(ctx, x - r * 0.25, y - r * 0.12, r * 0.17, '#b3a98d');
    circle(ctx, x + r * 0.22, y + r * 0.23, r * 0.11, '#b3a98d');
    circle(ctx, x + r * 0.16, y - r * 0.29, r * 0.08, '#b3a98d');
    ctx.globalAlpha = 1;
  }

  function drawStars(ctx, stars, t) {
    ctx.save();
    for (const s of stars) {
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.sp + s.p));
      ctx.globalAlpha = a;
      circle(ctx, s.x, s.y, s.s, '#fff4dc');
    }
    ctx.restore();
  }

  function drawGround(ctx, base, line, t, stageId) {
    const g = ctx.createLinearGradient(0, 580, 0, 720);
    g.addColorStop(0, line || '#2a2333');
    g.addColorStop(0.18, base || '#16121a');
    g.addColorStop(1, '#08070c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 578, STAGE_W, 142);

    // lit rim
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const rim = ctx.createLinearGradient(0, 578, 0, 610);
    rim.addColorStop(0, stageId === 'cairo' ? 'rgba(255,184,94,.32)' : stageId === 'rome' ? 'rgba(148,166,255,.24)' : 'rgba(255,112,164,.22)');
    rim.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rim;
    ctx.fillRect(0, 578, STAGE_W, 42);
    ctx.restore();

    const c = getStage(stageId);
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    for (const cr of c.cracks) {
      ctx.beginPath();
      ctx.moveTo(cr.x, cr.y);
      ctx.lineTo(cr.x + Math.cos(cr.a) * cr.l, cr.y + Math.sin(cr.a) * cr.l * 0.18);
      ctx.stroke();
    }
    ctx.restore();

    // perspective paving seams
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.045)';
    ctx.lineWidth = 1;
    for (let i = -6; i <= 24; i++) {
      const x = 640 + i * 145;
      ctx.beginPath();
      ctx.moveTo(640 + (x - 640) * 0.18, 585);
      ctx.lineTo(x - 160, 720);
      ctx.stroke();
    }
    for (let y = 610; y < 720; y += 32) {
      ctx.globalAlpha = (y - 590) / 200;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(STAGE_W, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMorioh(ctx, t) {
    sky(ctx, '#160f2e', '#4c1f4e', '#d46a65', 600);
    drawStars(ctx, getStage('morioh').stars, t);
    moon(ctx, 1040, 152, 42, '#ffe8bd', 'rgba(255,211,166,.25)');

    // distant hills
    ctx.save();
    ctx.fillStyle = '#2a1633';
    ctx.beginPath();
    ctx.moveTo(0, 390);
    for (let x = 0; x <= STAGE_W; x += 80) {
      ctx.lineTo(x, 360 + Math.sin(x * 0.011 + 1) * 26 + Math.sin(x * 0.028) * 10);
    }
    ctx.lineTo(STAGE_W, 600);
    ctx.lineTo(0, 600);
    ctx.closePath();
    ctx.fill();

    // city silhouettes
    const houses = getStage('morioh').houses;
    ctx.fillStyle = '#1e1228';
    for (const h of houses) {
      ctx.fillRect(h.x, 600 - h.h, h.w, h.h);
      ctx.beginPath();
      ctx.moveTo(h.x - 4, 600 - h.h);
      ctx.lineTo(h.x + h.w / 2, 600 - h.h - 18);
      ctx.lineTo(h.x + h.w + 4, 600 - h.h);
      ctx.closePath();
      ctx.fill();
      if (h.win) {
        ctx.fillStyle = 'rgba(255,197,96,.42)';
        ctx.fillRect(h.x + 9, 600 - h.h + 14, 8, 12);
        ctx.fillRect(h.x + h.w - 18, 600 - h.h + 34, 7, 9);
        ctx.fillStyle = '#1e1228';
      }
    }
    ctx.restore();

    // storefront
    ctx.save();
    ctx.translate(88, 0);
    ctx.fillStyle = '#16101e';
    ctx.fillRect(0, 476, 260, 124);
    ctx.fillStyle = '#251535';
    ctx.fillRect(0, 476, 260, 11);
    ctx.fillStyle = 'rgba(255,82,150,.13)';
    ctx.fillRect(18, 500, 224, 52);
    ctx.strokeStyle = 'rgba(255,82,150,.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 500, 224, 52);
    ctx.fillStyle = '#ff4e93';
    ctx.font = '900 21px Bahnschrift, Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff2f74';
    ctx.shadowBlur = 16;
    ctx.fillText('MORIOH MART', 130, 534);
    ctx.shadowBlur = 0;
    ctx.font = '700 9px Bahnschrift, Arial';
    ctx.fillStyle = 'rgba(255,235,206,.7)';
    ctx.letterSpacing = '4px';
    ctx.fillText('OPEN 24 HOURS', 130, 550);
    ctx.textAlign = 'left';
    ctx.restore();

    // second storefront in the expanded east side
    ctx.save();
    ctx.translate(1480, 0);
    ctx.fillStyle = '#14101d';
    ctx.fillRect(0, 486, 230, 114);
    ctx.fillStyle = '#2a1c35';
    ctx.fillRect(0, 486, 230, 9);
    ctx.fillStyle = 'rgba(255,201,74,.11)';
    ctx.fillRect(16, 508, 198, 45);
    ctx.strokeStyle = 'rgba(255,201,74,.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 508, 198, 45);
    ctx.fillStyle = '#ffc94a';
    ctx.font = '900 19px Bahnschrift, Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff9d2e';
    ctx.shadowBlur = 12;
    ctx.fillText('MORIOH CAFE', 115, 538);
    ctx.shadowBlur = 0;
    ctx.font = '700 8px Bahnschrift, Arial';
    ctx.fillStyle = 'rgba(255,235,206,.65)';
    ctx.fillText('OPEN LATE', 115, 551);
    ctx.textAlign = 'left';
    ctx.restore();

    // telephone poles & wires
    ctx.save();
    ctx.strokeStyle = 'rgba(8,6,12,.9)';
    ctx.fillStyle = '#100c16';
    [200, 820, 1180, 1580, 1900].forEach((x, i) => {
      ctx.fillRect(x, 270 + i * 12, 9, 330);
      ctx.fillRect(x - 30, 298 + i * 12, 69, 6);
      ctx.fillRect(x - 24, 318 + i * 12, 57, 5);
    });
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(10,8,16,.8)';
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(200, 300 + i * 18);
      ctx.bezierCurveTo(400, 355 + i * 18, 660, 330 + i * 18, 820, 308 + i * 18);
      ctx.bezierCurveTo(960, 292 + i * 18, 1070, 310 + i * 18, 1180, 312 + i * 18);
      ctx.bezierCurveTo(1340, 350 + i * 18, 1460, 324 + i * 18, 1580, 336 + i * 18);
      ctx.bezierCurveTo(1710, 350 + i * 18, 1830, 318 + i * 18, 1900, 334 + i * 18);
      ctx.stroke();
    }
    ctx.restore();

    // street lamps
    [330, 960, 1510, 1830].forEach((x) => {
      ctx.save();
      ctx.strokeStyle = '#0c0911';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, 585);
      ctx.lineTo(x, 350);
      ctx.quadraticCurveTo(x, 334, x + 22, 334);
      ctx.stroke();
      const g = ctx.createRadialGradient(x + 22, 343, 2, x + 22, 343, 90);
      g.addColorStop(0, 'rgba(255,210,120,.45)');
      g.addColorStop(1, 'rgba(255,210,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 70, 260, 190, 190);
      circle(ctx, x + 22, 343, 6, '#ffe8b0', null);
      ctx.restore();
    });

    // cherry tree silhouette
    ctx.save();
    ctx.fillStyle = '#130d1c';
    ctx.beginPath();
    ctx.moveTo(1190, 585);
    ctx.bezierCurveTo(1185, 500, 1215, 445, 1258, 410);
    ctx.lineWidth = 13;
    ctx.strokeStyle = '#130d1c';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(1244, 408, 52, 0, TAU);
    ctx.arc(1204, 440, 34, 0, TAU);
    ctx.arc(1270, 454, 38, 0, TAU);
    ctx.fill();
    ctx.restore();

    // another cherry tree further east
    ctx.save();
    ctx.strokeStyle = '#130d1c';
    ctx.fillStyle = '#130d1c';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(1760, 585);
    ctx.bezierCurveTo(1750, 505, 1788, 455, 1828, 420);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(1810, 418, 42, 0, TAU);
    ctx.arc(1772, 448, 29, 0, TAU);
    ctx.arc(1852, 454, 34, 0, TAU);
    ctx.fill();
    ctx.restore();

    // petals
    ctx.save();
    const petals = getStage('morioh').petals;
    for (const p of petals) {
      const x = (p.x + t * p.sp + Math.sin(t * 0.8 + p.p) * p.sw) % (STAGE_W + 40) - 40;
      const y = (p.y + t * p.sp * 0.45 + Math.cos(t * 0.6 + p.p) * 18) % 620;
      ctx.globalAlpha = 0.28 + 0.3 * (0.5 + 0.5 * Math.sin(t + p.p));
      ctx.fillStyle = '#ffacc9';
      ctx.beginPath();
      ctx.ellipse(x, y, p.s, p.s * 0.5, t * 0.6 + p.p, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    drawGround(ctx, '#17121c', '#33212f', t, 'morioh');

    // crosswalk
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#f8e9cf';
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.translate(420 + i * 74, 640);
      ctx.rotate(-0.12);
      ctx.fillRect(0, 0, 38, 12);
      ctx.restore();
      ctx.save();
      ctx.translate(1480 + i * 74, 640);
      ctx.rotate(-0.12);
      ctx.fillRect(0, 0, 38, 12);
      ctx.restore();
    }
    ctx.restore();

    // stage sign
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#f4dfbc';
    ctx.font = '900 13px "Microsoft YaHei", sans-serif';
    ctx.fillText('杜王町', 88, 660);
    ctx.font = '700 8px Bahnschrift, Arial';
    ctx.fillStyle = 'rgba(244,223,188,.45)';
    ctx.fillText('MORIOH TOWN · 1999', 88, 675);
    ctx.font = '900 13px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#f4dfbc';
    ctx.fillText('杜王町', 1580, 660);
    ctx.font = '700 8px Bahnschrift, Arial';
    ctx.fillStyle = 'rgba(244,223,188,.45)';
    ctx.fillText('MORIOH TOWN · EAST', 1580, 675);
    ctx.restore();
  }

  function drawCairo(ctx, t) {
    sky(ctx, '#1a1332', '#722a47', '#e49a55', 600);
    drawStars(ctx, getStage('cairo').stars, t);
    moon(ctx, 940, 148, 72, '#ffeccb', 'rgba(255,213,150,.3)');

    // sun glow on horizon
    ctx.save();
    const sg = ctx.createRadialGradient(360, 520, 20, 360, 520, 320);
    sg.addColorStop(0, 'rgba(255,176,88,.28)');
    sg.addColorStop(1, 'rgba(255,176,88,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 240, 900, 400);
    ctx.restore();

    // pyramids
    ctx.save();
    ctx.fillStyle = '#3b2230';
    ctx.beginPath();
    ctx.moveTo(180, 590);
    ctx.lineTo(430, 356);
    ctx.lineTo(690, 590);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#4d2a35';
    ctx.beginPath();
    ctx.moveTo(430, 356);
    ctx.lineTo(690, 590);
    ctx.lineTo(560, 590);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,190,112,.12)';
    ctx.beginPath();
    ctx.moveTo(430, 356);
    ctx.lineTo(470, 590);
    ctx.lineTo(370, 590);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#33202e';
    ctx.beginPath();
    ctx.moveTo(760, 590);
    ctx.lineTo(930, 440);
    ctx.lineTo(1110, 590);
    ctx.closePath();
    ctx.fill();

    // eastern pyramid cluster
    ctx.fillStyle = '#3a2230';
    ctx.beginPath();
    ctx.moveTo(1240, 590);
    ctx.lineTo(1530, 410);
    ctx.lineTo(1830, 590);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#492936';
    ctx.beginPath();
    ctx.moveTo(1530, 410);
    ctx.lineTo(1830, 590);
    ctx.lineTo(1680, 590);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // city skyline + minaret
    ctx.save();
    ctx.fillStyle = '#271724';
    for (let i = 0; i < 28; i++) {
      const x = 700 + i * 46;
      const h = 50 + ((i * 37) % 85);
      ctx.fillRect(x, 590 - h, 34, h);
      if (i % 4 === 0) {
        ctx.beginPath();
        ctx.arc(x + 17, 590 - h, 17, Math.PI, 0);
        ctx.fill();
      }
    }
    ctx.fillRect(850, 410, 24, 180);
    ctx.beginPath();
    ctx.moveTo(842, 410);
    ctx.lineTo(862, 360);
    ctx.lineTo(882, 410);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(1112, 450, 19, 140);
    ctx.beginPath();
    ctx.moveTo(1105, 450);
    ctx.lineTo(1121, 410);
    ctx.lineTo(1137, 450);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(1580, 430, 22, 160);
    ctx.beginPath();
    ctx.moveTo(1572, 430);
    ctx.lineTo(1591, 378);
    ctx.lineTo(1610, 430);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(1816, 465, 18, 125);
    ctx.beginPath();
    ctx.moveTo(1808, 465);
    ctx.lineTo(1825, 425);
    ctx.lineTo(1842, 465);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // palms
    [120, 1180, 1620, 1900].forEach((x, idx) => {
      ctx.save();
      ctx.strokeStyle = '#140d16';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(x, 590);
      ctx.quadraticCurveTo(x + (idx ? -14 : 16), 470, x + (idx ? -34 : 38), 400);
      ctx.stroke();
      ctx.lineWidth = 6;
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI * 0.92 + i * 0.3;
        ctx.beginPath();
        ctx.moveTo(x + (idx ? -34 : 38), 400);
        ctx.quadraticCurveTo(
          x + (idx ? -34 : 38) + Math.cos(a) * 38,
          400 + Math.sin(a) * 30,
          x + (idx ? -34 : 38) + Math.cos(a) * 70,
          400 + Math.sin(a) * 50
        );
        ctx.stroke();
      }
      ctx.restore();
    });

    drawGround(ctx, '#251916', '#6b3e2a', t, 'cairo');

    // sand drift
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ffd99d';
    for (let i = 0; i < 4; i++) {
      const y = 620 + i * 22;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= STAGE_W; x += 80) {
        ctx.lineTo(x, y + Math.sin(x * 0.02 + t * 0.35 + i) * 5);
      }
      ctx.lineTo(STAGE_W, 720);
      ctx.lineTo(0, 720);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // dust
    const dust = getStage('cairo').dust;
    ctx.save();
    for (const d of dust) {
      const x = (d.x + t * d.sp) % (STAGE_W + 40) - 20;
      const y = d.y + Math.sin(t * 0.4 + d.p) * 14;
      ctx.globalAlpha = 0.1 + 0.15 * (0.5 + 0.5 * Math.sin(t + d.p));
      circle(ctx, x, y, d.s, '#ffdca8');
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = '#ffdfb8';
    ctx.font = '900 13px "Microsoft YaHei", sans-serif';
    ctx.fillText('开罗', 88, 660);
    ctx.font = '700 8px Bahnschrift, Arial';
    ctx.fillStyle = 'rgba(255,223,184,.45)';
    ctx.fillText('CAIRO · 1989', 88, 675);
    ctx.font = '900 13px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#ffdfb8';
    ctx.fillText('开罗', 1600, 660);
    ctx.font = '700 8px Bahnschrift, Arial';
    ctx.fillStyle = 'rgba(255,223,184,.45)';
    ctx.fillText('CAIRO · EAST', 1600, 675);
    ctx.restore();
  }

  function drawRome(ctx, t) {
    sky(ctx, '#0b1029', '#263c63', '#8b8ca6', 600);
    drawStars(ctx, getStage('rome').stars, t);
    moon(ctx, 270, 130, 54, '#e8ecff', 'rgba(205,219,255,.26)');

    // distant hills
    ctx.save();
    ctx.fillStyle = '#161c32';
    ctx.beginPath();
    ctx.moveTo(0, 410);
    for (let x = 0; x <= STAGE_W; x += 70) {
      ctx.lineTo(x, 390 + Math.sin(x * 0.009) * 20);
    }
    ctx.lineTo(STAGE_W, 600);
    ctx.lineTo(0, 600);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // colosseum silhouette
    ctx.save();
    ctx.translate(710, 0);
    ctx.fillStyle = '#1d1a2b';
    ctx.beginPath();
    ctx.moveTo(0, 585);
    ctx.lineTo(0, 330);
    ctx.quadraticCurveTo(210, 260, 450, 335);
    ctx.lineTo(450, 585);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(177,170,206,.27)';
    ctx.lineWidth = 2;
    const arches = getStage('rome').arches;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 6; i++) {
        const x = 26 + i * 70 + (row % 2) * 9;
        const y = 358 + row * 68;
        ctx.beginPath();
        ctx.arc(x + 24, y, 21, Math.PI, 0);
        ctx.lineTo(x + 45, y + 44);
        ctx.lineTo(x + 3, y + 44);
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(170,165,200,.16)';
    ctx.beginPath();
    ctx.moveTo(0, 333);
    ctx.quadraticCurveTo(210, 267, 450, 338);
    ctx.stroke();
    ctx.restore();

    // eastern ruin wall
    ctx.save();
    ctx.translate(1320, 0);
    ctx.fillStyle = '#1b1828';
    ctx.beginPath();
    ctx.moveTo(0, 585);
    ctx.lineTo(0, 390);
    ctx.quadraticCurveTo(230, 350, 460, 400);
    ctx.lineTo(460, 585);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(177,170,206,.22)';
    ctx.lineWidth = 2;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 5; i++) {
        const x = 34 + i * 78 + (row % 2) * 8;
        const y = 408 + row * 72;
        ctx.beginPath();
        ctx.arc(x + 22, y, 20, Math.PI, 0);
        ctx.lineTo(x + 42, y + 42);
        ctx.lineTo(x + 2, y + 42);
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();

    // Roman buildings left
    ctx.save();
    ctx.fillStyle = '#191628';
    ctx.fillRect(0, 420, 270, 170);
    ctx.fillStyle = '#211b30';
    ctx.fillRect(30, 382, 70, 208);
    ctx.fillRect(122, 402, 84, 188);
    ctx.fillStyle = 'rgba(255,196,120,.22)';
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4; j++) {
        ctx.fillRect(44 + j * 21, 410 + i * 45, 7, 12);
      }
    }
    for (let j = 0; j < 4; j++) ctx.fillRect(136 + j * 18, 430, 7, 12);
    ctx.fillStyle = 'rgba(255,196,120,.15)';
    ctx.fillRect(0, 420, 270, 3);
    ctx.restore();

    // Roman buildings east
    ctx.save();
    ctx.fillStyle = '#191628';
    ctx.fillRect(1460, 440, 220, 150);
    ctx.fillStyle = '#211b30';
    ctx.fillRect(1490, 405, 74, 185);
    ctx.fillRect(1584, 425, 92, 165);
    ctx.fillStyle = 'rgba(255,196,120,.18)';
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 4; j++) ctx.fillRect(1502 + j * 19, 430 + i * 42, 7, 12);
    }
    ctx.restore();

    // cypress trees
    [600, 1205, 1240, 1560, 1820, 1900].forEach((x, i) => {
      ctx.save();
      ctx.fillStyle = '#0c1118';
      ctx.beginPath();
      ctx.moveTo(x, 600);
      ctx.quadraticCurveTo(x - 30 - i * 3, 470, x, 340 - i * 20);
      ctx.quadraticCurveTo(x + 30 + i * 3, 470, x, 600);
      ctx.fill();
      ctx.restore();
    });

    drawGround(ctx, '#171722', '#414158', t, 'rome');

    // plaza stones
    ctx.save();
    ctx.strokeStyle = 'rgba(192,194,220,.13)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.ellipse(640, 700, 90 + i * 70, 20 + i * 16, 0, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(1510, 700, 75 + i * 62, 18 + i * 14, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    // fountain glow
    ctx.save();
    const fg = ctx.createRadialGradient(1070, 580, 4, 1070, 580, 120);
    fg.addColorStop(0, 'rgba(152,190,255,.25)');
    fg.addColorStop(1, 'rgba(152,190,255,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(920, 460, 300, 250);
    ctx.strokeStyle = 'rgba(207,224,255,.3)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(1070 - 45 + i * 22, 575);
      ctx.quadraticCurveTo(1070 - 60 + i * 30 + Math.sin(t + i) * 8, 510, 1070 - 20 + i * 10, 490);
      ctx.stroke();
    }
    ctx.restore();

    // second fountain in the east plaza
    ctx.save();
    const fg2 = ctx.createRadialGradient(1740, 580, 4, 1740, 580, 110);
    fg2.addColorStop(0, 'rgba(152,190,255,.22)');
    fg2.addColorStop(1, 'rgba(152,190,255,0)');
    ctx.fillStyle = fg2;
    ctx.fillRect(1600, 465, 290, 240);
    ctx.strokeStyle = 'rgba(207,224,255,.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(1740 - 45 + i * 22, 575);
      ctx.quadraticCurveTo(1740 - 60 + i * 30 + Math.sin(t + i) * 8, 515, 1740 - 20 + i * 10, 495);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.46;
    ctx.fillStyle = '#e5e7f6';
    ctx.font = '900 13px "Microsoft YaHei", sans-serif';
    ctx.fillText('罗马', 88, 660);
    ctx.font = '700 8px Bahnschrift, Arial';
    ctx.fillStyle = 'rgba(229,231,246,.45)';
    ctx.fillText('ROMA · VIA DEL COLOSSEO', 88, 675);
    ctx.font = '900 13px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#e5e7f6';
    ctx.fillText('罗马', 1600, 660);
    ctx.font = '700 8px Bahnschrift, Arial';
    ctx.fillStyle = 'rgba(229,231,246,.45)';
    ctx.fillText('ROMA · FORO EST', 1600, 675);
    ctx.restore();
  }

  function drawStageRaw(ctx, id, t) {
    if (id === 'cairo') drawCairo(ctx, t);
    else if (id === 'rome') drawRome(ctx, t);
    else drawMorioh(ctx, t);

    // atmospheric halftone / haze
    ctx.save();
    const g = ctx.createLinearGradient(0, 300, 0, 590);
    g.addColorStop(0, 'rgba(8,6,14,0)');
    g.addColorStop(1, 'rgba(8,6,14,.36)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 300, STAGE_W, 300);
    ctx.restore();
  }

  const stageBackdropCache = {};

  function getStageBackdrop(id) {
    if (!stageBackdropCache[id]) {
      const c = document.createElement('canvas');
      c.width = STAGE_W;
      c.height = 720 + STAGE_PAD_Y * 2;
      const g = c.getContext('2d');
      // Extra sky/ground padding keeps the frame filled when the camera zooms out.
      g.fillStyle = STAGE_TOP[id] || '#160f2e';
      g.fillRect(0, 0, STAGE_W, STAGE_PAD_Y);
      g.save();
      g.translate(0, STAGE_PAD_Y);
      drawStageRaw(g, id, 0);
      g.restore();
      g.fillStyle = '#08070c';
      g.fillRect(0, STAGE_PAD_Y + 720, STAGE_W, STAGE_PAD_Y);
      stageBackdropCache[id] = c;
    }
    return stageBackdropCache[id];
  }

  function drawStageAmbient(ctx, id, t) {
    const data = getStage(id);
    ctx.save();
    if (id === 'cairo') {
      for (let i = 0; i < 12; i++) {
        const d = data.dust[i];
        const x = (d.x + t * d.sp) % (STAGE_W + 40) - 20;
        const y = d.y + Math.sin(t * 0.4 + d.p) * 14;
        ctx.globalAlpha = 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(t + d.p));
        circle(ctx, x, y, d.s, '#ffdca8');
      }
    } else if (id === 'rome') {
      for (let i = 0; i < 10; i++) {
        const s = data.stars[i];
        ctx.globalAlpha = 0.18 + 0.28 * (0.5 + 0.5 * Math.sin(t * 1.2 + s.p));
        circle(ctx, s.x, s.y + 60 + Math.sin(t * 0.5 + s.p) * 12, 1.4, '#dfe8ff');
      }
    } else {
      for (let i = 0; i < 12; i++) {
        const p = data.petals[i];
        const x = (p.x + t * p.sp + Math.sin(t * 0.8 + p.p) * p.sw) % (STAGE_W + 40) - 40;
        const y = (p.y + t * p.sp * 0.45 + Math.cos(t * 0.6 + p.p) * 18) % 620;
        ctx.globalAlpha = 0.22 + 0.24 * (0.5 + 0.5 * Math.sin(t + p.p));
        ctx.fillStyle = '#ffacc9';
        ctx.beginPath();
        ctx.ellipse(x, y, p.s, p.s * 0.5, t * 0.6 + p.p, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawStage(ctx, id, t) {
    ctx.drawImage(getStageBackdrop(id), 0, -STAGE_PAD_Y, STAGE_W, 720 + STAGE_PAD_Y * 2);
    drawStageAmbient(ctx, id, t);
  }

  /* =========================================================
     Fighter posing
     ========================================================= */
  const POSE_KEYS = ['hipY', 'hipX', 'chestX', 'torso', 'headTilt', 'armFU', 'armFL', 'armBU', 'armBL', 'footFX', 'footFY', 'footBX', 'footBY', 'coat', 'rot', 'bob'];
  const POSE_RATES = {
    hipY: 11, hipX: 9, chestX: 10, torso: 9, headTilt: 7.5,
    armFU: 18, armFL: 17, armBU: 16, armBL: 15,
    footFX: 24, footFY: 24, footBX: 24, footBY: 24,
    coat: 6, rot: 10, bob: 10
  };

  function neutralPose() {
    return {
      hipY: -88, hipX: 0, chestX: 0, torso: 3, headTilt: -2,
      armFU: 13, armFL: 25, armBU: -9, armBL: -19,
      footFX: 29, footFY: 0, footBX: -31, footBY: 0,
      coat: 8, rot: 0, bob: 0
    };
  }

  function makePose(over) {
    return Object.assign(neutralPose(), over || {});
  }

  function attackPhase(f) {
    if (!f.attack) return { phase: 'none', ext: 0, p: 0 };
    const a = f.attack;
    const total = a.startup + a.active + a.recovery;
    const t = clamp(f.attackTime, 0, total);
    if (t < a.startup) {
      return { phase: 'startup', p: t / a.startup, ext: -0.24 * easeOut(t / a.startup) };
    }
    if (t < a.startup + a.active) {
      const p = (t - a.startup) / a.active;
      return { phase: 'active', p, ext: lerp(-0.24, 1, easeOut(p)) };
    }
    const p = (t - a.startup - a.active) / a.recovery;
    return { phase: 'recovery', p, ext: 1 - easeIn(p) };
  }

  function targetPoseBase(f, t) {
    const state = f.state;
    const bob = Math.sin(t * 3.2 + (f.seed || 0)) * 1.4;
    let p = makePose({ bob });

    if (state === 'ko') {
      return makePose({
        hipY: -58, torso: -28, headTilt: 18,
        armFU: -52, armFL: -75, armBU: 30, armBL: 70,
        footFX: 18, footFY: -12, footBX: -22, footBY: -8, coat: 20, rot: 0
      });
    }

    if (state === 'intro') {
      p = makePose({ hipY: -88 + bob * 0.5, torso: 1, headTilt: 7, coat: 10 });
      if (f.charId === 'dio') {
        p.armFU = 40; p.armFL = 68; p.armBU = -44; p.armBL = -28;
        p.torso = -6; p.headTilt = -7; p.footFX = 36;
      } else if (f.charId === 'giorno') {
        p.armFU = 35; p.armFL = 112; p.armBU = -5; p.armBL = -4;
        p.torso = 4; p.headTilt = -4;
      } else if (f.charId === 'kakyoin') {
        p.armFU = 62; p.armFL = 118; p.armBU = -10; p.armBL = -20;
        p.headTilt = -6;
      } else {
        p.armFU = 24; p.armFL = 94; p.armBU = 18; p.armBL = 26;
        p.headTilt = -8; p.torso = 5;
      }
      return p;
    }

    if (state === 'victory') {
      p = makePose({ hipY: -87, torso: 2, headTilt: -4, coat: 14, footFX: 32 });
      if (f.charId === 'jotaro') {
        // Raise a hand to the hat brim.
        p.armFU = 122; p.armFL = 208; p.armBU = 12; p.armBL = 20;
        p.torso = 3; p.headTilt = -12; p.coat = 16; p.footFX = 34;
      } else if (f.charId === 'dio') {
        // Head thrown back, arms wide, shoulders shaking with laughter.
        p.armFU = 142; p.armFL = 172; p.armBU = -132; p.armBL = -162;
        p.torso = -16; p.headTilt = -24; p.coat = 28; p.footFX = 38;
        p.bob = Math.sin(t * 13) * 2.2;
      } else if (f.charId === 'giorno') {
        // One hand tugging at the collar.
        p.armFU = 30; p.armFL = 150; p.armBU = -12; p.armBL = -60;
        p.torso = 2; p.headTilt = -7; p.coat = 14; p.footFX = 32;
      } else {
        // Kakyoin points straight at the opponent.
        p.armFU = 96; p.armFL = 94; p.armBU = -14; p.armBL = -38;
        p.torso = 1; p.headTilt = -9; p.coat = 16; p.footFX = 34;
      }
      return p;
    }

    if (state === 'jump') {
      const rising = f.vy < 0;
      p = makePose({
        hipY: -102, hipX: rising ? 1.8 : -1.2, chestX: rising ? -1.5 : 1.5,
        torso: rising ? 7 : -2, headTilt: rising ? -3 : 4,
        armFU: rising ? 74 : 42, armFL: rising ? 95 : 62,
        armBU: rising ? -42 : -24, armBL: rising ? -65 : -38,
        footFX: 19, footFY: -31, footBX: -21, footBY: -18,
        coat: 24 + Math.abs(f.vy || 0) * 0.012
      });
      return p;
    }

    if (state === 'dash') {
      const run = Math.sin((f.gaitPhase || 0) * 1.15);
      p = makePose({
        hipY: -80 + Math.abs(run) * 1.8, torso: 19, headTilt: -8, coat: 30,
        armFU: -26 + run * 13, armFL: -12 + run * 8,
        armBU: -47 - run * 12, armBL: -32 - run * 7,
        footFX: 43 + run * 9, footFY: 0, footBX: -42 - run * 8, footBY: -8
      });
      return p;
    }

    if (state === 'dodge') {
      p = makePose({
        hipY: -82, hipX: -2, chestX: 2,
        torso: -8, headTilt: 6, coat: 20,
        armFU: 38, armFL: 80, armBU: 24, armBL: 60,
        footFX: 34, footFY: -6, footBX: -26, footBY: 0
      });
      return p;
    }

    if (state === 'backdash') {
      const bd = Math.sin((f.gaitPhase || 0) * 1.05);
      p = makePose({
        hipY: -80 + Math.abs(bd) * 1.6, hipX: -2, chestX: 2,
        torso: -13, headTilt: 8, coat: 24,
        armFU: 46 + bd * 5, armFL: 92 + bd * 3,
        armBU: 28 - bd * 4, armBL: 68,
        footFX: 40 + bd * 6, footFY: -7, footBX: -22 - bd * 4, footBY: 0
      });
      return p;
    }

    if (state === 'hitstun') {
      const k = clamp(f.hitstun || 0, 0, 0.5);
      const jitter = Math.sin(t * 48 + (f.seed || 0)) * k * 2.4;
      p = makePose({
        hipY: -83, hipX: -3 + jitter * 0.4, chestX: 2 - jitter * 0.3,
        torso: -17, headTilt: 17 + jitter, coat: 5,
        armFU: -32 - k * 42, armFL: -46 - jitter, armBU: 36, armBL: 52,
        footFX: 20, footBX: -36, footBY: 0
      });
      return p;
    }

    if (state === 'guard' || state === 'blockstun') {
      const gb = Math.sin(t * 2.2 + (f.seed || 0)) * 0.8;
      p = makePose({
        hipY: -77 + gb, hipX: -1.5, chestX: 1,
        torso: -4 + gb * 0.5, headTilt: -3, coat: 4,
        armFU: 48 + gb, armFL: 127, armBU: 37 - gb, armBL: 113,
        footFX: 27, footBX: -37
      });
      return p;
    }

    if (state === 'crouch') {
      p = makePose({
        hipY: -57, torso: 20, headTilt: -9,
        armFU: 27, armFL: 82, armBU: 12, armBL: 42,
        footFX: 35, footBX: -35, coat: 2
      });
      return p;
    }

    if (state === 'attack') {
      const ph = attackPhase(f);
      const heavy = !!(f.attack && f.attack.heavy);
      const ext = ph.ext;
      if (f.airStandActive) {
        return makePose({
          hipY: -104, hipX: 2.5, chestX: 3,
          torso: 18 + ext * 8, headTilt: -8,
          armFU: 70 + ext * 32, armFL: 92 + ext * 24,
          armBU: -42 - ext * 18, armBL: -64 - ext * 16,
          footFX: 20, footFY: -32, footBX: -18, footBY: -23,
          coat: 26 + ext * 16
        });
      }
      const kind = f.attack && f.attack.kind;
      if (kind === 'launcher') {
        return makePose({
          hipY: -92, hipX: -3, chestX: 3.5,
          torso: -13 - ext * 5, headTilt: 9 + ext * 4,
          armFU: -18 + ext * 55, armFL: -8 + ext * 62,
          armBU: 20 - ext * 10, armBL: 30 - ext * 8,
          footFX: 32, footBX: -37, footBY: -3, coat: 18 + ext * 18
        });
      }
      if (kind === 'dash') {
        return makePose({
          hipY: -82, hipX: -2, chestX: -2,
          torso: 22 + ext * 6, headTilt: -10,
          armFU: 48 + ext * 12, armFL: 65 + ext * 8,
          armBU: -40, armBL: -52,
          footFX: 44, footBX: -45, footBY: -3, coat: 34
        });
      }
      if (kind === 'dive') {
        return makePose({
          hipY: -94, hipX: 1, chestX: 2,
          torso: 25, headTilt: -9,
          armFU: 18, armFL: 38, armBU: -68, armBL: -82,
          footFX: 54, footFY: 34, footBX: -18, footBY: -16,
          coat: 38
        });
      }
      if (heavy) {
        p = makePose({
          hipY: -86, hipX: -2 - ext * 4, chestX: -ext * 4,
          torso: 2 + ext * 15, headTilt: -3 - ext * 4,
          // The body braces and points; the Stand throws the actual blow.
          armFU: -8 + ext * 22, armFL: 12 + ext * 25,
          armBU: -6 - ext * 12, armBL: -23 - ext * 10,
          footFX: 30 + ext * 19, footFY: 0, footBX: -31 - ext * 8, footBY: 0,
          coat: 8 + ext * 24
        });
      } else {
        p = makePose({
          hipY: -87, hipX: -ext * 4, chestX: -ext * 2.5,
          torso: 3 + ext * 9, headTilt: -2 - ext * 2,
          armFU: 10 + ext * 15, armFL: 40 + ext * 10,
          armBU: -9 - ext * 10, armBL: -19 - ext * 8,
          footFX: 29 + ext * 13, footBX: -31 - ext * 4, coat: 8 + ext * 12
        });
      }
      return p;
    }

    if (state === 'special') {
      const cycle = Math.sin((f.specialTime || 0) * 34);
      const front = cycle > 0;
      p = makePose({
        hipY: -86, torso: 13, headTilt: -5, coat: 26,
        armFU: front ? 58 : 28, armFL: front ? 88 : 54,
        armBU: front ? 28 : 58, armBL: front ? 54 : 88,
        footFX: 42, footBX: -38, footBY: -2
      });
      return p;
    }

    if (state === 'super') {
      const k = clamp((f.superTime || 0) / 0.5, 0, 1);
      p = makePose({
        hipY: -90, torso: -8 * k, headTilt: -7 * k, coat: 34,
        armFU: 30 + 34 * k, armFL: 58 + 32 * k,
        armBU: -30 - 20 * k, armBL: -42 - 22 * k,
        footFX: 39, footBX: -39, footBY: -2
      });
      return p;
    }

    if (state === 'walk') {
      const fwd = clamp((f.vx || 0) * f.facing / 280, -1, 1);
      const back = fwd < -0.25;
      const stride = clamp(Math.abs(f.vx || 0) / 260, 0.35, 1);
      const phase = f.gaitPhase != null ? f.gaitPhase : t * 9.2;
      // Backpedal uses a shorter, more cautious shuffle and keeps the guard up.
      if (back) {
        const bs = Math.sin(phase * 0.8);
        const bLift = Math.max(0, bs);
        p = makePose({
          hipY: -86 + Math.abs(bs) * (1.2 + stride * 0.8),
          hipX: bs * 1.3 * stride,
          chestX: -bs * 1.7 * stride,
          torso: -5 + fwd * 2.5,
          headTilt: 4 - fwd * 1.8 + Math.sin(phase * 0.8 + 1.2) * 1.2,
          armFU: 38 + bs * 8, armFL: 79 + bs * 7,
          armBU: 22 - bs * 7, armBL: 55 - bs * 5,
          footFX: 25 + bs * 17 * stride, footFY: -bLift * 9,
          footBX: -27 - bs * 14 * stride, footBY: -Math.max(0, -bs) * 9,
          coat: 11 + Math.abs(bs) * 6 + Math.abs(fwd) * 4
        });
        return p;
      }
      const s = Math.sin(phase);
      const lift = Math.max(0, s);
      p = makePose({
        hipY: -88 + Math.abs(s) * (1.6 + stride * 1.2),
        hipX: s * 2.4 * stride,
        chestX: -s * 1.8 * stride,
        torso: 6 + fwd * 3.5,
        headTilt: -2 - fwd * 2.2 + Math.sin(phase + 1.1) * 1.2,
        armFU: 13 - s * 25 * stride, armFL: 25 - s * 14 * stride,
        armBU: -9 + s * 27 * stride, armBL: -19 + s * 16 * stride,
        footFX: 29 + s * 32 * stride, footFY: -lift * 15 * stride,
        footBX: -31 - s * 30 * stride, footBY: -Math.max(0, -s) * 15 * stride,
        coat: 8 + Math.abs(s) * 10 + Math.abs(fwd) * 7
      });
      return p;
    }

    if (state === 'frozen') {
      return makePose({
        hipY: -87, torso: -11, headTilt: 13,
        armFU: -32, armFL: -18, armBU: 27, armBL: 45,
        footFX: 25, footBX: -35, coat: 6
      });
    }

    // idle breathing: hips and chest counter-sway instead of a static mannequin
    const breath = Math.sin(t * 1.55 + (f.seed || 0) * 0.4);
    const weight = Math.sin(t * 0.82 + (f.seed || 0));
    const fwd = clamp((f.vx || 0) * f.facing / 320, -1, 1);
    p = makePose({
      hipY: -88 + bob * 0.55,
      hipX: weight * 2.1,
      chestX: -weight * 1.2 + breath * 0.8,
      torso: 3 + breath * 0.9 + fwd * 1.5,
      headTilt: -2 + Math.sin(t * 1.4) * 1.6 - fwd * 1.2 + Math.sin(t * 0.45 + (f.seed || 0)) * 1.8,
      armFU: 13 + Math.sin(t * 1.7) * 2.6,
      armFL: 25 + Math.sin(t * 1.7 + 0.7) * 3,
      armBU: -9 - Math.sin(t * 1.7) * 2,
      armBL: -19 + Math.sin(t * 1.1) * 1.4,
      footFX: 29 + weight * 0.8, footBX: -31 - weight * 0.8,
      coat: 8 + Math.sin(t * 1.1) * 1.8 + Math.abs(fwd) * 8
    });
    return p;
  }

  function targetPose(f, t) {
    const p = targetPoseBase(f, t);
    if (f.onGround && (f.landTimer || 0) > 0 &&
        (f.state === 'idle' || f.state === 'walk' || f.state === 'jump' || f.state === 'guard')) {
      const k = clamp((f.landTimer || 0) / 0.2, 0, 1);
      const e = k * k;
      p.hipY = lerp(p.hipY, -76, 0.85 * e);
      p.torso = lerp(p.torso, 17, 0.8 * e);
      p.headTilt = lerp(p.headTilt, -8, 0.55 * e);
      p.armFU = lerp(p.armFU, 42, 0.45 * e);
      p.armFL = lerp(p.armFL, 78, 0.3 * e);
      p.armBU = lerp(p.armBU, 18, 0.35 * e);
      p.coat = lerp(p.coat, 18, 0.4 * e);
    }
    if ((f.turnTimer || 0) > 0) {
      const e = Math.sin(clamp(f.turnTimer / 0.18, 0, 1) * Math.PI);
      p.hipX += (f.turnDir || 1) * 3 * e;
      p.chestX -= (f.turnDir || 1) * 2 * e;
      p.headTilt += (f.turnDir || 1) * 4 * e;
      p.coat += 6 * e;
    }
    return p;
  }

  function updatePose(f, dt, t) {
    if (!f.vis) f.vis = neutralPose();
    if (f._lastFacing == null) f._lastFacing = f.facing;
    if (f._lastFacing !== f.facing) {
      f.turnTimer = 0.18;
      f.turnDir = f.facing > f._lastFacing ? 1 : -1;
      f._lastFacing = f.facing;
    }
    const target = targetPose(f, t);
    const stateBoost = f.state === 'attack' || f.state === 'special' ? 1.7 : f.state === 'hitstun' || f.state === 'guard' ? 1.35 : 1;
    const rates = POSE_RATES;
    for (const key of POSE_KEYS) {
      if (target[key] == null || f.vis[key] == null) continue;
      const rate = (rates[key] || 12) * stateBoost;
      const k = 1 - Math.exp(-rate * dt);
      f.vis[key] = lerp(f.vis[key], target[key], k);
    }
    f.turnTimer = Math.max(0, (f.turnTimer || 0) - dt);
    if (f.state === 'ko') f.vis.rot = lerp(f.vis.rot, -1.36 * (f.koP || 0), 1 - Math.exp(-5 * dt));
    else f.vis.rot = lerp(f.vis.rot, 0, 1 - Math.exp(-10 * dt));
    updateStandPose(f, dt, t);
  }

  function updateStandPose(f, dt, t) {
    if (f.standX == null) {
      f.standX = -38;
      f.standY = -8;
      f.standTilt = 0;
      f.standScale = 1.03;
    }
    const guarding = !!(f.guarding || f.state === 'guard' || f.state === 'blockstun');
    const front = !!(f.airStandActive || f.gerGrabActive || guarding || f.state === 'attack' || f.state === 'special' || f.state === 'super');
    let tx = f.airStandActive ? 64 : f.state === 'attack' ? 52 : guarding ? 42 : front ? 42 : -40;
    let ty = front ? -12 : -8;
    let ts = f.airStandActive ? 1.12 : guarding ? 1.08 : front ? 1.2 : 1.03;
    let tilt = 0;
    if (guarding) {
      tx = 42;
      ty = -12;
      ts = 1.08;
      tilt = 0.02;
    } else if (f.state === 'attack') {
      const ext = f.attack ? clamp(attackPhase(f).ext, 0, 1) : 0;
      // The Stand lunges forward on its own instead of sitting inside the body.
      tx = 52 + ext * 14;
      ty = -13 - ext * 2;
      tilt = 0.035 + ext * 0.055;
    } else if (f.state === 'backdash' || f.state === 'dodge') {
      tx = f.state === 'dodge' ? -46 : -52;
      ty = -6;
      ts = 1.05;
      tilt = f.state === 'dodge' ? -0.04 : -0.075;
    } else if (f.state === 'walk' && !front) {
      const fwd = clamp((f.vx || 0) * f.facing / 280, -1, 1);
      tx = fwd >= 0 ? -46 - fwd * 7 : -35 + (-fwd) * 2;
      tilt = clamp((f.vx || 0) * f.facing / 2600, -0.05, 0.05);
    } else if (f.state === 'ko') {
      tx = -20;
      ty = -5;
    }
    ty += Math.sin(t * 2.1 + (f.seed || 0)) * 2.2;
    if (!front) ty += clamp((f.vy || 0) * 0.014, -5, 5);
    const k = 1 - Math.exp(-(front ? 17 : 8.5) * dt);
    f.standX = lerp(f.standX, tx, k);
    f.standY = lerp(f.standY, ty, k);
    f.standTilt = lerp(f.standTilt, tilt, 1 - Math.exp(-7 * dt));
    f.standScale = lerp(f.standScale, ts, k);
  }

  /* =========================================================
     Fighter drawing
     ========================================================= */
  function torsoPoints(p) {
    const hip = { x: p.hipX || 0, y: p.hipY };
    const a = p.torso * DEG;
    const chest = {
      x: hip.x + Math.sin(a) * 63 + (p.chestX || 0),
      y: hip.y - Math.cos(a) * 63
    };
    const neck = { x: chest.x + Math.sin(a) * 9, y: chest.y - Math.cos(a) * 9 };
    return { hip, chest, neck };
  }

  function drawHead(ctx, f, p, parts, pal) {
    const head = {
      x: parts.neck.x + Math.sin((p.torso + p.headTilt) * DEG) * 14,
      y: parts.neck.y - Math.cos((p.torso + p.headTilt) * DEG) * 14
    };
    const rot = (p.torso * 0.32 + p.headTilt) * DEG;
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(rot);

    // back hair / silhouette details
    if (f.charId === 'dio') {
      poly(ctx, [[-17, -12], [-33, -28], [-26, -4], [-39, 2], [-22, 9], [-30, 24], [-13, 18], [-6, 25], [2, 10]], pal.hairShade, pal.outline, 3);
      poly(ctx, [[-10, -19], [-24, -37], [-13, -27], [-16, -43], [-2, -25], [4, -36], [6, -18]], pal.hair, pal.outline, 2.5);
    } else if (f.charId === 'jotaro') {
      poly(ctx, [[-15, -12], [-27, -4], [-20, 6], [-29, 15], [-14, 12], [-7, 22], [-2, 9]], pal.hairShade, pal.outline, 3);
    } else if (f.charId === 'giorno') {
      poly(ctx, [[-17, -16], [-25, -6], [-24, 10], [-16, 20], [-8, 14], [-4, 22], [2, 10], [6, 16], [8, -2]], pal.hairShade, pal.outline, 2.5);
    } else if (f.charId === 'kakyoin') {
      poly(ctx, [[-16, -12], [-26, 2], [-21, 24], [-29, 46], [-16, 36], [-11, 54], [-4, 28], [2, 18]], pal.hairShade, pal.outline, 3);
    } else if (f.charId === 'josuke') {
      // Josuke's sailor cap sits low, so only a short dark-green fringe and
      // sideburns peek out from under it.
      poly(ctx, [[-16, -10], [-23, 2], [-20, 18], [-15, 25], [-7, 15], [0, 22], [7, 12], [3, -5]], pal.hairShade, pal.outline, 2.5);
      poly(ctx, [[-18, 8], [-22, 22], [-16, 30], [-9, 20], [-7, 10]], pal.hair, pal.outline, 2);
    }

    // hair highlights / hat rim
    ctx.save();
    ctx.globalAlpha = 0.58;
    ctx.strokeStyle = tint(pal.hair, 48);
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    if (f.charId === 'dio') {
      ctx.beginPath();
      ctx.moveTo(-20, -30); ctx.lineTo(-12, -22);
      ctx.moveTo(-13, -38); ctx.lineTo(-5, -27);
      ctx.moveTo(-3, -33); ctx.lineTo(3, -23);
      ctx.stroke();
    } else if (f.charId === 'giorno') {
      ctx.beginPath();
      ctx.moveTo(-20, -15); ctx.lineTo(-14, -2);
      ctx.moveTo(-13, -22); ctx.lineTo(-7, -9);
      ctx.stroke();
    } else if (f.charId === 'kakyoin') {
      ctx.beginPath();
      ctx.moveTo(-19, -4); ctx.lineTo(-12, 18);
      ctx.moveTo(-12, 2); ctx.lineTo(-7, 22);
      ctx.stroke();
    } else if (f.charId === 'josuke') {
      ctx.strokeStyle = tint(pal.hair, 58);
      ctx.beginPath();
      ctx.moveTo(-16, 2); ctx.lineTo(-10, 16);
      ctx.moveTo(-10, -2); ctx.lineTo(-4, 12);
      ctx.stroke();
    } else {
      ctx.strokeStyle = pal.trim || pal.accent;
      ctx.beginPath();
      ctx.moveTo(-14, -15); ctx.lineTo(12, -15);
      ctx.stroke();
    }
    ctx.restore();

    // neck
    drawBone(ctx, -2, 17, 1, 30, 9, pal.skinShade, pal.outline, 5);

    // face
    ctx.beginPath();
    ctx.ellipse(1, 0, 18, 21.5, 0.03, 0, TAU);
    ctx.fillStyle = pal.skin;
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 2.8;
    ctx.stroke();

    // jaw shadow + cheek light
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(1, 0, 18, 21.5, 0.03, 0, TAU);
    ctx.clip();
    ctx.fillStyle = pal.skinShade;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(-10, 2, 10, 20, -0.15, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = tint(pal.skin, 30);
    ctx.beginPath();
    ctx.ellipse(8, -4, 6, 10, -0.12, 0, TAU);
    ctx.fill();
    ctx.restore();

    // ear
    circle(ctx, -12, 2, 4.8, pal.skin, pal.outline, 2);
    ctx.beginPath();
    ctx.arc(-12, 2, 2.1, -0.8, 1.2);
    ctx.strokeStyle = pal.skinShade;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (f.charId === 'dio') {
      // high collar behind
      poly(ctx, [[-18, 18], [-23, 38], [4, 32], [15, 19], [8, 17], [-4, 24], [-12, 14]], pal.coat, pal.outline, 2.5);
    } else if (f.charId === 'kakyoin') {
      poly(ctx, [[-17, 19], [-20, 37], [8, 34], [15, 20], [5, 24], [-5, 27]], pal.coatShade, pal.outline, 2.5);
    } else if (f.charId === 'jotaro') {
      poly(ctx, [[-15, 20], [-20, 34], [9, 31], [14, 19], [2, 24], [-7, 22]], pal.coatShade, pal.outline, 2);
    }

    // hair fringe and character headgear
    if (f.charId === 'jotaro') drawJotaroHead(ctx, pal);
    else if (f.charId === 'dio') drawDioHead(ctx, pal);
    else if (f.charId === 'giorno') drawGiornoHead(ctx, pal);
    else if (f.charId === 'josuke') drawJosukeHead(ctx, pal);
    else drawKakyoinHead(ctx, pal);

    // Facial features sit above the fringe so the eyes stay readable in pixel form.
    // Both eyes sit on the visible side of the 3/4 face.
    drawEye(ctx, 11.0, -2, 0.9, pal);
    drawEye(ctx, 2.0, -1.2, 0.8, pal);

    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(8.0, -9.2);
    ctx.lineTo(14.2, -8.7);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0.2, -8.5);
    ctx.lineTo(5.2, -8.8);
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(13.9, 0.5);
    ctx.quadraticCurveTo(17.5, 5.2, 13.2, 6.4);
    ctx.stroke();

    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(6.2, 12.3);
    ctx.quadraticCurveTo(10.4, 13.8, 13.8, 11.4);
    ctx.stroke();
    if (f.charId === 'giorno') {
      ctx.strokeStyle = pal.lip;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(6.5, 12.7);
      ctx.quadraticCurveTo(10.5, 14.4, 14.2, 11.8);
      ctx.stroke();
    }

    ctx.strokeStyle = pal.skinShade;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-8.5, 8.5);
    ctx.lineTo(-4.5, 10.5);
    ctx.moveTo(-9, 11);
    ctx.lineTo(-6, 12.5);
    ctx.stroke();

    ctx.restore();
    return head;
  }

  function drawEye(ctx, x, y, scale, pal) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.1, 3, -0.08, 0, TAU);
    ctx.fillStyle = '#fbf3e7';
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1.35;
    ctx.stroke();
    circle(ctx, 0.8, 0.2, 2.15, pal.eye);
    circle(ctx, 0.8, 0.2, 1.05, '#0b0710');
    circle(ctx, 1.45, -0.55, 0.6, '#fff8eb');
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-5.5, -1.7);
    ctx.quadraticCurveTo(0, -4, 5.5, -1.6);
    ctx.stroke();
    ctx.restore();
  }

  function drawJotaroHead(ctx, pal) {
    // hair spikes at back
    poly(ctx, [[-12, -13], [-22, -17], [-16, -6], [-26, 1], [-15, 5], [-20, 16], [-8, 12], [-6, 20]], pal.hairShade, pal.outline, 2.4);
    // cap dome
    ctx.beginPath();
    ctx.ellipse(0, -11, 17.3, 11.5, 0, Math.PI, 0);
    ctx.lineTo(16, -8);
    ctx.quadraticCurveTo(0, -4, -17, -9);
    ctx.closePath();
    ctx.fillStyle = pal.hair;
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    // brim
    poly(ctx, [[6, -11], [29, -10], [27, -4], [4, -6]], pal.hairShade, pal.outline, 2.4);
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(8, -11, 14, 1.3);
    // gold band + emblem
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-15, -8.5);
    ctx.quadraticCurveTo(0, -4.2, 15, -8);
    ctx.stroke();
    starPath(ctx, 14, -12.5, 4.6, 1.9, 5);
    ctx.fillStyle = pal.trim;
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1;
    ctx.stroke();
    // sideburn lock, kept clear of both eyes
    poly(ctx, [[-18, -11], [-14, -5], [-13, 10], [-9, 13], [-10, -3], [-11, -10]], pal.hair, pal.outline, 1.6);
  }

  function drawDioHead(ctx, pal) {
    // swept-back hair mass / spikes
    poly(ctx, [[-15, -13], [-28, -30], [-20, -11], [-34, -18], [-22, 1], [-30, 10], [-13, 8], [-6, 2]], pal.hair, pal.outline, 2.8);
    poly(ctx, [[-12, -16], [-18, -38], [-6, -23], [-1, -43], [5, -22], [13, -33], [12, -16], [18, -19], [10, -8]], pal.hair, pal.outline, 2.6);
    // short fringe above the eyes
    poly(ctx, [[-14, -10], [-11, -5], [-6, -8], [-2, -4], [3, -8], [8, -5], [12, -11], [5, -15]], pal.hair, pal.outline, 2);
    // hair highlight
    ctx.strokeStyle = 'rgba(255,247,198,.6)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-14 + i * 7, -17);
      ctx.lineTo(-6 + i * 6, -8);
      ctx.stroke();
    }
    // earrings
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(-11, 9, 3.2, 0, TAU);
    ctx.stroke();
  }

  function drawGiornoHead(ctx, pal) {
    // bob shape
    ctx.beginPath();
    ctx.moveTo(-17, -9);
    ctx.quadraticCurveTo(-26, 4, -19, 17);
    ctx.quadraticCurveTo(-13, 23, -6, 11);
    ctx.lineTo(-4, -9);
    ctx.closePath();
    ctx.fillStyle = pal.hair;
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // fringe kept above the eye line
    poly(ctx, [[-16, -10], [-15, -2], [-9, -6], [-7, -1], [-2, -7], [3, -3], [8, -7], [14, -4], [16, -14], [5, -18], [-7, -17]], pal.hair, pal.outline, 2);
    // curls
    circle(ctx, -8, -9, 4.3, pal.hair, pal.outline, 1.8);
    circle(ctx, -3.5, -13, 4, pal.hair, pal.outline, 1.8);
    circle(ctx, 1.5, -10, 3.6, pal.hair, pal.outline, 1.8);
    circle(ctx, 8, -7, 3.2, pal.hair, pal.outline, 1.6);
    // highlight
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(-3, -6, 10, 3.6, 5.2);
    ctx.stroke();
    // braid / side lock
    ctx.strokeStyle = pal.hair;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-16, 4);
    ctx.quadraticCurveTo(-24, 14, -20, 28);
    ctx.stroke();
  }

  function drawKakyoinHead(ctx, pal) {
    // long side hair
    poly(ctx, [[-16, -11], [-26, -2], [-23, 16], [-30, 34], [-17, 25], [-12, 39], [-6, 16], [-2, 8]], pal.hairShade, pal.outline, 2.4);
    // fringe
    poly(ctx, [[-15, -10], [-13, 4], [-8, -3], [-4, 8], [0, -4], [6, 5], [10, -4], [16, -6], [14, -16], [3, -19], [-8, -17]], pal.hair, pal.outline, 2);
    // long side lock, outside the eye
    poly(ctx, [[12, -13], [17, -6], [15, 10], [20, 23], [13, 15], [11, 2]], pal.hair, pal.outline, 2);
    // shine
    ctx.strokeStyle = 'rgba(255,210,187,.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-8, -14);
    ctx.quadraticCurveTo(0, -17, 8, -13);
    ctx.stroke();
    // cherry earring
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-11, 6);
    ctx.lineTo(-11, 12);
    ctx.stroke();
    circle(ctx, -14, 14, 3.1, '#d72e4d', pal.outline, 1.2);
    circle(ctx, -8, 14, 3.1, '#d72e4d', pal.outline, 1.2);
    ctx.strokeStyle = '#67c47b';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-11, 10);
    ctx.quadraticCurveTo(-16, 7, -19, 9);
    ctx.stroke();
  }

  function drawJosukeHead(ctx, pal) {
    // Dark green fringe under the sailor cap.
    poly(ctx, [[-17, -9], [-14, 3], [-8, -4], [-4, 7], [1, -3], [7, 5], [13, -3], [17, -7], [14, -17], [3, -21], [-9, -19]], pal.hair, pal.outline, 2);

    // Sailor cap crown.
    ctx.beginPath();
    ctx.moveTo(-22, -15);
    ctx.quadraticCurveTo(-25, -31, -8, -36);
    ctx.quadraticCurveTo(10, -40, 22, -28);
    ctx.quadraticCurveTo(27, -20, 23, -14);
    ctx.closePath();
    ctx.fillStyle = pal.coat;
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Blue band around the cap.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-22, -16);
    ctx.quadraticCurveTo(0, -22, 23, -15);
    ctx.lineTo(23, -11);
    ctx.quadraticCurveTo(0, -18, -22, -12);
    ctx.closePath();
    ctx.fillStyle = pal.trim;
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    // Brim, tipped slightly forward.
    poly(ctx, [[-26, -14], [25, -14], [30, -8], [21, -5], [-20, -6], [-29, -9]], pal.coatShade, pal.outline, 2);

    // Cap star pin.
    starPath(ctx, -7, -25, 4, 1.6, 5);
    ctx.fillStyle = pal.metal;
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1;
    ctx.stroke();

    // A couple of cap seams keep the white shape legible against the stage.
    ctx.strokeStyle = 'rgba(60,80,105,.45)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-8, -33);
    ctx.quadraticCurveTo(-2, -24, 4, -22);
    ctx.moveTo(12, -29);
    ctx.quadraticCurveTo(8, -22, 7, -18);
    ctx.stroke();
  }

  function drawTorso(ctx, f, p, parts, pal) {
    const { hip, chest, neck } = parts;
    const a = p.torso * DEG;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    const hipL = { x: hip.x - 15, y: hip.y + 2 };
    const hipR = { x: hip.x + 15, y: hip.y + 2 };
    const chL = { x: chest.x - 22 * nx, y: chest.y + 2 * ny };
    const chR = { x: chest.x + 22 * nx, y: chest.y - 2 * ny };
    const nL = { x: neck.x - 11, y: neck.y + 1 };
    const nR = { x: neck.x + 11, y: neck.y + 1 };

    // shirt visible at neck
    poly(ctx, [[nL.x, nL.y], [nR.x, nR.y], [chR.x + 2, chR.y + 14], [chest.x, chest.y + 27], [chL.x - 2, chL.y + 14]], pal.shirt, pal.outline, 2.6);

    // jacket body
    ctx.beginPath();
    ctx.moveTo(hipL.x, hipL.y);
    ctx.quadraticCurveTo(chL.x - 6, chL.y + 21, chL.x, chL.y + 3);
    ctx.quadraticCurveTo(chL.x + 3, chL.y - 7, nL.x - 3, nL.y);
    ctx.lineTo(nR.x + 2, nR.y);
    ctx.quadraticCurveTo(chR.x - 2, chR.y - 4, chR.x + 3, chR.y + 5);
    ctx.quadraticCurveTo(chR.x + 7, chR.y + 21, hipR.x, hipR.y);
    ctx.closePath();
    ctx.fillStyle = pal.coat;
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 3;
    ctx.stroke();

    // shaded side
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(hipL.x, hipL.y);
    ctx.quadraticCurveTo(chL.x - 6, chL.y + 21, chL.x, chL.y + 3);
    ctx.quadraticCurveTo(chL.x + 3, chL.y - 7, nL.x - 3, nL.y);
    ctx.lineTo(nL.x + 4, nL.y);
    ctx.lineTo(chL.x + 8, chL.y + 20);
    ctx.lineTo(hipL.x + 7, hipL.y);
    ctx.closePath();
    ctx.fillStyle = pal.coatShade;
    ctx.globalAlpha = 0.7;
    ctx.fill();
    ctx.restore();

    // coat highlight and folds
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.strokeStyle = tint(pal.coat, 58);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(chR.x - 3, chR.y + 11);
    ctx.quadraticCurveTo(chR.x + 6, chR.y + 34, hipR.x - 4, hipR.y - 4);
    ctx.stroke();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = pal.coatShade;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(chL.x + 8, chL.y + 24);
    ctx.quadraticCurveTo(hip.x - 8, hip.y - 16, hipL.x + 4, hipL.y - 2);
    ctx.moveTo(chR.x - 8, chR.y + 38);
    ctx.quadraticCurveTo(hip.x + 6, hip.y - 6, hipR.x - 2, hipR.y - 4);
    ctx.stroke();
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = pal.trim || pal.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(nR.x - 2, nR.y + 4);
    ctx.lineTo(chR.x - 3, chR.y + 9);
    ctx.stroke();
    ctx.restore();

    // lapels / shirt V
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(nL.x + 2, nL.y + 2);
    ctx.lineTo(chest.x - 3, chest.y + 18);
    ctx.lineTo(chest.x + 1, chest.y + 27);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(nR.x - 2, nR.y + 2);
    ctx.lineTo(chest.x + 4, chest.y + 19);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(nL.x + 4, nL.y + 4);
    ctx.lineTo(chest.x - 1, chest.y + 21);
    ctx.stroke();

    // belt
    const beltY = hip.y + 4;
    ctx.save();
    ctx.translate(hip.x, beltY);
    ctx.rotate(a);
    ctx.fillStyle = pal.belt || pal.outline;
    ctx.fillRect(-17, -4, 34, 7);
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-17, -4, 34, 7);
    if (pal.metal) {
      ctx.fillStyle = pal.metal;
      ctx.fillRect(-4, -4.5, 8, 8);
    }
    ctx.restore();

    // character chest details
    if (f.charId === 'jotaro') {
      ctx.save();
      ctx.strokeStyle = pal.trim;
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        circle(ctx, nL.x + 4 + i * 5, nL.y + 7 + i * 4.6, 1.8, pal.trim);
      }
      ctx.restore();
      // chain star
      starPath(ctx, nL.x + 31, nL.y + 33, 4, 1.7, 5);
      ctx.fillStyle = pal.trim;
      ctx.fill();
    } else if (f.charId === 'dio') {
      drawHeart(ctx, chest.x + 16, chest.y + 24, 6, '#b31f3d', pal.outline);
      ctx.strokeStyle = 'rgba(255,255,255,.14)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(chest.x - 15, chest.y + 15);
      ctx.quadraticCurveTo(chest.x + 2, chest.y + 24, chest.x + 17, chest.y + 14);
      ctx.stroke();
    } else if (f.charId === 'giorno') {
      // chest cutout
      poly(ctx, [[chest.x - 9, chest.y + 9], [chest.x + 2, chest.y + 30], [chest.x + 11, chest.y + 12]], pal.shirt, pal.outline, 1.5);
      // ladybug brooch
      circle(ctx, chest.x + 15, chest.y + 10, 5, '#d7434f', pal.outline, 1.4);
      circle(ctx, chest.x + 13.5, chest.y + 9, 1.2, '#1c1420');
      circle(ctx, chest.x + 16.5, chest.y + 8, 1, '#1c1420');
      circle(ctx, chest.x + 15.5, chest.y + 12, 1, '#1c1420');
      ctx.strokeStyle = pal.trim;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(chest.x + 6, chest.y + 18, 8, 0.3, 1.8);
      ctx.stroke();
    } else if (f.charId === 'kakyoin') {
      // high collar
      poly(ctx, [[nL.x - 1, nL.y + 2], [nL.x + 2, nL.y - 8], [nR.x - 2, nR.y - 8], [nR.x + 1, nR.y + 2]], pal.coatShade, pal.outline, 2);
      ctx.strokeStyle = pal.trim;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(nL.x + 4, nL.y + 3);
      ctx.lineTo(nL.x + 8, nL.y + 24);
      ctx.stroke();
    } else if (f.charId === 'josuke') {
      // Sailor collar: navy flap with white piping, a blue bow, and the
      // green/yellow star pin from the reference sheet.
      poly(ctx, [
        [nL.x - 2, nL.y + 1], [chest.x - 17, chest.y + 24],
        [chest.x - 4, chest.y + 31], [chest.x + 1, chest.y + 24]
      ], pal.shirt, pal.outline, 2);
      poly(ctx, [
        [nR.x + 2, nR.y + 1], [chest.x + 18, chest.y + 23],
        [chest.x + 5, chest.y + 31], [chest.x + 1, chest.y + 24]
      ], pal.shirt, pal.outline, 2);
      ctx.strokeStyle = pal.coat;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(nL.x - 1, nL.y + 4);
      ctx.lineTo(chest.x - 12, chest.y + 25);
      ctx.moveTo(nR.x + 1, nR.y + 4);
      ctx.lineTo(chest.x + 13, chest.y + 24);
      ctx.stroke();
      // bow
      poly(ctx, [[chest.x - 2, chest.y + 27], [chest.x - 12, chest.y + 21], [chest.x - 12, chest.y + 32]], pal.trim, pal.outline, 1.4);
      poly(ctx, [[chest.x + 2, chest.y + 27], [chest.x + 12, chest.y + 21], [chest.x + 12, chest.y + 32]], pal.trim, pal.outline, 1.4);
      circle(ctx, chest.x, chest.y + 27, 4, pal.trim, pal.outline, 1.4);
      // star pin
      starPath(ctx, chest.x - 19, chest.y + 41, 7, 2.8, 5);
      ctx.fillStyle = pal.metal;
      ctx.fill();
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      circle(ctx, chest.x - 19, chest.y + 41, 3.2, '#3d7a3f');
    }
  }

  function drawCoatTails(ctx, f, p, parts, pal, t) {
    const hip = parts.hip;
    const flare = p.coat / 20;
    const flutter = Math.sin(t * 4.2 + (f.seed || 0) * 1.7) * (1.2 + flare * 2.4);
    ctx.save();
    ctx.translate(flutter, Math.abs(flutter) * 0.4);
    if (f.charId === 'jotaro') {
      // long back tail
      poly(ctx, [[hip.x - 15, hip.y], [hip.x - 25 - flare * 8, hip.y + 48], [hip.x - 40 - flare * 10, hip.y + 84], [hip.x - 17 - flare * 8, hip.y + 76], [hip.x - 2, hip.y + 38]], pal.coatShade, pal.outline, 2.6);
      // front tail
      poly(ctx, [[hip.x + 15, hip.y], [hip.x + 24 + flare * 4, hip.y + 49], [hip.x + 29 + flare * 12, hip.y + 82], [hip.x + 8 + flare * 6, hip.y + 73], [hip.x + 1, hip.y + 36]], pal.coat, pal.outline, 2.6);
      ctx.strokeStyle = pal.trim;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hip.x + 18, hip.y + 8);
      ctx.lineTo(hip.x + 24, hip.y + 73);
      ctx.stroke();
    } else if (f.charId === 'dio') {
      poly(ctx, [[hip.x - 15, hip.y], [hip.x - 23 - flare * 7, hip.y + 44], [hip.x - 35 - flare * 10, hip.y + 78], [hip.x - 10, hip.y + 70], [hip.x - 2, hip.y + 36]], pal.coatShade, pal.outline, 2.5);
      drawHeart(ctx, hip.x - 22, hip.y + 60, 5, '#b31f3d', pal.outline);
    } else if (f.charId === 'giorno') {
      poly(ctx, [[hip.x - 14, hip.y], [hip.x - 25 - flare * 6, hip.y + 45], [hip.x - 32 - flare * 8, hip.y + 77], [hip.x - 10, hip.y + 70], [hip.x - 2, hip.y + 34]], pal.coatShade, pal.outline, 2.4);
      poly(ctx, [[hip.x + 13, hip.y], [hip.x + 24 + flare * 4, hip.y + 44], [hip.x + 27 + flare * 7, hip.y + 75], [hip.x + 9, hip.y + 68], [hip.x + 1, hip.y + 32]], pal.coat, pal.outline, 2.4);
    } else if (f.charId === 'josuke') {
      // Short sailor blouse flap instead of a long coat tail.
      poly(ctx, [[hip.x - 15, hip.y - 2], [hip.x - 20 - flare * 2, hip.y + 28], [hip.x - 6, hip.y + 36], [hip.x - 1, hip.y + 12]], pal.coatShade, pal.outline, 2.2);
      poly(ctx, [[hip.x + 14, hip.y - 2], [hip.x + 20 + flare * 2, hip.y + 27], [hip.x + 7, hip.y + 35], [hip.x + 1, hip.y + 12]], pal.coat, pal.outline, 2.2);
      ctx.strokeStyle = pal.trim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hip.x - 18, hip.y + 12);
      ctx.lineTo(hip.x - 9, hip.y + 29);
      ctx.moveTo(hip.x + 18, hip.y + 11);
      ctx.lineTo(hip.x + 10, hip.y + 28);
      ctx.stroke();
    } else {
      poly(ctx, [[hip.x - 14, hip.y], [hip.x - 19 - flare * 3, hip.y + 39], [hip.x - 22, hip.y + 68], [hip.x - 7, hip.y + 61], [hip.x, hip.y + 31]], pal.coatShade, pal.outline, 2.2);
    }
    ctx.restore();
  }

  function drawLegs(ctx, f, p, parts, pal, backOnly) {
    const hip = parts.hip;
    const legs = [
      { front: false, hx: hip.x - 8, footX: p.footBX, footY: p.footBY, color: pal.pantsShade, shoe: pal.shoes },
      { front: true, hx: hip.x + 8, footX: p.footFX, footY: p.footFY, color: pal.pants, shoe: pal.shoes }
    ];
    for (const leg of legs) {
      if (backOnly && leg.front) continue;
      if (!backOnly && !leg.front) continue;
      const hy = hip.y + 3;
      const fx = leg.footX;
      const fy = leg.footY - 5;
      const ik = solveIK(leg.hx, hy, fx, fy, 49, 47, -1);
      drawBone(ctx, leg.hx, hy, ik.x, ik.y, 16, leg.color, pal.outline, 6);
      drawBone(ctx, ik.x, ik.y, ik.fx, ik.fy, 13, leg.color, pal.outline, 6);

      // thigh / knee highlights
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = tint(leg.color, 42);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(leg.hx + 2, hy + 8);
      ctx.quadraticCurveTo(leg.hx + 7, hy + 26, ik.x + 3, ik.y - 4);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(ik.x - 3, ik.y - 5);
      ctx.lineTo(ik.x + 3, ik.y + 2);
      ctx.stroke();

      // shoe
      ctx.save();
      ctx.translate(ik.fx + 4, ik.fy + 1);
      const footA = Math.atan2(ik.fy - ik.y, ik.fx - ik.x) + Math.PI / 2;
      ctx.rotate(clamp(footA * 0.2, -0.18, 0.18));
      ctx.beginPath();
      ctx.ellipse(5, 1, 15, 7, 0.02, 0, TAU);
      ctx.fillStyle = leg.shoe;
      ctx.fill();
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.13)';
      ctx.fillRect(-3, -4, 10, 1.4);
      ctx.restore();
    }
  }

  function drawArms(ctx, f, p, parts, pal, backOnly) {
    const { chest } = parts;
    const arms = [
      {
        front: false,
        sx: chest.x - 11,
        sy: chest.y + 6,
        up: p.armBU,
        low: p.armBL,
        sleeve: pal.coatShade,
        hand: pal.skinShade
      },
      {
        front: true,
        sx: chest.x + 11,
        sy: chest.y + 6,
        up: p.armFU,
        low: p.armFL,
        sleeve: pal.coat,
        hand: pal.skin
      }
    ];
    for (const arm of arms) {
      if (backOnly && arm.front) continue;
      if (!backOnly && !arm.front) continue;
      const shoulder = { x: arm.sx, y: arm.sy };
      const elbow = joint(shoulder, 40, arm.up);
      const wrist = joint(elbow, 34, arm.low);
      // upper sleeve
      drawBone(ctx, shoulder.x, shoulder.y, elbow.x, elbow.y, 15, arm.sleeve, pal.outline, 6);
      // forearm sleeve
      drawBone(ctx, elbow.x, elbow.y, wrist.x, wrist.y, 13, arm.sleeve, pal.outline, 6);
      ctx.save();
      ctx.globalAlpha = arm.front ? 0.52 : 0.26;
      ctx.strokeStyle = tint(arm.sleeve, 48);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo((shoulder.x + elbow.x) / 2 - 2, (shoulder.y + elbow.y) / 2);
      ctx.lineTo((elbow.x + wrist.x) / 2 - 1, (elbow.y + wrist.y) / 2);
      ctx.stroke();
      ctx.restore();

      // cuff
      const cuff = joint(elbow, 27, arm.low);
      drawBone(ctx, cuff.x, cuff.y, wrist.x, wrist.y, 13.5, pal.trim, pal.outline, 5);
      // hand / fist
      const fist = joint(wrist, 5.5, arm.low);
      circle(ctx, fist.x, fist.y, 6.3, arm.hand, pal.outline, 2.2);
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(fist.x + 1, fist.y - 3);
      ctx.lineTo(fist.x + 5, fist.y - 1);
      ctx.moveTo(fist.x + 1, fist.y + 1);
      ctx.lineTo(fist.x + 5, fist.y + 2);
      ctx.stroke();
      // shoulder seam
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(shoulder.x, shoulder.y, 8, -1.2, 1.1);
      ctx.stroke();
    }
  }

  // World-space (fighter-local) position of Star Platinum's punching fist.
  // Mirrors the transform in drawStand so hitboxes follow the visible hand
  // instead of a rectangle floating in front of the body.
  function standFist(f, t) {
    const attacking = !!(f.airStandActive || f.state === 'attack' || f.state === 'special' || f.state === 'super');
    const airSlam = !!f.airStandActive;
    const ext = attacking && f.attack ? clamp(attackPhase(f).ext, 0, 1) : 0;
    // Use the attack pose's target position rather than the lagging visual
    // standX. Hit detection runs before the next Art.updatePose, so otherwise
    // the first active frames would use a fist still parked behind the body.
    let sx, sy, scale;
    if (f.state === 'attack' && !airSlam) {
      sx = 52 + ext * 14;
      sy = -13 - ext * 2;
      scale = 1.2;
    } else if (f.state === 'attack' && airSlam) {
      sx = 64;
      sy = -12;
      scale = 1.12;
    } else {
      sx = f.standX != null ? f.standX : airSlam ? 64 : attacking ? 42 : -40;
      sy = f.standY != null ? f.standY : attacking ? -12 : -8;
      scale = f.standScale != null ? f.standScale : airSlam ? 1.12 : attacking ? 1.2 : 1.03;
    }
    const punch = Math.max(0, Math.sin(t * 25)) * 0.5 + 0.55;
    const lightJab = attacking && f.attack && f.attack.kind === 'light' ? 1 : 0;
    const armF = airSlam ? 27 + punch * 6 : attacking ? 82 + punch * 13 + lightJab * 5 : 66;
    const elbowF = airSlam ? 14 + punch * 4 : attacking ? 92 + lightJab * 4 : 118;
    const shF = { x: 29, y: -136 };
    const elF = joint(shF, 40, armF);
    const wrF = joint(elF, 39, elbowF);

    let x = wrF.x * scale;
    let y = wrF.y * scale;
    if (airSlam) {
      const a = 0.22;
      const rx = x * Math.cos(a) - y * Math.sin(a);
      const ry = x * Math.sin(a) + y * Math.cos(a);
      x = rx; y = ry;
    }
    const attackTilt = 0.02 + ext * 0.055;
    let rx = x * Math.cos(attackTilt) - y * Math.sin(attackTilt);
    let ry = x * Math.sin(attackTilt) + y * Math.cos(attackTilt);
    ry -= ext * 3;
    const tilt = f.standTilt || 0;
    const fx = rx * Math.cos(tilt) - ry * Math.sin(tilt);
    const fy = rx * Math.sin(tilt) + ry * Math.cos(tilt);
    return { x: sx + fx, y: sy + fy };
  }

  function drawStand(ctx, f, t, mode) {
    const char = JG.CHARACTERS[f.charId];
    const pal = f.palette || char.palette;
    const attacking = mode === 'attack' || mode === 'super';
    const guarding = mode === 'guard';
    const airSlam = !!f.airStandActive;
    // When the Stand is idling behind the user, hide its face/eyes so they do
    // not peek out beside the user's head as a second pair of eyes.
    const behind = !attacking && !guarding && !airSlam;
    const pixel = !!f.pixelRender;
    const outline = pal.outline || '#17101f';
    const baseAlpha = f.standAlpha == null ? (attacking ? 0.96 : guarding ? 0.94 : pixel ? 0.84 : 0.56) : f.standAlpha;
    if (baseAlpha <= 0.01) return;
    const sx = f.standX != null ? f.standX : airSlam ? 64 : f.state === 'attack' ? 52 : attacking ? 42 : -40;
    const sy = f.standY != null ? f.standY : attacking ? -12 : -8;
    const scale = f.standScale != null ? f.standScale : airSlam ? 1.12 : attacking ? 1.2 : 1.03;
    const color = pal.aura || '#8a6bff';
    const color2 = pal.aura2 || '#59e5ff';

    ctx.save();
    ctx.translate(sx, sy);
    if (f.standTilt) ctx.rotate(f.standTilt);
    const attackExt = attacking && f.attack ? clamp(attackPhase(f).ext, 0, 1) : 0;
    if (attackExt > 0) {
      ctx.translate(0, -attackExt * 3);
      ctx.rotate(0.02 + attackExt * 0.055);
    }
    if (airSlam) ctx.rotate(0.22);
    ctx.scale(scale, scale);
    ctx.globalAlpha = baseAlpha;

    // Pixel mode uses a clean energy ring instead of a large gradient blob.
    if (!pixel) {
      const g = ctx.createRadialGradient(0, -110, 10, 0, -110, 150);
      g.addColorStop(0, color + '66');
      g.addColorStop(0.55, color + '22');
      g.addColorStop(1, color + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, -105, 120, 160, 0, 0, TAU);
      ctx.fill();
    } else {
      ctx.save();
      ctx.globalAlpha = baseAlpha * 0.2;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, -102, 56, 78, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    if (guarding) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = baseAlpha * 0.3;
      ctx.strokeStyle = color2;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, -104, 72, -1.28, 1.28);
      ctx.stroke();
      ctx.globalAlpha = baseAlpha * 0.16;
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.restore();
    }

    // legs / wisps
    const legSwing = f.state === 'walk' ? Math.sin(t * 9.2) * 7 : attacking ? Math.sin(t * 25) * 2.6 : 0;
    const legPath = new Path2D();
    legPath.moveTo(-11, -54);
    legPath.quadraticCurveTo(-22 - legSwing * 0.35, -20, -13 - legSwing, 16 + Math.sin(t * 3) * 5);
    legPath.moveTo(12, -54);
    legPath.quadraticCurveTo(25 + legSwing * 0.35, -18, 16 + legSwing, 16 + Math.cos(t * 3) * 5);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    ctx.stroke(legPath);
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.stroke(legPath);
    ctx.strokeStyle = color2;
    ctx.globalAlpha = baseAlpha * 0.55;
    ctx.lineWidth = 2;
    ctx.stroke(legPath);
    ctx.globalAlpha = baseAlpha;
    circle(ctx, -13 - legSwing, 18 + Math.sin(t * 3) * 5, 6, color, outline, 2);
    circle(ctx, 16 + legSwing, 18 + Math.cos(t * 3) * 5, 6, color, outline, 2);
    if (f.charId === 'dio') {
      drawHeart(ctx, -13 - legSwing, 12, 4, color2, outline);
      drawHeart(ctx, 16 + legSwing, 12, 4, color2, outline);
    } else if (f.charId === 'jotaro') {
      starPath(ctx, -13 - legSwing, 12, 3.5, 1.4, 5);
      ctx.fillStyle = color2;
      ctx.fill();
      starPath(ctx, 16 + legSwing, 12, 3.5, 1.4, 5);
      ctx.fillStyle = color2;
      ctx.fill();
    }
    ctx.globalAlpha = baseAlpha * 0.35;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-28, -60);
    ctx.quadraticCurveTo(-44, -10, -31, 26);
    ctx.moveTo(28, -58);
    ctx.quadraticCurveTo(42, -8, 30, 24);
    ctx.stroke();
    ctx.globalAlpha = baseAlpha;

    ctx.globalAlpha = baseAlpha;
    // torso
    ctx.beginPath();
    ctx.moveTo(-28, -58);
    ctx.lineTo(-36, -112);
    ctx.quadraticCurveTo(-42, -135, -24, -142);
    ctx.lineTo(24, -142);
    ctx.quadraticCurveTo(42, -135, 36, -112);
    ctx.lineTo(28, -58);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = baseAlpha * 0.96;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3;
    ctx.globalAlpha = baseAlpha;
    ctx.stroke();

    // chest / abdominal muscle bands for a more readable humanoid silhouette
    ctx.save();
    ctx.strokeStyle = outline;
    ctx.globalAlpha = baseAlpha * 0.52;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-22, -126);
    ctx.quadraticCurveTo(0, -119, 22, -126);
    ctx.moveTo(-16, -112);
    ctx.quadraticCurveTo(0, -106, 16, -112);
    ctx.moveTo(-12, -98);
    ctx.quadraticCurveTo(0, -94, 12, -98);
    ctx.moveTo(-9, -84);
    ctx.quadraticCurveTo(0, -80, 9, -84);
    ctx.stroke();
    ctx.strokeStyle = color2;
    ctx.globalAlpha = baseAlpha * 0.28;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-2, -140);
    ctx.lineTo(-2, -66);
    ctx.stroke();
    ctx.restore();

    // chest armour plate
    ctx.save();
    ctx.globalAlpha = baseAlpha * 0.34;
    poly(ctx, [
      [-23, -134], [-11, -126], [0, -134], [11, -126], [23, -134],
      [19, -112], [0, -103], [-19, -112]
    ], color2, outline, 1.6);
    ctx.restore();

    // waist cloth / loin guard
    ctx.save();
    ctx.globalAlpha = baseAlpha * 0.5;
    poly(ctx, [[-20, -72], [20, -72], [26, -48], [0, -34], [-26, -48]], color2, outline, 1.5);
    ctx.restore();

    // shoulder armour
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(-37, -132, 19, 13, -0.3, 0, TAU);
    ctx.ellipse(37, -132, 19, 13, 0.3, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // armour spikes
    poly(ctx, [[-52, -138], [-64, -132], [-51, -124]], color2, outline, 1.5);
    poly(ctx, [[52, -138], [64, -132], [51, -124]], color2, outline, 1.5);
    if (f.charId === 'josuke') {
      // Soft & Wet's gold shoulder stars.
      starPath(ctx, -37, -132, 7, 2.8, 5);
      ctx.fillStyle = pal.metal || '#e8c84a';
      ctx.fill();
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      starPath(ctx, 37, -132, 7, 2.8, 5);
      ctx.fillStyle = pal.metal || '#e8c84a';
      ctx.fill();
      ctx.stroke();
    }

    // head — masked face for Hierophant, expressive faces for the humanoid Stands
    const faceColor = f.charId === 'kakyoin' ? '#e9fff2' : color;
    ctx.beginPath();
    ctx.ellipse(0, -157, 15, 18, 0, 0, TAU);
    ctx.fillStyle = faceColor;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = baseAlpha * 0.34;
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.ellipse(7, -154, 5.5, 9, -0.2, 0, TAU);
    ctx.fill();
    ctx.restore();
    // hair / crest
    if (f.charId === 'jotaro') {
      poly(ctx, [[-14, -168], [-4, -188], [3, -176], [12, -186], [15, -165], [8, -152], [-7, -154]], color2, null);
      ctx.globalAlpha = baseAlpha * 0.8;
      ctx.fill();
    } else if (f.charId === 'dio') {
      poly(ctx, [[-15, -164], [-22, -183], [-8, -174], [-6, -191], [4, -176], [14, -184], [15, -164]], color2, null);
      ctx.globalAlpha = baseAlpha * 0.8;
      ctx.fill();
    } else if (f.charId === 'giorno') {
      circle(ctx, -10, -168, 6, color2);
      circle(ctx, -2, -172, 6, color2);
      circle(ctx, 6, -168, 5, color2);
    } else if (f.charId === 'josuke') {
      // Soft & Wet's smooth helmet and two side fins.
      poly(ctx, [[-14, -163], [-29, -168], [-25, -151], [-12, -146]], color2, outline, 2);
      poly(ctx, [[14, -163], [29, -168], [25, -151], [12, -146]], color2, outline, 2);
      ctx.strokeStyle = pal.standTrim || pal.trim || '#6e50a8';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -179);
      ctx.lineTo(0, -101);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-1, -175);
      ctx.lineTo(-1, -108);
      ctx.stroke();
    } else {
      // tendrils
      ctx.strokeStyle = color2;
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = -1.9 + i * 0.35;
        ctx.beginPath();
        ctx.moveTo(0, -160);
        ctx.quadraticCurveTo(Math.cos(a) * 35, -175 + Math.sin(a) * 30, Math.cos(a) * 55, -145 + Math.sin(a) * 50);
        ctx.stroke();
      }
    }

    if (!behind) {
      if (f.charId === 'josuke') {
        // Dark eye band under the helmet, like the reference art.
        ctx.save();
        ctx.globalAlpha = baseAlpha * 0.88;
        ctx.fillStyle = pal.standTrim || pal.trim || '#6e50a8';
        ctx.beginPath();
        ctx.ellipse(0, -159, 13, 6.2, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      // brows / mask slits
      ctx.save();
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-10, -165);
      ctx.lineTo(-1, -163);
      ctx.moveTo(2, -163);
      ctx.lineTo(11, -165);
      ctx.stroke();
      if (f.charId === 'kakyoin') {
        ctx.strokeStyle = color2;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-8, -160);
        ctx.lineTo(-2, -159);
        ctx.moveTo(3, -159);
        ctx.lineTo(9, -160);
        ctx.stroke();
      }
      ctx.restore();

      // glowing eyes
      ctx.fillStyle = '#fff8df';
      ctx.beginPath();
      ctx.ellipse(-5, -159, 3.1, 1.5, 0, 0, TAU);
      ctx.ellipse(6, -159, 3.1, 1.5, 0, 0, TAU);
      ctx.fill();
      if (f.charId !== 'kakyoin') {
        ctx.fillStyle = outline;
        circle(ctx, -5, -159, 1.1);
        circle(ctx, 6, -159, 1.1);
        ctx.strokeStyle = outline;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-5, -147);
        ctx.quadraticCurveTo(0, -144, 6, -147);
        ctx.stroke();
      }

      // stern anime face: brows, nose, mouth
      ctx.save();
      ctx.globalAlpha = baseAlpha * 0.9;
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-11, -166);
      ctx.lineTo(-2, -164);
      ctx.moveTo(2, -164);
      ctx.lineTo(11, -166);
      ctx.moveTo(2, -157);
      ctx.lineTo(4, -152);
      ctx.lineTo(0, -151);
      ctx.moveTo(-4, -147);
      ctx.quadraticCurveTo(1, -144, 7, -147);
      ctx.stroke();
      ctx.restore();

      // head ornament / crest accents
      if (f.charId === 'jotaro') {
        ctx.fillStyle = color2;
        ctx.fillRect(-13, -171, 26, 3);
        starPath(ctx, 0, -177, 4.5, 1.8, 5);
        ctx.fillStyle = '#ffe6a6';
        ctx.fill();
      } else if (f.charId === 'dio') {
        drawHeart(ctx, 0, -171, 5, color2, outline);
      } else if (f.charId === 'giorno') {
        circle(ctx, -8, -171, 4, color2);
        circle(ctx, 2, -173, 4, color2);
      } else {
        ctx.strokeStyle = color2;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-13, -169);
        ctx.quadraticCurveTo(0, -175, 13, -169);
        ctx.stroke();
      }
    }

    // arms
    const punch = Math.max(0, Math.sin(t * 25)) * 0.5 + 0.55;
    const punch2 = Math.max(0, Math.sin(t * 25 + Math.PI)) * 0.5 + 0.55;
    const standSway = Math.sin(t * 1.9 + (f.seed || 0)) * 4;
    const standWalk = f.state === 'walk' ? Math.sin(t * 9.2) * 6 : 0;
    const lightJab = attacking && f.attack && f.attack.kind === 'light' ? 1 : 0;
    const armF = airSlam ? 27 + punch * 6 : attacking ? 82 + punch * 13 + lightJab * 5 : guarding ? 66 : 34 + standSway + standWalk;
    const armB = airSlam ? 18 : attacking ? 76 + punch2 * 12 : guarding ? 52 : -16 - standSway * 0.55 - standWalk * 0.7;
    const elbowF = airSlam ? 14 + punch * 4 : attacking ? 92 + lightJab * 4 : guarding ? 118 : 68 + standSway * 0.5;
    const elbowB = airSlam ? 20 : attacking ? 90 : guarding ? 112 : 45;
    const shF = { x: 29, y: -136 };
    const shB = { x: -29, y: -136 };
    const elF = joint(shF, 40, armF);
    const wrF = joint(elF, 39, elbowF);
    const elB = joint(shB, 40, armB);
    const wrB = joint(elB, 38, elbowB);
    // Punch afterimages make the Stand feel like it is really throwing the blow.
    if (attacking && f.attack) {
      for (let g = 1; g <= 2; g++) {
        const gf = joint(shF, 40, armF - g * 11);
        const gw = joint(gf, 39, elbowF - g * 7);
        ctx.save();
        ctx.globalAlpha = baseAlpha * (0.16 / g);
        ctx.strokeStyle = color2;
        ctx.lineWidth = 13;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(shF.x, shF.y);
        ctx.lineTo(gf.x, gf.y);
        ctx.lineTo(gw.x, gw.y);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shB.x, shB.y); ctx.lineTo(elB.x, elB.y); ctx.lineTo(wrB.x, wrB.y);
    ctx.moveTo(shF.x, shF.y); ctx.lineTo(elF.x, elF.y); ctx.lineTo(wrF.x, wrF.y);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 15;
    ctx.stroke();
    ctx.strokeStyle = color2;
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.stroke();
    circle(ctx, wrF.x, wrF.y, airSlam ? 9 : 7, color2, outline, 2);
    circle(ctx, wrB.x, wrB.y, 7, color2, outline, 2);
    if (attacking && f.attack) {
      ctx.save();
      ctx.globalAlpha = baseAlpha * 0.32;
      ctx.strokeStyle = color2;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const ly = (i - 1) * 7;
        ctx.beginPath();
        ctx.moveTo(wrF.x - 12, wrF.y + ly);
        ctx.lineTo(wrF.x - 30 - (i % 2) * 7, wrF.y + ly * 1.4);
        ctx.stroke();
      }
      if (f.attack.kind === 'light') {
        // J is a longer poke: draw an extra forward jab streak so the effect
        // reaches a little past the heavy's fist as well.
        ctx.globalAlpha = baseAlpha * 0.55;
        ctx.strokeStyle = '#fff6d0';
        ctx.lineWidth = 2.4;
        for (let i = 0; i < 2; i++) {
          const ly = (i - 0.5) * 6;
          ctx.beginPath();
          ctx.moveTo(wrF.x + 6, wrF.y + ly);
          ctx.lineTo(wrF.x + 28 + i * 6, wrF.y + ly * 1.15);
          ctx.stroke();
        }
      }
      ctx.fillStyle = '#fff8d8';
      circle(ctx, wrF.x + 2, wrF.y - 2, 2.2, '#fff8d8');
      ctx.restore();
    }
    if (airSlam) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = color2;
      ctx.globalAlpha = baseAlpha * 0.75;
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const aa = i * TAU / 5 + t * 3;
        ctx.beginPath();
        ctx.moveTo(wrF.x + Math.cos(aa) * 12, wrF.y + Math.sin(aa) * 12);
        ctx.lineTo(wrF.x + Math.cos(aa) * 30, wrF.y + Math.sin(aa) * 30);
        ctx.stroke();
      }
      ctx.restore();
    }

    // character chest emblem
    ctx.globalAlpha = baseAlpha * 0.7;
    if (f.charId === 'dio') drawHeart(ctx, 0, -110, 8, color2, null);
    else if (f.charId === 'jotaro') {
      starPath(ctx, 0, -115, 10, 4, 5);
      ctx.fillStyle = color2;
      ctx.fill();
    } else if (f.charId === 'giorno') {
      circle(ctx, 0, -112, 6, color2);
      circle(ctx, 9, -103, 4, color2);
    } else if (f.charId === 'josuke') {
      // Dark purple anchor on the chest plate.
      ctx.save();
      ctx.globalAlpha = baseAlpha * 0.9;
      ctx.strokeStyle = pal.standTrim || pal.trim || '#6e50a8';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      circle(ctx, 0, -143, 5, null, pal.standTrim || pal.trim || '#6e50a8', 3);
      ctx.beginPath();
      ctx.moveTo(0, -138);
      ctx.lineTo(0, -84);
      ctx.moveTo(-13, -119);
      ctx.lineTo(13, -119);
      ctx.moveTo(-18, -98);
      ctx.quadraticCurveTo(-17, -82, 0, -80);
      ctx.quadraticCurveTo(17, -82, 18, -98);
      ctx.moveTo(-18, -98);
      ctx.lineTo(-25, -108);
      ctx.moveTo(18, -98);
      ctx.lineTo(25, -108);
      ctx.moveTo(-8, -94);
      ctx.lineTo(-15, -102);
      ctx.moveTo(8, -94);
      ctx.lineTo(15, -102);
      ctx.stroke();
      ctx.restore();
    } else {
      circle(ctx, 0, -110, 7, color2);
      ctx.strokeStyle = color2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -110, 16, 0, TAU);
      ctx.stroke();
    }

    // energy sparks
    ctx.globalAlpha = baseAlpha * 0.8;
    for (let i = 0; i < 6; i++) {
      const a = t * 1.4 + i * 1.05;
      const r = 55 + Math.sin(t * 2 + i) * 18;
      circle(ctx, Math.cos(a) * r, -110 + Math.sin(a) * r * 0.8, 1.5, color2);
    }
    ctx.restore();
  }

  function drawRoadRoller(ctx, x, y, scale, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale || 1, scale || 1);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    // main roller drum
    ctx.fillStyle = '#2b2320';
    ctx.beginPath();
    ctx.roundRect(-128, -86, 256, 86, 30);
    ctx.fill();
    ctx.strokeStyle = '#0a0708';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.fillStyle = '#c99a2d';
    ctx.beginPath();
    ctx.roundRect(-118, -75, 236, 64, 22);
    ctx.fill();
    ctx.strokeStyle = '#f5d36a';
    ctx.lineWidth = 3;
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const dx = -92 + i * 32;
      ctx.strokeStyle = 'rgba(45,30,16,.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(dx, -70);
      ctx.lineTo(dx + 8, -12);
      ctx.stroke();
    }
    // body / cab
    ctx.fillStyle = '#b98a27';
    ctx.fillRect(-74, -187, 148, 102);
    ctx.strokeStyle = '#0a0708';
    ctx.lineWidth = 6;
    ctx.strokeRect(-74, -187, 148, 102);
    ctx.fillStyle = '#e6c24c';
    ctx.fillRect(-60, -174, 120, 28);
    ctx.fillStyle = '#3a2b25';
    ctx.fillRect(-66, -139, 44, 42);
    ctx.strokeStyle = '#0a0708';
    ctx.lineWidth = 3;
    ctx.strokeRect(-66, -139, 44, 42);
    // chimney
    ctx.fillStyle = '#40332a';
    ctx.fillRect(40, -238, 24, 56);
    ctx.fillStyle = 'rgba(210,210,210,.25)';
    circle(ctx, 52, -252, 18, 'rgba(220,220,210,.22)');
    circle(ctx, 66, -274, 24, 'rgba(220,220,210,.16)');
    // heart crest
    drawHeart(ctx, 0, -164, 12, '#c92647', '#2a1016');
    // wheels
    for (const wx of [-88, 88]) {
      circle(ctx, wx, -8, 28, '#201a18', '#080608', 5);
      circle(ctx, wx, -8, 12, '#c99a2d', '#080608', 3);
    }
    ctx.restore();
  }

  function drawTree(ctx, x, y, t, progress) {
    const k = clamp(progress, 0, 1);
    if (k <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.72 + 0.2 * Math.sin(t * 3);
    ctx.strokeStyle = '#563a2d';
    ctx.fillStyle = '#3f2b22';
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-10, -60 * k, 2, -128 * k);
    ctx.stroke();
    ctx.lineWidth = 8;
    for (let i = 0; i < 5; i++) {
      const a = -1.2 + i * 0.58 + Math.sin(t * 1.6 + i) * 0.08;
      const len = (46 + i * 9) * k;
      ctx.beginPath();
      ctx.moveTo(0, -100 * k);
      ctx.quadraticCurveTo(Math.cos(a) * len * 0.5, -120 * k, Math.cos(a) * len, -130 * k + Math.sin(a) * len * 0.35);
      ctx.stroke();
    }
    // broad branch the fighter actually stands on
    ctx.strokeStyle = '#4a3327';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(-72 * k, -58);
    ctx.quadraticCurveTo(0, -67, 72 * k, -58);
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#4fbf63';
    const crowns = [[-42, -142, 30], [0, -160, 38], [43, -140, 30], [-18, -175, 24], [24, -176, 24], [-52, -70, 16], [52, -70, 16]];
    for (const [cx, cy, rr] of crowns) {
      circle(ctx, cx * k, (cy + 40) * k - 40, rr * k, '#4fbf63', '#1f5d33', 2);
    }
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#d8ff9f';
    for (let i = 0; i < 7; i++) {
      const a = t * 1.8 + i * 1.3;
      circle(ctx, Math.cos(a) * (28 + i * 6), -150 + Math.sin(a) * 20, 2.2, '#e8ffa5');
    }
    ctx.restore();
  }

  // Giorno's short-H summon: a small, deliberately non-gory frog that hops
  // around the arena until the opponent swats it.
  function drawFrog(ctx, x, y, t, opts) {
    opts = opts || {};
    const dir = opts.dir >= 0 ? 1 : -1;
    const alpha = opts.alpha == null ? 1 : opts.alpha;
    const hop = opts.hop ? 1 : Math.abs(Math.sin(t * 4.2));
    const lift = 2 + hop * 9;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);

    // ground shadow
    ctx.save();
    ctx.globalAlpha = alpha * 0.34;
    ctx.fillStyle = '#0a160c';
    ctx.beginPath();
    ctx.ellipse(0, 0, 23 - hop * 5, 6 - hop * 1.5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.translate(0, -lift);
    ctx.scale(dir, 1);

    // back legs
    ctx.strokeStyle = '#2f7a3f';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-14, -8);
    ctx.quadraticCurveTo(-28, -15, -25, -3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(14, -8);
    ctx.quadraticCurveTo(28, -15, 25, -3);
    ctx.stroke();

    // body
    ctx.fillStyle = '#7edb63';
    ctx.strokeStyle = '#244f2b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -12, 20, 14, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // belly
    ctx.fillStyle = '#d9ffb0';
    ctx.beginPath();
    ctx.ellipse(3, -7, 11, 7, 0, 0, TAU);
    ctx.fill();

    // back spots
    ctx.fillStyle = '#4fae49';
    for (const [sx, sy, sr] of [[-10, -18, 3.2], [2, -21, 4], [12, -16, 2.6]]) {
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, TAU);
      ctx.fill();
    }

    // eyes on top
    circle(ctx, -8, -25, 6, '#7edb63', '#244f2b', 2);
    circle(ctx, 8, -25, 6, '#7edb63', '#244f2b', 2);
    circle(ctx, -8, -25, 2.4, '#10140f');
    circle(ctx, 8, -25, 2.4, '#10140f');

    // mouth
    ctx.strokeStyle = '#244f2b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -13, 8, 0.15, Math.PI - 0.15);
    ctx.stroke();

    // occasional tongue flick
    if (Math.sin(t * 2.1) > 0.76) {
      ctx.strokeStyle = '#ff8fb4';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(2, -11);
      ctx.quadraticCurveTo(20, -16, 29, -12);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTreePlatform(ctx, x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = '#5a3d2b';
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-82, -2);
    ctx.quadraticCurveTo(0, -12, 82, -2);
    ctx.stroke();
    ctx.strokeStyle = '#6d8f3f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-64, -8);
    ctx.quadraticCurveTo(0, -16, 64, -8);
    ctx.stroke();
    const leaves = [[-70, -13, 22], [-36, -18, 18], [0, -20, 20], [36, -18, 18], [70, -13, 22]];
    for (let i = 0; i < leaves.length; i++) {
      const [lx, ly, rr] = leaves[i];
      circle(ctx, lx + Math.sin(t * 2 + i) * 2, ly - 4, rr, i % 2 ? '#4fbf63' : '#65d276', '#24633a', 2);
    }
    ctx.restore();
  }

  function drawCalamityWall(ctx, x, y, t, alpha) {
    const a = alpha == null ? 1 : alpha;
    const rnd = seeded(Math.round(x) + 31);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    // dark brick slab
    ctx.fillStyle = '#17131b';
    ctx.strokeStyle = '#070509';
    ctx.lineWidth = 4;
    ctx.fillRect(-42, -270, 84, 270);
    ctx.strokeRect(-42, -270, 84, 270);
    ctx.strokeStyle = 'rgba(126, 116, 106, .32)';
    ctx.lineWidth = 1.6;
    for (let row = 0; row < 12; row++) {
      const yy = -258 + row * 22;
      ctx.beginPath();
      ctx.moveTo(-42, yy);
      ctx.lineTo(42, yy);
      ctx.stroke();
      const off = (row % 2) * 22;
      for (let bx = -42 + off; bx < 42; bx += 44) {
        ctx.beginPath();
        ctx.moveTo(bx, yy);
        ctx.lineTo(bx, yy + 22);
        ctx.stroke();
      }
    }
    // a hole through which Wonder of U emerges
    const pulse = 0.65 + 0.25 * Math.sin(t * 4.2);
    const g = ctx.createRadialGradient(0, -150, 4, 0, -150, 68);
    g.addColorStop(0, `rgba(255, 55, 80, ${0.42 * pulse})`);
    g.addColorStop(0.45, 'rgba(5, 3, 7, .88)');
    g.addColorStop(1, 'rgba(5, 3, 7, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -145, 52, 106, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 64, 85, ${0.5 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -145, 34, 88 + Math.sin(t * 3) * 3, 0, 0, TAU);
    ctx.stroke();
    // cracks
    ctx.strokeStyle = 'rgba(255, 64, 85, .35)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      const yy = -235 + rnd() * 220;
      ctx.beginPath();
      ctx.moveTo(-42, yy);
      ctx.lineTo(-42 + 8 + rnd() * 18, yy + 7 + rnd() * 9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWonderOfU(ctx, f, t, opts) {
    opts = opts || {};
    const pal = f.palette || JG.CHARACTERS[f.charId].palette;
    const outline = pal.outline || '#050407';
    const coat = pal.coat || '#15121a';
    const coatShade = pal.coatShade || '#08070b';
    const trim = pal.trim || '#d6b45a';
    const skin = pal.skin || '#d9c7a8';
    const skinShade = pal.skinShade || '#a88762';
    const eye = pal.eye || '#ff4055';
    const seed = f.seed || 0;

    let ox = 0;
    let alpha = opts.alpha == null ? 1 : opts.alpha;
    if (f.state === 'intro' && f.introT != null) {
      const k = easeOut((f.introT - 0.12) / 0.58);
      ox = -54 * (1 - k);
      alpha *= 0.35 + 0.65 * k;
    } else if (f.state === 'victory' && f.outroT != null) {
      const k = clamp((f.outroT - 0.75) / 0.85, 0, 1);
      ox = -54 * k;
      alpha *= 1 - k * 0.55;
    }

    const walk = f.state === 'walk' ? Math.sin((f.gaitPhase || t * 8)) : 0;
    const bob = Math.sin(t * 2.4 + seed) * 2.2 + Math.abs(walk) * 1.2;
    const ap = f.attack ? attackPhase(f) : null;
    const attackExt = ap ? clamp(ap.ext, 0, 1) : 0;
    const light = !!(f.attack &&
      (f.attack.kind === 'light' || f.attack.kind === 'airCane' || f.attack.kind === 'shortCane'));
    const grabbing = !!(f.specialAction && f.specialAction.type === 'wouGrab');
    const jabRaise = light
      ? (ap ? (ap.phase === 'startup' ? easeOut(ap.p) : ap.phase === 'active' ? 1 : 1 - easeIn(ap.p)) : 0)
      : 0;
    const hit = f.state === 'hitstun' ? Math.sin(t * 44 + seed) * 2.5 : 0;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ox + hit, bob);
    // Keep Wonder of U's silhouette close to the other fighters; the old
    // drawing was noticeably taller than the roster.
    ctx.scale(0.75, 0.75);
    if (walk) ctx.rotate(walk * 0.012);

    // aura states
    if (f.calamityGuard > 0 || f.wouDomain > 0) {
      const aura = f.wouDomain > 0 ? '#eef7ff' : '#ff4055';
      const a = f.wouDomain > 0 ? 0.18 : 0.28;
      const g = ctx.createRadialGradient(0, -120, 10, 0, -120, 135);
      g.addColorStop(0, aura + '55');
      g.addColorStop(0.55, aura + '18');
      g.addColorStop(1, aura + '00');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = a + Math.sin(t * 3) * 0.04;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, -120, 135, 170, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Cane: planted on the ground while walking; J raises the hand first,
    // then swings the cane forward.
    const caneHandX = 28 + walk * 3 + jabRaise * 2;
    let caneHandY = -112 + Math.abs(walk) * 1.5 - jabRaise * 120;
    let caneEndX;
    let caneEndY;
    if (light) {
      caneEndX = caneHandX + 92 + attackExt * 14;
      caneEndY = caneHandY + 12 + attackExt * 12;
    } else {
      caneEndX = caneHandX + 16 + walk * 9;
      caneEndY = 0;
    }

    // back leg
    ctx.lineCap = 'round';
    ctx.strokeStyle = outline;
    ctx.lineWidth = 17;
    ctx.beginPath();
    ctx.moveTo(-14, -66);
    ctx.quadraticCurveTo(-20 - walk * 5, -30, -20 - walk * 8, -2);
    ctx.stroke();
    ctx.strokeStyle = coatShade;
    ctx.lineWidth = 11;
    ctx.stroke();
    // front leg
    ctx.strokeStyle = outline;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(16, -66);
    ctx.quadraticCurveTo(25 + walk * 5, -30, 29 + walk * 8, -2);
    ctx.stroke();
    ctx.strokeStyle = coat;
    ctx.lineWidth = 12;
    ctx.stroke();
    // shoes
    poly(ctx, [[-35 - walk * 8, -2], [-7 - walk * 8, -2], [-7 - walk * 8, 6], [-39 - walk * 8, 6]], coatShade, outline, 2.5);
    poly(ctx, [[19 + walk * 8, -2], [45 + walk * 8, -2], [49 + walk * 8, 6], [17 + walk * 8, 6]], coatShade, outline, 2.5);

    // long coat
    ctx.beginPath();
    ctx.moveTo(-30, -176);
    ctx.quadraticCurveTo(-48, -130, -40, -52);
    ctx.lineTo(-12, -42);
    ctx.lineTo(2, -66);
    ctx.lineTo(17, -42);
    ctx.lineTo(44, -52);
    ctx.quadraticCurveTo(51, -132, 31, -176);
    ctx.closePath();
    ctx.fillStyle = coat;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 4;
    ctx.stroke();
    // coat inner shadow
    ctx.fillStyle = coatShade;
    ctx.beginPath();
    ctx.moveTo(-24, -166);
    ctx.quadraticCurveTo(-33, -120, -27, -67);
    ctx.lineTo(-4, -60);
    ctx.lineTo(6, -90);
    ctx.lineTo(2, -166);
    ctx.closePath();
    ctx.fill();
    // coat lapels / gold buttons
    ctx.strokeStyle = trim;
    ctx.globalAlpha = alpha * 0.75;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-20, -166);
    ctx.lineTo(-8, -124);
    ctx.lineTo(-22, -92);
    ctx.moveTo(22, -166);
    ctx.lineTo(9, -124);
    ctx.lineTo(24, -92);
    ctx.stroke();
    for (const by of [-140, -120, -100]) circle(ctx, 1, by, 2.4, trim);
    ctx.globalAlpha = alpha;

    // neck / high collar
    ctx.fillStyle = coatShade;
    ctx.beginPath();
    ctx.moveTo(-30, -181);
    ctx.quadraticCurveTo(0, -198, 31, -181);
    ctx.lineTo(20, -160);
    ctx.quadraticCurveTo(0, -173, -20, -160);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3;
    ctx.stroke();

    // head: pale mask, shadowed eyes, fedora
    const headX = 2 + attackExt * 2;
    const headY = -209;
    ctx.save();
    ctx.translate(headX, headY);
    // neck
    ctx.fillStyle = skinShade;
    ctx.fillRect(-8, 18, 16, 18);
    // face
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 28, -0.02, 0, TAU);
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3;
    ctx.stroke();
    // dark eye band / vertical grille
    ctx.fillStyle = '#30251f';
    ctx.beginPath();
    ctx.ellipse(2, -4, 18, 12, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#6d5940';
    ctx.lineWidth = 1.4;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 6 + 1, -13);
      ctx.lineTo(i * 6 + 1, 8);
      ctx.stroke();
    }
    // glowing eyes
    for (const ex of [-8, 9]) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const eg = ctx.createRadialGradient(ex, -5, 0, ex, -5, 12);
      eg.addColorStop(0, 'rgba(255,255,255,.95)');
      eg.addColorStop(0.35, 'rgba(255,70,90,.7)');
      eg.addColorStop(1, 'rgba(255,20,45,0)');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(ex, -5, 12, 0, TAU);
      ctx.fill();
      ctx.restore();
      circle(ctx, ex, -5, 2.6, '#fff8f3');
    }
    // mouth slit / jaw
    ctx.strokeStyle = '#4a3a2d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, 11);
    ctx.quadraticCurveTo(2, 14, 11, 10);
    ctx.stroke();
    // fedora
    ctx.fillStyle = '#07060a';
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -25, 39, 8, -0.02, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-23, -28);
    ctx.quadraticCurveTo(-24, -58, -12, -65);
    ctx.lineTo(21, -65);
    ctx.quadraticCurveTo(30, -51, 25, -27);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = trim;
    ctx.globalAlpha = alpha * 0.8;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-21, -34);
    ctx.quadraticCurveTo(1, -31, 23, -35);
    ctx.stroke();
    ctx.restore();

    // arms
    const shoulder = { x: 26, y: -171 };
    const handX = caneHandX;
    const handY = caneHandY;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 15;
    ctx.beginPath();
    if (grabbing) {
      // One arm rises and reaches forward for the calamity grab.
      ctx.moveTo(-26, -170);
      ctx.quadraticCurveTo(22, -202, 82, -176);
    } else {
      ctx.moveTo(-26, -170);
      ctx.lineTo(-35 + walk * 3, -124);
    }
    ctx.stroke();
    ctx.strokeStyle = coat;
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.quadraticCurveTo(grabbing ? 40 : 35, grabbing ? -178 : -150, handX, handY);
    ctx.stroke();
    ctx.strokeStyle = coat;
    ctx.lineWidth = 11;
    ctx.stroke();
    if (grabbing) {
      circle(ctx, 82, -176, 9, skin, outline, 2.5);
      circle(ctx, 82, -176, 17, 'rgba(255,64,85,.0)', '#ff4055', 2);
    } else {
      circle(ctx, -35 + walk * 3, -123, 6, skinShade, outline, 2);
    }
    circle(ctx, handX, handY, 7, skin, outline, 2);

    // cane: gold handle and long dark shaft
    ctx.strokeStyle = '#0c090d';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.lineTo(caneEndX, caneEndY);
    ctx.stroke();
    ctx.strokeStyle = trim;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(handX + (caneEndX - handX) * 0.06, handY + (caneEndY - handY) * 0.06);
    ctx.lineTo(handX + (caneEndX - handX) * 0.86, handY + (caneEndY - handY) * 0.86);
    ctx.stroke();
    circle(ctx, handX, handY, 5, trim, outline, 2);
    if (!light) circle(ctx, caneEndX, caneEndY - 2, 3.2, trim, outline, 1.5);

    // coat tail flutter
    ctx.strokeStyle = coatShade;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-30, -60);
    ctx.quadraticCurveTo(-54 + Math.sin(t * 3) * 3, -32, -48, 16);
    ctx.stroke();

    // pale domain glow / red calamity shimmer
    if (f.wouDomain > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = alpha * (0.22 + 0.06 * Math.sin(t * 2));
      ctx.strokeStyle = '#eef7ff';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, -112, 38 + i * 24, 88 + i * 18, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawFighterVector(ctx, f, t, opts) {
    opts = opts || {};
    const char = JG.CHARACTERS[f.charId];
    const pal = f.palette || char.palette;
    const p = f.vis || neutralPose();
    const scale = opts.scale || 1;
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;

    // ground shadow: stays on the floor while the fighter is airborne
    if (!opts.noShadow) {
      const shadowY = f.groundY != null ? f.groundY : f.y;
      const airH = f.groundY != null ? clamp(shadowY - f.y, 0, 460) : 0;
      const sw = 70 * scale * (1 - clamp(-p.footFY / 90, 0, 0.45)) * (1 - airH / 680);
      const shadowAlpha = 0.52 * (1 - clamp(airH / 430, 0, 0.68));
      ctx.save();
      ctx.translate(f.x, shadowY + 2);
      ctx.scale(1, 0.22);
      const sg = ctx.createRadialGradient(0, 0, 2, 0, 0, sw);
      sg.addColorStop(0, `rgba(0,0,0,${shadowAlpha})`);
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(0, 0, sw, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(f.x, f.y);
    if (f.state === 'ko') {
      ctx.translate(-6, -8);
      const k = clamp(f.koP || 0, 0, 1);
      ctx.rotate(-1.32 * k);
    }
    ctx.scale(f.facing * scale, scale);
    if (f.squash) ctx.scale(1 + f.squash * 0.45, 1 - f.squash);
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;

    // Tooru himself is normally absent: Wonder of U is the visible fighter.
    if (f.charId === 'tooru') {
      drawWonderOfU(ctx, f, t, opts);
      ctx.restore();
      return;
    }

    const standGuarding = !!(f.guarding || f.state === 'guard' || f.state === 'blockstun');
    const standAttacking = !!(f.airStandActive || f.state === 'attack' || f.state === 'special' || f.state === 'super');
    const standMode = standAttacking ? 'attack' : standGuarding ? 'guard' : 'idle';
    const standInFront = standAttacking || standGuarding;
    if (f.showStand !== false && !standInFront) drawStand(ctx, f, t, standMode);

    const parts = torsoPoints(p);

    // back leg, back arm
    drawLegs(ctx, f, p, parts, pal, true);
    drawArms(ctx, f, p, parts, pal, true);
    drawCoatTails(ctx, f, p, parts, pal, t);

    // torso
    drawTorso(ctx, f, p, parts, pal);

    // front leg
    drawLegs(ctx, f, p, parts, pal, false);

    // head
    drawHead(ctx, f, p, parts, pal);

    // front arm
    drawArms(ctx, f, p, parts, pal, false);

    // The Stand itself delivers the blow or raises the guard in front of the user.
    if (f.showStand !== false && standInFront) drawStand(ctx, f, t, standMode);

    // small coat glints
    if (f.state === 'attack' || f.state === 'special') {
      ctx.strokeStyle = 'rgba(255,255,255,.4)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(parts.chest.x + 8, parts.chest.y + 8);
      ctx.lineTo(parts.hip.x + 14, parts.hip.y - 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  /* =========================================================
     Pixel fighter renderer
     All fighters and Stands are rasterised at half resolution, palette
     reduced to hard pixel steps, then upscaled with nearest-neighbour.
     New characters automatically use the same pipeline.
     ========================================================= */
  const PX_SCALE = 0.5;
  const PX_INV = 1 / PX_SCALE;
  const PX_W = 220;
  const PX_H = 240;
  const PX_OX = 110;
  const PX_OY = 220;
  let pixelCanvas = null;
  let pixelCtx = null;

  function getPixelSurface() {
    if (!pixelCanvas) {
      pixelCanvas = document.createElement('canvas');
      pixelCanvas.width = PX_W;
      pixelCanvas.height = PX_H;
      pixelCtx = pixelCanvas.getContext('2d');
      pixelCtx.imageSmoothingEnabled = false;
    }
    return pixelCtx;
  }

  function posterizePixels(g, outlineColor, rimColor) {
    const img = g.getImageData(0, 0, PX_W, PX_H);
    const d = img.data;
    // Keep a 4-bit ramp so cloth folds, hair highlights and skin shading survive.
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < 64) {
        d[i + 3] = 0;
        continue;
      }
      d[i] = (d[i] >> 4) * 17;
      d[i + 1] = (d[i + 1] >> 4) * 17;
      d[i + 2] = (d[i + 2] >> 4) * 17;
      d[i + 3] = a > 165 ? 255 : 200;
    }
    // Crisp 1px silhouette outline, like a hand-drawn pixel sprite.
    let oc = [23, 16, 26];
    if (typeof outlineColor === 'string' && outlineColor[0] === '#') {
      let h = outlineColor.slice(1);
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      const n = parseInt(h, 16);
      oc = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const alpha = new Uint8ClampedArray(PX_W * PX_H);
    for (let p = 0; p < alpha.length; p++) alpha[p] = d[p * 4 + 3];
    // Only outline transparent pixels connected to the canvas border. Interior
    // holes (between an arm and the coat, around facial features) stay clean.
    const outside = new Uint8Array(PX_W * PX_H);
    const stack = [];
    for (let x = 0; x < PX_W; x++) {
      stack.push(x, (PX_H - 1) * PX_W + x);
    }
    for (let y = 0; y < PX_H; y++) {
      stack.push(y * PX_W, y * PX_W + PX_W - 1);
    }
    while (stack.length) {
      const p = stack.pop();
      if (p < 0 || p >= outside.length || outside[p] || alpha[p] !== 0) continue;
      outside[p] = 1;
      const x = p % PX_W;
      if (x > 0) stack.push(p - 1);
      if (x < PX_W - 1) stack.push(p + 1);
      if (p >= PX_W) stack.push(p - PX_W);
      if (p < PX_W * (PX_H - 1)) stack.push(p + PX_W);
    }
    for (let y = 0; y < PX_H; y++) {
      for (let x = 0; x < PX_W; x++) {
        const p = y * PX_W + x;
        if (!outside[p]) continue;
        const n = (x > 0 && alpha[p - 1] > 150) ||
          (x < PX_W - 1 && alpha[p + 1] > 150) ||
          (y > 0 && alpha[p - PX_W] > 150) ||
          (y < PX_H - 1 && alpha[p + PX_W] > 150);
        if (!n) continue;
        const i = p * 4;
        d[i] = oc[0]; d[i + 1] = oc[1]; d[i + 2] = oc[2]; d[i + 3] = 255;
      }
    }
    // Coloured rim light on the facing/top silhouette edge.
    const rc = [255, 244, 214];
    for (let y = 0; y < PX_H; y++) {
      for (let x = 0; x < PX_W; x++) {
        const p = y * PX_W + x;
        if (outside[p] || alpha[p] < 150) continue;
        const topEdge = y === 0 || outside[p - PX_W];
        if (!topEdge) continue;
        const i = p * 4;
        d[i] = Math.min(255, d[i] * 0.84 + rc[0] * 0.16);
        d[i + 1] = Math.min(255, d[i + 1] * 0.84 + rc[1] * 0.16);
        d[i + 2] = Math.min(255, d[i + 2] * 0.84 + rc[2] * 0.16);
      }
    }
    g.putImageData(img, 0, 0);
  }

  function drawFighter(ctx, f, t, opts) {
    // Restored first-version cartoon vector rendering. The pixel pipeline is
    // kept in this file for reference, but the game now uses the smooth rig.
    opts = opts || {};
    if (f.escapeFade > 0) {
      // A slight, readable flicker so the escape invulnerability is visible
      // without making the character disappear.
      const fade = 0.58 + 0.08 * Math.sin(t * 18 + (f.index || 0));
      opts = Object.assign({}, opts, {
        alpha: (opts.alpha == null ? 1 : opts.alpha) * fade
      });
    }
    drawFighterVector(ctx, f, t, opts);
  }

  /* =========================================================
     Portraits + title art
     ========================================================= */
  function portraitBackground(ctx, w, h, accent, accent2, seed) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#181224');
    g.addColorStop(0.55, '#0d0a15');
    g.addColorStop(1, '#08060d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const rg = ctx.createRadialGradient(w * 0.5, h * 0.3, 10, w * 0.5, h * 0.3, w * 0.72);
    rg.addColorStop(0, accent + '70');
    rg.addColorStop(0.5, accent2 + '25');
    rg.addColorStop(1, accent2 + '00');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);

    // giant star
    ctx.save();
    ctx.globalAlpha = 0.13;
    starPath(ctx, w * 0.5, h * 0.28, w * 0.55, w * 0.17, 8);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.restore();

    // radial speed lines
    ctx.save();
    ctx.translate(w * 0.5, h * 0.36);
    ctx.strokeStyle = accent + '2a';
    ctx.lineWidth = 1;
    const r = seeded(seed);
    for (let i = 0; i < 42; i++) {
      const a = r() * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * w * 0.25, Math.sin(a) * h * 0.18);
      ctx.lineTo(Math.cos(a) * w, Math.sin(a) * h);
      ctx.stroke();
    }
    ctx.restore();

    // halftone
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#f2e7d2';
    for (let y = 0; y < h; y += 7) {
      for (let x = 0; x < w; x += 7) {
        const s = 0.5 + (x / w) * 0.7;
        ctx.beginPath();
        ctx.arc(x, y, s, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawPortrait(canvas, charId, variant) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = 300, h = 322;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const char = JG.CHARACTERS[charId];
    const pal = JG.clonePalette(charId, variant);
    portraitBackground(ctx, w, h, char.accent, char.accent2, charId.length * 81 + 17);

    const f = {
      charId, palette: pal, x: 150, y: 306, facing: 1,
      state: 'intro', vis: null, seed: 1.8, showStand: true,
      standAlpha: 0.32, standX: -28, standY: -8,
      standScale: 1.15, standTilt: 0
    };
    f.vis = targetPose(f, 1.2);
    ctx.save();
    drawFighter(ctx, f, 1.3, { scale: 1.3, noShadow: false });
    ctx.restore();

    // bottom fade
    const fade = ctx.createLinearGradient(0, h - 48, 0, h);
    fade.addColorStop(0, 'rgba(8,6,13,0)');
    fade.addColorStop(1, 'rgba(8,6,13,.95)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, h - 48, w, 48);

    // frame accents
    ctx.strokeStyle = char.accent;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.62);
    ctx.lineTo(0, 0);
    ctx.lineTo(w * 0.18, 0);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawBust(canvas, charId, variant, requiem, goBeyond) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = 112, h = 112;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const char = JG.CHARACTERS[charId];
    const pal = goBeyond && char.goBeyondPalette
      ? Object.assign({}, JG.clonePalette(charId, variant), char.goBeyondPalette)
      : JG.clonePalette(charId, variant, requiem);
    const accent = goBeyond ? '#8fe8ff' : requiem ? '#ffe06a' : char.accent;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1a1424');
    g.addColorStop(1, '#09070f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    if (requiem || goBeyond) {
      const glow = goBeyond ? '143,232,255' : '255,224,106';
      const rg = ctx.createRadialGradient(w / 2, h * 0.4, 4, w / 2, h * 0.4, w * 0.8);
      rg.addColorStop(0, `rgba(${glow},.3)`);
      rg.addColorStop(1, `rgba(${glow},0)`);
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 0.22;
    starPath(ctx, w * 0.5, h * 0.45, 62, 20, 7);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.restore();

    const f = {
      charId, palette: pal, x: 57, y: 213, facing: 1,
      state: 'idle', vis: null, seed: 0.5, showStand: false
    };
    f.vis = targetPose(f, 0.4);
    ctx.save();
    drawFighter(ctx, f, 0.4, { scale: 1.04, noShadow: true });
    ctx.restore();

    const fade = ctx.createLinearGradient(0, h * 0.55, 0, h);
    fade.addColorStop(0, 'rgba(9,7,15,0)');
    fade.addColorStop(1, 'rgba(9,7,15,.62)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, w, h);
  }

  function drawTitleScene(ctx, t) {
    ctx.save();
    // use Cairo at dusk, scaled + panned
    ctx.fillStyle = '#08060d';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.save();
    ctx.translate(80, 0);
    ctx.scale(0.94, 0.94);
    drawStage(ctx, 'cairo', t * 0.5 + 20);
    ctx.restore();

    // heavy dark overlay left; keep right art readable
    const shade = ctx.createLinearGradient(0, 0, 1280, 0);
    shade.addColorStop(0, 'rgba(7,5,12,.97)');
    shade.addColorStop(0.38, 'rgba(7,5,12,.8)');
    shade.addColorStop(0.62, 'rgba(7,5,12,.12)');
    shade.addColorStop(1, 'rgba(7,5,12,.44)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, 1280, 720);

    // giant star / sun motif behind characters
    ctx.save();
    ctx.globalAlpha = 0.2;
    starPath(ctx, 980, 300, 280, 100, 12);
    ctx.fillStyle = '#ffc94a';
    ctx.fill();
    ctx.restore();

    // speed lines
    ctx.save();
    ctx.translate(990, 330);
    ctx.strokeStyle = 'rgba(255,220,160,.11)';
    ctx.lineWidth = 2;
    const r = seeded(93);
    for (let i = 0; i < 38; i++) {
      const a = r() * TAU;
      const inner = 230 + r() * 80;
      const outer = 700 + r() * 200;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.stroke();
    }
    ctx.restore();

    // stand auras
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const aura1 = ctx.createRadialGradient(860, 410, 10, 860, 410, 250);
    aura1.addColorStop(0, 'rgba(123,85,255,.26)');
    aura1.addColorStop(1, 'rgba(123,85,255,0)');
    ctx.fillStyle = aura1;
    ctx.fillRect(560, 100, 600, 620);
    const aura2 = ctx.createRadialGradient(1110, 400, 10, 1110, 400, 260);
    aura2.addColorStop(0, 'rgba(255,201,74,.24)');
    aura2.addColorStop(1, 'rgba(255,201,74,0)');
    ctx.fillStyle = aura2;
    ctx.fillRect(820, 90, 560, 640);
    ctx.restore();

    // characters
    const jotaro = {
      charId: 'jotaro', palette: JG.clonePalette('jotaro', 0), x: 846, y: 604,
      facing: 1, state: 'intro', vis: null, seed: 2.1, showStand: true
    };
    jotaro.vis = targetPose(jotaro, t);
    const dio = {
      charId: 'dio', palette: JG.clonePalette('dio', 0), x: 1118, y: 604,
      facing: -1, state: 'intro', vis: null, seed: 4.4, showStand: true
    };
    dio.vis = targetPose(dio, t + 0.3);

    ctx.save();
    drawFighter(ctx, jotaro, t, { scale: 1.58, noShadow: true });
    drawFighter(ctx, dio, t + 0.3, { scale: 1.62, noShadow: true });
    ctx.restore();

    // foreground speed lines
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = 'rgba(5,3,9,.65)';
    ctx.lineWidth = 9;
    for (let i = 0; i < 6; i++) {
      const y = 650 + i * 14;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1280, y - 16);
      ctx.stroke();
    }
    ctx.restore();

    // manga katakana
    drawMangaText(ctx, 'ゴ', 735, 580, 64, '#ffc94a', -0.16, 0.55 + 0.25 * Math.sin(t * 2));
    drawMangaText(ctx, 'ゴ', 700, 510, 36, '#ff2f74', -0.06, 0.4 + 0.2 * Math.sin(t * 2.3));
    drawMangaText(ctx, 'ゴ', 1200, 630, 44, '#ff2f74', 0.1, 0.42 + 0.24 * Math.sin(t * 2.6));

    // star glints
    for (let i = 0; i < 9; i++) {
      const x = 760 + ((i * 83 + t * 13) % 470);
      const y = 120 + ((i * 59 + Math.sin(t + i) * 30) % 390);
      ctx.globalAlpha = 0.2 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2 + i));
      starPath(ctx, x, y, 3.5, 1.2, 4);
      ctx.fillStyle = '#fff4d0';
      ctx.fill();
    }
    ctx.restore();
  }

  /* =========================================================
     FX helpers
     ========================================================= */
  function drawMangaText(ctx, text, x, y, size, color, rot, alpha, outline) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.font = '900 ' + size + 'px "Microsoft YaHei", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = outline || '#0b0812';
    ctx.lineWidth = Math.max(3, size * 0.12);
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = color || '#fff4d0';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function drawHitSpark(ctx, x, y, color, size, rot, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = color;
    ctx.strokeStyle = '#fff8e8';
    ctx.lineWidth = 2;
    starPath(ctx, 0, 0, size * 0.7, size * 0.2, 12);
    ctx.fill();
    ctx.stroke();
    starPath(ctx, 0, 0, size * 0.28, size * 0.08, 6);
    ctx.fillStyle = '#fffef4';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + 0.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * size * 0.32, Math.sin(a) * size * 0.32);
      ctx.lineTo(Math.cos(a) * size * (0.85 + 0.2 * Math.sin(i * 3)), Math.sin(a) * size * 0.85);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRing(ctx, x, y, radius, color, alpha, width) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawSpeedLines(ctx, color, alpha, seed, count) {
    ctx.save();
    ctx.translate(640, 330);
    const r = seeded(seed || 7);
    ctx.strokeStyle = color || '#fff4dc';
    for (let i = 0; i < (count || 44); i++) {
      const a = r() * TAU;
      const inner = 210 + r() * 260;
      const outer = 760 + r() * 380;
      ctx.globalAlpha = (alpha == null ? 0.18 : alpha) * (0.35 + r() * 0.65);
      ctx.lineWidth = 0.8 + r() * 2.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTimeStop(ctx, t, color) {
    ctx.save();
    ctx.fillStyle = 'rgba(7,10,24,.49)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.globalCompositeOperation = 'screen';
    // concentric clock rings
    ctx.strokeStyle = color + '55';
    for (let i = 0; i < 4; i++) {
      const p = ((t * 0.09 + i * 0.25) % 1);
      ctx.globalAlpha = (1 - p) * 0.55;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(900, 330, 60 + p * 520, 0, TAU);
      ctx.stroke();
    }
    // radial frozen shards
    ctx.translate(900, 330);
    ctx.strokeStyle = 'rgba(205,225,255,.6)';
    const r = seeded(88);
    for (let i = 0; i < 40; i++) {
      const a = r() * TAU;
      const inner = 120 + r() * 200;
      const outer = inner + 40 + r() * 220;
      ctx.globalAlpha = 0.18 + r() * 0.3;
      ctx.lineWidth = 1 + r() * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.stroke();
    }
    ctx.restore();

    // clock hand
    ctx.save();
    ctx.translate(900, 330);
    ctx.strokeStyle = 'rgba(255,239,188,.65)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -86);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(64, 22);
    ctx.stroke();
    circle(ctx, 0, 0, 7, '#ffe8ac');
    ctx.restore();

    drawMangaText(ctx, '時', 1080, 150, 130, 'rgba(255,242,205,.16)', -0.12, 1, 'rgba(0,0,0,.12)');
    drawMangaText(ctx, '止', 1090, 275, 110, 'rgba(255,242,205,.11)', 0.1, 1, 'rgba(0,0,0,.1)');
  }

  function drawAura(ctx, x, y, r, color, t, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color + '55');
    g.addColorStop(0.5, color + '18');
    g.addColorStop(1, color + '00');
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = color + '66';
    ctx.lineWidth = 2;
    ctx.globalAlpha = (alpha == null ? 1 : alpha) * 0.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(x, y, r * (0.42 + i * 0.18) + Math.sin(t * 2 + i) * 5, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawVignette(ctx) {
    const g = ctx.createRadialGradient(640, 330, 270, 640, 360, 780);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1280, 720);
  }

  function drawDust(ctx, particles) {
    ctx.save();
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1) * 0.6;
      ctx.fillStyle = p.color || '#f0d7b8';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.life / p.max + 0.2), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSuperBackdrop(ctx, color, t, kind) {
    ctx.save();
    ctx.fillStyle = kind === 'timestop' ? 'rgba(8,12,30,.66)' : 'rgba(8,5,12,.58)';
    ctx.fillRect(0, 0, 1280, 720);
    drawSpeedLines(ctx, color, 0.3, 31, 64);
    ctx.globalCompositeOperation = 'screen';
    if (kind === 'gobeyond' || kind === 'gobeyondshot') {
      // A field of soap-film bubbles drifting toward the camera.
      for (let i = 0; i < 18; i++) {
        const rnd = seeded(i * 37 + 5);
        const rr = 16 + rnd() * 64;
        const x = ((i * 197 + t * 38) % 1500) - 110;
        const y = 120 + ((i * 113 + Math.sin(t * 0.8 + i) * 60) % 520);
        const bg = ctx.createRadialGradient(x - rr * 0.3, y - rr * 0.35, 1, x, y, rr);
        bg.addColorStop(0, 'rgba(255,255,255,.28)');
        bg.addColorStop(0.55, 'rgba(143,232,255,.12)');
        bg.addColorStop(1, 'rgba(143,232,255,0)');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, TAU);
        ctx.fill();
      }
    }
    const g = ctx.createRadialGradient(640, 330, 40, 640, 330, 520);
    g.addColorStop(0, color + '44');
    g.addColorStop(0.55, color + '12');
    g.addColorStop(1, color + '00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();
  }

  const Art = {
    TAU, DEG, clamp, lerp, easeOut, easeIn, easeInOut,
    seeded, starPath, roundRect, circle, poly, drawBone, solveIK, joint, drawHeart,
    drawStage, drawFighter, drawStand, drawWonderOfU, drawCalamityWall, standFist,
    drawTree, drawTreePlatform, drawFrog, drawRoadRoller, updatePose, targetPose, neutralPose,
    drawPortrait, drawBust, drawTitleScene,
    drawMangaText, drawHitSpark, drawRing, drawSpeedLines, drawTimeStop,
    drawAura, drawVignette, drawDust, drawSuperBackdrop
  };
  JG.Art = Art;
})();
