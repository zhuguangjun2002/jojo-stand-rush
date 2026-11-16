/* =========================================================
   JOJO 奇妙格斗 · STAND RUSH — render dispatcher
   Picks which screen to draw; the actual art lives in js/art.js.
   ========================================================= */
(function (G) {
  'use strict';
  const { App, Art, H, JG, W, ctx, updateHUD } = G;

  /* =========================================================
     Render dispatcher
     ========================================================= */
  function renderSelectBG(t) {
    ctx.fillStyle = '#08060d';
    ctx.fillRect(0, 0, W, H);
    const focused = JG.CHARACTERS[JG.CHAR_LIST[App.focusIndex]] || JG.CHARACTERS.jotaro;
    ctx.save();
    ctx.globalAlpha = 0.28;
    Art.drawStage(ctx, focused.stage, t * 0.35);
    ctx.restore();

    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(8,6,13,.92)');
    g.addColorStop(0.5, 'rgba(8,6,13,.6)');
    g.addColorStop(1, 'rgba(8,6,13,.94)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    Art.drawSpeedLines(ctx, focused.accent, 0.13, App.focusIndex + 4, 48);
    ctx.save();
    ctx.globalAlpha = 0.09;
    Art.starPath(ctx, 1090, 260, 320, 112, 11);
    ctx.fillStyle = focused.accent;
    ctx.fill();
    ctx.restore();
  }

  function render(t) {
    ctx.setTransform(G.DPR, 0, 0, G.DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#08060d';
    ctx.fillRect(0, 0, W, H);

    const under = App.screen === 'help' ? App.underScreen : App.screen;
    if (under === 'title') {
      Art.drawTitleScene(ctx, t);
    } else if (under === 'select') {
      renderSelectBG(t);
    } else if (under === 'fight' || under === 'result') {
      if (App.game) {
        App.game.render(ctx, t);
        if (under === 'fight') updateHUD(App.game);
      }
    } else {
      ctx.fillStyle = '#08060d';
      ctx.fillRect(0, 0, W, H);
      Art.drawSpeedLines(ctx, '#f2e7d2', 0.08, 42, 30);
    }
  }

  Object.assign(G, { renderSelectBG, render });
})(window.JG.Game);
