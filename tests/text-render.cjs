// NODE_PATH=<Playwright node_modules> node tests/text-render.cjs
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    for (const ratio of [1, 2]) {
      const page = await browser.newPage({ deviceScaleFactor: ratio });
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
      await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8081');
      await page.waitForFunction(() => window.JG?.Game?.startMatch);
      const checks = await page.evaluate(() => {
        const G = JG.Game, checks = [];
        const check = (value, name) => { if (!value) throw Error(name); checks.push(name); };
        const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 300;
        const ctx = canvas.getContext('2d');
        let strokes = 0;
        const originalStroke = CanvasRenderingContext2D.prototype.strokeText;
        CanvasRenderingContext2D.prototype.strokeText = function (...args) {
          strokes++; return originalStroke.apply(this, args);
        };
        try {
          const draw = (text, color = '#fff4d0', outline) => G.Art.drawMangaText(ctx, text, 500, 150, 32, color, 0, 1, outline);
          for (let i = 0; i < 120; i++) G.Art.drawMangaText(ctx, '缓存命中 CHECK', 200 + i, 150, 32, '#fff4d0', i / 100, 1 - i / 200, undefined, 1 + i / 1000);
          check(strokes === 1, 'moving, rotating, fading and scaling reuse one raster');
          draw('缓存命中 CHECK', '#ff0000'); draw('缓存命中 CHECK', '#ff0000', '#ffffff');
          check(strokes === 3, 'fill and outline colors have independent sprites');
          const m = new G.Match('jotaro', 'dio', '1p', 0, 0, 123);
          m.texts = [{text:'浮字缩放 POP', x:500, y:150, size:32, color:'#fff', rot:0, life:1, max:1}];
          const beforePop = strokes;
          for (let i = 0; i < 60; i++) { m.texts[0].life = 1 - i / 100; m.drawTexts(ctx); }
          check(strokes - beforePop === 1, 'floating text pop animation does not create per-frame sprites');
          ctx.globalAlpha = .45; ctx.font = '18px serif'; ctx.translate(17, 19);
          const transform = ctx.getTransform(); draw('状态保持');
          check(ctx.globalAlpha === .45 && ctx.font === '18px serif' && ctx.getTransform().e === transform.e && ctx.getTransform().f === transform.f, 'drawing preserves caller context');
          ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha = 1;
          const bounds = () => {
            const data = ctx.getImageData(0,0,1000,300).data;
            let left=1000, right=-1, top=300, bottom=-1;
            for(let y=0;y<300;y++) for(let x=0;x<1000;x++) if(data[(y*1000+x)*4+3]) {
              left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
            }
            return [left,top,right,bottom];
          };
          for (const label of ['命中！欧拉', 'ACT4 · gyp É', '∞ 帰零 20m']) {
            ctx.clearRect(0,0,1000,300); draw(label); const cached = bounds();
            ctx.clearRect(0,0,1000,300);ctx.font='900 32px "Microsoft YaHei", "Arial Black", sans-serif';
            ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=3.84;
            ctx.strokeStyle='#0b0812';ctx.fillStyle='#fff4d0';
            originalStroke.call(ctx,label,500,150);ctx.fillText(label,500,150);
            const reference = bounds();
            check(cached.every((v,i)=>Math.abs(v-reference[i])<=2), 'glyph bounds preserved: '+label);
          }
          draw('逐出检查'); const beforeEviction = strokes;
          for(let i=0;i<140;i++) draw('不同伤害 '+i);
          draw('逐出检查');
          check(strokes === beforeEviction + 141, 'bounded cache evicts old labels');
          const largeLabel = '宽'.repeat(25);
          const drawLarge = i => G.Art.drawMangaText(ctx, largeLabel + i, 500, 150, 48, '#fff');
          drawLarge(0); const beforePixels = strokes;
          for (let i = 1; i <= 50; i++) drawLarge(i);
          drawLarge(0);
          check(strokes === beforePixels + 51, 'pixel budget evicts large sprites before entry limit');
          draw('字体更新'); const beforeFonts = strokes;
          document.fonts.dispatchEvent(new Event('loadingdone')); draw('字体更新');
          check(strokes === beforeFonts + 1, 'font loading invalidates cached glyphs');
          G.App.mode = '1p'; G.startMatch('johnny', 'tooru');
          const match = G.App.game;match.phase='fight';match.p1.state=match.p2.state='idle';
          G.updateHUD(match);
          const observer = new MutationObserver(() => {});
          observer.observe(document.getElementById('skill-bar'), {subtree:true,childList:true,attributes:true,characterData:true});
          for(let i=0;i<120;i++) G.updateHUD(match);
          check(observer.takeRecords().length === 0, 'unchanged desktop HUD performs no DOM mutations');observer.disconnect();
          G.render(1);
          return checks;
        } finally { CanvasRenderingContext2D.prototype.strokeText = originalStroke; }
      });
      console.log(`DPR ${ratio}: ${checks.length} text rendering checks passed`);
      await page.screenshot({path:`/tmp/jojo-text-cache-dpr${ratio}.png`});
      await page.close();
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
