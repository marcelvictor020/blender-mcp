import { makeCoupe, makeEnvMap, addVehicleLight, makeGroundShadow } from '../vehicles.js';
// Shot 5 — low angle in the shade, looking up at an old two-storey wooden shop-house: lattice balcony, chōchin lantern,
// triangular stop sign, white AE86-style hatchback parked lower right, concrete overpass + blue sky, back-lit tree,
// leaves with glowing butterflies lower left. Static camera; dappled leaf light shimmers across everything.
//
// Layout trick: the camera is static, so every element is placed from reference *pixel* coordinates.
// Camera at the origin looking down -Z with a shifted (off-axis) frustum: verticals stay vertical, horizon at y=575px.
// Vertical planes are defined by a horizontal direction + a point; pixel rays are intersected with them, and
// canvas textures are painted in "pixel space" (mapped through the plane) so perspective is exact.

const W0 = 1280, H0 = 720, F = 900, CX = 640, CY = 575, GROUND = -0.95;

export default {
  duration: 3.042,
  credit: { role: 'EDITING', cx: 0.248, ry: 0.56, ny: 0.62 },
  post: { bloom: 0.45, bloomRadius: 0.55, bloomThreshold: 0.72, exposure: 1.0, contrast: 1.06, saturation: 1.05,
    lift: [0.01, 0.008, 0.02], gamma: [1, 1, 1], gain: [1.0, 0.99, 0.98], vignette: 0.3, grain: 0.035, ca: 0.0015, soft: 0.2 },

  build(core) {
    const { THREE, NOISE_GLSL, shared, rng, lerp, col, makeSky, makeCloud, makeFoliage, makeButterflies, makeMotes, paintTexture } = core;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0a10');

    /* ---------------- camera: off-axis frustum ---------------- */
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 2000);
    camera.position.set(0, 0, 0);
    camera.updateProjectionMatrix = function () {
      const n = this.near;
      this.projectionMatrix.makePerspective(n * (0 - CX) / F, n * (W0 - CX) / F, n * (CY - 0) / F, n * (CY - H0) / F, n, this.far);
      this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
    };
    camera.updateProjectionMatrix();

    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const UP = V(0, 1, 0);
    const ray = (px, py) => V((px - CX) / F, (CY - py) / F, -1);
    const at = (px, py, d) => ray(px, py).multiplyScalar(d);
    const dirTo = (vpx) => V((vpx - CX) / F, 0, -1).normalize();

    function plane(origin, dir0) {
      const dir = dir0.clone();
      let n = new THREE.Vector3().crossVectors(dir, UP).normalize();
      if (n.dot(origin) > 0) { dir.negate(); n.negate(); }   // face the camera, keep the basis right-handed
      const P = {
        o: origin.clone(), d: dir.clone(), n,
        hit(px, py) { const r = ray(px, py); const t = origin.dot(n) / r.dot(n); return r.multiplyScalar(t); },
        uv(px, py) { const p = P.hit(px, py).sub(origin); return [p.dot(dir), p.y]; },
        pt(u, v, off = 0) { return origin.clone().addScaledVector(dir, u).addScaledVector(UP, v).addScaledVector(n, off); },
        quat() { return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, UP, n)); },
        // shifted copy (positive = toward camera/street)
        shift(off) { return plane(origin.clone().addScaledVector(n, off), dir); },
      };
      return P;
    }

    /* ---------------- painted, dappled material ---------------- */
    const L = V(-0.45, 0.75, 0.5).normalize();      // sun (used for dapple projection + foliage)
    const T1 = new THREE.Vector3().crossVectors(L, V(0, 1, 0)).normalize();
    const T2 = new THREE.Vector3().crossVectors(L, T1).normalize();
    const whiteTex = paintTexture('s5_white', 4, 4, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); });
    const maskWhite = paintTexture('s5_maskw', 4, 4, (g, w, h) => { g.fillStyle = '#f00'; g.fillRect(0, 0, w, h); }, { srgb: false });
    const mats = [];
    function pmat(o = {}) {
      const m = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: o.map || whiteTex }, mask: { value: o.mask || maskWhite }, uColor: { value: col(o.color || '#ffffff') },
          uShade: { value: col(o.shade || '#202436') }, uLit: { value: col(o.lit || '#ffe6c8') }, uEmit: { value: col(o.emit || '#000000') },
          uCover: { value: o.cover ?? 0.56 }, uScale: { value: o.scale ?? 0.9 }, uSeed: { value: o.seed ?? 0 }, uOpacity: { value: o.opacity ?? 1 },
          uSharp: { value: o.sharp ?? 0.025 }, uLeaf: { value: o.leaf ?? 1 }, uSliver: { value: o.sliver ?? 0 }, uT1: { value: T1 }, uT2: { value: T2 }, uTime: shared.uTime,
        },
        vertexShader: `varying vec2 vUv; varying vec3 vW;
          void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `varying vec2 vUv; varying vec3 vW;
          uniform sampler2D map, mask; uniform vec3 uColor, uShade, uLit, uEmit, uT1, uT2;
          uniform float uCover, uScale, uSeed, uOpacity, uSharp, uTime, uLeaf, uSliver;
          ${NOISE_GLSL}
          // leaf silhouettes: one pointed ellipse per jittered cell (rotating slightly in the wind)
          float leaves(vec2 q){
            vec2 i = floor(q), f = fract(q); float s = 0.;
            for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++){
              vec2 c = vec2(float(x), float(y)); vec2 id = i + c;
              vec2 h = vec2(hash12(id), hash12(id + 17.3));
              vec2 o = c + h - f;
              float a = hash12(id + 5.1) * 6.283 + sin(uTime*1.6 + h.x*9.0) * 0.18;
              vec2 r = mat2(cos(a), -sin(a), sin(a), cos(a)) * o;
              float k = 0.26 + 0.16 * hash12(id + 9.7);
              float yy = clamp(abs(r.y) / k, 0., 1.); float w = 0.17 * pow(1.0 - yy * yy, 0.75);
              float e = length(vec2(r.x / max(w, 0.01), r.y / k * 0.0)) + yy * 0.0;
              s = max(s, 1.0 - smoothstep(0.85, 1.0, e) * step(0.0, w) - step(w, 0.0));
            }
            return clamp(s, 0., 1.);
          }
          float dapple(vec3 p){
            vec3 q3 = p * uScale * 0.35 + vec3(uSeed, uSeed*0.7, -uSeed*1.3);
            q3 += vec3(sin(uTime*0.55 + q3.y), cos(uTime*0.42 + q3.x), 0.) * 0.05;
            float fb = fbm3(q3); float open = smoothstep(uCover - 0.05, uCover + 0.05, fb);
            float band = smoothstep(uCover - 0.012, uCover, fb) * (1.0 - smoothstep(uCover + 0.006, uCover + 0.02, fb));
            open = mix(open, band, uSliver);
            vec2 q = vec2(p.x + p.z * 0.25, p.y) * uScale + uSeed * 3.1;
            vec2 sw = vec2(sin(uTime*0.9), cos(uTime*0.7)) * 0.06;
            float l1 = leaves(q + sw);
            float l2 = leaves(q * 0.55 + vec2(3.7, 1.3) - sw * 0.6);
            float lit = open * (1.0 - l1 * uLeaf) * (1.0 - 0.6 * l2 * uLeaf);
            return smoothstep(0.5 - uSharp, 0.5 + uSharp, lit);
          }
          void main(){
            vec4 t = texture2D(map, vUv);
            if (t.a * uOpacity < 0.5) discard;
            vec4 mk = texture2D(mask, vUv);
            float d = dapple(vW) * mk.r;
            vec3 c = uColor * t.rgb * mix(mix(uShade, vec3(1.0), mk.b), uLit, d) + uEmit * mk.g;
            gl_FragColor = vec4(c, 1.0);
          }`,
        side: THREE.DoubleSide,
      });
      mats.push(m);
      return m;
    }

    /* surface: rectangle on a plane, given by pixel extents on that plane; textures painted in pixel space */
    function surface(key, P0, [xL, yT, xR, yB], o0 = {}) {
      const P = o0.off ? P0.shift(o0.off) : P0, o = { ...o0, off: 0 };
      const cs = [P.uv(xL, yT), P.uv(xR, yT), P.uv(xL, yB), P.uv(xR, yB)];
      const ua = Math.min(...cs.map(c => c[0])), ub = Math.max(...cs.map(c => c[0])), va = Math.min(...cs.map(c => c[1])), vb = Math.max(...cs.map(c => c[1]));
      const [tw, th] = o.res || [512, 512];
      // pixel -> canvas coords
      const C = (px, py) => { const [u, v] = P.uv(px, py); return [(u - ua) / (ub - ua) * tw, (1 - (v - va) / (vb - va)) * th]; };
      const poly = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => { const [cx, cy] = C(x, y); i ? g.lineTo(cx, cy) : g.moveTo(cx, cy); }); g.closePath(); };
      const map = o.paint ? paintTexture('s5_' + key, tw, th, (g, w, h, r) => o.paint(g, C, poly, w, h, r)) : null;
      const mask = o.maskPaint ? paintTexture('s5_' + key + '_m', tw, th, (g, w, h, r) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); o.maskPaint(g, C, poly, w, h, r); }, { srgb: false }) : null;
      const mat = pmat({ ...o, map: map || o.map, mask: mask || o.mask });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ub - ua, vb - va), mat);
      mesh.quaternion.copy(P.quat());
      mesh.position.copy(P.pt((ua + ub) / 2, (va + vb) / 2, o.off || 0));
      if (o.order != null) mesh.renderOrder = o.order;
      scene.add(mesh);
      return mesh;
    }
    function pbox(P, u, v, w, h, d, mat, off = 0) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.quaternion.copy(P.quat()); m.position.copy(P.pt(u, v, off)); scene.add(m); return m;
    }

    /* ---------------- sky + clouds ---------------- */
    scene.add(makeSky({ zenith: '#0c5e80', mid: '#1a809c', horizon: '#2a90a8', haze: 0.2, horizonY: 0.0 }));
    const cloudA = makeCloud({ w: 260, h: 130, seed: 11, light: '#d6d2c8', mid: '#c2beb4', shadow: '#9a9ca4', lightDir: [-0.3, 0.9],
      puffs: [[-0.32, -0.05, 0.22], [-0.18, 0.08, 0.26], [-0.02, 0.18, 0.3], [0.14, 0.12, 0.26], [0.3, 0.02, 0.2], [0.42, -0.08, 0.14], [-0.42, -0.1, 0.13], [0.05, -0.05, 0.25], [0.22, -0.08, 0.2], [-0.15, -0.1, 0.2]] });
    cloudA.position.copy(at(1080, 300, 500)); cloudA.lookAt(0, 0, 0); scene.add(cloudA);

    /* ---------------- main street facade plane ---------------- */
    const D1 = dirTo(1320);
    const PA = plane(at(570, 575, 8), D1);
    const fillPoly = (g, poly, pts, c) => { poly(g, pts); g.fillStyle = c; g.fill(); };

    // left building (lantern facade): px 0..270
    surface('lfac', PA, [-40, -60, 300, 760], {
      res: [512, 1024], shade: '#6e5650', lit: '#d09060', cover: 0.56, scale: 7.0, seed: 3, emit: '#3a1e10',
      paint(g, C, poly, w, h, r) {
        g.fillStyle = '#5e4a44'; g.fillRect(0, 0, w, h);
        for (let y = -60; y < 760; y += 13) fillPoly(g, poly, [[-40, y], [300, y], [300, y + 2.2], [-40, y + 2.2]], 'rgba(20,8,4,0.7)'); for (let y = -54; y < 760; y += 13) fillPoly(g, poly, [[-40, y], [300, y], [300, y + 1.2], [-40, y + 1.2]], 'rgba(200,150,110,0.3)');
        for (let i = 0; i < 70; i++) { const x = r() * 340 - 40, y = r() * 820 - 60, l = 40 + r() * 80; fillPoly(g, poly, [[x, y], [x + l, y], [x + l, y + 10], [x, y + 10]], `rgba(${r() < 0.5 ? '140,95,60' : '40,24,16'},0.25)`); }
        fillPoly(g, poly, [[-40, -60], [300, -60], [300, 70], [-40, 42]], '#120c0a');
      },
      maskPaint(g, C, poly) {
        fillPoly(g, poly, [[-40, 52], [300, 112], [300, 192], [-40, 175]], '#ff0');
        fillPoly(g, poly, [[-40, 300], [270, 318], [270, 760], [-40, 760]], '#800');
      },
    });

    // corrugated metal wall section px 262..540
    surface('corr', PA, [262, -60, 548, 760], {
      res: [512, 1024], shade: '#584644', lit: '#d8a878', cover: 0.6, leaf: 0.4, scale: 7.0, seed: 7, off: 0.02,
      paint(g, C, poly, w, h, r) {
        g.fillStyle = '#c4b4a4'; g.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 7) { g.fillStyle = 'rgba(30,20,24,0.65)'; g.fillRect(x, 0, 2.5, h); g.fillStyle = 'rgba(255,235,210,0.4)'; g.fillRect(x + 3.5, 0, 1.4, h); }
        // dark recessed stair / balcony structure
        fillPoly(g, poly, [[262, 150], [430, 125], [430, 330], [262, 352]], '#6a5c6c');
        for (let k = 0; k < 5; k++) { const y = 175 + k * 34; fillPoly(g, poly, [[262, y + 22], [430, y], [430, y + 4], [262, y + 26]], '#8a8ca0'); }
        fillPoly(g, poly, [[240, 345], [430, 305], [430, 316], [240, 358]], '#aab0c0');      // pipe
        fillPoly(g, poly, [[520, -60], [532, -60], [532, 760], [520, 760]], '#f4f0f0');      // down pipe
      },
      maskPaint(g, C, poly) {
        const W = g.canvas.width, H = g.canvas.height;
        const [xa] = C(400, 300), [xb] = C(470, 300);
        const grd = g.createLinearGradient(xa, 0, xb, 0); grd.addColorStop(0, 'rgba(255,0,0,0)'); grd.addColorStop(1, 'rgba(255,0,0,1)');
        g.fillStyle = grd; g.fillRect(0, 0, W, H);
        fillPoly(g, poly, [[262, 150], [430, 125], [430, 330], [262, 352]], '#000');
        fillPoly(g, poly, [[262, -60], [400, -60], [400, 60], [262, 110]], '#200');
      },
    });

    // balcony house wall px 540..950 (first floor windows etc.)
    surface('hwall', PA, [532, -60, 960, 760], {
      res: [768, 1024], shade: '#4e4046', lit: '#d8a070', cover: 0.6, leaf: 0.4, scale: 7.0, seed: 11, off: -0.15,
      paint(g, C, poly, w, h, r) {
        g.fillStyle = '#5a5262'; g.fillRect(0, 0, w, h);
        // vertical boards
        for (let x = 535; x < 960; x += 14) fillPoly(g, poly, [[x, -60], [x + 2, -60], [x + 2, 760], [x, 760]], 'rgba(20,20,30,0.4)');
        // corner post (light)
        fillPoly(g, poly, [[532, -60], [566, -60], [566, 760], [532, 760]], '#e8dcd6');
        // window frames (white) + dark panes
        fillPoly(g, poly, [[562, 316], [805, 392], [805, 584], [562, 584]], '#f2e6e0');
        fillPoly(g, poly, [[575, 356], [688, 388], [688, 574], [575, 576]], '#0c1020');
        fillPoly(g, poly, [[700, 392], [794, 418], [794, 570], [700, 572]], '#0c1020');
        fillPoly(g, poly, [[575, 334], [794, 398], [794, 404], [575, 342]], '#7a7488');     // transom line
        // wooden lattice window to the right
        fillPoly(g, poly, [[808, 428], [935, 452], [935, 545], [808, 548]], '#8a6048');
        for (let x = 812; x < 935; x += 10) fillPoly(g, poly, [[x, 420], [x + 3.5, 420], [x + 3.5, 548], [x, 548]], '#2e1e18');
        fillPoly(g, poly, [[808, 488], [935, 500], [935, 504], [808, 492]], '#2e1e18');
        // lower wall below windows
        fillPoly(g, poly, [[540, 584], [960, 560], [960, 760], [540, 760]], '#b0a4a0');
      },
      maskPaint(g, C, poly) {
        g.fillStyle = 'rgba(255,0,0,0.7)'; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
        fillPoly(g, poly, [[532, -60], [960, -60], [960, 420], [532, 270]], 'rgb(90,0,0)');
        fillPoly(g, poly, [[562, 316], [805, 392], [805, 584], [562, 584]], 'rgb(255,0,70)');
        fillPoly(g, poly, [[575, 356], [688, 388], [688, 574], [575, 576]], '#00f');
        fillPoly(g, poly, [[700, 392], [794, 418], [794, 570], [700, 572]], '#00f');
        fillPoly(g, poly, [[532, -60], [566, -60], [566, 760], [532, 760]], '#f00');
      },
    });

    // first-floor eave: sloped thin roof (underside + lit front rim)
    {
      const out = 0.5, drop = 0.3, PE = PA.shift(out);
      const [ua, ve] = PE.uv(552, 262), [ub] = PE.uv(1010, 434);
      const f0 = PE.pt(ua, ve), f1 = PE.pt(ub, ve), b0 = PA.pt(ua, ve + drop), b1 = PA.pt(ub, ve + drop);
      const quad = (a, b, c, d, mat) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([...a.toArray(), ...b.toArray(), ...c.toArray(), ...d.toArray()], 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
        g.setIndex([0, 2, 1, 1, 2, 3]); const m = new THREE.Mesh(g, mat); scene.add(m); return m;
      };
      quad(b0, b1, f0, f1, pmat({ color: '#30323e', shade: '#ffffff', lit: '#ffffff', cover: 2 }));
      const dn = UP.clone().multiplyScalar(-0.09);
      quad(f0, f1, f0.clone().add(dn), f1.clone().add(dn), pmat({ color: '#c8d0e0', shade: '#5a6078', lit: '#ffffff', cover: 0.45, scale: 2.5, seed: 6 }));
    }

    // balcony (2nd floor), protruding
    const PB = PA.shift(0.9);
    surface('balc', PB, [530, -80, 960, 350], {
      res: [1024, 768], shade: '#6a5250', lit: '#f0c890', cover: 0.57, leaf: 0.4, scale: 7.0, seed: 21, emit: '#e8784a',
      paint(g, C, poly, w, h, r) {
        g.fillStyle = '#806058'; g.fillRect(0, 0, w, h);
        // vertical slats with dark gaps
        for (let i = 0; i < 70; i++) {
          const x = 535 + i * 6.2;
          fillPoly(g, poly, [[x, -80], [x + 2.2, -80], [x + 2.2, 360], [x, 360]], 'rgba(18,10,8,0.85)');
          fillPoly(g, poly, [[x + 2.2, -80], [x + 6.2, -80], [x + 6.2, 360], [x + 2.2, 360]], `rgba(${r() < 0.5 ? '150,100,70' : '60,36,24'},${0.15 + r() * 0.25})`);
        }
        // horizontal rails + posts
        for (const x of [548, 668, 768, 846, 900]) fillPoly(g, poly, [[x, -80], [x + 9, -80], [x + 9, 360], [x, 360]], '#4a2e20');
        // bottom beam (lit warm) and dark fascia below
        fillPoly(g, poly, [[530, 118], [960, 262], [960, 292], [530, 146]], '#b07058');
        fillPoly(g, poly, [[530, 146], [960, 292], [960, 322], [530, 172]], '#3a2a2c');
        g.globalCompositeOperation = 'destination-out'; fillPoly(g, poly, [[530, 172], [960, 322], [960, 900], [530, 900]], '#000'); g.globalCompositeOperation = 'source-over';
        // roof soffit (dark) top right
        fillPoly(g, poly, [[700, -80], [960, -80], [960, 70], [890, 88], [760, 20]], '#1a1210');
      },
      maskPaint(g, C, poly, w, h, r) {
        g.fillStyle = 'rgba(255,0,0,0.45)'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 16; i++) { const x = 548 + r() * 330, y0 = -20 + r() * 80 + (x - 545) * 0.3, l = 50 + r() * 110; fillPoly(g, poly, [[x, y0], [x + 1.2, y0], [x + 1.2, y0 + l], [x, y0 + l]], `rgb(255,${Math.floor(60 + r() * 110)},0)`); }
        fillPoly(g, poly, [[530, 118], [960, 262], [960, 292], [530, 146]], '#f00');
        fillPoly(g, poly, [[700, -80], [960, -80], [960, 70], [890, 88], [760, 20]], '#000');
      },
    });
    /* ---------------- lantern ---------------- */
    const lanTex = paintTexture('s5_lantern', 256, 384, (g, w, h) => {
      g.fillStyle = '#f2ece6'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 12) { g.fillStyle = 'rgba(120,110,110,0.25)'; g.fillRect(0, y, w, 2); }
      g.fillStyle = '#6a1410'; g.fillRect(0, 0, w, 22); g.fillRect(0, h - 22, w, 22);
      // brush kanji (front of the lantern is the u = 0.5 band after rotation)
      g.fillStyle = '#7a1612'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 86px serif'; g.fillText('串', w * 0.5, h * 0.32); g.fillText('焼', w * 0.5, h * 0.64);
      g.font = 'bold 22px serif'; g.fillText('や', w * 0.75, h * 0.25); g.fillText('き', w * 0.75, h * 0.33); g.fillText('と', w * 0.75, h * 0.41); g.fillText('り', w * 0.75, h * 0.49);
    });
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), pmat({ map: lanTex, shade: '#a8989c', lit: '#ece4dc', cover: 0.45, scale: 8.0, seed: 4 }));
    lantern.scale.set(0.22, 0.32, 0.22);
    lantern.position.copy(at(152, 226, 4.5));
    lantern.rotation.y = -Math.PI / 2 + 0.45;
    scene.add(lantern);

    /* ---------------- stop sign + pole ---------------- */
    const signTex = paintTexture('s5_sign', 256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const tri = (m) => { g.beginPath(); g.moveTo(m, m * 0.6); g.lineTo(w - m, m * 0.6); g.lineTo(w / 2, h - m * 1.2); g.closePath(); };
      tri(4); g.fillStyle = '#c42820'; g.fill();
      tri(26); g.fillStyle = '#efeae6'; g.fill();
      g.fillStyle = '#b02a24'; g.font = 'bold 40px serif'; g.textAlign = 'center'; g.fillText('徐行', w / 2, 70);
      g.font = 'bold 26px sans-serif'; g.fillText('SLOW', w / 2, 112);
    });
    const dSign = 6.0;
    const sp = at(517, 345, dSign);
    const sw = 108 / F * dSign;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw), pmat({ map: signTex, shade: '#7a6e72', lit: '#d4ccc6', cover: 0.5, scale: 4, seed: 9, leaf: 0.3 }));
    sign.position.copy(sp); sign.position.y += 0.0; sign.rotation.y = 0.2; scene.add(sign);
    const poleTop = at(505, 280, dSign).y, poleBot = at(505, 760, dSign).y;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, poleTop - poleBot, 10), pmat({ color: '#e8e4e4', shade: '#4e4c58', lit: '#b4b0ae', cover: 0.55, scale: 4, seed: 2, leaf: 0.3 }));
    pole.position.copy(at(505, 520, dSign)); pole.position.y = (poleTop + poleBot) / 2; pole.position.z -= 0.08; scene.add(pole);

    /* ---------------- overpass ---------------- */
    const PO = plane(at(1100, 470, 24), dirTo(250));
    surface('over', PO, [930, 250, 1300, 800], {
      res: [768, 768], shade: '#8a8078', lit: '#e0d0b4', cover: 0.44, scale: 2.6, seed: 31, leaf: 0.35, sharp: 0.1, order: 1,
      paint(g, C, poly, w, h, r) {
        g.clearRect(0, 0, w, h);
        const F_ = (pts, c) => fillPoly(g, poly, pts, c);
        F_([[930, 382], [1300, 328], [1300, 425], [930, 482]], '#b8b096');          // parapet face (lit concrete)
        for (let i = 0; i < 40; i++) { const x = 930 + r() * 370, y = 380 + r() * 90 - (x - 930) * 0.15; F_([[x, y], [x + 20, y - 3], [x + 20, y + 6], [x, y + 9]], `rgba(${r() < 0.5 ? '90,84,70' : '210,200,180'},0.25)`); }
        F_([[930, 482], [1300, 425], [1300, 800], [930, 800]], '#1c1e24');          // underside
        F_([[930, 478], [1300, 420], [1300, 428], [930, 487]], '#c8c4bc');          // slab edge
        for (const [x0, y0, x1, y1] of [[945, 517], [960, 553], [1030, 573]].map(([x, y], k) => [x, y, 1195, [483, 523, 560][k]])) F_([[x0, y0], [x1, y1], [x1, y1 + 4], [x0, y0 + 5]], '#9a9ca4');
        for (let k = 0; k < 4; k++) { const y = 492 + k * 12; F_([[930, y + 30], [1195, y - 8], [1195, y - 6], [930, y + 32]], '#2c2f38'); }
        F_([[1062, 582], [1208, 574], [1208, 622], [1062, 628]], '#b0805a');          // wooden panel
        for (let x = 1066; x < 1208; x += 9) F_([[x, 576], [x + 1.5, 576], [x + 1.5, 628], [x, 628]], '#5a3a28');
        F_([[1192, 462], [1300, 450], [1300, 695], [1192, 695]], '#a89e86');          // pillar
        F_([[1192, 462], [1215, 460], [1215, 695], [1192, 695]], '#4a4640');
        F_([[1150, 695], [1300, 695], [1300, 800], [1150, 800]], '#16161a');
      },
      maskPaint(g, C, poly) {
        fillPoly(g, poly, [[930, 382], [1300, 328], [1300, 425], [930, 482]], '#f00');
        fillPoly(g, poly, [[930, 478], [1300, 420], [1300, 428], [930, 487]], '#f0f');
        fillPoly(g, poly, [[1192, 462], [1300, 450], [1300, 695], [1192, 695]], '#f00');
        fillPoly(g, poly, [[1062, 582], [1208, 574], [1208, 622], [1062, 628]], '#f00');
        fillPoly(g, poly, [[930, 482], [1300, 425], [1300, 800], [930, 800]], 'rgb(0,0,90)');
      },
    });
    // railing on top of the overpass
    {
      const rm = new THREE.MeshBasicMaterial({ color: col('#d8dcdc') });
      const pts = [[945, 330], [1150, 275]];
      const a = PO.hit(...pts[0]), b = PO.hit(...pts[1]);
      for (const dy of [0, 45]) {
        const a2 = PO.hit(945, 330 + dy), b2 = PO.hit(1290, 240 + dy);
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, a2.distanceTo(b2), 5), rm);
        c.position.copy(a2).lerp(b2, 0.5); c.quaternion.setFromUnitVectors(UP, b2.clone().sub(a2).normalize()); scene.add(c);
      }
      for (const px of [970, 1055, 1140, 1225]) {
        const yTop = 330 - (px - 945) * 0.26, yBot = yTop + 60;
        const p1 = PO.hit(px, yTop), p2 = PO.hit(px, yBot);
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, p1.distanceTo(p2), 5), rm);
        c.position.copy(p1).lerp(p2, 0.5); scene.add(c);
      }
    }

    /* ---------------- car: modelled hatchback coupe, PBR paint, real + contact shadows, leaf dapple ---------------- */
    const car = new THREE.Group();
    let carVeh;
    {
      const fwd = dirTo(1640), side = new THREE.Vector3().crossVectors(fwd, UP).normalize();
      const env = makeEnvMap('s5_env', {
        zenith: '#3f8fc2', horizon: '#9fb4c0', ground: '#231f1c', sunDir: [L.x, L.y, L.z], sunColor: '#ffe8cc', sunPower: 22,
        clouds: [{ dir: [0.8, 0.35, -0.6], size: 7, power: 1.5 }, { dir: [0.4, 0.5, -0.9], size: 6, power: 1.3 }],
        blocks: [
          { dir: [-1, -0.2], w: 26, h: 14, dist: 9, color: '#1d1714' }, { dir: [-0.3, -1], w: 22, h: 12, dist: 10, color: '#231c17' },
          { dir: [0.9, -0.7], w: 30, h: 5, dist: 14, y: 3, color: '#5d5853' }, { dir: [1, 0.4], w: 14, h: 3, dist: 9, color: '#3a3532' }, { dir: [0.2, 1], w: 30, h: 9, dist: 12, color: '#2b2622' },
        ],
      });
      carVeh = makeCoupe({ envMap: env, envIntensity: 0.95, sunDir: [L.x, L.y, L.z], leafAmt: 1, leafCover: 0.5, leafScale: 4.6, leafSharp: 0.04, leafSeed: 7.3,
        rimColor: '#ff8a52', rimAmt: 0.12, rimPow: 6, grime: 0.12, plate: '13954' });
      car.add(carVeh.group);
      car.add(makeGroundShadow(carVeh, { contact: 0.9, cast: 0.5 }));
      car.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, UP, fwd.clone().negate()));
      const rear = at(706, 741, 4.35); rear.y = GROUND + 0.07;
      car.position.copy(rear);
      car.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
      scene.add(car);
      // lighting for the physically shaded car only (the painted set ignores lights)
      const carCentre = car.localToWorld(new THREE.Vector3(0, 0.6, -2.0));
      addVehicleLight(scene, { sunDir: [L.x, L.y, L.z], color: '#ffe3c2', intensity: 2.3, target: carCentre, radius: 3.6 });
      scene.add(new THREE.HemisphereLight(new THREE.Color('#7f97b8'), new THREE.Color('#3a2a22'), 0.55));
    }

    /* ---------------- foliage ---------------- */
    const pxClump = (px, py, d, rpx) => { const p = at(px, py, d); return [p.x, p.y, p.z, rpx / F * d]; };
    const treeClumps = [];
    {
      const r = rng(55);
      const pts = [[900, 20, 60], [980, 40, 60], [1060, 10, 70], [1160, 40, 90], [1250, 20, 70], [935, 140, 45],
        [1220, 160, 70], [1265, 260, 60], [1195, 290, 40], [1255, 370, 45], [915, 90, 40], [1110, 80, 50]];
      for (const [x, y, rr] of pts) treeClumps.push(pxClump(x + (r() - 0.5) * 20, y, 7, rr));
    }
    const tree = makeFoliage({ clumps: treeClumps, density: 1.8, cardSize: 0.55, kind: 'round', seed: 8, texSeed: 3,
      dark: '#163a30', mid: '#2c5c3a', light: '#4a8648', highlight: '#84b466', wind: 0.04, shell: 0.85, lightWrap: 0.7, sizeJitter: 0.5 });
    scene.add(tree);

    const bushClumps = [];
    {
      const pts = [[40, 420, 60], [120, 470, 70], [60, 560, 90], [180, 560, 70], [230, 650, 70], [100, 680, 90], [20, 640, 60], [200, 470, 40], [10, 360, 40]];
      for (const [x, y, rr] of pts) bushClumps.push(pxClump(x, y, 3.0, rr));
    }
    const bush = makeFoliage({ clumps: bushClumps, density: 0.55, cardSize: 0.56, kind: 'broad', seed: 12, texSeed: 2,
      dark: '#173622', mid: '#2e623c', light: '#5a9c58', highlight: '#acd47e', wind: 0.03, shell: 0.6, lightWrap: 0.5, sizeJitter: 0.5 });
    scene.add(bush);

    /* ---------------- butterflies + motes ---------------- */
    const b0 = at(30, 700, 2.8), b1 = at(470, 480, 3.4);
    const bflies = makeButterflies({ count: 28, box: [[b0.x, b0.y, -3.2], [b1.x, b1.y, -2.6]], size: 0.055, color: '#f0b040', seed: 7, speed: 0.9, glow: 1.05 });
    scene.add(bflies);
    const m0 = at(300, 100, 4), m1 = at(1100, 700, 6);
    scene.add(makeMotes({ count: 40, box: [[m0.x, m1.y, -6], [m1.x, m0.y, -3.5]], size: 0.012, color: '#fff2d8', opacity: 0.6, seed: 13, speed: 0.1 }));

    const sunDir = L.clone().negate().setY(0.3).normalize(); // foliage lit from behind (back-light)
    return {
      scene, camera,
      update(t) {
        shared.uSunDir.value.copy(V(-0.45, -0.1, 0.9).normalize());
        shared.uDapple.value = 0;
      },
    };
  },
};
