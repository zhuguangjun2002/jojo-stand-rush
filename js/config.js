/* Deployment endpoints.
 *
 * A local ./run.sh server still uses same-origin /__ws for LAN play.
 * When the page is served from a static host (Cloudflare Pages), net.js
 * falls back to this WebSocket relay so two browsers can play online.
 * Set onlineWs to '' to disable online play for a static build.
 */
window.JG_CONFIG = {
  onlineWs: 'wss://ws.jojo.bigcow.net/__ws',
  // Frames of input delay for online play (60 fps). It hides roughly one
  // network round trip so the lockstep does not stall at internet latency.
  // Raise to 15-20 for high-latency links, lower to 6-8 for nearby players.
  onlineInputDelay: 12
};
