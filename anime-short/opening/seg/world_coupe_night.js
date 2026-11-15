// world_coupe_night (1.5 s) — the Collector's white 80s coupe (vehicles.js makeCoupe) at NIGHT on an empty street:
// low 3/4 front angle; the pop-up headlights flip up, lamps ignite and throw volumetric beams toward camera.
import { makeCoupe, makeEnvMap, makeGroundShadow } from '../../vehicles.js';
import { makeSkyDome, killDapple } from './town.js';

export default {
  dur: 1.5,
  post: {
    bloom: 0.85, bloomRadius: 0.65, bloomThreshold: 0.7, exposure: 1.05, contrast: 1.16, saturation: 1.05,
    lift: [0.0, 0.015, 0.05], gamma: [0.98, 1.0, 1.05], gain: [1.0, 0.98, 1.05], vignette: 0.45, grain: 0.045, ca: 0.0022, soft: 0.05,
  },
  build(core, ctx) {
    const { THREE, shared, col, smooth, lerp, toon, rng } = core;
    const scene = new THREE.Scene();
    scene.add(makeSkyDome(core, { zenith: '#02040e', mid: '#0a1430', horizon: '#1e2a50', sunColor: '#5060a0', sunDir: [-0.4, 0.1, -1], sunDisc: 0, glow: 0.3, streak: 0.25, streakColor: '#141c38' }));
    const env = makeEnvMap('coupe_night', { zenith: '#05070f', horizon: '#1a2240', ground: '#050508', sunDir: [-0.6, 0.5, 0.3], sunColor: '#ffb070', sunPower: 6, sunSize: 2,
      blocks: [{ dir: [-1, 0.3], w: 30, h: 6, dist: 12, color: '#0a0a10' }, { dir: [1, -0.2], w: 30, h: 8, dist: 12, color: '#08080c' }] });
    const car = makeCoupe({ envMap: env, sunDir: [-0.6, 0.5, 0.3], rimColor: '#7a9aff', rimAmt: 0.6, leafAmt: 0 });
    scene.add(car.group);
    killDapple(car.group);
    // street: wet-ish asphalt, kerb, a block wall behind with a sodium street lamp
    const asphalt = new THREE.MeshStandardMaterial({ color: col('#1a1a20'), roughness: 0.35, metalness: 0.0, envMap: env, envMapIntensity: 0.6 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), asphalt); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const lineM = new THREE.MeshBasicMaterial({ color: col('#8a8a80') });
    for (let i = -6; i < 6; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1.6), lineM); l.rotation.x = -Math.PI / 2; l.position.set(-2.4, 0.005, i * 3.5); scene.add(l); }
    const wallM = new THREE.MeshStandardMaterial({ color: col('#4a4a54'), roughness: 0.9 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.9, 40), wallM); wall.position.set(2.7, 0.95, -6); wall.castShadow = wall.receiveShadow = true; scene.add(wall);
    for (let i = 0; i < 20; i++) { const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 1.9), wallM); cap.position.set(2.7, 1.94, -25 + i * 2); scene.add(cap); }
    // distant house silhouettes with a few lit windows
    const R = rng(3), hm = new THREE.MeshBasicMaterial({ color: col('#05060c') }), wm = new THREE.MeshBasicMaterial({ color: col('#ffb060') });
    for (let i = 0; i < 16; i++) {
      const hgt = 4 + R() * 4, w = 5 + R() * 4, z = -30 + i * 4.5;
      const b = new THREE.Mesh(new THREE.BoxGeometry(5, hgt, w), hm); b.position.set(7 + R() * 2, hgt / 2, z); scene.add(b);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.75, 2, 4), hm); roof.position.set(b.position.x, hgt + 0.9, z); roof.rotation.y = Math.PI / 4; scene.add(roof);
      if (R() < 0.6) { const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), wm); win.position.set(b.position.x - 2.51, hgt * 0.6, z + (R() - 0.5) * 2); win.rotation.y = -Math.PI / 2; scene.add(win); }
    }
    // utility pole + sodium lamp behind the car
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 8, 8), new THREE.MeshStandardMaterial({ color: col('#2a2a2e'), roughness: 0.8 })); pole.position.set(3.2, 4, -9); scene.add(pole);
    const lampHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: col('#ffd8a0').multiplyScalar(4) })); lampHead.position.set(2.5, 6.3, -9); scene.add(lampHead);
    const sodium = new THREE.SpotLight(col('#ffa050'), 60, 22, 0.75, 0.6, 1.6); sodium.position.copy(lampHead.position); sodium.target.position.set(1.0, 0, -6); sodium.castShadow = true; sodium.shadow.mapSize.set(1024, 1024);
    scene.add(sodium, sodium.target);
    scene.add(new THREE.HemisphereLight(col('#2a3a78'), col('#08080c'), 0.55));
    const moon = new THREE.DirectionalLight(col('#7a90ff'), 0.6); moon.position.set(-6, 8, -10); scene.add(moon);
    car.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    car.group.position.set(0, 0, -3.5); car.group.rotation.y = 0.0;   // car faces -z ... turned toward camera below
    car.group.rotation.y = Math.PI - 0.62;                              // front 3/4 toward camera

    // ---- pop-up headlight pods (hinged at the back edge, flip up) ----
    const podM = car.materials?.paint || new THREE.MeshStandardMaterial({ color: '#ecebe7' });
    const lensM = new THREE.MeshBasicMaterial({ color: col('#fff6e0') });
    const pods = [], beams = [], spots = [];
    const poolMat = new THREE.ShaderMaterial({ uniforms: { uI: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform float uI; varying vec2 vUv; void main(){ vec2 p = vUv - vec2(0.5, 0.0); float w = 0.12 + 0.38 * vUv.y; float a = smoothstep(w, w * 0.4, abs(p.x)) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.5, vUv.y); gl_FragColor = vec4(vec3(1.0, 0.92, 0.75) * a * uI * 0.5, 1.); }' });
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uI: { value: 0 }, cC: { value: col('#fff2d0') } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uI; uniform vec3 cC; varying vec2 vUv; varying vec3 vN, vV;
        void main(){ float along = vUv.y; float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
          float a = uI * edge * pow(along, 3.0) * 0.22; gl_FragColor = vec4(cC * a, 1.); }`,
    });
    // car-local: forward = -z, front bumper at z = -4.18. Pod hinge at the pod's rear edge; lens on the pod's
    // underside so that a +90deg flip about x turns it to face forward.
    for (const sx of [-0.56, 0.56]) {
      const hinge = new THREE.Group(); hinge.position.set(sx, 0.765, -3.5); car.group.add(hinge);
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.2), podM); pod.position.set(0, 0, -0.1); hinge.add(pod);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.19), new THREE.MeshStandardMaterial({ color: col('#0c0c10'), roughness: 0.5 })); box.position.set(0, -0.065, -0.1); hinge.add(box);
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), lensM); lens.rotation.x = Math.PI / 2; lens.position.set(0, -0.127, -0.1); hinge.add(lens);
      // beam cone + spot from where the lens ends up (fixed to the car, pointing forward -z)
      const LP = new THREE.Vector3(sx, 0.765 + 0.15, -3.5 - 0.17);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 1.6, 12, 24, 1, true), beamMat); cone.rotation.x = -Math.PI / 2 - 0.03; cone.position.set(sx, LP.y - 0.18, LP.z - 6); car.group.add(cone);
      // light pool on the asphalt (additive decal; real spot lights NaN'd the car paint shader in SwiftShader)
      const sp = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 9), poolMat); sp.rotation.x = -Math.PI / 2; sp.position.set(sx * 1.3, 0.012, LP.z - 5.2); car.group.add(sp);
      pods.push(hinge); beams.push(cone); spots.push(sp);
    }
    const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.05, 3000);
    return {
      scene, camera,
      update(t) {
        shared.uDapple.value = 0; shared.uFogMax.value = 0;
        const k = smooth(0, 1.5, t);
        camera.position.set(lerp(-2.8, -2.6, k), 0.45, lerp(3.2, 2.85, k));
        camera.lookAt(-1.8, 0.62, -1.0);
        const up = smooth(0.15, 0.6, t);                     // pods rotate up ~ 75 deg about their hinge (hinge at rear edge)
        pods.forEach(p => { p.rotation.x = up * Math.PI / 2; });
        const on = smooth(0.62, 0.72, t) * (t < 0.8 ? (Math.sin(t * 120) > -0.3 ? 1 : 0.3) : 1);
        lensM.color.set('#fff6e0').multiplyScalar(0.15 + on * 0.75);
        beamMat.uniforms.uI.value = on;
        poolMat.uniforms.uI.value = on;
      },
    };
  },
};
