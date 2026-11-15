// world_vending_dusk (1.5 s) — the vending-machine row (shot 6 world) seen from the SIDE at dusk:
// low camera on the road beside the red machine looking down the row; sun gone, purple sky, the machines'
// displays glow and throw cold light pools on the asphalt; one fluorescent tube stutters on. Slow push-in.
import shot6 from '../../shots/shot6.js';
import { makeSkyDome, killDapple } from './town.js';

export default {
  dur: 1.5,
  post: {
    bloom: 0.75, bloomRadius: 0.6, bloomThreshold: 0.7, exposure: 1.0, contrast: 1.18, saturation: 1.12,
    lift: [0.02, 0.01, 0.06], gamma: [0.98, 0.98, 1.04], gain: [1.0, 0.96, 1.04], vignette: 0.38, grain: 0.04, ca: 0.0018, soft: 0.1,
  },
  build(core, ctx) {
    const { THREE, shared, col, smooth, lerp } = core;
    const inst = shot6.build(core, ctx);
    const scene = inst.scene;
    // strip the frontal set-dressing that only works from the original camera
    const hide = [];
    scene.traverse(o => {
      if (!o.isMesh) return;
      if (o.geometry?.attributes?.aP) hide.push(o);                                        // painted canopy leaf sprays
      if (o.material?.type === 'ShaderMaterial' && o.geometry?.boundingSphere?.radius > 1000) hide.push(o);
    });
    scene.traverse(o => { if (o.isMesh && o.material?.type === 'ShaderMaterial' && !o.geometry.boundingSphere) { o.geometry.computeBoundingSphere(); if (o.geometry.boundingSphere.radius > 1000) hide.push(o); } });
    hide.forEach(o => (o.visible = false));
    if (location.search.includes('dumpu')) scene.traverse(o => { if (o.isMesh && o.visible && (o.material.type === 'ShaderMaterial' || o.material.onBeforeCompile)) console.warn(o.material.type, o.geometry.type, Object.keys(o.material.uniforms || {}).join(','), o.material.customProgramCacheKey?.()); });
    const pal = { zenith: '#141a44', mid: '#5a3a74', horizon: '#ff8a62', sunColor: '#ff6a40', sunDir: [-0.9, 0.04, -0.4], sunDisc: 0, glow: 0.8, streak: 0.8, streakColor: '#2a1a40' };
    scene.add(makeSkyDome(core, pal));
    // relight: dim warm last light from the left, cool hemisphere, emissive displays up
    const disp = [], tubes = [];
    scene.traverse(o => {
      if (o.isDirectionalLight) { o.intensity = 0.12; o.color.set('#ff7a50'); o.position.copy(o.target.position).add(new THREE.Vector3(-0.9, 0.18, -0.4).normalize().multiplyScalar(30)); }
      if (o.isHemisphereLight) { o.color.set('#6a6ab8'); o.groundColor.set('#2a1e2a'); o.intensity = 0.55; }
      const m = o.material; if (!m || Array.isArray(m)) return;
      if (m.type === 'ShaderMaterial' && o.visible) {
        const U = m.uniforms;
        if (U.uSunI) { U.uSunI.value *= 0.12; U.uSkyI.value *= 0.55; U.cSky?.value.set('#6a5aa8'); U.cHaze?.value.set('#8a5a7a'); U.cSunC?.value.set('#ff7a50'); }
        for (const k of ['cT', 'cM', 'cB', 'cD']) if (U[k]) U[k].value.multiply(col('#5a5078'));
      }
      if (m.isMeshPhysicalMaterial || m.isMeshStandardMaterial) {
        if (m.envMapIntensity !== undefined) m.envMapIntensity *= 0.3;
        if (m.emissiveMap && m.emissive && m.emissive.getHex() === 0xffffff) { disp.push(m); m.userData.e0 = m.emissiveIntensity; }
      }
    });
    // light pools in front of the three machines (+ one warm from the red one)
    const pools = [];
    for (const [x, c, i] of [[-1.55, '#cfe6ff', 0.9], [-0.35, '#bcd4ff', 0.9], [0.95, '#ffd0c8', 1.0]]) {
      const L = new THREE.PointLight(col(c), i, 6, 1.6); L.position.set(x, 0.35, -10.1); scene.add(L); pools.push(L);
    }
    killDapple(scene);
    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 3000);
    // moths around the light
    const motes = core.makeMotes({ count: 26, box: [[-2.4, 0.6, -11.6], [1.6, 2.4, -10.4]], size: 0.035, color: '#fff2d0', opacity: 0.9, seed: 4, speed: 0.6 });
    scene.add(motes);
    return {
      scene, camera,
      update(t) {
        inst.update(t, core);
        shared.uDapple.value = 0.0; shared.uFogMax.value = 0.0;
        const k = smooth(0, 1.5, t);
        camera.position.set(lerp(3.3, 3.0, k), lerp(0.85, 0.9, k), lerp(-8.9, -9.35, k));
        camera.lookAt(-1.2, 1.25, -12.2);
        // fluorescent stutter: the middle machine flickers on in the first 0.6 s
        const fl = t < 0.6 ? ((Math.sin(t * 90) > 0.2 ? 1 : 0.15) * (t > 0.12 ? 1 : 0.1)) : 1;
        disp.forEach((m, i) => { m.emissiveIntensity = (i === 1 ? fl : 1) * 0.8; });
        pools[1].intensity = 0.9 * fl;
      },
    };
  },
};
