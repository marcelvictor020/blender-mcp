// Mareva Amphibia — interactive amphibious hypercar exhibition.
import { App } from './app/app.js';

const params = new URLSearchParams(location.search);
const app = new App(document.getElementById('app'), { test: params.has('test') });
window.__app = app;
app.init().catch((err) => {
  console.error(err);
  const t = document.getElementById('loading-text');
  if (t) t.textContent = 'This experience needs WebGL 2. ' + (err && err.message ? err.message : '');
});
