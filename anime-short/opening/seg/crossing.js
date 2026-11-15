// Railway crossing signal: post, crossbuck, twin red lamps (alternate flashing), and a striped gate arm that lowers.
// makeCrossing(core) -> { group, update(t, lowerAmount 0..1, flashOn bool) }   local: post at origin, arm swings in +x.
export function makeCrossing(core, { armLen = 6 } = {}) {
  const { THREE, col, canvasTexture } = core;
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: col('#e8e4dc'), roughness: 0.5 });
  const black = new THREE.MeshStandardMaterial({ color: col('#121214'), roughness: 0.5 });
  const stripe = canvasTexture('xing_stripe', 256, 32, (c, w, h) => { c.fillStyle = '#f2c81a'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; for (let x = -h; x < w; x += 32) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 16, h); c.lineTo(x + 16 + h, 0); c.lineTo(x + h, 0); c.fill(); } });
  stripe.wrapS = THREE.RepeatWrapping;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.6, 12), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.5 })); post.position.y = 1.8; g.add(post);
  stripe.repeat.set(1, 1);
  // crossbuck (X) with stripes
  const xbM = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.4, side: THREE.DoubleSide });
  for (const a of [0.6, -0.6]) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.2, 0.03), xbM); b.position.set(0, 3.3, 0.06); b.rotation.z = a; g.add(b); }
  // lamp bar + two lamps with hoods
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.06), black); bar.position.set(0, 2.55, 0.05); g.add(bar);
  const lamps = [];
  for (const sx of [-0.42, 0.42]) {
    const back = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), black); back.position.set(sx, 2.55, 0.09); g.add(back);
    const lensM = new THREE.MeshBasicMaterial({ color: col('#3a0604') });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), lensM); lens.position.set(sx, 2.55, 0.1); g.add(lens);
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.18, 20, 1, true, -Math.PI / 2, Math.PI), black); hood.rotation.x = Math.PI / 2; hood.position.set(sx, 2.58, 0.18); g.add(hood);
    // glow sprite
    const glowTex = canvasTexture('xing_glow', 128, 128, (c, w, h) => { const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,80,40,0.7)'); gr.addColorStop(1, 'rgba(255,0,0,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col('#ff3010'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.position.set(sx, 2.55, 0.25); sp.scale.set(0.9, 0.9, 1); g.add(sp);
    lamps.push({ lensM, sp });
  }
  // gate arm on a counterweighted pivot (at the post, 1.0 m up), swings from vertical to horizontal
  const pivot = new THREE.Group(); pivot.position.set(0.18, 1.0, 0.0); g.add(pivot);
  const armTex = stripe.clone(); armTex.needsUpdate = true; armTex.wrapS = THREE.RepeatWrapping; armTex.repeat.set(armLen / 1.2, 1);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.09, 0.06), new THREE.MeshStandardMaterial({ map: armTex, roughness: 0.45 })); arm.position.x = armLen / 2; pivot.add(arm);
  const cw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.14), black); cw.position.x = -0.35; pivot.add(cw);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), white); box.position.set(0.0, 0.7, -0.05); g.add(box);
  return {
    group: g, lamps,
    update(t, lower, flash = true) {
      pivot.rotation.z = (1 - lower) * Math.PI / 2 * 0.98;
      const ph = Math.floor(t * 2.6) % 2;     // ~80 flashes / min, alternating
      lamps.forEach((L, i) => {
        const on = flash && ((i === ph) ? 1 : 0);
        L.lensM.color.set(on ? '#ff3a1a' : '#3a0604'); if (on) L.lensM.color.multiplyScalar(3.0);
        L.sp.material.opacity = on ? 1 : 0; L.sp.visible = !!on;
      });
    },
  };
}
