// NODE_PATH=<Playwright node_modules> node tests/johnny.cjs
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8081');
    await page.waitForFunction(() => window.JG?.Game?.App?.startMatch);
    const results = await page.evaluate(() => {
      const G=JG.Game, checks=[];
      function check(value,name) { if(!value) throw Error(name); checks.push(name); }
      function fresh(a='johnny',b='jotaro',seed=123) {
        const m=new G.Match(a,b,'2p',0,0,seed);
        m.startRound(); m.phase='fight'; m.p1.state=m.p2.state='idle';
        m.p1.x=400; m.p2.x=900;
        return m;
      }
      function evolved(act=2,b='jotaro') {
        const m=fresh('johnny',b); m.p1.tuskAct=act; m.p1.corpseUnlocked=true; return m;
      }
      let m=fresh(), f=m.p1, target=m.p2;
      check(JG.CHAR_LIST.includes('johnny') && document.querySelector('[data-id="johnny"]'),'selectable roster');
      const meter=f.meter;
      for(const key of ['pLight','pHeavy','pSecond','pSpecial','pSuper','pHerb']) {
        f.nailCd=0; f.update(.01,target,{[key]:true},m);
      }
      check(m.tuskNails.length===6 && f.meter===meter && f.nailSlots.every(cd=>cd===0),'ACT1 attack keys unlimited and free');
      f.update(.1,target,{right:true,pUp:true},m);
      check(Math.abs(f.x-429)<.01 && f.onGround && f.vy===0,'mounted speed 290 without walking or jumping');
      const oldX=f.x; f.update(.1,target,{left:true,pDodge:true},m);
      check(f.x<oldX-100 && f.mounted && f.meter===meter,'F horse backward rush');
      m=fresh(); f=m.p1; target=m.p2; f.hitstun=1;
      f.update(.1,target,{pDodge:true},m);
      check(f.hitstun===0 && f.mounted && f.x<300 && f.meter===25 && f.burstCd>9,'F escape carries Johnny away with horse');
      m=fresh(); f=m.p1; target=m.p2;
      m.tuskRelic={x:f.x}; m.updateTuskWorld(.01);
      check(f.tuskAct===2 && f.corpseUnlocked,'first relic automatically evolves ACT2');
      f.update(.01,target,{pSpecial:true},m);
      check(!f.mounted && !m.tuskNails.length,'L dismounts instead of shooting after relic');
      const stationary=f.x;
      f.update(.2,target,{right:true,pUp:true},m);
      check(f.x===stationary && f.onGround,'dismounted Johnny cannot move');
      const before=f.hp;
      m.resolveHit(target,f,{damage:100,hitstun:1,knockback:300,lift:-600},{source:'projectile'});
      check(f.hp<before && f.hitstun===0 && f.blockstun===0 && f.vx===0 && f.vy===0,'dismounted damage without stun or knockback');
      f.nailCd=0; f.fireNail(m);
      check(m.tuskNails.at(-1).damage===44,'dismounted damage increases 15 percent');
      f.update(.01,target,{pSpecial:true},m);
      check(f.mounted && f.mountBoost===3,'mount grants exactly three seconds boost');
      const mountedX=f.x; f.update(.1,target,{right:true},m);
      check(Math.abs(f.x-mountedX-75)<.01,'mount boost speed 750');
      f.update(3.1,target,{},m); const ordinaryX=f.x; f.update(.1,target,{right:true},m);
      check(Math.abs(f.x-ordinaryX-29)<.01 && f.mountBoost===0,'mount boost expires');
      m=evolved(); f=m.p1; target=m.p2;
      for(let i=0;i<10;i++) {f.nailCd=0; check(f.fireNail(m),'independent nail shot '+(i+1));}
      f.nailCd=0;
      check(!f.fireNail(m) && f.nailSlots.every(cd=>cd===5),'ACT2 magazine exhausted after ten shots');
      f.update(2,target,{},m);
      check(f.nailSlots.every(cd=>cd===3) && !f.fireNail(m),'each nail cooldown lasts five seconds');
      f.nailSlots=[.1,.5,1,1.5,2,2.5,3,3.5,4,5]; f.update(.6,target,{},m);
      check(f.nailSlots.filter(cd=>cd<=0).length===2 && f.nailSlots[9]===4.4,'each nail recharges independently');
      f.nailSlots=Array(10).fill(4); f.burstCd=7; f.horseCd=1; f.nailCd=.3;
      f.update(.01,target,{pHerb:true},m);
      check(f.nailSlots.every(cd=>Math.abs(cd-.99)<.001) && f.burstCd<4.01 && f.horseCd===0 && f.nailCd===0,'G reduces nail and ability cooldowns by three');
      check(f.herbCd===8 && !f.drinkHerb(m),'herb has eight second reuse cooldown');
      m=evolved(); f=m.p1; target=m.p2; f.update(.01,target,{pLight:true},m);
      check(m.tuskNails.at(-1).damage===38 && !m.tuskNails.at(-1).strong,'ACT2 J normal nail');
      f.nailCd=0; f.update(.01,target,{pHeavy:true},m);
      check(m.tuskNails.at(-1).strong && m.tuskNails.at(-1).damage===105,'ACT2 K strong nail');
      m=evolved(3); f=m.p1; target=m.p2; f.fireNail(m,true);
      check(f.blueSpin>0,'ACT3 strong nail blue spin on hand');
      target.onGround=false; target.y=G.GROUND-160; const airHp=target.hp;
      for(let i=0;i<60;i++) m.updateTuskWorld(1/60);
      check(target.hp===airHp && m.tuskHoles.length===1,'jump avoids strong nail and leaves scar');
      target.onGround=true; target.y=G.GROUND; target.x=m.tuskHoles[0].x;
      m.updateTuskWorld(.01);
      check(target.hp<airHp,'scar damages grounded enemy');
      m.tuskHoles=[]; m.makeTuskHole({owner:f,act:3,x:400}); m.makeTuskHole({owner:f,act:3,x:900});
      f.x=400; f.update(.01,target,{pSecond:true},m);
      check(f.tuskHidden,'ACT3 H enters own holes');
      f.update(.01,target,{pRight:true},m);
      check(f.x===900 && f.vx===0,'ACT3 travel only between two holes');
      f.nailCd=0; m.tuskNails=[]; f.update(.01,target,{pLight:true},m);
      check(f.tuskHidden && m.tuskNails[0].x===400,'hand fires from other hole');
      f.update(.01,target,{pHeavy:true},m);
      check(!f.tuskHidden && m.tuskNails.at(-1).strong && f.blueSpin>0,'exit fires blue strong nail');
      f.x=900; f.update(.01,target,{pSecond:true},m); m.updateTuskWorld(7.1);
      check(!f.tuskHidden && !m.tuskHoles.length,'expiring holes safely eject Johnny');
      m=fresh(); f=m.p1; f.onGround=false;
      m.tuskRelicDelay=0; m.updateTuskWorld(.01);
      check(m.tuskRelic && !m.tuskSaints.length,'random relic with no premature saint');
      f.onGround=true; f.x=m.tuskRelic.x; m.updateTuskWorld(.01); f.saintDelay=0; f.onGround=false; m.updateTuskWorld(.01);
      check(m.tuskSaints.length===1,'saint appears after ACT2');
      f.onGround=true; f.x=m.tuskSaints[0].x; m.updateTuskWorld(.01);
      check(f.tuskAct===3,'saint guidance evolves ACT3');
      m.round=2; m.startRound();
      check(f.tuskAct===4 && f.corpseUnlocked && f.mounted && f.nailSlots.every(cd=>cd===0),'second round learns cavalry spin and ACT4');
      m=evolved(4); f=m.p1; target=m.p2; f.x=600; target.x=750;
      const barrageHp=target.hp;
      for(let i=0;i<40;i++) f.update(1/60,target,{heavy:true},m);
      check(target.hp<barrageHp-200 && f.state==='special','held K ACT4 high damage ORA barrage');
      m=evolved(4,'tooru'); f=m.p1; target=m.p2; f.meter=99;
      check(!f.fireInfiniteNail(m),'infinite rotation requires 100 meter');
      f.meter=100; f.nailSlots=Array(10).fill(5); f.nailCd=2; f.specialCd=8;
      check(f.fireInfiniteNail(m) && f.meter===0 && f.nailSlots.every(cd=>cd===5),'U spends 100 meter and bypasses ammo and cooldown');
      target.guarding=true; target.invuln=99; target.calamityGuard=10; target.wouDomain=10; target.onGround=false; target.y=G.GROUND-250;
      for(let i=0;i<120 && m.phase==='fight';i++) m.updateTuskTimeless(1/60);
      check(target.hp===0 && m.phase==='ko' && m.koWinner===0 && m.infiniteKO,'infinite rotation ignores guard jump invulnerability calamity and kills');
      m=evolved(4,'dio'); f=m.p1; target=m.p2; f.meter=100; target.meter=100;
      const location=f.x;
      check(m.beginSuper(target,target.data.special,80) && f.x===location && !f.frozen,'time stop does not stage or freeze ACT4');
      m.netplay=true; m.update(.1,[{right:true},{}]);
      check(f.x>location && !f.frozen,'ACT4 moves during stopped time');
      const timeHp=f.hp;
      for(let i=0;i<150;i++) m.update(1/60,[{},{}]);
      check(f.hp===timeHp && !m.super,'time stop finishes without freezing or damaging ACT4');
      m=evolved(4,'dio'); f=m.p1; target=m.p2; target.meter=100; f.meter=100;
      m.beginSuper(target,target.data.special,80); m.netplay=true;
      m.update(1/60,[{pSuper:true},{}]);
      check(m.infiniteNails.length===1 && f.meter===0,'U fires during stopped time');
      const start=m.infiniteNails[0].x;
      m.update(1/60,[{},{}]);
      check(m.infiniteNails[0].x!==start,'infinite nail travels during time stop');
      for(let i=0;i<80 && m.phase==='fight';i++) m.update(1/60,[{},{}]);
      check(target.hp===0 && !m.super && !f.frozen && m.phase==='ko','infinite rotation cancels time stop and completes KO');
      m=evolved(4,'dio'); f=m.p1; target=m.p2; f.meter=100; f.fireInfiniteNail(m); target.meter=100;
      m.beginSuper(target,target.data.super,100);
      for(let i=0;i<100 && m.phase==='fight';i++) m.update(1/60);
      check(target.hp===0 && m.phase==='ko' && !m.super,'already fired infinite nail cannot be stopped by other cinematics');
      m=evolved(4); f=m.p1; m.round=3; m.startRound();
      check(f.tuskAct===4 && !m.tuskNails.length && !m.infiniteNails.length && !m.infiniteKO,'round cleanup preserves ACT4');
      m=new G.Match('johnny','jotaro','training',0,0,4); m.startRound(); m.p1.tuskAct=4; m.p1.corpseUnlocked=true; m.resetTraining();
      check(m.p1.tuskAct===1 && !m.p1.corpseUnlocked && m.p1.mounted,'training reset restores ACT1 and mounted state');
      for(const id of JG.CHAR_LIST.filter(id=>id!=='johnny')) {
        const regression=fresh(id,id==='dio'?'jotaro':'dio');
        regression.p1.meter=100; regression.p1.specialMeter=50;
        regression.trySuper(regression.p1);
        for(let i=0;i<300;i++) regression.update(1/60);
        regression.render(G.ctx,5);
        check(Number.isFinite(regression.p1.hp) && Number.isFinite(regression.p2.hp),'existing character super/render regression '+id);
      }
      const twins=fresh('johnny','johnny'); twins.round=2; twins.startRound();
      check(twins.p1.tuskAct===4 && twins.p2.tuskAct===4,'mirror match independently evolves ACT4');
      const a=evolved(3,'johnny'),b=evolved(3,'johnny'); a.netplay=b.netplay=true;
      for(let i=0;i<360;i++) {
        const inputs=[{pLight:i%20===0,pHerb:i===180,pDodge:i===60},{pHeavy:i%30===0}];
        a.update(1/60,inputs); b.update(1/60,inputs);
      }
      const snap=m=>JSON.stringify({f:m.fighters.map(f=>[f.x,f.hp,f.meter,f.nailSlots,f.herbCd]),rng:m.rngState,
        holes:m.tuskHoles.map(h=>[h.x,h.life]),nails:m.tuskNails.map(n=>[n.x,n.y])});
      check(snap(a)===snap(b),'360 frames keep seeded simulations synchronized');
      G.App.mode='2p'; G.Input.clear(); G.Input.press('KeyG'); G.Input.press('Digit6');
      check(G.humanInput(0).pHerb && G.humanInput(1).pHerb,'G and P2 6 inputs mapped'); G.Input.clear();
      G.startMatch('johnny','johnny',{seed:42});
      const game=G.App.game; game.phase='fight'; game.p1.state=game.p2.state='idle';
      game.p1.tuskAct=3; game.p1.corpseUnlocked=true; game.p1.mounted=false; game.p1.blueSpin=1; game.p1.nailPose=.5;
      game.p2.tuskAct=4; game.p2.corpseUnlocked=true;
      G.render(1);
      return checks;
    });
    await page.screenshot({path:'/tmp/jojo-johnny-battle.png'});
    await page.evaluate(()=>{
      const G=JG.Game; G.startMatch('johnny','dio'); const m=G.App.game;
      m.phase='fight'; m.p1.state=m.p2.state='idle'; m.p1.tuskAct=4; m.p1.meter=100;
      m.p1.fireInfiniteNail(m);
      for(let i=0;i<100 && m.phase==='fight';i++) m.updateTuskTimeless(1/60);
      m.finisher=null; m.outroTime=.6; G.dom.announce.classList.remove('show','pop'); G.render(3);
    });
    await page.screenshot({path:'/tmp/jojo-johnny-infinite.png'});
    await page.evaluate(()=>{JG.Game.showSelect('2p'); JG.Game.render(2);});
    await page.screenshot({path:'/tmp/jojo-johnny-roster.png'});
    assert.deepEqual(errors,[]);
    console.log(`${results.length} checks passed:\n${results.join('\n')}`);
    // Mobile: actual touch button emits the same G action as keyboard/netplay.
    const mobile=await browser.newContext({viewport:{width:915,height:412},hasTouch:true,isMobile:true});
    const touch=await mobile.newPage();
    touch.on('pageerror',e=>errors.push(e.message));
    await touch.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
    await touch.goto(process.env.GAME_URL || 'http://127.0.0.1:8081');
    await touch.waitForFunction(()=>window.JG?.Game?.App?.startMatch);
    await touch.evaluate(()=>{const G=JG.Game; G.App.mode='1p'; G.startMatch('johnny','dio'); G.App.game.p1.tuskAct=2; G.App.game.p1.nailSlots=Array(10).fill(5); G.App.game.phase='fight'; G.App.game.p1.state=G.App.game.p2.state='idle'; G.dom.announce.classList.remove('show','pop'); G.render(1);});
    const button=touch.locator('[data-touch-key="herb"]');
    await button.tap();
    assert.equal(await touch.evaluate(()=>JG.Game.humanInput(0).pHerb),true);
    await touch.screenshot({path:'/tmp/jojo-johnny-mobile.png'});
    assert.deepEqual(errors,[]);
    console.log('Mobile herb touch input passed');
    await mobile.close();
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
