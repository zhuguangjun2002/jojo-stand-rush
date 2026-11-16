/* Deployment endpoints.
 *
 * A local ./run.sh server still uses same-origin /__ws for LAN play.
 * When the page is served from a static host (Cloudflare Pages), net.js
 * falls back to this WebSocket relay so two browsers can play online.
 * Set onlineWs to '' to disable online play for a static build.
 */
window.JG_CONFIG = {
  onlineWs: 'wss://ws.jojo.bigcow.net/__ws',
  // Initial frames of input delay for online play (60 fps). Before a match
  // starts, Net.recommendedDelay() raises or lowers this from the measured
  // round trip (roughly RTT/2 + 3 frames, clamped to 6-24).
  onlineInputDelay: 12
};
