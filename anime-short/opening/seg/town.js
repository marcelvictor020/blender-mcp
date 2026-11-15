// Town kit for the KAGERŌ opening world segments.
// Reuses shot 1's modelled viaduct + commuter train (imported from ../../shots/shot1.js) and grows a whole
// procedural rail town around it (instanced houses / apartment blocks / trees / roads / mountains / sky) so the
// world can be seen from NEW angles (high, wide) without exposing shot 1's facade-only set.
//
//   const T = makeTown(core, ctx, palette)  ->  { scene, group, via, train, setTrain(s), frame:{A,U,N,toWorld}, mats, sky, setSky(p), sun }
//   palette: { zenith, mid, horizon, sunColor, sunDir:[x,y,z], sunInt, ambient, ambInt, hemiSky, hemiGround, ground, fog, fogNear, fogFar, fogMax,
//              windows (0..1 night window glow), sunDisc, glow, mountains:[near,far], roofs:[...], walls:[...] }
import shot1 from '../../shots/shot1.js';
import { makeEnvMap } from '../../pbr.js';

export const PALETTES = {
  golden: {
    zenith: '#4a5e9e', mid: '#e89a7e', horizon: '#ffd49a', sunColor: '#ffbf73', sunDir: [-0.55, 0.12, -0.82], sunInt: 3.4,
    ambient: '#6a72a8', ambInt: 0.55, hemiSky: '#8fb0e0', hemiGround: '#6b5040', hemiInt: 0.8, ground: '#7f8a5a',
    fog: '#f0b88a', fogNear: 150, fogFar: 1400, fogMax: 0.6, windows: 0.0, sunDisc: 1.0, glow: 1.0,
    mountains: ['#8a7aa0', '#c79ea8'], walls: ['#e8dcc8', '#d9c9ae', '#f2ece0', '#c9b9a0', '#b9c4c8', '#e0d0b8'],
    roofs: ['#3d4a66', '#5a3f3a', '#2f5a64', '#6b4a3a', '#44485a', '#7a5040'], tree: ['#2f4a2a', '#5c7a34', '#a4b04a'],
  },
  blood: {
    zenith: '#1a0204', mid: '#7a0a0a', horizon: '#ff3a1e', sunColor: '#ff3a1a', sunDir: [-0.55, 0.08, -0.82], sunInt: 3.0,
    ambient: '#4a0a10', ambInt: 0.6, hemiSky: '#a0141a', hemiGround: '#1a0204', hemiInt: 0.7, ground: '#3a0a0a',
    fog: '#b0180e', fogNear: 60, fogFar: 700, fogMax: 0.8, windows: 0.0, sunDisc: 1.0, glow: 1.4,
    mountains: ['#2a0306', '#5a0a0c'], walls: ['#6a1a18', '#5a1414', '#7a2420', '#4a1010'], roofs: ['#120204', '#1a0306', '#200408'],
    tree: ['#0c0204', '#1e0406', '#3a0a0a'],
  },
  dusk: {
    zenith: '#1b2350', mid: '#7a4a78', horizon: '#ff8a5a', sunColor: '#ff7a48', sunDir: [-0.55, 0.06, -0.82], sunInt: 2.2,
    ambient: '#3a3e78', ambInt: 0.7, hemiSky: '#6a6ab0', hemiGround: '#3a2a3a', hemiInt: 0.7, ground: '#3e4038',
    fog: '#c07a78', fogNear: 80, fogFar: 800, fogMax: 0.8, windows: 0.6, sunDisc: 0.8, glow: 1.0,
    mountains: ['#3a3058', '#7a5a7a'], walls: ['#a89ab0', '#9a8aa0', '#b8a8b8', '#8a8098'], roofs: ['#262840', '#3a2a38', '#1e3040'],
    tree: ['#141e24', '#2a3a34', '#4a5a40'],
  },
};

