// Realistic-rendering toolkit shared by all shots (built on the vehicle renderer).
//   pbrUniforms({ sunDir, leafAmt, leafCover, leafScale, leafSharp, leafSeed, rimColor, rimAmt, rimPow, grime, sunGain })
//   pbr(u, { color, map, normalMap, roughness, metalness, clearcoat, envMap, ... }, zones?, cacheKey)
//       -> MeshPhysicalMaterial with leaf-shadow dapple on direct light, rim light, grime, sun gain
//   makeEnvMap(key, { zenith, horizon, ground, sunDir, sunColor, sunPower, clouds:[...], blocks:[...] })  -> PMREM texture
//   addSunShadow(scene, { sunDir, color, intensity, target: Vector3, radius })  -> shadow-casting DirectionalLight
//   canvasTex(w, h, (g,w,h)=>{}, srgb) ; heightNormalMap(w, h, drawHeight, strength) ; texSet(w, h, draw) -> { map, normalMap, roughnessMap }
//   profileExtrude(points[[f,y]], width, { bevel, segs, taper, crease })   (rounded-edge extrusion; see vehicles.js axes)
//   makeGroundShadow(objLike{length,width,u}, opts)
// Remember: lights you add affect every lit material in the scene; painted ShaderMaterials ignore lights.
import * as THREE from 'three';
export { vehicleUniforms as pbrUniforms, physical as pbr, canvasTex, makeEnvMap, addVehicleLight as addSunShadow, makeGroundShadow, profileExtrude } from './vehicles.js';
import { canvasTex } from './vehicles.js';

/** Normal map from a height field drawn on a canvas (white = high). */
export function heightNormalMap(w, h, drawHeight, strength = 2.0, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); drawHeight(g, w, h);
  const src = g.getImageData(0, 0, w, h).data;
  const out = g.createImageData(w, h); const o = out.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1); const i = (y * w + x) * 4;
    o[i] = (-dx / l * 0.5 + 0.5) * 255; o[i + 1] = (dy / l * 0.5 + 0.5) * 255; o[i + 2] = (1 / l * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Colour + normal + roughness maps from one drawing callback that paints albedo; height derived from luminance. */
export function texSet(w, h, draw, { normalStrength = 2.0, roughBase = 0.75, roughVar = 0.2, repeat = true } = {}) {
  const map = canvasTex(w, h, draw, true);
  const img = map.image;
  const normalMap = heightNormalMap(w, h, (g) => g.drawImage(img, 0, 0), normalStrength, repeat);
  const roughnessMap = canvasTex(w, h, (g) => {
    g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, w, h); const a = d.data;
    for (let i = 0; i < a.length; i += 4) { const l = (a[i] + a[i + 1] + a[i + 2]) / 765; const v = (roughBase + (0.5 - l) * roughVar) * 255; a[i] = a[i + 1] = a[i + 2] = v; }
    g.putImageData(d, 0, 0);
  }, false);
  if (repeat) for (const t of [map, roughnessMap]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return { map, normalMap, roughnessMap };
}
