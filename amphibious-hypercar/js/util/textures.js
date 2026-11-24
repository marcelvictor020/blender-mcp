// Procedural texture factory. Everything is generated at start-up so the
// experience ships with no binary assets.
import * as THREE from 'three';
import { Simplex2, mulberry32, clamp, smoothstep } from './noise.js';

const cache = new Map();
function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function finish(tex, { srgb = false, repeat = true, aniso = 8 } = {}) {
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = aniso;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// Convert a Float32 height field into a tangent-space normal map (RGBA8 DataTexture).
function heightToNormal(height, w, h, strength = 2, wrap = true) {
  const data = new Uint8Array(w * h * 4);
  const at = (x, y) => {
    if (wrap) { x = (x + w) % w; y = (y + h) % h; } else { x = clamp(x, 0, w - 1); y = clamp(y, 0, h - 1); }
    return height[y * w + x];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nz * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  return finish(tex);
}

// ---------------------------------------------------------------- carbon fibre
export function carbonTextures() {
  return cached('carbon', () => {
    const S = 512, tows = 16, w = S / tows;
    const c = canvas(S, S), ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const height = new Float32Array(S * S);
    const rough = canvas(S, S), rctx = rough.getContext('2d');
    const rimg = rctx.createImageData(S, S);
    const rnd = mulberry32(7);
    const fiberNoise = new Float32Array(S);
    for (let i = 0; i < S; i++) fiberNoise[i] = rnd();
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const cx = Math.floor(x / w), cy = Math.floor(y / w);
        const lx = (x % w) / w, ly = (y % w) / w;
        const warp = (((cx - cy) % 4) + 4) % 4 < 2; // 2x2 twill
        const across = warp ? lx : ly; // coordinate across fibre bundle
        const along = warp ? ly : lx;
        const bulge = Math.sin(Math.PI * across);
        // tow dips where it passes under the crossing tow
        const dip = 0.75 + 0.25 * Math.sin(Math.PI * along);
        const hgt = bulge * dip;
        height[y * S + x] = hgt;
        const fib = fiberNoise[(warp ? x : y) % S] * 0.18;
        const sheen = warp ? 0.62 : 0.38; // anisotropic look: bundles catch light differently
        let v = 18 + 34 * sheen * (0.55 + 0.45 * bulge) + fib * 30;
        v *= 0.92 + 0.08 * dip;
        const i = (y * S + x) * 4;
        img.data[i] = v * 0.97; img.data[i + 1] = v; img.data[i + 2] = v * 1.06; img.data[i + 3] = 255;
        const r = 120 + (1 - bulge) * 60 + fib * 40;
        rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = r; rimg.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    rctx.putImageData(rimg, 0, 0);
    return {
      map: finish(new THREE.CanvasTexture(c), { srgb: true }),
      normalMap: heightToNormal(height, S, S, 1.6),
      roughnessMap: finish(new THREE.CanvasTexture(rough)),
    };
  });
}

// ---------------------------------------------------------------- teak decking
export function teakTextures() {
  return cached('teak', () => {
    const W = 1024, H = 512, planks = 6;
    const ph = H / planks;
    const c = canvas(W, H), ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    const height = new Float32Array(W * H);
    const n = new Simplex2(11);
    const rnd = mulberry32(3);
    const plankTone = [], joints = [];
    for (let p = 0; p < planks; p++) {
      plankTone.push(0.82 + rnd() * 0.3);
      joints.push(Math.floor(rnd() * W));
    }
    for (let y = 0; y < H; y++) {
      const p = Math.floor(y / ph);
      const ly = (y % ph) / ph;
      for (let x = 0; x < W; x++) {
        const caulk = ly < 0.045 || ly > 0.955;
        const jx = Math.abs(((x - joints[p] + W) % W) - W / 2) > W / 2 - 3; // butt joint
        let r, g, b, hgt;
        if (caulk || jx) {
          r = 20; g = 18; b = 16; hgt = 0;
        } else {
          const warp = n.fbm(x * 0.002 + p * 7.1, y * 0.03, 4) * 22;
          const grain = 0.5 + 0.5 * Math.sin((y + warp) * 1.3 + n.noise(x * 0.01, y * 0.2) * 3);
          const fine = n.noise(x * 0.05, y * 0.9) * 0.5 + 0.5;
          const tone = plankTone[p] * (0.86 + 0.14 * grain) * (0.94 + 0.06 * fine);
          r = 176 * tone; g = 122 * tone; b = 74 * tone;
          const silver = smoothstep(0.55, 0.9, n.fbm(x * 0.004, y * 0.01 + p, 3) * 0.5 + 0.5) * 0.18;
          r = r * (1 - silver) + 150 * silver; g = g * (1 - silver) + 130 * silver; b = b * (1 - silver) + 110 * silver;
          hgt = 1 - 0.08 * grain;
        }
        const i = (y * W + x) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
        height[y * W + x] = hgt;
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: finish(new THREE.CanvasTexture(c), { srgb: true }),
      normalMap: heightToNormal(height, W, H, 1.2),
    };
  });
}

// ---------------------------------------------------------------- leather
export function leatherTextures(quilt) {
  return cached('leather' + quilt, () => {
    const S = 512;
    const n = new Simplex2(5);
    const height = new Float32Array(S * S);
    const c = canvas(S, S), ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const cells = 4;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const grain = n.fbm(x * 0.09, y * 0.09, 3) * 0.06 + Math.abs(n.noise(x * 0.25, y * 0.25)) * 0.03;
        let h = grain, stitch = 0;
        if (quilt) {
          // diamond quilting: two diagonal families of seams
          const u = (x + y) / S * cells, v = (x - y + S) / S * cells;
          const du = Math.abs(u - Math.round(u)), dv = Math.abs(v - Math.round(v));
          const d = Math.min(du, dv);
          h += smoothstep(0.0, 0.22, d) * 0.9;
          const along = (du < dv ? v : u) * 40;
          stitch = d > 0.035 && d < 0.06 && Math.sin(along * Math.PI) > 0.2 ? 1 : 0;
        }
        height[y * S + x] = h;
        const i = (y * S + x) * 4;
        const base = 232 + n.noise(x * 0.02, y * 0.02) * 10 - (quilt ? (1 - smoothstep(0, 0.2, h)) * 50 : 0);
        const v = stitch ? 255 : base;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: finish(new THREE.CanvasTexture(c), { srgb: true }),
      normalMap: heightToNormal(height, S, S, quilt ? 6 : 10),
    };
  });
}

// ---------------------------------------------------------------- metallic flakes
export function flakeNormal() {
  return cached('flake', () => {
    const S = 256;
    const data = new Uint8Array(S * S * 4);
    const rnd = mulberry32(99);
    for (let i = 0; i < S * S; i++) {
      const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.7) * 0.55;
      const nx = Math.cos(a) * r, ny = Math.sin(a) * r, nz = Math.sqrt(1 - r * r);
      data[i * 4] = (nx * 0.5 + 0.5) * 255;
      data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
      data[i * 4 + 2] = (nz * 0.5 + 0.5) * 255;
      data[i * 4 + 3] = 255;
    }
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    return finish(t);
  });
}

// ---------------------------------------------------------------- brushed metal
export function brushedRoughness() {
  return cached('brushed', () => {
    const S = 256;
    const c = canvas(S, S), ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const rnd = mulberry32(21);
    const rows = new Float32Array(S);
    for (let y = 0; y < S; y++) rows[y] = rnd();
    const n = new Simplex2(4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = 140 + (rows[y] - 0.5) * 70 + n.noise(x * 0.01, y * 0.6) * 25;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return finish(new THREE.CanvasTexture(c));
  });
}

// ---------------------------------------------------------------- honeycomb grille
export function grilleTextures() {
  return cached('grille', () => {
    const S = 256;
    const height = new Float32Array(S * S);
    const c = canvas(S, S), ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const r = S / 8;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      // hex distance
      const qx = x / r, qy = y / r;
      const gx = qx, gy = qy * 1.1547;
      const cx = Math.round(gx), cy = Math.round(gy - (cx & 1) * 0.5) + (cx & 1) * 0.5;
      const dx = Math.abs(gx - cx), dy = Math.abs(gy - cy);
      const d = Math.max(dx * 0.866 + dy * 0.5, dy);
      const edge = smoothstep(0.36, 0.44, d);
      height[y * S + x] = edge;
      const v = 8 + edge * 40;
      const i = (y * S + x) * 4;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v * 1.05; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: finish(new THREE.CanvasTexture(c), { srgb: true }),
      normalMap: heightToNormal(height, S, S, 3),
    };
  });
}

// ---------------------------------------------------------------- tyre tread
export function tireTextures() {
  return cached('tire', () => {
    const W = 512, H = 128;
    const height = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = y / H; // across tread
      const u = x / W * 64; // around circumference
      let h = 1;
      // circumferential grooves
      for (const g of [0.22, 0.5, 0.78]) if (Math.abs(v - g) < 0.025) h = 0;
      // directional chevrons
      const chev = (u + Math.abs(v - 0.5) * 3.2) % 1;
      if (chev < 0.08 && Math.abs(v - 0.5) > 0.05 && v > 0.06 && v < 0.94) h = 0.2;
      // shoulder
      if (v < 0.04 || v > 0.96) h = 0.6;
      height[y * W + x] = h;
    }
    return { normalMap: heightToNormal(height, W, H, 1.5) };
  });
}

