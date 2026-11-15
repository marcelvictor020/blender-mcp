// world_blood_sky (3 s) — THE TURN: the vending-machine row (shot 6 world) under a blood-red sky and a low red sun.
// The red machine's long shadow on the asphalt ripples, PEELS off the ground (curling sheet, animated geometry),
// stands up as a towering tendrilled black kagerō with a ring of red eyes and a jagged grin.
import shot6 from '../../shots/shot6.js';
import { makeSkyDome, killDapple, tintShaders, findSky } from './town.js';

export default {
  dur: 3.0,
  post: {
    bloom: 0.8, bloomRadius: 0.7, bloomThreshold: 0.7, exposure: 1.0, contrast: 1.3, saturation: 1.05,
    lift: [0.04, 0.0, 0.0], gamma: [1.06, 0.96, 0.94], gain: [1.08, 0.9, 0.86], vignette: 0.5, grain: 0.05, ca: 0.0025, soft: 0.05,
  },
  build(core, ctx) {
    const { THREE, shared, col, smooth, lerp, clamp, NOISE_GLSL, rng } = core;
    const inst = shot6.build(core, ctx);
    const scene = inst.scene;
    scene.traverse(o => { if (o.isMesh && o.geometry?.attributes?.aP) o.visible = false; });
    const sky0 = findSky(scene); if (sky0) sky0.visible = false;
    tintShaders(scene, col('#7a1810'));
    const SUN = new THREE.Vector3(0.22, 0.13, -1).normalize();
    scene.add(makeSkyDome(core, { zenith: '#080001', mid: '#4a0205', horizon: '#ff4418', sunColor: '#ff3010', sunDir: SUN.toArray(), sunDisc: 1, glow: 1.2, streak: 0.9, streakColor: '#120102' }));
    killDapple(scene);
    // vending machine groups (3 Groups with ~20+ children around z = -12): the right-most is the red one
    const vms = []; scene.children.forEach(o => { if (o.isGroup && o.children.length > 15 && Math.abs(o.position.z + 12) < 2) vms.push(o); });
    vms.sort((a, b) => a.position.x - b.position.x);
    const red = vms[vms.length - 1];
    const RB = new THREE.Box3().setFromObject(red);
    // relight: low blood-red sun from behind the row, dark red fill
    let sunL = null;
    scene.traverse(o => {
      if (o.isDirectionalLight) { sunL = o; o.color.set('#ff3a1e'); o.intensity = 2.6; o.target.position.set(0.5, 0, -8); o.position.copy(o.target.position).addScaledVector(SUN, 40);
        const c = o.shadow.camera; c.left = c.bottom = -14; c.right = c.top = 14; c.far = 120; c.updateProjectionMatrix(); o.shadow.mapSize.set(2048, 2048); }
      if (o.isHemisphereLight) { o.color.set('#a01810'); o.groundColor.set('#100204'); o.intensity = 0.55; }
      const m = o.material; if (m && !Array.isArray(m) && m.envMapIntensity !== undefined) m.envMapIntensity *= 0.25;
    });
    red.traverse(o => { if (o.isMesh) o.castShadow = false; });
    // dark asphalt apron toward the camera (shot 6's road ends just in front of its original camera)
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ color: col('#1a0a0a'), roughness: 0.6 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(0, -0.01, 14); apron.receiveShadow = true; scene.add(apron);   // its shadow is the creature below

    /* ---------------- the shadow sheet (curl-peel) ---------------- */
    const W = (RB.max.x - RB.min.x) * 1.05, L = 7.5, NX = 24, NY = 120;
    const base = new THREE.Vector3((RB.min.x + RB.max.x) / 2, 0.012, RB.max.z - 0.05);
    const dir = new THREE.Vector3(-SUN.x, 0, -SUN.z).normalize();           // shadow falls away from the sun
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const geo = new THREE.PlaneGeometry(1, 1, NX, NY);
    const P0 = geo.attributes.position.array.slice();
    const U = { uTime: shared.uTime, uPeel: { value: 0 }, uEyes: { value: 0 } };
    const NOISE = NOISE_GLSL;
    const sheetMat = new THREE.ShaderMaterial({
      uniforms: U, side: THREE.DoubleSide, transparent: true,
      vertexShader: `varying vec2 vUv; varying vec3 vN, vV, vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime, uPeel, uEyes; varying vec2 vUv; varying vec3 vN, vV, vW; ${NOISE}
        void main(){
          // ragged, boiling silhouette: width narrows to claws/tendril roots toward the far end
          float y = vUv.y; float x = abs(vUv.x - 0.5) * 2.0;
          float n = fbm(vec2(vUv.x * 6.0, y * 10.0 - uTime * 1.6)) - 0.5;
          float wid = mix(1.0, 0.75 + 0.25 * sin(vUv.x * 18.0), smoothstep(0.75, 1.0, y));
          float edge = wid - x + n * (0.25 + 0.35 * uPeel);
          float tipCut = (1.0 - y) * 8.0 + n * 1.5 + 0.2 * sin(vUv.x * 40.0);
          if (edge < 0.0 || tipCut < 0.0) discard;
          vec3 c = vec3(0.012, 0.0, 0.004);
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
          c += vec3(0.9, 0.05, 0.02) * (smoothstep(0.6, 0.95, f) * 0.5 + smoothstep(0.05, 0.0, edge) * 0.9) * uPeel;      // thin red rim
          gl_FragColor = vec4(c, 1.0); }`,
    });
    const sheet = new THREE.Mesh(geo, sheetMat); sheet.frustumCulled = false; scene.add(sheet);
    // curl-peel deformation (JS, per frame): material coordinate s along the shadow (0 = machine base, L = tip)
    const R0 = 1.4;
    const peelPos = (s, w, p, t, out) => {
      const sh = L * (1 - p);                              // hinge travels from the tip back toward the machine
      let fwd, up;
      if (s <= sh) { fwd = s; up = 0; }
      else {
        const d = s - sh, amax = 1.75 + 0.15 * Math.sin(t * 2.0);
        const a = Math.min(d / R0, amax);
        fwd = sh + R0 * Math.sin(a); up = R0 * (1 - Math.cos(a));
        const rest = d - a * R0;
        if (rest > 0) { fwd += Math.cos(amax) * rest; up += Math.sin(amax) * rest; }
        // writhing as it stands
        const k = Math.min(1, d / 3);
        w *= 1 + 0.35 * k * Math.sin(t * 3.0 + s * 0.8);
        fwd += k * 0.35 * Math.sin(t * 2.3 + s * 0.9);
        w += k * 0.4 * Math.sin(t * 1.7 + s * 0.6);
      }
      out.copy(base).addScaledVector(dir, fwd).addScaledVector(side, w); out.y += up;
      return out;
    };
    const wprof = (v) => 0.9 + 1.5 * smooth(0.15, 0.68, v) - 0.9 * smooth(0.78, 1.0, v);   // base -> shoulders -> head
    const tmp = new THREE.Vector3();
    const deform = (p, t) => {
      const pa = geo.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const u = P0[i * 3] + 0.5, v = P0[i * 3 + 1] + 0.5;           // u across, v along
        peelPos(v * L, (u - 0.5) * W * wprof(v), p, t, tmp);
        // ripple on the ground before the peel
        tmp.y += 0.03 * Math.sin(t * 6 - v * 14) * smooth(0.0, 0.6, t) * (1 - p);
        pa.setXYZ(i, tmp.x, tmp.y, tmp.z);
      }
      pa.needsUpdate = true; geo.computeVertexNormals();
    };

    /* ---------------- tendrils from the top edge (shader-bent tapered tubes) ---------------- */
    const tendrils = [];
    const tg = new THREE.CylinderGeometry(0.0, 1, 1, 7, 40, true); tg.translate(0, 0.5, 0);
    const R = rng(21);
    for (let i = 0; i < 28; i++) {
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: shared.uTime, uPh: { value: R() * 6.28 }, uAmp: { value: 0 }, uLen: { value: 1 } },
        vertexShader: `uniform float uTime, uPh, uAmp; varying float vY; varying vec3 vN, vV; void main(){ vec3 p = position; float y = p.y; vY = y;
          float sw = sin(y * 5.0 - uTime * 4.0 + uPh) * y * y * uAmp; float sw2 = cos(y * 3.5 - uTime * 3.1 + uPh * 1.7) * y * y * uAmp;
          p.x = p.x * 0.09 + sw * 0.9; p.z = p.z * 0.09 + sw2 * 0.9;
          vec4 w = modelMatrix * vec4(p, 1.); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `varying float vY; varying vec3 vN, vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0); gl_FragColor = vec4(vec3(0.01, 0.0, 0.004) + vec3(0.8, 0.05, 0.02) * pow(f, 1.5) * 0.3, 1.); }`,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(tg, m); mesh.frustumCulled = false; scene.add(mesh);
      if (i < 16) tendrils.push({ mesh, m, u: (i + 0.5) / 16, v: 0.985, len: 1.6 + R() * 2.6, lean: (R() - 0.5) * 1.6, tilt: R() * 0.8 });
      else { const sd = i % 2; tendrils.push({ mesh, m, u: sd ? 0.97 : 0.03, v: 0.4 + R() * 0.5, len: 0.9 + R() * 1.6, lean: (sd ? 1 : -1) * (2.5 + R() * 2), tilt: R() * 0.6, side: true }); }
    }
    /* ---------------- eyes + grin (emissive, on the standing sheet) ---------------- */
    const eyeM = new THREE.MeshBasicMaterial({ color: col('#ff2a10').multiplyScalar(1.7), transparent: true });
    const eyes = [];
    const ER = rng(5);
    for (let i = 0; i < 9; i++) {
      const e = new THREE.Mesh(new THREE.CircleGeometry(0.16 + ER() * 0.1, 16), eyeM); e.scale.y = 0.38; scene.add(e);
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), new THREE.MeshBasicMaterial({ color: '#000' })); pupil.position.z = 0.002; pupil.scale.set(0.5, 2.4, 1); e.add(pupil);
      eyes.push({ e, u: 0.15 + ER() * 0.7, v: 0.6 + ER() * 0.3, ph: ER() * 6 });
    }
    const grinShape = new THREE.Shape(); grinShape.moveTo(-0.7, 0);
    for (let i = 0; i <= 14; i++) { const x = -0.7 + i * 0.1; grinShape.lineTo(x, (i % 2 ? -0.16 : 0.0) - 0.25 * (1 - Math.pow(x / 0.7, 2))); }
    for (let i = 14; i >= 0; i--) { const x = -0.7 + i * 0.1; grinShape.lineTo(x, (i % 2 ? -0.22 : -0.36) - 0.25 * (1 - Math.pow(x / 0.7, 2)) + 0.05); }
    const grin = new THREE.Mesh(new THREE.ShapeGeometry(grinShape), new THREE.MeshBasicMaterial({ color: col('#ffb0a0').multiplyScalar(0.9), side: THREE.DoubleSide, transparent: true }));
    scene.add(grin);

    // frame helper on the sheet surface (position + normal) from material coords
    const surf = (u, v, p, t) => {
      const a = peelPos(v * L, (u - 0.5) * W * wprof(v), p, t, new THREE.Vector3());
      const b = peelPos(Math.min(L, v * L + 0.05), (u - 0.5) * W * wprof(v), p, t, new THREE.Vector3());
      const c = peelPos(v * L, (u - 0.5 + 0.02) * W * wprof(v), p, t, new THREE.Vector3());
      const tv = b.sub(a).normalize(), tu = c.sub(a).normalize();
      const n = new THREE.Vector3().crossVectors(tu, tv).normalize();
      return { p: a, tv, tu, n };
    };
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 3000);
    const look = new THREE.Vector3();
    return {
      scene, camera,
      update(t) {
        inst.update(t, core);
        shared.uDapple.value = 0; shared.uFogMax.value = 0; shared.uSunDir.value.copy(SUN);
        const p = smooth(0.7, 2.3, t);
        U.uPeel.value = p;
        deform(p, t);
        // camera: low on the road, slow push + creeping tilt up as the thing stands, tiny shake
        const k = smooth(0, 3, t);
        const shake = 0.012 * smooth(1.2, 2.0, t);
        camera.position.set(lerp(-5.6, -5.0, k) + Math.sin(t * 37) * shake, lerp(0.55, 0.5, k) + Math.cos(t * 41) * shake, lerp(1.6, 0.6, k));
        look.set(lerp(-0.2, 0.3, k), lerp(1.4, 3.0, smooth(0.6, 2.6, t)), lerp(-9.0, -8.0, k));
        camera.lookAt(look);
        // tendrils sprout from the far (top) edge of the sheet
        for (const T of tendrils) {
          const S = surf(T.u, T.v, p, t);
          T.mesh.position.copy(S.p);
          const up = S.tv.clone().multiplyScalar(1).addScaledVector(S.tu, T.lean).addScaledVector(S.n, T.tilt).normalize();
          T.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
          const grow = smooth(T.side ? 1.6 : 1.3, 2.6, t + T.u * 0.3) * T.len;
          T.mesh.scale.set(0.9 + 0.6 * (1 - Math.abs(T.u - 0.5)), Math.max(0.001, grow), 0.9);
          T.m.uniforms.uAmp.value = 0.35 + 0.2 * Math.sin(t * 2 + T.u * 9);
          T.mesh.visible = grow > 0.02;
        }
        // eyes open one after another; grin splits open below them
        const eo = smooth(1.6, 2.4, t);
        for (const E of eyes) {
          const S = surf(E.u, E.v, p, t);
          E.e.position.copy(S.p).addScaledVector(S.n, 0.02 * (S.n.dot(camera.position.clone().sub(S.p)) > 0 ? 1 : -1));
          E.e.lookAt(camera.position);
          const open = smooth(0, 0.25, eo * 1.4 - E.u * 0.4 - (E.v - 0.6));
          E.e.scale.set(1, Math.max(0.001, 0.42 * open * (0.85 + 0.15 * Math.sin(t * 9 + E.ph))), 1);
          E.e.visible = open > 0.01;
        }
        const G = surf(0.5, 0.66, p, t);
        grin.position.copy(G.p); grin.lookAt(camera.position); grin.position.addScaledVector(camera.position.clone().sub(G.p).normalize(), 0.05);
        const go = smooth(2.0, 2.6, t); grin.scale.set(1 + 0.2 * go, Math.max(0.001, go), 1); grin.visible = go > 0.01;
      },
    };
  },
};
