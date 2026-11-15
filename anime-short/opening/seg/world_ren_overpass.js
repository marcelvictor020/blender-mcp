// world_ren_overpass (3 s) — CLASH: Ren's silhouette standing on the overpass railing above the town, a blood-red
// sky and swollen red sun behind him; his shadow erupts into a horned black aura (camera-facing flame shader with
// horns + tendrils) while embers stream upward. Low angle from the overpass deck, slow push.
import { makeTown, PALETTES } from './town.js';
import { makeRen } from './ren.js';

export function auraMaterial(core) {
  const { THREE, shared, NOISE_GLSL } = core;
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uErupt: { value: 0 }, uHorn: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform float uTime, uErupt, uHorn; varying vec2 vUv; ${NOISE_GLSL}
      float capsule(vec2 p, vec2 a, vec2 b, float r){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }
      float horn(vec2 p, float sx, float grow){
        float d = 1e3; vec2 prev = vec2(0.18 * sx, 1.75);
        for (int i = 1; i <= 14; i++){ float s = float(i) / 14.0; if (s > grow) break;
          vec2 c = vec2(sx * (0.18 + 1.25 * sin(s * 1.9) - 0.35 * s * s * s), 1.75 + 2.7 * s - 0.4 * s * s);
          d = min(d, capsule(p, prev, c, 0.26 * (1.0 - s) + 0.02)); prev = c; }
        return d; }
      void main(){
        vec2 q = (vUv - vec2(0.5, 0.0)) * vec2(8.0, 8.0);                   // metres, feet at q = (0, 0)
        float t = uTime;
        vec2 wq = q + vec2(0.0, -t * 2.6);                                     // flames rise
        float n = fbm(wq * 1.3 + vec2(0.0, 3.0)) - 0.5;
        float n2 = fbm(wq * 3.1 + 7.0) - 0.5;
        float body = capsule(q, vec2(0.0, 0.25), vec2(0.0, 1.55), 0.32);
        float hn = min(horn(q, 1.0, uHorn), horn(q, -1.0, uHorn));
        float k = clamp(q.y / 5.0, 0.0, 1.0);
        float fl = body - (0.2 + 0.9 * k) * uErupt - n * (0.5 + 1.0 * k) * uErupt - n2 * 0.3;
        fl += smoothstep(0.0, 1.2, -q.y) * 3.0;                               // nothing below the feet
        fl = max(fl, -(q.y - 0.0) - 0.2);
        float d = min(fl, hn - n2 * 0.18);
        // wisps / tendrils whipping outward
        float a = atan(q.x, q.y - 1.3); float rr = length(q - vec2(0.0, 1.3));
        float wisp = abs(sin(a * 5.0 + sin(rr * 1.8 - t * 4.0) * 0.8 + n * 3.0)) ;
        float tend = smoothstep(0.08, 0.0, wisp - 0.0) * smoothstep(1.2 + 3.3 * uErupt, 0.8, rr) * uErupt;
        float inside = smoothstep(0.03, -0.03, d);
        float edge = smoothstep(0.25, 0.0, abs(d)) * (1.0 - inside * 0.4);
        vec3 c = vec3(0.004, 0.0, 0.002) + vec3(0.16, 0.005, 0.01) * smoothstep(0.55, 0.85, fbm(wq * 2.2 + 11.0)) * smoothstep(-0.6, 0.0, d);
        vec3 glow = vec3(1.0, 0.12, 0.03) * 1.8;
        float a1 = max(inside, tend * 0.9);
        // hot red core around his body so the black figure reads in front of the black aura
        c += vec3(0.75, 0.05, 0.02) * smoothstep(0.9, -0.1, body + n * 0.4) * uErupt;
        vec3 col = mix(glow * edge, c, inside);
        float alpha = max(a1, edge * 0.85);
        // outer heat-glow haze
        float haze = smoothstep(1.4, 0.0, d) * 0.35 * uErupt;
        col += vec3(0.6, 0.04, 0.02) * haze * (1.0 - inside);
        alpha = max(alpha, haze * 0.6);
        alpha *= smoothstep(0.0, 0.2, uErupt);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(col, alpha); }`,
  });
}

export default {
  dur: 3.0,
  post: {
    bloom: 0.9, bloomRadius: 0.7, bloomThreshold: 0.62, exposure: 1.0, contrast: 1.28, saturation: 1.12,
    lift: [0.03, 0.0, 0.01], gamma: [1.05, 0.96, 0.95], gain: [1.08, 0.92, 0.88], vignette: 0.5, grain: 0.05, ca: 0.0028, soft: 0.04,
  },
  build(core, ctx) {
    const { THREE, shared, col, smooth, lerp, rng } = core;
    const pal = { ...PALETTES.blood, zenith: '#0a0002', mid: '#5a0406', horizon: '#ff4a16', sunColor: '#ff3a12', sunInt: 1.8, fog: '#9a1008', fogMax: 0.9, fogNear: 30, fogFar: 700, glow: 1.3, streak: 0.85, streakColor: '#160103', hemiInt: 0.4, ambInt: 0.35 };
    const T = makeTown(core, ctx, pal, { key: 'ren', focusS: 120, focusD: -60, houses: 7000, trees: 3000, viaEnv: 0.2 });
    const { scene, frame } = T;
    // overpass: deck + concrete parapet + tube railing, 8 m over a street, spanning along d
    const deckY = 8.0, base = frame.toWorld(99, 70, 0);
    const og = new THREE.Group(); og.position.copy(base); og.quaternion.copy(frame.q); scene.add(og);
    const conc = new THREE.MeshStandardMaterial({ color: col('#2a1414'), roughness: 0.9 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 60), conc); deck.position.set(0, deckY - 0.3, 0); og.add(deck);
    const steel = new THREE.MeshStandardMaterial({ color: col('#140a0c'), roughness: 0.5, metalness: 0.6 });
    for (const sx of [-2, 2]) {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 60, 8), steel); top.rotation.x = Math.PI / 2; top.position.set(sx, deckY + 1.15, 0); og.add(top);
      const mid = top.clone(); mid.position.y = deckY + 0.6; og.add(mid);
      const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.15, 6), steel, 60);
      const m4 = new THREE.Matrix4(); for (let i = 0; i < 60; i++) { m4.makeTranslation(sx, deckY + 0.575, -30 + i); posts.setMatrixAt(i, m4); } og.add(posts);
    }
    // Ren on the railing (the +x railing), facing out over the town (+x local of the overpass)
    const ren = makeRen(core, { sunDir: [1, 0.15, 0], rim: '#ff7a3a', rimAmt: 3.0, rimPow: 1.6 });
    const rp = new THREE.Vector3(2, deckY + 1.18, 2);
    ren.group.position.copy(rp); ren.group.rotation.y = Math.PI / 2; og.add(ren.group);
    // aura: camera-facing plane anchored at his feet
    const aura = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), auraMaterial(core)); aura.geometry.translate(0, 4, 0);
    aura.renderOrder = 2; scene.add(aura);
    const AU = aura.material.uniforms;
    // embers
    const embers = core.makeMotes({ count: 90, box: [[-2.5, -0.5, -2.5], [2.5, 4.5, 2.5]], size: 0.05, color: '#ff5020', opacity: 1, seed: 6, speed: 1.2 });
    og.add(embers); embers.position.copy(rp);
    // sun placed right behind Ren from the camera
    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 6000);
    const camL = new THREE.Vector3(-1.3, deckY + 0.35, -1.3);       // overpass-local
    const W = (v) => og.localToWorld(v.clone());
    og.updateMatrixWorld(true);
    const renW = W(rp.clone().add(new THREE.Vector3(0, 1.2, 0)));
    const sunW = renW.clone().sub(W(camL)).normalize(); sunW.y = Math.max(0.2, sunW.y * 0.6); sunW.normalize();
    T.sky.material.uniforms.uSun.value.copy(sunW);
    ren.mat.uniforms.uSun.value.copy(sunW);
    const feetW = W(rp);
    const tmpQ = new THREE.Quaternion();
    return {
      scene, camera,
      update(t) {
        T.fog();
        const k = smooth(0, 3, t);
        const c = camL.clone().add(new THREE.Vector3(0.15 * k, -0.08 * k, 0.35 * k));
        camera.position.copy(W(c));
        camera.lookAt(W(rp.clone().add(new THREE.Vector3(0, lerp(1.45, 2.1, k), 0))));
        // shake once the aura erupts
        const sh = 0.01 * smooth(0.9, 1.3, t) * (1 - smooth(1.6, 2.6, t));
        camera.rotateZ(Math.sin(t * 47) * sh); camera.rotateX(Math.cos(t * 39) * sh);
        ren.update(t, 1.0 + smooth(0.8, 1.4, t));
        ren.head.rotation.y = lerp(0, -0.75, smooth(1.6, 2.4, t));       // glances back over his shoulder
        ren.eyeM.color.set('#ff2010').multiplyScalar(1 + 5 * smooth(1.8, 2.3, t));
        aura.position.copy(feetW).addScaledVector(camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize(), 1.2);
        aura.quaternion.copy(camera.quaternion);
        AU.uErupt.value = smooth(0.5, 1.4, t) * (0.92 + 0.08 * Math.sin(t * 9));
        AU.uHorn.value = smooth(0.9, 2.0, t);
      },
    };
  },
};
