// Simple modelled white egret (body, S-neck, head + beak, trailing legs, two-segment flapping wings) with a
// backlit rim shader. makeEgret(core, { body, shade, rim, sunDir }) -> { group, update(t, flapPhase, flapAmp) }
// Local axes: +z = forward (head), +y = up, x = right wing. Size ~ 1 m long, 1.6 m span.

export function egretMaterial(core, { body = '#f4f2ea', shade = '#8a90b8', rim = '#ffe2a0', sunDir = [0, 0.2, -1], rimPow = 2.5, rimAmt = 1.4, side } = {}) {
  const { THREE, col } = core;
  return new THREE.ShaderMaterial({
    uniforms: { cB: { value: col(body) }, cS: { value: col(shade) }, cR: { value: col(rim) }, uSun: { value: new THREE.Vector3(...sunDir).normalize() }, uRP: { value: rimPow }, uRA: { value: rimAmt } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 cB, cS, cR, uSun; uniform float uRP, uRA; varying vec3 vN; varying vec3 vV;
      void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; float l = dot(n, uSun);
        vec3 c = mix(cS, cB, smoothstep(-0.05, 0.15, l));                     // 2-tone anime shading
        float f = pow(1.0 - abs(dot(n, vV)), uRP);
        float back = smoothstep(-0.2, 0.6, dot(-vV, uSun));                   // stronger rim when backlit
        c += cR * smoothstep(0.35, 0.55, f) * uRA * (0.35 + back);
        gl_FragColor = vec4(c, 1.); }`,
    side: side ?? THREE.DoubleSide,
  });
}

export function makeEgret(core, o = {}) {
  const { THREE } = core;
  const mat = egretMaterial(core, o);
  const dark = new THREE.MeshBasicMaterial({ color: new THREE.Color(o.legs || '#14100c') });
  const beakM = egretMaterial(core, { ...o, body: '#f0b830', shade: '#a0602a' });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat); body.scale.set(0.17, 0.15, 0.36); g.add(body);
  // S-curved neck
  const neckCurve = new THREE.CatmullRomCurve3([[0, 0.05, 0.28], [0, 0.16, 0.42], [0, 0.3, 0.36], [0, 0.4, 0.46], [0, 0.42, 0.56]].map(p => new THREE.Vector3(...p)));
  const neck = new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 24, 0.045, 8), mat); g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 10), mat); head.position.set(0, 0.43, 0.58); head.scale.set(0.9, 0.9, 1.2); g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.22, 8), beakM); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.42, 0.73); g.add(beak);
  // tail
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 8), mat); tail.rotation.x = -Math.PI / 2; tail.position.set(0, 0.01, -0.42); tail.scale.set(1, 0.4, 1); g.add(tail);
  // legs trailing back (dark), bent while taking off
  const legs = new THREE.Group(); g.add(legs); legs.position.set(0, -0.06, -0.15);
  for (const sx of [-0.04, 0.04]) {
    const L = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5), dark); L.position.set(sx, 0, -0.3); L.rotation.x = Math.PI / 2; legs.add(L);
  }
  // wings: inner + outer panels from a feathered outline
  const wingShape = (len, root, tip, notch) => {
    const s = new THREE.Shape(); s.moveTo(0, root * 0.5); s.lineTo(len, tip * 0.6);
    const n = notch; for (let i = 0; i <= n; i++) { const x = len - (i / n) * len; const y = -root * 0.5 - (i % 2 ? 0.03 : 0) - Math.sin(i / n * Math.PI) * 0.03; s.lineTo(x, y - (1 - i / n) * (tip * 0.4)); }
    s.lineTo(0, root * 0.5); return new THREE.ShapeGeometry(s);
  };
  const wings = [];
  for (const sd of [1, -1]) {
    const sh = new THREE.Group(); sh.position.set(0.1 * sd, 0.06, 0.06); g.add(sh);
    const inner = new THREE.Mesh(wingShape(0.42, 0.34, 0.3, 6), mat); inner.rotation.x = -Math.PI / 2; sh.add(inner);
    const el = new THREE.Group(); el.position.set(0.4, 0, 0); sh.add(el);
    const outer = new THREE.Mesh(wingShape(0.48, 0.3, 0.14, 8), mat); outer.rotation.x = -Math.PI / 2; el.add(outer);
    if (sd < 0) sh.scale.x = -1;
    wings.push({ sh, el, sd });
  }
  return {
    group: g, mat, legs, neck,
    // phase in cycles; amp 0..1. Downstroke = wings sweep down and forward.
    flap(phase, amp = 1) {
      const a = Math.sin(phase * Math.PI * 2);
      for (const w of wings) {
        w.sh.rotation.z = (0.25 + a * 0.85 * amp) * (w.sd > 0 ? 1 : -1) * (w.sd > 0 ? 1 : 1);
        w.el.rotation.z = (Math.sin(phase * Math.PI * 2 - 0.9) * 0.55 * amp);
        w.sh.rotation.y = -0.15 * a * amp * w.sd;
      }
    },
  };
}
