#!/usr/bin/env node
// Headless renderer for the KAGERŌ opening (copy of ../tools/render.js adapted to opening/index.html + timeline).
// Stills:    node opening/render.js --times 12.5,14 --out out/op_stills [--w 1280 --h 720] [--sheet]
// Segment:   node opening/render.js --seg g_title --times 0,0.4,0.8 --out out/op_title --sheet   (local times)
// Sequence:  node opening/render.js --fps 24 --out out/op_frames [--from 0 --to 48] [--seg id] [--resume]
// --name "JANE DOE" replaces the YOUR NAME credits. --sheet tiles the stills into <out>/sheet.jpg.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');            // serve anime-short/ so ../core.js, ../fonts, ../shots resolve
const PAGE = '/opening/index.html';
const THREE_DIR = path.join(ROOT, 'tools', 'node_modules', 'three');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a;
}, []));
const W = +(args.w || 1280), H = +(args.h || 720);

const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, resp) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(ROOT, u === '/' ? PAGE : u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { resp.writeHead(404); return resp.end(); }
      resp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(resp);
    }).listen(0, () => res(srv));
  });
}

(async () => {
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', route => {
    const rel = route.request().url().split('three@0.170.0/')[1];
    route.fulfill({ path: path.join(THREE_DIR, rel), contentType: 'text/javascript' });
  });
  const extra = (args.name ? '&name=' + encodeURIComponent(args.name) : '') + (args.seg ? '&seg=' + encodeURIComponent(args.seg) : '') + (args.nofx ? '&nofx=1' : '');
  await page.goto(`http://localhost:${port}${PAGE}?render=1&w=${W}&h=${H}${extra}`);
  try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 }); }
  catch (e) { console.error('Page never became ready.\n' + errors.join('\n')); process.exit(1); }
  const TL = await page.evaluate(() => window.__timeline);

  const out = path.resolve(args.out || path.join(ROOT, 'out', 'opening' + (args.seg ? '_' + args.seg : '')));
  fs.mkdirSync(out, { recursive: true });
  const shoot = async (t, file) => {
    const t0 = Date.now();
    await page.evaluate(t => window.__render(t), t);
    await page.screenshot({ path: file, type: file.endsWith('.png') ? 'png' : 'jpeg', quality: 92, timeout: 0 });
    return Date.now() - t0;
  };

  if (args.times) {
    const files = [];
    for (const t of String(args.times).split(',').map(Number)) {
      const f = path.join(out, `t${t.toFixed(3)}.jpg`);
      const ms = await shoot(t, f); files.push(f);
      console.log(`t=${t} ${ms}ms -> ${f}`);
    }
    if (args.sheet && files.length > 1) {
      const cols = Math.min(files.length, +(args.cols || 3)), rows = Math.ceil(files.length / cols);
      const ins = []; files.forEach(f => ins.push('-i', f));
      const tw = 640, th = Math.round(640 * H / W);
      let fc = files.map((_, i) => `[${i}:v]scale=${tw}:${th}[s${i}];`).join('');
      fc += files.map((_, i) => `[s${i}]`).join('') + `xstack=inputs=${files.length}:layout=` +
        files.map((_, i) => `${(i % cols) * tw}_${Math.floor(i / cols) * th}`).join('|') + `:fill=black[v]`;
      const sheet = path.join(out, 'sheet.jpg');
      if (files.length === 1) fs.copyFileSync(files[0], sheet);
      else execFileSync('ffmpeg', ['-v', 'error', '-y', ...ins, '-filter_complex', fc, '-map', '[v]', '-q:v', '3', sheet]);
      console.log(`sheet (${cols}x${rows}) -> ${sheet}`);
    }
  } else {
    const fps = +(args.fps || 24);
    const total = TL.only >= 0 ? TL.segs[TL.only].dur : TL.total;
    const from = +(args.from || 0), to = Math.min(+(args.to || total), total);
    const n0 = Math.round(from * fps), n1 = Math.round(to * fps);
    const tStart = Date.now();
    for (let n = n0; n < n1; n++) {
      const f = path.join(out, `f${String(n).padStart(5, '0')}.jpg`);
      if (args.resume && fs.existsSync(f)) continue;
      await shoot((n + 0.5) / fps, f);
      if (n % 24 === 0) console.log(`frame ${n}/${n1} (${((Date.now() - tStart) / 1000).toFixed(0)}s)`);
    }
  }
  if (errors.length) console.log('Console errors/warnings:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
  await browser.close(); srv.close();
})();