// ---------------------------------------------------------------- asphalt road
export function roadTextures() {
  return cached('road', () => {
    const W = 512, H = 1024; // u across road, v along (one tile = 16 m)
    const c = canvas(W, H), ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    const r = canvas(W, H), rctx = r.getContext('2d');
    const rimg = rctx.createImageData(W, H);
    const n = new Simplex2(8);
    const rnd = mulberry32(2);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const agg = rnd();
      let base = 58 + n.fbm(x * 0.02, y * 0.02, 3) * 10 + (agg > 0.93 ? 30 : agg < 0.05 ? -18 : 0);
      // wheel tracks: slightly polished and darker
      const track = Math.exp(-Math.pow((u - 0.3) / 0.05, 2)) + Math.exp(-Math.pow((u - 0.7) / 0.05, 2)) +
        Math.exp(-Math.pow((u - 0.18) / 0.05, 2)) + Math.exp(-Math.pow((u - 0.82) / 0.05, 2));
      base -= track * 6;
      let rough = 225 - track * 30 + (agg > 0.93 ? -40 : 0);
      // edge lines (solid) + centre dashes
      const edge = (u > 0.075 && u < 0.09) || (u > 0.91 && u < 0.925);
      const centre = u > 0.494 && u < 0.506 && (v % 0.5) < 0.22;
      // shoulders/gutters
      const shoulder = u < 0.05 || u > 0.95;
      if (edge || centre) {
        const wear = n.noise(x * 0.08, y * 0.03) * 0.5 + 0.5;
        const m = 0.55 + 0.45 * smoothstep(0.2, 0.6, wear);
        base = base * (1 - m) + 215 * m; rough = 170;
      }
      if (shoulder) { base = 92 + n.noise(x * 0.1, y * 0.1) * 12; rough = 240; }
      const i = (y * W + x) * 4;
      img.data[i] = base; img.data[i + 1] = base * 0.99; img.data[i + 2] = base * 0.96; img.data[i + 3] = 255;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rough; rimg.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    rctx.putImageData(rimg, 0, 0);
    return {
      map: finish(new THREE.CanvasTexture(c), { srgb: true, aniso: 16 }),
      roughnessMap: finish(new THREE.CanvasTexture(r), { aniso: 16 }),
    };
  });
}

