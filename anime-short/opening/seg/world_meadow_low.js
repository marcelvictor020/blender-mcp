// world_meadow_low (1.5 s) — the meadow (shot 8 world) at GRASS LEVEL against a low sunset sun; the white egret
// bursts up out of the grass and climbs across frame, wings beating, rim-lit. Grass via core.makeGrass in depth layers.
import { makeSkyDome } from './town.js';
import { makeEgret } from './egret.js';

export default {
  dur: 1.5,
  post: {
    bloom: 0.6, bloomRadius: 0.7, bloomThreshold: 0.72, exposure: 1.0, contrast: 1.1, saturation: 1.15,
    lift: [0.03, 0.02, 0.04], gamma: [1.0, 1.0, 1.0], gain: [1.04, 0.98, 0.9], vignette: 0.35, grain: 0.035, ca: 0.002, soft: 0.05,
  },
  build(core, ctx) {
    const { THREE, shared, col, smooth, lerp, makeGrass, rng } = core;
    const scene = new THREE.Scene();
    const SUN = [0.25, 0.06, -1];
    scene.add(makeSkyDome(core, { zenith: '#3a4f8a', mid: '#e89a78', horizon: '#ffd890', sunColor: '#ffc070', sunDir: SUN, sunDisc: 1, glow: 0.9, streak: 0.5, streakColor: '#c87a80' }));
    // ground + distant tree line silhouette
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshBasicMaterial({ color: col('#24301a') }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    const R = rng(12);
    const treeM = new THREE.MeshBasicMaterial({ color: col('#3a3448') }), treeM2 = new THREE.MeshBasicMaterial({ color: col('#4e4256') });
    for (let i = 0; i < 260; i++) {
      const x = -330 + i * 2.6 + R() * 3, r = 3 + R() * 4 + 3 * Math.max(0, Math.sin(i * 0.07)) * R();
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), i % 3 ? treeM : treeM2); m.position.set(x, r * 0.15, -230 - R() * 30); m.scale.set(1.3, 0.9 + R() * 0.5, 1); scene.add(m);
    }
    // grass: near / mid / far layers (back-lit: dark bodies, glowing tips)
    const G = (o) => { const g = makeGrass({ base: '#14200e', tip: '#6a7a2a', dark: '#0c140a', light: '#ffd27a', wind: 0.35, bend: 0.4, patch: 0.2, ...o }); scene.add(g); return g; };
    G({ x0: -3.5, x1: 3.5, z0: -4, z1: -0.3, count: 22000, h: [0.12, 0.42], w: 0.02, seed: 3 });
    G({ x0: -9, x1: 9, z0: -14, z1: -4, count: 30000, h: [0.25, 0.6], w: 0.035, seed: 4 });
    const far = G({ x0: -40, x1: 40, z0: -70, z1: -14, count: 26000, h: [0.4, 1.0], w: 0.12, seed: 5, fog: 0.35, fogColor: '#c89a70' });
    // egret
    const E = makeEgret(core, { sunDir: SUN, body: '#f6f2e8', shade: '#7c7aa8', rim: '#ffc870', rimAmt: 0.5, rimPow: 3 });
    scene.add(E.group);
    const motes = core.makeMotes({ count: 70, box: [[-3, 0.1, -8], [3, 2.0, -1]], size: 0.02, color: '#ffe0a0', opacity: 0.9, seed: 8, speed: 0.4 });
    scene.add(motes);
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 3000);
    const path = (t) => { const k = smooth(0, 1.5, t) * 0.6 + t / 1.5 * 0.4; return new THREE.Vector3(lerp(-1.25, 0.9, k), lerp(0.3, 2.1, Math.pow(k, 0.85)), lerp(-3.6, -2.9, k)); };
    return {
      scene, camera,
      update(t) {
        shared.uSunDir.value.set(...SUN).normalize(); shared.uDapple.value = 0; shared.uFogMax.value = 0;
        camera.position.set(0.15, 0.3 + t * 0.03, 0.4);
        camera.lookAt(0.1, 1.45 + t * 0.15, -6);
        const p = path(t), p2 = path(t + 0.02);
        E.group.position.copy(p);
        const d = p2.clone().sub(p).normalize();
        E.group.lookAt(p.clone().add(d.clone().setY(d.y * 0.45)));
        E.group.rotateZ(-0.12 + 0.08 * Math.sin(t * 9));
        E.flap(t * 3.6 + 0.15, 1);
        E.legs.rotation.x = lerp(0.9, 0.05, smooth(0, 0.9, t));
      },
    };
  },
};
