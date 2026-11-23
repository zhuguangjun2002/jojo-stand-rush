/* =========================================================
   JOJO 奇妙格斗 · STAND RUSH — Match
   ========================================================= */
(function (G) {
  'use strict';
  const {
    $, App, Art, Audio, Fighter, GRAVITY, GROUND, H, Input, JG, LEFT, RIGHT,
    W, WORLD_W, aiInput, announce, clamp, ctx, dom, easeOut, hideClash, hideSuperBanner,
    hudCache, humanInput, lerp, rectsOverlap, showClash, showResult, showSuperBanner, toast,
    trainingInput, updateClashUI, updatePips
  } = G;

  /* =========================================================
     Match
     ========================================================= */
  // Tooru's kit was oppressing the cast through long hitstun and freeze
  // windows. Every stun he causes is shortened by this factor; damage is
  // handled separately so the two knobs can be tuned independently.
  const TOORU_STUN_SCALE = 0.8;

  class Match {
    constructor(p1Id, p2Id, mode, variant1, variant2, seed) {
      this.p1Id = p1Id;
      this.p2Id = p2Id;
      this.mode = mode;
      this.training = mode === 'training';
      this.netplay = mode === 'net';
      this.netInputs = null;
      this.seed = seed == null ? ((Math.random() * 0x7FFFFFFF) | 0) : (seed >>> 0);
      this.rngState = this.seed >>> 0;
      this.dummyGuard = false;
      this.stageId = JG.stageFor(p1Id, p2Id);
      this.stage = JG.STAGES[this.stageId];
      this.p1 = new Fighter(p1Id, 0, this.training ? 620 : 400, 1, variant1 || 0, false);
      this.p2 = new Fighter(p2Id, 1, this.training ? 980 : 1200, -1, variant2 || 0, mode === '1p' || this.training);
      this.fighters = [this.p1, this.p2];
      this.wins = [0, 0];
      this.round = 1;
      this.timer = 60;
      this.phase = 'intro';
      this.phaseTime = 0;
      this.time = 0;
      this.hitstop = 0;
      this.shake = 0;
      this.flash = 0;
      this.slow = 1;
      this.super = null;
      this.clash = null;
      this.miniTimeStop = null;
      this.finisher = null;
      this.projectiles = [];
      this.resetTuskWorld();
      this.traps = [];
      this.frogs = [];
      this.wouStones = [];
      this.wouBugs = [];
      this.josukeBubbles = [];
      this.calamityFX = [];
      this.wouRain = null;
      this.sparks = [];
      this.texts = [];
      this.rings = [];
      this.dodgeAirflows = [];
      this.particles = [];
      this.afterimages = [];
      this.superKicks = [];
      this.fightAnnounced = false;
      this.koWinner = -1;
      this.timeupWinner = -1;
      this.matchWinner = -1;
      this.resultShown = false;
      this.matchEndTime = 0;
      this.outroTime = 0;
      this.outroWinner = -1;
      this.endDelay = 0;
      this.cameraZoom = 1.1;
      this.cameraX = 800;
    }

    rand() {
      // Deterministic RNG for gameplay-affecting randomness (currently frog
      // wandering). Network clients share the same seed, so both simulations
      // stay in lockstep even though visual effects use Math.random.
      this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) >>> 0;
      return this.rngState / 4294967296;
    }

    start() {
      this.startRound();
    }

    startRound() {
      this.phase = 'intro';
      this.phaseTime = 0;
      this.fightAnnounced = false;
      this.timer = 60;
      this.hitstop = 0;
      this.shake = 0;
      this.flash = 0;
      this.super = null;
      this.clash = null;
      hideClash();
      this.miniTimeStop = null;
      this.finisher = null;
      this.outroTime = 0;
      this.outroWinner = -1;
      this.projectiles = [];
      this.resetTuskWorld();
      this.traps = [];
      this.frogs = [];
      this.wouStones = [];
      this.wouBugs = [];
      this.josukeBubbles = [];
      this.calamityFX = [];
      this.wouRain = null;
      this.sparks = [];
      this.texts = [];
      this.rings = [];
      this.dodgeAirflows = [];
      this.particles = [];
      this.afterimages = [];
      this.cameraX = 800;
      this.cameraZoom = 1.1;
      this.p1.resetRound(this.training ? 620 : 400, 1);
      this.p2.resetRound(this.training ? 980 : 1200, -1);
      this.p1.state = 'intro';
      this.p2.state = 'intro';
      for (const f of this.fighters) if (f.charId === 'johnny') f.resetJohnnyRound(this);
      if (this.training) {
        announce('TRAINING', '训练场 · 无限 HP / SP', 0.92);
      } else {
        announce('ROUND ' + this.round, this.stage.en, 0.92);
        Audio.round();
      }
      updatePips(this);
    }

    update(dt, netInputs) {
      this.netInputs = netInputs || null;
      this.time += dt;
      this.flash = Math.max(0, this.flash - dt * 2.2);
      this.shake = Math.max(0, this.shake - dt * 52);
      if (this.miniTimeStop) {
        this.miniTimeStop.time += dt;
        if (this.miniTimeStop.time >= this.miniTimeStop.duration) this.miniTimeStop = null;
      }
      const spacing = Math.abs(this.p1.x - this.p2.x);
      // Widen the framing when the fighters separate so neither can leave the screen.
      const fightZoom = clamp(W / (spacing + 260), 0.68, 1.125);
      const zoomTarget = this.finisher ? 1.22 : this.super ? 1.16 : this.phase === 'ko' ? 1.12 : fightZoom;
      this.cameraZoom = lerp(this.cameraZoom, zoomTarget, 1 - Math.exp(-4.2 * dt));
      const half = (W / 2) / this.cameraZoom;
      const focus = clamp((this.p1.x + this.p2.x) / 2, half, WORLD_W - half);
      this.cameraX = lerp(this.cameraX, focus, 1 - Math.exp(-5.2 * dt));

      if (this.clash) {
        this.updateClash(dt);
        return;
      }

      if (this.phase === 'intro') {
        this.phaseTime += dt;
        this.p1.introT = this.phaseTime;
        this.p2.introT = this.phaseTime;
        this.animFighters(dt);
        this.updateEffects(dt);
        this.p1.state = 'intro';
        this.p2.state = 'intro';
        if (!this.fightAnnounced && this.phaseTime > 0.72) {
          this.fightAnnounced = true;
          announce('FIGHT!', '战斗开始', 0.82);
          Audio.confirm();
          this.flash = 0.22;
        }
        if (this.phaseTime > 1.58) {
          this.phase = 'fight';
          this.phaseTime = 0;
          this.p1.state = 'idle';
          this.p2.state = 'idle';
          Input.clear();
        }
        return;
      }

      if (this.phase === 'ko') {
        this.phaseTime += dt;
        this.updateKO(dt);
        return;
      }

      if (this.phase === 'timeup') {
        this.phaseTime += dt;
        this.outroTime += dt;
        this.animFighters(dt);
        this.updateEffects(dt);
        if (this.phaseTime > 1.1) this.endRound(this.timeupWinner, 'TIME UP');
        return;
      }

      if (this.phase === 'roundEnd') {
        this.phaseTime += dt;
        this.outroTime += dt;
        this.animFighters(dt);
        this.updateEffects(dt);
        if (this.phaseTime > 1.15) {
          if (this.wins[0] >= 2 || this.wins[1] >= 2 || this.round >= 5) {
            this.endMatch();
          } else {
            this.round += 1;
            this.startRound();
          }
        }
        return;
      }

      if (this.phase === 'matchEnd') {
        this.matchEndTime += dt;
        this.outroTime += dt;
        for (const f of this.fighters) f.outroT = this.outroTime;
        this.animFighters(dt);
        this.updateEffects(dt);
        if (!this.resultShown && this.matchEndTime > 1.3) {
          this.resultShown = true;
          showResult(this);
        }
        return;
      }

      if (this.phase !== 'fight') return;

      this.updateTuskTimeless(dt, netInputs);
      if (this.phase !== 'fight') return;

      if (this.training) {
        this.p1.hp = this.p1.maxHp;
        this.p1.meter = 100;
        this.timer = 60;
        if (this.p2.hp <= 0) this.p2.hp = this.p2.maxHp;
      }

      if (this.hitstop > 0) {
        this.hitstop -= dt;
        this.updateEffects(dt * 0.25);
        return;
      }

      if (this.super) {
        this.updateSuper(dt);
        this.animFighters(dt);
        this.updateEffects(dt);
        return;
      }

      if (this.wouRain) {
        this.updateWouRain(dt);
        this.animFighters(dt);
        this.updateEffects(dt);
        return;
      }

      const i1 = this.netplay ? (netInputs ? netInputs[0] : null) : humanInput(0);
      const i2 = this.netplay
        ? (netInputs ? netInputs[1] : null)
        : (this.training ? trainingInput(this) : this.p2.cpu ? aiInput(this.p2, this.p1, dt, this) : humanInput(1));
      if (this.netplay && (!i1 || !i2)) return;
      // Both barrages from the previous frame, or both holding K in range:
      // clash before either barrage tick lands.
      if (this.checkClash(i1, i2)) return;
      this.p1.update(dt, this.p2, i1, this);
      if (this.clash) return;
      this.p2.update(dt, this.p1, i2, this);
      // Both Stands can meet in the middle while barraging. Detect it before
      // the next barrage tick so the clash starts before either side gets a
      // free hit in.
      if (this.clash || this.checkClash()) return;
      this.animFighters(dt);
      this.updateEffects(dt);
      this.updateTuskWorld(dt);
      this.updateProjectiles(dt);
      this.updateTraps(dt);
      this.updateFrogs(dt);
      this.updateWouStones(dt);
      this.updateWouBugs(dt);
      this.updateJosukeBubbles(dt);
      this.updateCalamityFX(dt);
      this.checkGerPrompt();

      if (!this.training) {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.timer = 0;
          this.finishTimeUp();
        }
      }
    }

    animFighters(dt) {
      for (const f of this.fighters) {
        Art.updatePose(f, dt, this.time + f.animTime);
      }
    }

    burst(f) {
      if (this.phase !== 'fight' || this.super || f.hitstun <= 0 || f.meter < 25 || f.burstCd > 0) return false;
      const opp = f.index === 0 ? this.p2 : this.p1;
      f.meter = Math.max(0, f.meter - 25);
      f.burstCd = 10;
      f.hitstun = 0;
      f.blockstun = 0;
      f.attack = null;
      f.specialAction = null;
      f.standAlpha = null;
      // Escape invulnerability is deliberately short; the translucent body
      // makes the one-second window readable without hiding the character.
      f.invuln = Math.max(f.invuln, 1.0);
      f.escapeFade = 1.0;
      if (f.charId === 'tooru') {
        // Escape is a backward blink, not a teleport behind the opponent.
        const oldX = f.x;
        const dir = opp.x >= f.x ? 1 : -1;
        this.spawnAfterimage(f, { life: 0.24, alpha: 0.28 });
        f.x = clamp(f.x - dir * 200, LEFT, RIGHT);
        f.y = GROUND;
        f.onGround = true;
        f.vy = 0;
        f.vx = 0;
        f.facing = opp.x >= f.x ? 1 : -1;
        f.state = 'idle';
        f.squash = -0.06;
        this.spawnRing(oldX, f.y - 95, '#ff4055', 78);
        this.spawnRing(f.x, f.y - 95, '#ff4055', 78);
        this.spawnDust(f.x, f.y, 6, '#ff4055');
        this.spawnAfterimage(f, { life: 0.24, alpha: 0.28 });
      } else {
        f.onGround = false;
        f.vy = -350;
        f.vx = -f.facing * 390;
        f.state = 'jump';
        f.squash = -0.08;
      }
      // Escape is self-only: the opponent is not pushed, stunned, or
      // interrupted. The escaping fighter simply becomes invulnerable.
      this.hitstop = Math.max(this.hitstop, 0.1);
      this.shake = Math.max(this.shake, 16);
      this.flash = Math.max(this.flash, 0.28);
      this.spawnRing(f.x, f.y - 100, '#9de8ff', 120);
      this.spawnRing(f.x, f.y - 100, '#fff4d0', 70);
      this.spawnSpark(f.x, f.y - 110, '#fff4d0', 46);
      this.spawnDust(f.x, f.y, 10, '#9de8ff');
      this.spawnText(f.x, f.y - 265, 'BREAK OUT!', '#9de8ff', 30, 0.9);
      this.spawnText(f.x, f.y - 300, '-25 SP', '#a8ffb4', 18, 0.7);
      Audio.guardBreak();
      return true;
    }

    resolveHit(attacker, defender, move, opts) {
      if (this.phase !== 'fight' || (this.super && !this.isTuskTimeFree(attacker))) return false;
      if (defender.hp <= 0 || defender.tuskHidden) return false;
      if (defender.invuln > 0) return false;
      // Go Beyond was literally created to bypass Wonder of U's causality.
      // Its attacks do not wake the calamity stance or the domain counter.
      const ignoresCalamity = attacker.charId === 'josuke' && attacker.goBeyond;
      // Wonder of U's short-H calamity stance: the hit is erased and the
      // attacker is the one who gets crushed.
      if (defender.charId === 'tooru' && defender.calamityGuard > 0 && !ignoresCalamity) {
        this.wouCounter(defender, attacker, 'car', false);
        return false;
      }
      opts = opts || {};
      const breaksGuard = (defender.guarding || defender.blockstun > 0) && (move.unblockable || move.guardBreak);
      const blocking = defender.guarding && !move.unblockable && !move.guardBreak && defender.blockstun <= 0;
      const contactX = clamp((attacker.x + defender.x) / 2 + attacker.facing * 10, LEFT + 10, RIGHT - 10);
      const contactY = defender.y - (135 + Math.random() * 45);

      if (blocking) {
        const chip = Math.max(1, move.damage * 0.12);
        defender.hp = Math.max(0, defender.hp - chip);
        defender.blockstun = Math.max(defender.blockstun, move.blockstun || 0.12);
        defender.vx = attacker.facing * (move.knockback || 80) * 0.45;
        this.hitstop = Math.max(this.hitstop, 0.03);
        this.shake = Math.max(this.shake, 4);
        this.spawnSpark(contactX, contactY, '#74e8ff', 20);
        this.spawnRing(contactX, contactY, '#74e8ff', 52);
        this.spawnText(contactX, contactY - 30, 'GUARD', '#8deaff', 17, 0.5);
        if (move.dive) {
          attacker.vy = -330;
          attacker.vx = -attacker.facing * 165;
          attacker.onGround = false;
        }
        Audio.block();
        if (defender.hp <= 0) this.beginKO(attacker);
        return true;
      }

      if (attacker.comboTimer <= 0) attacker.combo = 0;
      attacker.combo += 1;
      attacker.comboTimer = 1.25;
      attacker.maxCombo = Math.max(attacker.maxCombo, attacker.combo);
      const scale = attacker.combo <= 2 ? 1 : Math.max(0.54, 1 - (attacker.combo - 2) * 0.085);
      let dmg = move.damage * scale;
      if (attacker.cpu) dmg *= (JG.DIFFICULTY[App.difficulty] || JG.DIFFICULTY.normal).damage;
      if (attacker.charId === 'tooru' && attacker.wouDomain > 0) dmg *= 1.2;
      if (defender.charId === 'tooru' && defender.wouDomain > 0) dmg *= 0.7;
      // Stolen attributes are real stat changes, not just floating text.
      if ((attacker.attrDebuff === 'power' || attacker.attrDebuff === 'all') &&
          attacker.attrDebuffTimer > 0) dmg *= 0.85;
      if ((attacker.attrBuff === 'power' || attacker.attrBuff === 'all') &&
          attacker.attrBuffTimer > 0) dmg *= 1.15;
      if ((defender.attrBuff === 'defense' || defender.attrBuff === 'all') &&
          defender.attrBuffTimer > 0) dmg *= 0.88;
      if ((defender.attrDebuff === 'defense' || defender.attrDebuff === 'all') &&
          defender.attrDebuffTimer > 0) dmg *= 1.12;
      dmg = Math.round(dmg);

      defender.hp = Math.max(0, defender.hp - dmg);
      if (breaksGuard && defender.charId !== 'tooru') {
        defender.guardLock = Math.max(defender.guardLock, 3);
        this.spawnText(defender.x, defender.y - 285, '防御封锁 3秒', '#ffba72', 20, 1);
      }
      defender.gainSpecialOnHit();
      const hitstun = (move.hitstun || 0.28) *
        (attacker.charId === 'tooru' ? TOORU_STUN_SCALE : 1);
      defender.hitstun = Math.max(defender.hitstun, hitstun);
      defender.blockstun = 0;
      defender.guarding = false;
      defender.hitFlash = 0.13;
      defender.squash = clamp(dmg / 460, 0.07, 0.24);
      defender.invuln = 0;
      // A clean hit interrupts whatever the defender was winding up.
      const interruptedTimestopStrike = !!(defender.specialAction && defender.specialAction.type === 'timestopstrike');
      defender.attack = null;
      defender.attackTime = 0;
      defender.chainCount = 0;
      defender.bufferedAttack = null;
      defender.specialAction = null;
      defender.perfectWindow = 0;
      defender.perfectFollowupTimer = 0;
      if (interruptedTimestopStrike) {
        attacker.frozen = false;
        if (attacker.state === 'frozen') attacker.state = 'idle';
        this.miniTimeStop = null;
        Audio.pauseVoices();
      }
      Audio.stopChant(defender);
      defender.airStandActive = false;
      defender.gerGrabActive = false;
      defender.standAlpha = null;
      if (move.guardBreak) {
        defender.guardBroken = Math.max(defender.guardBroken, move.guardBreak);
        this.spawnText(contactX + 58, contactY - 132, 'GUARD BREAK!', '#fff2b0', 25, 0.85);
      }
      // Normal attacks keep the victim in place so J -> K / light -> heavy
      // links actually connect. Specials, throws and projectiles keep their
      // intended knockback for spacing and wall carry.
      const kb = opts.source === 'normal'
        ? 0
        : (move.knockback || 100) / defender.data.weight;
      defender.vx = attacker.facing * kb;
      if (move.lift) {
        defender.vy = move.lift / defender.data.weight;
        defender.onGround = false;
      }
      if (defender.charId === 'johnny') {
        defender.horseDash = 0;
        defender.heavyHold = 0;
        defender.nailPose = 0;
        Audio.johnnyLine('hurt');
      }
      attacker.damageDealt += dmg;
      // Energy rules: J +5, short K +8, held-K barrage +1, H is handled once on cast,
      // L/U and all projectiles give nothing; being hit gives/takes no energy.
      let meterGain = 0;
      if (opts.source === 'normal') meterGain = move.heavy ? 8 : 5;
      else if (opts.source === 'barrage') meterGain = 1;
      if (meterGain) {
        attacker.meter = Math.min(100, attacker.meter + meterGain);
        // Josuke converts half of every ordinary SP gain into special energy.
        attacker.gainSpecialFromEnergy(meterGain);
      }
      attacker.vx = -attacker.facing * 35;

      const heavy = !!move.heavy;
      this.hitstop = Math.max(this.hitstop, move.guardBreak ? 0.105 : heavy ? 0.085 : 0.048);
      this.shake = Math.max(this.shake, move.guardBreak ? 19 : heavy ? 15 : 8);
      this.flash = Math.max(this.flash, move.guardBreak ? 0.34 : heavy ? 0.24 : 0.08);
      this.spawnSpark(contactX, contactY, attacker.data.accent, heavy ? 44 : 28);
      if (move.airflow && attacker.charId === 'jotaro') {
        this.dodgeAirflows.push({ x: defender.x, y: defender.y - 135,
          dir: attacker.facing, life: 0.45 });
        this.spawnText(defender.x, defender.y - 260, '贯风重击', '#a9f0ff', 27, 0.8);
      }
      this.spawnRing(contactX, contactY, attacker.data.accent, heavy ? 110 : 64);
      this.spawnDust(contactX, contactY, heavy ? 7 : 3, attacker.data.accent);
      this.spawnText(contactX + (Math.random() * 30 - 15), contactY - 38, String(dmg), heavy ? '#ffe9a3' : '#fff3d2', heavy ? 30 : 23, 0.65);
      if (opts.source === 'rush' && Math.random() < 0.4) {
        this.spawnText(contactX + 20, contactY - 75, 'ドン!', attacker.data.accent, 21, 0.42);
      }
      if (move.dive) {
        attacker.vy = -430;
        attacker.vx = -attacker.facing * 190;
        attacker.onGround = false;
        this.spawnRing(contactX, contactY, '#ffe9a6', 88);
        this.spawnDust(contactX, contactY, 6, '#ffe0a0');
      }
      if (move.launcher) {
        this.spawnText(contactX + 10, contactY - 118, '打上天!', '#ffe06a', 32, 0.75);
        this.spawnRing(contactX, contactY, '#ffd76a', 95);
        this.spawnSpark(contactX, contactY - 20, '#fff1b0', 48);
      }
      if (move.dashStrike) {
        this.spawnText(contactX + 30, contactY - 78, 'DASH!', '#8deaff', 21, 0.55);
      }
      if (move.guardBreak) {
        Audio.guardBreak();
      } else if (opts.source === 'barrage' || opts.source === 'rush') {
        Audio.hitBarrage();
      } else if (heavy) {
        if (!move.launcher) this.spawnText(contactX + 28, contactY - 86, 'ドゴォ!', '#ffe06a', 34, 0.55);
        Audio.hitHeavy();
      } else {
        Audio.hitLight();
      }
      if (defender.charId === 'tooru' && defender.wouDomain > 0 &&
          defender.wouDomainProcCd <= 0 && defender.hp > 0 && attacker.hp > 0 &&
          !ignoresCalamity && this.rand() < 0.4) {
        defender.wouDomainProcCd = 0.8;
        this.wouCounter(defender, attacker, this.rand() < 0.5 ? 'plate' : 'car', true);
      }
      if (defender.hp <= 0) this.beginKO(attacker);
      return true;
    }

    spawnProjectile(owner, sp) {
      const dir = owner.facing;
      if (sp.kind === 'starfinger' || sp.kind === 'meteor' || sp.kind === 'eyebeam' || sp.kind === 'lifeline' || sp.kind === 'gerray') {
        this.projectiles.push({
          x: owner.x + dir * 68,
          y: owner.y - (sp.yOffset || 160),
          vx: dir * sp.speed,
          vy: 0,
          w: sp.width || 130,
          h: sp.height || 10,
          owner,
          ownerIndex: owner.index,
          damage: sp.damage,
          hitstun: sp.hitstun || 0.4,
          knockback: sp.knockback || 180,
          meterGain: 8,
          unblockable: !!sp.unblockable,
          followup: sp.followup || null,
          jumpDodge: !!sp.jumpDodge,
          drain: sp.drain || 0,
          kind: sp.kind,
          life: 0.55,
          rot: dir > 0 ? 0 : Math.PI,
          color: sp.color || owner.data.accent,
          seed: Math.random() * 10
        });
        return;
      }
      const count = sp.count || 1;
      for (let i = 0; i < count; i++) {
        const spread = (i - (count - 1) / 2) * (sp.spread || 0);
        const py = owner.y - 152 + (i - (count - 1) / 2) * 24;
        this.projectiles.push({
          x: owner.x + dir * 62,
          y: py,
          vx: dir * sp.speed,
          vy: spread * sp.speed * 0.34,
          w: sp.projectile === 'knife' ? 46 : 28,
          h: sp.projectile === 'knife' ? 12 : 20,
          owner,
          ownerIndex: owner.index,
          damage: sp.damage,
          hitstun: 0.34,
          knockback: 135,
          meterGain: 6,
          kind: sp.projectile,
          life: 2.2,
          rot: Math.atan2(spread * sp.speed * 0.34, dir * sp.speed),
          color: owner.data.accent,
          seed: Math.random() * 10
        });
      }
    }

    spawnTrap(owner, x, sp) {
      this.traps.push({
        owner,
        x: clamp(x, LEFT, RIGHT),
        t: 0,
        hit: false,
        radius: sp.radius || 76,
        damage: sp.damage,
        heal: sp.heal || 0,
        unblockable: !!sp.unblockable,
        color: '#8dff9a',
        seed: Math.random() * 100
      });
    }

    updateProjectiles(dt) {
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (Math.random() < 0.55) {
          this.particles.push({
            x: p.x, y: p.y, vx: -p.vx * 0.05 + (Math.random() - 0.5) * 20,
            vy: (Math.random() - 0.5) * 20, life: 0.22, max: 0.22, size: 2, color: p.color
          });
        }
        const target = p.owner.index === 0 ? this.p2 : this.p1;
        const box = { x1: p.x - p.w / 2, x2: p.x + p.w / 2, y1: p.y - p.h / 2, y2: p.y + p.h / 2 };
        if (p.life <= 0 || p.x < -100 || p.x > WORLD_W + 100) {
          this.projectiles.splice(i, 1);
          continue;
        }
        if (target.hp > 0 && rectsOverlap(box, target.getHurtbox())) {
          // Star Finger is a grounded beam. Jumping over it consumes the
          // projectile so it cannot hit on the way down either.
          if (p.jumpDodge && (!target.onGround || target.y < GROUND - 28)) {
            this.spawnText(target.x, target.y - 188, '跳跃回避', p.color, 18, 0.6);
            this.projectiles.splice(i, 1);
            continue;
          }
          const guarded = target.guarding && !p.unblockable;
          this.resolveHit(p.owner, target, {
            damage: p.damage, hitstun: p.hitstun, blockstun: 0.16,
            knockback: p.knockback, lift: 0, meterGain: p.meterGain, sfx: 'hitLight',
            unblockable: !!p.unblockable, drain: p.drain || 0, heavy: p.kind === 'gerray'
          }, { source: 'projectile' });
          this.spawnSpark(p.x, p.y, p.color, 24);
          this.projectiles.splice(i, 1);
          // Star Finger follow-up only on a clean hit; a guarded beam just chips.
          if (p.followup === 'starPlatinum' && !guarded && target.hp > 0) {
            p.owner.startStarFollowup(this, target);
          }
        }
      }
    }

    updateTraps(dt) {
      for (let i = this.traps.length - 1; i >= 0; i--) {
        const tr = this.traps[i];
        tr.t += dt;
        const target = tr.owner.index === 0 ? this.p2 : this.p1;
        if (!tr.hit && tr.t > 0.18 && target.hp > 0) {
          if (Math.abs(target.x - tr.x) < tr.radius && target.onGround) {
            tr.hit = true;
            this.resolveHit(tr.owner, target, {
              damage: tr.damage, hitstun: 0.55, blockstun: 0.2,
              knockback: 190, lift: -130, meterGain: 8, sfx: 'hitHeavy', heavy: true,
              unblockable: !!tr.unblockable
            }, { source: 'trap' });
            this.spawnRing(tr.x, GROUND - 55, tr.color, 130);
            this.spawnText(target.x, target.y - 220, '生命の奔流', '#b9ff9a', 26, 0.8);
            if (tr.heal > 0) {
              tr.owner.hp = Math.min(tr.owner.maxHp, tr.owner.hp + tr.heal);
              this.spawnText(tr.owner.x, tr.owner.y - 215, '+' + tr.heal, '#a8ffb4', 22, 0.7);
            }
          }
        }
        if (tr.t > 1.1) this.traps.splice(i, 1);
      }
    }

    spawnFrog(owner, sp, cost) {
      this.frogs.push({
        owner,
        ownerIndex: owner.index,
        x: clamp(owner.x + owner.facing * 78, LEFT + 44, RIGHT - 44),
        dir: owner.facing || 1,
        t: 0,
        life: sp.duration || 8,
        speed: sp.speed || 96,
        turnTimer: 0.8 + this.rand() * 1.2,
        hopSeed: this.rand() * 100,
        triggered: false,
        fade: 0,
        damagePercent: sp.damagePercent || 0.05,
        cost: cost || 0,
        color: sp.color || '#8dffb1'
      });
    }

    updateFrogs(dt) {
      for (let i = this.frogs.length - 1; i >= 0; i--) {
        const fr = this.frogs[i];
        fr.t += dt;
        if (fr.triggered) {
          fr.fade += dt;
          if (fr.fade >= 0.36) this.frogs.splice(i, 1);
          continue;
        }
        fr.life -= dt;
        if (fr.life <= 0 || fr.owner.hp <= 0) {
          // The frog never got the opponent's attention: refund the SP so a
          // whiffed summon does not cost Giorno anything.
          if (!fr.triggered && fr.cost > 0 && fr.owner.hp > 0) {
            fr.owner.meter = Math.min(100, fr.owner.meter + fr.cost);
            this.spawnText(fr.owner.x, fr.owner.y - 230, '青蛙未奏效 · SP 返还', '#a8ffb4', 16, 0.8);
          }
          this.spawnText(fr.x, GROUND - 66, '青蛙回去了', fr.color, 14, 0.6);
          this.frogs.splice(i, 1);
          continue;
        }

        // Wander around the arena instead of sitting in one spot.
        fr.turnTimer -= dt;
        if (fr.turnTimer <= 0) {
          fr.turnTimer = 0.85 + this.rand() * 1.5;
          if (this.rand() < 0.58) fr.dir *= -1;
        }
        fr.x += fr.dir * fr.speed * dt;
        if (fr.x < LEFT + 44) {
          fr.x = LEFT + 44;
          fr.dir = 1;
        } else if (fr.x > RIGHT - 44) {
          fr.x = RIGHT - 44;
          fr.dir = -1;
        }

        const target = fr.owner.index === 0 ? this.p2 : this.p1;
        if (!target || target.hp <= 0) continue;
        // Generous vertical box: the frog is small, but normal attacks aim at
        // torso height, so a pure ground-level hurtbox would be unhittable.
        const frogBox = { x1: fr.x - 34, x2: fr.x + 34, y1: GROUND - 170, y2: GROUND - 2 };
        let attacked = false;

        // Normal attacks / dive / launcher / dash strike.
        if (target.attack) {
          const a = target.attack;
          const active = target.attackTime >= a.startup - 0.01 &&
            target.attackTime <= a.startup + a.active + 0.01;
          if (active && rectsOverlap(target.getAttackBox(a), frogBox)) attacked = true;
        }

        // Melee specials and barrages.
        if (!attacked && target.specialAction) {
          const type = target.specialAction.type;
          const reach = type === 'rush' ? 214 : type === 'barrage' ? 152 : type === 'gergrab' ? 126 : 0;
          if (reach && target.specialAction.time > 0.03 &&
              Math.abs(target.x - fr.x) < reach && Math.abs(target.y - GROUND) < 170) {
            attacked = true;
          }
        }

        // Projectiles aimed at the frog.
        if (!attacked) {
          for (let j = this.projectiles.length - 1; j >= 0; j--) {
            const p = this.projectiles[j];
            if (p.owner !== target) continue;
            const box = {
              x1: p.x - p.w / 2, x2: p.x + p.w / 2,
              y1: p.y - p.h / 2, y2: p.y + p.h / 2
            };
            if (rectsOverlap(box, frogBox)) {
              this.projectiles.splice(j, 1);
              attacked = true;
              break;
            }
          }
        }

        if (!attacked) continue;

        // Attacking the frog costs the opponent 5% of their max HP, direct and
        // unblockable. Giorno's SP was already paid when the frog was summoned.
        fr.triggered = true;
        fr.fade = 0;
        const dmg = Math.max(1, Math.round(target.maxHp * fr.damagePercent));
        target.hp = Math.max(0, target.hp - dmg);
        target.gainSpecialOnHit();
        fr.owner.damageDealt += dmg;
        target.hitFlash = Math.max(target.hitFlash, 0.16);
        target.squash = Math.max(target.squash, 0.12);
        // The frog is meant to be a real harassment tool: a longer stun gives
        // Giorno time to walk in / set up a tree or vine.
        target.hitstun = Math.max(target.hitstun, 2.0);
        target.state = 'hitstun';
        target.attack = null;
        target.attackTime = 0;
        target.specialAction = null;
        target.standAlpha = null;
        target.guarding = false;
        this.spawnText(target.x, target.y - 190, '-' + dmg + ' · 5%', fr.color, 24, 0.8);
        this.spawnText(fr.x, GROUND - 78, 'FROG!', fr.color, 18, 0.55);
        this.spawnRing(fr.x, GROUND - 32, fr.color, 110);
        this.spawnSpark(fr.x, GROUND - 34, fr.color, 22);
        this.spawnDust(fr.x, GROUND, 8, fr.color);
        this.shake = Math.max(this.shake, 8);
        this.flash = Math.max(this.flash, 0.12);
        Audio.hitLight();
        if (target.hp <= 0) this.beginKO(fr.owner);
      }
    }

    checkClash(i1, i2) {
      if (this.fighters.some(f => f.charId === 'johnny')) return false;
      if (this.clash || this.phase !== 'fight' || this.super) return false;
      const dist = Math.abs(this.p1.x - this.p2.x);
      if (Math.abs(this.p1.y - this.p2.y) > 130) return false;
      const a1 = this.p1.specialAction;
      const a2 = this.p2.specialAction;
      const bothBarrage = a1 && a2 && a1.type === 'barrage' && a2.type === 'barrage';
      // Kakyoin's held K is a projectile stream, not a fist exchange.
      if (a1 && a1.type === 'barrage' && (a1.move.style || 'melee') !== 'melee') return false;
      if (a2 && a2.type === 'barrage' && (a2.move.style || 'melee') !== 'melee') return false;

      // Also catch the moment both players are charging the same held-K heavy.
      // Without this, the first heavy hit knocks the other out of range before
      // the barrage phase can ever meet.
      const bothHolding = i1 && i2 && i1.heavy && i2.heavy &&
        this.p1.heavyHold > 0.08 && this.p2.heavyHold > 0.08 &&
        this.p1.onGround && this.p2.onGround &&
        this.p1.hitstun <= 0 && this.p2.hitstun <= 0 &&
        this.p1.blockstun <= 0 && this.p2.blockstun <= 0 &&
        !this.p1.guarding && !this.p2.guarding &&
        !this.p1.specialAction && !this.p2.specialAction;

      if (bothBarrage) {
        const reach = Math.min(a1.move.range || 140, a2.move.range || 140) + 12;
        if (dist > reach) return false;
      } else if (bothHolding) {
        if (this.p1.data.barrage.style !== 'melee' || this.p2.data.barrage.style !== 'melee') return false;
        if (dist > 185) return false;
      } else {
        return false;
      }
      this.beginClash();
      return true;
    }

    beginClash() {
      const mid = clamp((this.p1.x + this.p2.x) / 2, LEFT + 100, RIGHT - 100);
      this.p1.x = clamp(mid - 64, LEFT + 20, RIGHT - 20);
      this.p2.x = clamp(mid + 64, LEFT + 20, RIGHT - 20);
      this.p1.facing = 1;
      this.p2.facing = -1;
      for (const f of this.fighters) {
        Audio.stopChant(f);
        f.attack = null;
        f.attackTime = 0;
        f.specialAction = null;
        f.specialTime = 0;
        f.attackHasHit = false;
        f.vx = 0;
        f.vy = 0;
        f.y = GROUND;
        f.onGround = true;
        f.hitstun = 0;
        f.blockstun = 0;
        f.guarding = false;
        f.standAlpha = 1;
        f.state = 'attack';
      }
      this.clash = {
        time: 0, taps: [0, 0], maxTaps: 50,
        escapeHold: [0, 0], winner: -1,
        aiTapAcc: 0, aiEscapeHold: 0, tick: 0
      };
      showClash(this);
      updateClashUI(this.clash);
      this.spawnRing(mid, GROUND - 120, '#ffe06a', 190);
      this.spawnRing(mid, GROUND - 120, '#ff5a8a', 130);
      this.spawnText(mid, GROUND - 255, 'STAND CLASH', '#ffe06a', 32, 1.0);
      this.flash = Math.max(this.flash, 0.38);
      this.shake = Math.max(this.shake, 18);
      Audio.guardBreak();
      Audio.special();
    }

    updateClash(dt) {
      const c = this.clash;
      if (!c) return;
      c.time += dt;
      c.tick += dt;
      if (c.tick >= 0.09) {
        c.tick = 0;
        const mx = (this.p1.x + this.p2.x) / 2;
        this.spawnSpark(mx + (Math.random() - 0.5) * 70, GROUND - 140 - Math.random() * 60, '#ffe06a', 8);
        this.spawnRing(mx, GROUND - 135, Math.random() < 0.5 ? '#ffe06a' : '#ff5a8a', 46);
      }

      const inputs = this.netInputs
        ? [this.netInputs[0], this.netInputs[1]]
        : [humanInput(0), this.p2.cpu ? null : humanInput(1)];
      for (let i = 0; i < 2; i++) {
        const inp = inputs[i];
        if (!inp) continue;
        if (inp.pHeavy) c.taps[i] = Math.min(c.maxTaps, c.taps[i] + 1);
        if (inp.dodge) c.escapeHold[i] += dt;
        else c.escapeHold[i] = 0;
        if (c.escapeHold[i] >= 0.75 && this.fighters[i].meter >= 50) {
          this.escapeClash(i);
          return;
        }
      }

      if (this.p2.cpu) {
        const diff = JG.DIFFICULTY[App.difficulty] || JG.DIFFICULTY.normal;
        // Rapid K taps scale with the same difficulty knobs as the rest of AI.
        const rate = 3 + diff.aggression * 3 + (0.6 - Math.min(0.6, diff.reaction)) * 6;
        c.aiTapAcc += rate * dt * (0.85 + Math.random() * 0.3);
        while (c.aiTapAcc >= 1) {
          c.aiTapAcc -= 1;
          c.taps[1] = Math.min(c.maxTaps, c.taps[1] + 1);
        }
        if (c.taps[0] > c.taps[1] + 12 && this.p2.meter >= 50) c.aiEscapeHold += dt;
        else c.aiEscapeHold = 0;
        if (c.aiEscapeHold >= 0.75) {
          this.escapeClash(1);
          return;
        }
      }

      updateClashUI(c);
      if (c.taps[0] >= c.maxTaps || c.taps[1] >= c.maxTaps) {
        if (c.taps[0] === c.taps[1]) this.finishClash(-1);
        else this.finishClash(c.taps[0] > c.taps[1] ? 0 : 1);
        return;
      }
      if (c.time >= 12) {
        this.finishClash(-1);
        return;
      }

      this.animFighters(dt);
      this.updateEffects(dt);
    }

    escapeClash(index) {
      const f = this.fighters[index];
      if (!f || f.meter < 50) return false;
      f.meter = Math.max(0, f.meter - 50);
      f.invuln = Math.max(f.invuln, 1.2);
      f.hitstun = 0;
      f.blockstun = 0;
      f.specialAction = null;
      f.attack = null;
      f.state = 'jump';
      f.onGround = false;
      f.vy = -300;
      f.vx = (index === 0 ? -1 : 1) * 420;
      const other = this.fighters[1 - index];
      other.state = 'idle';
      other.vx = 0;
      this.spawnText(f.x, f.y - 250, '脱离!', '#8deaff', 24, 0.8);
      this.spawnRing(f.x, f.y - 110, '#8deaff', 120);
      this.spawnText(f.x, f.y - 220, '-50 SP', '#a8ffb4', 16, 0.7);
      this.clash = null;
      hideClash();
      this.hitstop = Math.max(this.hitstop, 0.05);
      Audio.whiff();
      return true;
    }

    finishClash(winnerIndex) {
      const c = this.clash;
      if (!c) return;
      const mid = (this.p1.x + this.p2.x) / 2;
      if (winnerIndex >= 0) {
        const winner = this.fighters[winnerIndex];
        const loser = this.fighters[1 - winnerIndex];
        const dmg = Math.max(1, Math.round(loser.maxHp * 0.3));
        loser.hp = Math.max(0, loser.hp - dmg);
        winner.damageDealt += dmg;
        loser.hitFlash = 0.22;
        loser.hitstun = Math.max(loser.hitstun, 0.55);
        loser.blockstun = 0;
        loser.state = 'hitstun';
        loser.vx = (winnerIndex === 0 ? 1 : -1) * 380;
        loser.vy = -180;
        loser.onGround = false;
        winner.state = 'idle';
        winner.vx = 0;
        this.spawnText(loser.x, loser.y - 255, '-' + dmg + ' · 30%', '#ff6b8a', 30, 1.0);
        this.spawnText(mid, GROUND - 175, 'CLASH WIN!', '#ffe06a', 26, 0.8);
        this.spawnRing(mid, GROUND - 130, '#ffe06a', 220);
        this.flash = Math.max(this.flash, 0.55);
        this.shake = Math.max(this.shake, 24);
        Audio.hitHeavy();
        if (loser.hp <= 0) {
          this.clash = null;
          hideClash();
          this.beginKO(winner);
          return;
        }
      } else {
        this.spawnText(mid, GROUND - 170, 'DRAW', '#9de8ff', 26, 0.8);
        for (const f of this.fighters) {
          f.hitstun = Math.max(f.hitstun, 0.2);
          f.state = 'idle';
          f.vx = 0;
        }
      }
      for (const f of this.fighters) {
        f.attack = null;
        f.specialAction = null;
        f.guarding = false;
        f.standAlpha = 1;
      }
      this.clash = null;
      hideClash();
      this.hitstop = Math.max(this.hitstop, 0.06);
    }

    spawnWouStone(owner, sp) {
      this.wouStones.push({
        owner, ownerIndex: owner.index,
        x: owner.x + owner.facing * 54, y: GROUND - 11,
        dir: owner.facing, speed: sp.speed || 250,
        life: (sp.maxDist || 500) / (sp.speed || 250),
        damage: sp.damage || 64, color: sp.color || '#e4d0a0',
        jumping: false, jumpT: 0, t: 0, seed: Math.random() * 10
      });
    }

    updateWouStones(dt) {
      for (let i = this.wouStones.length - 1; i >= 0; i--) {
        const st = this.wouStones[i];
        st.t += dt;
        st.life -= dt;
        const target = st.owner.index === 0 ? this.p2 : this.p1;
        // Stones travel in the direction they were thrown; they do not turn
        // around to chase the opponent.
        if (!st.jumping && target.hp > 0 && target.onGround &&
            Math.abs(target.x - st.x) < 95) {
          st.jumping = true;
          st.jumpT = 0;
        }
        st.x += st.dir * st.speed * dt;
        if (st.jumping) {
          st.jumpT += dt;
          st.y = GROUND - 11 - Math.sin(clamp(st.jumpT / 0.24, 0, 1) * Math.PI) * 88;
          if (st.jumpT > 0.5) {
            st.jumping = false;
            st.y = GROUND - 11;
          }
        } else {
          st.y = GROUND - 11;
        }
        // A grounded stone can be cleared by jumping; it must not clip an
        // airborne target on the way up or down.
        const hit = target.hp > 0 && target.onGround &&
          Math.abs(target.x - st.x) < 38 &&
          (st.jumping ? st.jumpT >= 0.08 : true);
        if (hit) {
          this.resolveHit(st.owner, target, {
            damage: st.damage, hitstun: 0.55, blockstun: 0.22,
            knockback: 180, lift: -80, heavy: true, unblockable: true, sfx: 'hitHeavy'
          }, { source: 'second' });
          const owner = st.owner;
          owner.meter = Math.min(100, owner.meter + 15);
          if (owner.stoneWindow <= 0) owner.stoneHits = 0;
          owner.stoneHits += 1;
          owner.stoneWindow = 5;
          target.stoneCover = Math.max(target.stoneCover, 4);
          this.spawnRing(target.x, target.y - 70, st.color, 110);
          this.spawnDust(target.x, target.y - 20, 12, st.color);
          this.spawnText(target.x, target.y - 210, '石头缠身', st.color, 20, 0.8);
          if (owner.stoneHits >= 5) {
            owner.stoneHits = 0;
            owner.stoneWindow = 0;
            this.stoneExplosion(owner, target);
          }
          this.wouStones.splice(i, 1);
          continue;
        }
        if (st.life <= 0 || st.x < LEFT - 80 || st.x > RIGHT + 80) this.wouStones.splice(i, 1);
      }
    }

    stoneExplosion(owner, target) {
      if (!owner || !target || target.hp <= 0 || target.tuskHidden) return;
      const dmg = 120;
      target.hp = Math.max(0, target.hp - dmg);
      target.gainSpecialOnHit();
      target.hitFlash = 0.3;
      target.hitstun = Math.max(target.hitstun, 1.1 * TOORU_STUN_SCALE);
      target.blockstun = 0;
      target.state = 'hitstun';
      target.attack = null;
      target.specialAction = null;
      target.standAlpha = null;
      target.vx = (target.x >= owner.x ? 1 : -1) * 420;
      target.vy = -360;
      target.onGround = false;
      owner.damageDealt += dmg;
      this.spawnRing(target.x, target.y - 120, '#ff4055', 210);
      this.spawnRing(target.x, target.y - 120, '#ffe9a3', 140);
      this.spawnSpark(target.x, target.y - 130, '#fff3c4', 70);
      this.spawnDust(target.x, target.y, 24, '#c9a86a');
      this.spawnText(target.x, target.y - 270, '五连 · 灾厄爆发', '#ff9aa6', 30, 1.0);
      this.shake = Math.max(this.shake, 24);
      this.flash = Math.max(this.flash, 0.35);
      Audio.hitHeavy();
      Audio.tooruLine('counter');
      if (target.hp <= 0) this.beginKO(owner);
    }

    spawnWouBug(owner, sp) {
      this.wouBugs.push({
        owner, ownerIndex: owner.index,
        x: owner.x + owner.facing * 58, y: GROUND,
        dir: owner.facing, speed: sp.speed || 210,
        life: sp.duration || 6, damage: sp.damage || 70,
        color: sp.color || '#c9a86a', t: 0, seed: Math.random() * 10
      });
    }

    updateWouBugs(dt) {
      for (let i = this.wouBugs.length - 1; i >= 0; i--) {
        const bug = this.wouBugs[i];
        bug.t += dt;
        bug.life -= dt;
        const target = bug.owner.index === 0 ? this.p2 : this.p1;
        // Bugs also commit to their spawn direction; no mid-flight turning.
        bug.x += bug.dir * bug.speed * dt;
        if (target.hp > 0 && target.onGround && target.y > GROUND - 50 &&
            Math.abs(target.x - bug.x) < 34) {
          this.resolveHit(bug.owner, target, {
            damage: bug.damage, hitstun: 0.8, blockstun: 0.22,
            knockback: 260, lift: -150, heavy: true, unblockable: true, sfx: 'hitHeavy'
          }, { source: 'second' });
          this.spawnRing(target.x, target.y - 90, bug.color, 135);
          this.spawnDust(target.x, target.y - 20, 16, bug.color);
          this.spawnText(target.x, target.y - 230, 'Da-Da-Da-Da!', bug.color, 20, 0.9);
          this.wouBugs.splice(i, 1);
          continue;
        }
        if (bug.life <= 0 || bug.x < LEFT - 80 || bug.x > RIGHT + 80) this.wouBugs.splice(i, 1);
      }
    }

    /* ---------------------------------------------------------
       Josuke / Soft & Wet bubbles
       Bubbles are slow, readable projectiles. A clean hit steals one random
       attribute; Go Beyond bubbles are unblockable and ignore calamity.
       --------------------------------------------------------- */
    spawnJosukeBubble(owner, sp, opts) {
      opts = opts || {};
      const dir = owner.facing;
      const speed = sp.speed || 330;
      const big = !!opts.big;
      this.josukeBubbles.push({
        owner, ownerIndex: owner.index,
        x: owner.x + dir * 54, y: owner.y - (big ? 158 : 148),
        vx: dir * speed, vy: 0,
        damage: big ? (sp.damage || 74) : (sp.damage || 16),
        life: big ? 0.95 : Math.max(0.8, (sp.range || 560) / speed),
        t: 0, r: big ? 25 : 15,
        goBeyond: !!opts.goBeyond || !!owner.goBeyond,
        steal: opts.steal !== false,
        color: sp.color || '#8fe8ff',
        seed: Math.random() * 10
      });
    }

    updateJosukeBubbles(dt) {
      for (let i = this.josukeBubbles.length - 1; i >= 0; i--) {
        const b = this.josukeBubbles[i];
        b.t += dt;
        b.life -= dt;
        b.x += b.vx * dt;
        const target = b.owner.index === 0 ? this.p2 : this.p1;
        if (target.hp > 0) {
          // Float toward the opponent's chest, but never fast enough to feel
          // like a homing missile. The bubble is meant to be seen and dodged.
          const desiredY = target.y - 132;
          b.vy += clamp((desiredY - b.y) * 5, -200, 200) * dt;
        }
        b.vy *= Math.pow(0.2, dt);
        b.y += b.vy * dt + Math.sin(b.t * 6 + b.seed) * 9 * dt;

        if (b.life <= 0 || b.x < LEFT - 90 || b.x > RIGHT + 90) {
          this.josukeBubbles.splice(i, 1);
          continue;
        }
        const box = { x1: b.x - b.r, x2: b.x + b.r, y1: b.y - b.r, y2: b.y + b.r };
        if (target.hp <= 0 || !rectsOverlap(box, target.getHurtbox())) continue;
        const guarding = target.guarding;
        const hit = this.resolveHit(b.owner, target, {
          damage: b.damage,
          hitstun: b.goBeyond ? 0.7 : 0.3,
          blockstun: b.goBeyond ? 0 : 0.14,
          knockback: b.goBeyond ? 300 : 90,
          lift: b.goBeyond ? -150 : 0,
          heavy: b.goBeyond,
          unblockable: b.goBeyond,
          guardBreak: b.goBeyond ? 1.0 : 0,
          sfx: b.goBeyond ? 'hitHeavy' : 'hitLight'
        }, { source: 'second' });
        if (hit && b.steal && (!guarding || b.goBeyond)) {
          this.applyBubbleSteal(b.owner, target, b.goBeyond);
        }
        this.spawnRing(b.x, b.y, b.color, b.goBeyond ? 120 : 70);
        this.spawnSpark(b.x, b.y, b.color, b.goBeyond ? 42 : 20);
        this.josukeBubbles.splice(i, 1);
      }
    }

    applyBubbleSteal(owner, target, goBeyond) {
      if (!owner || !target || target.hp <= 0 || target.tuskHidden) return;
      const roll = this.rand();
      let kind = 'sp';
      if (roll < 0.26) kind = 'power';
      else if (roll < 0.52) kind = 'speed';
      else if (roll < 0.78) kind = 'defense';
      const labels = { power: '力量', speed: '速度', defense: '防御', sp: 'SP' };
      const allActive = owner.attrBuff === 'all' && owner.attrBuffTimer > 0 &&
        target.attrDebuff === 'all' && target.attrDebuffTimer > 0;
      if (kind === 'sp') {
        owner.meter = Math.min(100, owner.meter + 20);
        owner.gainSpecialFromEnergy(20);
        target.meter = Math.max(0, target.meter - 20);
      } else if (!allActive) {
        const duration = goBeyond ? 10 : 8;
        owner.attrBuff = kind;
        owner.attrBuffTimer = duration;
        target.attrDebuff = kind;
        target.attrDebuffTimer = duration;
      }
      this.spawnText(target.x, target.y - 236,
        allActive && kind !== 'sp' ? '已夺取全属性' : '夺走：' + labels[kind] + '!',
        '#8fe8ff', allActive && kind !== 'sp' ? 20 : 24, 0.95);
      this.spawnText(target.x, target.y - 270, goBeyond ? 'GO BEYOND' : 'SOFT & WET', '#eaf8ff', 15, 0.85);
      this.spawnRing(target.x, target.y - 140, '#8fe8ff', 110);
      this.spawnDust(target.x, target.y - 30, 10, '#8fe8ff');
      Audio.josukeLine('steal');
    }

    applyGoBeyondSteal(owner, target) {
      if (!owner || !target || target.hp <= 0 || target.tuskHidden) return;
      // The ultimate is not a single random theft: it takes every stealable
      // stat at once for six seconds, plus a chunk of SP.
      owner.attrBuff = 'all';
      owner.attrBuffTimer = 6;
      target.attrDebuff = 'all';
      target.attrDebuffTimer = 6;
      owner.meter = Math.min(100, owner.meter + 20);
      owner.gainSpecialFromEnergy(20);
      target.meter = Math.max(0, target.meter - 20);
      // Wonder of U's stone/bug tools are part of the theft.
      if (target.charId === 'tooru') {
        target.abilityLock = Math.max(target.abilityLock, 6);
      }
      this.spawnText(target.x, target.y - 292, '全属性夺取 6s', '#eaf8ff', 22, 1.1);
      if (target.charId === 'tooru') {
        this.spawnText(target.x, target.y - 324, '石头 / 枯木虫 封印', '#ff9aa6', 16, 1.0);
      }
      this.spawnRing(target.x, target.y - 140, '#eaf8ff', 150);
      Audio.josukeLine('steal');
    }

    onJosukeEvolve(f) {
      if (!f) return;
      const portrait = $(f.index === 0 ? 'p1-portrait' : 'p2-portrait');
      if (portrait) Art.drawBust(portrait, f.charId, f.variant, false, true);
      const standEl = $(f.index === 0 ? 'p1-stand' : 'p2-stand');
      if (standEl) standEl.textContent = 'SOFT & WET: GO BEYOND';
      this.spawnText(f.x, f.y - 300, '夺走灾厄的泡泡', '#eaf8ff', 20, 1.0);
    }

    spawnCalamityFX(x, kind) {
      this.calamityFX.push({
        x: clamp(x, LEFT + 40, RIGHT - 40), kind: kind || 'car',
        t: 0, life: 1.05, rot: (Math.random() - 0.5) * 0.7
      });
    }

    updateCalamityFX(dt) {
      for (let i = this.calamityFX.length - 1; i >= 0; i--) {
        const fx = this.calamityFX[i];
        fx.t += dt;
        if (fx.t >= fx.life) this.calamityFX.splice(i, 1);
      }
    }

    wouCounter(defender, attacker, kind, fromDomain) {
      if (!attacker || attacker.hp <= 0 || attacker.tuskHidden) return false;
      defender.calamityGuard = 0;
      // The domain's random falling objects are chip pressure, not a full
      // free combo starter: less damage and no hitstun.
      const dmg = fromDomain ? 40 : 88;
      attacker.hp = Math.max(0, attacker.hp - dmg);
      defender.damageDealt += dmg;
      attacker.gainSpecialOnHit();
      attacker.hitFlash = 0.22;
      if (fromDomain) {
        this.spawnText(attacker.x, attacker.y - 265, '灾厄', '#ff9aa6', 22, 1.0);
      } else {
        const oldX = defender.x;
        this.spawnAfterimage(defender, { life: 0.24, alpha: 0.28 });
        defender.x = clamp(attacker.x - attacker.facing * 100, LEFT, RIGHT);
        defender.y = GROUND;
        defender.vx = defender.vy = 0;
        defender.onGround = true;
        defender.facing = attacker.x >= defender.x ? 1 : -1;
        this.spawnRing(oldX, GROUND - 90, '#ff4055', 78);
        this.spawnRing(defender.x, GROUND - 90, '#ff4055', 78);
        attacker.hitstun = Math.max(attacker.hitstun, 1.15 * TOORU_STUN_SCALE);
        attacker.blockstun = 0;
        attacker.state = 'hitstun';
        attacker.attack = null;
        attacker.attackTime = 0;
        attacker.specialAction = null;
        attacker.standAlpha = null;
        attacker.vx = (attacker.x >= defender.x ? 1 : -1) * 430;
        attacker.vy = -330;
        attacker.onGround = false;
        this.spawnText(attacker.x, attacker.y - 265, '你是打算要【追查】我吗。', '#ff9aa6', 22, 1.0);
      }
      this.spawnCalamityFX(attacker.x, kind || (Math.random() < 0.5 ? 'car' : 'plate'));
      this.spawnRing(attacker.x, attacker.y - 120, '#ff4055', 160);
      this.shake = Math.max(this.shake, 18);
      this.flash = Math.max(this.flash, 0.22);
      Audio.tooruLine('counter');
      if (!fromDomain) defender.calamityGuard = 0;
      if (attacker.hp <= 0) this.beginKO(defender);
      return true;
    }

    beginWouRain(owner, sp) {
      if (this.wouRain || !owner) return false;
      const target = owner.index === 0 ? this.p2 : this.p1;
      if (target.tuskHidden) return false;
      const rainDuration = (sp.duration || 3) * TOORU_STUN_SCALE;
      owner.specialAction = null;
      owner.state = 'special';
      owner.vx = 0;
      owner.invuln = Math.max(owner.invuln, rainDuration + 0.8);
      target.frozen = true;
      target.state = 'frozen';
      target.attack = null;
      target.specialAction = null;
      target.vx = 0;
      this.wouRain = {
        owner, target, time: 0, duration: rainDuration,
        dps: sp.dps || 20, color: sp.color || '#ff4055', tick: 0
      };
      this.spawnRing(owner.x, owner.y - 120, '#ff4055', 220);
      this.spawnText(owner.x, owner.y - 290, '你刚才的行为算是【追击】了哦。', '#ff9aa6', 20, 1.2);
      Audio.tooruLine('rain');
      return true;
    }

    updateWouRain(dt) {
      const r = this.wouRain;
      if (!r) return;
      r.time += dt;
      r.tick += dt;
      const owner = r.owner;
      const target = r.target;
      owner.state = 'special';
      owner.vx = 0;
      owner.invuln = Math.max(owner.invuln, 0.2);
      target.frozen = true;
      target.state = 'frozen';
      const dmg = r.dps * dt;
      target.hp = Math.max(0, target.hp - dmg);
      owner.damageDealt += dmg;
      target.hitFlash = Math.max(target.hitFlash, 0.06);
      if (r.tick >= 0.28) {
        r.tick = 0;
        this.spawnSpark(target.x + (Math.random() - 0.5) * 70, target.y - 80 - Math.random() * 100, '#b8e5ff', 7);
        this.spawnRing(target.x, target.y - 100, '#b8e5ff', 40);
      }
      if (target.hp <= 0) {
        target.frozen = false;
        this.wouRain = null;
        this.beginKO(owner);
        return;
      }
      if (r.time >= r.duration) {
        target.frozen = false;
        target.state = 'hitstun';
        target.hitstun = Math.max(target.hitstun, 0.5 * TOORU_STUN_SCALE);
        owner.state = 'idle';
        owner.specialAction = null;
        this.wouRain = null;
        this.spawnText(owner.x, owner.y - 230, '灾厄的洪流', '#ff9aa6', 20, 0.8);
      }
    }

    checkGerPrompt() {
      for (const f of this.fighters) {
        if (f.charId !== 'giorno' || f.requiem || f.gerPromptShown || f.hp <= 0) continue;
        if (f.hp < f.maxHp * 0.25) {
          f.gerPromptShown = true;
          this.spawnRing(f.x, f.y - 100, '#ffe06a', 150);
          this.spawnText(f.x, f.y - 260, '镇魂曲 · 觉醒', '#ffe06a', 26, 1.1);
          toast('乔鲁诺体力低于 25% · SP 满时按 U 前冲抓取；命中才觉醒', 2.2);
        }
      }
    }

    trySuper(f) {
      if (this.phase !== 'fight' || this.super) return false;
      if (f.charId === 'tooru') {
        if (f.meter < 50) return false;
        return f.startWouDomain(this);
      }
      if (f.charId === 'josuke' && !f.goBeyond) {
        if (f.meter < 100 || (f.specialMeter || 0) < 50) {
          toast('需要 150 能量：100 SP + 50 特殊能量');
          return false;
        }
        if (f.hitstun > 0 || f.blockstun > 0 || f.specialAction || !f.onGround) return false;
        f.meter = 0;
        f.specialMeter = 0;
        return f.enterGoBeyond(this);
      }
      if (f.meter < 100) return false;
      if (f.hitstun > 0 || f.blockstun > 0 || f.specialAction || !f.onGround) return false;
      if (f.charId === 'giorno' && f.hp < f.maxHp * 0.25) {
        return f.startGerGrab(this);
      }
      return this.beginSuper(f, f.data.super, 100);
    }

    beginSuper(f, data, cost) {
      if (this.fighters[1 - f.index].tuskHidden) return false;
      if (this.phase !== 'fight' || this.super || f.meter < cost) return false;
      if (f.hitstun > 0 || f.blockstun > 0 || f.specialAction || !f.onGround) return false;
      f.meter = Math.max(0, f.meter - cost);
      f.supersUsed += 1;
      f.attack = null;
      f.vx = 0;
      f.vy = 0;
      f.state = 'super';
      f.superTime = 0;
      f.standAlpha = 1;
      const opp = f.index === 0 ? this.p2 : this.p1;
      // Cinematic staging leaves ACT4 outside stopped time.
      const tuskTimeFree = data.type === 'timestop' && opp.charId === 'johnny' && opp.tuskAct === 4;
      if (!tuskTimeFree) {
        f.x = 512;
        f.y = GROUND;
        f.facing = 1;
        opp.x = 768;
        opp.y = GROUND;
        opp.facing = -1;
        opp.frozen = false;
        opp.vx = 0;
        opp.vy = 0;
        opp.onGround = true;
        opp.attack = null;
        opp.specialAction = null;
        opp.state = 'frozen';
        opp.frozen = true;
      }
      const hits = data.hits;
      const interval = (data.duration - 1.15) / Math.max(1, hits);
      const hitTimes = [];
      for (let i = 0; i < hits; i++) hitTimes.push(0.62 + i * interval);
      if (data.type === 'roadroller') {
        const start = 1.15;
        const span = Math.max(0.3, data.duration - start - 0.5);
        for (let i = 0; i < hits; i++) hitTimes[i] = start + (i / Math.max(1, hits - 1)) * span;
      }
      this.super = {
        owner: f, opp, type: data.type, data, time: 0,
        duration: data.duration, hits, hitTimes, nextHit: 0,
        color: data.color, hitCount: 0, ended: false, seed: Math.random() * 100
      };
      this.flash = 0.85;
      this.shake = 13;
      this.hitstop = 0;
      this.projectiles = [];
      this.josukeBubbles = [];
      this.spawnRing(f.x, f.y - 110, data.color, 160);
      this.spawnRing(f.x, f.y - 110, f.data.accent, 100);
      this.spawnText(f.x, f.y - 260, data.name, '#fff2cc', 25, 1.2);
      showSuperBanner({ super: data });
      Audio.super();
      Audio.superShout(f.charId, data.type);
      if (data.type === 'roadroller') Audio.roadRollerStart();
      if (data.type === 'timestop') {
        setTimeout(() => Audio.timeStop(), 170);
      }
      return true;
    }

    startTruth(f, opts) {
      if (this.fighters[1 - f.index].tuskHidden) return false;
      const fromGrab = !!(opts && opts.fromGrab);
      if (this.phase !== 'fight' || this.super || (!fromGrab && f.meter < 100)) return false;
      const opp = f.index === 0 ? this.p2 : this.p1;
      if (!fromGrab) f.meter = 0;
      f.supersUsed += 1;
      f.attack = null;
      f.specialAction = null;
      f.vx = 0;
      f.vy = 0;
      f.y = GROUND;
      f.onGround = true;
      f.state = 'super';
      f.superTime = 0;
      f.standAlpha = 1;
      f.enterRequiem();
      opp.frozen = false;
      opp.vx = 0;
      opp.vy = 0;
      opp.y = GROUND;
      opp.onGround = true;
      opp.attack = null;
      opp.specialAction = null;
      opp.state = 'frozen';
      opp.frozen = true;
      f.x = 500;
      f.facing = 1;
      opp.x = 790;
      opp.facing = -1;
      const data = Object.assign({ type: 'truth', cost: 100 }, f.data.ger);
      this.super = {
        owner: f, opp, type: 'truth', data, time: 0,
        duration: data.duration, hits: 0, hitTimes: [], hitCount: 0,
        color: data.color, seed: Math.random() * 100,
        truthHit: false, phase1: false, phase2: false
      };
      this.koPending = null;
      this.flash = 1;
      this.shake = 24;
      this.hitstop = 0;
      this.projectiles = [];
      this.josukeBubbles = [];
      this.spawnRing(f.x, f.y - 110, '#ffe06a', 220);
      this.spawnRing(f.x, f.y - 110, '#fffbe0', 140);
      this.spawnText(f.x, f.y - 250, 'GOLD EXPERIENCE', '#ffe06a', 20, 1.1);
      this.spawnText(f.x, f.y - 286, 'REQUIEM', '#fffbe0', 38, 1.2);
      showSuperBanner({ super: data });
      Audio.requiem();
      Audio.requiemShout();
      Art.drawBust($(f.index === 0 ? 'p1-portrait' : 'p2-portrait'), f.charId, f.variant, true);
      const standEl = $(f.index === 0 ? 'p1-stand' : 'p2-stand');
      if (standEl) standEl.textContent = 'GOLD EXPERIENCE REQUIEM';
      dom.toast.classList.remove('show');
      dom.controlHint.classList.remove('show');
      hudCache.hint = false;
      return true;
    }

    updateSuper(dt) {
      const s = this.super;
      if (!s) return;
      s.time += dt;
      s.owner.superTime = s.time;
      s.owner.state = 'super';
      if (!this.isTuskTimeFree(s.opp)) {
        s.opp.state = 'frozen';
        s.opp.frozen = true;
      }

      if (s.type === 'gobeyondshot') {
        this.updateGoBeyondShot(dt, s);
        return;
      }

      if (s.type === 'truth') {
        if (!s.phase1 && s.time >= 0.55) {
          s.phase1 = true;
          this.flash = 0.8;
          this.shake = 22;
          this.spawnRing(s.owner.x, s.owner.y - 120, '#ffe06a', 260);
          this.spawnText(s.owner.x, s.owner.y - 300, '镇魂曲', '#fffbe0', 34, 0.9);
        }
        if (!s.phase2 && s.time >= 1.35) {
          s.phase2 = true;
          this.spawnText(s.opp.x, s.opp.y - 250, '归零', '#ffe06a', 38, 0.85);
          this.spawnRing(s.opp.x, s.opp.y - 120, '#ffe06a', 190);
        }
        if (!s.truthHit && s.time >= (s.data.truthTime || 2.35)) {
          s.truthHit = true;
          const truthDamage = s.opp.hp;
          s.opp.hp = 0;
          s.opp.hitFlash = 0.3;
          s.opp.hitstun = 1.2;
          s.owner.combo += 1;
          s.owner.comboTimer = 3;
          s.owner.maxCombo = Math.max(s.owner.maxCombo, s.owner.combo);
          s.owner.damageDealt += Math.max(1, truthDamage);
          this.koPending = s.owner;
          this.flash = 1;
          this.shake = 30;
          this.spawnSpark(s.opp.x, s.opp.y - 120, '#fffbe0', 96);
          this.spawnRing(s.opp.x, s.opp.y - 120, '#fffbe0', 260);
          this.spawnRing(s.opp.x, s.opp.y - 120, '#ffe06a', 180);
          this.spawnDust(s.opp.x, s.opp.y, 22, '#ffe06a');
          Audio.truth();
        }
        if (s.time >= s.duration) this.finishSuper(s);
        return;
      }

      if (s.type === 'roadroller' && !s.rollerHit && s.time >= 1.15) {
        s.rollerHit = true;
        this.flash = 0.9;
        this.shake = 30;
        this.spawnDust(s.opp.x, s.opp.y, 26, '#d9b45c');
        this.spawnRing(s.opp.x, s.opp.y - 12, '#ffe39a', 240);
        this.spawnSpark(s.opp.x, s.opp.y - 80, '#fff0b8', 90);
        Audio.roadRollerImpact();
      }
      if (s.type === 'timestop') {
        // freeze particles visually; the overlay does the heavy lifting
      } else if (s.type === 'emerald') {
        if (Math.random() < 0.55) {
          const side = Math.floor(Math.random() * 4);
          let x, y;
          if (side === 0) { x = -20; y = 150 + Math.random() * 400; }
          else if (side === 1) { x = W + 20; y = 150 + Math.random() * 400; }
          else if (side === 2) { x = 100 + Math.random() * 1080; y = -20; }
          else { x = 100 + Math.random() * 1080; y = H + 20; }
          this.particles.push({
            x, y, vx: (s.opp.x - x) * 1.8, vy: (s.opp.y - 120 - y) * 1.8,
            life: 0.35, max: 0.35, size: 4, color: '#66ffba'
          });
        }
      }

      while (s.hitCount < s.hits && s.time >= s.hitTimes[s.hitCount]) {
        this.applySuperHit(s);
      }

      if (s.time >= s.duration - 0.42 && !s.finalDone) {
        s.finalDone = true;
        this.applySuperFinisher(s);
      }

      if (s.time >= s.duration) {
        this.finishSuper(s);
      }
    }

    updateGoBeyondShot(dt, s) {
      if (!s.fired && s.time >= 0.35) {
        s.fired = true;
        s.bubble = {
          x: s.owner.x + s.owner.facing * 68,
          y: s.owner.y - 145,
          vx: s.owner.facing * 1050,
          r: 38,
          t: 0
        };
        this.spawnText(s.owner.x + s.owner.facing * 74, s.owner.y - 230, 'GO BEYOND', s.color, 30, 0.8);
        this.spawnRing(s.owner.x + s.owner.facing * 64, s.owner.y - 145, s.color, 110);
        Audio.beam();
      }
      if (s.bubble) {
        s.bubble.t += dt;
        s.bubble.x += s.bubble.vx * dt;
        if (!s.pierced && s.bubble.x >= s.opp.x - 20) {
          s.pierced = true;
          s.pierceTime = s.time;
          this.hitstop = Math.max(this.hitstop, 0.12);
          this.flash = Math.max(this.flash, 0.5);
          this.shake = Math.max(this.shake, 14);
          this.spawnRing(s.opp.x, s.opp.y - 140, '#ffffff', 120);
          this.spawnRing(s.opp.x, s.opp.y - 140, s.color, 180);
          this.spawnSpark(s.opp.x, s.opp.y - 145, '#eaf8ff', 60);
          this.spawnText(s.opp.x, s.opp.y - 250, '击穿', '#eaf8ff', 30, 0.9);
          this.applyGoBeyondSteal(s.owner, s.opp);
          Audio.hitHeavy();
        }
        if (s.pierced && !s.exploded && s.time >= s.pierceTime + 0.32) {
          s.exploded = true;
          s.explodeTime = s.time;
          const dmg = s.data.damage || 320;
          s.opp.hp = Math.max(0, s.opp.hp - dmg);
          s.owner.damageDealt += dmg;
          s.owner.combo += 1;
          s.owner.comboTimer = 2;
          s.owner.maxCombo = Math.max(s.owner.maxCombo, s.owner.combo);
          s.opp.hitFlash = 0.3;
          s.opp.hitstun = 1.2;
          s.opp.state = 'hitstun';
          this.flash = 1;
          this.shake = 30;
          this.spawnRing(s.opp.x, s.opp.y - 130, '#ffffff', 260);
          this.spawnRing(s.opp.x, s.opp.y - 130, s.color, 190);
          this.spawnSpark(s.opp.x, s.opp.y - 130, '#eaf8ff', 100);
          this.spawnDust(s.opp.x, s.opp.y - 40, 24, s.color);
          this.spawnText(s.opp.x, s.opp.y - 280, '爆开', '#ffffff', 42, 1.0);
          this.koPending = s.opp.hp <= 0 ? s.owner : null;
          Audio.hitHeavy();
        }
      }
      if (s.time >= s.duration) this.finishSuper(s);
    }

    applySuperHit(s) {
      const dmg = s.data.damage;
      s.hitCount += 1;
      if (this.isTuskTimeFree(s.opp)) return;
      s.opp.hp = Math.max(0, s.opp.hp - dmg);
      s.opp.hitFlash = 0.1;
      s.opp.comboTimer = 2;
      s.owner.damageDealt += dmg;
      s.owner.combo += 1;
      s.owner.comboTimer = 2;
      s.owner.maxCombo = Math.max(s.owner.maxCombo, s.owner.combo);
      s.shake = 9 + Math.random() * 9;
      s.flash = Math.max(this.flash, 0.12);
      const x = s.opp.x + (Math.random() - 0.5) * 90;
      const y = s.opp.y - 90 - Math.random() * 110;
      this.spawnSpark(x, y, s.color, 26 + Math.random() * 20);
      this.spawnRing(x, y, s.color, 55 + Math.random() * 45);
      const chants = s.owner.charId === 'jotaro'
        ? ['ORA!', 'ORA ORA!', 'ORA ORA ORA!']
        : s.owner.charId === 'dio'
          ? ['MUDA!', '無駄!', 'MUDA MUDA!']
          : s.owner.charId === 'giorno'
            ? ['GOLD!', '生命!', 'MUDA!']
            : s.owner.charId === 'josuke'
              ? ['SOFT!', 'WET!', 'GO BEYOND!']
              : ['EMERALD!', 'SPLASH!', '20M!'];
      this.spawnText(x, y - 40, chants[s.hitCount % 3], s.color, 26 + Math.random() * 12, 0.5);
      this.spawnDust(x, y, 3, s.color);
      if (s.owner.charId === 'dio' && s.type === 'timestop') {
        this.spawnProjectileVisualKnife(s, x, y);
      }
    }

    spawnProjectileVisualKnife(s, x, y) {
      const angle = Math.random() * Art.TAU;
      const dist = 260 + Math.random() * 240;
      s.knifeFlash = s.knifeFlash || [];
      s.knifeFlash.push({
        x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist,
        tx: x, ty: y, t: 0, max: 0.24, rot: angle
      });
    }

    applySuperFinisher(s) {
      if (this.isTuskTimeFree(s.opp)) return;
      const dmg = s.data.finalDamage;
      s.opp.hp = Math.max(0, s.opp.hp - dmg);
      s.owner.damageDealt += dmg;
      s.opp.hitFlash = 0.2;
      s.opp.hitstun = 0.7;
      s.opp.frozen = false;
      s.opp.state = 'hitstun';
      s.opp.vx = -s.owner.facing * 340;
      s.opp.vy = -340;
      s.opp.onGround = false;
      s.opp.hitFlash = 0.2;
      this.flash = 0.9;
      this.shake = 28;
      this.hitstop = 0;
      this.spawnText(s.opp.x, s.opp.y - 235, s.data.finisher, '#fff0b8', 30, 1.2);
      this.spawnRing(s.opp.x, s.opp.y - 120, s.color, 210);
      this.spawnSpark(s.opp.x, s.opp.y - 130, '#fffbe0', 78);
      this.spawnDust(s.opp.x, s.opp.y, 16, s.color);
      Audio.hitHeavy();
      this.koPending = s.opp.hp <= 0 ? s.owner : null;
    }

    finishSuper(s) {
      s.owner.state = 'idle';
      s.owner.standAlpha = null;
      s.owner.superTime = 0;
      s.opp.frozen = false;
      if (s.opp.hp > 0) {
        s.opp.state = 'hitstun';
      }
      this.super = null;
      hideSuperBanner();
      if (this.koPending) {
        const winner = this.koPending;
        this.koPending = null;
        this.beginKO(winner, { super: true });
      }
    }

    resetTraining() {
      if (!this.training) return;
      this.phase = 'fight';
      this.phaseTime = 0;
      this.timer = 60;
      this.hitstop = 0;
      this.shake = 0;
      this.flash = 0;
      this.slow = 1;
      this.super = null;
      this.clash = null;
      hideClash();
      this.miniTimeStop = null;
      this.finisher = null;
      this.projectiles = [];
      this.resetTuskWorld();
      this.traps = [];
      this.frogs = [];
      this.wouStones = [];
      this.wouBugs = [];
      this.josukeBubbles = [];
      this.calamityFX = [];
      this.wouRain = null;
      this.sparks = [];
      this.texts = [];
      this.rings = [];
      this.dodgeAirflows = [];
      this.particles = [];
      this.afterimages = [];
      this.superKicks = [];
      this.koPending = null;
      this.koWinner = -1;
      this.wins = [0, 0];
      this.round = 1;
      this.outroTime = 0;
      this.outroWinner = -1;
      this.p1.resetRound(620, 1);
      this.p2.resetRound(980, -1);
      for (const f of this.fighters) {
        // Requiem normally persists between rounds; in training R is a full reset.
        f.requiem = false;
        if (f.charId === 'johnny') { f.tuskAct = 1; f.corpseUnlocked = false; f.resetJohnnyRound(this); }
        f.palette = JG.clonePalette(f.charId, f.variant);
      }
      this.p1.state = 'idle';
      this.p2.state = 'idle';
      this.p1.hp = this.p1.maxHp;
      this.p2.hp = this.p2.maxHp;
      this.p1.meter = 100;
      this.p2.meter = 100;
      this.cameraX = 800;
      hideSuperBanner();
      toast('训练场已重置');
      this.updateTrainingPanel();
    }

    toggleDummyGuard() {
      if (!this.training) return;
      this.dummyGuard = !this.dummyGuard;
      toast(this.dummyGuard ? '假人：防御' : '假人：站立');
      this.updateTrainingPanel();
    }

    updateTrainingPanel() {
      if (typeof dom === 'undefined' || !dom.trainingDummy) return;
      dom.trainingDummy.textContent = '假人：' + (this.dummyGuard ? '防御' : '站立');
    }

    beginKO(winner, opts) {
      if (this.training) {
        winner.hp = winner.maxHp;
        const other = winner.index === 0 ? this.p2 : this.p1;
        other.hp = other.maxHp;
        winner.state = 'idle';
        other.state = 'hitstun';
        return;
      }
      if (this.phase !== 'fight' || this.phase === 'ko') return;
      const superKO = !!(opts && opts.super) || !!this.super;
      this.phase = 'ko';
      this.phaseTime = 0;
      const loser = winner.index === 0 ? this.p2 : this.p1;
      const doubleKO = this.p1.hp <= 0 && this.p2.hp <= 0;
      this.koWinner = doubleKO ? -1 : winner.index;
      this.outroTime = 0;
      this.outroWinner = this.koWinner;
      // The plate/quote cinematic is used for supers and for the KO that wins
      // the match, so every character gets a proper finisher on match point.
      const matchPoint = this.wins[winner.index] >= 1;
      if (!doubleKO && winner.data.finisherQuote && (superKO || matchPoint)) {
        this.finisher = {
          charId: winner.charId,
          name: winner.data.name,
          quote: winner.data.finisherQuote,
          accent: winner.data.accent,
          time: 0,
          duration: superKO ? 3.3 : 2.8
        };
        if (winner.charId === 'tooru') Audio.tooruLine('finisher');
        else if (winner.charId === 'josuke') Audio.josukeLine('finisher');
        else if (winner.charId === 'johnny') Audio.johnnyLine('finisher');
      } else {
        this.finisher = null;
      }
      if (this.finisher && typeof dom !== 'undefined') {
        dom.controlHint.classList.remove('show');
      }
      loser.state = 'ko';
      loser.hitstun = 0;
      loser.vx = winner.facing * 155;
      loser.vy = -260;
      loser.onGround = false;
      loser.koP = 0;
      winner.state = 'idle';
      winner.attack = null;
      winner.specialAction = null;
      this.flash = 0.75;
      this.shake = 20;
      this.hitstop = 0;
      announce(doubleKO ? 'DOUBLE K.O.' : 'K.O.', doubleKO ? '双方同时倒下' : loser.data.name + ' OUT', 1.55);
      Audio.ko();
    }

    updateKO(dt) {
      this.outroTime += dt;
      for (const f of this.fighters) f.outroT = this.outroTime;
      const loser = this.p1.state === 'ko' ? this.p1 : this.p2;
      const winner = loser === this.p1 ? this.p2 : this.p1;
      if (!loser.onGround) {
        loser.vy += GRAVITY * dt;
        loser.y += loser.vy * dt;
        loser.x += loser.vx * dt;
        loser.vx *= Math.pow(0.2, dt);
        if (loser.y >= GROUND) {
          loser.y = GROUND;
          loser.vy = 0;
          loser.onGround = true;
          this.spawnDust(loser.x, loser.y, 14, '#d9c5a7');
          this.shake = 12;
        }
      } else {
        loser.koP = Math.min(1, loser.koP + dt * 3.2);
      }
      loser.x = clamp(loser.x, LEFT, RIGHT);
      if (this.finisher) this.finisher.time += dt;
      if (this.phaseTime > 0.65) winner.state = 'victory';
      this.animFighters(dt);
      this.updateEffects(dt);
      this.updateProjectiles(dt);
      this.updateTraps(dt);
      if (this.phaseTime > (this.finisher ? this.finisher.duration : 1.95)) this.endRound(this.koWinner, 'K.O.');
    }

    finishTimeUp() {
      if (this.phase !== 'fight') return;
      const p1hp = this.p1.hp;
      const p2hp = this.p2.hp;
      this.timeupWinner = p1hp === p2hp ? -1 : p1hp > p2hp ? 0 : 1;
      this.phase = 'timeup';
      this.phaseTime = 0;
      this.outroTime = 0;
      this.outroWinner = this.timeupWinner;
      this.p1.attack = null;
      this.p2.attack = null;
      this.p1.specialAction = null;
      this.p2.specialAction = null;
      if (this.timeupWinner >= 0) this.fighters[this.timeupWinner].state = 'victory';
      announce('TIME UP', this.timeupWinner >= 0 ? this.fighters[this.timeupWinner].data.short + ' 领先' : '双方平手', 1.2);
      Audio.round();
    }

    endRound(winnerIndex, reason) {
      if (this.phase === 'roundEnd' || this.phase === 'matchEnd') return;
      this.phase = 'roundEnd';
      this.phaseTime = 0;
      if (winnerIndex >= 0) {
        this.wins[winnerIndex] += 1;
        const winner = this.fighters[winnerIndex];
        winner.state = 'victory';
        const loser = this.fighters[1 - winnerIndex];
        if (loser.hp > 0) loser.state = 'idle';
        announce('ROUND ' + this.round + ' WON', winner.data.short + ' 拿下本回合', 1.5);
        Audio.victory();
      } else {
        announce('DRAW', '本回合平手', 1.3);
      }
      updatePips(this);
      this.flash = Math.max(this.flash, 0.18);
    }

    endMatch() {
      if (this.phase === 'matchEnd') return;
      this.phase = 'matchEnd';
      this.matchEndTime = 0;
      this.resultShown = false;
      this.matchWinner = this.wins[0] === this.wins[1] ? -1 : this.wins[0] > this.wins[1] ? 0 : 1;
      this.outroWinner = this.matchWinner;
      if (this.matchWinner >= 0) {
        const w = this.fighters[this.matchWinner];
        const l = this.fighters[1 - this.matchWinner];
        w.state = 'victory';
        w.attack = null;
        w.specialAction = null;
        if (l.hp > 0) l.state = 'idle';
        announce('WINNER', w.data.name, 2.2);
      } else {
        this.p1.state = 'idle';
        this.p2.state = 'idle';
        announce('DRAW GAME', '三回合仍未分胜负', 2.2);
      }
      Audio.victory();
      this.flash = 0.3;
      this.super = null;
      hideSuperBanner();
    }

    updateEffects(dt) {
      for (const flow of this.dodgeAirflows) flow.life -= dt;
      this.dodgeAirflows = this.dodgeAirflows.filter(flow => flow.life > 0);
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const p = this.sparks[i];
        p.life -= dt;
        p.rot += dt * 2.5;
        p.size *= Math.pow(0.18, dt);
        if (p.life <= 0) this.sparks.splice(i, 1);
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const p = this.texts[i];
        p.life -= dt;
        p.y += p.vy * dt;
        p.vy *= Math.pow(0.12, dt);
        if (p.life <= 0) this.texts.splice(i, 1);
      }
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const p = this.rings[i];
        p.life -= dt;
        p.r += p.speed * dt;
        if (p.life <= 0) this.rings.splice(i, 1);
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 80 * dt;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
      for (let i = this.afterimages.length - 1; i >= 0; i--) {
        const a = this.afterimages[i];
        a.life -= dt;
        if (a.life <= 0) this.afterimages.splice(i, 1);
      }
      if (this.super && this.super.knifeFlash) {
        for (let i = this.super.knifeFlash.length - 1; i >= 0; i--) {
          const k = this.super.knifeFlash[i];
          k.t += dt;
          if (k.t >= k.max) this.super.knifeFlash.splice(i, 1);
        }
      }
    }

    spawnAfterimage(f, opts) {
      opts = opts || {};
      if (this.afterimages.length > 6) this.afterimages.shift();
      this.afterimages.push({
        charId: f.charId,
        palette: f.palette,
        x: f.x,
        y: f.y,
        groundY: f.groundY,
        facing: f.facing,
        state: f.state,
        vis: Object.assign({}, f.vis),
        squash: f.squash,
        showStand: false,
        life: opts.life || 0.2,
        max: opts.life || 0.2,
        color: opts.color || f.data.accent,
        alpha: opts.alpha == null ? 0.19 : opts.alpha,
        scale: opts.scale || 1
      });
    }

    spawnSpark(x, y, color, size) {
      this.sparks.push({ x, y, color, size, rot: Math.random() * Art.TAU, life: 0.24, max: 0.24 });
    }
    spawnRing(x, y, color, r) {
      this.rings.push({ x, y, r: r * 0.2, target: r, color, life: 0.34, max: 0.34, speed: r * 2.6 });
    }
    spawnText(x, y, text, color, size, life) {
      this.texts.push({ x, y, text, color, size, life, max: life, vy: -55, rot: (Math.random() - 0.5) * 0.16 });
    }
    spawnDust(x, y, count, color) {
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: x + (Math.random() - 0.5) * 32,
          y: y - Math.random() * 15,
          vx: (Math.random() - 0.5) * 170,
          vy: -Math.random() * 130 - 20,
          life: 0.35 + Math.random() * 0.35,
          max: 0.7,
          size: 2 + Math.random() * 4,
          color: color || '#e8d4b8'
        });
      }
    }

    drawPlayerRings(ctx, t) {
      for (const f of this.fighters) {
        if (f.tuskHidden || f.hp <= 0) continue;
        const color = f.index === 0 ? '#409cff' : '#ff4c63';
        const radius = f.charId === 'johnny' && f.mounted ? 118 : 64;
        ctx.save();
        ctx.globalAlpha = 0.85 + Math.sin(t * 3) * 0.1;
        ctx.strokeStyle = color;
        ctx.fillStyle = f.index === 0 ? 'rgba(64,156,255,.12)' : 'rgba(255,76,99,.12)';
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(f.x, GROUND + 2, radius, 15, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha *= 0.6;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(f.x, GROUND + 2, radius + 6, 19, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    render(ctx, t) {
      const shakeX = (Math.random() * 2 - 1) * this.shake;
      const shakeY = (Math.random() * 2 - 1) * this.shake * 0.6;
      ctx.save();
      ctx.translate(W / 2 + shakeX, 400 + shakeY);
      ctx.scale(this.cameraZoom, this.cameraZoom);
      ctx.translate(-this.cameraX, -400);

      Art.drawStage(ctx, this.stageId, t);

      // super cinematic backdrop
      if (this.super) {
        Art.drawSuperBackdrop(ctx, this.super.color, t, this.super.type);
        if (this.super.type === 'requiem' || this.super.type === 'truth') {
          this.drawRequiemVines(ctx, this.super);
        }
      }

      // traps and summons under fighters
      this.drawTuskWorld(ctx, t);
      this.drawTraps(ctx, t);
      this.drawFrogs(ctx, t);
      this.drawWouStones(ctx, t);
      this.drawWouBugs(ctx, t);
      this.drawPlayerRings(ctx, t);

      // Wonder of U uses the wall as its entrance/exit.
      for (const f of this.fighters) {
        if (f.charId === 'tooru' && (f.state === 'intro' || f.state === 'victory')) {
          Art.drawCalamityWall(ctx, f.x - f.facing * 54, GROUND, t, 1);
        }
      }

      for (const f of this.fighters) {
        if (f.treeActive) {
          Art.drawTree(ctx, f.x, GROUND + 2, t, clamp(f.treeTime / 0.35, 0, 1));
        }
      }

      // Requiem aura: persistent golden loop around Giorno (and during the grab)
      for (const f of this.fighters) {
        if ((!f.requiem && !f.gerGrabActive) || f.hp <= 0) continue;
        Art.drawAura(ctx, f.x, f.y - 110, 105, '#ffe06a', t, 0.75);
        Art.drawRing(ctx, f.x, f.y - 4, 40 + Math.sin(t * 2.2) * 3, '#ffe06a', 0.35, 2);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < 4; i++) {
          const a = t * 1.5 + i * Math.PI / 2;
          const rx = f.x + Math.cos(a) * 48;
          const ry = f.y - 175 + Math.sin(a) * 15;
          ctx.save();
          ctx.translate(rx, ry);
          ctx.rotate(a + 1.57);
          ctx.fillStyle = i % 2 ? '#fff5c2' : '#ffe06a';
          Art.starPath(ctx, 0, 0, 5, 1.8, 4);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }

      // Soft & Wet: Go Beyond keeps a halo of white bubbles around Josuke.
      for (const f of this.fighters) {
        if (!f.goBeyond || f.hp <= 0) continue;
        Art.drawAura(ctx, f.x, f.y - 112, 112, '#cfeeff', t, 0.55);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < 5; i++) {
          const a = t * 1.25 + i * 1.256;
          const rr = 52 + Math.sin(t * 2.1 + i) * 12;
          const bx = f.x + Math.cos(a) * rr;
          const by = f.y - 128 + Math.sin(a * 1.3) * 48;
          const br = 4 + (i % 2) * 2;
          const g = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, 0, bx, by, br);
          g.addColorStop(0, 'rgba(255,255,255,.95)');
          g.addColorStop(0.6, 'rgba(190,240,255,.55)');
          g.addColorStop(1, 'rgba(190,240,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // speed ghosts / motion trails
      if (this.afterimages.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const a of this.afterimages) {
          const k = clamp(a.life / a.max, 0, 1);
          Art.drawFighter(ctx, a, t, { scale: a.scale, noShadow: true, alpha: a.alpha * k, posterize: false });
        }
        ctx.restore();
      }

      // fighters sorted so attacker is in front
      const order = this.p1.x <= this.p2.x ? [this.p1, this.p2] : [this.p2, this.p1];
      order.sort((a, b) => {
        const sa = a.state === 'attack' || a.state === 'special' || a.state === 'super' ? 1 : 0;
        const sb = b.state === 'attack' || b.state === 'special' || b.state === 'super' ? 1 : 0;
        return sa - sb;
      });
      for (const f of order) {
        this.drawFighterOutro(ctx, f, t);
        if (f.hitFlash > 0) {
          // Cheap additive impact flash (avoids per-frame canvas filters).
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = clamp(f.hitFlash * 3.6, 0, 0.42);
          ctx.fillStyle = '#fff4d6';
          ctx.beginPath();
          ctx.ellipse(f.x, f.y - 116, 31, 86, 0, 0, Art.TAU);
          ctx.fill();
          ctx.restore();
        }
      }

      for (const f of this.fighters) {
        if (f.treeActive) Art.drawTreePlatform(ctx, f.x, f.y, t);
      }

      this.drawStoneCovers(ctx, t);
      this.drawCalamityFX(ctx, t);

      this.drawJosukeBubbles(ctx, t);
      this.drawProjectiles(ctx, t);
      this.drawSparks(ctx);
      this.drawParticles(ctx);
      this.drawRings(ctx);
      this.drawTexts(ctx);
      for (const flow of this.dodgeAirflows) {
        ctx.save();
        ctx.translate(flow.x, flow.y); ctx.scale(flow.dir, 1);
        ctx.globalAlpha = Math.min(1, flow.life / 0.2);
        ctx.strokeStyle = '#b9f4ff'; ctx.lineWidth = 4;
        const progress = (0.45 - flow.life) / 0.45;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath(); ctx.moveTo(-100 + progress * 70, i * 9);
          ctx.quadraticCurveTo(35 + progress * 60, i * 3, 210 + progress * 160, i * 14);
          ctx.stroke();
        }
        ctx.restore();
      }
      this.drawOutroFx(ctx, t);

      // guard-broken marker
      for (const f of this.fighters) {
        if ((f.guardBroken > 0 || f.guardLock > 0) && f.hp > 0) {
          const a = 0.45 + 0.3 * Math.sin(t * 12);
          ctx.save();
          ctx.globalAlpha = a;
          Art.drawMangaText(ctx, '崩', f.x, f.y - 232, 24, '#ffe06a', -0.08, 1);
          Art.drawRing(ctx, f.x, f.y - 226, 26 + Math.sin(t * 7) * 3, '#ffe06a', 0.45, 1.5);
          if (f.guardLock > 0) {
            ctx.fillStyle = '#ffcf91'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(`防御封锁 ${f.guardLock.toFixed(1)}s`, f.x, f.y - 260);
          }
          ctx.restore();
        }
      }

      // low health menacing
      for (const f of this.fighters) {
        if (f.hp > 0 && f.hp < 260 && this.phase !== 'matchEnd') {
          const base = f.x + (f.index === 0 ? -80 : 60);
          const a = 0.25 + 0.2 * Math.sin(t * 3 + f.index);
          ctx.save();
          ctx.globalAlpha = a;
          Art.drawMangaText(ctx, 'ゴ', base, f.y - 250 + Math.sin(t * 1.7) * 8, 38, f.data.accent, -0.1, 1);
          Art.drawMangaText(ctx, 'ゴ', base + 28, f.y - 205 + Math.cos(t * 2.1) * 8, 23, f.data.accent, 0.08, 1);
          ctx.restore();
        }
      }

      if (this.wouRain) this.drawWouRain(ctx, t);

      // super foreground
      if (this.super) this.drawSuperForeground(ctx, t, this.super);

      ctx.restore();

      // post world overlays
      if (this.super && this.super.type === 'timestop') {
        Art.drawTimeStop(ctx, this.super.time, this.super.color);
      }
      if (this.super && this.super.type === 'emerald') {
        this.drawEmeraldSuper(ctx, this.super, t);
      }
      if (this.super && this.super.type === 'requiem') {
        this.drawRequiemForeground(ctx, this.super, t);
      }
      if (this.super && this.super.type === 'truth') {
        this.drawRequiemForeground(ctx, this.super, t);
        this.drawTruthForeground(ctx, this.super, t);
      }
      if (this.miniTimeStop) {
        Art.drawTimeStop(ctx, this.miniTimeStop.time, this.miniTimeStop.color || '#cfe6ff');
      }

      // KO red vignette
      if (this.phase === 'ko' || this.phase === 'timeup') {
        ctx.save();
        const g = ctx.createRadialGradient(640, 360, 220, 640, 360, 760);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(58,4,16,.42)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      if (this.flash > 0) {
        ctx.save();
        ctx.globalAlpha = this.flash;
        ctx.fillStyle = '#fff8e9';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      if (this.finisher) this.drawFinisher(ctx);
    }

    drawJosukeBubbles(ctx, t) {
      for (const b of this.josukeBubbles) {
        const r = b.r * (1 + Math.sin(b.t * 8 + b.seed) * 0.05);
        ctx.save();
        ctx.translate(b.x, b.y);
        const g = ctx.createRadialGradient(-r * 0.32, -r * 0.35, 1, 0, 0, r);
        g.addColorStop(0, 'rgba(255,255,255,.98)');
        g.addColorStop(0.34, b.goBeyond ? 'rgba(225,250,255,.82)' : 'rgba(143,232,255,.62)');
        g.addColorStop(0.78, 'rgba(80,170,225,.22)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = b.goBeyond ? 'rgba(255,255,255,.95)' : 'rgba(180,245,255,.8)';
        ctx.lineWidth = b.goBeyond ? 2.4 : 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        // Soap-film highlight and a few orbiting micro-bubbles.
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(-r * 0.25, -r * 0.25, r * 0.48, -2.2, -0.4);
        ctx.stroke();
        for (let i = 0; i < (b.goBeyond ? 4 : 2); i++) {
          const a = b.t * 2.2 + b.seed + i * 1.7;
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = '#eaf8ff';
          ctx.beginPath();
          ctx.arc(Math.cos(a) * (r + 8), Math.sin(a) * (r + 7), 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    drawWouStones(ctx, t) {
      for (const st of this.wouStones) {
        const rnd = Art.seeded(st.seed);
        ctx.save();
        ctx.translate(st.x, GROUND);
        if (st.jumping) {
          const ly = st.y - GROUND;
          ctx.save();
          ctx.translate(0, ly);
          ctx.rotate(st.t * 9 + st.seed);
          ctx.fillStyle = '#8a765a';
          ctx.strokeStyle = '#231a12';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-13, 2);
          ctx.lineTo(-9, -11);
          ctx.lineTo(3, -15);
          ctx.lineTo(14, -4);
          ctx.lineTo(10, 8);
          ctx.lineTo(-4, 12);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#c6b18d';
          ctx.beginPath();
          ctx.ellipse(-2, -4, 5, 3, 0.4, 0, Art.TAU);
          ctx.fill();
          ctx.restore();
          ctx.globalAlpha = 0.28;
          ctx.strokeStyle = '#ff4055';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(0, ly, 24, 28, 0, 0, Art.TAU);
          ctx.stroke();
          ctx.globalAlpha = 0.9;
        }
        // Only the disturbed earth is visible while it is still underground.
        ctx.strokeStyle = 'rgba(38, 27, 18, .58)';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-st.dir * 70, -2);
        ctx.quadraticCurveTo(-st.dir * 35, -8, 0, -2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(76, 56, 36, .75)';
        ctx.beginPath();
        ctx.ellipse(0, -2, 22 + Math.sin(t * 18 + st.seed) * 3, 5, 0, 0, Art.TAU);
        ctx.fill();
        // clods thrown up and behind the moving stone
        for (let i = 0; i < 8; i++) {
          const p = (st.t * 2.7 + i * 0.173) % 1;
          const px = -st.dir * (8 + p * 62) + (rnd() - 0.5) * 12;
          const py = -p * (28 + (i % 3) * 9);
          const r = 3 + (i % 4) * 1.7;
          ctx.fillStyle = i % 2 ? '#6f573a' : '#4b3927';
          ctx.strokeStyle = '#211810';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(px, py, r, r * 0.7, p * 4, 0, Art.TAU);
          ctx.fill();
          ctx.stroke();
        }
        // dust puffs
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#8a7054';
        for (let i = 0; i < 4; i++) {
          const p = (st.t * 1.8 + i * 0.25) % 1;
          ctx.beginPath();
          ctx.ellipse(-st.dir * (18 + p * 32), -8 - p * 16, 5 + p * 7, 3 + p * 4, 0, 0, Art.TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    drawWouBugs(ctx, t) {
      for (const bug of this.wouBugs) {
        ctx.save();
        ctx.translate(bug.x, GROUND - 7);
        ctx.scale(bug.dir, 1);
        ctx.strokeStyle = '#2a1d12';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          const lx = -12 + i * 8;
          const swing = Math.sin(t * 16 + i + bug.seed);
          ctx.beginPath();
          ctx.moveTo(lx, -2);
          ctx.lineTo(lx - 7 + swing * 3, 8);
          ctx.moveTo(lx, -2);
          ctx.lineTo(lx + 6 - swing * 3, 8);
          ctx.stroke();
        }
        for (let i = 0; i < 4; i++) {
          Art.circle(ctx, -14 + i * 8, -6 - Math.sin(i * 0.8) * 2, 5.5 - i * 0.4, i % 2 ? '#b89a66' : '#8d7048', '#241a10', 2);
        }
        ctx.fillStyle = '#6e5230';
        ctx.beginPath();
        ctx.ellipse(18, -9, 8, 6, 0.2, 0, Art.TAU);
        ctx.fill();
        ctx.strokeStyle = '#241a10';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = '#d8c08a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(21, -14);
        ctx.lineTo(30, -22);
        ctx.moveTo(18, -15);
        ctx.lineTo(24, -25);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawStoneCovers(ctx, t) {
      for (const f of this.fighters) {
        if (f.stoneCover <= 0 || f.hp <= 0) continue;
        const k = clamp(f.stoneCover / 4, 0, 1);
        ctx.save();
        ctx.globalAlpha = 0.45 + k * 0.5;
        const rnd = Art.seeded((f.seed || 1) * 7);
        for (let i = 0; i < 10; i++) {
          const x = f.x + (rnd() - 0.5) * 46;
          const y = f.y - 20 - rnd() * 150;
          const r = 3 + rnd() * 6;
          ctx.fillStyle = i % 2 ? '#7a6852' : '#5b4a38';
          ctx.strokeStyle = '#211810';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * 0.75, rnd() * 3, 0, Art.TAU);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    drawCalamityFX(ctx, t) {
      for (const fx of this.calamityFX) {
        const p = clamp(fx.t / fx.life, 0, 1);
        const y = GROUND - 390 + p * 370;
        ctx.save();
        ctx.translate(fx.x, y);
        ctx.rotate(fx.rot * (0.4 + p));
        ctx.globalAlpha = p > 0.9 ? (1 - p) * 10 : 1;
        ctx.strokeStyle = '#100d12';
        ctx.lineWidth = 4;
        if (fx.kind === 'table') {
          ctx.fillStyle = '#7a5a3b';
          ctx.fillRect(-44, -15, 88, 14);
          ctx.strokeRect(-44, -15, 88, 14);
          ctx.beginPath(); ctx.moveTo(-32, -1); ctx.lineTo(-38, 32); ctx.moveTo(32, -1); ctx.lineTo(38, 32); ctx.stroke();
        } else if (fx.kind === 'chair') {
          ctx.fillStyle = '#755437';
          ctx.fillRect(-27, -32, 54, 12);
          ctx.fillRect(-24, -20, 48, 10);
          ctx.strokeRect(-27, -32, 54, 12);
          ctx.beginPath(); ctx.moveTo(-20, -10); ctx.lineTo(-25, 34); ctx.moveTo(20, -10); ctx.lineTo(25, 34); ctx.stroke();
        } else if (fx.kind === 'plate') {
          ctx.fillStyle = '#868b90';
          ctx.fillRect(-50, -12, 100, 24);
          ctx.strokeRect(-50, -12, 100, 24);
          ctx.strokeStyle = 'rgba(255,255,255,.5)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-38, -4); ctx.lineTo(42, -4); ctx.stroke();
        } else {
          // car
          ctx.fillStyle = '#4a3540';
          ctx.fillRect(-54, -26, 108, 26);
          ctx.fillStyle = '#2a2029';
          ctx.beginPath();
          ctx.moveTo(-30, -26); ctx.lineTo(-18, -46); ctx.lineTo(22, -46); ctx.lineTo(38, -26);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#c7d9e3';
          ctx.fillRect(-14, -42, 28, 12);
          Art.circle(ctx, -32, 2, 9, '#151015', '#000', 2);
          Art.circle(ctx, 32, 2, 9, '#151015', '#000', 2);
        }
        ctx.restore();
      }
    }

    drawWouRain(ctx, t) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = '#b9dcff';
      ctx.lineWidth = 1.4;
      const left = this.cameraX - W / 2 - 80;
      const right = this.cameraX + W / 2 + 80;
      for (let i = 0; i < 90; i++) {
        const x = left + ((i * 137 + t * 130) % (right - left));
        const y = ((i * 83 + t * 900) % (GROUND + 120)) - 40;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 6, y + 26);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawFrogs(ctx, t) {
      for (const fr of this.frogs) {
        const alpha = fr.triggered ? Math.max(0, 1 - fr.fade / 0.36) : 1;
        Art.drawFrog(ctx, fr.x, GROUND, t + fr.hopSeed, {
          dir: fr.dir,
          alpha,
          hop: fr.triggered ? 1 : 0
        });
      }
    }

    drawTraps(ctx, t) {
      for (const tr of this.traps) {
        const grow = clamp(tr.t / 0.34, 0, 1);
        const rnd = Art.seeded(tr.seed);
        ctx.save();
        ctx.translate(tr.x, GROUND);
        ctx.globalAlpha = Math.min(1, (1.1 - tr.t) * 2.2);
        // ground crack
        ctx.strokeStyle = 'rgba(149,255,159,.55)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 7; i++) {
          const a = -0.4 - rnd() * 2.4;
          const len = 30 + rnd() * 45;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * len * grow, Math.sin(a) * len * 0.22 * grow);
          ctx.stroke();
        }
        // vines
        for (let i = 0; i < 6; i++) {
          const bx = -42 + i * 17 + (rnd() - 0.5) * 14;
          const h = (60 + rnd() * 150) * grow;
          const sway = Math.sin(t * 2.5 + i + tr.seed) * 12 * grow;
          ctx.strokeStyle = i % 2 ? '#8cff9d' : '#4bcf78';
          ctx.lineWidth = 3 + rnd() * 5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(bx, 0);
          ctx.bezierCurveTo(bx - 14, -h * 0.35, bx + sway, -h * 0.7, bx + sway * 1.4, -h);
          ctx.stroke();
          // leaves
          for (let j = 1; j <= 3; j++) {
            const yy = -h * (0.3 + j * 0.18);
            const xx = bx + sway * (0.3 + j * 0.18) + (j % 2 ? 7 : -7);
            ctx.fillStyle = j % 2 ? '#b8ff9f' : '#5ce38c';
            ctx.beginPath();
            ctx.ellipse(xx, yy, 7, 3.4, j % 2 ? 0.7 : -0.5, 0, Art.TAU);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    }

    drawProjectiles(ctx, t) {
      for (const p of this.projectiles) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.kind === 'starfinger' || p.kind === 'meteor' || p.kind === 'eyebeam' || p.kind === 'lifeline' || p.kind === 'gerray') {
          const w = p.w, h = p.h;
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(0.35, p.color);
          g.addColorStop(0.9, '#fffbe8');
          g.addColorStop(1, '#ffffff');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(-w / 2, -h * 0.24);
          ctx.lineTo(w / 2, -h / 2);
          ctx.lineTo(w / 2 + 14, 0);
          ctx.lineTo(w / 2, h / 2);
          ctx.lineTo(-w / 2, h * 0.24);
          ctx.closePath();
          ctx.fill();
          // white-hot core
          ctx.fillStyle = 'rgba(255,255,255,.9)';
          ctx.fillRect(-w * 0.36, -h * 0.16, w * 0.82, h * 0.32);
          // eye-beam lightning
          if (p.kind === 'eyebeam') {
            ctx.strokeStyle = 'rgba(255,230,198,.85)';
            ctx.lineWidth = 1.4;
            for (let i = 0; i < 3; i++) {
              ctx.beginPath();
              ctx.moveTo(-w * 0.1, -h * 0.3);
              ctx.lineTo(-w * 0.1 + 16, 0);
              ctx.lineTo(-w * 0.1 + 32, -h * 0.2);
              ctx.stroke();
            }
          } else if (p.kind === 'lifeline') {
            ctx.fillStyle = 'rgba(180,255,180,.9)';
            for (let i = 0; i < 4; i++) {
              const bx = -w * 0.3 + i * 18;
              ctx.beginPath();
              ctx.ellipse(bx, (i % 2 ? -1 : 1) * h * 0.45, 4, 1.6, i % 2 ? 0.6 : -0.6, 0, Art.TAU);
              ctx.fill();
            }
          } else if (p.kind === 'gerray') {
            ctx.strokeStyle = 'rgba(255,224,106,.9)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
              ctx.beginPath();
              ctx.arc(w * 0.36, 0, 8 + i * 6, -1.2, 1.2);
              ctx.stroke();
            }
            ctx.fillStyle = '#fffbe0';
            Art.starPath(ctx, w * 0.47, 0, 11, 4, 5);
            ctx.fill();
          } else if (p.kind === 'meteor') {
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 5; i++) {
              const mx = -w * 0.42 - i * 11;
              ctx.globalAlpha = 0.55 - i * 0.08;
              Art.starPath(ctx, mx, Math.sin(t * 18 + i) * 4, 4.5 - i * 0.4, 1.5, 4);
              ctx.fillStyle = i % 2 ? '#c8fbff' : '#fff4ba';
              ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#fffbe0';
            Art.starPath(ctx, w * 0.46, 0, 18, 6, 5);
            ctx.fill();
            ctx.strokeStyle = 'rgba(159,244,255,.8)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(w * 0.46, 0, 22, -1.1, 1.1);
            ctx.stroke();
          } else {
            ctx.fillStyle = '#ffffff';
            Art.starPath(ctx, w * 0.46, 0, 9, 3.2, 5);
            ctx.fill();
          }
          ctx.restore();
          continue;
        }
        if (p.kind === 'knife') {
          // trail
          ctx.strokeStyle = 'rgba(255,220,140,.28)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-p.vx * 0.045, 0);
          ctx.lineTo(-8, 0);
          ctx.stroke();
          // blade
          ctx.beginPath();
          ctx.moveTo(-4, -4);
          ctx.lineTo(27, -1.5);
          ctx.lineTo(34, 0);
          ctx.lineTo(27, 1.5);
          ctx.lineTo(-4, 4);
          ctx.lineTo(-8, 0);
          ctx.closePath();
          ctx.fillStyle = '#eef0f6';
          ctx.fill();
          ctx.strokeStyle = '#1a1525';
          ctx.lineWidth = 1.6;
          ctx.stroke();
          // handle
          ctx.fillStyle = '#a3233c';
          ctx.fillRect(-21, -3, 14, 6);
          ctx.strokeStyle = '#1a1525';
          ctx.strokeRect(-21, -3, 14, 6);
          ctx.strokeStyle = 'rgba(255,255,255,.65)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, -2);
          ctx.lineTo(23, -0.7);
          ctx.stroke();
        } else {
          // emerald
          ctx.fillStyle = '#6dffc0';
          ctx.beginPath();
          ctx.moveTo(13, 0);
          ctx.lineTo(0, -10);
          ctx.lineTo(-12, 0);
          ctx.lineTo(0, 10);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#eafff4';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.75)';
          ctx.beginPath();
          ctx.moveTo(4, -4);
          ctx.lineTo(0, -7);
          ctx.lineTo(-5, -2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }

    drawSparks(ctx) {
      for (const s of this.sparks) {
        const k = clamp(s.life / s.max, 0, 1);
        Art.drawHitSpark(ctx, s.x, s.y, s.color, s.size * (0.5 + k * 0.8), s.rot, k);
      }
    }

    drawRings(ctx) {
      for (const r of this.rings) {
        const k = clamp(r.life / r.max, 0, 1);
        Art.drawRing(ctx, r.x, r.y, r.r, r.color, k * 0.7, 2 + k * 4);
      }
    }

    drawParticles(ctx) {
      Art.drawDust(ctx, this.particles);
    }

    drawTexts(ctx) {
      for (const tx of this.texts) {
        const k = clamp(tx.life / tx.max, 0, 1);
        const scale = tx.life > tx.max * 0.8 ? 1.25 - (1 - (tx.max - tx.life) / (tx.max * 0.2)) * 0.25 : 1;
        Art.drawMangaText(ctx, tx.text, tx.x, tx.y, tx.size, tx.color, tx.rot, Math.min(1, k * 1.8), undefined, scale);
      }
    }
  }

  Object.assign(G, { Match });
})(window.JG.Game);
