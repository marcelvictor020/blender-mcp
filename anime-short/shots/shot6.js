// Shot 6 — frontal static view: chain-link fence, three vending machines (white / navy / red), cones + barrier tape,
// crates on pallets, yellow bicycle, utility pole + sagging wires, lime field + tree masses, overhanging canopy, dappled road.
// Layout is authored in reference-pixel space (1280x720) and projected to world space at a chosen depth.
// REALISM PASS: props are modelled geometry with physically based materials (pbr.js), one shadow-casting sun,
// leaf-shadow dapple on direct light, PMREM reflections; the field behind the fence is instanced, lit grass blades.
import { pbrUniforms, pbr, makeEnvMap, addSunShadow, canvasTex, texSet } from '../pbr.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export default {
  duration: 3.041,
  credit: null,
  post: { bloom: 0.22, bloomThreshold: 0.88, bloomRadius: 0.5, exposure: 1.0, contrast: 1.03, saturation: 1.08,
    lift: [0.05, 0.05, 0.035], vignette: 0.16, grain: 0.025, soft: 0.25, ca: 0.001 },
  build(core) {
    const { THREE, makeFoliage, shared, rng, lerp, NOISE_GLSL, col, paintTexture, chainLinkTexture } = core;
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

    /* ---------------- lighting: one shadow-casting sun + sky env + leaf-shadow dapple ---------------- */
    const SUN = new THREE.Vector3(-0.5, 0.58, 0.64).normalize();
    shared.uSunDir.value.copy(SUN);
    const env = makeEnvMap('s6_env', {
      zenith: '#3b82bc', horizon: '#b4ccd8', ground: '#262830', sunDir: SUN.toArray(), sunColor: '#ffeed8', sunPower: 18,
      clouds: [{ dir: [0.5, 0.3, -1], size: 6, power: 1.5 }, { dir: [-0.6, 0.5, -0.8], size: 5, power: 1.2 }],
      blocks: [
        { dir: [0, 1], w: 44, h: 16, dist: 9, y: 1, color: '#0f2018' },     // canopy / trees behind the camera
        { dir: [-1, 0.2], w: 24, h: 12, dist: 10, color: '#14281e' },
        { dir: [0, -1], w: 50, h: 2.2, dist: 14, color: '#4d8a3c' },       // sunlit field ahead
        { dir: [1, -0.6], w: 20, h: 9, dist: 30, color: '#1d4a3a' },
      ],
    });
    const UNI = (o) => pbrUniforms({ sunDir: SUN.toArray(), leafScale: 6.5, leafSharp: 0.2, leafSeed: 4.0, grime: 0, ...o });
    const UG = UNI({ leafAmt: 1, leafCover: 0.38, leafScale: 6.5, leafSharp: 0.14, leafSeed: 9.0 });               // ground under the canopy
    const UM = UNI({ leafAmt: 0.86, leafCover: 0.52, leafSharp: 0.24, grime: 0.1, leafSeed: 9.0 });   // machines / props
    const UF = UNI({ leafAmt: 0.5, leafCover: 0.35 });
    const UP = UNI({ leafAmt: 0.86, leafCover: 0.52, leafSharp: 0.24, leafSeed: 9.0, sunGain: 0.55 });  // products behind (dusty) glass           // fence / bike (mostly open sun)
    const UO = UNI({ leafAmt: 0 });                               // pole (full sun)
    const sunLight = addSunShadow(scene, { sunDir: SUN.toArray(), color: '#ffd9a6', intensity: 3.6,
      target: new THREE.Vector3(0.4, 1.0, -11.8), radius: 6.5, mapSize: 2048 });
    sunLight.shadow.bias = -0.0003; sunLight.shadow.normalBias = 0.01;
    scene.add(new THREE.HemisphereLight(col('#8eaee6'), col('#463c4c'), 0.6));
    // pbr material with an anisotropic (diagonal, streaky) leaf-shadow cookie like the reference's dapple
    const M = (u, o, key = 's6') => {
      const m = pbr(u, { envMap: env, envMapIntensity: 0.9, ...o }, null, key); const ob = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => { ob(sh, r); sh.fragmentShader = sh.fragmentShader.replace('vec2 q = vec2(dot(p, t1), dot(p, t2)) * uLeafScale + uLeafSeed;',
        'vec2 q = mat2(0.8, 0.6, -0.6, 0.8) * vec2(dot(p, t1), dot(p, t2)); q = q * uLeafScale * vec2(0.85, 1.12) + uLeafSeed;')
        .replace('float lit = open * (1.0 - 0.9 * l1) * (1.0 - 0.55 * l2) * (1.0 - 0.8 * tw);',
          'float l3 = leafCells(q * 1.45 + vec2(5.3, 1.9)); float lit = open * (1.0 - 0.95 * l1) * (1.0 - 0.9 * l2) * (1.0 - 0.85 * l3) * (1.0 - 0.8 * tw);'); };
      m.customProgramCacheKey = () => key + '_s6a'; return m;
    };
    const add = (geo, mat, parent = scene, cast = true, recv = true) => {
      const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; parent.add(m); return m; };
    const rbox = (w, h, d, r = 0.01, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
    const rodGeo = (a, b, rad, seg = 8) => {
      const len = a.distanceTo(b); const g = new THREE.CylinderGeometry(rad, rad, len, seg, 1);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.applyQuaternion(q); const m = a.clone().lerp(b, 0.5); g.translate(m.x, m.y, m.z); return g;
    };
    const rod = (a, b, rad, mat, parent = scene, seg = 8) => add(rodGeo(a, b, rad, seg), mat, parent);
    // soft contact shadow decal (blurred rectangle) on the ground
    const blobTex = canvasTex(128, 128, (g, w, h) => { g.filter = 'blur(10px)'; g.fillStyle = '#fff'; g.fillRect(24, 24, w - 48, h - 48); }, false);
    const blobMat = new THREE.MeshBasicMaterial({ color: col('#05060c'), alphaMap: blobTex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.7 });
    const contact = (cx, cz, w, d, op = 0.7, y = 0.003) => {
      const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, op === 0.7 ? blobMat : blobMat.clone()); if (op !== 0.7) m.material.opacity = op;
      m.position.set(cx, y, cz); m.renderOrder = 2; scene.add(m); return m;
    };
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
          float cA = smoothstep(0.42, 0.68, ci) * ciMask;
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
    sky.renderOrder = 100; sky.frustumCulled = false; scene.add(sky);  // drawn last among opaques: only shades uncovered pixels

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
      density: 4, maxCards: 9000, cardSize: S(20, 60), kind: 'round', seed: 4, texSeed: 3,
      dark: '#0e2826', mid: '#163f36', light: '#235c48', highlight: '#42825e', wind: 0.008, shell: 0.55, lightWrap: 0.45, flatten: 0.8 }, [-0.7, 0.6, 0.5]);
    // left mass behind fence (px 120-510, py 230-560)
    fol({ clumps: fillPoly([[110, 560], [130, 330], [260, 300], [380, 250], [440, 235], [500, 260], [515, 320], [505, 430], [500, 560]], 80, 20, 38, 40, 43, 4),
      density: 4, maxCards: 9000, cardSize: S(20, 40), kind: 'round', seed: 6, texSeed: 5,
      dark: '#0b231f', mid: '#133f33', light: '#21654a', highlight: '#46905e', wind: 0.01, shell: 0.55, lightWrap: 0.4, flatten: 0.85 }, [0.5, 0.6, 0.6]);
    // dark backdrop so no sky leaks through the left woods
    {
      const a0 = P(60, 300, 45), b0 = P(520, 600, 45);
      const bd = new THREE.Mesh(new THREE.PlaneGeometry(b0.x - a0.x, a0.y - b0.y), new THREE.MeshBasicMaterial({ color: col('#0f2a26') }));
      bd.position.set((a0.x + b0.x) / 2, (a0.y + b0.y) / 2, -45); scene.add(bd);
    }
    fol({ clumps: fillPoly([[60, 600], [70, 330], [200, 320], [300, 300], [400, 330], [400, 600]], 40, 22, 40, 44, 49, 2),
      density: 3, maxCards: 5000, cardSize: S(22, 44), kind: 'round', seed: 10, texSeed: 11,
      dark: '#0c2622', mid: '#143c34', light: '#1f5a48', highlight: '#3f8060', wind: 0.008, shell: 0.6, lightWrap: 0.3 }, [0.5, 0.6, 0.6]);
    // low bushes behind left fence (px 120-360, py 440-540)
    fol({ clumps: fillPoly([[120, 540], [140, 470], [220, 450], [300, 440], [380, 460], [380, 545]], 22, 16, 26, 20, 47),
      density: 8, cardSize: S(14, 20), kind: 'round', seed: 8, texSeed: 7,
      dark: '#163f30', mid: '#286a46', light: '#4a9a58', highlight: '#94cf74', wind: 0.012, shell: 0.6 }, [0.3, 0.8, 0.5]);

    // distant field (painted, only shows through gaps in the blade tops)
    grassBank({ x0: 500, x1: 1300, yTop: 418, yBot: 560, d: 70, top: '#6ca648', mid: '#528e3e', bot: '#447e38', dark: '#346630', tipAmp: 10, seed: 2 });

    /* ---------------- lush grass field behind the fence: instanced curved blades, sun-lit per blade ---------------- */
    const grassUniforms = {
      uTime: shared.uTime, uSun: { value: SUN.clone() },
      cRoot: { value: col('#2c5230') }, cMid: { value: col('#50a646') }, cTip: { value: col('#9ad86a') }, cDry: { value: col('#a4cc66') },
      cDark: { value: col('#2c5a2a') }, cSky: { value: col('#5d86a8') }, cSunC: { value: col('#fff0d2') }, cHaze: { value: col('#9cc0b8') },
      uSunI: { value: 1.2 }, uSkyI: { value: 0.66 },
    };
    const grassField = (blades) => {
      const n = blades.length; const segs = 5; const pos = [], idx = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs; const ww = 0.5 * (1 - Math.pow(t, 1.7)) * (0.75 + 0.25 * Math.sin(Math.min(1, t * 3.0) * 1.57));
        if (i < segs) pos.push(-ww, t, 0, ww, t, 0); else pos.push(0, 1, 0);
      }
      for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      idx.push((segs - 1) * 2, (segs - 1) * 2 + 1, segs * 2);
      const ig = new THREE.InstancedBufferGeometry(); ig.setIndex(idx); ig.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const aO = new Float32Array(n * 4), aS = new Float32Array(n * 4);
      blades.forEach((b, i) => { aO.set(b.o, i * 4); aS.set(b.s, i * 4); });
      ig.setAttribute('aO', new THREE.InstancedBufferAttribute(aO, 4)); ig.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
      ig.instanceCount = n;
      const mat = new THREE.ShaderMaterial({
        uniforms: grassUniforms, side: THREE.DoubleSide,
        vertexShader: `attribute vec4 aO; attribute vec4 aS; uniform float uTime;
          varying vec3 vN, vW, vWd; varying float vT, vX, vP, vQ, vR;
          ${NOISE_GLSL}
          void main(){
            float t = position.y; float h = aS.x;
            float c = cos(aO.w), s = sin(aO.w);
            vec3 Wd = vec3(c, 0., -s), Fd = vec3(s, 0., c);
            vec2 gp = aO.xz * vec2(0.09, 0.16) + vec2(-uTime * 0.6, uTime * 0.12);
            float gust = vnoise(gp) * 0.75 + vnoise(gp * 2.3 + 3.7) * 0.35;
            float flutter = sin(uTime * 3.3 + aS.w * 31.0 + aO.x * 1.7) * 0.05 + sin(uTime * 5.1 + aS.z * 17.0) * 0.025;
            vec3 windD = normalize(vec3(1.0, 0.0, 0.2));
            float clump = vnoise(aO.xz * 0.75 + 11.0);
            vec3 bendV = Fd * (aS.z - 0.45) * 0.45 + windD * (0.22 + clump * 0.35 + gust * 0.4 + flutter) + vec3(0., 0., 0.12);
            vec3 p = aO.xyz + Wd * position.x * aS.y + vec3(0., t * h, 0.);
            vec3 off = bendV * h * t * t;
            p += off; p.y -= dot(off, off) / max(h, 0.01) * 0.45;
            vec3 tang = normalize(vec3(0., h, 0.) + 2.0 * bendV * h * t);
            vN = normalize(cross(Wd, tang));
            vWd = Wd; vW = p; vT = t; vX = position.x * 2.0 / max(1.0 - pow(t, 1.7), 0.05);
            vP = fbm(aO.xz * 0.11 + 3.0); vQ = clump * 0.7 + vnoise(aO.xz * 2.3 + 7.0) * 0.3; vR = aS.w;
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
          }`,
        fragmentShader: `uniform vec3 uSun, cRoot, cMid, cTip, cDry, cDark, cSky, cSunC, cHaze; uniform float uSunI, uSkyI, uTime;
          varying vec3 vN, vW, vWd; varying float vT, vX, vP, vQ, vR;
          ${NOISE_GLSL}
          void main(){
            vec3 V = normalize(cameraPosition - vW);
            vec3 N = normalize(vN + vWd * clamp(vX, -1., 1.) * 0.55);
            if (dot(N, V) < 0.0) N = -N;
            vec3 L = normalize(uSun);
            // albedo: dark roots -> saturated mid -> light tips, clump variation (dry / lush / dark patches)
            vec3 alb = mix(cRoot, cMid, smoothstep(0.0, 0.55, vT));
            alb = mix(alb, cTip, smoothstep(0.55, 1.0, vT) * (0.45 + 0.55 * vR));
            alb = mix(alb, cDry * mix(0.8, 1.05, vT), smoothstep(0.55, 0.8, vP) * 0.45);
            alb = mix(alb, cDark, smoothstep(0.45, 0.2, vP) * 0.5);
            alb *= 0.62 + 0.62 * vQ;
            float ndl = dot(N, L);
            float diff = max(ndl, 0.0) * 0.8 + 0.2 * (ndl * 0.5 + 0.5);
            float trans = max(-ndl, 0.0) * 0.35;
            float ao = mix(0.35, 1.0, smoothstep(0.0, 0.7, vT));
            float self = mix(0.7, 1.0, smoothstep(0.05, 0.75, vT));                      // canopy self-shadowing toward roots
            float cloud = mix(0.42, 1.0, smoothstep(0.34, 0.6, fbm(vW.xz * vec2(0.07, 0.11) + vec2(uTime * 0.04, 0.0) + 4.0)));
            vec3 sunC = cSunC * uSunI * cloud * self;
            vec3 col = alb * (sunC * (diff + trans * vec3(1.1, 1.25, 0.6)) + cSky * uSkyI * ao);
            vec3 H = normalize(L + V);
            col += sunC * pow(max(dot(N, H), 0.0), 24.0) * 0.12 * vT;
            float dist = length(vW - cameraPosition);
            col = mix(col, cHaze, smoothstep(12.0, 45.0, dist) * 0.3);
            gl_FragColor = vec4(col, 1.);
          }`,
      });
      const m = new THREE.Mesh(ig, mat); m.frustumCulled = false; scene.add(m); return m;
    };
    {
      const r = rng(606); const blades = [];
      const zNear = 12.45;
      const push = (x, z, h0, h1, w0, w1) => blades.push({ o: [x, 0, -z, r() * Math.PI * 2], s: [lerp(h0, h1, Math.pow(r(), 0.8)), lerp(w0, w1, r()), r(), r()] });
      // right field (behind the red machine to the right edge): tall grass, far edge recedes on the left, nearer on the right
      for (let i = 0; i < 42000; i++) {
        const x = lerp(0.6, 16, r());
        const zFar = lerp(31, 21, Math.min(1, Math.max(0, (x - 4.5) / 3.5)));
        const z = zNear + Math.pow(r(), 1.25) * (zFar - zNear);
        const hb = 0.95 + 0.18 * Math.sin(x * 0.7 + z * 0.3);
        push(x, z, hb * 0.78, hb * 1.12, 0.034, 0.066);
      }
      // left strip (in front of the bushes): shorter grass
      for (let i = 0; i < 11000; i++) {
        const x = lerp(-14, -1.0, r()); const z = lerp(zNear, 16.5, Math.pow(r(), 1.2));
        push(x, z, 0.45, 0.74, 0.03, 0.058);
      }
      grassField(blades);
    }

    /* ---------------- utility pole (wooden), crossarms, insulators, transformer + wires ---------------- */
    const poleD = 17.3;
    const poleTop = P(882, 88, poleD), poleBot = P(882, 560, poleD);
    {
      const woodPole = texSet(64, 512, (g, w, h) => {
        g.fillStyle = '#868a8c'; g.fillRect(0, 0, w, h); const r = rng(17);
        for (let i = 0; i < 70; i++) { const x = r() * w; g.fillStyle = `rgba(${40 + r() * 50},${30 + r() * 40},${25 + r() * 30},${0.25 + r() * 0.35})`; g.fillRect(x, 0, 1 + r() * 2.5, h); }
        for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(20,16,12,${0.3 + r() * 0.3})`; g.fillRect(r() * w, r() * h, 1, 8 + r() * 40); }
      }, { normalStrength: 2.5, roughBase: 0.85 });
      const pm = M(UO, { color: '#ffffff', map: woodPole.map, normalMap: woodPole.normalMap, roughnessMap: woodPole.roughnessMap, roughness: 1 }, 's6pole');
      const ph = poleTop.y - poleBot.y;
      add(new THREE.CylinderGeometry(S(6, poleD), S(7.5, poleD), ph, 16), pm).position.set(poleTop.x, (poleTop.y + poleBot.y) / 2, -poleD);
      const steelD = M(UO, { color: '#4a4f58', roughness: 0.55, metalness: 0.6 }, 's6pm');
      const galv = M(UO, { color: '#8e959e', roughness: 0.45, metalness: 0.7 }, 's6pm');
      const porcelain = M(UO, { color: '#d9dcdf', roughness: 0.25, clearcoat: 0.6 }, 's6pm');
      // crossarms with insulators
      for (const [py, wpx] of [[100, 34], [150, 28], [165, 24]]) {
        const q = P(884, py, poleD - 0.05); const L = S(wpx, poleD);
        add(new THREE.BoxGeometry(L, 0.045, 0.06), galv).position.copy(q);
        for (const sx of [-0.42, 0.42]) {
          const ins = add(new THREE.CylinderGeometry(0.018, 0.024, 0.07, 10), porcelain); ins.position.set(q.x + sx * L, q.y + 0.055, q.z);
          for (let k = 0; k < 3; k++) add(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 10), porcelain).position.set(q.x + sx * L, q.y + 0.035 + k * 0.022, q.z);
        }
      }
      // pole-mounted transformer: can with lid, fins, bushings, mounting band
      const tb = P(884, 232, poleD - 0.22);
      const tw = S(22, poleD), th = S(34, poleD);
      add(rbox(tw, th, tw * 0.9, 0.02, 2), steelD).position.copy(tb);
      add(rbox(tw * 1.08, 0.025, tw, 0.008, 1), steelD).position.set(tb.x, tb.y + th / 2 + 0.01, tb.z);
      for (let k = -2; k <= 2; k++) add(new THREE.BoxGeometry(0.008, th * 0.8, tw * 1.05), steelD).position.set(tb.x + k * tw * 0.18, tb.y - 0.01, tb.z);
      for (const sx of [-0.25, 0.25]) add(new THREE.CylinderGeometry(0.012, 0.016, 0.06, 8), porcelain).position.set(tb.x + sx * tw, tb.y + th / 2 + 0.05, tb.z);
      for (const dy of [-0.3, 0.3]) add(new THREE.TorusGeometry(S(6.6, poleD), 0.008, 5, 16).rotateX(Math.PI / 2), galv).position.set(poleTop.x, tb.y + dy * th, -poleD);
      // step bolts
      for (let k = 0; k < 7; k++) {
        const y = tb.y - 0.5 - k * 0.42; const sx = k % 2 ? 1 : -1;
        add(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6).rotateZ(Math.PI / 2), galv).position.set(poleTop.x + sx * S(7, poleD), y, -poleD);
      }
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
    wire(884, 94, 1300, 140, 18, poleD, 1.1);
    wire(884, 104, 1300, 150, 14, poleD, 1.1);
    wire(884, 152, 1300, 198, 10, poleD, 1.3);
    wire(884, 160, 1300, 210, 12, poleD, 1.2);

    /* ---------------- ground: asphalt sidewalk, concrete kerb blocks, asphalt road (PBR, dappled, receives shadows) ---------------- */
    const sidewalkD0 = groundD(655), swFar = 13.8, kerbH = 0.08, kerbW = 0.2;
    const worldUV = (geo, s) => { const p = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / s, -p.getZ(i) / s); return geo; };
    const asphalt = (seed, base, speck) => texSet(512, 512, (g, w, h) => {
      const r = rng(seed); g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { const x = r() * w, y = r() * h, rr = 30 + r() * 90; const gr = g.createRadialGradient(x, y, 0, x, y, rr);
        const v = r() < 0.5 ? '20,20,24' : '150,146,140'; gr.addColorStop(0, `rgba(${v},${0.06 + r() * 0.08})`); gr.addColorStop(1, `rgba(${v},0)`); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
      for (let i = 0; i < 16000; i++) { const v = r() < 0.5 ? 30 + r() * 30 : speck + r() * 60; g.fillStyle = `rgba(${v | 0},${v | 0},${(v + 6) | 0},${0.35 + r() * 0.5})`; const s = 0.8 + r() * 2.2; g.fillRect(r() * w, r() * h, s, s); }
      g.strokeStyle = 'rgba(18,18,22,0.55)'; g.lineWidth = 1.3;
      for (let i = 0; i < 4; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 14; k++) { x += (r() - 0.5) * 36; y += (r() - 0.4) * 26; g.lineTo(x, y); } g.stroke(); }
    }, { normalStrength: 2.2, roughBase: 0.88, roughVar: 0.25 });
    const swT = asphalt(61, '#686468', 115), rdT = asphalt(67, '#5a585e', 100);
    const swGeo = worldUV(new THREE.PlaneGeometry(40, swFar - sidewalkD0 - kerbW).rotateX(-Math.PI / 2).translate(0, 0, -(sidewalkD0 + kerbW + swFar) / 2), 1.6);
    add(swGeo, M(UG, { map: swT.map, normalMap: swT.normalMap, roughnessMap: swT.roughnessMap, color: '#ffffff', envMapIntensity: 0.55 }, 's6gnd'), scene, false, true);
    const rdGeo = worldUV(new THREE.PlaneGeometry(40, sidewalkD0 - 2.5).rotateX(-Math.PI / 2).translate(0, -kerbH, -(sidewalkD0 + 2.5) / 2), 2.0);
    add(rdGeo, M(UG, { map: rdT.map, normalMap: rdT.normalMap, roughnessMap: rdT.roughnessMap, color: '#ffffff', envMapIntensity: 0.55 }, 's6gnd'), scene, false, true);
    {
      const kT = texSet(256, 256, (g, w, h) => { const r = rng(71); g.fillStyle = '#9a948e'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 5000; i++) { const v = 90 + r() * 100; g.fillStyle = `rgba(${v | 0},${(v - 4) | 0},${(v - 8) | 0},${0.3 + r() * 0.4})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
        for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(60,55,50,${0.08 + r() * 0.12})`; g.fillRect(r() * w, 0, 8 + r() * 30, h); }
      }, { normalStrength: 2.0, roughBase: 0.85 });
      const kM = M(UG, { map: kT.map, normalMap: kT.normalMap, roughnessMap: kT.roughnessMap, color: '#ffffff', envMapIntensity: 0.6 }, 's6gnd');
      const bl = 0.6, N = 34; const kg = rbox(bl - 0.006, kerbH + 0.02, kerbW, 0.012, 2);
      const im = new THREE.InstancedMesh(kg, kM, N); im.castShadow = im.receiveShadow = true;
      const m4 = new THREE.Matrix4(); const r = rng(73);
      for (let i = 0; i < N; i++) { m4.makeTranslation(-10 + i * bl + (r() - 0.5) * 0.004, -kerbH / 2 + 0.002 + (r() - 0.5) * 0.004, -sidewalkD0 - kerbW / 2); im.setMatrixAt(i, m4); }
      scene.add(im);
    }

    /* ---------------- fence: galvanised pipe posts, rails, X braces, chain-link mesh ---------------- */
    const fenceD = 12.2;
    const steel = M(UF, { color: '#aab6c4', roughness: 0.5, metalness: 0.55 }, 's6steel');
    const steelDark = M(UF, { color: '#8e9aaa', roughness: 0.55, metalness: 0.5 }, 's6steel');
    const fenceBase = 616;
    for (const px of [425, 828, 1250]) {
      const a = P(px, 296, fenceD), b = P(px, fenceBase + 4, fenceD); b.y = -0.05;
      rod(a, b, S(5, fenceD), steel, scene, 14);
      const cap = add(new THREE.SphereGeometry(S(5.6, fenceD), 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel); cap.position.copy(a);
    }
    const panels = [[-40, 412], [438, 818], [842, 1236], [1262, 1330]];
    const chain = chainLinkTexture(8, 2.0);
    for (const [x0, x1] of panels) {
      const y0 = 313, y1 = fenceBase - 6;
      const r = S(3.2, fenceD);
      rod(P(x0, y0, fenceD), P(x1, y0, fenceD), r, steel, scene, 10);
      rod(P(x0, y1, fenceD), P(x1, y1, fenceD), r * 0.8, steelDark, scene, 10);
      rod(P(x0, y0, fenceD), P(x0, y1, fenceD), r, steel, scene, 10);
      rod(P(x1, y0, fenceD), P(x1, y1, fenceD), r, steel, scene, 10);
      rod(P(x0, y0, fenceD + 0.02), P(x1, y1, fenceD + 0.02), r * 0.7, steelDark);
      rod(P(x1, y0, fenceD + 0.02), P(x0, y1, fenceD + 0.02), r * 0.7, steelDark);
      const tex = chain.clone(); tex.needsUpdate = true;
      const wpx = x1 - x0, hpx = y1 - y0;
      tex.repeat.set(wpx / 100, hpx / 100);
      const cm = M(UF, { color: '#b4bec8', alphaMap: tex, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide,
        roughness: 0.45, metalness: 0.6, envMapIntensity: 1.0 }, 's6chain');
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(S(wpx, fenceD), S(hpx, fenceD)), cm);
      mesh.position.copy(P((x0 + x1) / 2, (y0 + y1) / 2, fenceD + 0.03)); mesh.receiveShadow = true; scene.add(mesh);
    }
    for (const px of [425, 828, 1250]) for (const py of [330, 470, 600]) {
      const q = P(px, py, fenceD - 0.03); add(rbox(S(15, fenceD), S(6, fenceD), S(7, fenceD), 0.006, 1), steelDark).position.copy(q);
      add(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 6).rotateX(Math.PI / 2), steelDark).position.set(q.x + S(5, fenceD), q.y, q.z + 0.03);
    }

    /* ---------------- vending machines: modelled cabinets, recessed lit displays with instanced products ---------------- */
    const prod = { bottle: [], label: [], cap: [], can: [], cup: [], btn: [] };   // [matrix, colour]
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
    const putP = (list, x, y, z, sx, sy, sz, c) => { list.push([new THREE.Matrix4().compose(_p.set(x, y, z), _q.identity(), _s.set(sx, sy, sz)), col(c)]); };
    const sheenTex = canvasTex(128, 256, (g, w, h) => {   // soft diagonal reflection bands + haze toward the top of the glass
      const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(255,255,255,0.55)'); v.addColorStop(0.45, 'rgba(255,255,255,0.12)'); v.addColorStop(1, 'rgba(255,255,255,0.05)');
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = v; g.fillRect(0, 0, w, h);
      g.filter = 'blur(6px)'; g.fillStyle = 'rgba(255,255,255,0.35)';
      for (const [x0, ww] of [[10, 26], [52, 10], [80, 34]]) { g.beginPath(); g.moveTo(x0, -10); g.lineTo(x0 + ww, -10); g.lineTo(x0 + ww - 90, h + 10); g.lineTo(x0 - 90, h + 10); g.closePath(); g.fill(); }
    }, true);
    const vmBuild = (o) => {
      const a = P(o.x0, o.top, o.d), b = P(o.x1, 0, o.d);
      const W = b.x - a.x, H = a.y, D = o.depth, T = 0.12, KICK = 0.07;
      const g = new THREE.Group(); g.position.set((a.x + b.x) / 2, 0, -o.d); scene.add(g);
      const X = (f) => -W / 2 + f * W, Y = (f) => H - f * H;
      const tw = 384, th = Math.round(384 * H / W);
      const frontTex = canvasTex(tw, th, (gg, w, h) => o.paint(gg, w, h, (f) => f * w, (f) => f * h, rng(o.seed)), true);
      const bodyM = M(UM, { color: o.side, roughness: 0.36, clearcoat: 0.55, clearcoatRoughness: 0.25 }, 's6vm');
      const doorM = M(UM, { color: '#ffffff', map: frontTex, roughness: 0.33, clearcoat: 0.6, clearcoatRoughness: 0.2 }, 's6vm');
      const dark = M(UM, { color: '#1c1d22', roughness: 0.5, metalness: 0.3 }, 's6vm');
      // cabinet + top cap + kick plate
      add(rbox(W, H - KICK, D - T + 0.02, 0.035, 3), bodyM, g).position.set(0, KICK + (H - KICK) / 2, -T - (D - T) / 2 + 0.01);
      add(rbox(W + 0.012, 0.035, D + 0.012, 0.012, 2), M(UM, { color: o.cap || o.side, roughness: 0.4, clearcoat: 0.4 }, 's6vm'), g).position.set(0, H - 0.012, -D / 2 + 0.006);
      add(rbox(W - 0.03, KICK, D - 0.06, 0.008, 1), dark, g).position.set(0, KICK / 2, -D / 2 - 0.02);
      // door slab around the display window (window = recess T deep); UVs follow the front so the graphics line up
      const [wx0, wy0, wx1, wy1] = o.win;
      const pieces = [[0, 0, 1, wy0], [0, wy1, 1, 1 - KICK / H], [0, wy0, wx0, wy1], [wx1, wy0, 1, wy1]];
      const parts = [];
      for (const [f0, g0, f1, g1] of pieces) {
        const pw = (f1 - f0) * W, ph = (g1 - g0) * H; if (pw < 1e-3 || ph < 1e-3) continue;
        const geo = rbox(pw, ph, T + 0.01, 0.012, 2); geo.translate((X(f0) + X(f1)) / 2, (Y(g0) + Y(g1)) / 2, -(T + 0.01) / 2);
        const p = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + W / 2) / W, p.getY(i) / H);
        parts.push(geo);
      }
      add(mergeGeometries(parts), doorM, g);
      // display interior: lit back wall, shelves with price strips + buttons, products
      const ww = X(wx1) - X(wx0), wh = Y(wy0) - Y(wy1), wcx = (X(wx0) + X(wx1)) / 2, wcy = (Y(wy0) + Y(wy1)) / 2;
      const backTex = canvasTex(256, 256, (gg, w, h) => o.back(gg, w, h, rng(o.seed + 5)), true);
      const backM = M(UM, { color: '#ffffff', map: backTex, emissive: '#ffffff', emissiveMap: backTex, emissiveIntensity: o.glow ?? 0.35, roughness: 0.6 }, 's6vmb');
      add(new THREE.PlaneGeometry(ww, wh), backM, g, false, true).position.set(wcx, wcy, -T + 0.022);
      const shelfM = M(UM, { color: '#d8dde2', roughness: 0.4, metalness: 0.4 }, 's6vm');
      for (const row of (o.rows || [])) {
        const yb = Y(row.y);               // shelf top (products stand here)
        add(new THREE.BoxGeometry(ww, 0.01, T - 0.03), shelfM, g).position.set(wcx, yb - 0.005, -T / 2 - 0.005);
        // price strip (lip) in front of the shelf
        const n = row.n; const sp = ww / n;
        const stripTex = canvasTex(256, 16, (gg, w, h) => { gg.fillStyle = row.strip; gg.fillRect(0, 0, w, h);
          for (let i = 0; i < n; i++) { gg.fillStyle = '#f4f4f0'; gg.fillRect((i + 0.2) * w / n, 3, w / n * 0.6, 6); gg.fillStyle = '#222'; gg.fillRect((i + 0.3) * w / n, 5, w / n * 0.4, 2); } }, true);
        add(new THREE.BoxGeometry(ww, 0.032, 0.012), M(UM, { color: '#ffffff', map: stripTex, roughness: 0.35, emissive: '#ffffff', emissiveMap: stripTex, emissiveIntensity: 0.12 }, 's6vm'), g)
          .position.set(wcx, yb - 0.022, -0.03);
        const r = rng(o.seed * 7 + row.y * 100);
        for (let i = 0; i < n; i++) {
          const x = wcx - ww / 2 + (i + 0.5) * sp + g.position.x, z = -0.07 - o.d;
          putP(prod.btn, x, yb - 0.026, -0.022 - o.d, 1, 1, 1, row.btn || '#f2f2ee');
          const c = row.pal[Math.floor(r() * row.pal.length)];
          if (row.kind === 'can') {
            putP(prod.can, x, yb, z, sp * 0.4, row.h * lerp(0.95, 1.05, r()), sp * 0.4, c);
          } else if (row.kind === 'cup') {
            putP(prod.cup, x, yb, z, sp * 0.36, row.h, sp * 0.36, r() < 0.7 ? '#f3f0ea' : c);
          } else {
            const hh = row.h * lerp(0.82, 1.0, r()), rr = Math.min(sp * 0.4, 0.034);
            const clear = r() < 0.35;
            putP(prod.bottle, x, yb, z, rr, hh, rr, clear ? '#dfe9ee' : c);
            putP(prod.label, x, yb, z, rr, hh, rr, row.pal[Math.floor(r() * row.pal.length)]);
            putP(prod.cap, x, yb, z, rr, hh, rr, r() < 0.6 ? '#f5f5f2' : row.pal[Math.floor(r() * row.pal.length)]);
          }
        }
      }
      // glass: reflection-only layer (additive), with a faint dusty sheen
      const glassM = M(UM, { color: '#000000', roughness: 0.06, metalness: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#a8c4dc', emissiveMap: sheenTex, emissiveIntensity: 0.3 }, 's6glass');
      const gm = add(new THREE.PlaneGeometry(ww, wh), glassM, g, false, false); gm.position.set(wcx, wcy, -0.014); gm.renderOrder = 3;
      // extras: protruding modules / bezels / slots, in front-fraction coords
      const box = (f0, g0, f1, g1, dz, mat, z0 = 0, r = 0.006) => {
        const geo = rbox((f1 - f0) * W, (g1 - g0) * H, dz, r, 2); const m = add(geo, mat, g);
        m.position.set((X(f0) + X(f1)) / 2, (Y(g0) + Y(g1)) / 2, z0 + dz / 2 - 0.002); return m;
      };
      const bezel = (f0, g0, f1, g1, mat, inner, dz = 0.025, t = 0.018) => {
        const tx = t / W, ty = t / H;
        box(f0, g0, f1, g0 + ty, dz, mat); box(f0, g1 - ty, f1, g1, dz, mat);
        box(f0, g0, f0 + tx, g1, dz, mat); box(f1 - tx, g0, f1, g1, dz, mat);
        const pl = add(new THREE.PlaneGeometry((f1 - f0) * W - 2 * t, (g1 - g0) * H - 2 * t), inner, g); pl.position.set((X(f0) + X(f1)) / 2, (Y(g0) + Y(g1)) / 2, 0.003);
        return pl;
      };
      o.extras && o.extras({ box, bezel, X, Y, W, H, g, dark, add });
      return g;
    };
    const flap = M(UM, { color: '#121318', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1 }, 's6vm');
    const silver = M(UM, { color: '#c4c9cf', roughness: 0.3, metalness: 0.8 }, 's6vm');
    const blackP = M(UM, { color: '#202228', roughness: 0.35, clearcoat: 0.5 }, 's6vm');
    const ledG = M(UM, { color: '#203024', emissive: '#7fe0a0', emissiveIntensity: 0.6, roughness: 0.2 }, 's6vm');
    const ledR = M(UM, { color: '#301818', emissive: '#ff6040', emissiveIntensity: 0.7, roughness: 0.2 }, 's6vm');
    const coinUnit = (k, f0, g0, f1, g1) => {
      const { box } = k; box(f0, g0, f1, g1, 0.028, silver);
      const cw = f1 - f0, ch = g1 - g0;
      box(f0 + cw * 0.12, g0 + ch * 0.12, f0 + cw * 0.42, g0 + ch * 0.22, 0.034, blackP);            // bill slot
      box(f0 + cw * 0.18, g0 + ch * 0.36, f0 + cw * 0.28, g0 + ch * 0.6, 0.034, blackP);             // coin slot
      box(f0 + cw * 0.56, g0 + ch * 0.12, f0 + cw * 0.88, g0 + ch * 0.26, 0.034, ledG);              // display
      box(f0 + cw * 0.55, g0 + ch * 0.4, f0 + cw * 0.9, g0 + ch * 0.85, 0.036, blackP, 0, 0.012);    // coin return cup
      box(f0 + cw * 0.12, g0 + ch * 0.72, f0 + cw * 0.3, g0 + ch * 0.84, 0.036, ledR);               // return lever
    };
    const bottlePal = ['#f4f4f0', '#a7d6e6', '#e9dc6a', '#7fc98d', '#5c8fd0', '#f0b25a', '#cfe6f0', '#3f9b8a', '#e65a4a'];
    // white machine
    vmBuild({ x0: 365, x1: 492, top: 375, d: groundD(632), depth: 0.62, side: '#cfd3d8', cap: '#c4c8ce', seed: 11,
      win: [0.05, 0.06, 0.93, 0.52], glow: 0.07,
      rows: [{ y: 0.215, h: 0.2, n: 10, pal: bottlePal, strip: '#4d62a6' }, { y: 0.37, h: 0.2, n: 10, pal: bottlePal, strip: '#4d62a6' },
        { y: 0.52, h: 0.19, n: 11, pal: bottlePal, strip: '#4d62a6' }],
      back: (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#8a9aa8'); gr.addColorStop(1, '#5a6874'); g.fillStyle = gr; g.fillRect(0, 0, w, h); },
      paint: (g, w, h, X, Y, r) => {
        g.fillStyle = '#d9dde1'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#c9cdd3'; g.fillRect(0, 0, w, Y(0.03));
        g.fillStyle = '#4a6ab0'; g.fillRect(X(0.05), Y(0.035), X(0.5), 3);
        g.fillStyle = '#f4f5f6'; g.fillRect(X(0.06), Y(0.55), X(0.46), Y(0.1));
        g.fillStyle = '#3d69b8'; g.font = `bold ${Math.round(h * 0.035)}px sans-serif`; g.fillText('ラシルノ', X(0.1), Y(0.61));
        g.fillStyle = '#5f8ad0'; g.fillRect(X(0.1), Y(0.625), X(0.36), 4);
        g.fillStyle = '#e5e7ea'; g.fillRect(X(0.06), Y(0.67), X(0.46), Y(0.09));
        g.fillStyle = '#9aa3ae'; for (let i = 0; i < 5; i++) g.fillRect(X(0.09), Y(0.69 + i * 0.014), X(0.3 + r() * 0.1), 2);
        g.fillStyle = '#e0a03a'; g.fillRect(X(0.955), Y(0.55), X(0.03), Y(0.07));
        g.fillStyle = '#6d8ec0'; g.fillRect(X(0.62), Y(0.79), X(0.3), Y(0.03));
        for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(90,90,100,${r() * 0.05})`; g.fillRect(r() * w, r() * h, 4 + r() * 24, 2 + r() * 8); }
        const gr = g.createLinearGradient(0, Y(0.85), 0, h); gr.addColorStop(0, 'rgba(70,60,50,0)'); gr.addColorStop(1, 'rgba(70,60,50,0.25)'); g.fillStyle = gr; g.fillRect(0, Y(0.85), w, h);
      },
      extras: (k) => { coinUnit(k, 0.58, 0.545, 0.94, 0.77); k.bezel(0.1, 0.8, 0.64, 0.9, M(UM, { color: '#9ca2aa', roughness: 0.4, metalness: 0.5 }, 's6vm'), flap); },
    });
    // navy hot/cold cup machine
    vmBuild({ x0: 506, x1: 630, top: 360, d: groundD(626), depth: 0.46, side: '#c3c7cf', cap: '#2a2f55', seed: 23,
      win: [0.03, 0.03, 0.665, 0.49], glow: 0.1,
      rows: [{ y: 0.37, h: 0.075, n: 6, kind: 'cup', pal: ['#c03030', '#2a4fa0'], strip: '#c33d48' }, { y: 0.43, h: 0.075, n: 6, kind: 'cup', pal: ['#c03030', '#d8a040'], strip: '#c33d48' },
        { y: 0.49, h: 0.075, n: 6, kind: 'cup', pal: ['#c03030', '#2a4fa0'], strip: '#c33d48' }],
      back: (g, w, h) => {
        g.fillStyle = '#1e2342'; g.fillRect(0, 0, w, h);
        const gr = g.createLinearGradient(0, 0, 0, h * 0.62); gr.addColorStop(0, '#3e2c26'); gr.addColorStop(1, '#8a6040'); g.fillStyle = gr; g.fillRect(0, 0, w, h * 0.62);
        g.fillStyle = '#b89070'; g.beginPath(); g.ellipse(w * 0.5, h * 0.2, w * 0.3, h * 0.09, 0, 0, 7); g.fill();
        g.fillStyle = '#f4efe6'; g.beginPath(); g.moveTo(w * 0.24, h * 0.22); g.lineTo(w * 0.76, h * 0.22); g.lineTo(w * 0.68, h * 0.56); g.lineTo(w * 0.32, h * 0.56); g.closePath(); g.fill();
        g.fillStyle = '#c03030'; g.fillRect(w * 0.33, h * 0.32, w * 0.34, h * 0.05);
        g.fillStyle = '#1d3f9a'; g.fillRect(w * 0.35, h * 0.4, w * 0.3, h * 0.07);
        g.fillStyle = '#fbf6ec'; g.beginPath(); g.ellipse(w * 0.5, h * 0.15, w * 0.2, h * 0.06, 0, 0, 7); g.fill();
        g.fillStyle = '#f2f0ea'; g.font = `bold ${h * 0.05}px sans-serif`; g.fillText('HOT', w * 0.06, h * 0.08);
        for (let i = 0; i < 3; i++) { g.fillStyle = '#2b3058'; g.fillRect(0, h * (0.64 + i * 0.12), w, h * 0.08); }
      },
      paint: (g, w, h, X, Y, r) => {
        g.fillStyle = '#2c3260'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#cdd1d9'; g.fillRect(X(0.67), 0, w, h);
        g.fillStyle = '#e8eaee'; g.fillRect(X(0.67), 0, X(0.06), h);
        g.fillStyle = '#1f3a8a'; g.beginPath(); g.arc(X(0.85), Y(0.06), X(0.09), 0, 7); g.fill();
        g.fillStyle = '#f2c84a'; g.beginPath(); g.arc(X(0.83), Y(0.05), X(0.035), 0, 7); g.fill();
        g.fillStyle = '#d0353a'; g.fillRect(X(0.79), Y(0.08), X(0.1), Y(0.008));
        g.fillStyle = '#c33d48'; g.fillRect(X(0.03), Y(0.505), X(0.63), Y(0.008));
        g.strokeStyle = '#d8dce8'; g.lineWidth = 3; g.lineJoin = 'round';
        for (let i = 0; i < 7; i++) { const cx = X(0.08 + r() * 0.5), cy = Y(0.8 + r() * 0.13), s = X(0.07 + r() * 0.05);
          g.beginPath(); g.moveTo(cx - s, cy); g.lineTo(cx - s * 0.2, cy - s * 0.7); g.lineTo(cx + s, cy - s * 0.3); g.lineTo(cx + s * 0.6, cy + s * 0.6); g.lineTo(cx - s * 0.6, cy + s * 0.5); g.closePath(); g.stroke(); }
        for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(200,200,220,${r() * 0.035})`; g.fillRect(r() * w, r() * h, 4 + r() * 20, 2 + r() * 6); }
        g.fillStyle = '#1d213c'; g.fillRect(0, Y(0.965), X(0.67), h);
      },
      extras: (k) => {
        k.box(0.73, 0.17, 0.93, 0.43, 0.022, blackP);
        k.box(0.76, 0.19, 0.9, 0.25, 0.026, ledG);
        for (let i = 0; i < 4; i++) k.box(0.77, 0.28 + i * 0.035, 0.89, 0.3 + i * 0.035, 0.026, silver);
        k.box(0.75, 0.47, 0.9, 0.54, 0.024, blackP, 0, 0.01);
        k.box(0.78, 0.6, 0.88, 0.66, 0.02, blackP);
        k.bezel(0.25, 0.6, 0.56, 0.735, M(UM, { color: '#1a1e38', roughness: 0.4, clearcoat: 0.5 }, 's6vm'),
          M(UM, { color: '#5c8a5a', emissive: '#7ab07a', emissiveIntensity: 0.35, roughness: 0.15, clearcoat: 1 }, 's6vm'), 0.03, 0.02);
      },
    });
    // red drinks machine
    vmBuild({ x0: 637, x1: 787, top: 383, d: groundD(640), depth: 0.72, side: '#c4252d', cap: '#b2202a', seed: 37,
      win: [0.04, 0.05, 0.845, 0.575], glow: 0.07,
      rows: [{ y: 0.2, h: 0.2, n: 12, pal: ['#f4f4f0', '#d63a3a', '#7a4a2a', '#e8c35a', '#3b8f5a', '#5a7ed0', '#c25a2a', '#2f2f3a'], strip: '#b52a32' },
        { y: 0.35, h: 0.2, n: 12, pal: ['#f4f4f0', '#d63a3a', '#e8c35a', '#5a7ed0', '#f0f0f0', '#c25a2a'], strip: '#b52a32' },
        { y: 0.5, h: 0.19, n: 12, pal: ['#e8c35a', '#3b8f5a', '#f4f4f0', '#d63a3a', '#7a4a2a'], strip: '#b52a32' },
        { y: 0.575, h: 0.1, n: 14, kind: 'can', pal: ['#d63a3a', '#e8c35a', '#3b8f5a', '#2f2f3a', '#f4f4f0'], strip: '#b52a32' }],
      back: (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#a8a29e'); gr.addColorStop(1, '#6e6a68'); g.fillStyle = gr; g.fillRect(0, 0, w, h); },
      paint: (g, w, h, X, Y, r) => {
        g.fillStyle = '#d4252b'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#b81f28'; g.fillRect(0, 0, w, Y(0.025));
        g.fillStyle = '#f2ece8'; g.fillRect(X(0.86), Y(0.05), X(0.11), Y(0.22));
        g.fillStyle = '#c7262c'; g.fillRect(X(0.885), Y(0.08), X(0.06), Y(0.15));
        g.fillStyle = '#f5f0ec'; g.fillRect(X(0.9), Y(0.1), X(0.015), Y(0.1));
        g.fillStyle = '#f1efee'; g.fillRect(X(0.07), Y(0.62), X(0.15), Y(0.14));
        g.fillStyle = '#8a8d96'; for (let i = 0; i < 7; i++) g.fillRect(X(0.09), Y(0.635 + i * 0.016), X(0.11), 2);
        g.strokeStyle = '#f5ece8'; g.lineCap = 'round';
        g.lineWidth = 9; g.beginPath(); g.moveTo(X(0.28), Y(0.61)); g.bezierCurveTo(X(0.45), Y(0.68), X(0.6), Y(0.66), X(0.75), Y(0.6)); g.stroke();
        g.lineWidth = 5; g.beginPath(); g.moveTo(X(0.22), Y(0.86)); g.bezierCurveTo(X(0.42), Y(0.78), X(0.65), Y(0.86), X(0.92), Y(0.7)); g.stroke();
        g.lineWidth = 7; g.beginPath(); g.moveTo(X(0.58), Y(0.97)); g.bezierCurveTo(X(0.66), Y(0.9), X(0.78), Y(0.92), X(0.86), Y(0.84)); g.stroke();
        // coffee-splash graphic
        g.fillStyle = '#6a4030'; g.beginPath(); g.ellipse(X(0.78), Y(0.67), X(0.09), Y(0.04), 0.6, 0, 7); g.fill();
        g.fillStyle = '#efe8e4'; g.beginPath(); g.ellipse(X(0.82), Y(0.64), X(0.05), Y(0.025), 0.5, 0, 7); g.fill();
        for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(60,10,10,${r() * 0.05})`; g.fillRect(r() * w, r() * h, 4 + r() * 20, 2 + r() * 6); }
        g.fillStyle = '#a61c25'; g.fillRect(0, Y(0.965), w, h);
      },
      extras: (k) => {
        k.box(0.86, 0.32, 0.97, 0.56, 0.02, M(UM, { color: '#e8e6e6', roughness: 0.35 }, 's6vm'));
        k.box(0.88, 0.35, 0.95, 0.38, 0.026, blackP); k.box(0.88, 0.41, 0.95, 0.43, 0.026, ledR); k.box(0.885, 0.47, 0.945, 0.53, 0.028, blackP, 0, 0.01);
        k.bezel(0.17, 0.735, 0.75, 0.835, M(UM, { color: '#8a1a20', roughness: 0.4, clearcoat: 0.5 }, 's6vm'), flap, 0.03, 0.02);
      },
    });
    // instanced products (one draw per product part for all machines)
    {
      const lathe = new THREE.LatheGeometry([[0, 0], [0.86, 0], [0.97, 0.03], [1, 0.08], [1, 0.56], [0.95, 0.63], [0.72, 0.73], [0.46, 0.8], [0.38, 0.84], [0.38, 0.9], [0, 0.9]]
        .map(([x, y]) => new THREE.Vector2(x, y)), 12);
      const label = new THREE.CylinderGeometry(1.025, 1.025, 0.3, 12, 1, true).translate(0, 0.38, 0);
      const capG = new THREE.CylinderGeometry(0.42, 0.42, 0.11, 10).translate(0, 0.94, 0);
      const canG = new THREE.CylinderGeometry(0.92, 1, 1, 12).translate(0, 0.5, 0);
      const cupG = new THREE.CylinderGeometry(1, 0.72, 1, 12).translate(0, 0.5, 0);
      const btnG = rbox(0.024, 0.012, 0.01, 0.003, 1);
      const mk = (geo, list, mat) => {
        if (!list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach(([m4, c], i) => { im.setMatrixAt(i, m4); im.setColorAt(i, c); });
        im.castShadow = true; im.receiveShadow = true; scene.add(im); return im;
      };
      mk(lathe, prod.bottle, M(UP, { color: '#ffffff', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#15181a', envMapIntensity: 1.2 }, 's6prod'));
      mk(label, prod.label, M(UP, { color: '#ffffff', roughness: 0.4, emissive: '#26282a' }, 's6prod'));
      mk(capG, prod.cap, M(UP, { color: '#ffffff', roughness: 0.4, emissive: '#26282a' }, 's6prod'));
      mk(canG, prod.can, M(UP, { color: '#ffffff', roughness: 0.25, metalness: 0.5, emissive: '#202224' }, 's6prod'));
      mk(cupG, prod.cup, M(UP, { color: '#ffffff', roughness: 0.5, emissive: '#2a2a2a' }, 's6prod'));
      mk(btnG, prod.btn, M(UP, { color: '#ffffff', roughness: 0.3, clearcoat: 0.6 }, 's6prod'));
    }
    // contact shadows at the machine bases
    contact(P(428, 632, groundD(632)).x, -groundD(632) - 0.3, 1.05, 0.75, 0.75);
    contact(P(568, 626, groundD(626)).x, -groundD(626) - 0.22, 1.05, 0.6, 0.75);
    contact(P(712, 640, groundD(640)).x, -groundD(640) - 0.36, 1.2, 0.85, 0.75);

    /* ---------------- cardboard boxes + wooden boxes (left of the white machine) ---------------- */
    const cardT = texSet(256, 256, (g, w, h) => {
      const r = rng(81); g.fillStyle = '#8c857c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(${90 + r() * 40},${75 + r() * 30},${55 + r() * 20},${r() * 0.14})`; g.fillRect(r() * w, r() * h, 10 + r() * 40, 2 + r() * 8); }
      for (let x = 0; x < w; x += 3) { g.fillStyle = 'rgba(80,65,45,0.05)'; g.fillRect(x, 0, 1, h); }   // corrugation
      g.fillStyle = 'rgba(60,48,36,0.55)'; g.fillRect(0, h * 0.5 - 1, w, 2);                              // flap seam
      g.fillStyle = 'rgba(214,196,160,0.85)'; g.fillRect(w * 0.42, 0, w * 0.16, h);                        // packing tape
      g.fillStyle = 'rgba(255,255,240,0.25)'; g.fillRect(w * 0.43, 0, 2, h);
      g.strokeStyle = 'rgba(70,55,40,0.35)'; g.lineWidth = 2;                                             // dents / creases
      for (let i = 0; i < 6; i++) { g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 30); g.stroke(); }
      g.fillStyle = 'rgba(40,40,40,0.5)'; g.font = '14px sans-serif'; g.fillText('↑↑  取扱注意', 12, h * 0.8);
    }, { normalStrength: 2.5, roughBase: 0.9 });
    const cardM = M(UM, { color: '#ffffff', map: cardT.map, normalMap: cardT.normalMap, roughnessMap: cardT.roughnessMap, envMapIntensity: 1.0 }, 's6card');
    const cardM2 = M(UM, { color: '#b8b4b4', map: cardT.map, normalMap: cardT.normalMap, roughnessMap: cardT.roughnessMap, envMapIntensity: 1.0 }, 's6card');
    const woodT = (seed, base, gaps = true) => texSet(256, 256, (g, w, h) => {
      const r = rng(seed); g.fillStyle = base; g.fillRect(0, 0, w, h);
      const nb = 4; for (let i = 0; i < nb; i++) {
        const y0 = i * h / nb; g.fillStyle = `rgba(${r() * 40},${r() * 30},0,${0.08 + r() * 0.1})`; g.fillRect(0, y0, w, h / nb);
        for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(60,40,22,${0.15 + r() * 0.2})`; g.lineWidth = 1; g.beginPath(); const yy = y0 + r() * h / nb; g.moveTo(0, yy); g.bezierCurveTo(w * 0.3, yy + (r() - 0.5) * 8, w * 0.6, yy + (r() - 0.5) * 8, w, yy + (r() - 0.5) * 6); g.stroke(); }
        if (gaps) { g.fillStyle = 'rgba(25,16,10,0.85)'; g.fillRect(0, y0, w, 4); }                                     // gap between planks
        g.fillStyle = 'rgba(30,25,20,0.7)'; for (const x of [10, w - 14]) { g.beginPath(); g.arc(x, y0 + h / nb / 2, 2.2, 0, 7); g.fill(); }
      }
    }, { normalStrength: 3.0, roughBase: 0.85 });
    const darkWood = woodT(91, '#6e5844');
    const dwM = M(UM, { color: '#ffffff', map: darkWood.map, normalMap: darkWood.normalMap, roughnessMap: darkWood.roughnessMap, envMapIntensity: 0.5 }, 's6wood');
    const crateBox = (x0, x1, yTop, yBot, d, depth, mat, rotY = 0, r = 0.012) => {
      const a = P(x0, yTop, d), b = P(x1, yBot, d);
      const m = add(rbox(b.x - a.x, a.y - b.y, depth, r, 2), mat);
      m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, -d - depth / 2); m.rotation.y = rotY;
      contact(m.position.x, m.position.z, (b.x - a.x) + 0.14, depth + 0.14, 0.65); return m;
    };
    const bxD = groundD(620);
    crateBox(297, 362, 515, 620, bxD, 0.5, cardM, 0.05);
    crateBox(300, 360, 465, 515, bxD + 0.05, 0.45, cardM2, -0.08);
    crateBox(230, 297, 568, 627, groundD(627), 0.45, dwM, 0.12, 0.008);
    crateBox(172, 230, 565, 615, groundD(615), 0.4, dwM, -0.05, 0.008);

    /* ---------------- traffic cones: lathe-turned PBR plastic, square base, reflective band ---------------- */
    const coneM = M(UM, { color: '#e2501e', roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4, emissive: '#8a2008', emissiveIntensity: 0.1, envMapIntensity: 0.7 }, 's6cone');
    const bandM = M(UM, { color: '#ece6de', roughness: 0.22, metalness: 0.25, clearcoat: 0.8, envMapIntensity: 1.2 }, 's6cone');
    const coneBody = new THREE.LatheGeometry([[0.2, 0], [0.19, 0.05], [0.13, 0.42], [0.075, 0.78], [0.045, 0.94], [0.036, 0.975], [0, 0.98]].map(([x, y]) => new THREE.Vector2(x, y)), 24);
    const bandG = new THREE.LatheGeometry([[0.1265, 0.47], [0.1035, 0.62]].map(([x, y]) => new THREE.Vector2(x + 0.004, y)), 24);
    const coneBase = rbox(0.56, 0.05, 0.56, 0.03, 2).translate(0, 0.025, 0);
    const makeCone = (h) => {
      const g = new THREE.Group();
      for (const [geo, mat] of [[coneBody, coneM], [bandG, bandM], [coneBase, coneM]]) { const m = add(geo, mat, g); m.scale.setScalar(h); }
      g.children[0].position.y = 0.045 * h; g.children[1].position.y = 0.045 * h;
      return g;
    };
    const cone = (px, pyBase, hpx, ry = 0) => {
      const d = groundD(pyBase); const p = P(px, pyBase, d); const h = S(hpx, d);
      const g = makeCone(h); g.position.set(p.x, 0, -d); g.rotation.y = ry; scene.add(g);
      contact(p.x, -d, h * 0.75, h * 0.75, 0.55); return g;
    };
    cone(503, 650, 70, 0.3);
    cone(668, 655, 66, 0.1);
    cone(820, 655, 66, 0.6);
    cone(996, 658, 70, 0.2);
    { // fallen cone at left
      const d = groundD(645); const p = P(335, 645, d); const h = S(70, d);
      const g = makeCone(h); g.rotation.set(0, 0.4, Math.PI / 2 + 0.28, 'YXZ'); g.position.set(p.x + 0.12, h * 0.28, -d); scene.add(g);
      contact(p.x, -d, h * 1.0, h * 0.5, 0.45);
    }

    /* ---------------- barrier tape (twisted ribbon, PBR plastic) ---------------- */
    const tapeTex = paintTexture('s6_tape', 256, 16, (g, w, h) => {
      g.fillStyle = '#f0c63a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#23232b';
      for (let x = -16; x < w + 16; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 15, h); g.lineTo(x + 23, 0); g.lineTo(x + 8, 0); g.closePath(); g.fill(); }
    }, { repeat: true });
    const tapeMat = M(UM, { color: '#ffffff', map: tapeTex, side: THREE.DoubleSide, roughness: 0.3, clearcoat: 0.6, envMapIntensity: 0.8 }, 's6tape');
    const tape = (pts, widthPx = 7) => {
      const P3 = pts.map(([px, py, d]) => P(px, py, d));
      const curve = new THREE.CatmullRomCurve3(P3);
      const N = 60; const pos = [], uv = [], idx = [];
      let L = 0; let prev = null;
      for (let i = 0; i <= N; i++) {
        const t = i / N; const p = curve.getPoint(t); if (prev) L += p.distanceTo(prev); prev = p;
        const d = -p.z; const hw = S(widthPx, d) / 2; const tw = Math.sin(t * 9.0 + pts.length) * 0.35;   // slight twist
        pos.push(p.x, p.y + hw, p.z + hw * tw, p.x, p.y - hw, p.z - hw * tw);
        uv.push(L / S(widthPx * 9, d), 1, L / S(widthPx * 9, d), 0);
        if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      return add(geo, tapeMat);
    };
    const dC = (py) => groundD(py) - 0.02;
    tape([[380, 640, dC(650)], [440, 640, dC(652)], [503, 634, dC(650)]], 6);
    tape([[503, 600, dC(650)], [560, 628, dC(652)], [620, 622, dC(653)], [668, 598, dC(655)]], 10);
    tape([[668, 598, dC(655)], [720, 605, dC(656)], [770, 620, dC(656)], [820, 610, dC(655)]], 10);
    tape([[820, 610, dC(655)], [880, 618, dC(656)], [940, 610, dC(657)], [996, 596, dC(658)]], 10);
    tape([[996, 600, dC(658)], [1010, 625, dC(658)]], 6);

    /* ---------------- slatted plastic crates on slatted wooden boxes ---------------- */
    const slatCrate = (W, H, Dp, t = 0.016) => {
      const parts = []; const bar = (w, h, d, x, y, z) => parts.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(t * 1.8, H, t * 1.8, sx * (W / 2 - t * 0.9), H / 2, sz * (Dp / 2 - t * 0.9));
      for (const y of [t * 0.6, H * 0.36, H * 0.68, H - t * 0.9]) {
        const th = y > H - t * 1.5 ? t * 1.8 : t * 1.2;
        for (const sz of [-1, 1]) bar(W, th, t, 0, y, sz * (Dp / 2 - t / 2));
        for (const sx of [-1, 1]) bar(t, th, Dp, sx * (W / 2 - t / 2), y, 0);
      }
      const nf = 8; for (let i = 1; i < nf; i++) for (const sz of [-1, 1]) bar(t * 0.7, H, t * 0.8, -W / 2 + i * W / nf, H / 2, sz * (Dp / 2 - t * 0.4));
      const ns = 5; for (let i = 1; i < ns; i++) for (const sx of [-1, 1]) bar(t * 0.8, H, t * 0.7, sx * (W / 2 - t * 0.4), H / 2, -Dp / 2 + i * Dp / ns);
      bar(W - t, t * 0.6, Dp - t, 0, t * 0.3, 0);
      return mergeGeometries(parts);
    };
    const lightWood = woodT(97, '#dcbb84', false);
    const lwM = M(UM, { color: '#ffffff', map: lightWood.map, normalMap: lightWood.normalMap, roughnessMap: lightWood.roughnessMap, envMapIntensity: 0.5 }, 's6wood');
    const woodCrate = (W, H, Dp) => {
      const parts = []; const pl = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
        const p = b.attributes.position, uv = b.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) / 0.5, p.getY(i) / 0.5 + 0.02); parts.push(b); };
      const n = 3, gap = 0.035, ph = (H - gap * (n - 1)) / n, t = 0.016;
      for (let i = 0; i < n; i++) { const y = ph / 2 + i * (ph + gap);
        for (const sz of [-1, 1]) pl(W, ph, t, 0, y, sz * (Dp / 2 - t / 2));
        for (const sx of [-1, 1]) pl(t, ph, Dp - 2 * t, sx * (W / 2 - t / 2), y, 0); }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pl(0.04, H, 0.04, sx * (W / 2 - 0.035), H / 2, sz * (Dp / 2 - 0.035));
      for (let i = 0; i < 5; i++) pl(W / 5 - 0.012, 0.012, Dp - 0.02, -W / 2 + (i + 0.5) * W / 5, H - 0.006, 0);
      return mergeGeometries(parts);
    };
    const propAt = (geo, mat, x0, x1, yBot, d, depth, rotY) => {
      const a = P(x0, yBot, d), b = P(x1, yBot, d); const m = add(geo, mat);
      m.position.set((a.x + b.x) / 2, Math.max(0, a.y), -d - depth / 2); m.rotation.y = rotY; return m;
    };
    const palD = groundD(624);
    const wW = S(80, palD), wH = S(34, palD);
    propAt(woodCrate(wW, wH, 0.38), lwM, 788, 868, 624, palD, 0.38, 0.02);
    propAt(woodCrate(S(84, palD), wH, 0.38), lwM, 868, 952, 624, palD, 0.38, -0.03);
    contact(P(870, 624, palD).x, -palD - 0.19, S(170, palD), 0.55, 0.7);
    const crD = palD + 0.05;
    const gCr = M(UM, { color: '#2a8a48', roughness: 0.5, clearcoat: 0.2, envMapIntensity: 0.6 }, 's6crate');
    const rCr = M(UM, { color: '#cc2a38', roughness: 0.5, clearcoat: 0.2, envMapIntensity: 0.6 }, 's6crate');
    const cy = wH;
    { const m = add(slatCrate(S(70, crD), S(53, crD), 0.3), gCr); m.position.set(P(838, 0, crD).x, cy, -crD - 0.16); m.rotation.y = -0.04; }
    { const m = add(slatCrate(S(57, crD), S(53, crD), 0.3), rCr); m.position.set(P(908, 0, crD).x, cy, -crD - 0.16); m.rotation.y = 0.05; }

    /* ---------------- road bicycle: tube frame, spoked wheels, drivetrain, drop bars, saddle ---------------- */
    {
      const d = fenceD - 0.25;
      const p = (x, y, dz = 0) => { const v = P(x, y, d); v.z += dz; return v; };
      const yel = M(UF, { color: '#e8c43a', roughness: 0.28, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.1 }, 's6bike');
      const chrome = M(UF, { color: '#d6d9de', roughness: 0.16, metalness: 1, envMapIntensity: 1.3 }, 's6bike');
      const rubber = M(UF, { color: '#1a1a1e', roughness: 0.8, sheen: 0.3, sheenColor: new THREE.Color('#2c2c30') }, 's6bike');
      const black = M(UF, { color: '#25262b', roughness: 0.5, metalness: 0.4 }, 's6bike');
      const tapeM = M(UF, { color: '#2a2a30', roughness: 0.75 }, 's6bike');
      const saddleM = M(UF, { color: '#9a2e22', roughness: 0.45, clearcoat: 0.4 }, 's6bike');
      const RA = p(990, 583), FA = p(1108, 585), BB = p(1040, 591), STt = p(1016, 515), TT0 = p(1019, 524), HT = p(1088, 522), HB = p(1092, 541);
      const wheel = (c) => {
        const R = S(42, d);
        add(new THREE.TorusGeometry(R - 0.012, 0.013, 8, 64), rubber).position.copy(c);
        add(new THREE.TorusGeometry(R - 0.03, 0.008, 6, 64), chrome).position.copy(c);
        add(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 12).rotateX(Math.PI / 2), chrome).position.copy(c);
        const sp = [];
        for (let i = 0; i < 28; i++) {
          const a = i / 28 * Math.PI * 2, side = i % 2 ? 1 : -1;
          const hub = c.clone().add(new THREE.Vector3(Math.cos(a + side * 0.2) * 0.02, Math.sin(a + side * 0.2) * 0.02, side * 0.035));
          const rim = c.clone().add(new THREE.Vector3(Math.cos(a) * (R - 0.034), Math.sin(a) * (R - 0.034), 0));
          sp.push(rodGeo(hub, rim, 0.0014, 4));
        }
        add(mergeGeometries(sp), chrome, scene, true, false);
      };
      wheel(RA); wheel(FA);
      const R = 0.015;
      for (const s of [-1, 1]) { rod(BB, RA.clone().setZ(RA.z + s * 0.045), R * 0.7, yel); rod(RA.clone().setZ(RA.z + s * 0.045), TT0.clone().setZ(TT0.z + s * 0.012), R * 0.65, yel); }
      rod(BB, STt, R, yel); rod(TT0, HT, R * 0.95, yel); rod(BB, HB.clone().lerp(HT, 0.15), R * 1.1, yel);
      rod(HT.clone().add(new THREE.Vector3(0, 0.03, 0)), HB, R * 1.25, yel);
      for (const s of [-1, 1]) rod(HB, FA.clone().setZ(FA.z + s * 0.05), R * 0.75, yel);
      // drivetrain (drive side faces the camera)
      const ring = add(new THREE.TorusGeometry(0.1, 0.006, 6, 40), chrome); ring.position.copy(BB).add(new THREE.Vector3(0, 0, 0.055));
      add(new THREE.CircleGeometry(0.06, 24), black).position.copy(BB).add(new THREE.Vector3(0, 0, 0.052));
      add(new THREE.TorusGeometry(0.036, 0.005, 6, 24), black).position.copy(RA).add(new THREE.Vector3(0, 0, 0.05));
      {
        const c1 = BB.clone().add(new THREE.Vector3(0, 0, 0.055)), c2 = RA.clone().add(new THREE.Vector3(0, 0, 0.05));
        const path = new THREE.CurvePath();
        path.add(new THREE.LineCurve3(c1.clone().add(new THREE.Vector3(0, 0.1, 0)), c2.clone().add(new THREE.Vector3(0, 0.036, 0))));
        path.add(new THREE.LineCurve3(c2.clone().add(new THREE.Vector3(0, -0.036, 0)), c1.clone().add(new THREE.Vector3(0, -0.1, 0))));
        for (const cc of path.curves) add(new THREE.TubeGeometry(cc, 8, 0.004, 4, false), black);
      }
      const ca = 0.7; const ped = BB.clone().add(new THREE.Vector3(Math.cos(ca) * 0.17, -Math.sin(ca) * 0.17, 0.075));
      rod(BB.clone().setZ(BB.z + 0.07), ped, 0.009, chrome);
      add(rbox(0.09, 0.02, 0.06, 0.005), black).position.copy(ped).add(new THREE.Vector3(0, 0, 0.04));
      const ped2 = BB.clone().add(new THREE.Vector3(-Math.cos(ca) * 0.17, Math.sin(ca) * 0.17, -0.075));
      rod(BB.clone().setZ(BB.z - 0.07), ped2, 0.009, chrome);
      // seatpost + saddle
      const sTop = STt.clone().add(new THREE.Vector3(-0.012, 0.05, 0));
      rod(STt, sTop, 0.012, chrome);
      const sad = add(new THREE.SphereGeometry(1, 16, 10), saddleM); sad.scale.set(0.13, 0.026, 0.06); sad.position.copy(sTop).add(new THREE.Vector3(0.0, 0.02, 0));
      // stem + drop handlebar
      const stem = HT.clone().add(new THREE.Vector3(0.07, 0.02, 0)); rod(HT.clone().add(new THREE.Vector3(0, 0.03, 0)), stem, 0.011, chrome);
      for (const s of [-1, 1]) {
        const pts = [stem.clone(), stem.clone().add(new THREE.Vector3(0.0, 0, s * 0.19)), stem.clone().add(new THREE.Vector3(0.07, -0.02, s * 0.205)),
          stem.clone().add(new THREE.Vector3(0.09, -0.09, s * 0.205)), stem.clone().add(new THREE.Vector3(0.04, -0.13, s * 0.2)), stem.clone().add(new THREE.Vector3(-0.03, -0.12, s * 0.2))];
        add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.011, 6, false), tapeM);
        add(rbox(0.02, 0.06, 0.02, 0.006), black).position.copy(stem).add(new THREE.Vector3(0.085, -0.04, s * 0.205));
      }
      contact((RA.x + FA.x) / 2, RA.z, 1.25, 0.25, 0.5);
    }

    /* ---------------- painterly leaf sprays (pixel-authored, fixed camera) ---------------- */
    const leafAtlas = paintTexture('s6_leafatlas', 512, 512, (g, w, h, r) => {
      g.clearRect(0, 0, w, h);
      const leaf = (cx, cy, len, wid, rot, v = 1, serr = 0) => {
        g.save(); g.translate(cx, cy); g.rotate(rot);
        g.beginPath(); g.moveTo(0, -len / 2);
        const N = 14;
        for (let i = 0; i <= N; i++) { const t = i / N; const y = -len / 2 + t * len; const ww = wid * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 1.25) * (1 + (i % 2) * serr); g.lineTo(ww, y); }
        for (let i = N; i >= 0; i--) { const t = i / N; const y = -len / 2 + t * len; const ww = wid * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 1.25) * (1 + (i % 2) * serr); g.lineTo(-ww, y); }
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
      leaf(384, 384, 240, 62, 0, 1, 0.02);
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
    // top-left: dark canopy with leaf-cluster tones throughout, lit clusters along the top + sky edge, and sky gaps
    const tlPoly = [[-40, -40], [545, -40], [530, 40], [500, 110], [455, 170], [420, 215], [370, 260], [310, 300], [200, 296], [100, 300], [-40, 310]];
    const tlGaps = [[86, 146, 17], [140, 112, 8], [300, 150, 11], [210, 42, 8], [418, 66, 10], [356, 212, 9], [42, 236, 9], [250, 250, 7]];
    const inGap = (x, y, pad) => tlGaps.some(([gx, gy, gr]) => Math.hypot(x - gx, y - gy) < gr + pad);
    const tlTone = (x, y, r) => {
      const edge = smooth01(0.62, 0.95, (x + 0.85 * y) / 560);
      const top = smooth01(175, 25, y) * smooth01(60, 240, x);
      const mid = smooth01(140, 320, x) * smooth01(320, 140, y);
      const patch = vn(x / 55, y / 55);
      const gapRim = tlGaps.some(([gx, gy, gr]) => Math.hypot(x - gx, y - gy) < gr + 26) ? 0.18 : 0;
      return Math.min(1, Math.max(0, 0.06 + 0.52 * Math.max(edge, top * 0.6, mid * 0.42) + gapRim * 0.7 + (patch - 0.5) * 0.36 + (r() - 0.5) * 0.18));
    };
    leafSpray(sprayPoly(tlPoly, 230, 101, (x, y, r) => { const sz = lerp(60, 100, r());
      return (x + 0.85 * y > 480 || inGap(x, y, sz * 0.45)) ? null : { size: sz, rot: r() * 6.28, cell: 2, tone: tlTone(x, y, r) * 0.7 }; }), 7.2,
      ['#06120c', '#0c1e15', '#183a28', '#356a40'], 0.6);
    leafSpray(sprayPoly(tlPoly, 2600, 103, (x, y, r) => { const sz = lerp(18, 32, r());
      return ((x + 0.85 * y > 470 && r() < 0.3) || inGap(x, y, sz * 0.3)) ? null : { size: sz, rot: r() * 6.28, cell: r() < 0.6 ? 0 : 1, tone: tlTone(x, y, r) }; }), 7.0,
      ['#08150e', '#122c1e', '#28583e', '#5a9658'], 1.0);
    // top-right: dark core at right, bright lime leaves toward the left / bottom
    const trPoly = [[690, -40], [1320, -40], [1320, 215], [1230, 225], [1160, 205], [1090, 180], [1040, 205], [990, 255], [945, 280], [915, 240], [902, 170], [900, 90], [870, 75], [800, 90], [720, 85], [690, 50]];
    const trTone = (x, y, r) => {
      const lit = smooth01(1080, 860, x + (y - 100) * 0.3);
      const patch = vn(x / 80, y / 80);
      return Math.min(1, Math.max(0, 0.04 + lit * 0.62 + (patch - 0.5) * 0.35 + (r() - 0.5) * 0.25));
    };
    const trCore = [[960, -40], [1320, -40], [1320, 205], [1230, 215], [1160, 200], [1090, 180], [1030, 140], [990, 80]];
    leafSpray(sprayPoly(trCore, 200, 105, (x, y, r) => ({ size: lerp(70, 110, r()), rot: r() * 6.28, cell: 2, tone: trTone(x, y, r) * 0.6 })), 7.2,
      ['#0f251c', '#183a2a', '#2c5c3a', '#4f8a48'], 0.6);
    leafSpray(sprayPoly(trPoly, 1700, 107, (x, y, r) => {
      const t = trTone(x, y, r);
      if (x < 1000 && r() < 0.35) return null;    // sparse fringe with sky gaps
      return { size: lerp(20, 34, r()), rot: r() * 6.28, cell: r() < 0.6 ? 0 : 1, tone: t };
    }), 7.0, ['#11291f', '#1f4a32', '#46865a', '#80b86c'], 1.0);

    /* ---------------- foreground broad leaves (lower-left plant) ---------------- */
    const plPoly = [[-40, 275], [50, 280], [110, 320], [150, 400], [190, 500], [230, 600], [250, 740], [-40, 740]];
    leafSpray(sprayPoly(plPoly, 240, 109, (x, y, r) => {
      if (x > 140 && r() < 0.4) return null;
      const patch = vn(x / 120, y / 120);
      return { size: lerp(30, 46, r()), rot: (r() - 0.5) * 2.6 + (x > 100 ? 0.7 : -0.3), cell: 3,
        tone: Math.min(1, Math.max(0, 0.5 + (patch - 0.5) * 0.8 - smooth01(300, 600, y) * 0.15 + (r() - 0.5) * 0.5 - smooth01(560, 720, y) * 0.3)) };
    }), 4.0, ['#10291c', '#2c6a40', '#55a050', '#92cc70'], 1.2);

    return {
      scene, camera,
      update(t) {
        shared.uSunDir.value.copy(SUN);
        shared.uDapple.value = 1.0;
        shared.uDappleScale.value = 6.5;
        shared.uDappleCover.value = 0.69;
        shared.uDappleSpeed.value = 0.25;
        shared.uFogMax.value = 0.0;
      },
    };
  },
};
