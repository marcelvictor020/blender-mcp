// Vehicle material set: physically based paint, carbon, teak, leather,
// titanium, glass, LEDs. One set per car so designs can differ.
import * as THREE from 'three';
import { carbonTextures, teakTextures, leatherTextures, flakeNormal, brushedRoughness, grilleTextures, tireTextures } from '../util/textures.js';
import { withCuts, depthWithCuts } from './loft.js';

export const PAINTS = [
  { id: 'champagne', name: 'Champagne Bronze', color: '#a7896a', metal: 0.75, rough: 0.30 },
  { id: 'riviera', name: 'Riviera Turquoise', color: '#1f6e74', metal: 0.6, rough: 0.32 },
  { id: 'abyss', name: 'Abyss Blue', color: '#0d1d33', metal: 0.7, rough: 0.30 },
  { id: 'pearl', name: 'Portofino Pearl', color: '#e6e2da', metal: 0.18, rough: 0.28 },
  { id: 'nero', name: 'Nero Lava', color: '#0b0b0d', metal: 0.4, rough: 0.28 },
  { id: 'verde', name: 'Verde Ligure', color: '#22382d', metal: 0.65, rough: 0.30 },
  { id: 'corallo', name: 'Rosso Corallo', color: '#8e2a1f', metal: 0.55, rough: 0.30 },
  { id: 'titanio', name: 'Titanio Satin', color: '#6b6d70', metal: 0.85, rough: 0.36 },
];
export const FINISHES = [
  { id: 'gloss', name: 'Gloss', cc: 1, ccr: 0.02, roughMul: 1 },
  { id: 'satin', name: 'Satin', cc: 0.6, ccr: 0.38, roughMul: 1.4 },
  { id: 'liquid', name: 'Liquid Metal', cc: 1, ccr: 0.015, roughMul: 0.55, metal: 0.97 },
];
export const LEATHERS = [
  { id: 'cognac', name: 'Cognac', color: '#8a4a26' },
  { id: 'ivory', name: 'Ivory', color: '#d8cfbf' },
  { id: 'nero', name: 'Nero', color: '#1b1a1a' },
  { id: 'navy', name: 'Navy', color: '#1c2638' },
  { id: 'sage', name: 'Sage', color: '#6e7663' },
];
export const TRIMS = [
  { id: 'teak', name: 'Open-pore Teak' },
  { id: 'carbon', name: 'Forged Carbon' },
  { id: 'alu', name: 'Brushed Aluminium' },
];
export const WHEEL_FINISHES = [
  { id: 'titanium', name: 'Polished Titanium', color: '#c9c6c1', metal: 1, rough: 0.16 },
  { id: 'graphite', name: 'Satin Graphite', color: '#2b2c2f', metal: 0.85, rough: 0.38 },
  { id: 'bronze', name: 'Forged Bronze', color: '#7a5a3a', metal: 1, rough: 0.28 },
];
export const LIGHTS = [
  { id: 'ice', name: 'Ice White', color: '#e8f4ff' },
  { id: 'warm', name: 'Warm 3200K', color: '#ffd9a8' },
  { id: 'aqua', name: 'Aqua', color: '#9ff4ec' },
];

function tex(t, rx, ry) {
  const c = t.clone();
  c.repeat.set(rx, ry);
  c.needsUpdate = true;
  return c;
}

