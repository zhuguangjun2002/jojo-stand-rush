// Start server.py on 127.0.0.1:8081, then run with playwright-core on NODE_PATH.
// Two headless browser processes; virtual WebSockets run the actual Room relay
// with 100ms each way. No production rooms or Cloudflare credentials are used.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');

(async () => {
  const { Room } = await import(pathToFileURL(path.resolve(__dirname, '../worker/src/index.mjs')));
  const room = new Room({ storage: { deleteAlarm: async () => {}, setAlarm: async () => {} } }, {});
  const browsers = [];
  const timers = new Set();
  const errors = [];
  const later = fn => {
    const timer = setTimeout(() => { timers.delete(timer); fn(); }, 100);
    timers.add(timer);
  };
  try {
    for (let i = 0; i < 2; i++) browsers.push(await chromium.launch({ headless: true }));
    const pages = await Promise.all(browsers.map(browser => browser.newPage({ viewport: { width: 1440, height: 1000 } })));
    for (const page of pages) {
      page.on('pageerror', error => errors.push(error.message));
      await page.routeWebSocket('**/test-relay?*', route => {
        const role = new URL(route.url()).searchParams.get('role');
        const otherRole = role === 'host' ? 'guest' : 'host';
        const socket = { send: raw => later(() => route.send(raw)) };
        room.clients[role] = socket;
        room.send(socket, { type: 'ready', role, room: 'TEST', peer: !!room.clients[otherRole], delay: 12 });
        if (room.clients[otherRole]) room.send(room.clients[otherRole], { type: 'peer', connected: true });
        route.onMessage(raw => later(() => room.onMessage(role, socket, raw)));
      });
      await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8081');
      await page.waitForFunction(() => window.JG?.Game?.App?.startMatch && JG.Server.online !== null);
      await page.evaluate(() => {
        JG.Server.online = false;
        JG.Config.onlineWs = 'ws://127.0.0.1:8081/test-relay';
        const G = JG.Game;
        window.netSnapshots = {};
        const update = G.Match.prototype.update;
        G.Match.prototype.update = function (step, inputs) {
          update.call(this, step, inputs);
          if (G.App.mode === 'net') {
            netSnapshots[JG.Net.nextFrame] = JSON.stringify({
              phase: this.phase, timer: this.timer,
              fighters: [this.p1, this.p2].map(f => ({ x: f.x, y: f.y, hp: f.hp, meter: f.meter, state: f.state }))
            });
          }
        };
      });
    }
    await pages[0].click('#btn-net');
    await pages[0].evaluate(() => JG.Net.host('TEST'));
    await pages[0].waitForFunction(() => JG.Net.connectedOnce);
    await pages[1].click('#btn-net');
    await pages[1].evaluate(() => JG.Net.join('TEST'));
    await Promise.all(pages.map(page => page.waitForFunction(() => JG.Net.peerConnected && JG.Game.App.screen === 'select')));
    await Promise.all(pages.map(page => page.waitForFunction(() => JG.Net.rtt > 150)));
    await pages[0].evaluate(() => JG.Game.selectCharacter('jotaro'));
    await pages[1].evaluate(() => JG.Game.selectCharacter('dio'));
    await Promise.all(pages.map(page => page.waitForFunction(() => JG.Game.App.screen === 'fight')));
    await pages[0].keyboard.down('KeyD');
    await pages[1].keyboard.down('KeyA');
    await Promise.all(pages.map(page => page.waitForFunction(() => JG.Net.nextFrame >= 360, null, { timeout: 15000 })));
    await pages[0].keyboard.up('KeyD');
    await pages[1].keyboard.up('KeyA');
    await pages[0].keyboard.press('KeyJ');
    await Promise.all(pages.map(page => page.waitForFunction(() => JG.Net.nextFrame >= 430, null, { timeout: 10000 })));
    const reports = await Promise.all(pages.map(page => page.evaluate(() => ({
      info: JG.Net.latencyInfo(), hud: document.getElementById('net-latency').textContent,
      snapshot: netSnapshots[400], frame: JG.Net.nextFrame
    }))));
    assert.equal(reports[0].snapshot, reports[1].snapshot, 'same-frame fighter state must match');
    for (const report of reports) {
      assert.ok(report.info.delay >= 15 && report.info.delay <= 30);
      assert.ok(report.info.simulationFps > 50 && report.info.simulationFps < 65, JSON.stringify(report));
      assert.ok(report.hud.includes('模拟') && report.hud.includes('等待'));
      assert.ok(report.info.inputRtt >= 190);
    }
    assert.deepEqual(errors, []);
    await pages[0].screenshot({ path: '/tmp/jojo-net-diagnostics.png' });
    console.log('PASS two browsers, 200ms relay RTT, real main loop, character selection, movement/attack, same-frame state and diagnostics');
    console.log(JSON.stringify(reports.map(r => ({ ...r.info, frame: r.frame, hud: r.hud })), null, 2));
  } finally {
    timers.forEach(clearTimeout);
    await Promise.all(browsers.map(browser => browser.close()));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
