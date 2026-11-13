// Shot 4 — summer field: wooden farmhouse, white kei truck driving off left, utility poles, big trees, foreground leaves.
export default {
  duration: 3.125,
  credit: null,
  post: { bloom: 0.25, bloomThreshold: 0.9, saturation: 1.05, contrast: 1.04, vignette: 0.18, soft: 0.2 },
  build(core) {
    const { THREE, makeSky, makeCloud, makeFoliage, makeGrass, lightRig, toon, box, cyl, makeWire, makeButterflies, shared } = core;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 2000);
    camera.position.set(0, 1.2, 12);
    camera.lookAt(0, 3.2, 0);
    scene.add(makeSky({ zenith: '#1a86c8', mid: '#2f9ad4', horizon: '#7fc0e6' }));
    lightRig(scene, { sunDir: [-0.4, 0.8, 0.5], sunIntensity: 2.4, hemiIntensity: 0.8 });
    shared.uDapple.value = 0;
    // clouds
    const c1 = makeCloud({ w: 60, h: 40, seed: 3 }); c1.position.set(-22, 18, -80); scene.add(c1);
    const c2 = makeCloud({ w: 50, h: 34, seed: 8 }); c2.position.set(8, 14, -90); scene.add(c2);
    // trees backdrop
    scene.add(makeFoliage({ clumps: [[-6, 6, -20, 4], [-2, 7, -22, 4.5], [2, 5, -18, 3.5], [-9, 4, -18, 3]], density: 10, cardSize: 1.0, seed: 2,
      dark: '#123a33', mid: '#1f5c4a', light: '#3f8a5e', highlight: '#7fbf6a' }));
    scene.add(makeFoliage({ clumps: [[0, 2.2, -12, 2.2], [2.5, 2.6, -13, 2]], density: 12, cardSize: 0.6, seed: 5,
      dark: '#2b6b3a', mid: '#4f9a45', light: '#9acb5a', highlight: '#d6ec86' }));
    // house
    const wood = toon({ color: '#6b5440' });
    scene.add(box(6, 3.4, 4, wood, 6, 1.7, -8));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 1.8, 4), toon({ color: '#8d8270' }));
    roof.position.set(6, 4.3, -8); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.75); scene.add(roof);
    // truck
    const truck = new THREE.Group();
    truck.add(box(1.4, 1.2, 1.3, toon({ color: '#e9e9ee' }), 0, 0.9, 0));
    truck.add(box(2.4, 0.5, 1.3, toon({ color: '#d8d8de' }), 1.9, 0.6, 0));
    truck.position.set(2.2, 0, -6); scene.add(truck);
    // poles + wires
    const pole = toon({ color: '#cbbfa8' });
    scene.add(cyl(0.12, 0.15, 9, pole, -1.4, 4.5, -10), cyl(0.12, 0.15, 9, pole, 3, 4.5, -11));
    scene.add(makeWire([-1.4, 8.5, -10], [3, 8.6, -11], { sag: 0.3 }), makeWire([-12, 8.2, -9], [-1.4, 8.5, -10], { sag: 0.4 }));
    // grass
    scene.add(makeGrass({ x0: -12, x1: 12, z0: -9, z1: 9, count: 30000, h: [0.6, 1.3], w: 0.09, base: '#4f8f2f', tip: '#a8d860', dark: '#3c7a2a', light: '#d4ef8a' }));
    // foreground leaves
    scene.add(makeFoliage({ clumps: [[-4.2, 2.2, 7, 1.6], [-3.8, 0.8, 7.5, 1.4]], density: 3, cardSize: 0.9, kind: 'broad', seed: 9,
      dark: '#0f2f22', mid: '#24563a', light: '#4f8d4c', highlight: '#9fcf6a' }));
    scene.add(makeButterflies({ count: 14, box: [[-4, 0.5, 4], [-1, 2.5, 7]], size: 0.08 }));
    return {
      scene, camera,
      update(t) { truck.position.x = 2.2 - t * 1.6; },
    };
  },
};
