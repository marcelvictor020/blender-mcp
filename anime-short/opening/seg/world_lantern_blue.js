// world_lantern_blue (1.5 s) — the old shop-house (shot 5 world) at BLUE HOUR: new close low angle under the eave,
// the 串焼 chōchin lantern stutters on and settles into a warm glow that pools on the clapboards; deep blue sky.
import shot5 from '../../shots/shot5.js';
import { makeSkyDome, tintShaders, findSky, killDapple } from './town.js';

export default {
  dur: 1.5,
  post: {
    bloom: 0.95, bloomRadius: 0.75, bloomThreshold: 0.6, exposure: 1.05, contrast: 1.14, saturation: 1.1,
    lift: [0.0, 0.02, 0.07], gamma: [0.97, 1.0, 1.06], gain: [1.0, 0.98, 1.06], vignette: 0.4, grain: 0.04, ca: 0.0018, soft: 0.08,
  },
  build(core, ctx) {
    const { THREE, shared, col, smooth, lerp } = core;
    const inst = shot5.build(core, ctx);
    const scene = inst.scene;
    // lantern = group holding the LatheGeometry paper body
    let lan = null, paper = null;
    scene.traverse(o => { if (!lan && o.isMesh && o.geometry.type === 'LatheGeometry' && o.material.emissiveMap) { lan = o.parent; paper = o.material; } });
    scene.traverse(o => { if (o.isMesh && o.geometry?.attributes?.aB) o.visible = false; });   // no butterflies at night
    const sky = findSky(scene); if (sky) sky.visible = false;
    tintShaders(scene, col('#3a4a8a'));
    scene.add(makeSkyDome(core, { zenith: '#0a1236', mid: '#1e3470', horizon: '#5a78b8', sunColor: '#8aa0e0', sunDir: [0.3, -0.1, -1], sunDisc: 0, glow: 0.4, streak: 0.4, streakColor: '#16204a' }));
    scene.traverse(o => {
      if (o.isDirectionalLight) o.intensity = 0;
      if (o.isHemisphereLight) { o.color.set('#4a5aa8'); o.groundColor.set('#1a1830'); o.intensity = 0.9; }
      if (o.isAmbientLight) { o.color.set('#2a3470'); o.intensity = 0.3; }
      const m = o.material; if (m && !Array.isArray(m) && m.envMapIntensity !== undefined) m.envMapIntensity *= 0.35;
    });
    killDapple(scene);
    const glow = new THREE.PointLight(col('#ff9a48'), 0, 7, 1.4); lan.add(glow);
    const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 2000);
    const LP = new THREE.Vector3(); lan.updateMatrixWorld(true); lan.getWorldPosition(LP);
    const q = new URLSearchParams(location.search);
    const off = (q.get('off') || '2.0,-1.25,2.6').split(',').map(Number);
    return {
      scene, camera,
      update(t) {
        inst.update(t, core);
        const k = smooth(0, 1.5, t);
        camera.position.copy(LP).add(new THREE.Vector3(off[0] - 0.15 * k, off[1], off[2] - 0.25 * k));
        camera.lookAt(LP.clone().add(new THREE.Vector3(-0.35, 0.25, 0)));
        // flicker on: dead -> two stutters -> warm steady glow with a slight candle wobble
        let on = 0;
        if (t > 0.18 && t < 0.26) on = 0.7; else if (t > 0.34 && t < 0.4) on = 0.4; else if (t > 0.52) on = smooth(0.52, 0.75, t);
        on *= 0.92 + 0.08 * Math.sin(t * 37) * Math.sin(t * 13);
        paper.emissiveIntensity = 0.05 + on * 1.1; paper.emissive.set('#ffb070');
        glow.intensity = on * 1.2;
      },
    };
  },
};
