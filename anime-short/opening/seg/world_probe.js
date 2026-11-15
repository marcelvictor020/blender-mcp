// Debug probe (review only): view.html?seg=world_probe&shot=1&cam=x,y,z&look=x,y,z&fov=40
export default {
  dur: 3, post: {},
  async build(core, ctx) {
    const q = new URLSearchParams(location.search);
    const m = (await import('../../shots/shot' + (q.get('shot') || '1') + '.js')).default;
    const inst = m.build(core, ctx);
    const P = (k, d) => (q.get(k) || d).split(',').map(Number);
    const cam = new core.THREE.PerspectiveCamera(+(q.get('fov') || 50), 16 / 9, 0.1, 5000);
    cam.position.set(...P('cam', '0,50,80')); cam.lookAt(...P('look', '0,0,0'));
    if (q.has('dump')) { const B = new core.THREE.Box3(); inst.scene.updateMatrixWorld(true);
      inst.scene.traverse(o => { if (o.parent && (o.parent === inst.scene || o.parent.parent === inst.scene)) { B.setFromObject(o); const f = v => v.toArray().map(x => x.toFixed(0)).join(',');
        console.warn((o.parent === inst.scene ? '' : '  ') + o.type + ' ' + (o.name || '') + ' n=' + (o.children.length) + ' ' + f(B.min) + ' / ' + f(B.max) + (o.material ? ' mat=' + o.material.type : '')); } }); }
    if (q.has('orig')) return inst;
    return { scene: inst.scene, camera: cam, update(t) { inst.update(t, core); } };
  },
};