export class CarMaterials {
  constructor(cuts) {
    this.cuts = cuts;
    const carbon = carbonTextures();
    const teak = teakTextures();
    const quilt = leatherTextures(true);
    const plainL = leatherTextures(false);
    const flake = flakeNormal();
    const grille = grilleTextures();
    const tire = tireTextures();

    const paintParams = {
      color: 0xa7896a, metalness: 0.75, roughness: 0.3,
      clearcoat: 1, clearcoatRoughness: 0.02,
      normalMap: tex(flake, 7, 7), normalScale: new THREE.Vector2(0.06, 0.06),
      envMapIntensity: 1.15,
    };
    this.paint = new THREE.MeshPhysicalMaterial(paintParams);
    this.paintCut = withCuts(new THREE.MeshPhysicalMaterial(paintParams), cuts);
    const carbonParams = {
      color: 0xffffff, map: tex(carbon.map, 6, 6), normalMap: tex(carbon.normalMap, 6, 6), normalScale: new THREE.Vector2(0.35, 0.35),
      roughnessMap: tex(carbon.roughnessMap, 6, 6), roughness: 0.55, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.035,
    };
    this.carbon = new THREE.MeshPhysicalMaterial(carbonParams);
    this.carbonCut = withCuts(new THREE.MeshPhysicalMaterial(carbonParams), cuts);
    this.inner = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.62, metalness: 0.2 });
    this.innerCut = withCuts(this.inner.clone(), cuts);
    this.bodyDepth = depthWithCuts(cuts);

    this.glass = this._glass(0x5f7a7c, 0.3);
    this.tintGlass = this._glass(0x2a3236, 0.55);
    this.lensGlass = this._glass(0xffffff, 0.06);
    this.redLens = new THREE.MeshPhysicalMaterial({ color: 0x3a0405, roughness: 0.08, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.85 });

    this.chrome = new THREE.MeshPhysicalMaterial({ color: 0xdedbd6, metalness: 1, roughness: 0.06 });
    this.titanium = new THREE.MeshPhysicalMaterial({
      color: 0xc6c3bd, metalness: 1, roughness: 0.22, roughnessMap: tex(brushedRoughness(), 2, 2),
      anisotropy: 0.7, anisotropyRotation: 0,
    });
    this.darkTitanium = new THREE.MeshPhysicalMaterial({ color: 0x3b3d42, metalness: 0.95, roughness: 0.3, anisotropy: 0.4 });
    this.forged = new THREE.MeshPhysicalMaterial({ color: 0x9a9893, metalness: 1, roughness: 0.34 });
    this.gunmetal = new THREE.MeshStandardMaterial({ color: 0x24262a, metalness: 0.9, roughness: 0.42 });
    this.blackGloss = new THREE.MeshPhysicalMaterial({ color: 0x050506, metalness: 0.2, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03 });
    this.blackSatin = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, metalness: 0.3, roughness: 0.55 });
    this.rubber = new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.9, metalness: 0 });
    this.tire = new THREE.MeshPhysicalMaterial({ color: 0x111112, roughness: 0.82, metalness: 0, normalMap: tire.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), sheen: 0.2, sheenColor: 0x333333 });
    this.brakeDisc = new THREE.MeshStandardMaterial({ color: 0x55575a, metalness: 0.85, roughness: 0.45 });
    this.caliper = new THREE.MeshPhysicalMaterial({ color: 0x8a6a3c, metalness: 0.6, roughness: 0.35, clearcoat: 1 });
    this.wheel = new THREE.MeshPhysicalMaterial({ color: 0xc9c6c1, metalness: 1, roughness: 0.16, anisotropy: 0.5 });
    this.wheelAccent = new THREE.MeshPhysicalMaterial({ color: 0x18191b, metalness: 0.7, roughness: 0.3, clearcoat: 1 });

    this.teak = new THREE.MeshPhysicalMaterial({
      map: tex(teak.map, 1.4, 2.8), normalMap: tex(teak.normalMap, 1.4, 2.8), normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.52, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3, color: 0xffffff,
    });
    this.trimTeak = new THREE.MeshPhysicalMaterial({
      map: tex(teak.map, 0.8, 0.8), normalMap: tex(teak.normalMap, 0.8, 0.8), roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.12,
    });
    this.trim = this.trimTeak;
    this.trimCarbon = this.carbon;
    this.trimAlu = this.titanium;

    this.leather = new THREE.MeshPhysicalMaterial({
      color: 0x8a4a26, map: tex(quilt.map, 2.2, 2.2), normalMap: tex(quilt.normalMap, 2.2, 2.2), normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.58, sheen: 0.35, sheenRoughness: 0.6, sheenColor: 0x885533,
    });
    this.leatherPlain = new THREE.MeshPhysicalMaterial({
      color: 0x8a4a26, map: tex(plainL.map, 3, 3), normalMap: tex(plainL.normalMap, 3, 3), normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.55, sheen: 0.3, sheenRoughness: 0.6, sheenColor: 0x885533,
    });
    this.leatherDark = new THREE.MeshPhysicalMaterial({ color: 0x141414, map: tex(plainL.map, 3, 3), normalMap: tex(plainL.normalMap, 3, 3), roughness: 0.6, sheen: 0.3 });
    this.alcantara = new THREE.MeshPhysicalMaterial({ color: 0x1d1d1f, roughness: 1, sheen: 1, sheenRoughness: 0.8, sheenColor: 0x3a3a3c });
    this.carpet = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 1 });
    this.hull = new THREE.MeshPhysicalMaterial({ color: 0x0e1013, metalness: 0.1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
    this.hullLight = new THREE.MeshPhysicalMaterial({ color: 0xb9b2a5, metalness: 0.2, roughness: 0.3, clearcoat: 1 });
    this.copper = new THREE.MeshStandardMaterial({ color: 0xb06a3c, metalness: 1, roughness: 0.3 });
    this.orange = new THREE.MeshStandardMaterial({ color: 0xd2621a, roughness: 0.5 });
    this.hose = new THREE.MeshStandardMaterial({ color: 0x151516, roughness: 0.6, metalness: 0.1 });
    this.braided = new THREE.MeshStandardMaterial({ color: 0x8d8b88, roughness: 0.45, metalness: 0.8 });
    this.engineRed = new THREE.MeshPhysicalMaterial({ color: 0x6b1410, roughness: 0.6, metalness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.5 });
    this.engineBlock = new THREE.MeshStandardMaterial({ color: 0x6d6e70, roughness: 0.5, metalness: 0.85 });
    this.gold = new THREE.MeshStandardMaterial({ color: 0xc79a4a, metalness: 1, roughness: 0.18 });
    this.grille = new THREE.MeshStandardMaterial({ map: tex(grille.map, 6, 2), normalMap: tex(grille.normalMap, 6, 2), color: 0x777777, roughness: 0.55, metalness: 0.3, envMapIntensity: 0.4 });
    this.battery = new THREE.MeshStandardMaterial({ color: 0x233040, roughness: 0.45, metalness: 0.6 });

    this.led = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xe8f4ff, emissiveIntensity: 6 });
    this.ledRed = new THREE.MeshStandardMaterial({ color: 0x100000, emissive: 0xff1a12, emissiveIntensity: 4 });
    this.ledCyan = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x58e3d8, emissiveIntensity: 2.2 });
    this.ledAmbient = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc890, emissiveIntensity: 1.4 });
    this.projector = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.05, emissive: 0xdfefff, emissiveIntensity: 0.0 });

    this.xray = false;
    this._skinMats = [this.paint, this.paintCut, this.carbonCut, this.innerCut, this.glass, this.tintGlass];
  }

  _glass(color, opacity) {
    const m = new THREE.MeshPhysicalMaterial({
      color, metalness: 0, roughness: 0.02, transparent: true, opacity, envMapIntensity: 1.6,
      side: THREE.DoubleSide, depthWrite: false, ior: 1.52, specularIntensity: 1,
    });
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>',
        'gl_FragColor = vec4( totalDiffuse * diffuseColor.a + totalSpecular + totalEmissiveRadiance, diffuseColor.a );');
    };
    m.customProgramCacheKey = () => 'glass';
    return m;
  }

  setPaint(p, f) {
    const finish = f || this.finish || FINISHES[0];
    this.finish = finish;
    this.paintDef = p;
    for (const m of [this.paint, this.paintCut]) {
      m.color.set(p.color);
      m.metalness = finish.metal ?? p.metal;
      m.roughness = Math.min(0.9, p.rough * finish.roughMul);
      m.clearcoat = finish.cc;
      m.clearcoatRoughness = finish.ccr;
    }
  }

  setLeather(l) {
    for (const m of [this.leather, this.leatherPlain]) {
      m.color.set(l.color);
      m.sheenColor.set(l.color).multiplyScalar(0.8);
    }
  }

  setTrim(id) {
    const src = id === 'carbon' ? this.carbon : id === 'alu' ? this.titanium : this.trimTeak;
    this.trimId = id;
    for (const mesh of this.trimMeshes || []) mesh.material = src;
  }

  setWheelFinish(w) {
    this.wheel.color.set(w.color);
    this.wheel.metalness = w.metal;
    this.wheel.roughness = w.rough;
  }

  setLightColor(l) {
    this.led.emissive.set(l.color);
    this.ledCyan.emissive.set(l.id === 'warm' ? '#ffcf8a' : l.id === 'aqua' ? '#58e3d8' : '#bfe8ff');
  }

  setXray(on) {
    this.xray = on;
    for (const m of [this.paint, this.paintCut, this.carbonCut, this.innerCut]) {
      m.transparent = on;
      m.opacity = on ? 0.13 : 1;
      m.depthWrite = !on;
      m.needsUpdate = true;
    }
  }

  setClipping(planes) {
    for (const m of [this.paint, this.paintCut, this.carbonCut, this.innerCut, this.glass, this.tintGlass, this.carbon, this.inner, this.teak, this.hull, this.leather, this.leatherPlain, this.alcantara, this.blackGloss, this.lensGlass, this.redLens]) {
      m.clippingPlanes = planes;
      m.clipShadows = true;
      m.side = planes ? THREE.DoubleSide : (m === this.glass || m === this.tintGlass ? THREE.DoubleSide : THREE.FrontSide);
      m.needsUpdate = true;
    }
  }
}
