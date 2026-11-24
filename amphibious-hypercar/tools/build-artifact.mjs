// Produces dist/artifact.html: the page body for publishing as a hosted
// artifact (no <html>/<head>/<body> wrapper, stylesheet inlined). The JS
// modules are published alongside it unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
html = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '')
  .replace(/<\/html>\s*/i, '')
  .replace(/<head>\s*/i, '')
  .replace(/<\/head>\s*/i, '')
  .replace(/<body>\s*/i, '')
  .replace(/<\/body>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace('<link rel="stylesheet" href="css/style.css">', `<style>\n${css}\n</style>`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/artifact.html'), html);
const files = [];
const walk = (d) => {
  for (const f of fs.readdirSync(path.join(root, d))) {
    const rel = path.join(d, f);
    if (fs.statSync(path.join(root, rel)).isDirectory()) walk(rel);
    else if (f.endsWith('.js')) files.push(rel);
  }
};
walk('js');
fs.writeFileSync(path.join(root, 'dist/files.json'), JSON.stringify(Object.fromEntries(files.map((f) => [f, f])), null, 2));
console.log('dist/artifact.html written,', files.length, 'module files');
