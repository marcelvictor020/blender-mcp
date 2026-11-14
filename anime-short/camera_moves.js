// Cinematic camera layer applied on top of every shot (disabled with ?static, which the compare tools use).
// zoom: lens punch-in (2D, >= 1), yaw/pitch: degrees (3D camera pan/tilt), roll: degrees (2D), dolly: metres along view,
// hand: handheld drift amplitude (deg), rumble: { from, to, amp (deg), freq } camera shake e.g. when a train passes.
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10));
const lerp = (a, b, t) => a + (b - a) * t;
const D = Math.PI / 180;

export const BARS = 0.055;   // letterbox (fraction of height, top and bottom)

export const MOVES = {
  1: { zoom: [1.04, 1.13], pitch: [-0.2, 0.5], yaw: [0.3, -0.3], hand: 0.05, rumble: { from: 1.2, to: 4, amp: 0.1, freq: 12 } },
  2: { zoom: [1.12, 1.04], pitch: [0.3, -0.1], roll: [0, 0.6], hand: 0.06, rumble: { from: 0.4, to: 3, amp: 0.05, freq: 9 } },
  3: { zoom: [1.05, 1.1], yaw: [0.6, -0.6], hand: 0.04 },
  4: { zoom: [1.04, 1.1], yaw: [-0.2, 0.8], dolly: [0, 0.35], hand: 0.05 },
  5: { zoom: [1.12, 1.05], pitch: [0.4, -0.3], hand: 0.05 },
  6: { zoom: [1.03, 1.11], dolly: [0, 0.3], hand: 0.04 },
  7: { zoom: [1.06, 1.08], hand: 0.12, rumble: { from: 0, to: 2.7, amp: 0.14, freq: 10 } },
  8: { zoom: [1.16, 1.02], roll: [0, -2.0], hand: 0.0, twoD: true },
};

const wob = (t, s) => Math.sin(t * 0.9 + s) * 0.6 + Math.sin(t * 1.7 + s * 2.3) * 0.3 + Math.sin(t * 3.1 + s * 0.7) * 0.1;

export function cameraMove(shotNo, t, dur) {
  const m = MOVES[shotNo] || {};
  const k = ease(t / dur);
  const r = (a) => (a ? lerp(a[0], a[1], k) : 0);
  let yaw = r(m.yaw), pitch = r(m.pitch);
  const h = m.hand || 0;
  yaw += h * wob(t, 1.3); pitch += h * wob(t, 4.1);
  let roll = r(m.roll) + h * 0.5 * wob(t, 7.7);
  if (m.rumble && t >= m.rumble.from && t <= m.rumble.to) {
    const e = Math.min(1, (t - m.rumble.from) / 0.5) * Math.min(1, (m.rumble.to - t) / 0.4);
    const f = m.rumble.freq;
    pitch += m.rumble.amp * e * (Math.sin(t * f * 6.28) * 0.6 + Math.sin(t * f * 1.37 * 6.28) * 0.4);
    yaw += m.rumble.amp * e * 0.5 * Math.sin(t * f * 0.83 * 6.28 + 1.0);
  }
  return { zoom: r(m.zoom) || 1, yaw: yaw * D, pitch: pitch * D, roll: roll * D, dolly: r(m.dolly), twoD: !!m.twoD };
}