const HOUSE_GLSL_WIN = (g, w, h, r) => {
  // facade: 2 floors x 3 windows, cream wall handled by instance colour -> keep texture greyscale-ish
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (let f = 0; f < 2; f++) for (let k = 0; k < 3; k++) {
    const x = 18 + k * 40, y = 18 + f * 58;
    g.fillStyle = '#404858'; g.fillRect(x, y, 26, 30);
    g.fillStyle = '#8890a0'; g.fillRect(x + 2, y + 2, 10, 26);
  }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 6, w, 6);
};
const HOUSE_EMIS = (g, w, h, r) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let f = 0; f < 2; f++) for (let k = 0; k < 3; k++) {
    if (r() < 0.45) continue; const x = 18 + k * 40, y = 18 + f * 58;
    g.fillStyle = r() < 0.7 ? '#ffb45a' : '#bfe0ff'; g.fillRect(x, y, 26, 30);
  }
};
const APT_WIN = (g, w, h, r) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  const F = 8, C = 10;
  for (let f = 0; f < F; f++) {
    const y = f * h / F;
    g.fillStyle = '#c8c8c8'; g.fillRect(0, y + h / F - 7, w, 7);        // balcony slab
    for (let k = 0; k < C; k++) { g.fillStyle = '#3a4252'; g.fillRect(k * w / C + 5, y + 6, w / C - 10, h / F - 16); }
  }
};
const APT_EMIS = (g, w, h, r) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const F = 8, C = 10;
  for (let f = 0; f < F; f++) for (let k = 0; k < C; k++) {
    if (r() < 0.5) continue; g.fillStyle = r() < 0.75 ? '#ffb860' : '#cfe6ff';
    g.fillRect(k * w / C + 5, f * h / F + 6, w / C - 10, h / F - 16);
  }
};

function gableGeometry(THREE) {
  // unit gable roof: x -0.5..0.5, z -0.5..0.5, eaves at y=0, ridge (along z) at y=1
  const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5);
  return g;
}

export function makeSkyDome(core, p) {
  const { THREE, col, NOISE_GLSL } = core;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      cZ: { value: col(p.zenith) }, cM: { value: col(p.mid) }, cH: { value: col(p.horizon) }, cS: { value: col(p.sunColor) },
      uSun: { value: new THREE.Vector3(...p.sunDir).normalize() }, uDisc: { value: p.sunDisc ?? 1 }, uGlow: { value: p.glow ?? 1 },
      uTime: core.shared.uTime, uStreak: { value: p.streak ?? 0 }, cStreak: { value: col(p.streakColor || '#000000') },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 q = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = q.xyww; }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 cZ, cM, cH, cS, uSun, cStreak; uniform float uDisc, uGlow, uTime, uStreak;
      ${NOISE_GLSL}
      void main(){ vec3 d = normalize(vDir); float y = max(d.y, 0.);
        vec3 c = mix(cH, cM, smoothstep(0.0, 0.13, y)); c = mix(c, cZ, smoothstep(0.08, 0.5, y));
        float sd = max(dot(d, normalize(uSun)), 0.);
        c += cS * (pow(sd, 8.0) * 0.22 + pow(sd, 90.0) * 0.45) * uGlow;
        c = mix(c, cS * 2.0 + 0.6, smoothstep(0.99955, 0.9997, sd) * uDisc);
        // streaky cloud bands (anime dusk / blood sky)
        if (uStreak > 0.) { vec2 q = vec2(atan(d.x, d.z) * 3.0, y * 22.0); float n = fbm(vec2(q.x * 0.6 + uTime * 0.01, q.y)) ;
          float band = smoothstep(0.52, 0.72, n) * smoothstep(0.02, 0.1, y) * smoothstep(0.6, 0.15, y);
          vec3 lit = mix(cStreak, cS * 1.6, pow(sd, 3.0)); c = mix(c, lit, band * uStreak); }
        if (d.y < 0.) c = mix(cH, cH * 0.6, smoothstep(0., -0.2, d.y));
        gl_FragColor = vec4(c, 1.); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(2500, 48, 24), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  m.onBeforeRender = (r, s, cam) => m.position.copy(cam.position);
  return m;
}

