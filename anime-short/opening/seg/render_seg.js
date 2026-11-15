#!/usr/bin/env node
// Review renderer for world segments.
// node opening/seg/render_seg.js --seg world_town_high --times 0,3,5.9 [--out DIR --w 1280 --h 720]
// node opening/seg/render_seg.js --seg world_eye --fps 24 --out DIR   (full sequence)
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const THREE_DIR = path.join(ROOT, 'tools', 'node_modules', 'three');
const { chromium } = require('playwright');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const W = +(args.w || 1280), H = +(args.h || 720), SEG = args.seg || 'world_town_high';
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };
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
  await page.goto(`http://localhost:${srv.address().port}/opening/seg/view.html?render=1&seg=${SEG}${args.q ? "&" + args.q : ""}&w=${W}&h=${H}`);
  try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 }); }
  catch (e) { console.error('Page never became ready.\n' + errors.join('\n')); process.exit(1); }
  const out = path.resolve(args.out || path.join(ROOT, 'out', 'seg_' + SEG)); fs.mkdirSync(out, { recursive: true });
  const shoot = async (t, f) => { const t0 = Date.now(); await page.evaluate(t => window.__render(t), t);
    await page.screenshot({ path: f, type: 'jpeg', quality: 90, timeout: 0, clip: { x: 0, y: 0, width: W, height: H } }); return Date.now() - t0; };
  if (args.times) for (const t of String(args.times).split(',').map(Number)) { const f = path.join(out, `${SEG}_t${t.toFixed(2)}.jpg`); console.log(`t=${t} ${await shoot(t, f)}ms -> ${f}`); }
  else { const fps = +(args.fps || 24), dur = +(args.dur || 3); for (let n = 0; n < Math.round(dur * fps); n++) await shoot((n + 0.5) / fps, path.join(out, `f${String(n).padStart(4, '0')}.jpg`)); }
  if (errors.length) console.log('Console errors/warnings:\n' + [...new Set(errors)].slice(0, 200).join('\n'));
  await browser.close(); srv.close();
})();
