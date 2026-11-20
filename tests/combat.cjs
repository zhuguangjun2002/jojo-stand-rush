// NODE_PATH=<Playwright node_modules> node tests/combat.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8081');
    await page.waitForFunction(() => window.JG?.Game?.App?.startMatch);
    const results = await page.evaluate(() => {
      const G = JG.Game, checks = [];
      const check = (condition, message) => { if (!condition) throw Error(message); checks.push(message); };
      const fresh = (a = 'jotaro', b = 'dio') => {
        const m = new G.Match(a,b,'2p',0,0,123);
        m.startRound(); m.phase='fight'; m.p1.state=m.p2.state='idle';
        m.p1.x=500; m.p2.x=900;
        return m;
      };
      for (const id of JG.CHAR_LIST.filter(id => id !== 'johnny')) {
        const m=fresh(id), f=m.p1, target=m.p2;
        f.onGround=false; f.y=G.GROUND-150; f.vy=-200;
        f.update(1/60,target,{pDodge:true,right:true},m);
        check(f.state==='dodge' && f.dashDir===1 && f.x>500 && !f.onGround && f.invuln>0,'air F moves right with invulnerability '+id);
        const y=f.y, vy=f.vy;
        f.update(.1,target,{},m);
        check(f.state==='dodge' && f.y!==y && f.vy>vy && !f.onGround,'air dodge preserves gravity '+id);
        for (let i=0;i<50;i++) f.update(1/60,target,{},m);
        check(f.onGround && f.y===G.GROUND,'air dodge eventually lands '+id);
      }
      for (const direction of [-1,1]) {
        const m=fresh('tooru'), f=m.p1;
        f.update(.01,m.p2,{pDodge:true,left:direction<0,right:direction>0},m);
        check(f.dashType==='dodge' && f.dashDir===direction && Math.abs(f.x-500)<20,'Tooru F uses normal directional displacement '+direction);
      }
      let m=fresh('tooru'), f=m.p1, target=m.p2;
      f.update(.01,target,{pHeavy:true,heavy:true},m);
      check(!f.specialAction && f.tooruHeavyPending && f.stoneCharges===3,'K waits to distinguish tap and hold');
      f.update(.05,target,{heavy:false},m);
      check(f.specialAction?.type==='wouGrab' && f.stoneCharges===3 && f.meter===49,'K tap grabs without throwing a stone');
      m=fresh('tooru'); f=m.p1; target=m.p2;
      f.update(.01,target,{pHeavy:true,heavy:true},m);
      for(let i=0;i<21;i++) f.update(1/60,target,{heavy:true},m);
      check(f.specialAction?.type==='wouStone' && f.stoneCharges===2 && f.meter===50,'held K casts exactly one stone, no grab');
      f.update(.01,target,{heavy:false},m);
      check(f.specialAction?.type!=='wouGrab' && f.stoneCharges===2,'release after held K does not also grab');
      m=fresh('tooru'); f=m.p1; f.stoneCharges=0; f.stoneCd=4;
      f.update(.01,m.p2,{pHeavy:true,heavy:true},m); f.update(.35,m.p2,{heavy:true},m);
      check(f.attack?.kind==='shortCane' && f.stoneCharges===0,'held K on recharge falls back to cane');
      m=fresh('tooru'); f=m.p1; f.meter=100; f.startSpecial(m);
      check(f.specialCd===5,'Tooru L cooldown is five seconds');
      m=fresh('jotaro'); m.p1.meter=100; m.p1.startSpecial(m);
      check(m.p1.specialCd===8,'other L cooldown stays eight seconds');

      for(const facing of [-1,1]) {
        m=fresh('tooru'); f=m.p1; target=m.p2; target.facing=facing; f.calamityGuard=1;
        m.resolveHit(target,f,{damage:100,hitstun:.3},{source:'normal'});
        check(f.x===target.x-facing*100 && f.facing===facing && f.hp===f.maxHp && target.hp===target.maxHp-88,'H counter teleports behind attacker '+facing);
      }
      m=fresh('tooru'); f=m.p1; target=m.p2; const originalX=f.x;
      m.wouCounter(f,target,'plate',true);
      check(f.x===originalX && target.hitstun===0,'domain chip counter does not teleport');

      for(const id of JG.CHAR_LIST) {
        m=fresh('dio',id); f=m.p2; f.update(.01,m.p1,{down:true},m);
        check(f.guarding,'initial guard '+id);
        m.resolveHit(m.p1,f,{damage:50,unblockable:true,guardBreak:.8,hitstun:.01},{source:'normal'});
        check(f.guardLock===(id==='tooru'?0:3),'guard-break lock duration '+id);
        f.update(1.1,m.p1,{down:true},m); f.update(.01,m.p1,{down:true},m);
        check(f.guarding===(id==='tooru'),'guard remains locked except Tooru '+id);
        f.update(2,m.p1,{down:true},m);
        check(f.guarding && f.guardLock===0,'guard returns after timer '+id);
        f.guardLock=3; f.resetRound(900,-1);
        check(f.guardLock===0,'round clears guard lock '+id);
      }
      m=fresh(); f=m.p2;
      m.resolveHit(m.p1,f,{damage:50,unblockable:true,guardBreak:1},{source:'normal'});
      check(f.guardLock===0,'an unguarded hit does not create three-second lock');

      function shot(upward, airborne) {
        const m=fresh('johnny','jotaro'), f=m.p1, target=m.p2;
        f.tuskAct=4; f.meter=100; target.onGround=!airborne;
        target.y=G.GROUND-(airborne?250:0);
        check(f.fireInfiniteNail(m,upward),'ACT4 launches '+upward+'/'+airborne);
        const y=m.infiniteNails[0].y;
        const altitudes=[];
        for(let i=0;i<120 && m.infiniteNails.length;i++) {
          altitudes.push(m.infiniteNails[0].y);
          m.updateTuskTimeless(1/60);
        }
        check(altitudes.every(value=>value===y),'infinite nail keeps fixed altitude '+upward+'/'+airborne);
        return {m,f,target};
      }
      let result=shot(false,true);
      check(result.target.hp===result.target.maxHp,'jump avoids lower infinite rotation');
      result=shot(false,false);
      check(result.target.hp===result.target.maxHp*.3,'lower infinite rotation hits grounded target');
      result=shot(true,false);
      check(result.target.hp===result.target.maxHp,'upper infinite rotation cannot hit grounded target');
      result=shot(true,true);
      check(result.target.hp===result.target.maxHp*.3,'upper infinite rotation hits airborne target');
      m=fresh('johnny','jotaro'); f=m.p1; f.tuskAct=4; f.meter=100; m.p2.guarding=true;
      f.fireInfiniteNail(m); m.updateTuskTimeless(.4);
      check(m.p2.guardLock===3 && m.p2.hp===m.p2.maxHp*.3,'infinite rotation breaking guard also applies three-second lock');
      m=fresh('johnny','jotaro'); f=m.p1; f.tuskAct=4; f.meter=100;
      f.update(.01,m.p2,{up:true,pSuper:true},m);
      check(m.infiniteNails[0].upward && m.infiniteNails[0].y===G.GROUND-260,'held up + U selects upper lane');
      G.Input.press('Space'); G.Input.pressed.clear();
      check(G.humanInput(0).up && !G.humanInput(0).pUp,'held up survives pressed clearing for network input');
      G.Input.clear();

      m=fresh(); f=m.p1; target=m.p2;
      f.update(.01,target,{pDodge:true,right:true},m);
      check(f.dodgeChainCount===1 && !f.dodgeStrikeWindow,'one dodge does not unlock strong hit');
      for(let i=0;i<16;i++) f.update(1/60,target,{},m);
      f.update(.01,target,{pDodge:true,right:true},m);
      check(f.dodgeStrikeWindow>1 && f.dashType==='dodge','second consecutive dodge unlocks K followup');
      target.x=f.x+140;
      f.update(.01,target,{pHeavy:true,heavy:true},m);
      check(f.attack?.kind==='dodgeStrike' && f.dashTime===0 && f.dodgeStrikeWindow===0,'K consumes followup during second dodge');
      const hp=target.hp;
      for(let i=0;i<30;i++) { f.update(1/60,target,{},m); m.animFighters(1/60); }
      check(target.hp<hp-100 && m.dodgeAirflows.length===1,'strong hit deals increased damage and spawns one airflow');
      m.render(G.ctx,1); m.updateEffects(.5);
      check(m.dodgeAirflows.length===0,'airflow expires');
      m=fresh(); f=m.p1;
      f.startDodge(m,{right:true}); for(let i=0;i<70;i++) f.update(1/60,m.p2,{},m);
      f.update(.01,m.p2,{pDodge:true},m);
      check(f.dodgeStrikeWindow===0 && f.dodgeChainCount===1,'widely separated dodges do not unlock followup');
      m=fresh(); f=m.p1; f.startDodge(m,{}); f.dashTime=0; f.startDodge(m,{});
      f.update(1.3,m.p2,{},m);
      check(f.dodgeStrikeWindow===0,'unused followup expires');
      m=fresh(); f=m.p1; f.startDodge(m,{}); f.startAttack('light',m);
      check(f.dodgeChainCount===0 && !f.dodgeStrikeWindow,'attack interrupts consecutive dodge chain');
      m=fresh(); f=m.p1; f.startDodge(m,{}); f.dashTime=0; f.startDodge(m,{});
      f.invuln=0; m.resolveHit(m.p2,f,{damage:10,hitstun:.2},{source:'normal'});
      f.update(.01,m.p2,{pHeavy:true},m);
      check(f.dodgeStrikeWindow===0 && !f.attack,'being hit cancels strong-hit window');
      m=fresh(); f=m.p1; f.update(.01,m.p2,{pHeavy:true},m);
      check(f.attack?.kind==='heavy','K without two dodges remains normal heavy attack');

      const a=fresh('johnny','tooru'), b=fresh('johnny','tooru');
      for(const match of [a,b]) { match.netplay=true; match.p1.tuskAct=4; match.p1.meter=100; }
      for(let i=0;i<360;i++) {
        const input=[{pSuper:i===0,up:i<20},{pUp:i===0,pHeavy:i===100,heavy:i>=100&&i<130}];
        a.update(1/60,input); b.update(1/60,input);
      }
      const snapshot=match=>JSON.stringify(match.fighters.map(f=>[f.x,f.y,f.hp,f.meter,f.guardLock,f.dodgeChainCount]));
      check(snapshot(a)===snapshot(b),'upper aim, jumping and Tooru hold remain deterministic');
      G.startNetMatch('jotaro','tooru',123); G.App.game.phase='fight';
      G.App.game.p1.state=G.App.game.p2.state='idle';
      G.App.game.p1.x=650; G.App.game.p2.x=850;
      G.App.game.p1.state='dodge'; G.Art.updatePose(G.App.game.p1,.1,2);
      G.App.game.dodgeAirflows.push({x:850,y:G.GROUND-135,dir:1,life:.4});
      G.dom.announce.classList.remove('show','pop'); G.render(2);
      return checks;
    });
    await page.screenshot({path:'/tmp/jojo-combat-balance.png'});
    assert.deepEqual(errors,[]);
    console.log(`${results.length} combat checks passed`);
    console.log(results.filter(r=>!r.includes('keeps fixed altitude')).join('\n'));
  } finally { await browser.close(); }
})().catch(error=>{ console.error(error); process.exitCode=1; });
