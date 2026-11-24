// Rendering core: renderer, post-processing (bloom, grading, underwater).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uUnder: { value: 0 },
    uUnderColor: { value: new THREE.Color(0.03, 0.25, 0.28) },
    uVignette: { value: 0.32 },
    uSat: { value: 1.1 },
    uAspect: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uUnder; uniform vec3 uUnderColor;
    uniform float uVignette; uniform float uSat; uniform float uAspect;
    varying vec2 vUv;
    void main(){
      vec2 uv = vUv;
      if (uUnder > 0.0) {
        uv += vec2(sin(uv.y * 24.0 + uTime * 1.7), cos(uv.x * 19.0 + uTime * 1.3)) * 0.0022 * uUnder;
      }
      vec4 c = texture2D(tDiffuse, uv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      if (uUnder > 0.0) {
        // depth haze + light shafts from above
        float shafts = pow(max(0.0, sin(uv.x * 23.0 + uTime * 0.4) * sin(uv.x * 9.0 - uTime * 0.27 + 1.3)), 6.0) * smoothstep(0.2, 1.0, uv.y);
        c.rgb = mix(c.rgb, c.rgb * vec3(0.55, 0.92, 0.95) + uUnderColor * 0.25, 0.65 * uUnder);
        c.rgb += uUnderColor * shafts * 0.35 * uUnder;
      }
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
      float vig = smoothstep(0.95, 0.25, length(d));
      c.rgb *= mix(1.0 - uVignette, 1.0, vig);
      gl_FragColor = c;
    }`,
};

export class RenderCore {
  constructor(container) {
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.78;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.localClippingEnabled = true;
    container.appendChild(r.domElement);
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 12000);

    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.16, 0.4, 5.0);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.grade.uniforms.uAspect.value = w / h;
    if (this.onResize) this.onResize(w, h, this.renderer.getPixelRatio());
  }

  setQuality(q) {
    this.quality = q;
    this.renderer.setPixelRatio(q >= 1 ? Math.min(window.devicePixelRatio || 1, 1.5) : Math.min(window.devicePixelRatio || 1, 1) * 0.8);
    this.renderer.shadowMap.enabled = true;
    this.resize();
  }

  render() {
    this.composer.render();
  }
}
