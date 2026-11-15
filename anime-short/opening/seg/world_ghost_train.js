// world_ghost_train (3 s) — THE TURN: under a dark blood sky a black ghost train with red-lit windows rolls across
// the viaduct (shot 1's modelled train, re-shaded); in the foreground a crossing signal flashes red and its gate arm
// comes down. Low street-level angle in the town kit (town.js), looking up at the viaduct.
import { makeTown, PALETTES } from './town.js';
import { makeCrossing } from './crossing.js';

export default {
  dur: 3.0,
  post: {
    bloom: 0.95, bloomRadius: 0.65, bloomThreshold: 0.6, exposure: 1.0, contrast: 1.25, saturation: 1.1,
    lift: [0.03, 0.0, 0.01], gamma: [1.05, 0.96, 0.96], gain: [1.06, 0.92, 0.9], vignette: 0.5, grain: 0.05, ca: 0.0025, soft: 0.05,
  },
  build(core, ctx) {
    const { THREE, shared, col, smooth, lerp, NOISE_GLSL } = core;
    const pal = { ...PALETTES.blood, zenith: '#020001', mid: '#220204', horizon: '#ff3a12', sunColor: '#ff3010', sunDir: [0.5, 0.05, -0.85], sunInt: 1.6,
      fog: '#5a0608', fogNear: 40, fogFar: 600, fogMax: 0.85, glow: 1.0, sunDisc: 1, streak: 0.7, streakColor: '#070001', ambInt: 0.45, hemiInt: 0.5 };
    const T = makeTown(core, ctx, pal, { key: 'ghost', focusS: 100, focusD: 0, viaEnv: 0.25, houses: 6000, trees: 3000, pierColor: '#3a2a2a', streets: [[92, 106, -600, 600], [-600, 800, 15, 24]] });
    const { scene, frame, train, via } = T;
    // ---- ghost train shader: black body, red windows (in train-local space) ----
    train.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(train.matrixWorld).invert();
    const bb = new THREE.Box3(); train.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); bb.union(b); } });
    const gm = new THREE.ShaderMaterial({
      uniforms: { uInv: { value: inv }, uY: { value: new THREE.Vector2(bb.min.y, bb.max.y) }, uTime: shared.uTime },
      vertexShader: `varying vec3 vW, vN; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform mat4 uInv; uniform vec2 uY; uniform float uTime; varying vec3 vW, vN; ${NOISE_GLSL}
        void main(){ vec3 lp = (uInv * vec4(vW, 1.)).xyz; vec3 ln = normalize(mat3(uInv) * vN);
          float h = (lp.y - uY.x) / (uY.y - uY.x);
          vec3 V = normalize(cameraPosition - vW);
          vec3 c = vec3(0.004, 0.002, 0.003) + vec3(0.5, 0.06, 0.03) * pow(1.0 - abs(dot(normalize(vN), V)), 5.0) * 0.4;
          float side = smoothstep(0.5, 0.8, abs(ln.z));
          float cell = floor(lp.x / 1.45); float fx = fract(lp.x / 1.45);
          float win = side * step(0.12, fx) * step(fx, 0.82) * smoothstep(0.5, 0.53, h) * smoothstep(0.8, 0.77, h);
          float fl = 0.75 + 0.25 * sin(uTime * 13.0 + cell * 1.7) * step(0.7, hash12(vec2(cell, 3.0)));
          float pres = step(0.18, hash12(vec2(cell, 9.0)));
          vec3 wc = mix(vec3(2.2, 0.25, 0.06), vec3(3.0, 0.9, 0.4), smoothstep(0.62, 0.7, h) * 0.6);
          // silhouettes of standing passengers in some windows
          float ppl = step(0.55, hash12(vec2(cell, 1.0))) * smoothstep(0.03, 0.0, abs(fx - 0.3 - 0.3 * hash12(vec2(cell, 5.))) - 0.05) * step(h, 0.74);
          c = mix(c, wc * fl * (1.0 - ppl * 0.95), win * pres);
          gl_FragColor = vec4(c, 1.); }`,
    });
    train.traverse(o => { if (o.isMesh) o.material = gm; });
    // sun low behind the viaduct (as seen from the camera)
    const SUNW = frame.toWorld(122, -2, 30).sub(frame.toWorld(97, 22, 1.1)).normalize();
    T.sky.material.uniforms.uSun.value.copy(SUNW);
    T.sun.position.copy(T.sun.target.position).addScaledVector(SUNW, 400);
    T.hemi.intensity = 0.25; T.amb.intensity = 0.25;
    via.traverse(o => { if (o.isMesh && o.material.color && o.material.isMeshPhysicalMaterial) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.35); } });
    // at-grade rails along the street in front of the camera (the crossing)
    const railM = new THREE.MeshStandardMaterial({ color: col('#b0a0a0'), roughness: 0.3, metalness: 0.8 });
    for (const dd of [19.3, 20.7]) { const r = new THREE.Mesh(new THREE.BoxGeometry(1400, 0.15, 0.08), railM); r.position.copy(frame.toWorld(100, dd, 0.1)); r.quaternion.copy(frame.q); scene.add(r); }
    const slM = new THREE.MeshStandardMaterial({ color: col('#2a2220'), roughness: 0.9 });
    const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.1, 2.4), slM, 200); const m4 = new THREE.Matrix4();
    for (let i = 0; i < 200; i++) { m4.compose(frame.toWorld(i * 0.7, 20, 0.03), frame.q, new THREE.Vector3(1, 1, 1)); sl.setMatrixAt(i, m4); }
    scene.add(sl);
    // ---- crossing signal in the foreground (street level, camera side of the viaduct) ----
    const X = makeCrossing(core, { armLen: 6.5 });
    X.group.position.copy(frame.toWorld(99.2, 17.2, 0)); X.group.quaternion.copy(frame.q);
    scene.add(X.group);
    const X2 = makeCrossing(core, { armLen: 6.5 });
    X2.group.position.copy(frame.toWorld(112.5, 17.2, 0)); X2.group.quaternion.copy(frame.q); X2.group.scale.x = -1;
    scene.add(X2.group);
    // red flash light spill on the street
    const flashL = new THREE.PointLight(col('#ff2a10'), 0, 18, 1.5); flashL.position.copy(frame.toWorld(100, 18.5, 2.6)); scene.add(flashL);
    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.3, 6000);
    const q = new URLSearchParams(location.search);
    const C0 = (q.get('cam') || '96.6,23.5,1.0').split(',').map(Number), L0 = (q.get('look') || '111,-2,11.5').split(',').map(Number);
    return {
      scene, camera,
      update(t) {
        T.fog();
        const k = smooth(0, 3, t);
        camera.position.copy(frame.toWorld(C0[0] + 0.5 * k, C0[1] - 1.2 * k, C0[2]));
        camera.lookAt(frame.toWorld(L0[0], L0[1], L0[2] + 1.2 * k));
        T.setTrain(150 + t * 24);
        const lower = smooth(0.35, 1.9, t);
        X.update(t, lower); X2.update(t + 0.19, lower);
        flashL.intensity = (Math.floor(t * 2.6) % 2 ? 0.6 : 1.0) * 10;
      },
    };
  },
};
