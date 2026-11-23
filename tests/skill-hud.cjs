// NODE_PATH=<Playwright node_modules> node tests/skill-hud.cjs
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 915, height: 412 } : { width: 1440, height: 1000 },
        hasTouch: mobile, isMobile: mobile
      });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
      await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8081');
      await page.waitForFunction(() => window.JG?.Game?.App?.startMatch);
      const checks = await page.evaluate(mobile => {
        const G = JG.Game, checks = [];
        const check = (value, name) => { if (!value) throw Error(name); checks.push(name); };
        const start = (a, b = 'dio', mode = '1p') => {
          G.App.mode = mode; G.startMatch(a, b);
          const m = G.App.game;
          m.phase = 'fight'; m.p1.state = m.p2.state = 'idle';
          G.updateHUD(m); return m;
        };
        const button = key => document.querySelector(`[data-touch-key="${key}"]`);
        const visible = el => getComputedStyle(el).display !== 'none';
        let m = start('jotaro');
        const cells = () => [...document.querySelectorAll('.skill-row:first-child .skill-cell')];
        check(visible(document.getElementById('skill-bar')) === !mobile, 'desktop bar visibility');
        if (!mobile) {
          check(cells().map(el => el.querySelector('kbd').textContent).join(',') === 'J,K,L,H,U,F,G', 'default desktop keys');
          check(!visible(cells()[6]), 'desktop herb hidden for other characters');
        } else {
          check(!visible(button('herb')), 'mobile herb hidden for other characters');
          check(['light','heavy','special','follow','super'].map(key => button(key).firstChild.textContent).join(',') === '轻,重,技1,技2,大招', 'mobile button labels');
        }
        m.p1.specialCd = 7.25; m.p1.secondCd = 3.14; G.updateHUD(m);
        const status = (i, key) => mobile ? button(key).querySelector('small').textContent : cells()[i].querySelector('small').textContent;
        check(status(2, 'special') === '7.3s' && status(3, 'follow') === '3.2s', 'live skill cooldowns');
        m.p1.specialCd = m.p1.secondCd = 0; G.updateHUD(m);
        check(status(2, 'special') === '就绪', 'cooldown returns to ready');
        m = start('josuke'); m.p1.bubbleCd = 3.5; m.p1.bubbleCharges = 0; G.updateHUD(m);
        check(status(2, 'special') === '3.5s', 'bubble recharge uses actual timer');
        m.p1.goBeyond = true; m.p1.specialCd = 6; G.updateHUD(m);
        check(status(2, 'special') === '6.0s', 'evolved bubble uses skill cooldown');
        m = start('johnny'); m.p1.tuskAct = 2; m.p1.nailSlots = Array(10).fill(4); m.p1.herbCd = 8; G.updateHUD(m);
        check(status(0, 'light') === '4.0s' && status(1, 'heavy') === '4.0s', 'empty nails show next recharge');
        check(status(6, 'herb') === '8.0s', 'Johnny herb cooldown');
        if (mobile) check(visible(button('herb')), 'Johnny herb visible');
        else check(visible(cells()[6]), 'Johnny desktop herb visible');
        m.p1.drinkHerb(m); // Still cooling, so this must not reset its timer.
        G.updateHUD(m); check(status(6, 'herb') === '8.0s', 'display does not alter gameplay cooldown');
        m = start('jotaro', 'johnny', '2p');
        check(mobile ? !visible(button('herb')) : !visible(cells()[6]), 'opponent Johnny does not expose local herb');
        if (!mobile) {
          const row = document.querySelector('.skill-row:nth-child(2)');
          check(visible(row) && row.querySelector('kbd').textContent === '1', 'P2 desktop controls');
          G.setKeyBinding('p1', 'special', 'KeyQ'); G.updateHUD(m);
          check(cells()[2].querySelector('kbd').textContent === 'Q', 'custom desktop bindings');
        }
        G.App.mode = 'net'; JG.Net.localIndex = 1; G.updateHUD(m);
        check(status(6, 'herb') === 'ACT2解锁', 'network HUD follows local fighter');
        if (mobile) check(visible(button('herb')), 'network guest Johnny herb visible');
        G.showSelect('1p');
        check(!visible(document.getElementById('skill-bar')), 'skill bar hidden after leaving fight');
        return checks;
      }, mobile);
      console.log(`${mobile ? 'Mobile' : 'Desktop'}: ${checks.length} HUD checks passed`);
      await page.evaluate(() => {
        const G = JG.Game;
        G.App.mode = '1p'; G.startMatch('johnny', 'dio');
        const m = G.App.game; m.phase = 'fight'; m.p1.state = m.p2.state = 'idle';
        m.p1.tuskAct = 2; m.p1.herbCd = 5.4; m.p1.nailSlots = Array(10).fill(2.1);
        G.dom.announce.classList.remove('show', 'pop'); G.render(1);
      });
      if (mobile) {
        for (const [key, action] of [['light','pLight'], ['heavy','pHeavy'], ['special','pSpecial'], ['follow','pSecond'], ['super','pSuper'], ['herb','pHerb']]) {
          await page.evaluate(() => JG.Game.Input.clear());
          await page.locator(`[data-touch-key="${key}"]`).tap();
          assert.equal(await page.evaluate(action => JG.Game.humanInput(0)[action], action), true, `${key} touch mapping`);
        }
      }
      await page.screenshot({ path: `/tmp/jojo-skill-hud-${mobile ? 'mobile' : 'desktop'}.png` });
      await context.close();
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
