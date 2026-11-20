/* =========================================================
   Character & move data
   ========================================================= */
(function () {
  'use strict';
  const JG = (window.JG = window.JG || {});

  const baseLight = {
    startup: 0.075,
    active: 0.075,
    recovery: 0.16,
    damage: 42,
    hitstun: 0.27,
    blockstun: 0.13,
    knockback: 52,
    lift: 0,
    box: { x: 46, y: -157, w: 82, h: 34 },
    // J is a faster poke and reaches slightly past the heavy's fist.
    reachBonus: 17,
    meterGain: 7,
    sfx: 'hitLight',
    pose: 'light'
  };

  const baseHeavy = {
    startup: 0.16,
    active: 0.09,
    recovery: 0.28,
    damage: 86,
    hitstun: 0.4,
    blockstun: 0.19,
    knockback: 245,
    lift: -430,
    box: { x: 47, y: -157, w: 112, h: 50 },
    meterGain: 11,
    sfx: 'hitHeavy',
    pose: 'heavy',
    heavy: true
  };

  // Jump-in normal: the Stand takes over for an unblockable guard-break slam.
  const baseAirStand = {
    startup: 0.13,
    active: 0.11,
    recovery: 0.31,
    damage: 76,
    hitstun: 0.62,
    blockstun: 0,
    knockback: 150,
    lift: -230,
    box: { x: 16, y: -224, w: 132, h: 268 },
    meterGain: 12,
    sfx: 'hitHeavy',
    heavy: true,
    unblockable: true,
    guardBreak: 1.15,
    pose: 'airStand'
  };

  // Down + heavy: anti-air / launch tool.
  const baseLauncher = {
    startup: 0.18,
    active: 0.1,
    recovery: 0.34,
    damage: 92,
    hitstun: 0.76,
    blockstun: 0.18,
    knockback: 66,
    lift: -650,
    box: { x: 30, y: -238, w: 104, h: 230 },
    meterGain: 12,
    sfx: 'hitHeavy',
    heavy: true,
    launcher: true
  };

  // Dash + light: forward-moving shoulder / Stand ram.
  const baseDashStrike = {
    startup: 0.075,
    active: 0.11,
    recovery: 0.26,
    damage: 62,
    hitstun: 0.44,
    blockstun: 0.17,
    knockback: 250,
    lift: -60,
    box: { x: 38, y: -174, w: 136, h: 92 },
    meterGain: 9,
    sfx: 'hitLight',
    dashStrike: true
  };

  // Air heavy: diving kick that bounces on hit.
  const baseDive = {
    startup: 0.1,
    active: 0.22,
    recovery: 0.28,
    damage: 68,
    hitstun: 0.52,
    blockstun: 0.16,
    knockback: 175,
    lift: -130,
    box: { x: 22, y: -118, w: 104, h: 158 },
    meterGain: 9,
    sfx: 'hitHeavy',
    heavy: true,
    dive: true
  };

  // Shared baseline so every mode (arcade, versus, training) uses the same
  // 2000 HP pool. Damage numbers stay as-is, so fights last longer by design.
  JG.MAX_HP = 2000;

  // H / L are regular skills now: H is the follow-up skill, L the second
  // skill. U stays the 100 SP super. Cooldowns are shared by every character
  // and start only after a successful cast.
  JG.SKILL_COOLDOWN = { second: 5, special: 8 };

  JG.CHARACTERS = {
    jotaro: {
      id: 'jotaro',
      index: '01',
      name: '空条承太郎',
      short: '承太郎',
      en: 'JOTARO KUJO',
      stand: 'STAR PLATINUM',
      standJp: '白金之星',
      tag: 'POWER / RUSH',
      style: '近身连打 · 流星刺指 · 时间停止',
      stage: 'morioh',
      stats: { power: 5, speed: 4, range: 2 },
      accent: '#59d8ff',
      accent2: '#7b55ff',
      colors: {
        hp: 'linear-gradient(90deg,#1e9de0,#62e8ff,#c9fbff)',
        aura: '#8d6bff',
        glow: 'rgba(116, 83, 255, .55)'
      },
      palette: {
        skin: '#e9b78e', skinShade: '#c78d6a', hair: '#151726', hairShade: '#080910',
        coat: '#1c2547', coatShade: '#10162c', shirt: '#2a2f43', shirtShade: '#181c2a',
        pants: '#24283c', pantsShade: '#151727', shoes: '#0a0c14', trim: '#f2c85b',
        metal: '#e6c56c', eye: '#5fe3dc', lip: '#9f5b58', outline: '#08070d',
        aura: '#8a6bff', aura2: '#59e5ff'
      },
      alt: { coat: '#3d2456', coatShade: '#251433', pants: '#302143', trim: '#63e7ff', hair: '#24132f', hairShade: '#100817' },
      speed: 265,
      jump: 880,
      weight: 1.02,
      attacks: {
        light: { ...baseLight, damage: 44 },
        heavy: { ...baseHeavy, damage: 88 },
        dodgeStrike: { ...baseHeavy, damage: 180, startup: 0.08, active: 0.14, recovery: 0.35,
          hitstun: 0.75, lift: 0, reachBonus: 38, airflow: true },
        launcher: { ...baseLauncher, damage: 96 },
        dash: { ...baseDashStrike, damage: 66 },
        dive: { ...baseDive, damage: 72 }
      },
      airStand: { ...baseAirStand, name: '白金之星·坠击', jp: 'ORA!', damage: 78 },
      second: {
        type: 'beam', name: '流星刺指', jp: 'METEOR FINGER', en: 'STAR PLATINUM · METEOR FINGER',
        cost: 25, damage: 64, speed: 1460, kind: 'meteor', color: '#9ff4ff',
        width: 142, height: 14, yOffset: 160, hitstun: 0.44, knockback: 195,
        // A grounded beam: jumping over it dodges the beam and the follow-up.
        jumpDodge: true,
        // On a clean hit, Star Platinum closes the gap and adds one punch.
        followup: 'starPlatinum', followupDamage: 52, followupHitstun: 0.58,
        followupKnockback: 260
      },
      special: {
        type: 'rush', name: 'ORA ORA ORA', jp: 'オラオラオラ', stand: 'STAR PLATINUM',
        cost: 80, damage: 25, hits: 5, duration: 0.94, advance: 105,
        box: { x: 40, y: -173, w: 132, h: 92 }, interval: 0.14, finalLift: -520, fx: 'star'
      },
      barrage: {
        type: 'barrage', style: 'melee', name: '白金之星·欧拉连打', jp: 'オラオラオラ',
        damage: 8, interval: 0.115, duration: 1.05, range: 142, color: '#59d8ff'
      },
      super: {
        type: 'timestop', name: '白金之星·世界', en: 'STAR PLATINUM: THE WORLD',
        stand: 'STAR PLATINUM', cost: 100, duration: 3.55, hits: 8,
        damage: 31, finalDamage: 74, color: '#b79cff', finisher: '时间开始流动。'
      },
      ai: { aggression: 0.72, block: 0.5, jump: 0.18, special: 0.55, range: 108 },
      intro: '“Yare yare daze…”',
      win: '“你失败的原因只有一个——就是你惹火了我。”',
      ko: '“真是麻烦……”',
      finisherQuote: '闭嘴，你这家伙',
      hurt: ['啧。', '有两下子。', '还没完。']
    },

    dio: {
      id: 'dio',
      index: '02',
      name: 'DIO',
      short: 'DIO',
      en: 'DIO BRANDO',
      stand: 'THE WORLD',
      standJp: '世界',
      tag: 'ROYAL / FEAR',
      style: '时停压制 · 压路机终结',
      stage: 'cairo',
      stats: { power: 5, speed: 4, range: 3 },
      accent: '#ffd447',
      accent2: '#ff335f',
      colors: {
        hp: 'linear-gradient(90deg,#e4a51a,#ffd447,#fff5bd)',
        aura: '#ffe35e',
        glow: 'rgba(255, 210, 60, .55)'
      },
      palette: {
        skin: '#edc4a1', skinShade: '#c9946f', hair: '#f5cc4f', hairShade: '#ad7918',
        coat: '#eab72e', coatShade: '#a97713', shirt: '#15111c', shirtShade: '#0a0810',
        pants: '#5b1526', pantsShade: '#390c18', shoes: '#171019', trim: '#f8ecc0',
        metal: '#f4e5a2', eye: '#ff4650', lip: '#741c35', outline: '#09070b',
        aura: '#ffe35e', aura2: '#ff4b6f'
      },
      alt: { coat: '#d9d4c6', coatShade: '#9b9688', pants: '#2d2357', trim: '#ff5b79', hair: '#f7e9bc', hairShade: '#b49f6a' },
      speed: 255,
      jump: 865,
      weight: 1.04,
      attacks: {
        light: { ...baseLight, damage: 41 },
        heavy: { ...baseHeavy, damage: 92 },
        launcher: { ...baseLauncher, damage: 94 },
        dash: { ...baseDashStrike, damage: 62 },
        dive: { ...baseDive, damage: 70 }
      },
      airStand: { ...baseAirStand, name: '世界·坠击', jp: '無駄!', damage: 76 },
      second: {
        type: 'timestopstrike', name: '时停·绕后袭击', jp: 'ZA WARUDO', en: 'TIME STOP · BEHIND STRIKE',
        cost: 25, damage: 72, duration: 0.66, hitstun: 0.55, knockback: 270, color: '#ffe17a'
      },
      special: {
        type: 'timestop', name: 'THE WORLD', jp: 'ZA WARUDO', en: 'THE WORLD · TIME STOP',
        stand: 'THE WORLD', cost: 80, duration: 1.9, hits: 5,
        damage: 19, finalDamage: 42, color: '#ffd54f', finisher: '时间，停止吧。'
      },
      super: {
        type: 'roadroller', name: '罗大罗大大', en: 'ROAD ROLLER DA!',
        stand: 'THE WORLD', cost: 100, duration: 3.5, hits: 9,
        damage: 24, finalDamage: 92, color: '#ffd54f', finisher: '压路机来喽！'
      },
      barrage: {
        type: 'barrage', style: 'melee', name: '世界·木大', jp: '無駄無駄無駄',
        damage: 8, interval: 0.12, duration: 1.05, range: 138, color: '#ffd54f'
      },
      ai: { aggression: 0.78, block: 0.46, jump: 0.2, special: 0.65, range: 300 },
      intro: '“WRYYYYYY！”',
      win: '“無駄無駄無駄！你连做我对手的资格都没有。”',
      ko: '“不可能……我DIO竟然……”',
      finisherQuote: 'The World',
      hurt: ['区区……', '有趣。', 'WRY！']
    },

    giorno: {
      id: 'giorno',
      index: '03',
      name: '乔鲁诺·乔巴纳',
      short: '乔鲁诺',
      en: 'GIORNO GIOVANNA',
      stand: 'GOLD EXPERIENCE',
      standJp: '黄金体验',
      tag: 'LIFE / TRAP',
      style: '生命之树 / 青蛙 · 低体力镇魂曲抓取',
      stage: 'rome',
      stats: { power: 4, speed: 4, range: 3 },
      accent: '#ff9ec3',
      accent2: '#ffe06a',
      colors: {
        hp: 'linear-gradient(90deg,#d75d8e,#ff9ec3,#ffe5ef)',
        aura: '#ffe06a',
        glow: 'rgba(255, 203, 90, .55)'
      },
      palette: {
        skin: '#ecc09c', skinShade: '#c98e6e', hair: '#1c1520', hairShade: '#09060b',
        coat: '#ec8eac', coatShade: '#b6587a', shirt: '#17111b', shirtShade: '#0a070d',
        pants: '#d57093', pantsShade: '#9e4667', shoes: '#21131f', trim: '#87e38f',
        metal: '#f3d36a', eye: '#7ce0a4', lip: '#b94e6b', outline: '#09070b',
        aura: '#ffe06a', aura2: '#7dff9d'
      },
      alt: { coat: '#75b8e8', coatShade: '#3d7ea9', pants: '#4d8ec0', trim: '#ffe06a', hair: '#1c2430', hairShade: '#0a0e14' },
      gerPalette: {
        skin: '#ecc09c', skinShade: '#c98e6e', hair: '#18121b', hairShade: '#07050a',
        coat: '#f3ead2', coatShade: '#cbbd9c', shirt: '#241d26', shirtShade: '#0e0a10',
        pants: '#e7dcc1', pantsShade: '#b9a989', shoes: '#2b2118', trim: '#ffd75a',
        metal: '#ffe28a', eye: '#a7ffb4', lip: '#b9506c', outline: '#09070a',
        aura: '#ffe06a', aura2: '#fff5c8'
      },
      speed: 250,
      jump: 875,
      weight: 0.98,
      attacks: {
        light: { ...baseLight, damage: 40 },
        heavy: { ...baseHeavy, damage: 82 },
        launcher: { ...baseLauncher, damage: 88 },
        dash: { ...baseDashStrike, damage: 58 },
        dive: { ...baseDive, damage: 66 }
      },
      airStand: { ...baseAirStand, name: '黄金体验·生命坠击', jp: 'GOLD!', damage: 72 },
      second: {
        type: 'tree', name: '生命之树', jp: 'TREE OF LIFE', en: 'GOLD EXPERIENCE · TREE OF LIFE',
        cost: 25, duration: 1.6, heal: 72, invuln: 1.7, color: '#8dffb1'
      },
      // Short tap H: send a frog to harass the opponent. It costs SP up front,
      // but the cost is refunded if the frog leaves without ever being hit.
      secondFrog: {
        type: 'frog', name: '生命青蛙', jp: 'FROG', en: 'GOLD EXPERIENCE · LIFE FROG',
        cost: 25, duration: 8, speed: 96, color: '#8dffb1',
        damagePercent: 0.05
      },
      secondRequiem: {
        type: 'beam', name: '归零射线', jp: 'RETURN TO ZERO', en: 'REQUIEM · RETURN TO ZERO',
        cost: 25, damage: 58, speed: 1680, kind: 'gerray', color: '#ffe06a',
        width: 156, height: 15, yOffset: 172, hitstun: 0.52, knockback: 220,
        unblockable: true
      },
      special: {
        // L used to be an 80 SP mini-finisher. It is now a regular second
        // skill: cheaper, shorter, blockable, and on the shared 8 s cooldown.
        type: 'trap', name: '生命之藤', jp: '黄金体験', stand: 'GOLD EXPERIENCE',
        cost: 40, damage: 48, delay: 0.44, radius: 72, heal: 10, fx: 'life',
        unblockable: false
      },
      barrage: {
        type: 'barrage', style: 'melee', name: '黄金体验·木大连打', jp: '無駄無駄無駄',
        damage: 7, interval: 0.12, duration: 1.05, range: 136, color: '#ffe06a'
      },
      super: {
        type: 'requiem', name: '黄金体验·生命洪流', en: 'GOLD EXPERIENCE: LIFE OVERDRIVE',
        stand: 'GOLD EXPERIENCE', cost: 100, duration: 3.8, hits: 9,
        damage: 33, finalDamage: 58, color: '#ffe06a', finisher: '生命，会找到自己的道路。'
      },
      ger: {
        name: '黄金体验镇魂曲', en: 'GOLD EXPERIENCE REQUIEM',
        stand: 'GOLD EXPERIENCE REQUIEM', color: '#ffe06a',
        duration: 4.6, truthTime: 2.35,
        // A short, readable lunge before the grab check instead of a long
        // screen-crossing dash.
        grabDash: 110, grabTime: 0.24, grabRange: 104,
        finisher: '你永远，无法到达真实。'
      },
      ai: { aggression: 0.63, block: 0.58, jump: 0.24, special: 0.7, range: 260 },
      intro: '“我有一个梦想。”',
      win: '“我继承了那份意志。你的野心，到此为止。”',
      ko: '“还……不能在这里倒下……”',
      finisherQuote: '我乔鲁诺.乔巴拿更想要成为【黑帮巨星】',
      hurt: ['还没结束。', '这就是你的觉悟？', '我不会退。']
    },

    kakyoin: {
      id: 'kakyoin',
      index: '04',
      name: '花京院典明',
      short: '花京院',
      en: 'NORIAKI KAKYOIN',
      stand: 'HIEROPHANT GREEN',
      standJp: '法皇之绿',
      tag: 'ZONER / RANGE',
      style: '绿宝石连射 · 空中压制',
      stage: 'morioh',
      stats: { power: 3, speed: 4, range: 5 },
      accent: '#66f2b2',
      accent2: '#b38cff',
      colors: {
        hp: 'linear-gradient(90deg,#1fa778,#66f2b2,#d8fff0)',
        aura: '#72ffc0',
        glow: 'rgba(80, 255, 180, .5)'
      },
      palette: {
        skin: '#eab78f', skinShade: '#c88a64', hair: '#c33a4f', hairShade: '#7c1b2d',
        coat: '#32795d', coatShade: '#1c4b3a', shirt: '#ece2ca', shirtShade: '#c7b795',
        pants: '#2c634f', pantsShade: '#193d31', shoes: '#151b17', trim: '#f2dfb4',
        metal: '#d9c58f', eye: '#b18cff', lip: '#9c4052', outline: '#08070c',
        aura: '#5cffc0', aura2: '#b38cff'
      },
      alt: { coat: '#4a4c9c', coatShade: '#2b2d66', pants: '#3b3e7a', trim: '#ffb1c7', hair: '#e0a44a', hairShade: '#986525' },
      speed: 258,
      jump: 890,
      weight: 0.96,
      attacks: {
        light: { ...baseLight, damage: 38, box: { x: 48, y: -159, w: 96, h: 30 } },
        heavy: { ...baseHeavy, damage: 78, box: { x: 46, y: -158, w: 124, h: 42 } },
        launcher: { ...baseLauncher, damage: 84 },
        dash: { ...baseDashStrike, damage: 60 },
        dive: { ...baseDive, damage: 64 }
      },
      airStand: { ...baseAirStand, name: '法皇·绿宝石坠击', jp: 'SPLASH!', damage: 72 },
      second: {
        type: 'spread', name: '绿宝石飞溅', jp: 'EMERALD SPLASH', en: 'HIEROPHANT GREEN · EMERALD SPLASH',
        cost: 25, damage: 24, count: 7, speed: 820, spread: 0.82, projectile: 'emerald'
      },
      special: {
        type: 'projectile', name: '绿宝石水花', jp: 'エメラルドスプラッシュ', stand: 'HIEROPHANT GREEN',
        cost: 80, damage: 32, count: 3, speed: 740, spread: 0.44, projectile: 'emerald', fx: 'emerald'
      },
      barrage: {
        type: 'barrage', style: 'emerald', name: '法皇·绿宝石连射', jp: 'エメラルドスプラッシュ',
        damage: 6, interval: 0.115, duration: 1.15, range: 430, color: '#66ffba',
        speed: 880, spread: 0.12, projectile: 'emerald'
      },
      super: {
        type: 'emerald', name: '绿宝石水花·20米', en: 'EMERALD SPLASH · 20M',
        stand: 'HIEROPHANT GREEN', cost: 100, duration: 3.5, hits: 12,
        damage: 24, finalDamage: 42, color: '#62ffbd', finisher: '这就是，我的替身。'
      },
      ai: { aggression: 0.55, block: 0.62, jump: 0.28, special: 0.82, range: 480 },
      intro: '“我的替身，没有死角。”',
      win: '“20米的射程之内，你无处可逃。”',
      ko: '“抱歉……我先走一步……”',
      finisherQuote: '接招吧，半径20米的绿宝石水花',
      hurt: ['中计了？', '还不够。', '再来。']
    },

    tooru: {
      id: 'tooru',
      index: '05',
      name: '透龙',
      short: '透龙',
      en: 'TOORU',
      stand: 'WONDER OF U',
      standJp: '奇迹与你',
      tag: 'CALAMITY / CONTROL',
      style: '灾厄洪流 · 追踪石 · 奇迹与你',
      stage: 'morioh',
      stats: { power: 4, speed: 3, range: 4 },
      accent: '#ff4b5f',
      accent2: '#d8f7ff',
      colors: {
        hp: 'linear-gradient(90deg,#700f1b,#ff304d,#ffd0d8)',
        aura: '#ff4055',
        glow: 'rgba(255, 64, 85, .55)'
      },
      palette: {
        skin: '#d9c7a8', skinShade: '#a88762', hair: '#141018', hairShade: '#07050a',
        coat: '#15121a', coatShade: '#08070b', shirt: '#2a2220', shirtShade: '#120e0d',
        pants: '#16131a', pantsShade: '#08070a', shoes: '#0b090d', trim: '#d6b45a',
        metal: '#e9d18a', eye: '#ff4055', lip: '#7a2a32', outline: '#050407',
        aura: '#ff4055', aura2: '#f4f7ff'
      },
      alt: {
        coat: '#2a2230', coatShade: '#120e17', pants: '#262031',
        trim: '#9fe9ff', hair: '#221a28', hairShade: '#0b0810'
      },
      speed: 245,
      jump: 860,
      weight: 1.05,
      attacks: {
        // The cane strike has a slower recovery than other J attacks. Its
        // reach is deliberately shorter too; Tooru should not get a full
        // normal-range poke on top of his projectiles and teleports.
        light: { ...baseLight, damage: 47, recovery: 0.30, reachBonus: -14 },
        heavy: { ...baseHeavy, damage: 84 },
        launcher: { ...baseLauncher, damage: 90 },
        dash: { ...baseDashStrike, damage: 62 },
        dive: { ...baseDive, damage: 68 },
        // Jumping J: a cane strike instead of the normal Stand slam.
        airCane: {
          startup: 0.08, active: 0.11, recovery: 0.26,
          damage: 62, hitstun: 0.5, blockstun: 0,
          knockback: 170, lift: -40,
          box: { x: 20, y: -190, w: 140, h: 130 },
          meterGain: 8, sfx: 'hitHeavy', pose: 'light',
          // Jump attacks are the roster's guard-break tool; Tooru's cane is
          // no exception.
          unblockable: true, guardBreak: 1.15, heavy: true
        },
        // When the three stone charges are spent, short K falls back to a
        // cane poke. Same idea as J, but with a visibly shorter reach.
        shortCane: {
          startup: 0.075, active: 0.075, recovery: 0.24,
          damage: 44, hitstun: 0.26, blockstun: 0.12,
          knockback: 46, lift: 0,
          box: { x: 24, y: -157, w: 62, h: 34 },
          reachBonus: 0,
          meterGain: 5, sfx: 'hitLight', pose: 'light'
        }
      },
      airStand: { ...baseAirStand, name: '奇迹与你·坠击', jp: 'DOOM!', damage: 74 },
      second: {
        type: 'wouGuard', name: '灾厄的洪流', jp: 'CALAMITY', cost: 10,
        duration: 4, color: '#ff4055'
      },
      secondLong: {
        type: 'wouRain', name: '灾厄的洪流·追击', jp: 'PURSUIT', cost: 25,
        duration: 3, range: 190, dps: 20, color: '#ff4055'
      },
      special: {
        type: 'wouBug', name: 'Da-Da-Da-Da-Da-Da-Da', jp: 'Da-Da-Da',
        cost: 50, speed: 210, duration: 6, damage: 70, cooldown: 5, color: '#c9a86a'
      },
      stone: {
        type: 'wouStone', name: 'OB-LA-DI-OB-LA-DA', cost: 0,
        // Tooru's free K stone is intentionally shorter than before: the
        // tracking range and the guard-safe hit were doing too much work
        // for a zero-cost tool.
        speed: 250, damage: 64, maxDist: 500, color: '#e4d0a0'
      },
      barrage: {
        type: 'barrage', style: 'melee', name: '奇迹与你·连打', jp: 'DOOM',
        damage: 8, interval: 0.12, duration: 1.0, range: 142, color: '#ff4055'
      },
      super: {
        type: 'wouDomain', name: '灾厄的恶', jp: 'CALAMITY DOMAIN', en: 'CALAMITY DOMAIN',
        cost: 50, duration: 20, color: '#f4f7ff'
      },
      ai: { aggression: 0.68, block: 0.52, jump: 0.16, special: 0.7, range: 260 },
      intro: '“你最好不要动我。”',
      win: '“我已经告诉过你要住手了……”',
      ko: '“这就是……灾厄……”',
      finisherQuote: '我已经告诉过你要住手了.......',
      hurt: ['……', '真是麻烦。', '灾厄会追上你。']
    },

    josuke: {
      id: 'josuke',
      index: '06',
      name: '东方定助',
      short: '定助',
      en: 'JOSUKE HIGASHIKATA',
      stand: 'SOFT & WET',
      standJp: '软又湿',
      tag: 'BUBBLE / STEAL',
      style: '泡泡夺属性 · 特殊能量进化 · 软又湿·超越',
      stage: 'morioh',
      stats: { power: 4, speed: 4, range: 3 },
      accent: '#81dcff',
      accent2: '#fff1a8',
      colors: {
        hp: 'linear-gradient(90deg,#2c78c8,#81dcff,#f4fbff)',
        aura: '#8fd8ff',
        glow: 'rgba(120, 220, 255, .55)'
      },
      palette: {
        skin: '#e7bc98', skinShade: '#c48c6b', hair: '#173c36', hairShade: '#081b18',
        coat: '#f0f1ea', coatShade: '#c6d0d2', shirt: '#22365c', shirtShade: '#12203a',
        pants: '#e7e8e0', pantsShade: '#b9c0c0', shoes: '#1a2430', trim: '#3b6fb5',
        standTrim: '#5a3d8f',
        belt: '#5d3d91', metal: '#e8c84a', eye: '#5fae94', lip: '#a45f58', outline: '#070b10',
        aura: '#eaf8ff', aura2: '#7fd8ff'
      },
      // Go Beyond does not just unlock a move: it changes the Stand's white
      // shell into the over-bright palette.
      goBeyondPalette: {
        coat: '#ffffff', coatShade: '#cfe9f6', shirt: '#2c3f74',
        pants: '#f4fbff', pantsShade: '#c7e2ef', trim: '#6e50a8', standTrim: '#6e50a8',
        belt: '#6e50a8', hair: '#0d2c2b', hairShade: '#041413',
        aura: '#ffffff', aura2: '#8fe8ff', metal: '#ffe066'
      },
      alt: {
        coat: '#dfe9ff', coatShade: '#aebed8', pants: '#cfdcf2', trim: '#7a5bb8',
        belt: '#3f6fb0', hair: '#243b52', hairShade: '#0e1c2a'
      },
      speed: 262,
      jump: 885,
      weight: 0.97,
      attacks: {
        light: { ...baseLight, damage: 42 },
        heavy: { ...baseHeavy, damage: 84 },
        launcher: { ...baseLauncher, damage: 90 },
        dash: { ...baseDashStrike, damage: 62 },
        dive: { ...baseDive, damage: 68 }
      },
      airStand: { ...baseAirStand, name: '软又湿·泡沫坠击', jp: 'SOFT!', damage: 74 },
      second: {
        type: 'bubbleSteal', name: '夺走之泡', jp: 'STEAL', en: 'SOFT & WET · STEAL',
        cost: 20, damage: 16, speed: 330, range: 560, duration: 5, color: '#8fe8ff'
      },
      special: {
        type: 'bubbleShot', name: '泡沫弹', jp: 'BUBBLE', en: 'SOFT & WET · BUBBLE',
        // Normal L is a basic ranged bubble: three shots, then a short
        // recharge. It does not steal attributes; that is still H's job.
        cost: 0, damage: 28, speed: 560, range: 560,
        charges: 3, cooldown: 4, color: '#8fe8ff'
      },
      specialEvolved: {
        type: 'goBeyondBubble', name: '软又湿·超越', jp: 'GO BEYOND',
        en: 'SOFT & WET · GO BEYOND', cost: 40, damage: 74, speed: 1180,
        color: '#eaf8ff'
      },
      barrage: {
        type: 'barrage', style: 'melee', name: '软又湿·连打', jp: 'SOFT & WET',
        damage: 8, interval: 0.12, duration: 1.0, range: 138, color: '#8fe8ff'
      },
      super: {
        // A single piercing bubble, not a multi-hit rush: the projectile
        // passes through the victim, then the body bursts behind it.
        type: 'gobeyondshot', name: '软又湿·超越', en: 'SOFT & WET: GO BEYOND',
        stand: 'SOFT & WET: GO BEYOND', cost: 100, duration: 2.0, hits: 0,
        damage: 320, finalDamage: 0, color: '#dff6ff', finisher: '泡沫，会夺走一切。'
      },
      ai: { aggression: 0.66, block: 0.54, jump: 0.22, special: 0.62, range: 300 },
      intro: '“我要夺走你的……某个东西。”',
      win: '“这就是，软又湿·超越。”',
      ko: '“还没……结束……”',
      finisherQuote: '泡沫，会夺走一切。',
      hurt: ['还没完。', '这点程度。', '我不会退。']
    }
  };

  JG.CHARACTERS.johnny = {
    ...JG.CHARACTERS.jotaro,
    id: 'johnny', index: '07', name: '乔尼·乔斯达', short: '乔尼', en: 'JOHNNY JOESTAR',
    stand: 'TUSK ACT1–4', standJp: '牙 ACT1～ACT4', tag: 'SPIN / HORSEBACK',
    style: '上下马 · 十发爪弹 · 无限回转', stage: 'morioh',
    stats: { power: 3, speed: 5, range: 5 }, accent: '#ff95ce', accent2: '#8dcfff',
    colors: { hp: 'linear-gradient(90deg,#ae4b9b,#ff95ce,#fff0fc)', aura: '#ff95ce', glow: 'rgba(255,149,206,.5)' },
    palette: { ...JG.CHARACTERS.jotaro.palette, coat: '#cee8fa', coatShade: '#6394c6',
      pants: '#e0edfc', pantsShade: '#8aa7ce', hair: '#efd18a', hairShade: '#ba914d', trim: '#dc83c1' },
    alt: { coat: '#e9c4ea', coatShade: '#b376b0', pants: '#d4b4df' },
    speed: 290, jump: 0, weight: 1,
    second: { type: 'nail', name: '回旋爪弹 / ACT3 入孔', cost: 0 },
    special: { type: 'nail', name: '回旋爪弹 / 遗体进化', cost: 0 },
    super: { type: 'infiniteRotation', name: '牙 ACT4 · 无限回转', en: 'TUSK ACT4 · INFINITE ROTATION', cost: 100 },
    ai: { aggression: 0.65, block: 0.4, jump: 0, special: 0.7, range: 460 },
    intro: '“我要找回属于自己的道路。”', win: '“这就是回旋的力量。”',
    ko: '“还不能……放弃……”', finisherQuote: '回旋，前进。', hurt: ['还没完。', '我会继续前进。']
  };
  JG.CHAR_LIST = ['jotaro', 'dio', 'giorno', 'kakyoin', 'tooru', 'josuke', 'johnny'];

  JG.STAGES = {
    morioh: {
      id: 'morioh',
      name: '杜王町',
      en: 'MORIOH · SUMMER NIGHT',
      palette: { skyTop: '#171033', skyMid: '#4a1f52', skyLow: '#ff7c62', ground: '#16121a' }
    },
    cairo: {
      id: 'cairo',
      name: '开罗',
      en: 'CAIRO · DUSK',
      palette: { skyTop: '#1b1435', skyMid: '#7a2c43', skyLow: '#ffb45f', ground: '#261a17' }
    },
    rome: {
      id: 'rome',
      name: '罗马',
      en: 'ROME · MOONLIT COLOSSEUM',
      palette: { skyTop: '#0d1430', skyMid: '#2a3f67', skyLow: '#a5a0bd', ground: '#181723' }
    }
  };

  JG.DIFFICULTY = {
    easy: { label: '新手', reaction: 0.46, aggression: 0.55, block: 0.26, damage: 0.85, escape: 0.006 },
    normal: { label: '普通', reaction: 0.27, aggression: 0.76, block: 0.44, damage: 1.0, escape: 0.012 },
    hard: { label: '狂热', reaction: 0.13, aggression: 0.94, block: 0.62, damage: 1.12, escape: 0.022 },
    // Values are replaced from the title-screen sliders and persisted in
    // localStorage. Keeping a real entry here means the AI code can keep
    // reading JG.DIFFICULTY[App.difficulty] unchanged.
    custom: { label: '自定义', reaction: 0.27, aggression: 0.76, block: 0.44, damage: 1.0, escape: 0.012 }
  };

  JG.clonePalette = function (charId, variant, requiem) {
    const char = JG.CHARACTERS[charId];
    const p = Object.assign({}, char.palette);
    if (variant && char.alt) Object.assign(p, char.alt);
    if (requiem && char.gerPalette) Object.assign(p, char.gerPalette);
    return p;
  };

  JG.paletteFor = function (charId, variant, requiem) {
    return JG.clonePalette(charId, variant, requiem);
  };

  JG.stageFor = function (p1, p2) {
    if (p1 === 'dio' || p2 === 'dio') return 'cairo';
    if (p1 === 'giorno' || p2 === 'giorno') return 'rome';
    return 'morioh';
  };
})();
