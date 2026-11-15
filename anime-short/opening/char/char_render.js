#!/usr/bin/env node
// Headless review renderer for the character system (copy of ../render.js pointed at char/char_view.html).
//   node opening/char/char_render.js --out out/char/iter1 [--chars ren,aoi,collector] [--only turn,face,pose,cmp]
// Produces per character: <char>_turn.jpg (front, 3/4, side, back), <char>_face_*.jpg + <char>_faces.jpg (2x2 sheet),
// <char>_cmp.jpg (reference crop | our close-up), plus poses.jpg.
const http = require('http'), fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const PAGE = '/opening/char/char_view.html';
const THREE_DIR = path.join(ROOT, 'tools', 'node_modules', 'three');
const REF = process.env.CHAR_REF || '/tmp/claude-0/-home-user-blender-mcp/8229d8c8-aef9-5285-8382-a60e1e4a76e6/scratchpad/refs3/c1.jpg';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const W = +(args.w || 1280), H = +(args.h || 720);
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
(async () => {
  const srv = await new Promise(res => { const s = http.createServer((req, resp) => {
    const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(ROOT, u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { resp.writeHead(404); return resp.end(); }
    resp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(resp);
  }).listen(0, () => res(s)); });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', route => {
    route.fulfill({ path: path.join(THREE_DIR, route.request().url().split('three@0.170.0/')[1]), contentType: 'text/javascript' }); });
  await page.goto(`http://localhost:${srv.address().port}${PAGE}?render=1&w=${W}&h=${H}`);
  try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 }); }
  catch (e) { console.error('Page never became ready.\n' + errors.join('\n')); process.exit(1); }
  const out = path.resolve(args.out || path.join(ROOT, 'out', 'char')); fs.mkdirSync(out, { recursive: true });
  const shot = async (cfg, name) => {
    const t0 = Date.now(); await page.evaluate(c => window.__shot(c), cfg);
    const f = path.join(out, name + '.jpg');
    await page.screenshot({ path: f, type: 'jpeg', quality: 92, timeout: 0, clip: { x: 0, y: 0, width: W, height: H } });
    console.log(`${name} ${Date.now() - t0}ms`); return f;
  };
  const only = new Set(String(args.only || 'turn,face,cmp,pose').split(','));
  const chars = String(args.chars || 'ren,aoi,collector').split(',');
  for (const ch of chars) {
    if (only.has('turn')) await shot({ mode: 'turn', char: ch, pose: 'stand' }, `${ch}_turn`);
    if (only.has('face') || only.has('cmp')) {
      const ex = [['neutral', {}], ['blink', { blink: 1 }], ['smile', { mouth: 'smile', eyeSmile: 1 }],
        ch === 'ren' ? ['crimson', { eyeColorL: '#d0182a', pupilSlitL: 1, glowL: 1, brow: -0.6, mouth: 'a' }] : ch === 'aoi' ? ['talk', { mouth: 'a', lookX: 0.6, brow: 0.4 }] : ['open', { eyeOpen: 0.5, mouth: 'grin' }]];
      const files = [];
      for (const [n, e] of ex) files.push(await shot({ mode: 'face', char: ch, expr: e, yaw: n === 'neutral' ? 0.0 : 0.35, pose: 'stand' }, `${ch}_face_${n}`));
      const f34 = await shot({ mode: 'face', char: ch, expr: { lookX: -0.4 }, yaw: 0.75, pose: 'stand', dist: 0.95 }, `${ch}_face_34`);
      await shot({ mode: 'face', char: ch, expr: {}, yaw: 1.5708, pose: 'stand', dist: 0.95 }, `${ch}_face_side`);
      ff(...files.flatMap(f => ['-i', f]), '-filter_complex', '[0]scale=640:360[a];[1]scale=640:360[b];[2]scale=640:360[c];[3]scale=640:360[d];[a][b][c][d]xstack=inputs=4:layout=0_0|640_0|0_360|640_360[v]', '-map', '[v]', '-q:v', '3', path.join(out, `${ch}_faces.jpg`));
      if (only.has('cmp')) ff('-i', REF, '-i', files[0], '-filter_complex', '[0]scale=-2:720[a];[a][1]hstack[v]', '-map', '[v]', '-q:v', '3', path.join(out, `${ch}_cmp.jpg`));
    }
  }
  if (only.has('pose')) {
    await shot({ mode: 'pose', poses: [{ char: 'ren', pose: 'lookBack', yaw: -2.0 }, { char: 'ren', pose: 'armsOutLeap', yaw: 0.4 }, { char: 'ren', pose: 'sitRailing', yaw: 0.5, y: 0.0 },
      { char: 'aoi', pose: 'bike', yaw: 1.2 }, { char: 'collector', pose: 'holdJar', yaw: -0.3 }], spacing: 1.25, cam: [0, 1.15, 9.5], target: [0, 0.95, 0], fov: 22 }, 'poses');
  }
  if (errors.length) console.log('Console errors/warnings:\n' + [...new Set(errors)].slice(0, 30).join('\n'));
  await browser.close(); srv.close();
})();