// ---------------------------------------------------------------- tileable water normals
export function waterNormalTexture() {
  return cached('waternormal', () => {
    const S = 256;
    const rnd = mulberry32(1234);
    const waves = [];
    for (let i = 0; i < 90; i++) {
      // integer wave vectors keep the map perfectly tileable
      const ang = rnd() * Math.PI * 2;
      const mag = 2 + Math.floor(Math.pow(rnd(), 1.6) * 28);
      const kx = Math.round(Math.cos(ang) * mag), ky = Math.round(Math.sin(ang) * mag);
      if (kx === 0 && ky === 0) continue;
      const k = Math.hypot(kx, ky);
      waves.push({ kx, ky, a: 1 / Math.pow(k, 1.55), ph: rnd() * Math.PI * 2 });
    }
    const data = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let dx = 0, dy = 0;
      for (const w of waves) {
        const p = (w.kx * x + w.ky * y) / S * Math.PI * 2 + w.ph;
        const c = Math.cos(p) * w.a * Math.PI * 2;
        dx += c * w.kx; dy += c * w.ky;
      }
      let nx = -dx * 0.055, ny = -dy * 0.055, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * S + x) * 4;
      data[i] = (nx / l * 0.5 + 0.5) * 255;
      data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
    return finish(new THREE.DataTexture(data, S, S, THREE.RGBAFormat));
  });
}

