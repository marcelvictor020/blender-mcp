// world_kagero_giant (3 s) — CLASH: a colossal heat-haze kagerō towers over the town at dusk, behind the viaduct.
// Its body is a translucent, shimmering silhouette that REFRACTS the town and sky behind it (the scene is first
// rendered to a half-res target, then the giant's shader samples it with flowing distortion + chromatic split),
// with a hot rim, and many eyes opening across its head and chest. Street-level camera looking up, slow tilt.
import { makeTown, PALETTES } from './town.js';

const FRAG = /* glsl */`
uniform sampler2D tBg; uniform vec2 uRes; uniform float uTime, uRise, uEyes; varying vec2 vUv;
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float cap(vec2 p, vec2 a, vec2 b, float r){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
// silhouette in metres: feet at y = 0, ~230 m tall, hunched with the head pushed forward and long dangling arms
float giant(vec2 p, float t){
  float sw = sin(t * 0.9) * 3.0;
  vec2 q = p + vec2(0.0, 0.0);
  float d = cap(q, vec2(0., 20.), vec2(4. + sw * 0.3, 150.), 30.);                       // torso
  d = smin(d, cap(q, vec2(-62., 150.), vec2(60., 158.), 20.), 22.);                         // shoulders
  d = smin(d, length((q - vec2(14. + sw, 196.)) / vec2(1.0, 1.15)) - 30., 16.);           // head
  d = smin(d, cap(q, vec2(-62., 150.), vec2(-92. - sw, 70.), 13.), 10.);                    // left upper arm
  d = smin(d, cap(q, vec2(-92. - sw, 70.), vec2(-80. - sw * 2., -10.), 10.), 8.);           // left forearm (reaches the roofs)
  d = smin(d, cap(q, vec2(60., 158.), vec2(96. + sw, 84.), 13.), 10.);
  d = smin(d, cap(q, vec2(96. + sw, 84.), vec2(112. + sw * 2., 6.), 10.), 8.);
  d = smin(d, cap(q, vec2(-20., -20.), vec2(-14., 40.), 16.), 10.);                         // legs
  d = smin(d, cap(q, vec2(22., -20.), vec2(16., 40.), 16.), 10.);
  // horns / crown spikes of haze
  for (int i = 0; i < 5; i++){ float fi = float(i); vec2 b = vec2(-10. + fi * 9. + sw, 220.); d = smin(d, cap(q, b, b + vec2((fi - 2.) * 9., 26. + 14. * h21(vec2(fi, 3.))), 3.5), 6.); }
  return d;
}
void main(){
  float t = uTime;
  vec2 p = (vUv - vec2(0.5, 0.0)) * vec2(360., 300.);
  p.y += (1.0 - uRise) * 260.0;                                       // rises out of the haze
  vec2 flow = vec2(fbm(p * 0.02 + vec2(0., -t * 0.9)), fbm(p * 0.02 + vec2(7., -t * 1.1))) - 0.5;
  float d = giant(p + flow * 26.0, t) + (fbm(p * 0.05 + vec2(0., -t * 1.5)) - 0.5) * 14.0;
  float inside = smoothstep(4.0, -4.0, d);
  float rim = exp(-pow(d / 3.5, 2.0));
  float halo = exp(-max(d, 0.0) / 30.0) * 0.5;
  if (inside + rim + halo < 0.003) discard;
  vec2 suv = gl_FragCoord.xy / uRes;
  // refraction: offset grows toward the edges (lens-like), flows upward; chromatic split
  vec2 off = (flow * 0.085 + vec2(0.0, 0.01) * sin(p.y * 0.08 - t * 5.0)) * (inside * 0.7 + rim);
  vec3 bg;
  bg.r = texture2D(tBg, suv + off * 1.15).r;
  bg.g = texture2D(tBg, suv + off).g;
  bg.b = texture2D(tBg, suv + off * 0.85).b;
  vec3 base = texture2D(tBg, suv).rgb;
  // body: refracted world, slightly darkened + warm, with shimmering caustic bands
  float bands = smoothstep(0.55, 0.9, fbm(vec2(p.x * 0.03, p.y * 0.012 - t * 0.8)));
  vec3 body = bg * vec3(0.72, 0.6, 0.7) + vec3(0.9, 0.5, 0.3) * bands * 0.14 + vec3(0.08, 0.02, 0.06);
  vec3 col = mix(base, body, inside);
  col += vec3(1.0, 0.6, 0.35) * rim * 0.32;                          // hot edge shimmer
  col += vec3(0.6, 0.2, 0.25) * halo * (1.0 - inside) * 0.35;
  // eyes: almond lids with a glowing iris, opening one after another, blinking
  float eyes = 0.0; vec3 eyeC = vec3(0.0);
  for (int i = 0; i < 16; i++){
    float fi = float(i);
    vec2 c = vec2(-34. + 70. * h21(vec2(fi, 1.)), 120. + 95. * h21(vec2(fi, 2.)));
    if (i < 3) c = vec2(-2. + fi * 16., 198. + mod(fi, 2.) * 6.);   // cluster on the face
    float sz = (i < 3 ? 7.0 : 3.0 + 5.0 * h21(vec2(fi, 4.)));
    float open = smoothstep(0.0, 0.15, uEyes * 1.6 - h21(vec2(fi, 5.)) * 0.9) * (1.0 - smoothstep(0.92, 1.0, abs(sin(t * 1.3 + fi * 2.1))));
    vec2 e = (p + flow * 10.0 - c) / sz;
    float lid = abs(e.y) - open * 0.45 * (1.0 - e.x * e.x);
    float m = smoothstep(0.06, -0.06, lid) * step(abs(e.x), 1.0);
    float iris = smoothstep(0.42, 0.34, length(e - vec2(0.12 * sin(t + fi), 0.0)));
    float pup = smoothstep(0.13, 0.08, abs(e.x - 0.12 * sin(t + fi))) * iris;
    vec3 ec = mix(vec3(1.0, 0.95, 0.85) * 1.4, vec3(1.0, 0.3, 0.05) * 2.6, iris);
    ec = mix(ec, vec3(0.02, 0.0, 0.0), pup);
    eyeC = mix(eyeC, ec, m); eyes = max(eyes, m);
  }
  col = mix(col, eyeC, eyes * max(inside, 0.6));
  gl_FragColor = vec4(col, 1.0);
}`;

