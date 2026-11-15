// world_town_high (6 s) — COLD OPEN: high new angle over the golden-hour rail town; the commuter train crosses the viaduct.
// Reuses shot 1's viaduct + train inside the procedural town kit (town.js). Slow crane-down drift.
import { makeTown } from './town.js';

export default {
  dur: 6.0,
  post: {
    bloom: 0.7, bloomRadius: 0.7, bloomThreshold: 0.72, exposure: 1.0, contrast: 1.12, saturation: 1.18,
    lift: [0.03, 0.012, 0.03], gamma: [1.02, 1.0, 0.97], gain: [1.05, 0.98, 0.88], vignette: 0.32, grain: 0.035, ca: 0.0015, soft: 0.1,
  },
  build(core, ctx) {
    const { THREE, smooth, lerp } = core;
    const T = makeTown(core, ctx, {}, { key: 'golden', focusS: 90, focusD: 0, clouds: [
      { az: -0.42, el: 6, w: 820, h: 520, seed: 3, light: '#f8c890', mid: '#d88878', shadow: '#7a5a88', lightDir: [1, 0.1] },
      { az: 0.2, el: 13, w: 900, h: 360, seed: 8, kind: 'stratus', light: '#f8d0a0', mid: '#d88a80', shadow: '#6a5a88', lightDir: [0.3, -1], opacity: 0.85 },
      { az: 0.55, el: 5, w: 700, h: 460, seed: 5, light: '#f8c890', mid: '#c87a88', shadow: '#5a4a78', lightDir: [-1, 0.1] },
      { az: -0.75, el: 9, w: 760, h: 480, seed: 14, light: '#ffd8b0', mid: '#c88a98', shadow: '#5a5a88', lightDir: [1, 0.2] },
    ] });
    const { scene, frame } = T;
    const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 6000);
    const P = (s, d, y) => frame.toWorld(s, d, y);
    const sunH = new THREE.Vector3(...T.pal.sunDir).setY(0).normalize();
    const side = new THREE.Vector3(-sunH.z, 0, sunH.x);
    const F = P(100, 0, 0);
    const q = new URLSearchParams(location.search);
    const AZ = +(q.get('az') ?? 0.75), DIST = +(q.get('dist') ?? 230), HGT = +(q.get('hgt') ?? 72), LY = +(q.get('ly') ?? 26);
    return {
      scene, camera,
      update(t) {
        T.fog();
        const k = smooth(0, 6, t);
        const az = AZ + lerp(-0.05, 0.05, k);
        const back = sunH.clone().multiplyScalar(-Math.cos(az)).addScaledVector(side, Math.sin(az));
        camera.position.copy(F).addScaledVector(back, DIST + 40 - 80 * k).setY(HGT + 12 - 26 * k);
        camera.lookAt(F.clone().addScaledVector(back, -260).setY(LY));
        T.setTrain(30 + t * 30);
      },
    };
  },
};
