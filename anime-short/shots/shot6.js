// Shot 6 — frontal static view: chain-link fence, three vending machines (white / navy / red), cones + barrier tape,
// crates on pallets, yellow bicycle, utility pole + sagging wires, lime field + tree masses, overhanging canopy, dappled road.
// Layout is authored in reference-pixel space (1280x720) and projected to world space at a chosen depth.
export default {
  duration: 3.041,
  credit: null,
  post: { bloom: 0.22, bloomThreshold: 0.88, bloomRadius: 0.5, exposure: 1.0, contrast: 1.02, saturation: 1.0,
    lift: [0.05, 0.05, 0.035], vignette: 0.16, grain: 0.025, soft: 0.25, ca: 0.001 },
  build(core) {
    const { THREE, makeCloud, makeFoliage, lightRig, toon, shared, rng, lerp, NOISE_GLSL, col, paintTexture, chainLinkTexture } = core;
    const scene = new THREE.Scene();
    const FOV = 26, CAMY = 2.0;
    const F = 360 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 3000);
    camera.position.set(0, CAMY, 0);
    camera.lookAt(0, CAMY, -1);

    // pixel (1280x720 ref) + depth -> world
    const P = (px, py, d) => new THREE.Vector3((px - 640) * d / F, CAMY + (360 - py) * d / F, -d);
    const S = (pxLen, d) => pxLen * d / F;                // pixel length -> world length at depth d
    const groundD = (py) => CAMY * F / (py - 360);        // depth at which ground (y=0) appears at row py

    const SUN = new THREE.Vector3(-0.35, 0.6, 0.75).normalize();
    lightRig(scene, { sunDir: SUN.toArray(), sunColor: '#ffe9cc', sunIntensity: 1.9, sky: '#b0bcd8', ground: '#6e6c70',
      hemiIntensity: 1.05, ambient: '#6a6890', ambientIntensity: 0.5 });

    /* ---------------- sky (painted in reference-pixel space) ---------------- */
    const skyMat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uF: { value: F } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`,
      fragmentShader: `varying vec3 vDir; uniform float uTime, uF; ${NOISE_GLSL}
        vec3 hx(float r, float g, float b){ return pow(vec3(r,g,b)/255., vec3(2.2)); }
        // soft cloud layer: anisotropic fbm in a rotated frame
        float layer(vec2 p, float ang, vec2 sc, float seed){
          float c = cos(ang), s = sin(ang);
          vec2 q = mat2(c, -s, s, c) * p;
          q *= sc;
          return fbm(q + seed + vec2(uTime*0.01, 0.));
        }
        void main(){
          vec3 d = normalize(vDir);
          float z = max(-d.z, 0.001);
          vec2 px = vec2(640. + d.x / z * uF, 360. - d.y / z * uF);
          float yy = px.y / 720.;
          // base gradient
          vec3 c = mix(hx(82.,136.,170.), hx(108.,152.,178.), smoothstep(0.0, 0.32, yy));
          c = mix(c, hx(150.,182.,196.), smoothstep(0.30, 0.56, yy));
          // high diagonal cirrus streaks (upper sky)
          float ci = layer(px, -0.45, vec2(0.004, 0.022), 3.0);
          float ciMask = smoothstep(0.30, 0.0, yy) * 0.9 + smoothstep(0.42, 0.22, yy) * 0.25;
          float cA = smoothstep(0.46, 0.70, ci) * ciMask;
          float cl = layer(px + vec2(0., 6.), -0.45, vec2(0.004, 0.022), 3.0);
          vec3 cirrus = mix(hx(140.,172.,192.), hx(214.,226.,234.), smoothstep(0.50, 0.75, ci - (cl - ci) * 3.0));
          c = mix(c, cirrus, cA * 0.75);
          // puffy mid clouds (white tops)
          float pf = fbm(px * vec2(0.006, 0.011) + vec2(11.0, uTime*0.01));
          float pMask = smoothstep(0.08, 0.2, yy) * smoothstep(0.36, 0.24, yy);
          float pA = smoothstep(0.55, 0.66, pf) * pMask;
          float pTop = fbm((px + vec2(0., 7.)) * vec2(0.006, 0.011) + vec2(11.0, uTime*0.01));
          vec3 puff = mix(hx(176.,192.,208.), hx(232.,236.,240.), smoothstep(-0.02, 0.03, pf - pTop));
          c = mix(c, puff, pA * 0.8);
          // lavender / pinkish stratus band
          float st = layer(px, 0.04, vec2(0.0035, 0.02), 21.0);
          float stMask = smoothstep(0.28, 0.33, yy) * smoothstep(0.46, 0.38, yy) * smoothstep(380., 520., px.x) * smoothstep(1020., 900., px.x);
          float sA = smoothstep(0.42, 0.58, st) * stMask;
          float stTop = layer(px + vec2(0., 6.), 0.04, vec2(0.0035, 0.02), 21.0);
          vec3 strat = mix(hx(132.,134.,160.), hx(190.,186.,204.), smoothstep(-0.03, 0.03, st - stTop));
          c = mix(c, strat, sA * 0.7);
          // big white cumulus at right (px 930-1090, py 230-420)
          vec2 cq = (px - vec2(1010., 330.)) / vec2(95., 95.);
          float cu = 1.0 - length(cq * vec2(0.9, 1.0)) + (fbm(px * 0.02 + 5.0) - 0.5) * 0.9 + (vnoise(px * 0.07) - 0.5) * 0.12;
          cu = max(cu, 1.0 - length((px - vec2(900., 385.)) / vec2(80., 45.)) + (fbm(px * 0.02 + 9.0) - 0.5) * 0.8);
          float cuA = smoothstep(0.0, 0.08, cu);
          float cuL = 1.0 - length((px - vec2(985., 280.)) / vec2(120., 110.)) + (fbm(px * 0.025 + 2.0) - 0.5) * 0.6;
          vec3 cum = mix(hx(166.,184.,204.), hx(236.,240.,244.), smoothstep(0.05, 0.25, cuL));
          c = mix(c, cum, cuA);
          // horizon haze
          c = mix(c, hx(170.,196.,204.), smoothstep(0.50, 0.62, yy) * 0.5);
          gl_FragColor = vec4(c, 1.);
        }`,
      side: THREE.BackSide, depthWrite: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 64, 32), skyMat);
    sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

    /* ---------------- painted grass banks ---------------- */
    const grassBank = ({ x0, x1, yTop, yBot, d, top = '#8fcb5c', mid = '#5fa444', bot = '#3f8037', dark = '#2f6a32', tipAmp = 14, tipFreq = 0.09, seed = 1, edgeFn = '0.0' }) => {
      const a = P(x0, yTop - 40, d), b = P(x1, yBot, d);
      const w = b.x - a.x, h = a.y - b.y;
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: shared.uTime, cT: { value: col(top) }, cM: { value: col(mid) }, cB: { value: col(bot) }, cD: { value: col(dark) },
          uW: { value: x1 - x0 }, uH: { value: yBot - (yTop - 40) }, uSeed: { value: seed }, uAmp: { value: tipAmp }, uFreq: { value: tipFreq } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
        fragmentShader: `varying vec2 vUv; uniform float uTime, uW, uH, uSeed, uAmp, uFreq; uniform vec3 cT, cM, cB, cD; ${NOISE_GLSL}
          void main(){
            float px = vUv.x * uW;            // pixels from left of bank
            float py = (1.0 - vUv.y) * uH;    // pixels down from bank top (top edge nominal at 40)
            float xx = px / 1280.0;
            float wind = sin(uTime*1.6 + px*0.012) * 2.5 + sin(uTime*2.7 + px*0.031) * 1.2;
            float sx = px + wind * smoothstep(120., 0., py);
            // jagged blade tips
            float base = 40.0 + (${edgeFn});
            float n1 = vnoise(vec2(sx*uFreq, uSeed));
            float tri = abs(fract(sx*uFreq*0.9 + n1*1.7) - 0.5) * 2.0;
            float edge = base + tri * uAmp * (0.4 + 0.8*vnoise(vec2(sx*0.02, uSeed+3.))) + (fbm(vec2(sx*0.006, uSeed)) - 0.5) * 18.;
            if (py < edge) discard;
            float yy = (py - edge) / max(uH - 40., 1.);
            vec3 c = mix(cT, cM, smoothstep(0.0, 0.35, yy));
            c = mix(c, cB, smoothstep(0.35, 1.0, yy));
            // directional painted strokes (leaning right with wind)
            vec2 q = vec2(sx*0.06 + py*0.035, py*0.010);
            float s = fbm(q + uSeed);
            float s2 = vnoise(vec2(sx*0.16 + py*0.06, py*0.02 + uSeed));
            c = mix(c, cD, smoothstep(0.52, 0.72, s) * 0.55);
            c = mix(c, cT * 1.08, smoothstep(0.62, 0.85, s2) * 0.45 * (1.0 - yy*0.5));
            c *= 0.94 + 0.12 * vnoise(vec2(px*0.004, py*0.01 + uSeed));
            gl_FragColor = vec4(c, 1.);
          }`,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, -d);
      scene.add(m); return m;
    };

    /* ---------------- foliage helpers ---------------- */
    const clumpPx = (px, py, d, rpx) => { const p = P(px, py, d); return [p.x, p.y, p.z, S(rpx, d)]; };
    const inPoly = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    const fillPoly = (poly, n, rMin, rMax, d, seed, dj = 0) => {
      const r = rng(seed); const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
      const bx = [Math.min(...xs), Math.max(...xs)], by = [Math.min(...ys), Math.max(...ys)];
      const out = []; let guard = 0;
      while (out.length < n && guard++ < n * 50) {
        const x = lerp(bx[0], bx[1], r()), y = lerp(by[0], by[1], r());
        if (inPoly(x, y, poly)) out.push(clumpPx(x, y, d + (r() - 0.5) * dj, lerp(rMin, rMax, r())));
      }
      return out;
    };
    // foliage with its own key-light direction (painterly control per mass)
    const fol = (opts, lightDir) => {
      const m = makeFoliage(opts);
      if (lightDir) m.material.uniforms.uSunDir = { value: new THREE.Vector3(...lightDir).normalize() };
      scene.add(m); return m;
    };

    /* ---------------- background tree masses ---------------- */
    // right tree mass (px 1000-1280, py 210-470)
    fol({ clumps: fillPoly([[1000, 470], [1010, 330], [1050, 280], [1110, 240], [1180, 215], [1300, 205], [1300, 470]], 70, 18, 34, 60, 41, 4),
      density: 7, cardSize: S(16, 60), kind: 'round', seed: 4, texSeed: 3,
      dark: '#112e2c', mid: '#1a4a3e', light: '#2a6a52', highlight: '#4f9068', wind: 0.008, shell: 0.55, lightWrap: 0.45, flatten: 0.8 }, [-0.7, 0.6, 0.5]);
    // left mass behind fence (px 120-510, py 230-560)
    fol({ clumps: fillPoly([[110, 560], [130, 330], [260, 300], [380, 250], [440, 235], [500, 260], [515, 320], [505, 430], [500, 560]], 80, 20, 38, 40, 43, 4),
      density: 7, cardSize: S(16, 40), kind: 'round', seed: 6, texSeed: 5,
      dark: '#0f3029', mid: '#1b5a44', light: '#2f8a62', highlight: '#6cbc7c', wind: 0.01, shell: 0.55, lightWrap: 0.4, flatten: 0.85 }, [0.5, 0.6, 0.6]);
    // dark backdrop so no sky leaks through the left woods
    {
      const a0 = P(60, 300, 45), b0 = P(520, 600, 45);
      const bd = new THREE.Mesh(new THREE.PlaneGeometry(b0.x - a0.x, a0.y - b0.y), new THREE.MeshBasicMaterial({ color: col('#0f2a26') }));
      bd.position.set((a0.x + b0.x) / 2, (a0.y + b0.y) / 2, -45); scene.add(bd);
    }
    fol({ clumps: fillPoly([[60, 600], [70, 330], [200, 320], [300, 300], [400, 330], [400, 600]], 40, 22, 40, 44, 49, 2),
      density: 6, cardSize: S(16, 44), kind: 'round', seed: 10, texSeed: 11,
      dark: '#0c2622', mid: '#143c34', light: '#1f5a48', highlight: '#3f8060', wind: 0.008, shell: 0.6, lightWrap: 0.3 }, [0.5, 0.6, 0.6]);
    // low bushes behind left fence (px 120-360, py 440-540)
    fol({ clumps: fillPoly([[120, 540], [140, 470], [220, 450], [300, 440], [380, 460], [380, 545]], 22, 16, 26, 20, 47),
      density: 8, cardSize: S(14, 20), kind: 'round', seed: 8, texSeed: 7,
      dark: '#163f30', mid: '#286a46', light: '#4a9a58', highlight: '#94cf74', wind: 0.012, shell: 0.6 }, [0.3, 0.8, 0.5]);

    // grass field
    grassBank({ x0: 500, x1: 1300, yTop: 412, yBot: 640, d: 70, top: '#78b450', mid: '#5a9a42', bot: '#4a8a3c', dark: '#3a7034', tipAmp: 16, seed: 2 });
    grassBank({ x0: -20, x1: 600, yTop: 515, yBot: 640, d: 30, top: '#7ab650', mid: '#5c9c44', bot: '#467f3a', dark: '#346a32', tipAmp: 20, seed: 4 });
    grassBank({ x0: 760, x1: 1300, yTop: 490, yBot: 640, d: 30, top: '#6cab48', mid: '#55923f', bot: '#467f38', dark: '#336530', tipAmp: 22, seed: 6,
      edgeFn: '(fbm(vec2(px*0.004, 7.)) - 0.5) * 50.0' });
    grassBank({ x0: 760, x1: 1300, yTop: 560, yBot: 640, d: 16, top: '#62a044', mid: '#4f8a3c', bot: '#427636', dark: '#305f2e', tipAmp: 18, seed: 8 });

    /* ---------------- utility pole + wires ---------------- */
    const poleD = 17.3;
    const poleMat = toon({ color: '#8a7462', dapple: false });
    const poleTop = P(882, 88, poleD), poleBot = P(882, 560, poleD);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(S(7, poleD), S(9, poleD), poleTop.y - poleBot.y, 10), poleMat);
    pole.position.set(poleTop.x, (poleTop.y + poleBot.y) / 2, -poleD); scene.add(pole);
    // transformer / box + crossarm details
    const darkMetal = toon({ color: '#3a3f4a', dapple: false });
    const tb = P(884, 232, poleD - 0.2);
    scene.add(core.box(S(22, poleD), S(34, poleD), S(16, poleD), darkMetal, tb.x, tb.y, tb.z));
    for (const [py, w] of [[100, 30], [150, 26], [165, 22]]) {
      const q = P(884, py, poleD - 0.1); scene.add(core.box(S(w, poleD), S(4, poleD), S(6, poleD), darkMetal, q.x, q.y, q.z));
    }
    // wires: [px_left, py_left, px_right(at pole), py_right, sag px]
    const wireMat = new THREE.MeshBasicMaterial({ color: col('#15171f') });
    const wire = (x0, y0, x1, y1, sagPx, d, rad = 1.2) => { rad *= 1.5;
      const A = P(x0, y0, d), B = P(x1, y1, d);
      const pts = [];
      for (let i = 0; i <= 40; i++) { const t = i / 40; const p = A.clone().lerp(B, t); p.y -= S(sagPx, d) * 4 * t * (1 - t); pts.push(p); }
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, S(rad, d), 4, false), wireMat);
      scene.add(m); return m;
    };
    wire(230, 150, 878, 98, 22, poleD, 1.3);
    wire(230, 182, 878, 118, 26, poleD, 1.3);
    wire(330, 206, 878, 150, 16, poleD, 1.4);
    wire(330, 216, 878, 156, 20, poleD, 1.2);
    wire(330, 232, 878, 168, 22, poleD, 1.5);
    wire(300, 148, 878, 100, 30, poleD, 1.0);
    // right side wires
    wire(884, 94, 1300, 140, 18, poleD, 1.1);
    wire(884, 104, 1300, 150, 14, poleD, 1.1);
    wire(884, 152, 1300, 198, 10, poleD, 1.3);
    wire(884, 160, 1300, 210, 12, poleD, 1.2);

    /* ---------------- ground: sidewalk + kerb + road ---------------- */
    shared.uDapple.value = 1;
    const groundMat = toon({ color: '#8e868c' });
    const sidewalkD0 = groundD(655), sidewalkD1 = 12.6;
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(60, sidewalkD1 - sidewalkD0), groundMat);
    sw.rotation.x = -Math.PI / 2; sw.position.set(0, 0, -(sidewalkD0 + sidewalkD1) / 2); scene.add(sw);
    // kerb face (step down to road)
    const kerbMat = toon({ color: '#8a8590' });
    const kH = 0.06;
    const kerb = new THREE.Mesh(new THREE.PlaneGeometry(60, kH), kerbMat);
    kerb.position.set(0, -kH / 2, -sidewalkD0); scene.add(kerb);
    const roadMat = toon({ color: '#625e66' });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(60, sidewalkD0 - 3), roadMat);
    road.rotation.x = -Math.PI / 2; road.position.set(0, -kH, -(sidewalkD0 + 3) / 2); scene.add(road);
    // gutter line
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(60, 0.12), toon({ color: '#3a3843' }));
    gl.rotation.x = -Math.PI / 2; gl.position.set(0, -kH + 0.002, -(sidewalkD0 - 0.35)); scene.add(gl);

    /* ---------------- fence ---------------- */
    const fenceD = 12.2;
    const steel = toon({ color: '#8f9cab', dapple: false });
    const steelDark = toon({ color: '#76839a', dapple: false });
    const rod = (p1, p2, rad, mat) => {
      const a = p1, b = p2; const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 8), mat);
      m.position.copy(a).lerp(b, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      scene.add(m); return m;
    };
    const fenceBase = 616;
    // main posts (taller)
    for (const px of [425, 828, 1250]) rod(P(px, 296, fenceD), P(px, fenceBase + 4, fenceD), S(5, fenceD), steel);
    // gate panels: [x0, x1]
    const panels = [[-40, 412], [438, 818], [842, 1236], [1262, 1330]];
    const chain = chainLinkTexture(8, 2.0);
    for (const [x0, x1] of panels) {
      const y0 = 313, y1 = fenceBase - 6;
      const r = S(3.2, fenceD);
      rod(P(x0, y0, fenceD), P(x1, y0, fenceD), r, steel);
      rod(P(x0, y1, fenceD), P(x1, y1, fenceD), r * 0.8, steelDark);
      rod(P(x0, y0, fenceD), P(x0, y1, fenceD), r, steel);
      rod(P(x1, y0, fenceD), P(x1, y1, fenceD), r, steel);
      // X braces
      rod(P(x0, y0, fenceD + 0.02), P(x1, y1, fenceD + 0.02), r * 0.7, steelDark);
      rod(P(x1, y0, fenceD + 0.02), P(x0, y1, fenceD + 0.02), r * 0.7, steelDark);
      // chain-link mesh
      const tex = chain.clone(); tex.needsUpdate = true;
      const wpx = x1 - x0, hpx = y1 - y0;
      tex.repeat.set(wpx / 100, hpx / 100);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(S(wpx, fenceD), S(hpx, fenceD)),
        new THREE.MeshBasicMaterial({ color: col('#8b99a8'), alphaMap: tex, transparent: true, opacity: 0.5, depthWrite: false }));
      const c = P((x0 + x1) / 2, (y0 + y1) / 2, fenceD + 0.03); mesh.position.copy(c); scene.add(mesh);
    }
    // gate hinge clamps on the posts
    for (const px of [425, 828, 1250]) for (const py of [330, 470, 600]) {
      const q = P(px, py, fenceD - 0.03); scene.add(core.box(S(14, fenceD), S(6, fenceD), S(6, fenceD), steelDark, q.x, q.y, q.z));
    }

    /* ---------------- vending machines ---------------- */
    const bottleRow = (g, x0, x1, y, h, r, palette) => {
      let x = x0;
      while (x < x1 - 6) {
        const bw = lerp(10, 14, r()); const c = palette[Math.floor(r() * palette.length)];
        const bh = h * lerp(0.75, 1, r()); const top = y - bh; const body = bw - 3;
        // body + shoulder + neck + cap
        g.fillStyle = c; g.fillRect(x, top + bh * 0.3, body, bh * 0.7);
        g.beginPath(); g.moveTo(x, top + bh * 0.32); g.quadraticCurveTo(x + body / 2, top + bh * 0.05, x + body, top + bh * 0.32); g.fill();
        g.fillRect(x + body * 0.3, top + bh * 0.06, body * 0.4, bh * 0.2);
        g.fillStyle = r() < 0.5 ? '#f4f4f4' : palette[Math.floor(r() * palette.length)]; g.fillRect(x + body * 0.25, top, body * 0.5, bh * 0.08);
        // label band
        g.fillStyle = palette[Math.floor(r() * palette.length)]; g.fillRect(x, top + bh * 0.5, body, bh * 0.22);
        g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x + 1, top + bh * 0.34, 2, bh * 0.55);
        x += bw;
      }
    };
    const vmWhiteTex = paintTexture('s6_vm_white', 256, 512, (g, w, h, r) => {
      g.fillStyle = '#cdd2d8'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c4c8ce'; g.fillRect(0, 0, w, 20);
      // display window
      g.fillStyle = '#9fb0bf'; g.fillRect(16, 26, 200, 230);
      const pal = ['#f4f4f0', '#a7d6e6', '#e9dc6a', '#7fc98d', '#5c8fd0', '#f0b25a', '#cfe6f0', '#3f9b8a'];
      for (const y of [92, 168, 244]) { bottleRow(g, 22, 212, y - 6, 54, r, pal); g.fillStyle = '#5c6ea8'; g.fillRect(18, y - 4, 196, 8); g.fillStyle = '#f0f0f0'; for (let x = 24; x < 210; x += 14) g.fillRect(x, y - 2, 6, 4); }
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(16, 26); g.lineTo(90, 26); g.lineTo(16, 140); g.fill();
      // right narrow column of the display
      g.fillStyle = '#c9ced4'; g.fillRect(218, 26, 30, 230);
      // label panel
      g.fillStyle = '#f2f3f4'; g.fillRect(18, 272, 120, 56);
      g.fillStyle = '#3d69b8'; g.font = 'bold 18px sans-serif'; g.fillText('ラシルノ', 30, 300);
      g.fillStyle = '#5f8ad0'; g.fillRect(28, 310, 96, 6);
      // coin / buttons cluster
      g.fillStyle = '#2b2f37'; g.beginPath(); g.arc(196, 288, 18, 0, 7); g.fill();
      g.fillStyle = '#5a5e66'; g.fillRect(150, 268, 24, 30); g.fillRect(150, 306, 30, 24);
      g.fillStyle = '#2b2f37'; g.fillRect(186, 316, 26, 30); g.fillRect(150, 340, 26, 14);
      g.fillStyle = '#e0a03a'; g.fillRect(222, 270, 14, 40);
      g.fillStyle = '#6d8ec0'; g.fillRect(150, 362, 60, 20);
      g.fillStyle = '#c4c8ce'; g.fillRect(18, 340, 120, 70);
      // dispenser slot
      g.fillStyle = '#878c94'; g.fillRect(28, 420, 170, 52);
      g.fillStyle = '#3b3e46'; g.fillRect(36, 430, 154, 30);
      g.fillStyle = '#b7bcc3'; g.fillRect(0, 486, w, 26);
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(90,90,100,${r() * 0.05})`; g.fillRect(r() * w, r() * h, 6 + r() * 20, 2 + r() * 8); }
    });
    const vmNavyTex = paintTexture('s6_vm_navy', 256, 512, (g, w, h, r) => {
      g.fillStyle = '#2f3560'; g.fillRect(0, 0, w, h);
      // right silver column
      g.fillStyle = '#cfd2da'; g.fillRect(170, 0, 86, h);
      g.fillStyle = '#e5e7ec'; g.fillRect(170, 0, 12, h);
      g.fillStyle = '#1f3a8a'; g.beginPath(); g.arc(212, 34, 20, 0, 7); g.fill();
      g.fillStyle = '#f2c84a'; g.beginPath(); g.arc(207, 30, 8, 0, 7); g.fill();
      g.fillStyle = '#d0353a'; g.fillRect(200, 40, 22, 5);
      g.fillStyle = '#24272f'; g.fillRect(190, 90, 40, 90);
      g.fillStyle = '#9fb7a9'; g.fillRect(196, 100, 28, 18);
      g.fillStyle = '#555a66'; for (let i = 0; i < 4; i++) g.fillRect(196, 126 + i * 12, 28, 6);
      g.fillStyle = '#4a4e58'; g.fillRect(196, 190, 30, 26);
      g.fillStyle = '#2a2d36'; g.fillRect(200, 330, 26, 18);
      // poster (top-left)
      const gr = g.createLinearGradient(0, 10, 0, 160); gr.addColorStop(0, '#6a4a2e'); gr.addColorStop(1, '#b07038');
      g.fillStyle = gr; g.fillRect(10, 10, 152, 150);
      g.fillStyle = '#d9a466'; g.beginPath(); g.ellipse(80, 60, 44, 22, 0, 0, 7); g.fill();
      g.fillStyle = '#f2ece2'; g.beginPath(); g.moveTo(42, 64); g.lineTo(118, 64); g.lineTo(106, 140); g.lineTo(54, 140); g.closePath(); g.fill();
      g.fillStyle = '#c03030'; g.fillRect(56, 84, 48, 10);
      g.fillStyle = '#1d3f9a'; g.fillRect(60, 100, 40, 16);
      g.fillStyle = '#f7f1e6'; g.beginPath(); g.ellipse(80, 48, 30, 16, 0, 0, 7); g.fill();
      // cup buttons rows
      for (const y of [178, 210, 242]) {
        for (let x = 18; x < 160; x += 26) { g.fillStyle = '#e8e2d8'; g.fillRect(x, y, 16, 18); g.fillStyle = '#b8323a'; g.fillRect(x, y + 12, 16, 4); }
        g.fillStyle = '#c33d48'; g.fillRect(12, y + 22, 150, 4);
      }
      // lower window
      g.fillStyle = '#1f2440'; g.fillRect(50, 300, 78, 70);
      g.fillStyle = '#6e9a68'; g.fillRect(58, 308, 62, 52);
      g.fillStyle = '#a7c79a'; g.fillRect(64, 314, 30, 16);
      // bottom scribble graphic
      g.strokeStyle = '#d8dce8'; g.lineWidth = 3;
      for (let i = 0; i < 14; i++) { g.beginPath(); const x = 20 + r() * 130, y = 420 + r() * 70; g.moveTo(x, y); g.bezierCurveTo(x + 20, y - 25, x + 40, y + 20, x + 30 + r() * 30, y - 10); g.stroke(); }
      g.fillStyle = '#1d213c'; g.fillRect(0, 496, 170, 16);
    });
    const vmRedTex = paintTexture('s6_vm_red', 256, 512, (g, w, h, r) => {
      g.fillStyle = '#d9262c'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#b81f28'; g.fillRect(0, 0, w, 10);
      // display window
      g.fillStyle = '#e8e6e2'; g.fillRect(10, 18, 206, 214);
      const pal = ['#f4f4f0', '#d63a3a', '#7a4a2a', '#e8c35a', '#3b8f5a', '#5a7ed0', '#f0f0f0', '#c25a2a', '#2f2f3a'];
      for (const y of [80, 140, 200, 230]) {
        if (y === 230) { bottleRow(g, 14, 212, y - 2, 22, r, pal); continue; }
        bottleRow(g, 14, 212, y - 8, 48, r, pal);
        g.fillStyle = '#b52a32'; g.fillRect(12, y - 6, 202, 6); g.fillStyle = '#fafafa'; for (let x = 18; x < 210; x += 12) g.fillRect(x, y - 5, 5, 3);
      }
      // can graphic on the right
      g.fillStyle = '#f2ece8'; g.fillRect(218, 18, 30, 80);
      g.fillStyle = '#c7262c'; g.fillRect(224, 30, 18, 50);
      g.fillStyle = '#f5f0ec'; g.fillRect(228, 40, 4, 30);
      // buttons column
      g.fillStyle = '#e9e6e6'; g.fillRect(222, 230, 22, 40); g.fillStyle = '#2b2d36'; g.fillRect(226, 236, 14, 8); g.fillRect(226, 250, 14, 6);
      // white sticker
      g.fillStyle = '#f1efee'; g.fillRect(16, 268, 36, 70);
      g.fillStyle = '#8a8d96'; for (let i = 0; i < 6; i++) g.fillRect(20, 276 + i * 10, 26, 3);
      // white swoosh graphics
      g.strokeStyle = '#f5ece8'; g.lineCap = 'round';
      g.lineWidth = 9; g.beginPath(); g.moveTo(70, 260); g.bezierCurveTo(120, 300, 150, 300, 190, 260); g.stroke();
      g.lineWidth = 5; g.beginPath(); g.moveTo(60, 380); g.bezierCurveTo(110, 330, 170, 360, 230, 300); g.stroke();
      g.lineWidth = 7; g.beginPath(); g.moveTo(150, 470); g.bezierCurveTo(170, 430, 200, 440, 220, 400); g.stroke();
      g.fillStyle = '#efe8e4'; g.beginPath(); g.ellipse(200, 300, 16, 10, 0.5, 0, 7); g.fill();
      // dispenser slot
      g.fillStyle = '#2a2a33'; g.fillRect(36, 370, 150, 40);
      g.fillStyle = '#5a5a66'; g.fillRect(42, 376, 138, 8);
      g.fillStyle = '#e0dcdc'; g.font = '12px sans-serif'; g.fillText('取出口', 90, 400);
      g.fillStyle = '#a61c25'; g.fillRect(0, 496, w, 16);
    });
    const vm = (x0px, x1px, topPx, d, depth, tex, sideColor, topColor) => {
      const a = P(x0px, topPx, d), b = P(x1px, 0, d);
      const w = b.x - a.x, h = a.y;
      const side = toon({ color: sideColor }), top = toon({ color: topColor });
      const front = toon({ color: '#ffffff', map: tex });
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), [side, side, top, side, front, side]);
      m.position.set((a.x + b.x) / 2, h / 2, -d - depth / 2); scene.add(m); return m;
    };
    vm(365, 492, 375, groundD(632), 0.6, vmWhiteTex, '#c6cad0', '#d0d4d8');
    vm(506, 630, 360, groundD(626), 0.6, vmNavyTex, '#bfc3cc', '#c9ccd4');
    vm(637, 787, 383, groundD(640), 0.65, vmRedTex, '#c22630', '#b9202a');

    /* ---------------- cardboard boxes ---------------- */
    const cardTex = paintTexture('s6_cardboard', 128, 128, (g, w, h, r) => {
      g.fillStyle = '#a89480'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(${70 + r() * 40},${60 + r() * 30},${50 + r() * 20},${r() * 0.12})`; g.fillRect(r() * w, r() * h, 10 + r() * 30, 2 + r() * 6); }
      g.fillStyle = 'rgba(60,50,40,0.35)'; g.fillRect(0, h * 0.48, w, 4);
      g.strokeStyle = 'rgba(50,40,35,0.4)'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
    });
    const cardMat = toon({ color: '#ffffff', map: cardTex });
    const cardMatDark = toon({ color: '#a69c98', map: cardTex });
    const crate = (x0, x1, yTop, yBot, d, depth, mat, rotY = 0) => {
      const a = P(x0, yTop, d), b = P(x1, yBot, d);
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.x - a.x, a.y - b.y, depth), mat);
      m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, -d - depth / 2); m.rotation.y = rotY; scene.add(m); return m;
    };
    const bxD = groundD(620);
    crate(297, 362, 515, 620, bxD, 0.5, cardMat, 0.05);
    crate(300, 360, 465, 515, bxD + 0.05, 0.45, cardMatDark, -0.08);
    crate(230, 297, 568, 627, groundD(627), 0.45, cardMat, 0.12);
    crate(172, 230, 565, 615, groundD(615), 0.4, cardMatDark, -0.05);

    /* ---------------- cones ---------------- */
    const coneMat = toon({ color: '#e24a26' });
    const coneBand = toon({ color: '#f0b49a' });
    const coneBase = toon({ color: '#c8401f' });
    const cone = (px, pyBase, hpx) => {
      const d = groundD(pyBase);
      const p = P(px, pyBase, d); const h = S(hpx, d);
      const g = new THREE.Group();
      const c = new THREE.Mesh(new THREE.ConeGeometry(h * 0.24, h, 16), coneMat); c.position.y = h / 2 + h * 0.06; g.add(c);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.115, h * 0.15, h * 0.16, 16), coneBand); band.position.y = h * 0.56; g.add(band);
      const base = new THREE.Mesh(new THREE.BoxGeometry(h * 0.62, h * 0.06, h * 0.62), coneBase); base.position.y = h * 0.03; g.add(base);
      g.position.set(p.x, 0, -d); scene.add(g); return g;
    };
    cone(503, 650, 70);
    cone(668, 655, 66);
    cone(820, 655, 66);
    cone(996, 658, 70);
    // fallen cone at left
    {
      const d = groundD(645); const p = P(335, 645, d); const h = S(70, d);
      const c = new THREE.Mesh(new THREE.ConeGeometry(h * 0.26, h, 16), coneMat);
      c.rotation.z = Math.PI / 2 + 0.25; c.rotation.y = 0.4; c.position.set(p.x, h * 0.2, -d); scene.add(c);
    }

    /* ---------------- barrier tape ---------------- */
    const tapeTex = paintTexture('s6_tape', 256, 16, (g, w, h) => {
      g.fillStyle = '#f0c63a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#23232b';
      for (let x = -16; x < w + 16; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 15, h); g.lineTo(x + 23, 0); g.lineTo(x + 8, 0); g.closePath(); g.fill(); }
    }, { repeat: true });
    const tapeMat = toon({ color: '#ffffff', map: tapeTex, side: THREE.DoubleSide });
    const tape = (pts, widthPx = 7) => {
      const P3 = pts.map(([px, py, d]) => P(px, py, d));
      const curve = new THREE.CatmullRomCurve3(P3);
      const N = 60; const pos = [], uv = [], idx = [];
      let L = 0; let prev = null;
      for (let i = 0; i <= N; i++) {
        const t = i / N; const p = curve.getPoint(t); if (prev) L += p.distanceTo(prev); prev = p;
        const d = -p.z; const hw = S(widthPx, d) / 2;
        pos.push(p.x, p.y + hw, p.z, p.x, p.y - hw, p.z);
        uv.push(L / S(widthPx * 9, d), 1, L / S(widthPx * 9, d), 0);
        if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, tapeMat); scene.add(m); return m;
    };
    const dC = (py) => groundD(py) - 0.02;
    tape([[380, 640, dC(650)], [440, 640, dC(652)], [503, 634, dC(650)]], 6);
    tape([[503, 600, dC(650)], [560, 628, dC(652)], [620, 622, dC(653)], [668, 598, dC(655)]], 10);
    tape([[668, 598, dC(655)], [720, 605, dC(656)], [770, 620, dC(656)], [820, 610, dC(655)]], 10);
    tape([[820, 610, dC(655)], [880, 618, dC(656)], [940, 610, dC(657)], [996, 596, dC(658)]], 10);
    tape([[996, 600, dC(658)], [1010, 625, dC(658)]], 6);

    /* ---------------- crates + pallets ---------------- */
    const latticeTex = (key, base, dark) => paintTexture(key, 128, 128, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      g.fillStyle = dark;
      for (let y = 18; y < h - 14; y += 22) for (let x = 10; x < w - 10; x += 18) g.fillRect(x, y, 10, 14);
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, 0, w, 10);
    });
    const crD = groundD(612) - 0.45;
    crate(803, 873, 535, 588, crD, 0.4, toon({ color: '#ffffff', map: latticeTex('s6_gcrate', '#2f8a4a', '#16402a') }), -0.04);
    crate(880, 937, 537, 590, crD, 0.4, toon({ color: '#ffffff', map: latticeTex('s6_rcrate', '#d0303c', '#6a1a24') }), 0.05);
    const palletTex = paintTexture('s6_pallet', 128, 64, (g, w, h) => {
      g.fillStyle = '#5a4a3a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d2b07a'; g.fillRect(0, 0, w, 12); g.fillRect(0, h - 12, w, 12);
      for (const x of [0, 56, 112]) g.fillRect(x, 0, 16, h);
      g.fillStyle = 'rgba(80,60,40,0.4)'; for (let i = 0; i < 20; i++) g.fillRect(i * 7, 2, 1, 8);
    });
    const palMat = toon({ color: '#ffffff', map: palletTex });
    crate(788, 868, 588, 622, groundD(624), 0.6, palMat, 0.02);
    crate(868, 952, 588, 622, groundD(624), 0.6, palMat, -0.03);

    /* ---------------- bicycle ---------------- */
    {
      const d = fenceD - 0.25;
      const yel = toon({ color: '#e0c64a', dapple: false });
      const tyre = new THREE.MeshBasicMaterial({ color: col('#2a2a30') });
      const wheel = (cx, cy, rpx) => {
        const c = P(cx, cy, d);
        const t = new THREE.Mesh(new THREE.TorusGeometry(S(rpx, d), S(2.2, d), 6, 48), tyre); t.position.copy(c); scene.add(t);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(S(rpx - 4, d), S(0.8, d), 4, 48), new THREE.MeshBasicMaterial({ color: col('#9aa0a8') })); rim.position.copy(c); scene.add(rim);
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI; rod(P(cx + Math.cos(a) * (rpx - 4), cy + Math.sin(a) * (rpx - 4), d), P(cx - Math.cos(a) * (rpx - 4), cy - Math.sin(a) * (rpx - 4), d), S(0.35, d), steel); }
      };
      wheel(990, 583, 42); wheel(1108, 585, 42);
      const R = S(2.6, d);
      const p = (x, y) => P(x, y, d);
      rod(p(990, 583), p(1040, 585), R, yel);    // chain stay
      rod(p(990, 583), p(1018, 520), R, yel);    // seat stay
      rod(p(1040, 585), p(1015, 512), R, yel);   // seat tube
      rod(p(1018, 525), p(1088, 528), R, yel);   // top tube
      rod(p(1040, 585), p(1090, 535), R, yel);   // down tube
      rod(p(1090, 520), p(1108, 585), R, yel);   // fork
      rod(p(1088, 528), p(1092, 512), R, yel);
      rod(p(1092, 512), p(1100, 520), R, toon({ color: '#3a3a44', dapple: false }));
      const bar = new THREE.Mesh(new THREE.TorusGeometry(S(9, d), S(2, d), 6, 16, Math.PI * 1.2), toon({ color: '#3a3a44', dapple: false }));
      bar.position.copy(p(1100, 524)); bar.rotation.z = -1.2; scene.add(bar);
      const seat = core.box(S(22, d), S(6, d), S(8, d), toon({ color: '#8a3a2a', dapple: false })); seat.position.copy(p(1013, 510)); scene.add(seat);
      rod(p(1040, 585), p(1046, 600), R * 0.6, steel);
    }

    /* ---------------- painterly leaf sprays (pixel-authored, fixed camera) ---------------- */
    const leafAtlas = paintTexture('s6_leafatlas', 512, 512, (g, w, h, r) => {
      g.clearRect(0, 0, w, h);
      const leaf = (cx, cy, len, wid, rot, v = 1, serr = 0) => {
        g.save(); g.translate(cx, cy); g.rotate(rot);
        g.beginPath(); g.moveTo(0, -len / 2);
        const N = 14;
        for (let i = 0; i <= N; i++) { const t = i / N; const y = -len / 2 + t * len; const ww = wid * Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 + (i % 2) * serr); g.lineTo(ww, y); }
        for (let i = N; i >= 0; i--) { const t = i / N; const y = -len / 2 + t * len; const ww = wid * Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 + (i % 2) * serr); g.lineTo(-ww, y); }
        g.closePath();
        const c = Math.round(255 * v); g.fillStyle = `rgb(${c},${c},${c})`; g.fill();
        g.lineWidth = 3; g.strokeStyle = 'rgba(120,120,120,1)'; g.stroke();
        // lit half
        g.beginPath(); g.moveTo(0, -len / 2); g.quadraticCurveTo(wid * 0.9, 0, 0, len / 2); g.closePath();
        g.fillStyle = 'rgba(255,255,255,0.0)'; g.fill();
        g.beginPath(); g.moveTo(0, -len * 0.45); g.lineTo(0, len * 0.45); g.lineWidth = 2; g.strokeStyle = 'rgba(160,160,160,0.9)'; g.stroke();
        g.restore();
      };
      // cell 0 (0,0): single leaf
      leaf(128, 128, 220, 70, 0, 1, 0.04);
      // cell 1 (256,0): 3-leaf spray
      leaf(256 + 128, 70, 110, 38, 0.1, 0.95, 0.05); leaf(256 + 70, 150, 110, 38, -1.0, 0.9, 0.05); leaf(256 + 186, 160, 110, 38, 1.1, 1, 0.05);
      // cell 2 (0,256): cluster of small leaves
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + r(); const d = 40 + r() * 40; leaf(128 + Math.cos(a) * d, 384 + Math.sin(a) * d, 80, 30, a + Math.PI / 2 + (r() - 0.5), 0.8 + r() * 0.2, 0.06); }
      leaf(128, 384, 80, 30, r() * 3, 1, 0.06);
      // cell 3 (256,256): broad ovate leaf (foreground plant)
      leaf(384, 384, 236, 72, 0, 1, 0.02);
    }, { srgb: false });
    leafAtlas.generateMipmaps = true;

    const hashJ = (x, y) => { const s0 = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s0 - Math.floor(s0); };
    const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return lerp(lerp(hashJ(xi, yi), hashJ(xi + 1, yi), u), lerp(hashJ(xi, yi + 1), hashJ(xi + 1, yi + 1), u), v); };
    const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

    // leafSpray: leaves = [{px,py,size,rot,tone,cell}], depth d
    const leafSpray = (leaves, d, ramp, wind = 1) => {
      const n = leaves.length;
      const geo = new THREE.InstancedBufferGeometry();
      const base = new THREE.PlaneGeometry(1, 1);
      geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv;
      const aP = new Float32Array(n * 4), aQ = new Float32Array(n * 4);
      leaves.forEach((L, i) => {
        const dd = d - L.tone * 0.25 - (L.dz || 0);
        const p = P(L.px, L.py, dd);
        aP.set([p.x, p.y, p.z, S(L.size, dd)], i * 4);
        aQ.set([L.rot, L.tone, L.cell, L.ph], i * 4);
      });
      geo.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
      geo.setAttribute('aQ', new THREE.InstancedBufferAttribute(aQ, 4));
      geo.instanceCount = n;
      const mat = new THREE.ShaderMaterial({
        uniforms: { tA: { value: leafAtlas }, uTime: shared.uTime, uWind: { value: wind },
          c0: { value: col(ramp[0]) }, c1: { value: col(ramp[1]) }, c2: { value: col(ramp[2]) }, c3: { value: col(ramp[3]) } },
        vertexShader: `attribute vec4 aP; attribute vec4 aQ; uniform float uTime, uWind; varying vec2 vUv; varying float vT;
          void main(){
            float cell = aQ.z; vec2 co = vec2(mod(cell, 2.0), floor(cell / 2.0));
            vUv = (uv + co) * 0.5; vUv.y = 1.0 - ((1.0 - uv.y) + co.y) * 0.5;
            vT = aQ.y;
            float sw = sin(uTime * 1.3 + aQ.w) * 0.6 + sin(uTime * 2.3 + aQ.w * 1.7) * 0.4;
            float ang = aQ.x + sw * 0.06 * uWind;
            vec2 cs = vec2(cos(ang), sin(ang));
            vec2 o = mat2(cs.x, cs.y, -cs.y, cs.x) * position.xy * aP.w;
            vec3 c = aP.xyz + vec3(sw * 0.04 * uWind * aP.w, sw * 0.02 * uWind * aP.w, 0.);
            gl_Position = projectionMatrix * viewMatrix * vec4(c + vec3(o, 0.), 1.0);
          }`,
        fragmentShader: `uniform sampler2D tA; uniform vec3 c0, c1, c2, c3; varying vec2 vUv; varying float vT;
          void main(){
            vec4 t = texture2D(tA, vUv);
            if (t.a < 0.5) discard;
            vec3 c = mix(c0, c1, smoothstep(0.24, 0.30, vT));
            c = mix(c, c2, smoothstep(0.49, 0.55, vT));
            c = mix(c, c3, smoothstep(0.76, 0.82, vT));
            c *= mix(0.62, 1.0, smoothstep(0.5, 0.9, t.r));
            gl_FragColor = vec4(c, 1.0);
          }`,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; scene.add(m); return m;
    };
    const sprayPoly = (poly, n, seed, fn) => {
      const r = rng(seed); const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
      const bx = [Math.min(...xs), Math.max(...xs)], by = [Math.min(...ys), Math.max(...ys)];
      const out = []; let guard = 0;
      while (out.length < n && guard++ < n * 60) {
        const x = lerp(bx[0], bx[1], r()), y = lerp(by[0], by[1], r());
        if (!inPoly(x, y, poly)) continue;
        const L = fn(x, y, r); if (L) out.push({ px: x, py: y, ph: r() * 6.28, ...L });
      }
      out.sort((A, B) => A.tone - B.tone);
      return out;
    };

    /* ---------------- overhanging canopy (top corners) ---------------- */
    // top-left: near-black mass; lit leaves toward the sky opening (lower-right edge)
    const tlPoly = [[-40, -40], [545, -40], [530, 40], [500, 110], [455, 170], [420, 215], [370, 260], [310, 300], [200, 296], [100, 300], [-40, 310]];
    const tlTone = (x, y, r) => {
      const edge = smooth01(0.45, 0.95, (x + 0.85 * y) / 560);
      const patch = vn(x / 90, y / 90);
      return Math.min(1, Math.max(0, 0.02 + edge * 0.6 + (patch - 0.5) * 0.3 + (r() - 0.5) * 0.22));
    };
    leafSpray(sprayPoly(tlPoly, 260, 101, (x, y, r) => ({ size: lerp(70, 110, r()), rot: r() * 6.28, cell: 2, tone: tlTone(x, y, r) * 0.6 })), 7.2,
      ['#08160f', '#10281a', '#24502e', '#4f8a48'], 0.6);
    leafSpray(sprayPoly(tlPoly, 1600, 103, (x, y, r) => ({ size: lerp(20, 34, r()), rot: r() * 6.28, cell: r() < 0.6 ? 0 : 1, tone: tlTone(x, y, r) })), 7.0,
      ['#0a1a12', '#153424', '#2c6040', '#5e9a5a'], 1.0);
    // top-right: dark core at right, bright lime leaves toward the left / bottom
    const trPoly = [[690, -40], [1320, -40], [1320, 205], [1230, 215], [1160, 200], [1090, 180], [1040, 200], [990, 250], [940, 275], [910, 230], [880, 160], [800, 110], [720, 90], [690, 50]];
    const trTone = (x, y, r) => {
      const lit = smooth01(1080, 860, x + (y - 100) * 0.3);
      const patch = vn(x / 80, y / 80);
      return Math.min(1, Math.max(0, 0.04 + lit * 0.62 + (patch - 0.5) * 0.35 + (r() - 0.5) * 0.25));
    };
    const trCore = [[960, -40], [1320, -40], [1320, 205], [1230, 215], [1160, 200], [1090, 180], [1030, 140], [990, 80]];
    leafSpray(sprayPoly(trCore, 200, 105, (x, y, r) => ({ size: lerp(70, 110, r()), rot: r() * 6.28, cell: 2, tone: trTone(x, y, r) * 0.6 })), 7.2,
      ['#0a1d15', '#132f22', '#285634', '#4f8a48'], 0.6);
    leafSpray(sprayPoly(trPoly, 1700, 107, (x, y, r) => {
      const t = trTone(x, y, r);
      if (x < 1000 && r() < 0.35) return null;    // sparse fringe with sky gaps
      return { size: lerp(20, 34, r()), rot: r() * 6.28, cell: r() < 0.6 ? 0 : 1, tone: t };
    }), 7.0, ['#0d241a', '#1d4630', '#46845a', '#7cb46a'], 1.0);

    /* ---------------- foreground broad leaves (lower-left plant) ---------------- */
    const plPoly = [[-40, 270], [60, 275], [140, 310], [190, 400], [230, 500], [330, 590], [390, 700], [380, 740], [-40, 740]];
    leafSpray(sprayPoly(plPoly, 230, 109, (x, y, r) => {
      if (x > 200 && r() < 0.5) return null;
      const patch = vn(x / 120, y / 120);
      return { size: lerp(36, 62, r()), rot: (r() - 0.5) * 2.6 + (x > 150 ? 0.6 : -0.3), cell: 3,
        tone: Math.min(1, Math.max(0, 0.38 + (patch - 0.5) * 0.8 + (r() - 0.5) * 0.5 - smooth01(560, 720, y) * 0.3)) };
    }), 4.0, ['#0f2419', '#2a6a40', '#4f9a4c', '#8cc86a'], 1.2);

    return {
      scene, camera,
      update(t) {
        shared.uSunDir.value.copy(SUN);
        shared.uDapple.value = 1.0;
        shared.uDappleScale.value = 5.0;
        shared.uDappleCover.value = 0.69;
        shared.uDappleSpeed.value = 0.25;
        shared.uFogMax.value = 0.0;
      },
    };
  },
};