export default {
  dur: 3.0,
  post: {
    bloom: 0.8, bloomRadius: 0.75, bloomThreshold: 0.66, exposure: 1.0, contrast: 1.15, saturation: 1.12,
    lift: [0.03, 0.01, 0.05], gamma: [1.02, 0.98, 1.0], gain: [1.05, 0.95, 0.95], vignette: 0.45, grain: 0.045, ca: 0.0025, soft: 0.04,
  },
  build(core, ctx) {
    const { THREE, smooth, lerp } = core;
    const pal = { ...PALETTES.dusk, horizon: '#ff7a3a', mid: '#a04a6a', zenith: '#1a1440', sunColor: '#ff6a30', glow: 1.3, streak: 0.6, streakColor: '#3a1a40', windows: 0.7, fogMax: 0.7 };
    const T = makeTown(core, ctx, pal, { key: 'kagero', focusS: 100, focusD: 40, houses: 7000, trees: 3500, streets: [[93, 105, -600, 600]] });
    const { scene, frame } = T;
    const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.3, 6000);
    const W = ctx?.W || core.ctx.W || 1280, H = ctx?.H || core.ctx.H || 720;
    const rt = new THREE.WebGLRenderTarget(Math.round(W / 2), Math.round(H / 2), { type: THREE.HalfFloatType });
    const mat = new THREE.ShaderMaterial({
      uniforms: { tBg: { value: rt.texture }, uRes: { value: new THREE.Vector2(W, H) }, uTime: core.shared.uTime, uRise: { value: 1 }, uEyes: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: FRAG, transparent: true, depthWrite: false,
    });
    const giant = new THREE.Mesh(new THREE.PlaneGeometry(360, 300), mat); giant.geometry.translate(0, 150, 0);
    giant.frustumCulled = false; giant.renderOrder = 5; scene.add(giant);
    const gpos = frame.toWorld(118, -260, -5);
    // sun low behind the giant
    const camP = frame.toWorld(99, 93, 1.5);
    const sunW = gpos.clone().sub(camP).setY(0).normalize().setY(0.12).normalize();
    T.sky.material.uniforms.uSun.value.copy(sunW);
    T.sun.position.copy(T.sun.target.position).addScaledVector(sunW, 400);
    const renderer = ctx?.renderer || core.ctx.renderer;
    return {
      scene, camera,
      update(t) {
        T.fog();
        const k = smooth(0, 3, t);
        camera.position.copy(frame.toWorld(lerp(99, 99.6, k), lerp(93, 91, k), 1.5));
        camera.lookAt(frame.toWorld(108, -200, lerp(45, 80, smooth(0.2, 2.6, t))));
        T.setTrain(-60 + t * 18);
        giant.position.copy(gpos);
        giant.rotation.set(0, Math.atan2(camera.position.x - gpos.x, camera.position.z - gpos.z), 0);
        mat.uniforms.uRise.value = 0.82 + 0.18 * smooth(0, 2.2, t);
        mat.uniforms.uEyes.value = smooth(0.6, 2.4, t);
        // refraction source: the scene without the giant
        if (renderer) {
          giant.visible = false; camera.updateMatrixWorld(true);
          camera.aspect = 16 / 9; camera.updateProjectionMatrix();
          const prev = renderer.getRenderTarget();
          renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(prev);
          giant.visible = true;
        }
      },
    };
  },
};
