// GPU wake simulation. A vehicle-centred 2D height field (wave equation with
// a finite wave speed) is forced by the moving hull, pods and foils, so the
// wake forms a physically emergent V (Mach cone) whose angle narrows with
// speed. Foam and propeller turbulence are advected/decayed in other channels.
// Channels: R = foam, G = height, B = previous height, A = turbulence.
import * as THREE from 'three';

const MAX_SRC = 32;

const SIM_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uPrev;
uniform vec2 uShift;      // texel-exact recentring offset (uv)
uniform float uTexel;     // 1/size
uniform float uC2;        // (c dt / dx)^2
uniform float uDamp;
uniform float uFoamDecay;
uniform float uTurbDecay;
uniform float uMetres;    // map extent (m)
uniform vec4 uSrc[${MAX_SRC}];   // x,z (uv), radius (m), depression (m)
uniform vec4 uSrcB[${MAX_SRC}];  // foam rate, turbulence rate, stretch dir x, stretch dir z
uniform int uCount;
varying vec2 vUv;

vec4 fetch(vec2 uv){
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(uPrev, uv);
}

void main(){
  vec2 uv = vUv + uShift;
  vec4 c = fetch(uv);
  float h = c.g, hp = c.b;
  vec4 l = fetch(uv - vec2(uTexel, 0.0)), r = fetch(uv + vec2(uTexel, 0.0));
  vec4 d = fetch(uv - vec2(0.0, uTexel)), u = fetch(uv + vec2(0.0, uTexel));
  float lap = l.g + r.g + d.g + u.g - 4.0 * h;
  float hn = (2.0 * h - hp + uC2 * lap) * uDamp;
  float foam = (c.r * 0.6 + (l.r + r.r + d.r + u.r) * 0.1) * uFoamDecay;
  float turb = (c.a * 0.7 + (l.a + r.a + d.a + u.a) * 0.075) * uTurbDecay;
  // breaking wave crests create foam
  foam += clamp(abs(lap) * 0.9 - 0.004, 0.0, 0.03);
  for (int i = 0; i < ${MAX_SRC}; i++) {
    if (i >= uCount) break;
    vec4 s = uSrc[i]; vec4 sb = uSrcB[i];
    vec2 dm = (vUv - s.xy) * uMetres;
    // optional elongation along the hull direction
    vec2 dir = sb.zw;
    float along = dot(dm, dir), across = dot(dm, vec2(-dir.y, dir.x));
    float stretch = length(dir) > 0.0 ? 0.35 : 1.0;
    float r2 = (along * along * stretch + across * across) / (s.z * s.z);
    float w = exp(-r2 * 2.0);
    hn = mix(hn, -s.w, w * 0.18);
    foam += sb.x * w;
    turb += sb.y * w;
  }
  vec2 e = smoothstep(0.0, 0.06, vUv) * smoothstep(1.0, 0.94, vUv);
  float edge = e.x * e.y;
  hn *= mix(0.92, 1.0, edge);
  gl_FragColor = vec4(clamp(foam, 0.0, 1.6), clamp(hn, -2.0, 2.0), h, clamp(turb, 0.0, 1.5));
}
`;

export class WakeSim {
  constructor(renderer, size = 512, metres = 240) {
    this.renderer = renderer;
    this.size = size;
    this.metres = metres;
    this.texelM = metres / size;
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
    this.rt = [new THREE.WebGLRenderTarget(size, size, opts), new THREE.WebGLRenderTarget(size, size, opts)];
    this.cur = 0;
    this.center = new THREE.Vector2(0, 0);
    this.src = Array.from({ length: MAX_SRC }, () => new THREE.Vector4());
    this.srcB = Array.from({ length: MAX_SRC }, () => new THREE.Vector4());
    this.count = 0;
    const waveSpeed = 4.6; // m/s
    const dtSim = 1 / 60;
    this.dtSim = dtSim;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: null },
        uShift: { value: new THREE.Vector2() },
        uTexel: { value: 1 / size },
        uC2: { value: Math.pow((waveSpeed * dtSim) / this.texelM, 2) },
        uDamp: { value: 0.9965 },
        uFoamDecay: { value: 0.9955 },
        uTurbDecay: { value: 0.985 },
        uMetres: { value: metres },
        uSrc: { value: this.src },
        uSrcB: { value: this.srcB },
        uCount: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: SIM_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.acc = 0;
    // clear both targets
    const r = renderer;
    const old = r.getRenderTarget();
    for (const t of this.rt) { r.setRenderTarget(t); r.setClearColor(0x000000, 0); r.clear(); }
    r.setRenderTarget(old);
  }

  get texture() { return this.rt[this.cur].texture; }
  get info() { return new THREE.Vector3(this.center.x, this.center.y, this.metres); }

  // sources: [{x, z, r, depth, foam, turb, dx, dz}]
  setSources(list) {
    this.count = Math.min(MAX_SRC, list.length);
    this._list = list;
  }

  update(dt, focusX, focusZ) {
    this.acc = Math.min(this.acc + dt, this.dtSim * 3);
    const r = this.renderer;
    const old = r.getRenderTarget();
    const oldClear = r.getClearColor(new THREE.Color()), oldAlpha = r.getClearAlpha();
    while (this.acc >= this.dtSim) {
      this.acc -= this.dtSim;
      // recentre on texel boundaries so the field never blurs
      const tm = this.texelM;
      const nx = Math.round(focusX / tm) * tm, nz = Math.round(focusZ / tm) * tm;
      const shift = this.mat.uniforms.uShift.value;
      shift.set((nx - this.center.x) / this.metres, (nz - this.center.y) / this.metres);
      this.center.set(nx, nz);
      for (let i = 0; i < this.count; i++) {
        const s = this._list[i];
        this.src[i].set((s.x - nx) / this.metres + 0.5, (s.z - nz) / this.metres + 0.5, s.r, s.depth);
        this.srcB[i].set(s.foam || 0, s.turb || 0, s.dx || 0, s.dz || 0);
      }
      this.mat.uniforms.uCount.value = this.count;
      this.mat.uniforms.uPrev.value = this.rt[this.cur].texture;
      this.cur = 1 - this.cur;
      r.setRenderTarget(this.rt[this.cur]);
      r.render(this.scene, this.cam);
    }
    r.setRenderTarget(old);
    r.setClearColor(oldClear, oldAlpha);
  }
}
