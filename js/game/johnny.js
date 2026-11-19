/* Johnny: mounted movement, deterministic relic events and Tusk's nail holes. */
(function (G) {
  'use strict';
  const { JG, Fighter, Match, GROUND, LEFT, RIGHT, clamp, Art, Audio } = G;
  const PINK = '#ff95ce';

  Object.assign(Fighter.prototype, {
    resetJohnnyRound(match) {
      this.mounted = true;
      this.nailSlots = Array(10).fill(0);
      this.herbCd = this.horseCd = this.horseDash = this.mountBoost = this.tuskBarrageTick = 0;
      this.blueSpin = 0;
      if (match.round >= 2 && this.tuskAct < 4) {
        this.tuskAct = 4;
        this.corpseUnlocked = true;
        match.spawnText(this.x, GROUND - 300, '骑兵回旋 · 牙 ACT4', '#fff1b5', 32, 2.4);
        match.spawnRing(this.x, GROUND - 120, PINK, 230);
      }
    },
    fireNail(match, strong = false, origin = null) {
      if (this.nailCd > 0) return false;
      const slots = this.nailSlots || (this.nailSlots = Array(10).fill(0));
      if (this.tuskAct >= 2) {
        const slot = slots.findIndex(cd => cd <= 0);
        if (slot < 0) return false;
        slots[slot] = 5;
      }
      this.nailCd = strong ? 0.42 : 0.18;
      this.nailPose = strong ? 0.35 : 0.16;
      if (strong && this.tuskAct >= 3) this.blueSpin = 0.45;
      const damage = (strong ? 105 : this.tuskAct >= 2 ? 38 : 32) * (this.mounted === false ? 1.15 : 1);
      match.tuskNails.push({ owner: this, act: this.tuskAct, x: origin ? origin.x : this.x + this.facing * 75,
        y: GROUND - 92, vx: this.facing * (strong ? 1120 : 900), vy: 135,
        damage: Math.round(damage), strong, life: 1.1 });
      Audio.projectile();
      return true;
    },
    fireInfiniteNail(match) {
      if (this.tuskAct !== 4 || this.meter < 100 || this.hp <= 0) return false;
      this.meter -= 100;
      this.supersUsed++;
      this.blueSpin = 0.9;
      this.nailPose = 0.6;
      match.infiniteNails.push({ owner: this, x: this.x + this.facing * 70, y: this.y - 150 });
      match.spawnText(this.x, this.y - 270, '牙 ACT4 · 无限回转', '#bfefff', 28, 1.3);
      match.spawnRing(this.x, this.y - 150, '#8fdfff', 110);
      Audio.beam();
      return true;
    },
    drinkHerb(match) {
      if (this.tuskAct < 2 || this.herbCd > 0) return false;
      this.nailSlots = this.nailSlots.map(cd => Math.max(0, cd - 3));
      for (const key of ['nailCd', 'horseCd', 'burstCd', 'secondCd', 'specialCd', 'barrageCd', 'dashCooldown', 'perfectCd']) {
        this[key] = Math.max(0, (this[key] || 0) - 3);
      }
      this.herbCd = 8;
      this.herbPose = 0.55;
      match.spawnText(this.x, this.y - 260, '药草 · 冷却 −3秒', '#b5ffba', 22, 1);
      match.spawnRing(this.x, this.y - 100, '#91eab0', 90);
      Audio.heal();
      return true;
    },
    toggleJohnnyMount(match) {
      this.mounted = !this.mounted;
      this.vx = this.vy = this.horseDash = 0;
      this.y = GROUND;
      this.onGround = true;
      if (this.mounted) this.mountBoost = 3;
      match.spawnText(this.x, this.y - 270, this.mounted ? '上马 · 3秒疾驰' : '下马 · 不可移动 / 无僵直 / 伤害 +15%', PINK, 20, 1);
    },
    horseRush(match, controls, escape = false) {
      if (escape ? this.burstCd > 0 || this.meter < 25 : this.horseCd > 0 || !this.mounted) return false;
      if (escape) {
        this.meter -= 25;
        this.burstCd = 10;
        this.mounted = true;
        this.hitstun = this.blockstun = 0;
        this.attack = this.specialAction = null;
        this.invuln = Math.max(this.invuln, 1);
        this.escapeFade = 1;
        this.horseDir = controls.left !== controls.right ? (controls.left ? -1 : 1) :
          (match.fighters[1 - this.index].x >= this.x ? -1 : 1);
      } else {
        this.horseCd = 1.2;
        this.horseDir = controls.left !== controls.right ? (controls.left ? -1 : 1) : this.facing;
      }
      this.horseDash = escape ? 0.32 : 0.24;
      this.vy = 0;
      this.onGround = true;
      this.y = GROUND;
      match.spawnDust(this.x, this.y, 12, '#e3d6b3');
      return true;
    },
    emergeTusk(match, opponent, attack) {
      if (this.tuskHole) this.x = this.tuskHole.x;
      this.tuskHidden = false;
      this.tuskHole = null;
      this.y = GROUND;
      this.onGround = true;
      this.invuln = Math.max(this.invuln, 0.2);
      this.facing = opponent.x >= this.x ? 1 : -1;
      match.spawnRing(this.x, GROUND - 12, PINK, 85);
      if (attack) { this.nailCd = 0; this.fireNail(match, true); }
    },
    updateJohnny(dt, opponent, input, match) {
      for (const key of ['nailCd', 'nailPose', 'herbCd', 'horseCd', 'mountBoost', 'blueSpin', 'herbPose']) {
        this[key] = Math.max(0, (this[key] || 0) - dt);
      }
      this.nailSlots = (this.nailSlots || Array(10).fill(0)).map(cd => Math.max(0, cd - dt));
      this.guarding = false;
      this.jumpBuffer = 0;
      let controls = input;
      if (this.cpu) {
        const goal = this.tuskAct === 1 ? match.tuskRelic : match.tuskSaints.find(s => s.owner === this);
        const delta = goal ? goal.x - this.x : opponent.x - this.x;
        controls = { left: delta < -32 && (goal || Math.abs(delta) > 480),
          right: delta > 32 && (goal || Math.abs(delta) > 480), pLight: true,
          pSpecial: !this.mounted && !!goal, pHerb: this.nailSlots.filter(cd => cd <= 0).length < 4,
          pSuper: this.tuskAct === 4 && this.meter >= 100,
          heavy: this.tuskAct === 4 && Math.abs(delta) < 200,
          pDodge: this.hitstun > 0,
          pSecond: this.tuskAct === 3 && !this.tuskHidden && match.rand() < dt * 0.45,
          pHeavy: this.tuskHidden && match.rand() < dt * 0.8 };
      }
      // ACT4 can launch its infinite rotation while time itself is stopped.
      if (controls.pSuper && this.tuskAct === 4) this.fireInfiniteNail(match);
      if (this.corpseUnlocked && !this.mounted) {
        this.hitstun = this.blockstun = 0;
        this.vx = this.vy = 0;
        this.y = GROUND;
        this.onGround = true;
      }
      if (this.hitstun > 0 && controls.pDodge) this.horseRush(match, controls, true);
      if (this.hitstun > 0 || this.blockstun > 0) {
        this.hitstun = Math.max(0, this.hitstun - dt);
        this.blockstun = Math.max(0, this.blockstun - dt);
        this.state = 'hitstun';
        this.vx *= Math.pow(.05, dt);
        this.moveX(dt);
        if (!this.onGround) this.applyGravity(dt, match);
        return;
      }
      this.attack = null;
      this.specialAction = null;
      if (controls.pHerb && this.tuskAct >= 2) this.drinkHerb(match);
      if (this.tuskHidden) {
        this.vx = 0;
        const holes = match.tuskHoles.filter(h => h.owner === this && h.life > 0);
        if (!holes.includes(this.tuskHole) || holes.length < 2) { this.emergeTusk(match, opponent, false); return; }
        if (controls.pLeft || controls.pRight) {
          this.tuskHole = controls.pLeft ? holes.reduce((a,b) => a.x < b.x ? a : b) : holes.reduce((a,b) => a.x > b.x ? a : b);
          this.x = this.tuskHole.x;
        }
        const other = holes.find(h => h !== this.tuskHole);
        if (controls.pSpecial) {
          this.emergeTusk(match, opponent, false);
          this.toggleJohnnyMount(match);
        } else if (controls.pSuper && this.tuskAct === 4) this.emergeTusk(match, opponent, false);
        else if (controls.pHeavy || controls.pSecond || controls.pSuper) this.emergeTusk(match, opponent, true);
        else if (controls.pLight && other) {
          this.facing = opponent.x >= other.x ? 1 : -1;
          if (this.fireNail(match, false, other)) this.tuskHand = { x: other.x, life: 0.18 };
        }
        return;
      }
      if (this.corpseUnlocked && controls.pSpecial) this.toggleJohnnyMount(match);
      const holes = match.tuskHoles.filter(h => h.owner === this && h.life > 0);
      if (this.tuskAct >= 3 && controls.pSecond && holes.length >= 2) {
        const near = holes.reduce((a,b) => Math.abs(a.x-this.x) < Math.abs(b.x-this.x) ? a : b);
        if (Math.abs(near.x - this.x) <= 100) {
          this.tuskHidden = true; this.tuskHole = near; this.x = near.x; this.vx = 0;
          match.spawnRing(this.x, GROUND - 10, PINK, 70);
          return;
        }
      }
      if (controls.pDodge && this.horseDash <= 0) this.horseRush(match, controls);
      const axis = Number(!!controls.right) - Number(!!controls.left);
      // Facing can turn in place even while Johnny is off his horse.
      if (axis && this.horseDash <= 0) this.facing = axis;
      else if (this.cpu) this.facing = opponent.x >= this.x ? 1 : -1;
      const slow = this.attrDebuffTimer > 0 && ['speed','all'].includes(this.attrDebuff) ? .75 : 1;
      if (this.horseDash > 0) {
        const step = Math.min(dt, this.horseDash);
        this.x = clamp(this.x + this.horseDir * 1450 * step, LEFT, RIGHT);
        this.horseDash = Math.max(0, this.horseDash - dt);
        this.vx = this.horseDir * 1450;
      } else {
        this.vx = this.mounted ? axis * (this.mountBoost > 0 ? 750 : this.data.speed) * slow : 0;
        this.moveX(dt);
      }
      if (!this.onGround) this.applyGravity(dt, match);
      this.gaitPhase += Math.abs(this.vx) * dt * .045;
      this.state = Math.abs(this.vx) > 0 ? 'walk' : 'idle';
      if (this.tuskAct === 4 && controls.heavy && this.heavyHold > .34) {
        this.state = 'special';
        this.tuskBarrageTick -= dt;
        if (this.tuskBarrageTick <= 0) {
          this.tuskBarrageTick = .09;
          if (Math.abs(opponent.x-this.x) < 220 && !opponent.tuskHidden && Math.abs(opponent.y-this.y) < 190) {
            const landed = match.resolveHit(this, opponent, { damage: this.mounted ? 72 : 83, hitstun: .19,
              knockback: 1, lift: 0, sfx: 'hitHeavy' }, { source: 'barrage' });
            if (landed) { this.meter = Math.min(100, this.meter + 4); match.spawnText(opponent.x, opponent.y-210, 'ORA!', PINK, 25, .3); }
          }
          match.spawnSpark(this.x+this.facing*130,this.y-145,PINK,22);
        }
        return;
      }
      this.tuskBarrageTick = 0;
      if (controls.pHeavy && this.tuskAct >= 2) this.fireNail(match, true);
      else if (controls.pLight || (this.tuskAct === 1 && controls.pHeavy) || (this.tuskAct < 4 && controls.heavy) || controls.pSecond || controls.second ||
        (this.tuskAct === 1 && (controls.pSpecial || controls.pHerb)) || (this.tuskAct < 4 && controls.pSuper)) this.fireNail(match);
    }
  });

  Object.assign(Match.prototype, {
    isTuskTimeFree(f) {
      return f.charId === 'johnny' && f.tuskAct === 4 &&
        ((this.super && this.super.type === 'timestop') || !!this.miniTimeStop);
    },
    updateTuskTimeless(dt, netInputs) {
      // Super cinematics normally skip fighter/projectile updates entirely.
      if (this.super && this.super.type === 'timestop') {
        for (const f of this.fighters) {
          if (!this.isTuskTimeFree(f) || f.hp <= 0) continue;
          const opponent = this.fighters[1-f.index];
          const input = this.netplay ? netInputs && netInputs[f.index] :
            f.cpu ? {} : G.humanInput(f.index);
          if (!input) continue;
          f.frozen = false;
          if (f.state === 'frozen') f.state = 'idle';
          f.update(dt, opponent, input, this);
        }
      }
      // Infinite rotation advances even during hitstop, rain and every super.
      for (let i=this.infiniteNails.length-1; i>=0; i--) {
        const n=this.infiniteNails[i], target=this.fighters[1-n.owner.index];
        if (target.hp <= 0) { this.infiniteNails.splice(i,1); continue; }
        const dx=target.x-n.x, dy=target.y-110-n.y, distance=Math.hypot(dx,dy);
        const step=1450*dt;
        if (distance <= step+24) {
          this.infiniteNails.splice(i,1);
          this.finishInfiniteRotation(n.owner,target);
          return;
        }
        n.x += dx/distance*step;
        n.y += dy/distance*step;
      }
    },
    finishInfiniteRotation(owner, target) {
      const damage=target.hp;
      // Deliberately bypass guard, invulnerability, calamity and time-stop rules.
      this.super = this.wouRain = this.miniTimeStop = null;
      this.koPending = null;
      G.hideSuperBanner();
      for (const f of this.fighters) f.frozen=false;
      target.tuskHidden=false; target.tuskHole=null;
      target.hp=0;
      owner.damageDealt+=damage;
      owner.combo++; owner.maxCombo=Math.max(owner.maxCombo,owner.combo);
      this.infiniteKO={ target, x:target.x, y:target.y, time:0, palette:{...target.palette} };
      this.spawnText(target.x,target.y-270,'无限回转 · 斩杀','#c6eeff',38,2);
      this.spawnRing(target.x,target.y-130,'#97dfff',230);
      this.spawnSpark(target.x,target.y-130,PINK,80);
      Audio.hitHeavy();
      this.beginKO(owner,{super:true});
    },
    drawInfiniteDefeat(ctx, f, t) {
      const fx=this.infiniteKO;
      if (!fx || fx.target!==f || this.training) return false;
      const elapsed=this.outroTime || 0;
      const k=clamp(elapsed/1.8,0,1);
      ctx.save();
      ctx.globalAlpha=1-k*.8;
      // A stylized silhouette splits into rotating ribbons, without gore.
      for(let i=0;i<13;i++) {
        const y=fx.y-205+i*15;
        const angle=elapsed*7+i*.5;
        const x=fx.x+Math.sin(angle)*(12+k*65);
        ctx.save(); ctx.translate(x,y+k*25);
        ctx.rotate(Math.sin(angle)*k*.7);
        ctx.fillStyle=i<3?fx.palette.skin:i<8?fx.palette.coat:fx.palette.pants;
        ctx.strokeStyle='#b9e9ff'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.ellipse(0,0,30*(1-k*.25),5.5,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle='#8fdfff'; ctx.lineWidth=3;
      for(let i=0;i<4;i++) {
        ctx.beginPath(); ctx.ellipse(fx.x,fx.y-100,55+i*10,115-i*12,elapsed*3+i*.4,0,Math.PI*1.8); ctx.stroke();
      }
      ctx.restore();
      return true;
    },

    resetTuskWorld() {
      this.tuskNails = [];
      this.infiniteNails = [];
      this.infiniteKO = null;
      this.tuskHoles = [];
      this.tuskSaints = [];
      this.tuskRelic = null;
      this.tuskRelicDelay = 3 + this.rand() * 4;
    },
    makeTuskHole(nail) {
      if (nail.act < 2) return;
      const owner = nail.owner;
      const hole = { owner, x: clamp(nail.x, LEFT + 20, RIGHT - 20), life: 7, tick: 0 };
      // ACT3 only links two holes; while inside, the linked pair remains fixed.
      if (owner.tuskHidden) return;
      if (owner.tuskAct >= 3) {
        const owned = this.tuskHoles.filter(h => h.owner === owner);
        if (owned.length >= 2) this.tuskHoles = this.tuskHoles.filter(h => h !== owned[0]);
      }
      this.tuskHoles.push(hole);
      this.spawnRing(hole.x, GROUND - 3, PINK, 32);
    },
    updateTuskWorld(dt) {
      const johnnys = this.fighters.filter(f => f.charId === 'johnny');
      if (!johnnys.length) return;
      if (johnnys.some(f => f.tuskAct === 1 && !f.hasCorpse) && !this.tuskRelic) {
        this.tuskRelicDelay -= dt;
        if (this.tuskRelicDelay <= 0) {
          this.tuskRelic = { x: LEFT + 100 + this.rand() * (RIGHT - LEFT - 200) };
          this.spawnText(this.tuskRelic.x, GROUND - 155, '圣人遗体 · 骑马靠近拾取', '#ffe4a0', 20, 1.8);
        }
      }
      for (const f of johnnys) {
        if (f.hp <= 0) continue;
        if (this.tuskRelic && f.tuskAct === 1 && !f.hasCorpse && !f.tuskHidden && f.onGround &&
            Math.abs(f.x - this.tuskRelic.x) < 65) {
          f.hasCorpse = true;
          f.corpseUnlocked = true;
          f.tuskAct = 2;
          f.saintDelay = 8 + this.rand() * 7;
          this.tuskRelic = null;
          this.tuskRelicDelay = 5 + this.rand() * 6;
          this.spawnText(f.x, GROUND - 260, '圣人遗体 · 牙 ACT2 · L 上下马', '#ffe4a0', 23, 2);
        }
        if (f.tuskAct === 2 && !this.tuskSaints.some(s => s.owner === f)) {
          if (f.saintDelay == null) f.saintDelay = 8 + this.rand() * 7;
          f.saintDelay -= dt;
          if (f.saintDelay <= 0) {
            this.tuskSaints.push({ owner: f, x: LEFT + 100 + this.rand() * (RIGHT - LEFT - 200) });
            this.spawnText(f.x, GROUND - 280, '圣人降临 · 前往金色光柱接受指导', '#fff1be', 22, 2);
          }
        }
        const saint = this.tuskSaints.find(s => s.owner === f);
        if (saint && f.onGround && Math.abs(f.x - saint.x) < 70 && f.hitstun <= 0) {
          f.tuskAct = 3;
          this.tuskSaints = this.tuskSaints.filter(s => s !== saint);
          const holes = this.tuskHoles.filter(h => h.owner === f);
          this.tuskHoles = this.tuskHoles.filter(h => h.owner !== f || holes.slice(-2).includes(h));
          this.spawnText(f.x, GROUND - 290, '圣人的指导 · 牙 ACT3', PINK, 30, 2);
          this.spawnRing(f.x, GROUND - 120, '#fff1be', 200);
        }
        if (f.tuskHand) { f.tuskHand.life -= dt; if (f.tuskHand.life <= 0) f.tuskHand = null; }
      }
      for (let i = this.tuskNails.length - 1; i >= 0; i--) {
        const n = this.tuskNails[i];
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        n.life -= dt;
        const target = this.fighters[1 - n.owner.index];
        // Every nail, including the strong exit shot, is avoided by jumping.
        if (target.onGround && !target.tuskHidden && target.hp > 0 &&
            Math.abs(n.x - target.x) < 30 && n.y < GROUND) {
          const landed = this.resolveHit(n.owner, target, { damage: n.damage, hitstun: n.strong ? 0.48 : 0.18,
            blockstun: 0.1, knockback: n.strong ? 230 : 35, lift: 0, sfx: 'hitLight' }, { source: 'projectile' });
          if (landed) n.owner.meter = Math.min(100, n.owner.meter + (n.strong ? 10 : 6));
          this.spawnSpark(n.x, n.y, PINK, 20);
          this.tuskNails.splice(i, 1);
        } else if (n.y >= GROUND - 5 || n.life <= 0 || n.x < LEFT || n.x > RIGHT) {
          this.makeTuskHole(n);
          this.tuskNails.splice(i, 1);
        }
      }
      for (const h of this.tuskHoles) {
        h.life -= dt;
        h.tick = Math.max(0, h.tick - dt);
        const target = this.fighters[1 - h.owner.index];
        if (h.life > 0 && h.tick <= 0 && target.onGround && !target.tuskHidden && Math.abs(target.x - h.x) < 35) {
          h.tick = 0.65;
          this.resolveHit(h.owner, target, { damage: 16, hitstun: 0.08, knockback: 1,
            unblockable: true, sfx: 'hitLight' }, { source: 'projectile' });
        }
      }
      // Expiring holes safely eject their occupant; no permanent invulnerability.
      for (const f of johnnys) {
        if (f.tuskHidden && (f.tuskHole.life <= 0 || this.tuskHoles.filter(h => h.owner === f && h.life > 0).length < 2)) {
          f.emergeTusk(this, this.fighters[1 - f.index], false);
        }
      }
      this.tuskHoles = this.tuskHoles.filter(h => h.life > 0);
    },
    drawTuskWorld(ctx, t) {
      const ellipse = (x, y, rx, ry, color) => {
        ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      };
      ctx.save();
      for (const h of this.tuskHoles) {
        ctx.globalAlpha = Math.min(1, h.life);
        ellipse(h.x, GROUND - 3, 34, 11, PINK);
        ellipse(h.x, GROUND - 4, 26, 7, '#160a25');
        ctx.fillStyle = '#ffd4ef'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`${h.owner.index + 1}P · ${h.life.toFixed(1)}s`, h.x, GROUND + 23);
      }
      ctx.globalAlpha = 1;
      if (this.tuskRelic) {
        const x = this.tuskRelic.x, y = GROUND - 40 + Math.sin(t * 3) * 5;
        ellipse(x, GROUND - 4, 42, 10, '#bca267');
        ctx.strokeStyle = '#fff0c6'; ctx.lineWidth = 13;
        ctx.beginPath(); ctx.moveTo(x - 17, y - 20); ctx.lineTo(x + 17, y + 16); ctx.stroke();
        for (const [dx, dy] of [[-20,-23],[-13,-17],[14,13],[20,20]]) ellipse(x+dx,y+dy,9,8,'#fff0c6');
        ctx.fillStyle = '#ffe3a0'; ctx.font = 'bold 17px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('圣人遗体', x, y - 45);
      }
      for (const s of this.tuskSaints) {
        const x = s.x;
        const glow = ctx.createLinearGradient(0, GROUND - 250, 0, GROUND);
        glow.addColorStop(0, '#ffe9a000'); glow.addColorStop(1, '#ffe9a060');
        ctx.fillStyle = glow; ctx.fillRect(x - 45, GROUND - 250, 90, 250);
        ellipse(x, GROUND - 160, 19, 25, '#ffe8be');
        ctx.fillStyle = '#ece3c7'; ctx.beginPath(); ctx.moveTo(x,GROUND-140);
        ctx.lineTo(x-40,GROUND-15); ctx.lineTo(x+40,GROUND-15); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffdf81'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, GROUND-200, 29, 7, 0, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = '#fff1be'; ctx.font = 'bold 17px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`${s.owner.index+1}P · 圣人的指导`, x, GROUND-220);
      }
      for (const n of this.infiniteNails) {
        ctx.save(); ctx.translate(n.x,n.y);
        ctx.strokeStyle='#93e4ff'; ctx.lineWidth=4;
        for(let i=0;i<5;i++) {
          ctx.beginPath(); ctx.ellipse(0,0,12+i*6,6+i*2,t*12+i*.5,0,Math.PI*1.75); ctx.stroke();
        }
        ctx.fillStyle='#fff7dc'; ctx.beginPath(); ctx.arc(0,0,7,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }
      for (const n of this.tuskNails) {
        ctx.save(); ctx.translate(n.x,n.y); ctx.rotate(t*28);
        ctx.strokeStyle = n.strong ? '#fff5b0' : PINK; ctx.lineWidth = n.strong ? 5 : 3;
        ctx.beginPath(); ctx.ellipse(0,0,n.strong?18:11,7,0,0,Math.PI*1.7); ctx.stroke();
        ctx.fillStyle = '#fff3fc'; ctx.fillRect(-6,-2,12,4); ctx.restore();
      }
      for (const f of this.fighters.filter(f => f.charId === 'johnny')) {
        if (f.tuskHand) {
          ellipse(f.tuskHand.x, GROUND-35, 9, 32, '#eac09d');
          ellipse(f.tuskHand.x+9, GROUND-65, 16, 8, '#cee8fa');
        }
        ctx.fillStyle = PINK; ctx.textAlign = 'center'; ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`牙 ACT${f.tuskAct}${f.tuskHidden ? ' · 弹孔内' : ''}`, f.x, GROUND-310);
        const hint = f.tuskHidden ? '←/→ 穿梭 · J 伸手射击 · K 出孔强射' :
          f.tuskAct === 1 ? 'J/K/H/L/U 无限爪弹 · F 马冲刺 · 寻找遗体' :
          f.tuskAct === 4 ? 'L 上下马 · G 药草 · 长按K 欧拉 · U 100SP 无限回转' :
          f.tuskAct === 2 ? 'J 普通 / K 强射 · L 上下马 · G 药草 · 寻找圣人' :
          'J 普通 / K 蓝色回旋 · H 入孔 · L 上下马 · G 药草';
        ctx.font = '13px sans-serif'; ctx.fillStyle = '#fff0fa';
        ctx.fillText(hint, f.x, GROUND-288);
        if (f.tuskAct >= 2) {
          const slots=f.nailSlots || Array(10).fill(0);
          for (let i=0;i<10;i++) {
            const x=f.x-115+i*23, cd=slots[i];
            ctx.fillStyle=cd>0?'#37283f':'#ffb4dc'; ctx.fillRect(x,GROUND-272,20,17);
            ctx.fillStyle=cd>0?'#fff0fa':'#26132d'; ctx.font='10px sans-serif';
            ctx.fillText(cd>0?cd.toFixed(1):'●',x+10,GROUND-260);
          }
          ctx.fillStyle='#b9e9ff'; ctx.font='12px sans-serif';
          ctx.fillText(`${f.mounted?'骑马':'下马 · 不移动 / 无僵直 / 伤害+15%'} · 药草 ${f.herbCd>0?f.herbCd.toFixed(1)+'s':'就绪'}${f.mountBoost>0?' · 疾驰 '+f.mountBoost.toFixed(1)+'s':''}`,f.x,GROUND-238);
        }
      }
      ctx.restore();
    }
  });

  // Code-native vector artwork follows the three supplied Tusk references.
  JG.drawJohnny = function (ctx, f, t, opts = {}) {
    if (f.tuskHidden) return;
    const pal = f.palette || JG.CHARACTERS.johnny.palette;
    const act = f.tuskAct || 1;
    const ellipse = (x,y,rx,ry,color,rot=0) => {
      ctx.fillStyle=color; ctx.strokeStyle='#251629'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.ellipse(x,y,rx,ry,rot,0,Math.PI*2); ctx.fill(); ctx.stroke();
    };
    const limb = (x,y,x2,y2,color,width=12) => {
      ctx.strokeStyle='#251629'; ctx.lineWidth=width+4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x2,y2); ctx.stroke();
      ctx.strokeStyle=color; ctx.lineWidth=width; ctx.stroke();
    };
    const star = (x,y,r=7) => { Art.starPath(ctx,x,y,r,r*.45,5); ctx.fillStyle='#ffe6a2'; ctx.fill(); };
    ctx.save();
    ctx.globalAlpha *= opts.alpha == null ? 1 : opts.alpha;
    ctx.translate(f.x,f.y); ctx.scale((opts.scale || 1)*f.facing,opts.scale || 1);
    if (f.state === 'ko') { ctx.translate(0,-10); ctx.rotate(-0.35*(f.koP || 0)); }
    const gallop = Math.abs(f.vx || 0)>20 ? Math.sin(f.gaitPhase || t*10)*16 : 0;
    if (!opts.noShadow) ellipse(0,0,100,10,'#100c1a88');
    ctx.save();
    if (f.mounted === false) { ctx.translate(-165,0); ctx.scale(.9,1); }
    // Slow Dancer: four articulated legs, saddle, bridle, mane and tail.
    limb(-72,-90,-107,-44,'#78939f',13); limb(-107,-44,-110+gallop, -9,'#78939f',10);
    limb(39,-95,57,-49,'#78939f',13); limb(57,-49,71-gallop,-9,'#78939f',10);
    limb(-79,-117,-119,-101,'#403444',18); limb(-119,-101,-137,-61+gallop*.3,'#403444',12);
    ellipse(-8,-106,79,38,'#b6cbd2');
    limb(-57,-93,-70,-47,'#b6cbd2',17); limb(-70,-47,-57-gallop,-6,'#b6cbd2',11);
    limb(43,-101,27,-49,'#b6cbd2',17); limb(27,-49,40+gallop,-6,'#b6cbd2',11);
    for (const x of [-110+gallop,71-gallop,-57-gallop,40+gallop]) ellipse(x,-5,10,5,'#443947');
    ellipse(60,-138,24,53,'#b6cbd2',.34); ellipse(82,-180,24,28,'#b6cbd2',-.3);
    ellipse(105,-166,26,15,'#78939f',.2); ellipse(91,-186,4,4,'#151624');
    limb(70,-201,64,-221,'#b6cbd2',9); limb(87,-205,88,-225,'#b6cbd2',9);
    for(let i=0;i<6;i++) limb(45+i*4,-167-i*6,31+i*6,-162-i*6,'#d6bd7f',7);
    ctx.strokeStyle='#815b61'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(110,-174); ctx.lineTo(100,-150); ctx.lineTo(3,-168); ctx.stroke();
    ellipse(-10,-134,35,12,'#77516b');
    ctx.restore();
    ctx.save();
    if (f.mounted === false) ctx.translate(0,130);
    // Johnny stays seated, on the saddle or on the ground.
    if (f.mounted === false) {
      limb(-9,-154,24,-145,pal.pants,19); limb(24,-145,54,-136,pal.pants,15);
      ellipse(59,-136,17,8,'#ab7ca1');
    } else {
      limb(-9,-154,24,-118,pal.pants,19); limb(24,-118,8,-78,pal.pants,15);
      ellipse(14,-77,17,8,'#ab7ca1');
    }
    ellipse(-16,-180,25,43,pal.coat,-.1);
    for (const [x,y] of [[-26,-194],[-9,-166],[-23,-214],[18,-121],[10,-100]]) {
      Art.starPath(ctx,x,y,6,2.8,5); ctx.fillStyle='#bc79b0'; ctx.fill();
    }
    limb(-22,-210,-1,-197,'#b6a0d4',12);
    limb(-29,-212,-35,-170,'#78accc',5);
    limb(-34,-169,-1,-154,'#78accc',5);
    // Long blond hair, star-patterned blue cap and gold horseshoe from reference 005.
    ellipse(-22,-228,21,36,pal.hair);
    ellipse(-9,-235,20,25,pal.skin);
    for(let i=0;i<4;i++) limb(-29+i*4,-240,-31+i*5,-192+(i%2)*8,pal.hair,5);
    ellipse(-12,-256,24,14,pal.coat); ellipse(-8,-264,19,12,pal.coat);
    for(const [x,y] of [[-25,-259],[-3,-272],[-12,-251]]) {
      Art.starPath(ctx,x,y,4.5,2,5); ctx.fillStyle='#bc79b0'; ctx.fill();
    }
    ctx.strokeStyle='#e9c56e'; ctx.lineWidth=4; ctx.beginPath();
    ctx.moveTo(-9,-267); ctx.lineTo(-9,-261); ctx.arc(-3,-261,6,Math.PI,0,true); ctx.lineTo(3,-267); ctx.stroke();
    ellipse(-1,-237,5.5,4.5,'#f4fbff'); ellipse(1,-237,3,4,'#496ec4');
    limb(8,-232,12,-226,pal.skin,3);
    limb(1,-220,10,-220,'#547bb9',4);
    limb(-4,-199,22,-176,pal.coat,15);
    limb(22,-176,f.nailPose>0?82:53,f.nailPose>0?-190:-170,pal.skin,11);
    if(f.nailPose>0) limb(77,-190,94,-190,pal.skin,5);
    if (f.blueSpin > 0) {
      ctx.strokeStyle='#71d7ff'; ctx.lineWidth=3;
      for(let i=0;i<4;i++) {
        ctx.beginPath(); ctx.ellipse(84,-190,13+i*6,7+i*2,t*16+i*.5,0,Math.PI*1.7); ctx.stroke();
      }
    }
    if (f.herbPose > 0) {
      limb(-5,-200,15,-226,pal.skin,10);
      ellipse(16,-226,10,14,'#76af78');
      limb(10,-229,21,-229,'#c9f3bd',3);
    }
    ctx.restore();
    // Tusk ACT1: tiny pink organic creature, beak, drooping ears and stars.
    if (f.showStand === false) { ctx.restore(); return; }
    ctx.save(); ctx.translate(-102,-183+Math.sin(t*3)*5);
    if(act===1) {
      ellipse(0,0,23,34,'#ed8dc8'); ellipse(0,-32,27,25,'#ffa6db');
      ellipse(-28,-24,10,30,'#d477b8',.3); ellipse(28,-24,10,30,'#d477b8',-.3);
      ellipse(-10,-34,5,8,'#241b35'); ellipse(10,-34,5,8,'#241b35');
      ctx.fillStyle='#ffe1a1'; ctx.beginPath(); ctx.moveTo(-7,-26); ctx.lineTo(0,-3); ctx.lineTo(7,-26); ctx.fill();
      for(const [x,y] of [[0,-58],[-19,-10],[15,10],[-10,28]]) star(x,y,8);
      limb(-16,7,-29,25,'#ed8dc8',8); limb(16,7,29,25,'#ed8dc8',8);
      ellipse(-12,38,10,8,'#ed8dc8'); ellipse(12,38,10,8,'#ed8dc8');
    } else if (act === 4) {
      // ACT4: massive pink shoulders, star eyes, blue gauntlets and layered oval armor.
      ctx.translate(-4,4);
      ellipse(0,-17,40,60,'#ce75a5');
      ellipse(-40,-45,28,29,'#f3a7cf'); ellipse(40,-45,28,29,'#f3a7cf');
      ellipse(0,-59,23,34,'#efb2d1');
      for(const x of [-10,10]) { Art.starPath(ctx,x,-64,6,2.7,5); ctx.fillStyle='#292340'; ctx.fill(); }
      ellipse(0,-84,5,10,'#e6e5d9');
      for(let row=0;row<4;row++) for(let col=0;col<5;col++) {
        const x=(col-2)*16+(row%2)*4, y=-12+row*22;
        ellipse(x,y,8,14,row%2?'#d782b1':'#f2b6d5');
        limb(x,y+13,x,y+17,'#8a668d',2);
      }
      for(const side of [-1,1]) {
        const reach=f.state==='special'?Math.sin(t*65+side)*30+60:46;
        limb(side*46,-32,side*reach,12,'#e59ac4',18);
        ellipse(side*reach,20,14,20,'#7f98bc'); star(side*reach,15,8);
        limb(side*20,67,side*25,108,'#d88db9',17);
        ellipse(side*27,112,18,10,'#6f8baa'); star(side*23,91,8);
        for(const [x,y] of [[side*41,-51],[side*51,-17]]) star(x,y,5);
      }
      if(f.state==='special') {
        for(let i=0;i<5;i++) {
          const x=85+Math.sin(t*50+i)*30, y=-40+i*20;
          limb(42,y,x,y-7,'#eaa0cb',9); ellipse(x,y-7,13,9,'#90a8c6');
        }
      }
    } else {
      // ACT2's hollow ear rings and grille; ACT3's armored blue shoulders and crest.
      const third=act===3;
      ellipse(0,12,third?31:23,third?47:32,'#d879af');
      ellipse(0,-33,third?37:28,third?37:29,'#f6a0d1');
      for(const side of [-1,1]) {
        ellipse(side*39,-27,18,22,third?'#7396d5':'#be699c');
        if(third) { star(side*39,-27,12); limb(side*42,-3,side*50,25,'#e893c4',13); }
        else { ellipse(side*39,-27,10,12,'#352441'); limb(side*29,4,side*45,21,'#ed93c7',10); }
        ellipse(side*17,54,12,11,'#e98cc0');
      }
      ellipse(-10,-35,4,6,'#241b35'); ellipse(10,-35,4,6,'#241b35');
      if(third) { limb(0,-64,0,-11,'#677da8',8); star(-18,-55,6); star(18,-9,6); ellipse(0,18,18,28,'#8d9fc7'); }
      else { for(let i=-2;i<=2;i++) limb(i*7,-17,i*7,-5,'#75426a',3); ellipse(-12,-60,8,12,'#bf71a9'); ellipse(12,-60,8,12,'#bf71a9'); star(0,18,10); }
      for(const [x,y] of [[-15,0],[14,35],[-9,55]]) star(x,y,5);
    }
    ctx.restore(); ctx.restore();
  };
})(window.JG.Game);
