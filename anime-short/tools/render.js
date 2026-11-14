#!/usr/bin/env node
// Headless renderer for the anime short.
// Stills:   node tools/render.js --shot 3 --times 0,1.5,3 --out out/s3 [--w 1280 --h 720]
// Sequence: node tools/render.js [--shot 3] --fps 24 --out out/frames [--from 0 --to 28.375]
// Compare:  node tools/render.js --shot 3 --compare     -> out/cmp_s3.jpg (reference row on top, ours below)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a;
}, []));
const W = +(args.w || 1280), H = +(args.h || 720);
const shot = args.shot ? +args.shot : 0;
const timeline = JSON.parse(fs.readFileSync(path.join(ROOT, 'shots.json'), 'utf8')).shots;

const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, resp) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { resp.writeHead(404); return resp.end(); }
      resp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(resp);
    }).listen(0, () => res(srv));
  });
}

(async () => {
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', route => {
    const rel = route.request().url().split('three@0.170.0/')[1];
    route.fulfill({ path: path.join(THREE_DIR, rel), contentType: 'text/javascript' });
  });
  const name = args.name ? '&name=' + encodeURIComponent(args.name) : '';
  const stat = (args.compare || args.times) && !args.moves ? '&static=1' : '';
  const url = `http://localhost:${port}/index.html?render=1&w=${W}&h=${H}${shot ? '&shot=' + shot : ''}${name}${stat}`;
  await page.goto(url);
  try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }); }
  catch (e) { console.error('Page never became ready.\n' + errors.join('\n')); process.exit(1); }

  const out = path.resolve(args.out || path.join(ROOT, 'out', shot ? 's' + shot : 'all'));
  fs.mkdirSync(out, { recursive: true });
  const shoot = async (t, file) => {
    const t0 = Date.now();
    await page.evaluate(t => window.__render(t), t);
    await page.screenshot({ path: file, type: file.endsWith('.png') ? 'png' : 'jpeg', quality: 92, timeout: 0 });
    return Date.now() - t0;
  };

  if (args.compare) {
    const T = timeline[shot - 1];
    const files = [];
    for (let k = 0; k < T.refTimes.length; k++) {
      const lt = T.refTimes[k] - T.start;
      const f = path.join(out, `ours_${'abc'[k]}.jpg`);
      const ms = await shoot(lt, f);
      console.log(`t=${lt.toFixed(3)} rendered in ${ms}ms -> ${f}`);
      files.push([path.join(ROOT, 'ref', `s${shot}${'abc'[k]}.jpg`), f]);
    }
    const cmp = path.join(ROOT, 'out', `cmp_s${shot}.jpg`);
    const which = args.frame ? ['abc'.indexOf(args.frame)] : files.map((_, i) => i);
    const ins = []; which.forEach(i => ins.push('-i', files[i][0], '-i', files[i][1]));
    const n = which.length;
    // each pair: ref on top, ours below (640 wide each); pairs side by side
    let fc = '';
    for (let i = 0; i < n; i++) fc += `[${2 * i}:v]scale=640:360[r${i}];[${2 * i + 1}:v]scale=640:360[o${i}];[r${i}][o${i}]vstack[p${i}];`;
    fc += n > 1 ? which.map((_, i) => `[p${i}]`).join('') + `hstack=inputs=${n}[v]` : `[p0]copy[v]`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', ...ins, '-filter_complex', fc, '-map', '[v]', '-q:v', '3', cmp]);
    console.log('compare sheet -> ' + cmp + '  (top row = reference, bottom row = ours)');
  } else if (args.times) {
    for (const t of String(args.times).split(',').map(Number)) {
      const f = path.join(out, `t${t.toFixed(3)}.jpg`);
      const ms = await shoot(t, f);
      console.log(`t=${t} ${ms}ms -> ${f}`);
    }
  } else {
    const fps = +(args.fps || 24);
    const total = shot ? timeline[shot - 1].duration : timeline.reduce((a, s) => a + s.duration, 0);
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
