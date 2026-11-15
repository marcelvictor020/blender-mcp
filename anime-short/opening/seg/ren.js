// Ren — stylised silhouette figure (spiky hair, open jacket with flapping tails, slim trousers), flat dark material with
// a strong rim light, glowing crimson LEFT eye. makeRen(core, { rim, sunDir }) -> { group, head, eye, update(t, wind) }
// Local: feet at origin, facing +z, height ~1.75 m.

export function rimMaterial(core, { base = '#0c080b', rim = '#ff4a20', sunDir = [0, 0.2, -1], rimPow = 2.2, rimAmt = 2.2, fill = '#2a0a10' } = {}) {
  const { THREE, col } = core;
  return new THREE.ShaderMaterial({
    uniforms: { cB: { value: col(base) }, cR: { value: col(rim) }, cF: { value: col(fill) }, uSun: { value: new THREE.Vector3(...sunDir).normalize() }, uRP: { value: rimPow }, uRA: { value: rimAmt } },
    vertexShader: `varying vec3 vN, vV; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 cB, cR, cF, uSun; uniform float uRP, uRA; varying vec3 vN, vV;
      void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; vec3 v = normalize(vV);
        float f = pow(1.0 - abs(dot(n, v)), uRP);
        float toSun = max(dot(n, uSun), 0.0);                       // surfaces turned toward the (back) light
        float rim = smoothstep(0.25, 0.45, f * (0.25 + toSun * 1.4));
        vec3 c = cB + cF * max(dot(n, vec3(0., 1., 0.)), 0.) * 0.25;
        c = mix(c, cR * uRA, rim);
        gl_FragColor = vec4(c, 1.); }`,
    side: THREE.DoubleSide,
  });
}

export function makeRen(core, o = {}) {
  const { THREE, col, rng } = core;
  const M = rimMaterial(core, o);
  const g = new THREE.Group();
  const add = (geo, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, M); m.position.set(x, y, z); parent.add(m); return m; };
  // legs (slim tapered trousers) + shoes
  const legs = [];
  for (const sx of [-0.11, 0.11]) {
    const hip = new THREE.Group(); hip.position.set(sx, 0.86, 0); g.add(hip);
    add(new THREE.CylinderGeometry(0.075, 0.055, 0.84, 10), 0, -0.42, 0, hip);
    add(new THREE.BoxGeometry(0.1, 0.07, 0.26), 0, -0.84, 0.05, hip);
    hip.rotation.z = sx > 0 ? -0.07 : 0.07; legs.push(hip);
  }
  // torso under the jacket
  const torso = add(new THREE.CylinderGeometry(0.17, 0.14, 0.56, 12), 0, 1.16, 0);
  // jacket: open shell (lathe) from shoulders to hips, flaring hem
  const prof = []; for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(0.2 + 0.035 * Math.sin(t * Math.PI) + (1 - t) * 0.04 + Math.pow(1 - t, 3) * 0.06, 0.78 + t * 0.66)); }
  const jacket = new THREE.Mesh(new THREE.LatheGeometry(prof, 20, Math.PI * 0.62, Math.PI * 1.76), M); g.add(jacket);
  // shoulders + collar
  add(new THREE.SphereGeometry(0.095, 10, 8), -0.21, 1.4, 0); add(new THREE.SphereGeometry(0.095, 10, 8), 0.21, 1.4, 0);
  const collar = add(new THREE.CylinderGeometry(0.1, 0.16, 0.12, 12, 1, true), 0, 1.47, -0.01);
  // jacket tails (flapping cloth strips at the back)
  const tails = [];
  for (const sx of [-0.12, 0.12]) {
    const geo = new THREE.PlaneGeometry(0.2, 0.55, 2, 10); geo.translate(0, -0.275, 0);
    const m = add(geo, sx, 0.9, -0.2); tails.push({ m, p0: geo.attributes.position.array.slice(), sx });
  }
  // arms (upper + fore) hanging slightly away
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.24 * sx, 1.38, 0); g.add(sh);
    add(new THREE.CylinderGeometry(0.055, 0.05, 0.32, 8), 0, -0.16, 0, sh);
    const el = new THREE.Group(); el.position.set(0, -0.32, 0); sh.add(el);
    add(new THREE.CylinderGeometry(0.05, 0.04, 0.3, 8), 0, -0.15, 0, el);
    add(new THREE.SphereGeometry(0.05, 8, 6), 0, -0.32, 0.01, el);
    sh.rotation.z = 0.12 * sx; el.rotation.x = -0.25; arms.push({ sh, el, sx });
  }
  // neck + head + spiky hair
  add(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), 0, 1.52, 0);
  const head = new THREE.Group(); head.position.set(0, 1.63, 0); g.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), M); skull.scale.set(0.92, 1.05, 1.0); head.add(skull);
  const R = rng(17);
  const spikeGeo = new THREE.ConeGeometry(0.045, 1, 6); spikeGeo.translate(0, 0.5, 0);
  for (let i = 0; i < 26; i++) {
    // spikes sweep back and up from the crown, a few fringe spikes forward/down over the brow
    const front = i < 6;
    const a = front ? (-0.8 + i * 0.32) : (R() * Math.PI * 2);
    const el = front ? -0.2 : (0.2 + R() * 1.1);
    const dir = front ? new THREE.Vector3(Math.sin(a) * 0.5, -0.8, 0.9).normalize() : new THREE.Vector3(Math.sin(a) * Math.cos(el), Math.sin(el) + 0.3, Math.cos(a) * Math.cos(el) - 0.9).normalize();
    const s = new THREE.Mesh(spikeGeo, M); s.position.copy(dir.clone().multiplyScalar(0.07)).add(new THREE.Vector3(0, 0.03, -0.01));
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const L = front ? 0.12 + R() * 0.06 : 0.16 + R() * 0.16; s.scale.set(1 + R() * 0.6, L, 1 + R() * 0.6); head.add(s);
  }
  // crimson left eye (Ren's left = -x when facing +z) + glow sprite
  const eyeM = new THREE.MeshBasicMaterial({ color: col('#ff2010').multiplyScalar(4) });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), eyeM); eye.position.set(0.042, 0.0, 0.1); eye.scale.set(1.6, 0.7, 0.5); head.add(eye);
  return {
    group: g, head, eye, eyeM, mat: M,
    update(t, wind = 1) {
      for (const T of tails) {
        const pa = T.m.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          const y = T.p0[i * 3 + 1], k = -y / 0.55;
          pa.setZ(i, -k * k * 0.35 * wind - Math.sin(t * 11 + k * 4 + T.sx * 9) * 0.06 * k * wind);
          pa.setX(i, T.p0[i * 3] + Math.sin(t * 7 + k * 3) * 0.03 * k * wind);
        }
        pa.needsUpdate = true; T.m.geometry.computeVertexNormals();
      }
      arms.forEach((A, i) => { A.sh.rotation.x = 0.06 * Math.sin(t * 1.3 + i); });
    },
  };
}
