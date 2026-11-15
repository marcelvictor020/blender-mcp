// KAGERŌ cast: REN, AOI, THE COLLECTOR — spec-driven characters built with anime_char.js.
//   import { makeRen, makeAoi, makeCollector } from './char/cast.js';
//   const ren = makeRen(core);  scene.add(ren.group);  ren.setPose('lookBack');  ren.setExpression({ blink: 1 });
//   ren.setExpression({ eyeColorL: '#d0182a', pupilSlitL: 1, glowL: 1 });   // crimson transformation (left eye)
//   per frame: ren.update(t)
import { makeCharacter } from './anime_char.js';

const BASE_FACE = {
  eyeX: 0.18, eyeY: 0.395, eyeW: 0.11, eyeH: 0.09, eyeTilt: 0.0,
  irisRX: 0.057, irisRY: 0.073, irisIn: 0.0, pupilR: 0.026,
  lidThick: 0.017, lineColor: '#1e1418', lowerLid: '#8a5650', creaseColor: '#c48e82', lidShadow: '#4c4270',
  browY: 0.535, browIn: 0.07, browOut: 0.265, browArch: 0.014, browThick: 0.011,
  noseX: 0.01, noseY: 0.262, noseColor: '#b77d74',
  mouthY: 0.135, mouthW: 0.03, mouthLine: '#6a3232', mouthIn: '#7a2b33', tongue: '#e0767c',
  blushX: 0.205, blushY: 0.245, blushR: 0.08, blushColor: '#f08c8c', blush: 0.6,
};

export const REN_SPEC = {
  name: 'Ren', gender: 'm', height: 1.72, headH: 0.235,
  skin: '#f6dccb', skinShade: '#e0aea0', skinLine: '#7a4a44',
  face: { ...BASE_FACE, iris: '#7d8a99', eyeStyle: 'male', browColor: '#262b36', plaster: { x: -0.235, y: 0.235, rot: 0.45 }, blush: 0.45 },
  hair: { style: 'messy', seed: 3, color: '#3b4250', hl: '#5c6678', shade: '#262b36', line: '#11141b', strandColor: '#242833', hlY: 0.5, hlW: 0.075, linePx: 1.2 },
  wear: {
    top: { color: '#1f2740', shade: '#141a2e', bottom: '#1a1a20', beltY: 0.99, belt: '#0c0c10' },                         // dark navy tee
    legs: { type: 'trousers', color: '#1a1a20', shade: '#0e0e14' },
    shoes: { type: 'sneaker', color: '#f4f4f2', shade: '#c4c8d8', sole: '#d9d4c8', line: '#55596a' },
    openShirt: { color: '#eef0f0', shade: '#c9cfe2', hem: 0.98, pocket: true },
    sleeves: { color: '#eef0f0', shade: '#c9cfe2', len: 0.15 },
    shirtCollar: { color: '#eef0f0', shade: '#c9cfe2' },
    bracelet: '#c8102e',
  },
};

export const AOI_SPEC = {
  name: 'Aoi', gender: 'f', height: 1.6, headH: 0.228,
  skin: '#f8e0d0', skinShade: '#e8b2a4', skinLine: '#80504a',
  headShape: { cheekW: 0.395, chinW: 0.035, jawPow: 1.85 },
  face: { ...BASE_FACE, iris: '#2f9c9a', eyeStyle: 'female', eyeW: 0.108, eyeH: 0.095, eyeY: 0.39, irisRX: 0.058, irisRY: 0.076, pupilR: 0.026, lidThick: 0.018,
    browColor: '#5a3424', browThick: 0.009, browY: 0.53, mouthW: 0.026, blush: 0.75, blushLines: true, sparkle: true },
  hair: { style: 'bob', seed: 5, color: '#5a3424', hl: '#8a5636', shade: '#3e2118', line: '#1e0c06', hlY: 0.48, hlW: 0.08 },
  wear: {
    top: { color: '#fbfbf8', shade: '#c8cde2', bottom: '#22305a', beltY: 1.07 },  // sailor blouse (+ navy shorts under the skirt)
    legs: { type: 'bare' },
    socks: { color: '#fbfbf8', shade: '#c4c8dc', top: -0.56 },
    shoes: { type: 'loafer', color: '#6a3c22', shade: '#40220f', sole: '#2a1a12', line: '#1e0e06' },
    sleeves: { color: '#fbfbf8', shade: '#c8cde2', len: 0.14, cuff: '#22305a' },
    sailor: { color: '#22305a', stripe: '#f2f2f0', scarf: '#c81e2c' },
    skirt: { color: '#24305a', shade: '#151c3a', top: 1.05, hem: 0.62, flareX: 0.24, flareZ: 0.2, pleats: 24 },
    clip: { color: '#ffd23a', pos: [-0.47, 0.6, 0.12], rotY: -1.15, rotZ: 0.35, size: 0.75 },
  },
};

export const COLLECTOR_SPEC = {
  name: 'Collector', gender: 'm', height: 1.95, headH: 0.25, shoulderK: 1.05,
  skin: '#e9e2da', skinShade: '#c9bcc0', skinLine: '#5a4c54',
  headShape: { W0: 0.4, cheekW: 0.36, chinW: 0.05, jawPow: 1.4, cy: 0.58, faceZ: 0.37, chinZ: 0.35 },
  face: { ...BASE_FACE, iris: '#3a3038', eyeStyle: 'narrow', eyeW: 0.1, eyeH: 0.06, eyeY: 0.42, browColor: '#2a2a30', browY: 0.53, browArch: 0.02,
    mouthY: 0.12, mouthW: 0.05, blush: 0.0, lineColor: '#1a1418', noseY: 0.25, topShade: 0.5, topShadeA: 0.75 },
  expr: { mouth: 'smirk' },
  hair: { style: 'lank', seed: 9, color: '#2a2a30', hl: '#4a4a56', shade: '#16161c', line: '#050507', hlY: 0.2, hlW: 0.05, hlAmt: 0.6 },
  wear: {
    top: { color: '#24242a', shade: '#17171c', bottom: '#1a1a1f', beltY: 0.97 },
    legs: { type: 'trousers', color: '#1a1a1f', shade: '#0e0e12' },
    shoes: { type: 'boot', color: '#141416', shade: '#0a0a0c', sole: '#0c0c0e', line: '#000000' },
    coat: { color: '#2a2a30', shade: '#18181e', hem: 0.36, flare: 0.25 },
    gloves: '#121214',
    hat: { color: '#34343c', shade: '#1b1b21', rim: '#6c6c78', band: '#a31826' },
    jar: true,
  },
};

export const makeRen = (core, o = {}) => makeCharacter(core, { ...REN_SPEC, ...o });
export const makeAoi = (core, o = {}) => makeCharacter(core, { ...AOI_SPEC, ...o });
export const makeCollector = (core, o = {}) => makeCharacter(core, { ...COLLECTOR_SPEC, pose: 'holdJar', ...o });
