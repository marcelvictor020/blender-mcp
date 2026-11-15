// world_eye (3 s) — THE TURN: extreme close-up of Ren's LEFT eye as one fullscreen procedural shader.
// Anime eye: heavy upper lash line with winged outer corner, lid crease, sclera with lid shadow, layered iris
// (limbal ring, top-dark gradient, radial striations, inner ring), pupil, two highlights. Over 3 s the iris bleeds
// from amber to crimson (ink front from the pupil), the pupil narrows to a slit and SPLITS vertically in two,
// red cracks race outward across the skin, and a chain-link fence shadow drifts across the face.

const FRAG = /* glsl */`
uniform float uT, uAsp; varying vec2 vUv;
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float ridge(vec2 p){ float a = 0.5, s = 0.; for (int i = 0; i < 4; i++){ float n = 1.0 - abs(vn(p) * 2.0 - 1.0); s += a * n * n; p = p * 2.1 + 7.3; a *= 0.5; } return s; }
float sm(float a, float b, float x){ return smoothstep(a, b, x); }
vec2 h22(vec2 p){ return vec2(h21(p), h21(p + 19.7)); }
float vedge(vec2 x){ vec2 n = floor(x), f = fract(x), mg, mr; float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){ vec2 g = vec2(i, j); vec2 r = g + h22(n + g) - f; float d = dot(r, r); if (d < md){ md = d; mr = r; mg = g; } }
  md = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++){ vec2 g = mg + vec2(i, j); vec2 r = g + h22(n + g) - f; if (dot(mr - r, mr - r) > 1e-5) md = min(md, dot(0.5 * (mr + r), normalize(r - mr))); }
  return md; }
vec3 srgb2lin(vec3 c){ return pow(c, vec3(2.2)); }

void main(){
  float t = uT;
  vec2 p = (vUv - 0.5) * vec2(uAsp, 1.0);            // frame height = 1
  // subtle handheld drift + shock tremble
  float trem = sm(0.25, 0.4, t) * (1.0 - sm(0.6, 1.2, t));
  p += vec2(sin(t * 1.3) * 0.006, cos(t * 1.1) * 0.004) + trem * vec2(sin(t * 83.0), cos(t * 71.0)) * 0.004;
  p *= 1.0 - 0.06 * sm(0.0, 3.0, t);                  // slow push-in

  // ---------- lids ----------
  float open = 0.92 + 0.12 * sm(0.22, 0.38, t);        // eye widens in shock
  float x = p.x;
  const float X0 = 0.64; float ux = clamp(x / X0, -1.0, 1.0);
  float upper = (0.27 * pow(max(1.0 - ux * ux, 0.0), 0.5) + 0.045 * ux) * open - 0.0;   // outer corner (right) lifts
  float lower = -0.25 * pow(max(1.0 - pow(abs(ux), 2.2), 0.0), 0.7) - 0.045;
  float inEye = sm(-0.004, 0.004, upper - p.y) * sm(-0.004, 0.004, p.y - lower) * step(abs(ux), 0.999);

  // ---------- skin ----------
  vec3 skin = vec3(0.98, 0.84, 0.74);
  float crease = upper + 0.11 - 0.015 * ux;
  float inside = sm(1.35, 0.95, abs(x / X0));
  vec3 col = mix(skin * vec3(0.86, 0.7, 0.68), skin, mix(1.0, sm(0.0, 0.25, p.y - upper), inside));      // soft shading toward the lid
  col *= 1.0 - 0.35 * exp(-pow((p.y - crease) / 0.012, 2.0)) * sm(0.85, 0.3, abs(ux));   // double-lid crease line
  col *= mix(0.84, 1.0, sm(-0.55, -0.25, p.y));                                            // cheek shadow
  float blush = exp(-dot(p - vec2(0.25, -0.42), p - vec2(0.25, -0.42)) / 0.03);
  col = mix(col, vec3(1.0, 0.62, 0.6), blush * 0.25);

  // ---------- sclera ----------
  vec3 scl = vec3(0.86, 0.86, 0.9);
  float lidShadow = sm(0.11, 0.0, upper - p.y);
  scl = mix(scl, vec3(0.62, 0.66, 0.86), lidShadow * 0.85);
  scl = mix(scl, vec3(0.8, 0.82, 0.92), sm(0.4, 0.86, abs(ux)) * 0.6);
  // bloodshot veins creeping in from the corners as the curse takes hold
  float vein = sm(0.82, 0.95, ridge(p * 14.0 + 3.0)) * sm(0.35, 0.8, abs(ux)) * sm(0.6, 2.2, t);
  scl = mix(scl, vec3(0.75, 0.05, 0.05), vein * 0.8);

  // ---------- iris ----------
  vec2 ic = vec2(0.0, -0.03) + trem * vec2(sin(t * 61.0), cos(t * 53.0)) * 0.003;
  vec2 d = p - ic; float r = length(d); float ang = atan(d.y, d.x);
  float R = 0.27;
  // amber -> crimson bleed: an ink front grows from the pupil with a ragged noisy edge
  float bleedR = mix(-0.05, 0.33, sm(0.45, 1.7, t));
  float inkEdge = bleedR + 0.05 * (fbm(vec2(ang * 3.0, t * 0.8)) - 0.5) + 0.03 * sin(ang * 9.0 + t * 3.0);
  float crim = sm(inkEdge + 0.015, inkEdge - 0.015, r);
  vec3 irisTop = mix(vec3(0.36, 0.16, 0.04), vec3(0.24, 0.0, 0.02), crim);
  vec3 irisMid = mix(vec3(0.86, 0.5, 0.12), vec3(0.78, 0.04, 0.05), crim);
  vec3 irisBot = mix(vec3(1.0, 0.82, 0.36), vec3(1.0, 0.25, 0.18), crim);
  float gy = (d.y / R) * 0.5 + 0.5;
  vec3 iris = mix(irisBot, irisMid, sm(0.05, 0.55, gy)); iris = mix(iris, irisTop, sm(0.55, 0.95, gy));
  float stri = fbm(vec2(ang * 9.0, r * 7.0)) * 0.7 + 0.3 * vn(vec2(ang * 40.0, 1.0));
  iris *= 0.72 + 0.5 * stri;
  float ring = exp(-pow((r - R * 0.55) / 0.02, 2.0));
  iris = mix(iris, irisMid * 1.25 + 0.05, ring * 0.45);                                  // inner ring
  // radial spikes of light in the lower iris (anime "glass" look)
  iris += vec3(1.0, 0.7, 0.4) * mix(1.0, 0.0, crim) * sm(0.6, 1.0, vn(vec2(ang * 14.0, 3.0))) * sm(0.45, 0.85, r / R) * sm(0.5, 0.15, gy) * 0.35;
  iris = mix(iris, vec3(0.05, 0.01, 0.02), sm(R * 0.86, R, r));                         // limbal ring
  // ---------- pupil: round -> vertical slit -> split in two ----------
  float slit = sm(1.0, 1.6, t), split = sm(1.65, 2.25, t);
  float pr = mix(0.075, 0.04, sm(0.25, 0.4, t));                                        // shock contraction
  float pw = mix(pr, 0.022, slit), ph = mix(pr, 0.15, slit);
  float sep = 0.045 * split;
  vec2 q1 = d - vec2(-sep, 0.0), q2 = d - vec2(sep, 0.0);
  float e1 = length(q1 / vec2(pw, ph)), e2 = length(q2 / vec2(pw, ph));
  float pupil = sm(1.05, 0.95, min(e1, e2));
  vec3 pupC = mix(vec3(0.02, 0.0, 0.01), vec3(0.08, 0.0, 0.0), split);
  iris = mix(iris, pupC, pupil);
  iris = mix(iris, vec3(1.0, 0.15, 0.1) * 1.4, split * exp(-pow(abs(d.x) / 0.008, 2.0)) * sm(0.15, 0.0, abs(d.y)) * (1.0 - pupil));  // hot seam between the pupils
  float inIris = sm(R + 0.004, R - 0.004, r);
  vec3 eye = mix(scl, iris, inIris);
  // shadow of the upper lid on the iris
  eye *= mix(1.0, 0.45, lidShadow * inIris);
  // highlights (fixed in frame-space, they are reflections)
  float hl1 = sm(1.0, 0.9, length((p - ic - vec2(-0.085, 0.085)) / vec2(0.065, 0.05)));
  float hl2 = sm(1.0, 0.85, length((p - ic - vec2(0.09, -0.11)) / vec2(0.022, 0.018)));
  float hl3 = sm(1.0, 0.8, length((p - ic - vec2(0.04, 0.12)) / vec2(0.012, 0.012)));
  eye = mix(eye, vec3(1.0), max(hl1 * (1.0 - 0.4 * crim), max(hl2, hl3)) * inIris);
  col = mix(col, eye, inEye);

  // ---------- lash line + lashes + lower lid ----------
  float du = p.y - upper;
  float wing = sm(0.5, 0.98, ux);
  float thick = 0.026 + 0.03 * sm(-0.6, 0.9, ux) + 0.03 * wing;
  float lash = sm(thick, thick - 0.004, du) * sm(-0.012, -0.004, du) * step(abs(x), X0 * 1.0);
  // winged tail beyond the outer corner
  float tailY = 0.045 * open + 0.02 + (x - X0) * 0.45;
  float tail = step(X0 - 0.06, x) * sm(X0 + 0.22, X0 - 0.02, x) * sm(0.035 * sm(X0 + 0.22, X0 - 0.06, x), 0.0, abs(p.y - tailY));
  // individual lashes: spikes above the lash line
  float la = fract(x * 30.0); float lh = 0.045 + 0.04 * h21(vec2(floor(x * 30.0), 2.0)) + 0.05 * wing;
  float spikes = sm(0.16, 0.0, abs(la - 0.5 - (du - thick) * 4.0 * (0.3 + ux))) * sm(thick + lh, thick, du) * step(thick - 0.005, du) * step(abs(ux), 1.05);
  float lashes = max(max(lash, tail), spikes * sm(-0.9, -0.5, ux));
  vec3 lashC = vec3(0.04, 0.02, 0.05);
  col = mix(col, lashC, lashes);
  float lowLine = sm(0.006, 0.0, abs(p.y - lower + 0.002)) * sm(-0.5, 0.2, ux) * step(abs(ux), 1.0);
  col = mix(col, vec3(0.45, 0.22, 0.24), lowLine * 0.85);
  col = mix(col, lashC, sm(0.012, 0.0, abs(p.y - lower)) * sm(0.6, 0.95, ux) * step(x, X0));    // lower outer lashes
  // waterline glint
  col += vec3(1.0) * sm(0.004, 0.0, abs(p.y - lower - 0.008)) * sm(-0.3, 0.1, ux) * sm(0.5, 0.1, ux) * 0.5;

  // ---------- red cracks spreading across the frame (radially stretched Voronoi edges) ----------
  float grow = mix(0.0, 1.25, sm(1.35, 2.95, t));
  float rad = length(p - ic);
  vec2 pc = vec2(ang * 2.2, log(max(rad, 0.02)) * 3.2) + 0.25 * vec2(fbm(p * 5.0), fbm(p * 5.0 + 4.0));
  float ce = min(vedge(pc * 1.0), vedge(pc * 2.3 + 5.0) * 1.6 + sm(0.35, 0.7, rad) * 0.2);
  float front = grow - rad + 0.1 * (fbm(vec2(ang * 3.0, 2.0)) - 0.5);
  float alive = sm(0.0, 0.05, front) * sm(R - 0.03, R + 0.02, rad);
  float crack = sm(0.028, 0.01, ce) * alive;
  float glow = sm(0.08, 0.0, ce) * alive;
  col = mix(col, col * vec3(0.5, 0.12, 0.12), glow * 0.7);
  col = mix(col, vec3(1.0, 0.1, 0.05) * 1.3, crack);
  col = mix(col, vec3(1.0, 0.75, 0.6) * 1.6, sm(0.008, 0.0, ce) * alive);
  // ---------- chain-link fence shadow drifting across ----------
  vec2 f = p * mat2(0.70, -0.72, 0.72, 0.70) * 7.0 + vec2(t * 0.55, t * 0.12) + vec2(0.0, 0.0);
  f.x += 0.15 * sin(p.y * 2.0);                                                     // slight warp (curved face)
  vec2 g = abs(fract(f) - 0.5);
  float wire = sm(0.075, 0.025, min(g.x, g.y));
  float fe = -1.15 + t * 0.75;                                                        // shadow edge slides in from the left
  float fenceMask = sm(fe + 0.12, fe - 0.12, p.x);
  col *= 1.0 - 0.5 * wire * fenceMask;
  col *= 1.0 - 0.12 * fenceMask;

  // ---------- grade: red ambient creeping in; deep vignette ----------
  float redAmb = sm(0.8, 2.8, t);
  col = mix(col, col * vec3(1.05, 0.55, 0.55), redAmb * 0.6);
  col *= 1.0 - 0.45 * sm(0.45, 1.1, length(p * vec2(0.75, 1.0)));
  gl_FragColor = vec4(srgb2lin(clamp(col, 0.0, 4.0)) * (1.0 + crack * 1.5), 1.0);
}`;

export default {
  dur: 3.0,
  post: {
    bloom: 0.55, bloomRadius: 0.5, bloomThreshold: 0.9, exposure: 1.0, contrast: 1.1, saturation: 1.1,
    lift: [0.02, 0.0, 0.01], gamma: [1, 1, 1], gain: [1.02, 0.98, 0.98], vignette: 0.3, grain: 0.05, ca: 0.003, soft: 0.0,
  },
  build(core, ctx) {
    const { THREE } = core;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 10);
    const W = ctx?.W || 1280, H = ctx?.H || 720;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uAsp: { value: W / H } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }',
      fragmentShader: FRAG, depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); quad.frustumCulled = false; scene.add(quad);
    return { scene, camera, update(t) { mat.uniforms.uT.value = t; } };
  },
};