// ---------------------------------------------------------------- foam pattern
export function foamTexture() {
  return cached('foam', () => {
    const S = 256, G = 10;
    const rnd = mulberry32(77);
    const pts = [];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) pts.push([(i + rnd()) / G, (j + rnd()) / G]);
    const n = new Simplex2(9);
    const data = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      let f1 = 9, f2 = 9;
      const ci = Math.floor(u * G), cj = Math.floor(v * G);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = (ci + di + G) % G, jj = (cj + dj + G) % G;
        const p = pts[jj * G + ii];
        let px = p[0] + Math.floor((ci + di) / G) * 1 + 0, py = p[1] + Math.floor((cj + dj) / G);
        // wrap-aware position of the feature point
        px = (ci + di) / G + (p[0] - ii / G);
        py = (cj + dj) / G + (p[1] - jj / G);
        const d = Math.hypot(u - px, v - py);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      const cell = (f2 - f1) * G;
      const web = 1 - smoothstep(0.0, 0.28, cell);
      const bubbles = smoothstep(0.35, 0.75, n.noise(x * 0.15, y * 0.15) * 0.5 + 0.5);
      const v2 = clamp(web * 0.85 + bubbles * 0.35 + n.noise(x * 0.04, y * 0.04) * 0.15, 0, 1);
      const i = (y * S + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v2 * 255; data[i + 3] = 255;
    }
    return finish(new THREE.DataTexture(data, S, S, THREE.RGBAFormat));
  });
}

// ---------------------------------------------------------------- Mediterranean facades
export function facadeTexture() {
  return cached('facade', () => {
    const W = 256, H = 256;
    const c = canvas(W, H), ctx = c.getContext('2d');
    const n = new Simplex2(31);
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = 238 + n.fbm(x * 0.03, y * 0.03, 3) * 14;
      const i = (y * W + x) * 4;
      img.data[i] = v; img.data[i + 1] = v * 0.985; img.data[i + 2] = v * 0.955; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // two floors of shuttered windows
    const shutter = ['#3f6f5a', '#2f5d7a', '#5d7f4a', '#6b8fa3'];
    for (let fl = 0; fl < 2; fl++) {
      for (let k = 0; k < 2; k++) {
        const x = 40 + k * 120, y = 40 + fl * 120;
        ctx.fillStyle = '#2a2622'; ctx.fillRect(x, y, 56, 70);
        ctx.fillStyle = shutter[(fl + k) % shutter.length];
        ctx.fillRect(x - 14, y, 14, 70); ctx.fillRect(x + 56, y, 14, 70);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        for (let s = 0; s < 70; s += 6) {
          ctx.beginPath(); ctx.moveTo(x - 14, y + s); ctx.lineTo(x, y + s); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + 56, y + s); ctx.lineTo(x + 70, y + s); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 4, y + 4, 22, 30);
      }
    }
    return finish(new THREE.CanvasTexture(c), { srgb: true });
  });
}

export function stoneTexture() {
  return cached('stone', () => {
    const W = 512, H = 256;
    const c = canvas(W, H), ctx = c.getContext('2d');
    const n = new Simplex2(17);
    const rnd = mulberry32(17);
    const img = ctx.createImageData(W, H);
    const rows = 4, rh = H / rows;
    const offs = [0, 0.5, 0.2, 0.7];
    for (let y = 0; y < H; y++) {
      const r = Math.floor(y / rh);
      for (let x = 0; x < W; x++) {
        const bw = W / 4;
        const bx = (x / bw + offs[r]) % 1;
        const mortar = (y % rh) < 3 || bx < 0.012;
        const tone = 0.85 + 0.15 * Math.sin(Math.floor(x / bw + offs[r]) * 12.9 + r * 4.1);
        let v = (196 + n.fbm(x * 0.05, y * 0.05, 4) * 30) * tone;
        if (mortar) v = 150;
        const i = (y * W + x) * 4;
        img.data[i] = v; img.data[i + 1] = v * 0.95; img.data[i + 2] = v * 0.86; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    void rnd;
    return finish(new THREE.CanvasTexture(c), { srgb: true });
  });
}

// Radial soft sprite used by spray/mist particles.
export function softSprite() {
  return cached('sprite', () => {
    const S = 64;
    const c = canvas(S, S), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    return finish(new THREE.CanvasTexture(c), { repeat: false });
  });
}