function makeMountains(core, p, radius, height, color, seed, top) {
  const { THREE, col, NOISE_GLSL } = core;
  const geo = new THREE.CylinderGeometry(radius, radius, height, 256, 1, true); geo.translate(0, height / 2 - 5, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { cA: { value: col(color) }, cB: { value: col(p.fog) }, uSeed: { value: seed }, uTop: { value: top } },
    vertexShader: `varying vec3 vP; varying vec2 vUv; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `varying vec3 vP; varying vec2 vUv; uniform vec3 cA, cB; uniform float uSeed, uTop; ${NOISE_GLSL}
      void main(){ float a = vUv.x * 40.0 + uSeed; float h = uTop * (0.35 + 0.65 * fbm(vec2(a, uSeed))) + 0.08 * vnoise(vec2(a * 9.0, 1.));
        if (vUv.y > h) discard; vec3 c = mix(cB, cA, smoothstep(0.0, h, vUv.y) * 0.7 + 0.3); gl_FragColor = vec4(c, 1.); }`,
    side: THREE.BackSide, fog: false,
  });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = -9; m.frustumCulled = false;
  return m;
}

/** Build the town. Returns handles; scene already contains sky, lights, ground, town and the viaduct. */
export function makeTown(core, ctx, pal, opts = {}) {
  const { THREE, toon, rng, col, shared, paintTexture } = core;
  const p = { ...PALETTES.golden, ...pal };
  const scene = new THREE.Scene();

  // ---- reuse shot 1's viaduct + train ----
  const s1 = shot1.build(core, ctx);
  const via = s1.scene.children.find(o => o.isGroup && o.children.length > 10);
  s1.scene.remove(via); scene.add(via);
  const train = via.children.find(o => o.isGroup);
  via.updateMatrixWorld(true);
  const bb = new THREE.Box3();
  for (const c of via.children) if (c.isMesh && c.material.type === 'MeshBasicMaterial') { bb.setFromObject(c); if (bb.min.y < -3) c.visible = false; }
  const A = via.position.clone(), U = new THREE.Vector3(1, 0, 0).applyQuaternion(via.quaternion).setY(0).normalize();
  const q4 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-U.z, U.x));
  const N = new THREE.Vector3(0, 0, 1).applyQuaternion(q4);
  const toWorld = (s, d, y = 0) => new THREE.Vector3(A.x, 0, A.z).addScaledVector(U, s).addScaledVector(N, d).setY(y);
  const env = makeEnvMap('town_env_' + (opts.key || 'g'), { zenith: p.zenith, horizon: p.horizon, ground: p.ground, sunDir: p.sunDir, sunColor: p.sunColor, sunPower: 6, sunSize: 3 });
  via.traverse(o => { if (o.material && o.material.isMeshPhysicalMaterial) { if (env) o.material.envMap = env; o.material.envMapIntensity = opts.viaEnv ?? 0.6; } });
  // piers down to the ground (shot 1 framed them off; from high angles they must reach the ground)
  const pierMat = toon({ color: opts.pierColor || '#b8b0a4' });
  const pierGeo = new THREE.BoxGeometry(1, 1, 1); pierGeo.translate(0, 0.5, 0);
  const piers = new THREE.InstancedMesh(pierGeo, pierMat, 40); let np = 0;
  const m4 = new THREE.Matrix4();
  for (let s = -80; s < 260 && np < 40; s += 12) { m4.compose(toWorld(s, -1.2, -1), q4, new THREE.Vector3(2.2, 9, 5.5)); piers.setMatrixAt(np++, m4); }
  piers.count = np; piers.castShadow = piers.receiveShadow = true; scene.add(piers);

  // ---- town root in viaduct frame (s along x, d along z) ----
  const town = new THREE.Group(); town.position.set(A.x, 0, A.z); town.quaternion.copy(q4); scene.add(town);
  const R = rng(opts.seed || 7);

  // sky / mountains / lights
  const sky = makeSkyDome(core, p); scene.add(sky);
  const mts = [makeMountains(core, p, 1800, 260, p.mountains[1], 3.1, 0.55), makeMountains(core, p, 1300, 200, p.mountains[0], 7.7, 0.5)];
  mts.forEach(m => { m.position.set(A.x, 0, A.z); scene.add(m); });
  const sunD = new THREE.Vector3(...p.sunDir).normalize();
  const sun = new THREE.DirectionalLight(col(p.sunColor), p.sunInt);
  const center = toWorld(opts.focusS ?? 80, opts.focusD ?? 40, 0);
  sun.position.copy(center).addScaledVector(sunD, 400); sun.target.position.copy(center);
  sun.castShadow = opts.shadows !== false; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera, SB = opts.shadowBox || 220; sc.left = sc.bottom = -SB; sc.right = sc.top = SB; sc.near = 10; sc.far = 900;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(col(p.hemiSky), col(p.hemiGround), p.hemiInt); scene.add(hemi);
  const amb = new THREE.AmbientLight(col(p.ambient), p.ambInt); scene.add(amb);
  via.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), toon({ color: p.ground }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(A.x, -0.02, A.z); ground.receiveShadow = true; scene.add(ground);

  // roads (dark strips): main road parallel to viaduct + cross streets
  const roadMat = toon({ color: opts.roadColor || '#4a4a50' });
  const roads = [];
  const addRoad = (s0, s1, d0, d1) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s1 - s0, d1 - d0), roadMat); m.rotation.x = -Math.PI / 2; m.position.set((s0 + s1) / 2, 0.02, (d0 + d1) / 2); m.receiveShadow = true; town.add(m); roads.push([s0, s1, d0, d1]); };
  addRoad(-600, 800, 10, 18); addRoad(-600, 800, -18, -11);
  for (let s = -260; s < 700; s += 70 + Math.floor(R() * 30)) addRoad(s, s + 7, -600, 600);
  addRoad(-600, 800, 90, 97); addRoad(-600, 800, -110, -103); addRoad(-600, 800, 190, 197);
  // ground-level rail bed + rails under/along viaduct (gives the crossing context)
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(1400, 9), toon({ color: '#6a5e52' })); bed.rotation.x = -Math.PI / 2; bed.position.set(100, 0.03, -1); town.add(bed);
  const inRoad = (s, d, r) => roads.some(([a, b, c, e]) => s + r > a && s - r < b && d + r > c && d - r < e);

  // textures
  const winTex = paintTexture('town_house_win', 128, 128, HOUSE_GLSL_WIN);
  const winEmis = paintTexture('town_house_emis', 128, 128, (g, w, h) => HOUSE_EMIS(g, w, h, rng(3)));
  const aptTex = paintTexture('town_apt_win', 256, 256, APT_WIN);
  const aptEmis = paintTexture('town_apt_emis', 256, 256, (g, w, h) => APT_EMIS(g, w, h, rng(5)));
  const mats = {
    house: toon({ color: '#ffffff', map: winTex, emissive: col(opts.winColor || '#ffb060'), emissiveMap: winEmis, emissiveIntensity: p.windows * 2.5 }),
    apt: toon({ color: '#ffffff', map: aptTex, emissive: col(opts.winColor || '#ffb060'), emissiveMap: aptEmis, emissiveIntensity: p.windows * 2.5 }),
    roof: toon({ color: '#ffffff' }), tree: toon({ color: '#ffffff' }), trunk: toon({ color: '#3a2a20' }),
  };

  // houses
  const NH = opts.houses || 9000;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1); boxGeo.translate(0, 0.5, 0);
  const houses = new THREE.InstancedMesh(boxGeo, mats.house, NH);
  const roofs = new THREE.InstancedMesh(gableGeometry(THREE), mats.roof, NH);
  const NA = opts.apts || 160;
  const apts = new THREE.InstancedMesh(boxGeo, mats.apt, NA);
  const NT = opts.trees || 6000;
  const trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mats.tree, NT);
  let nh = 0, na = 0, nt = 0;
  const Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), S = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Color();
  const pick = (a) => a[Math.floor(R() * a.length)];
  const S0 = opts.sRange?.[0] ?? -500, S1 = opts.sRange?.[1] ?? 700, D0 = opts.dRange?.[0] ?? -450, D1 = opts.dRange?.[1] ?? 450;
  const cells = [];
  for (let s = S0; s < S1; s += 11) for (let d = D0; d < D1; d += 11) cells.push([s, d, 1]);
  if (opts.outer !== false) for (let s = -1400; s < 1700; s += 20) for (let d = -1400; d < 1400; d += 20) if (s < S0 || s > S1 || d < D0 || d > D1) cells.push([s, d, 1.6]);
  for (const [s, d, sc] of cells) {
    if (Math.abs(d + 1) < 9) continue;                         // keep rail corridor clear
    const js = s + (R() - 0.5) * 3 * sc, jd = d + (R() - 0.5) * 3 * sc;
    const far = Math.hypot(s - 100, d) > 520;
    const r = R();
    if (inRoad(js, jd, 5)) continue;
    if (r < (opts.aptRate ?? 0.012) && na < NA && Math.abs(d) > 30) {          // apartment block
      const w = 12 + R() * 10, dep = 9 + R() * 4, h = 14 + R() * 18;
      if (inRoad(js, jd, w * 0.6)) continue;
      m4.compose(P.set(js, 0, jd), Q.setFromAxisAngle(Y, (R() < 0.5 ? 0 : Math.PI / 2)), S.set(w, h, dep)); apts.setMatrixAt(na, m4);
      apts.setColorAt(na++, C.set(pick(p.walls)).multiplyScalar(0.95 + R() * 0.1));
      continue;
    }
    if (r < (far ? 0.55 : 0.3)) {                             // tree clump
      for (let k = 0; k < 3 && nt < NT; k++) {
        const tr = (2.5 + R() * 3.5) * sc;
        m4.compose(P.set(js + (R() - 0.5) * 8, tr * 0.9 + R() * 2, jd + (R() - 0.5) * 8), Q.identity(), S.set(tr, tr * (0.8 + R() * 0.3), tr)); trees.setMatrixAt(nt, m4);
        trees.setColorAt(nt++, C.set(p.tree[k % 3 === 0 ? 0 : (R() < 0.5 ? 1 : 0)]).lerp(col(p.tree[2]), R() * 0.25));
      }
      continue;
    }
    if (nh >= NH) continue;
    const w = (6 + R() * 4) * sc, dep = (6 + R() * 4) * sc, h = 5.5 + (R() < 0.7 ? 2.8 : 0) + R(), rot = (R() < 0.5 ? 0 : Math.PI / 2) + (R() - 0.5) * 0.08;
    Q.setFromAxisAngle(Y, rot);
    m4.compose(P.set(js, 0, jd), Q, S.set(w, h, dep)); houses.setMatrixAt(nh, m4);
    houses.setColorAt(nh, C.set(pick(p.walls)).multiplyScalar(0.9 + R() * 0.15));
    m4.compose(P.set(js, h, jd), Q, S.set(w + 1.2, 2 + R() * 1.6, dep + 1.2)); roofs.setMatrixAt(nh, m4);
    roofs.setColorAt(nh++, C.set(pick(p.roofs)).multiplyScalar(0.85 + R() * 0.3));
  }
  houses.count = roofs.count = nh; apts.count = na; trees.count = nt;
  for (const m of [houses, roofs, apts, trees]) { m.castShadow = m.receiveShadow = true; m.instanceColor && (m.instanceColor.needsUpdate = true); town.add(m); }

  // utility poles along the roads near the focus (give scale + wires)
  const poleMat = toon({ color: '#2a2622' });
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.22, 10, 6).translate(0, 5, 0), poleMat, 200); let npl = 0;
  for (let s = -200; s < 500 && npl < 200; s += 30) for (const d of [20, -20, 99, -112]) { m4.compose(P.set(s, 0, d), Q.identity(), S.set(1, 1, 1)); poles.setMatrixAt(npl++, m4); }
  poles.count = npl; poles.castShadow = true; town.add(poles);

  // painted cloud billboards around the horizon (az relative to the sun azimuth, el in degrees)
  const clouds = [];
  const sunAz = Math.atan2(sunD.x, sunD.z);
  for (const c of (opts.clouds || [])) {
    const a = sunAz + c.az, e = (c.el || 6) * Math.PI / 180, R2 = c.dist || 2100;
    const cr = rng((c.seed || 1) * 31 + 7), puffs = [];
    if (c.kind === 'stratus' || c.kind === 'wisp') for (let i = 0; i < 14; i++) puffs.push([-0.4 + 0.8 * i / 13 + (cr() - 0.5) * 0.05, (cr() - 0.5) * 0.12, 0.13 + cr() * 0.09]);
    else for (let i = 0; i < 14; i++) { const x = -0.36 + 0.72 * cr(), xn = x / 0.4; puffs.push([x, -0.12 + 0.3 * Math.max(0, 1 - xn * xn) * cr(), (0.17 + cr() * 0.12) * (1 - 0.4 * Math.abs(xn))]); }
    const m = core.makeCloud({ puffs: c.puffs || puffs, w: c.w || 700, h: c.h || 260, seed: c.seed || 1, kind: c.kind || 'cumulus', light: c.light || p.sunColor, mid: c.mid || p.mid, shadow: c.shadow || p.zenith, lightDir: c.lightDir || [0, -1], opacity: c.opacity ?? 1, billboard: false, edge: c.edge ?? 0.12, detail: c.detail ?? 0.6 });
    m.position.set(A.x + Math.sin(a) * Math.cos(e) * R2, Math.sin(e) * R2, A.z + Math.cos(a) * Math.cos(e) * R2);
    m.lookAt(A.x, m.position.y * 0.6, A.z); m.material.fog = false; m.frustumCulled = false; scene.add(m); clouds.push(m);
  }
  const setTrain = (s) => { train.position.x = s; };
  const fog = () => { shared.uFogColor.value.set(p.fog); shared.uFogNear.value = p.fogNear; shared.uFogFar.value = p.fogFar; shared.uFogMax.value = p.fogMax; shared.uDapple.value = 0; shared.uSunDir.value.copy(sunD); };
  fog();
  return { scene, town, via, train, setTrain, frame: { A, U, N, toWorld, q: q4 }, mats, sky, sun, hemi, amb, fog, pal: p, houses, roofs, apts, trees, mountains: mts, ground, env, clouds };
}

/** Disable pbr.js leaf-shadow dapple on every material in `root` (wraps onBeforeCompile; must run before first render). */
export function killDapple(root, amt = 0) {
  root.traverse(o => {
    const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of ms) {
      if (!m.onBeforeCompile || m.userData.__nd) continue; m.userData.__nd = true;
      const ob = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => { ob.call(m, sh, r); if (sh.uniforms.uLeafAmt) sh.uniforms.uLeafAmt = { value: amt }; };
      const ck = m.customProgramCacheKey?.bind(m);
      m.customProgramCacheKey = () => (ck ? ck() : '') + '_nd' + amt;
    }
  });
}
