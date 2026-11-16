/* =========================================================
   JOJO 奇妙格斗 · STAND RUSH — Fighter
   ========================================================= */
(function (G) {
  'use strict';
  const {
    Art, Audio, GRAVITY, GROUND, JG, LEFT, RIGHT, WORLD_W,
    approach, clamp, lerp, rectsOverlap, toast
  } = G;

  /* =========================================================
     Fighter
     ========================================================= */
  let fighterSeed = 0;
  function freshAI() {
    return {
      intent: 'approach', intentTime: 0, think: 0.4, superLock: 1.2,
      skillLock: 0, guardHold: 0, threatDelay: 0, threatAnswered: false,
      threatKind: null, seenAttack: null, seenSpecial: null, seenProjectile: null,
      attackPlan: null, attackStep: 0, attackTimer: 0,
      holdHeavy: 0, holdSecond: 0, jumpLock: 0, dodgeLock: 0,
      perfectPress: 0, reactLock: 0
    };
  }
  class Fighter {
    constructor(charId, index, x, facing, variant, cpu) {
      this.charId = charId;
      this.data = JG.CHARACTERS[charId];
      this.index = index;
      this.cpu = !!cpu;
      this.variant = variant || 0;
      this.palette = JG.clonePalette(charId, this.variant);
      this.x = x;
      this.y = GROUND;
      this.vx = 0;
      this.vy = 0;
      this.facing = facing;
      this.maxHp = JG.MAX_HP;
      this.hp = JG.MAX_HP;
      this.meter = 50;
      this.state = 'intro';
      this.animTime = Math.random() * 3;
      this.seed = (fighterSeed += 1.37) + Math.random();
      this.attack = null;
      this.attackTime = 0;
      this.attackHasHit = false;
      this.attackSoundPlayed = false;
      this.chainCount = 0;
      this.bufferedAttack = null;
      this.bufferTime = 0;
      this.specialAction = null;
      this.specialTime = 0;
      this.superTime = 0;
      this.hitstun = 0;
      this.blockstun = 0;
      this.hitFlash = 0;
      this.invuln = 0;
      this.escapeFade = 0;
      this.onGround = true;
      this.groundY = GROUND;
      this.squash = 0;
      this.guarding = false;
      this.guardBroken = 0;
      this.airStandActive = false;
      this.airStandUsed = false;
      this.jumpBuffer = 0;
      this.gaitPhase = 0;
      this.landTimer = 0;
      this.heavyHold = 0;
      this.barrageCd = 0;
      this.burstCd = 0;
      this.secondCd = 0;
      this.specialCd = 0;
      this.secondPending = false;
      this.secondPendingTime = 0;
      this.calamityGuard = 0;
      this.wouDomain = 0;
      this.wouDomainProcCd = 0;
      this.stoneCover = 0;
      this.tooruHeavyPending = false;
      this.tooruHeavyTime = 0;
      this.tooruGrabCycles = 0;
      this.stoneHits = 0;
      this.stoneWindow = 0;
      this.stoneCharges = 3;
      this.stoneCd = 0;
      this.perfectWindow = 0;
      this.perfectCd = 0;
      this.perfectFollowupTimer = 0;
      this.treeActive = false;
      this.treeTime = 0;
      this.frozen = false;
      this.koP = 0;
      this.dashTime = 0;
      this.dashDir = 1;
      this.dashType = 'dash';
      this.dashCooldown = 0;
      this.lastTapDir = 0;
      this.lastTapTime = -10;
      this.combo = 0;
      this.comboTimer = 0;
      this.maxCombo = 0;
      this.damageDealt = 0;
      this.supersUsed = 0;
      this.requiem = false;
      this.goBeyond = false;
      this.specialMeter = 0;
      this.bubbleCharges = 3;
      this.bubbleCd = 0;
      this.abilityLock = 0;
      this.attrBuff = '';
      this.attrBuffTimer = 0;
      this.attrDebuff = '';
      this.attrDebuffTimer = 0;
      this.gerPromptShown = false;
      this.gerGrabActive = false;
      this.standAlpha = null;
      this.standX = -38;
      this.standY = -8;
      this.standTilt = 0;
      this.standScale = 1.03;
      this.vis = Art.neutralPose();
      this.ai = freshAI();
    }

    get frontX() { return this.x + this.facing * 30; }

    resetRound(x, facing) {
      this.x = x;
      this.y = GROUND;
      this.vx = 0;
      this.vy = 0;
      this.facing = facing;
      this.hp = this.maxHp;
      this.meter = 50;
      this.state = 'intro';
      this.attack = null;
      this.attackTime = 0;
      this.attackHasHit = false;
      this.attackSoundPlayed = false;
      this.chainCount = 0;
      this.bufferedAttack = null;
      this.bufferTime = 0;
      this.specialAction = null;
      this.specialTime = 0;
      this.superTime = 0;
      this.hitstun = 0;
      this.blockstun = 0;
      this.hitFlash = 0;
      this.invuln = 0;
      this.escapeFade = 0;
      this.onGround = true;
      this.groundY = GROUND;
      this.squash = 0;
      this.guarding = false;
      this.guardBroken = 0;
      this.airStandActive = false;
      this.airStandUsed = false;
      this.jumpBuffer = 0;
      this.gaitPhase = 0;
      this.landTimer = 0;
      this.heavyHold = 0;
      this.barrageCd = 0;
      this.burstCd = 0;
      this.secondCd = 0;
      this.specialCd = 0;
      this.secondPending = false;
      this.secondPendingTime = 0;
      this.calamityGuard = 0;
      this.wouDomain = 0;
      this.wouDomainProcCd = 0;
      this.stoneCover = 0;
      this.tooruHeavyPending = false;
      this.tooruHeavyTime = 0;
      this.tooruGrabCycles = 0;
      this.stoneHits = 0;
      this.stoneWindow = 0;
      this.stoneCharges = 3;
      this.stoneCd = 0;
      this.perfectWindow = 0;
      this.perfectCd = 0;
      this.perfectFollowupTimer = 0;
      this.treeActive = false;
      this.treeTime = 0;
      this.frozen = false;
      this.koP = 0;
      this.dashTime = 0;
      this.dashDir = 1;
      this.dashType = 'dash';
      this.dashCooldown = 0;
      this.combo = 0;
      this.comboTimer = 0;
      this.standAlpha = null;
      this.standX = -38;
      this.standY = -8;
      this.standTilt = 0;
      this.standScale = 1.03;
      this.vis = Art.neutralPose();
      this.gerGrabActive = false;
      this.gerPromptShown = false;
      // Go Beyond is a match-long evolution. The special meter and bubble
      // magazine reset each round, but the evolved form does not.
      this.specialMeter = 0;
      this.bubbleCharges = 3;
      this.bubbleCd = 0;
      this.abilityLock = 0;
      this.attrBuff = '';
      this.attrBuffTimer = 0;
      this.attrDebuff = '';
      this.attrDebuffTimer = 0;
      this.ai = freshAI();
    }

    setState(s) {
      this.state = s;
    }

    startAttack(kind, match) {
      const def = this.data.attacks[kind];
      if (!def) return;
      if ((kind === 'light' || kind === 'heavy' || kind === 'launcher') && this.charId !== 'tooru') {
        Audio.shortChant(this.charId);
      }
      this.attack = Object.assign({}, def, { box: Object.assign({}, def.box), kind });
      this.attackTime = 0;
      this.attackHasHit = false;
      this.attackSoundPlayed = false;
      this.chainCount += 1;
      this.bufferedAttack = null;
      this.bufferTime = 0;
      this.airStandActive = false;
      this.state = 'attack';
      this.vx *= 0.2;
    }

    startAirStand(match) {
      const def = this.data.airStand;
      if (!def || this.airStandUsed) return;
      if (this.charId !== 'tooru') Audio.shortChant(this.charId);
      this.airStandUsed = true;
      this.airStandActive = true;
      this.standAlpha = 0.8;
      this.attack = Object.assign({}, def, { box: Object.assign({}, def.box), kind: 'airStand' });
      this.attackTime = 0;
      this.attackHasHit = false;
      this.attackSoundPlayed = false;
      this.chainCount = 0;
      this.bufferedAttack = null;
      this.bufferTime = 0;
      this.state = 'attack';
      this.vx *= 0.55;
      match.spawnRing(this.x, this.y - 120, this.data.accent, 125);
      match.spawnRing(this.x, this.y - 120, '#fff2c0', 70);
      match.spawnText(this.x, this.y - 255, def.jp, this.data.accent, 30, 0.75);
      match.spawnText(this.x, this.y - 292, '替身 · 破防', '#ffe8a8', 15, 0.8);
      Audio.standSummon();
    }

    startSpecial(match) {
      const sp = (this.goBeyond && this.data.specialEvolved)
        ? this.data.specialEvolved
        : this.data.special;
      if (!sp) return false;
      if (this.charId === 'tooru' && sp.type === 'wouBug' && this.abilityLock > 0) {
        toast('石头 / 枯木虫能力被夺走：' + this.abilityLock.toFixed(1) + ' 秒');
        return false;
      }
      const bubbleShot = sp.type === 'bubbleShot';
      if (bubbleShot) {
        if (this.bubbleCd > 0 || this.bubbleCharges <= 0) {
          toast('泡沫弹冷却中：' + this.bubbleCd.toFixed(1) + ' 秒');
          return false;
        }
      } else if (this.specialCd > 0) {
        toast('必杀技冷却中：' + this.specialCd.toFixed(1) + ' 秒');
        return;
      }
      if (this.meter < sp.cost) {
        toast('替身槽不足，需要 ' + sp.cost + ' SP');
        return;
      }
      if (this.hitstun > 0 || this.blockstun > 0 || !this.onGround || this.specialAction) return false;
      if (sp.type === 'timestop') {
        if (match.beginSuper(this, sp, sp.cost)) this.specialCd = JG.SKILL_COOLDOWN.special;
        return;
      }
      this.meter = Math.max(0, this.meter - sp.cost);
      if (bubbleShot) {
        this.specialCd = 0;
        this.bubbleCharges -= 1;
        if (this.bubbleCharges <= 0) {
          this.bubbleCd = sp.cooldown || 4;
          match.spawnText(this.x, this.y - 270, '泡沫弹冷却 ' + (sp.cooldown || 4) + 's', '#8fe8ff', 16, 0.8);
          toast('泡沫弹已用完 · ' + (sp.cooldown || 4) + ' 秒冷却');
        } else {
          match.spawnText(this.x, this.y - 270, '泡泡 ' + this.bubbleCharges + '/3', '#8fe8ff', 16, 0.7);
        }
      } else {
        this.specialCd = JG.SKILL_COOLDOWN.special;
      }
      this.attack = null;
      this.specialAction = {
        type: sp.type, move: sp, time: 0, fired: false, hits: 0, nextHit: 0.16, seed: Math.random() * 100
      };
      this.specialTime = 0;
      this.state = 'special';
      this.standAlpha = 0.9;
      this.vx = 0;
      match.spawnRing(this.x, this.y - 100, sp.type === 'trap' ? '#ffe06a' : this.data.accent, 110);
      match.spawnText(this.x, this.y - 245, sp.jp, this.data.accent, 22, 0.9);
      Audio.special();
      if (sp.type === 'rush') Audio.startChant(this.charId, sp.duration || 1, this);
      else if (this.charId === 'kakyoin') Audio.barrageShout('kakyoin');
    }

    startBarrage(match) {
      const b = this.data.barrage;
      if (!b) return;
      if (this.hitstun > 0 || this.blockstun > 0 || !this.onGround || this.specialAction) return;
      this.barrageCd = 0.72;
      this.heavyHold = 0;
      this.attack = null;
      this.specialAction = {
        type: 'barrage', move: b, time: 0, nextHit: 0.07, hits: 0, seed: Math.random() * 100
      };
      this.specialTime = 0;
      this.state = 'special';
      this.standAlpha = 1;
      this.vx = 0;
      match.spawnRing(this.x, this.y - 100, b.color || this.data.accent, 100);
      match.spawnText(this.x, this.y - 238, b.name, b.color || this.data.accent, 20, 0.8);
      match.spawnAfterimage(this, { life: 0.2, alpha: 0.2 });
      Audio.special();
      Audio.startChant(this.charId, b.duration || 1, this);
    }

    canPerfectDodge(opponent) {
      if (this.perfectCd > 0 || !opponent || opponent.hp <= 0) return false;
      if (Math.abs(opponent.x - this.x) > 240 || Math.abs(opponent.y - this.y) > 160) return false;
      if (opponent.attack && opponent.attackTime <= (opponent.attack.startup || 0.12) + 0.02) return true;
      if (opponent.specialAction && opponent.specialAction.type !== 'barrage' &&
          opponent.specialAction.time <= 0.12) return true;
      return false;
    }

    startPerfectDodge(match) {
      this.perfectWindow = 0.9;
      this.perfectCd = 5;
      this.perfectFollowupTimer = 0;
      this.invuln = Math.max(this.invuln, 0.4);
      match.spawnText(this.x, this.y - 250, 'PERFECT!', '#9de8ff', 30, 0.85);
      match.spawnRing(this.x, this.y - 95, '#fff4d0', 150);
      match.spawnRing(this.x, this.y - 95, '#9de8ff', 90);
      match.flash = Math.max(match.flash, 0.2);
      Audio.perfectDodge();
    }

    doPerfectFollowup(opponent, match) {
      if (!opponent || opponent.hp <= 0) return;
      if (Math.abs(opponent.x - this.x) > 340 || Math.abs(opponent.y - this.y) > 150) {
        match.spawnText(this.x, this.y - 235, '追击落空', '#9de8ff', 18, 0.6);
        return;
      }
      match.resolveHit(this, opponent, {
        damage: 54, hitstun: 0.42, blockstun: 0.18,
        knockback: 230, lift: -120, heavy: true, unblockable: true, sfx: 'hitHeavy'
      }, { source: 'second' });
      match.spawnRing(opponent.x, opponent.y - 130, '#ffe17a', 110);
      match.spawnSpark(opponent.x, opponent.y - 140, '#fff3c4', 24);
      match.spawnText(this.x, this.y - 245, '替身追击！', '#ffe17a', 22, 0.72);
      match.shake = Math.max(match.shake, 10);
      Audio.hitHeavy();
    }

    startDodge(match, input) {
      if (!this.onGround || this.attack || this.specialAction || this.hitstun > 0 || this.blockstun > 0) return false;
      if (this.charId === 'tooru') {
        // Normal F is a short backward blink. Only the hitstun escape (handled
        // in Match.burst) appears behind the opponent.
        const oldX = this.x;
        const dir = -this.facing;
        match.spawnAfterimage(this, { life: 0.24, alpha: 0.28 });
        this.x = clamp(this.x + dir * 220, LEFT, RIGHT);
        this.vx = 0;
        this.vy = 0;
        this.onGround = true;
        this.dashTime = 0;
        this.dashType = 'dodge';
        this.dashDir = dir;
        this.invuln = Math.max(this.invuln, 0.3);
        this.state = 'dodge';
        match.spawnRing(oldX, this.y - 90, '#ff4055', 78);
        match.spawnRing(this.x, this.y - 90, '#ff4055', 78);
        match.spawnDust(this.x, this.y, 6, '#ff4055');
        match.spawnAfterimage(this, { life: 0.24, alpha: 0.28 });
        Audio.whiff();
        return true;
      }
      const axis = input.left ? -1 : input.right ? 1 : -this.facing;
      this.dashType = 'dodge';
      this.dashDir = axis;
      this.dashTime = 0.25;
      this.vx = axis * 560;
      this.invuln = Math.max(this.invuln, 0.24);
      this.state = 'dodge';
      match.spawnRing(this.x, this.y - 88, '#9de8ff', 68);
      match.spawnDust(this.x - axis * 16, this.y, 3, 'rgba(215,195,168,.75)');
      match.spawnAfterimage(this, { life: 0.2, alpha: 0.2 });
      Audio.whiff();
      return true;
    }

    enterRequiem() {
      if (this.requiem) return;
      this.requiem = true;
      this.palette = JG.clonePalette(this.charId, this.variant, true);
      this.squash = -0.1;
      this.standAlpha = 1;
    }

    enterGoBeyond(match) {
      if (this.charId !== 'josuke' || this.goBeyond) return false;
      this.goBeyond = true;
      this.palette = Object.assign(
        {},
        JG.clonePalette(this.charId, this.variant),
        this.data.goBeyondPalette || {}
      );
      this.squash = -0.12;
      this.standAlpha = 1;
      this.invuln = Math.max(this.invuln, 1.2);
      this.attack = null;
      this.specialAction = { type: 'goBeyondAwaken', time: 0 };
      this.specialTime = 0;
      this.state = 'special';
      this.vx = 0;
      this.vy = 0;
      match.spawnRing(this.x, this.y - 110, '#eaf8ff', 210);
      match.spawnRing(this.x, this.y - 110, '#7fd8ff', 140);
      match.spawnText(this.x, this.y - 286, 'SOFT & WET', '#eaf8ff', 20, 1.0);
      match.spawnText(this.x, this.y - 320, 'GO BEYOND', '#8fe8ff', 34, 1.2);
      match.shake = Math.max(match.shake, 14);
      match.flash = Math.max(match.flash, 0.28);
      Audio.josukeLine('evolve');
      match.onJosukeEvolve(this);
      return true;
    }

    gainSpecialOnHit() {
      if (this.charId !== 'josuke' || this.goBeyond) return false;
      // Being hit is the Tooru-matchup source; normal SP gains also feed the
      // special meter at half rate (see gainSpecialFromEnergy).
      this.specialMeter = Math.min(50, (this.specialMeter || 0) + 2);
      return true;
    }

    gainSpecialFromEnergy(amount) {
      if (this.charId !== 'josuke' || this.goBeyond || !amount) return false;
      const gain = Math.floor(amount * 0.5);
      if (gain <= 0) return false;
      this.specialMeter = Math.min(50, (this.specialMeter || 0) + gain);
      return true;
    }

    startSecond(match, opts) {
      const free = !!(opts && opts.free);
      const variant = opts && opts.variant;
      let sp;
      if (this.requiem && this.data.secondRequiem) sp = this.data.secondRequiem;
      else if (this.charId === 'giorno' && variant === 'frog' && this.data.secondFrog) sp = this.data.secondFrog;
      else if (this.charId === 'tooru' && variant === 'long' && this.data.secondLong) sp = this.data.secondLong;
      else sp = this.data.second;
      if (!sp) return false;
      if (!free && this.secondCd > 0) {
        toast('追击技冷却中：' + this.secondCd.toFixed(1) + ' 秒');
        return false;
      }
      if (!free && this.meter < sp.cost) {
        toast('替身槽不足，需要 ' + sp.cost + ' SP');
        return false;
      }
      if (this.hitstun > 0 || this.blockstun > 0 || !this.onGround || this.specialAction) return false;
      if (!free) this.meter = Math.max(0, this.meter - sp.cost);
      this.secondCd = JG.SKILL_COOLDOWN.second;
      this.attack = null;
      this.specialAction = {
        type: sp.type, move: sp, time: 0, fired: false, hits: 0, nextHit: 0.16,
        cost: free ? 0 : sp.cost, seed: Math.random() * 100
      };
      this.specialTime = 0;
      this.state = 'special';
      this.standAlpha = 0.95;
      this.vx = 0;
      if (sp.type === 'tree') {
        this.treeActive = true;
        this.treeTime = 0;
        this.y = GROUND - 58;
        this.onGround = true;
      }
      match.spawnRing(this.x, this.y - 110, sp.color || this.data.accent, 130);
      match.spawnText(this.x, this.y - 255, sp.jp, sp.color || this.data.accent, 21, 0.9);
      match.spawnAfterimage(this, { life: 0.2, alpha: 0.2 });
      Audio.secondSkill();
      if (this.charId === 'jotaro') Audio.starFingerShout();
      else if (this.charId === 'kakyoin') Audio.barrageShout('kakyoin');
      else if (this.charId === 'dio' && sp.type === 'timestopstrike') Audio.superShout('dio', 'timestop');
      return true;
    }

    // Called by the meteor-finger projectile on a clean hit. Jotaro instantly
    // closes the gap and adds one Star Platinum punch before the beam recovery.
    startStarFollowup(match, opponent) {
      if (this.charId !== 'jotaro' || !opponent || opponent.hp <= 0) return false;
      if (match.phase !== 'fight' || match.super) return false;
      const sp = this.data.second;
      this.facing = opponent.x >= this.x ? 1 : -1;
      const oldX = this.x;
      this.x = clamp(opponent.x - this.facing * 72, LEFT, RIGHT);
      this.y = GROUND;
      this.onGround = true;
      this.vx = 0;
      this.vy = 0;
      this.attack = null;
      this.attackTime = 0;
      this.specialAction = {
        type: 'starfollow', time: 0, fired: false, hit: false,
        target: opponent,
        move: {
          damage: sp.followupDamage || 52,
          hitstun: sp.followupHitstun || 0.58,
          blockstun: 0.2,
          knockback: sp.followupKnockback || 260,
          lift: -220,
          heavy: true,
          unblockable: true,
          sfx: 'hitHeavy'
        }
      };
      this.specialTime = 0;
      this.state = 'special';
      this.standAlpha = 1;
      match.spawnDust(oldX, GROUND, 10, '#9beeff');
      match.spawnDust(this.x, GROUND, 8, '#fff2bf');
      match.spawnRing(this.x, GROUND - 100, '#9ff4ff', 92);
      match.spawnAfterimage(this, { life: 0.22, alpha: 0.22 });
      match.spawnText(opponent.x, opponent.y - 252, '追击！', '#9ff4ff', 22, 0.6);
      Audio.whiff();
      return true;
    }

    startWouStone(match) {
      if (this.charId !== 'tooru') return false;
      if (this.abilityLock > 0) {
        toast('石头能力被夺走：' + this.abilityLock.toFixed(1) + ' 秒');
        return false;
      }
      if (this.stoneCd > 0 || this.stoneCharges <= 0) return false;
      const sp = this.data.stone;
      if (!sp) return false;
      // Short K is free; the reward comes from landing the stone. Three
      // throws are allowed before the five-second recharge.
      this.stoneCharges -= 1;
      if (this.stoneCharges <= 0) {
        this.stoneCd = 5;
        match.spawnText(this.x, this.y - 252, '石头冷却 5s', '#ff9aa6', 18, 0.9);
        toast('追踪石已用完 · 5 秒冷却');
      } else {
        match.spawnText(this.x, this.y - 252, '石头 ' + this.stoneCharges + '/3', '#e4d0a0', 16, 0.7);
      }
      this.attack = null;
      this.specialAction = { type: 'wouStone', move: sp, time: 0, fired: false };
      this.specialTime = 0;
      this.state = 'special';
      this.standAlpha = 1;
      this.vx = 0;
      match.spawnRing(this.x, this.y - 30, sp.color, 70);
      match.spawnText(this.x, this.y - 230, 'OB-LA-DI-OB-LA-DA', sp.color, 18, 0.7);
      Audio.special();
      Audio.tooruLine('stone');
      return true;
    }

    startShortCane(match) {
      if (this.charId !== 'tooru') return false;
      if (!this.data.attacks.shortCane) return false;
      this.startAttack('shortCane', match);
      return true;
    }

    startWouGrab(match) {
      if (this.charId !== 'tooru') return false;
      if (this.meter < 1) {
        toast('抓取需要至少 1 SP');
        return false;
      }
      this.meter = Math.max(0, this.meter - 1);
      this.attack = null;
      this.specialAction = {
        type: 'wouGrab', time: 0, phase: 'dash', cycles: 0,
        facing: this.facing, startX: this.x, dash: 190, dashTime: 0.18
      };
      this.specialTime = 0;
      this.state = 'special';
      this.standAlpha = 1;
      this.vx = 0;
      // Command-grab priority: brief invulnerability through the lunge so a
      // poke does not stuff the grab before it reaches the opponent.
      this.invuln = Math.max(this.invuln, 0.22);
      match.spawnRing(this.x, this.y - 100, '#ff4055', 120);
      match.spawnText(this.x, this.y - 250, '灾厄 · 抓取', '#ff4055', 22, 0.8);
      Audio.special();
      Audio.tooruLine('grab');
      return true;
    }

    applyWouGrabHit(match, opponent) {
      match.resolveHit(this, opponent, {
        damage: 70, hitstun: 1.2, blockstun: 0.35,
        knockback: 460, lift: -300, heavy: true, unblockable: true,
        guardBreak: 1.2, grab: true,
        sfx: 'hitHeavy'
      }, { source: 'second' });
      match.spawnCalamityFX(opponent.x, 'car');
      match.spawnRing(opponent.x, opponent.y - 150, '#ff4055', 170);
      match.spawnText(opponent.x, opponent.y - 260, '灾厄 · 抓取破防', '#ff6579', 24, 0.9);
      match.shake = Math.max(match.shake, 18);
      match.flash = Math.max(match.flash, 0.25);
      Audio.hitHeavy();
    }

    startWouDomain(match) {
      if (this.charId !== 'tooru') return false;
      if (this.meter < 50) return false;
      if (this.hitstun > 0 || this.blockstun > 0 || !this.onGround || this.specialAction) return false;
      this.meter = Math.max(0, this.meter - 50);
      this.supersUsed += 1;
      this.wouDomain = 20;
      this.wouDomainProcCd = 0;
      this.attack = null;
      this.specialAction = { type: 'wouDomain', time: 0 };
      this.specialTime = 0;
      this.state = 'special';
      this.standAlpha = 1;
      this.vx = 0;
      match.spawnRing(this.x, this.y - 115, '#eef7ff', 190);
      match.spawnRing(this.x, this.y - 115, '#ff4055', 120);
      match.spawnText(this.x, this.y - 280, '灾厄的恶', '#eef7ff', 26, 1.0);
      match.flash = Math.max(match.flash, 0.25);
      Audio.special();
      Audio.tooruLine('domain');
      return true;
    }

    startGerGrab(match) {
      if (this.charId !== 'giorno' || this.hp >= this.maxHp * 0.25) return false;
      if (this.meter < 100) return false;
      if (this.hitstun > 0 || this.blockstun > 0 || !this.onGround || this.specialAction) return false;
      const opp = this.index === 0 ? match.p2 : match.p1;
      this.meter = 0;
      this.facing = opp.x >= this.x ? 1 : -1;
      this.attack = null;
      this.specialAction = {
        type: 'gergrab', move: this.data.ger, time: 0, caught: false,
        startX: this.x, facing: this.facing, seed: Math.random() * 100
      };
      this.specialTime = 0;
      this.state = 'special';
      this.standAlpha = 1;
      this.gerGrabActive = true;
      this.vx = 0;
      match.spawnRing(this.x, this.y - 105, '#ffe06a', 120);
      match.spawnText(this.x, this.y - 250, '镇魂曲 · 抓取', '#ffe06a', 20, 0.8);
      match.spawnAfterimage(this, { life: 0.24, alpha: 0.24 });
      Audio.standSummon();
      return true;
    }

    update(dt, opponent, input, match) {
      this.animTime += dt;
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      this.escapeFade = Math.max(0, this.escapeFade - dt);
      this.guardBroken = Math.max(0, this.guardBroken - dt);
      this.squash = lerp(this.squash, 0, 1 - Math.exp(-14 * dt));
      this.landTimer = Math.max(0, this.landTimer - dt);
      this.barrageCd = Math.max(0, this.barrageCd - dt);
      this.burstCd = Math.max(0, this.burstCd - dt);
      this.secondCd = Math.max(0, this.secondCd - dt);
      this.specialCd = Math.max(0, this.specialCd - dt);
      this.calamityGuard = Math.max(0, this.calamityGuard - dt);
      this.wouDomain = Math.max(0, this.wouDomain - dt);
      this.wouDomainProcCd = Math.max(0, this.wouDomainProcCd - dt);
      this.stoneCover = Math.max(0, this.stoneCover - dt);
      this.stoneWindow = Math.max(0, this.stoneWindow - dt);
      if (this.stoneWindow <= 0) this.stoneHits = 0;
      this.stoneCd = Math.max(0, this.stoneCd - dt);
      if (this.stoneCd <= 0 && this.stoneCharges <= 0) {
        this.stoneCharges = 3;
        match.spawnText(this.x, this.y - 238, '石头就绪', '#e4d0a0', 18, 0.8);
      }
      this.bubbleCd = Math.max(0, this.bubbleCd - dt);
      this.abilityLock = Math.max(0, this.abilityLock - dt);
      if (this.bubbleCd <= 0 && this.bubbleCharges <= 0) {
        this.bubbleCharges = (this.data.special && this.data.special.charges) || 3;
        if (this.charId === 'josuke') {
          match.spawnText(this.x, this.y - 238, '泡泡就绪', '#8fe8ff', 18, 0.8);
        }
      }
      this.attrBuffTimer = Math.max(0, this.attrBuffTimer - dt);
      this.attrDebuffTimer = Math.max(0, this.attrDebuffTimer - dt);
      if (this.attrBuffTimer <= 0) this.attrBuff = '';
      if (this.attrDebuffTimer <= 0) this.attrDebuff = '';
      this.perfectWindow = Math.max(0, this.perfectWindow - dt);
      this.perfectCd = Math.max(0, this.perfectCd - dt);
      if (input.heavy) this.heavyHold += dt;
      else this.heavyHold = 0;
      this.comboTimer = Math.max(0, this.comboTimer - dt);
      if (this.comboTimer <= 0) this.combo = 0;
      this.dashCooldown = Math.max(0, this.dashCooldown - dt);
      this.bufferTime = Math.max(0, this.bufferTime - dt);
      if (this.bufferTime <= 0) this.bufferedAttack = null;
      if (input.pUp) this.jumpBuffer = 0.18;
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

      if (this.state === 'ko') {
        this.koP = Math.min(1, this.koP + dt * 2.8);
        if (!this.onGround) this.applyGravity(dt, match);
        return;
      }
      if (this.frozen) {
        this.state = 'frozen';
        return;
      }
      if (this.state === 'intro' || this.state === 'victory') return;

      const canTurn = !this.attack && !this.specialAction && this.hitstun <= 0 && this.blockstun <= 0 && this.onGround;
      if (canTurn) {
        if (!this.cpu && input.left !== input.right) {
          // Human players face the direction they are holding: A = left, D = right.
          this.facing = input.left ? -1 : 1;
        } else {
          this.facing = opponent.x >= this.x ? 1 : -1;
        }
      }

      if (this.hitstun > 0 && input.pDodge) {
        if (match.super) {
          // Cannot burst out during a super cinematic.
        } else if (this.burstCd > 0) {
          toast('脱离冷却中：' + Math.ceil(this.burstCd) + ' 秒');
        } else if (this.meter < 25) {
          toast('脱离需要 25 能量');
        } else {
          match.burst(this);
          return;
        }
      }

      if (this.hitstun > 0) {
        this.hitstun -= dt;
        this.secondPending = false;
        this.tooruHeavyPending = false;
        this.state = 'hitstun';
        this.guarding = false;
        this.vx *= Math.pow(0.05, dt);
        if (!this.onGround) this.applyGravity(dt, match);
        this.moveX(dt);
        return;
      }

      if (this.blockstun > 0) {
        this.blockstun -= dt;
        this.secondPending = false;
        this.tooruHeavyPending = false;
        this.state = 'blockstun';
        this.guarding = true;
        this.vx *= Math.pow(0.02, dt);
        this.moveX(dt);
        return;
      }

      if (this.perfectFollowupTimer > 0) {
        this.perfectFollowupTimer -= dt;
        if (this.perfectFollowupTimer <= 0) this.doPerfectFollowup(opponent, match);
      }

      this.guarding = !!input.down && this.onGround && !this.attack && !this.specialAction && this.guardBroken <= 0;

      if (this.perfectWindow > 0 && input.pLight && !this.attack && !this.specialAction && this.onGround) {
        if (this.startSecond(match, { free: true })) {
          this.perfectWindow = 0;
          this.perfectFollowupTimer = 0.3;
          this.moveX(dt);
          return;
        }
      }

      // Giorno's H is a hold/tap skill: tap sends the frog, hold grows the
      // tree. Other characters keep the instant H press.
      if (this.secondPending) {
        if (this.attack || this.specialAction) {
          this.secondPending = false;
        } else {
          this.secondPendingTime += dt;
          const shortVariant = this.charId === 'tooru' ? 'short' : 'frog';
          const longVariant = this.charId === 'tooru' ? 'long' : 'tree';
          if (!input.second) {
            this.secondPending = false;
            this.startSecond(match, { variant: shortVariant });
          } else if (this.secondPendingTime >= 0.34) {
            this.secondPending = false;
            this.startSecond(match, { variant: longVariant });
          }
        }
      }

      // Tooru's K: the stone fires immediately on press, so a tap feels
      // responsive. Three throws are allowed before a five-second recharge;
      // while recharging, short K becomes the shorter cane poke. Holding past
      // 0.34s always upgrades into the calamity grab.
      if (this.charId === 'tooru') {
        if (this.tooruHeavyPending) {
          if (!input.heavy || this.hitstun > 0 || this.blockstun > 0) {
            this.tooruHeavyPending = false;
          } else if ((this.attack && this.attack.kind !== 'shortCane') ||
                     (this.specialAction && this.specialAction.type !== 'wouStone')) {
            this.tooruHeavyPending = false;
          } else {
            this.tooruHeavyTime += dt;
            if (this.tooruHeavyTime >= 0.34) {
              this.tooruHeavyPending = false;
              if (this.specialAction && this.specialAction.type === 'wouStone') this.specialAction = null;
              this.attack = null;
              this.attackTime = 0;
              this.startWouGrab(match);
              this.vx = 0;
              return;
            }
          }
        }
        if (input.pHeavy && !this.attack && !this.specialAction && !this.guarding && this.onGround) {
          this.tooruHeavyPending = true;
          this.tooruHeavyTime = 0;
          // If the stone is on cooldown, short K becomes the shorter cane
          // poke instead of a dead button. Holding still upgrades to grab.
          if (!this.startWouStone(match)) this.startShortCane(match);
          this.vx = 0;
          return;
        }
      }

      if (input.pDodge && this.onGround && !this.attack && !this.specialAction && this.dashTime <= 0 && this.guardBroken <= 0) {
        const perfect = this.canPerfectDodge(opponent);
        if (this.startDodge(match, input) && perfect) this.startPerfectDodge(match);
        this.moveX(dt);
        return;
      }

      // Hold heavy: after the initial heavy input, the Stand continues with a
      // held barrage instead of leaving the player standing still.
      if (this.charId !== 'tooru' && !this.attack && !this.specialAction && !this.guarding && this.onGround &&
          input.heavy && this.heavyHold > 0.34 && this.barrageCd <= 0) {
        this.startBarrage(match);
        this.moveX(dt);
        return;
      }

      // Space can also jump-cancel the held-K barrage itself.
      if (this.specialAction && this.specialAction.type === 'barrage' &&
          input.pUp && this.onGround && !input.down) {
        Audio.stopChant(this);
        this.specialAction = null;
        this.standAlpha = null;
        this.attack = null;
        this.airStandActive = false;
        this.chainCount = 0;
        this.bufferedAttack = null;
        this.bufferTime = 0;
        this.jumpBuffer = 0;
        this.vy = -this.data.jump;
        this.onGround = false;
        this.airStandUsed = false;
        this.squash = -0.11;
        this.state = 'jump';
        let jumpAxis = 0;
        if (input.left) jumpAxis -= 1;
        if (input.right) jumpAxis += 1;
        if (jumpAxis !== 0) this.vx = jumpAxis * this.data.speed * 0.8;
        else this.vx *= 0.8;
        Audio.jump();
        match.spawnDust(this.x, this.y, 9, '#e8d6ba');
        match.spawnRing(this.x, this.y - 2, 'rgba(236,218,186,.5)', 34);
        this.moveX(dt);
        return;
      }

      if (this.specialAction) {
        this.updateSpecial(dt, opponent, match, input);
        this.moveX(dt);
        if (!this.onGround) this.applyGravity(dt, match);
        return;
      }

      // Jump-cancel a grounded normal attack: pressing Space during J/K cancels
      // the attack and jumps immediately instead of waiting for recovery.
      if (this.attack && input.pUp && this.onGround && !input.down &&
          this.attack.kind !== 'airStand' && this.attack.kind !== 'dive') {
        this.attack = null;
        this.attackTime = 0;
        this.attackHasHit = false;
        this.attackSoundPlayed = false;
        this.chainCount = 0;
        this.bufferedAttack = null;
        this.bufferTime = 0;
        this.airStandActive = false;
        this.standAlpha = null;
        this.jumpBuffer = 0;
        this.vy = -this.data.jump;
        this.onGround = false;
        this.airStandUsed = false;
        this.squash = -0.11;
        this.state = 'jump';
        let jumpAxis = 0;
        if (input.left) jumpAxis -= 1;
        if (input.right) jumpAxis += 1;
        if (jumpAxis !== 0) this.vx = jumpAxis * this.data.speed * 0.8;
        else this.vx *= 0.8;
        Audio.jump();
        match.spawnDust(this.x, this.y, 9, '#e8d6ba');
        match.spawnRing(this.x, this.y - 2, 'rgba(236,218,186,.5)', 34);
        this.moveX(dt);
        return;
      }

      if (this.attack) {
        this.attackTime += dt;
        this.state = 'attack';
        const a = this.attack;
        const activeStart = a.startup;
        const activeEnd = a.startup + a.active;
        if (!this.attackSoundPlayed && this.attackTime >= activeStart) {
          Audio.whiff();
          this.attackSoundPlayed = true;
        }
        if (!this.attackHasHit && this.attackTime >= activeStart && this.attackTime <= activeEnd) {
          const box = this.getAttackBox(a);
          if (rectsOverlap(box, opponent.getHurtbox())) {
            this.attackHasHit = true;
            match.resolveHit(this, opponent, a, { source: 'normal' });
          }
        }
        if (!this.airStandActive && this.attackTime >= activeStart && this.attackTime <= activeEnd && Math.random() < 0.14) {
          match.spawnAfterimage(this, { life: 0.18, alpha: 0.12 });
        }
        // Buffer attack presses so hitstop and fast cancels do not eat the input.
        if (input.pLight || input.pHeavy) {
          this.bufferedAttack = input.pHeavy ? 'heavy' : 'light';
          this.bufferTime = 0.24;
        }
        // Cancel a connected normal into the next normal, up to three links.
        if (this.attackHasHit && this.chainCount < 3 && a.kind !== 'airStand' &&
            this.attackTime > activeStart + a.active * 0.45 &&
            this.bufferedAttack) {
          this.startAttack(this.bufferedAttack, match);
          this.moveX(dt);
          this.updateStateFromMotion();
          return;
        }
        if (this.attackTime >= activeStart + a.active + a.recovery - 0.001) {
          const hadHit = this.attackHasHit;
          const next = this.bufferedAttack;
          this.attack = null;
          this.attackTime = 0;
          this.airStandActive = false;
          this.standAlpha = null;
          if (hadHit && next && this.chainCount < 3 && a.kind !== 'airStand') {
            this.startAttack(next, match);
            this.moveX(dt);
            this.updateStateFromMotion();
            return;
          }
          this.chainCount = 0;
          this.bufferedAttack = null;
        }
        this.vx *= Math.pow(0.03, dt);
        this.moveX(dt);
        if (!this.onGround) {
          if (a.kind === 'dive') this.vy += 1250 * dt;
          this.applyGravity(dt, match);
          if (a.kind === 'dive' && this.onGround) {
            this.attack = null;
            this.attackTime = 0;
            this.chainCount = 0;
            this.vx *= 0.35;
          }
        }
        this.updateStateFromMotion();
        return;
      }

      // Jump has priority over movement and dash inputs. This also makes
      // holding A/D + pressing Space reliable even during a dash recovery frame.
      if (this.jumpBuffer > 0 && this.onGround && !input.down) {
        this.jumpBuffer = 0;
        this.vy = -this.data.jump;
        this.onGround = false;
        this.airStandUsed = false;
        this.squash = -0.11;
        this.state = 'jump';
        let jumpAxis = 0;
        if (input.left) jumpAxis -= 1;
        if (input.right) jumpAxis += 1;
        if (jumpAxis !== 0) this.vx = jumpAxis * this.data.speed * 0.8;
        else this.vx *= 0.8;
        Audio.jump();
        match.spawnDust(this.x, this.y, 9, '#e8d6ba');
        match.spawnRing(this.x, this.y - 2, 'rgba(236,218,186,.5)', 34);
        this.moveX(dt);
        return;
      }

      // Super / Tooru's 50 SP domain
      if (input.pSuper) {
        const superCost = this.charId === 'tooru' ? 50 : 100;
        if (this.meter >= superCost) {
          if (match.trySuper(this)) {
            this.moveX(dt);
            return;
          }
        } else {
          toast('替身槽不足 ' + superCost + ' SP');
        }
      }

      // Special
      const specialCost = (this.goBeyond && this.data.specialEvolved)
        ? this.data.specialEvolved.cost
        : this.data.special.cost;
      if (input.pSpecial && this.meter >= specialCost && this.onGround && !this.guarding) {
        this.startSpecial(match);
        this.moveX(dt);
        return;
      }

      // Character-specific follow-up skill (H). Giorno taps for the frog and
      // holds for the tree; everyone else casts immediately.
      if (input.pSecond && this.data.second && this.onGround && !this.guarding) {
        if (this.secondCd > 0) {
          toast('追击技冷却中：' + this.secondCd.toFixed(1) + ' 秒');
          this.moveX(dt);
          return;
        }
        if ((this.charId === 'giorno' && !this.requiem) || this.charId === 'tooru') {
          if (this.meter >= this.data.second.cost) {
            this.secondPending = true;
            this.secondPendingTime = 0;
          } else {
            toast('追击技需要 ' + this.data.second.cost + ' SP');
          }
          this.moveX(dt);
          return;
        }
        if (this.meter >= this.data.second.cost) {
          this.startSecond(match);
          this.moveX(dt);
          return;
        }
        toast('追击技需要 ' + this.data.second.cost + ' SP');
      }

      // Dash double tap
      if (this.onGround && this.dashCooldown <= 0 && !this.guarding) {
        let tapDir = 0;
        if (input.pLeft) tapDir = -1;
        if (input.pRight) tapDir = 1;
        if (tapDir) {
          if (this.lastTapDir === tapDir && this.animTime - this.lastTapTime < 0.25) {
            if (this.charId === 'tooru') {
              const oldX = this.x;
              match.spawnAfterimage(this, { life: 0.22, alpha: 0.26 });
              this.x = clamp(this.x + tapDir * 240, LEFT, RIGHT);
              this.facing = opponent.x >= this.x ? 1 : -1;
              this.vx = 0;
              this.vy = 0;
              this.dashTime = 0;
              this.dashCooldown = 0.5;
              this.invuln = Math.max(this.invuln, 0.18);
              this.state = 'dodge';
              match.spawnRing(oldX, this.y - 88, '#ff4055', 72);
              match.spawnRing(this.x, this.y - 88, '#ff4055', 72);
              match.spawnDust(this.x, this.y, 5, '#ff4055');
              match.spawnAfterimage(this, { life: 0.22, alpha: 0.26 });
              this.lastTapDir = 0;
              Audio.whiff();
              this.moveX(dt);
              return;
            }
            const forward = tapDir === this.facing;
            this.dashDir = tapDir;
            this.dashType = forward ? 'dash' : 'backdash';
            this.dashTime = forward ? 0.21 : 0.24;
            this.vx = tapDir * (forward ? 690 : 610);
            this.dashCooldown = 0.5;
            this.lastTapDir = 0;
            if (!forward) {
              this.invuln = Math.max(this.invuln, 0.16);
              match.spawnText(this.x, this.y - 225, 'BACKSTEP', '#9de8ff', 19, 0.55);
              match.spawnRing(this.x, this.y - 85, '#9de8ff', 70);
              match.spawnDust(this.x - this.facing * 18, this.y, 4, 'rgba(215,195,168,.8)');
              Audio.whiff();
            } else {
              Audio.whiff();
              match.spawnDust(this.x, this.y, 6, this.data.accent);
            }
          } else {
            this.lastTapDir = tapDir;
            this.lastTapTime = this.animTime;
          }
        }
      }

      if (this.dashTime > 0) {
        if (this.dashType === 'dash' && input.pLight) {
          this.dashTime = 0;
          this.startAttack('dash', match);
          this.vx = this.facing * 360;
          match.spawnAfterimage(this, { life: 0.24, alpha: 0.25 });
          this.moveX(dt);
          return;
        }
        this.dashTime -= dt;
        if (this.dashType === 'dodge') {
          this.state = 'dodge';
          this.vx = this.dashDir * 560 * (0.58 + this.dashTime / 0.25 * 0.42);
          this.invuln = Math.max(this.invuln, Math.min(0.24, this.dashTime + 0.08));
          this.gaitPhase += Math.abs(this.vx) * dt * 0.045;
          this.moveX(dt);
          if (Math.random() < 0.5) match.spawnAfterimage(this, { life: 0.18, alpha: 0.18 });
          return;
        }
        if (this.dashType === 'backdash') {
          this.state = 'backdash';
          this.vx = this.dashDir * 610 * (0.6 + this.dashTime / 0.24 * 0.4);
          this.invuln = Math.max(this.invuln, Math.min(0.16, this.dashTime + 0.06));
          this.gaitPhase += Math.abs(this.vx) * dt * 0.044;
          this.moveX(dt);
          if (Math.random() < 0.4) match.spawnDust(this.x - this.dashDir * 18, this.y, 1, 'rgba(215,195,168,.75)');
          if (Math.random() < 0.55) match.spawnAfterimage(this, { life: 0.2, alpha: 0.18 });
          return;
        }
        this.state = 'dash';
        this.vx = this.dashDir * 690 * (0.55 + this.dashTime / 0.21 * 0.45);
        this.gaitPhase += Math.abs(this.vx) * dt * 0.04;
        this.moveX(dt);
        if (Math.random() < 0.35) match.spawnDust(this.x - this.dashDir * 18, this.y, 1, this.data.accent);
        if (Math.random() < 0.55) match.spawnAfterimage(this, { life: 0.2, alpha: 0.2 });
        return;
      }

      // Down + heavy is a launcher and intentionally overrides guard.
      if (this.onGround && input.down && input.pHeavy && !this.attack) {
        this.startAttack('launcher', match);
        this.moveX(dt);
        return;
      }

      if (this.guarding) {
        this.vx = approach(this.vx, 0, 2400 * dt);
        this.state = 'guard';
        this.moveX(dt);
        this.updateStateFromMotion();
        return;
      }

      // Horizontal movement with acceleration, skid and air momentum.
      let axis = 0;
      if (input.left) axis -= 1;
      if (input.right) axis += 1;
      const prevSign = Math.sign(this.vx);
      if (axis !== 0) {
        const forward = axis === this.facing;
        const speedBuff = (this.attrBuff === 'speed' || this.attrBuff === 'all') &&
          this.attrBuffTimer > 0;
        const speedDebuff = (this.attrDebuff === 'speed' || this.attrDebuff === 'all') &&
          this.attrDebuffTimer > 0;
        const attrSpeed = (speedBuff ? 1.15 : 1) * (speedDebuff ? 0.82 : 1);
        const speed = this.data.speed * attrSpeed * (forward ? 1 : 0.78) * (this.onGround ? 1 : 0.84);
        const turning = prevSign !== 0 && prevSign !== axis;
        const accel = (this.onGround ? (turning ? 4300 : 2850) : 1450);
        this.vx = approach(this.vx, axis * speed, accel * dt);
        if (this.onGround && turning && Math.abs(this.vx) > 110 && Math.random() < 0.45) {
          match.spawnDust(this.x - axis * 16, this.y, 1, 'rgba(215,195,168,.75)');
        }
        if (this.onGround && Math.abs(this.vx) > 210 && Math.random() < 0.035) {
          match.spawnDust(this.x - this.facing * 20, this.y, 1, 'rgba(220,201,176,.6)');
        }
        if (this.onGround && this.vx * this.facing < -90 && Math.random() < 0.03) {
          match.spawnDust(this.x - this.facing * 14, this.y, 1, 'rgba(210,196,180,.55)');
        }
      } else {
        this.vx = approach(this.vx, 0, (this.onGround ? 3000 : 170) * dt);
      }
      if (this.onGround && Math.abs(this.vx) > 20) {
        this.gaitPhase += Math.abs(this.vx) * dt * (this.vx * this.facing < 0 ? 0.044 : 0.038);
      }

      if (input.down && !this.onGround) this.vy += 1300 * dt;

      // Attacks (Tooru's grounded heavy tap is consumed by the stone/grab
      // pending logic; in the air J is the cane and K throws the stone).
      const tooruGroundedHeavy = this.charId === 'tooru' && input.pHeavy && this.onGround;
      if ((input.pLight || input.pHeavy) && !tooruGroundedHeavy) {
        if (!this.onGround && this.charId === 'tooru') {
          if (input.pHeavy) {
            // Air K is also a stone throw, so it consumes the same charge.
            // During the recharge it falls back to the air cane poke.
            if (!this.startWouStone(match)) this.startAttack('airCane', match);
            this.moveX(dt);
            return;
          }
          if (input.pLight && !this.attack) {
            this.startAttack('airCane', match);
            this.moveX(dt);
            return;
          }
        }
        if (!this.onGround && input.pLight && !this.airStandUsed) {
          this.startAirStand(match);
          this.moveX(dt);
          return;
        }
        if (!this.onGround && input.pHeavy) {
          // Jump attacks are performed by the Stand, striking downward.
          this.startAirStand(match);
          this.moveX(dt);
          return;
        }
        const want = input.pHeavy ? 'heavy' : 'light';
        this.startAttack(want, match);
        this.moveX(dt);
        return;
      }

      if (input.pUp) {
        // handled above; kept for clarity
      }

      this.moveX(dt);
      if (!this.onGround) this.applyGravity(dt, match);
      this.updateStateFromMotion();
    }

    barrageTick(match, opponent, b) {
      if (match.checkClash()) return true;
      if (b.style === 'emerald') {
        match.spawnProjectile(this, {
          count: 1, speed: b.speed || 880, spread: b.spread || 0.12,
          projectile: 'emerald', damage: b.damage
        });
        match.spawnText(this.x + this.facing * 80, this.y - 190, 'EMERALD!', b.color, 16, 0.45);
        return false;
      }
      if (Math.abs(opponent.x - this.x) > (b.range || 130) || Math.abs(opponent.y - this.y) > 150) return false;
      match.resolveHit(this, opponent, {
        damage: b.damage, hitstun: 0.17, blockstun: 0.08,
        knockback: 8, lift: 0, meterGain: 2, heavy: false, barrage: true
      }, { source: 'barrage' });
      const word = this.charId === 'dio' ? 'MUDA!' : this.charId === 'jotaro' ? 'ORA!' : 'MUDA!';
      match.spawnText(opponent.x + (Math.random() - 0.5) * 40, opponent.y - 190 - Math.random() * 50, word, b.color, 18, 0.4);
      return false;
    }

    updateSpecial(dt, opponent, match, input) {
      const a = this.specialAction;
      const sp = a.move || this.data.special;
      a.time += dt;
      this.specialTime += dt;
      this.state = 'special';
      this.facing = opponent.x >= this.x ? 1 : -1;

      if (a.type === 'gergrab') {
        const dashTime = sp.grabTime || 0.24;
        const dash = sp.grabDash || 110;
        const range = sp.grabRange || 104;
        this.facing = a.facing || this.facing;
        this.vx = 0;

        // Short forward lunge, then check the grab every frame so the whole
        // dash arc can connect.
        if (a.time < dashTime) {
          const k = clamp(a.time / dashTime, 0, 1);
          const moved = dash * (1 - Math.pow(1 - k, 2));
          this.x = clamp(a.startX + this.facing * moved, LEFT, RIGHT);
          if (Math.random() < 0.5) match.spawnAfterimage(this, { life: 0.18, alpha: 0.2 });
        } else {
          this.x = clamp(a.startX + this.facing * dash, LEFT, RIGHT);
        }

        if (!a.caught && a.time >= 0.05) {
          const dist = Math.abs(opponent.x - this.x);
          if (dist < range && Math.abs(opponent.y - this.y) < 96 && opponent.onGround && opponent.invuln <= 0) {
            a.caught = true;
            this.specialAction = null;
            this.gerGrabActive = false;
            this.standAlpha = null;
            match.startTruth(this, { fromGrab: true });
            return;
          }
        }

        if (a.time >= dashTime) {
          this.gerGrabActive = false;
          this.standAlpha = null;
          this.specialAction = { type: 'gerwhiff', time: 0 };
          this.state = 'special';
          this.meter = 0;
          match.spawnText(this.x, this.y - 220, '觉醒落空', '#ff9b9b', 24, 0.9);
          toast('没有抓到对手 · 觉醒能量清空', 1.8);
          Audio.whiff();
        }
        return;
      }
      if (a.type === 'gerwhiff') {
        this.vx = 0;
        if (a.time >= 0.38) {
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
        return;
      }

      if (a.type === 'starfollow') {
        this.vx = 0;
        this.facing = opponent.x >= this.x ? 1 : -1;
        this.standAlpha = 1;
        if (!a.hit && a.time >= 0.08) {
          a.hit = true;
          const opp = a.target || opponent;
          if (opp && opp.hp > 0 && Math.abs(opp.x - this.x) <= 118 && Math.abs(opp.y - this.y) <= 180) {
            match.resolveHit(this, opp, sp, { source: 'second' });
            match.spawnRing(opp.x, opp.y - 135, '#ffe47a', 170);
            match.spawnSpark(opp.x, opp.y - 140, '#fff3c4', 34);
            match.spawnText(opp.x, opp.y - 238, 'ORA!', '#9ff4ff', 30, 0.6);
            match.shake = Math.max(match.shake, 15);
            match.flash = Math.max(match.flash, 0.24);
            Audio.hitHeavy();
          } else if (opp) {
            match.spawnText(this.x, this.y - 225, '追击落空', '#9ff4ff', 18, 0.55);
          }
        }
        if (a.time >= 0.44) {
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
        return;
      }

      if (a.type === 'wouStone') {
        this.vx = 0;
        if (!a.fired && a.time >= 0.09) {
          a.fired = true;
          match.spawnWouStone(this, sp);
          match.spawnRing(this.x, this.y - 20, sp.color, 60);
          Audio.projectile();
        }
        if (a.time >= 0.3) {
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
        return;
      }

      if (a.type === 'wouGuard') {
        this.vx = 0;
        if (!a.fired) {
          a.fired = true;
          this.calamityGuard = Math.max(this.calamityGuard, sp.duration || 4);
          match.spawnRing(this.x, this.y - 115, '#ff4055', 160);
          match.spawnRing(this.x, this.y - 115, '#fff0f2', 80);
          match.spawnText(this.x, this.y - 270, '你最好不要动我。', '#ff9aa6', 22, 1.1);
          Audio.tooruLine('guard');
        }
        if (a.time >= 0.45) {
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
        return;
      }

      if (a.type === 'wouRain') {
        if (!a.fired) {
          a.fired = true;
          this.invuln = Math.max(this.invuln, 3.6);
          match.spawnRing(this.x, this.y - 115, '#ff4055', 150);
        }
        if (a.time < 0.22) {
          this.vx = -this.facing * 260;
        } else {
          this.vx = 0;
          if (!a.started) {
            a.started = true;
            const inFront = (opponent.x - this.x) * this.facing > 0;
            const dist = Math.abs(opponent.x - this.x);
            if (inFront && dist <= (sp.range || 190) && opponent.hp > 0) {
              this.specialAction = null;
              this.standAlpha = null;
              this.state = 'special';
              match.beginWouRain(this, sp);
              return;
            }
            match.spawnText(this.x, this.y - 225, '追击落空', '#ff9aa6', 18, 0.6);
          }
        }
        if (a.time >= 0.5) {
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
        return;
      }

      if (a.type === 'wouBug') {
        this.vx = 0;
        if (!a.fired && a.time >= 0.18) {
          a.fired = true;
          match.spawnWouBug(this, sp);
          match.spawnRing(this.x + this.facing * 56, this.y - 24, sp.color, 80);
          match.spawnText(this.x + this.facing * 60, this.y - 200, sp.jp, sp.color, 18, 0.7);
          Audio.special();
        }
        if (a.time >= 0.55) {
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
        return;
      }

      if (a.type === 'wouGrab') {
        this.vx = 0;
        this.facing = a.facing || this.facing;
        if (a.phase === 'dash') {
          const dashTime = a.dashTime || 0.18;
          const k = 1 - Math.pow(1 - clamp(a.time / dashTime, 0, 1), 2);
          this.x = clamp(a.startX + a.facing * (a.dash || 190) * k, LEFT, RIGHT);
          if (Math.random() < 0.6) match.spawnAfterimage(this, { life: 0.16, alpha: 0.2 });
          const dist = Math.abs(opponent.x - this.x);
          const touched = opponent.hp > 0 && dist <= 90 &&
            Math.abs(opponent.y - this.y) < 140 && a.time >= 0.02;
          if (touched) {
            this.applyWouGrabHit(match, opponent);
            this.x = clamp(opponent.x - this.facing * 70, LEFT, RIGHT);
            a.cycles += 1;
            a.phase = 'wait';
            a.time = 0;
            match.spawnRing(this.x, this.y - 120, '#ff4055', 130);
            match.spawnText(this.x, this.y - 240, '抓到你了', '#ff6579', 20, 0.7);
          } else if (a.time >= dashTime) {
            match.spawnText(this.x, this.y - 225, '抓取落空 · 瞬移', '#ff9aa6', 18, 0.6);
            match.spawnRing(this.x, this.y - 100, '#ff4055', 90);
            this.specialAction = null;
            this.standAlpha = null;
            this.state = 'idle';
          }
        } else if (a.phase === 'wait') {
          if (a.time >= 0.38) {
            if (input && input.heavy && a.cycles < 6 && this.meter >= 1 && opponent.hp > 0) {
              this.meter -= 1;
              a.facing = opponent.x >= this.x ? 1 : -1;
              this.facing = a.facing;
              this.x = clamp(opponent.x - this.facing * 78, LEFT, RIGHT);
              a.startX = this.x;
              match.spawnAfterimage(this, { life: 0.18, alpha: 0.2 });
              a.phase = 'dash';
              a.time = 0;
            } else {
              this.specialAction = null;
              this.standAlpha = null;
              this.state = 'idle';
            }
          }
        }
        return;
      }

      if (a.type === 'wouDomain') {
        this.vx = 0;
        if (!a.fired) {
          a.fired = true;
          this.wouDomain = Math.max(this.wouDomain, 20);
          this.wouDomainProcCd = 0;
          match.spawnRing(this.x, this.y - 90, '#eef7ff', 220);
          match.spawnText(this.x, this.y - 285, '灾厄的恶', '#eef7ff', 24, 1.0);
        }
        if (a.time >= 0.5) {
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
        return;
      }

      if (a.type === 'goBeyondAwaken') {
        this.vx = 0;
        if (a.time >= 1.0) {
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
        return;
      }

      if (a.type === 'bubbleShot') {
        this.vx = 0;
        if (!a.fired && a.time >= 0.12) {
          a.fired = true;
          // L is the plain projectile: damage only, no attribute theft.
          match.spawnJosukeBubble(this, sp, { steal: false });
          match.spawnRing(this.x + this.facing * 50, this.y - 150, sp.color || '#8fe8ff', 80);
          match.spawnText(this.x + this.facing * 58, this.y - 200, sp.jp, sp.color || '#8fe8ff', 18, 0.7);
          Audio.projectile();
          Audio.josukeLine('bubble');
        }
        if (a.time >= 0.5) {
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
        return;
      }

      if (a.type === 'goBeyondBubble') {
        this.vx = 0;
        if (!a.fired && a.time >= 0.12) {
          a.fired = true;
          match.spawnJosukeBubble(this, sp, { goBeyond: true, big: true });
          match.spawnRing(this.x + this.facing * 52, this.y - 150, sp.color || '#eaf8ff', 96);
          match.spawnText(this.x + this.facing * 60, this.y - 205, sp.jp, sp.color || '#eaf8ff', 20, 0.8);
          Audio.projectile();
          Audio.josukeLine('bubble');
        }
        if (a.time >= 0.55) {
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
        return;
      }

      if (a.type === 'bubbleSteal') {
        this.vx = 0;
        if (!a.fired && a.time >= 0.16) {
          a.fired = true;
          match.spawnJosukeBubble(this, sp, { goBeyond: this.goBeyond });
          match.spawnRing(this.x + this.facing * 48, this.y - 150, sp.color || '#8fe8ff', 74);
          match.spawnText(this.x + this.facing * 56, this.y - 198, sp.jp, sp.color || '#8fe8ff', 18, 0.7);
          Audio.projectile();
          Audio.josukeLine('bubble');
        }
        if (a.time >= 0.52) {
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
        return;
      }

      if (a.type === 'timestopstrike') {
        const opp = opponent;
        this.vx = 0;
        this.vy = 0;
        if (!a.started) {
          a.started = true;
          this.invuln = Math.max(this.invuln, 0.5);
          opp.frozen = true;
          opp.state = 'frozen';
          opp.vx = 0;
          opp.vy = 0;
          this.standAlpha = 1;
          match.miniTimeStop = { time: 0, duration: Math.max(0.55, sp.duration), color: '#cfe6ff' };
          match.flash = Math.max(match.flash, 0.25);
          match.spawnText(this.x, this.y - 270, '時よ止まれ', '#cfe6ff', 24, 0.75);
          match.spawnRing(this.x, this.y - 105, '#cfe6ff', 120);
          Audio.timeStop();
        }
        if (a.time >= 0.16 && !a.moved) {
          a.moved = true;
          const oldX = this.x;
          this.x = clamp(opp.x - opp.facing * 100, 80, WORLD_W - 80);
          this.y = GROUND;
          this.onGround = true;
          this.facing = opp.x >= this.x ? 1 : -1;
          match.spawnDust(oldX, this.y, 12, '#cfe6ff');
          match.spawnDust(this.x, this.y, 10, '#ffe17a');
          match.spawnRing(this.x, this.y - 105, '#ffe17a', 88);
          match.spawnAfterimage(this, { life: 0.24, alpha: 0.2 });
        }
        if (a.time >= 0.34 && !a.hit) {
          a.hit = true;
          match.resolveHit(this, opp, {
            damage: sp.damage || 72,
            hitstun: sp.hitstun || 0.55,
            blockstun: 0.22,
            knockback: sp.knockback || 270,
            lift: -360,
            heavy: true,
            unblockable: true,
            sfx: 'hitHeavy'
          }, { source: 'second' });
          opp.frozen = false;
          match.spawnRing(opp.x, opp.y - 135, '#ffe17a', 170);
          match.spawnSpark(opp.x, opp.y - 145, '#fff3c4', 36);
          match.spawnText(opp.x, opp.y - 235, '無駄！', '#ffe17a', 28, 0.75);
          match.shake = Math.max(match.shake, 16);
          match.flash = Math.max(match.flash, 0.3);
          Audio.hitHeavy();
        }
        if (a.time >= (sp.duration || 0.66)) {
          opp.frozen = false;
          if (opp.state === 'frozen') opp.state = 'idle';
          match.miniTimeStop = null;
          Audio.pauseVoices();
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
        return;
      }

      if (a.type === 'barrage') {
        const b = a.move;
        let axis = 0;
        if (input && input.left) axis -= 1;
        if (input && input.right) axis += 1;
        // Held K no longer auto-lunges; the player steers the barrage.
        if (axis !== 0) this.facing = axis;
        this.vx = axis * this.data.speed * 0.72;
        this.standAlpha = 1;
        if (a.time >= a.nextHit) {
          a.nextHit += b.interval;
          if (this.barrageTick(match, opponent, b)) return;
        }
        if (a.time >= b.duration) {
          Audio.stopChant();
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
        return;
      }

      if (a.type === 'rush') {
        if (a.time >= a.nextHit && a.hits < sp.hits) {
          a.hits += 1;
          a.nextHit += sp.interval;
          const dist = Math.abs(opponent.x - this.x);
          if (dist < 205) {
            this.x += this.facing * 9;
            const isFinal = a.hits >= sp.hits;
            const hit = {
              damage: isFinal ? sp.damage + 22 : sp.damage,
              hitstun: isFinal ? 0.55 : 0.2,
              blockstun: 0.13,
              knockback: isFinal ? 290 : 26,
              lift: isFinal ? -430 : 0,
              meterGain: 2,
              sfx: 'hitLight',
              heavy: isFinal,
              unblockable: false
            };
            match.resolveHit(this, opponent, hit, { source: 'rush' });
            match.spawnSpark(opponent.x - this.facing * 12, opponent.y - 130 - Math.random() * 60, this.data.accent, 24);
            if (sp.fx === 'star') {
              match.spawnRing(opponent.x, opponent.y - 125, '#9beeff', 58);
              match.spawnSpark(opponent.x, opponent.y - 150, '#fff2bf', 16);
            }
            if (a.hits === 1) match.spawnText(this.x + this.facing * 90, this.y - 250, 'ORA!', this.data.accent, 30, 0.55);
            if (a.hits === 3) match.spawnText(this.x + this.facing * 60, this.y - 280, 'ORA ORA!', this.data.accent, 34, 0.6);
            if (isFinal) {
              match.spawnText(opponent.x, opponent.y - 210, 'ORA ORA ORA!', '#fff2bf', 44, 0.9);
              if (sp.fx === 'star') {
                match.spawnRing(opponent.x, opponent.y - 130, '#ffe47a', 190);
                match.spawnRing(opponent.x, opponent.y - 130, '#9beeff', 120);
              }
              match.shake = 18;
              match.flash = 0.35;
            }
          }
          if (a.hits >= sp.hits) {
            Audio.stopChant();
            this.specialAction = null;
            this.standAlpha = null;
            this.state = 'idle';
          }
        }
      } else if (a.type === 'projectile') {
        if (!a.fired && a.time >= 0.18) {
          a.fired = true;
          match.spawnProjectile(this, sp);
          Audio.projectile();
          match.spawnText(this.x + this.facing * 45, this.y - 190, sp.jp, this.data.accent, 18, 0.65);
        }
        if (a.time >= 0.72) {
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
      } else if (a.type === 'trap') {
        if (!a.fired && a.time >= sp.delay) {
          a.fired = true;
          match.spawnTrap(this, opponent.x, sp);
          if (sp.fx === 'life') {
            match.spawnRing(opponent.x, opponent.y - 80, '#8dffb1', 150);
            match.spawnRing(opponent.x, opponent.y - 80, '#ffe06a', 90);
            match.spawnDust(opponent.x, opponent.y - 40, 16, '#8dffb1');
            match.spawnText(opponent.x, opponent.y - 240, '生命之藤', '#8dffb1', 22, 0.8);
          }
          Audio.special();
        }
        if (a.time >= 1.05) {
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
      } else if (a.type === 'beam') {
        if (!a.fired && a.time >= 0.19) {
          a.fired = true;
          match.spawnProjectile(this, sp);
          Audio.beam();
          this.vx = -this.facing * 70;
          const muzzleY = this.y - (sp.yOffset || 160);
          match.spawnRing(this.x + this.facing * 58, muzzleY, sp.color, 62);
          match.spawnSpark(this.x + this.facing * 64, muzzleY, sp.color, 28);
          match.spawnAfterimage(this, { life: 0.22, alpha: 0.22 });
        }
        if (a.time >= 0.62) {
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
      } else if (a.type === 'spread') {
        if (!a.fired && a.time >= 0.2) {
          a.fired = true;
          match.spawnProjectile(this, sp);
          Audio.emerald();
          match.spawnRing(this.x + this.facing * 50, this.y - 152, '#8dffc8', 78);
          match.spawnText(this.x + this.facing * 46, this.y - 195, sp.jp, '#8dffc8', 18, 0.7);
        }
        if (a.time >= 0.8) {
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
      } else if (a.type === 'tree') {
        this.vx = 0;
        this.y = GROUND - 58;
        this.onGround = true;
        this.treeActive = true;
        this.treeTime = a.time;
        this.invuln = Math.max(this.invuln, 0.12);
        this.hp = Math.min(this.maxHp, this.hp + (sp.heal / sp.duration) * dt);
        if (!a.fired) {
          a.fired = true;
          Audio.heal();
          match.spawnText(this.x, this.y - 270, sp.name, '#a8ffb4', 24, 1.0);
          match.spawnRing(this.x, this.y - 70, '#8dffb1', 180);
          match.spawnDust(this.x, this.y + 50, 14, '#8dffb1');
          this.squash = -0.06;
        }
        if (a.time >= sp.duration) {
          this.treeActive = false;
          this.treeTime = 0;
          this.y = GROUND;
          this.onGround = true;
          this.landTimer = 0.12;
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
      } else if (a.type === 'frog') {
        this.vx = 0;
        if (!a.fired && a.time >= 0.16) {
          a.fired = true;
          match.spawnFrog(this, sp, a.cost || 0);
          Audio.special();
          match.spawnRing(this.x + this.facing * 44, this.y - 24, sp.color || '#8dffb1', 70);
          match.spawnDust(this.x + this.facing * 40, this.y, 6, sp.color || '#8dffb1');
        }
        if (a.time >= 0.55) {
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
      } else if (a.type === 'heal') {
        if (!a.fired && a.time >= 0.3) {
          a.fired = true;
          this.hp = Math.min(this.maxHp, this.hp + sp.heal);
          this.squash = -0.06;
          match.spawnText(this.x, this.y - 250, '+' + sp.heal, '#a8ffb4', 34, 0.9);
          match.spawnText(this.x, this.y - 290, sp.jp, '#ffe06a', 18, 0.8);
          match.spawnRing(this.x, this.y - 95, '#8dffc8', 150);
          match.spawnRing(this.x, this.y - 95, '#ffe06a', 95);
          match.spawnDust(this.x, this.y - 70, 18, '#9dffb2');
          this.standAlpha = 0.9;
          Audio.heal();
        }
        if (a.time >= 0.9) {
          this.specialAction = null;
          this.standAlpha = null;
          this.state = 'idle';
        }
      }
    }

    applyGravity(dt, match) {
      const wasAir = !this.onGround;
      this.vy += GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y >= GROUND) {
        this.y = GROUND;
        if (wasAir) {
          const impact = clamp(Math.abs(this.vy) / 900, 0.35, 1.4);
          this.squash = 0.11 + impact * 0.055;
          this.landTimer = 0.12 + impact * 0.06;
          match.spawnDust(this.x, this.y, 9 + Math.round(impact * 5), '#d8c2a6');
          match.spawnRing(this.x, this.y - 1, 'rgba(226,205,174,.55)', 34 + impact * 28);
          Audio.land();
        }
        this.vy = 0;
        this.onGround = true;
        this.airStandUsed = false;
      }
    }

    moveX(dt) {
      this.x += this.vx * dt;
      this.x = clamp(this.x, LEFT, RIGHT);
      if (this.x === LEFT && this.vx < 0) this.vx = 0;
      if (this.x === RIGHT && this.vx > 0) this.vx = 0;
    }

    updateStateFromMotion() {
      if (this.attack) this.state = 'attack';
      else if (this.specialAction) this.state = 'special';
      else if (!this.onGround) this.state = 'jump';
      else if (this.guarding) this.state = 'guard';
      else if (Math.abs(this.vx) > 20) this.state = 'walk';
      else this.state = 'idle';
    }

    getHurtbox() {
      const h = this.guarding ? 166 : 200;
      return { x1: this.x - 25, x2: this.x + 25, y1: this.y - h, y2: this.y - 3 };
    }

    getAttackBox(a) {
      const b = a.box;
      // The hitbox follows the Stand's visible punching fist. It still spans
      // from the body to the fist so point-blank overlap is covered, but the
      // far edge is the actual hand position rather than a fixed rectangle.
      const fist = Art.standFist(this, this.animTime);
      const fx = this.x + this.facing * fist.x;
      const fy = this.y + fist.y;
      const radius = Math.max(14, Math.min(30, (b.w || 80) * 0.16));
      const halfH = Math.max(16, Math.min(70, (b.h || 40) * 0.5));
      // A negative reachBonus lets a specific move be intentionally shorter
      // than its Stand's fist, without changing every other character.
      const bonus = a.reachBonus || 0;
      const near = 8;
      let x1 = this.facing === 1 ? this.x + near : fx - radius - bonus;
      let x2 = this.facing === 1 ? fx + radius + bonus : this.x - near;
      if (this.facing === 1) x2 = Math.max(x1 + 12, x2);
      else x1 = Math.min(x2 - 12, x1);
      return { x1, x2, y1: fy - halfH, y2: fy + halfH };
    }

    getSpecialBox() {
      return { x1: this.x - 30, x2: this.x + 30, y1: this.y - 190, y2: this.y - 3 };
    }
  }

  Object.assign(G, { Fighter });
})(window.JG.Game);
