// NODE_PATH=<Playwright node_modules> node tests/touch-layout.cjs
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const keys = ['stick', 'light', 'heavy', 'special', 'follow', 'super', 'dodge'];
  async function open(viewport, saved, version) {
    const page = await browser.newPage({viewport, hasTouch:true, isMobile:true});
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(({saved,version}) => {
      window.requestAnimationFrame = () => 0;
      if (saved) localStorage.setItem('jojo-touch-layout', JSON.stringify(saved));
      if (version) localStorage.setItem('jojo-touch-layout-version', version);
    }, {saved,version});
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8081');
    await page.waitForFunction(() => window.JG?.Game?.startMatch);
    await page.evaluate(() => {
      const G = JG.Game; G.App.mode='1p'; G.startMatch('jotaro','dio');
      const m=G.App.game; m.phase='fight'; m.p1.state=m.p2.state='idle';
      G.dom.announce.classList.remove('show','pop'); G.render(1);
    });
    await page.locator('#touch-controls').waitFor({state:'visible'});
    return page;
  }
  async function rects(page) {
    return page.evaluate(keys => Object.fromEntries(keys.map(key => {
      const r = document.querySelector(`[data-touch-key="${key}"]`).getBoundingClientRect();
      return [key, {x:r.x,y:r.y,width:r.width,height:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2}];
    })), keys);
  }
  try {
    for (const [width,height] of [[1341,1097],[915,412],[844,390],[568,320]]) {
      const page=await open({width,height}); const r=await rects(page);
      assert.ok(r.light.width > r.heavy.width * 1.5, 'large light attack');
      assert.ok(r.dodge.cx < r.heavy.cx && r.heavy.cx < r.light.cx, 'bottom row: dodge, heavy, light');
      assert.ok(r.super.cy < r.follow.cy && r.follow.cy < r.special.cy && r.special.cy < r.light.cy, 'skill arc order');
      assert.ok(r.follow.cx > r.super.cx && r.follow.cx > r.special.cx, 'skill 2 on right side of arc');
      for (const [key,rect] of Object.entries(r)) {
        assert.ok(rect.x >= 7 && rect.y >= 7 && rect.x+rect.width <= width-7 && rect.y+rect.height <= height-7, `${key} inside ${width}x${height}`);
        for (const [other,b] of Object.entries(r)) if (key !== other) {
          assert.ok(Math.hypot(rect.cx-b.cx, rect.cy-b.cy) >= (rect.width+b.width)/2, `${key} and ${other} do not overlap`);
        }
      }
      await page.screenshot({path:`/tmp/jojo-touch-layout-${width}x${height}.png`});
      await page.close(); console.log(`${width}x${height}: arc, sizes, bounds and spacing passed`);
    }
    const saved={light:{x:-.1,y:-.1,scale:1.25},heavy:{x:0,y:0,scale:1}};
    const old=await open({width:915,height:412},{light:{x:0,y:0,scale:1}});
    const current=await open({width:915,height:412},saved);
    const before=await rects(old), after=await rects(current);
    assert.equal(await current.locator('.touch-attack').evaluate(el=>getComputedStyle(el).display),'flex');
    for(const key of keys) {
      const item=saved[key] || {x:0,y:0,scale:1};
      const expected={width:before[key].width*item.scale,height:before[key].height*item.scale};
      expected.x=before[key].x+item.x*915-(expected.width-before[key].width)/2;
      expected.y=before[key].y+item.y*412-(expected.height-before[key].height)/2;
      for(const property of ['x','y','width','height']) {
        assert.ok(Math.abs(expected[property]-after[key][property])<1, `legacy ${key} ${property} preserved`);
      }
    }
    await current.locator('#btn-touch-layout-edit').evaluate(el=>el.click());
    await current.locator('#btn-touch-layout-reset').evaluate(el=>el.click());
    assert.equal(await current.locator('#touch-controls').evaluate(el=>el.classList.contains('legacy-layout')),false);
    assert.equal(await current.evaluate(()=>localStorage.getItem('jojo-touch-layout-version')),'2');
    const reset=await rects(current);assert.ok(reset.light.width>reset.heavy.width*1.5,'reset restores new default');
    await current.locator('#btn-touch-layout-done').evaluate(el=>el.click());
    const modern={light:{x:-.05,y:0,scale:1.1}};
    const newSaved=await open({width:915,height:412},modern,'2');
    assert.equal(await newSaved.locator('#touch-controls').evaluate(el=>el.classList.contains('legacy-layout')),false);
    assert.ok((await rects(newSaved)).light.width > reset.light.width,'new default custom scale restored');
    await Promise.all([old.close(),current.close(),newSaved.close()]);
    assert.deepEqual(errors,[]);
    console.log('Saved layouts preserved; reset and new custom layout restoration passed');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
