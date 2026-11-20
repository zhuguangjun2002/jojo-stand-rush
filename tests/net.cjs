// Deterministic virtual network: actual browser Net + actual Cloudflare Room.
// No dependencies, credentials, live rooms or real-time sleeps required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/net.js'), 'utf8');

(async () => {
  const { Room } = await import(pathToFileURL(path.join(root, 'worker/src/index.mjs')));
  function simulate({ rtts = [200, 200], hz = [60, 60], jitter = 0, actions = [], seconds = 20 } = {}) {
    let now = 0;
    let sequence = 0;
    const events = [];
    const schedule = (t, run) => events.push({ t, run, sequence: sequence++ });
    const room = new Room({ storage: { deleteAlarm: async () => {}, setAlarm: async () => {} } }, {});
    const roles = ['host', 'guest'];
    const upstreamAt = [0, 0], downstreamAt = [0, 0];
    const clients = roles.map((role, index) => {
      let sampled = 0;
      const pressed = new Set();
      const JG = { Game: { humanInput: () => ({ left: (++sampled % 7) < 3, pLight: sampled % 17 === 0 }), Input: { pressed } } };
      vm.runInNewContext(source, { window: { JG }, performance: { now: () => now }, console });
      const net = JG.Net;
      net.usingRemote = true;
      net.role = role;
      net.rtt = rtts[index];
      net.peerRtt = rtts[1 - index];
      net.peerConnected = true;
      net.manualClose = true; // delay changes are explicit test actions
      net.hash = 0;
      net.hashes = [];
      net.maxSteps = 0;
      net.stepTimes = [];
      const transit = () => rtts[index] / 2 + (jitter ? (sequence % 5) * jitter / 4 : 0);
      const socket = { send(raw) {
        const arrival = downstreamAt[index] = Math.max(downstreamAt[index], now + transit());
        schedule(arrival, () => {
          if (net.ws.readyState === 1) net.handleMessage(JSON.parse(raw));
        });
      } };
      net.ws = { readyState: 1, send(raw) {
        const arrival = upstreamAt[index] = Math.max(upstreamAt[index], now + transit());
        schedule(arrival, () => {
          if (net.ws.readyState === 1) room.onMessage(role, socket, raw);
        });
      } };
      room.clients[role] = socket;
      net.testSocket = socket;
      return net;
    });
    clients.forEach(net => net.setInputDelay(Math.max(...clients.map(c => c.recommendedDelay()))));
    clients.forEach((net, index) => {
      let previous = 0;
      const tick = () => {
        const steps = net.advance((now - previous) / 1000, (step, inputs) => {
          assert.equal(step, 1 / 60);
          net.hash = ((net.hash * 31) ^ JSON.stringify(inputs).split('').reduce((a, c) => a + c.charCodeAt(0), 0)) | 0;
          net.hashes.push(net.hash);
          net.stepTimes.push(now);
        });
        previous = now;
        net.maxSteps = Math.max(net.maxSteps, steps);
        schedule(now + 1000 / hz[index], tick);
      };
      schedule(0, tick);
    });
    actions.forEach(action => schedule(action.at, () => action.run({ clients, room, now })));
    while (events.length) {
      events.sort((a, b) => a.t - b.t || a.sequence - b.sequence);
      const event = events.shift();
      if (event.t > seconds * 1000 + 1e-6) break;
      now = event.t;
      event.run();
    }
    // Both simulations must have consumed exactly the same ordered inputs
    // through their common frame, even if rAF phases leave one a frame ahead.
    const common = Math.min(...clients.map(c => c.nextFrame));
    assert.ok(Math.abs(clients[0].nextFrame - clients[1].nextFrame) <= Math.ceil(Math.max(...rtts) / (1000 / 60)) + 4);
    assert.equal(clients[0].hashes[common - 1], clients[1].hashes[common - 1], 'same input history at the same frame');
    assert.ok(common > 0);
    return clients;
  }

  for (const rtt of [20, 100, 200, 300, 400]) {
    const clients = simulate({ rtts: [rtt, rtt] });
    clients.forEach(c => {
      assert.ok(c.nextFrame >= 1200 - Math.ceil(rtt / (1000 / 60)) - 4, `RTT ${rtt}: ${c.nextFrame} frames`);
      assert.ok(c.nextFrame <= 1201, 'must not speed up');
      assert.ok(c.simulationFps > 59 && c.simulationFps < 61);
      assert.equal(c.waitPercent, 0);
    });
    console.log(`PASS RTT ${rtt}ms: ${clients[0].nextFrame} frames / 20s, ${clients[0].simulationFps.toFixed(1)} simulation FPS`);
  }
  for (const hz of [[30, 60], [60, 144], [144, 144]]) {
    const clients = simulate({ hz, rtts: [80, 300], jitter: 20 });
    clients.forEach(c => {
      assert.ok(c.nextFrame > 1150 && c.nextFrame <= 1201, `refresh ${hz}: ${c.nextFrame}`);
      assert.ok(c.simulationFps > 58 && c.simulationFps < 62);
    });
    console.log(`PASS asymmetric RTT + jitter, displays ${hz.join('/')}Hz`);
  }
  const changed = simulate({ actions: [
    { at: 3000, run: ({ clients }) => {
      clients[0].send({ type: 'delay', delay: 24 }); clients[0].applyDelay(24);
    } },
    { at: 7000, run: ({ clients }) => {
      clients[0].send({ type: 'delay', delay: 15 }); clients[0].applyDelay(15);
    } }
  ] });
  changed.forEach(c => assert.ok(c.nextFrame > 1160 && c.nextFrame <= 1201));
  console.log('PASS live delay increase/decrease without gaps or acceleration');

  const reconnected = simulate({ actions: [
    { at: 5000, run: ({ clients, room }) => {
      clients[1].ws.readyState = 0;
      clients.forEach(c => { c.peerConnected = false; });
      room.clients.guest = null;
    } },
    { at: 8000, run: ({ clients, room }) => {
      room.clients.guest = clients[1].testSocket;
      clients[1].ws.readyState = 1;
      clients.forEach(c => { c.peerConnected = true; });
      clients[1].send({ type: 'resume', frame: clients[1].nextFrame });
      clients[1].resendPendingInputs();
    } }
  ] });
  reconnected.forEach(c => {
    assert.ok(c.nextFrame > 950 && c.nextFrame < 1030, 'disconnect must freeze, not fast-forward');
    assert.ok(c.maxSteps <= 2);
  });
  console.log('PASS disconnect, relay history replay and pending input resend');

  const net = simulate({ seconds: 1 })[0];
  net.rttSamples = [100, 100, 350, 100, 100]; net.peerRttSamples = [];
  net.rtt = 100; net.peerRtt = 100;
  assert.equal(net.recommendedDelay(), 24, 'recent spike must contribute to budget');
  net.rtt = 1000;
  assert.equal(net.recommendedDelay(), 30, 'protocol-compatible maximum');
  net.resetFrames();
  assert.equal(net.clock, 0); assert.equal(net.simulationFps, null); assert.equal(net.sentTimes.size, 0);
  net.ws = { readyState: 1, send() { throw new Error('send failed'); } };
  net.inputDelay = 0;
  net.sentFrame = -1;
  net.sendNextInput();
  assert.equal(net.sentFrame, -1, 'failed send must remain retryable');
  console.log('PASS peak budget, delay limit, reset and failed sends');
})().catch(error => { console.error(error); process.exitCode = 1; });
