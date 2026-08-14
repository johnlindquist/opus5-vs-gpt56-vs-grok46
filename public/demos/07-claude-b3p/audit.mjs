/* Static audit: no remote runtime references, and the editor DOM is fully wired
 * and labelled. Run: node audit.mjs
 */
import { readFileSync } from 'node:fs';

let fails = 0, count = 0;
const ok = (name, cond, extra) => {
  count++;
  if (cond) console.log('  ok   ' + name + (extra ? '  (' + extra + ')' : ''));
  else { fails++; console.log('  FAIL ' + name + (extra ? '  (' + extra + ')' : '')); }
};

const files = ['index.html', 'app.js', 'engine.js', 'styles.css'];
const src = Object.fromEntries(files.map(f => [f, readFileSync(f, 'utf8')]));
const html = src['index.html'];

console.log('\n[A] no remote runtime references');
const remote = [];
for (const f of files) {
  src[f].split('\n').forEach((line, i) => {
    if (/https?:\/\/|\/\/cdn\.|\bfetch\s*\(|XMLHttpRequest|WebSocket|importScripts|@import|\bimport\s*\(/.test(line)) {
      remote.push(f + ':' + (i + 1) + ' ' + line.trim().slice(0, 60));
    }
  });
}
ok('no network APIs or absolute URLs in any source file', remote.length === 0, remote.join(' | '));

const subresources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
ok('every subresource is a local relative file',
  subresources.every(s => !/^([a-z]+:)?\/\//i.test(s)), subresources.join(', '));
for (const s of subresources) {
  ok('subresource exists on disk: ' + s, files.includes(s));
}
ok('no external font/image assets referenced',
  !/@font-face|\.woff|\.ttf|\.png"|\.jpg|\.svg"/.test(src['styles.css'] + html));

console.log('\n[B] editor DOM wiring');
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const used = new Set([...src['app.js'].matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
const missing = [...used].filter(u => !ids.has(u));
ok('every element app.js looks up exists in index.html', missing.length === 0, missing.join(', '));

const labelFor = [...html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map(m => m[1]);
ok('every label[for] points at a real control',
  labelFor.every(l => ids.has(l)), labelFor.filter(l => !ids.has(l)).join(', '));

const controls = [...html.matchAll(/<(?:input|select)\b[^>]*>/g)].map(m => m[0]);
const unlabelled = controls.filter(tag => {
  const id = (/id="([^"]+)"/.exec(tag) || [])[1];
  if (!id) return true;
  if (labelFor.includes(id)) return false;
  if (/aria-label/.test(tag)) return false;
  // controls nested inside a <label> element are labelled by their wrapper
  return !new RegExp('<label[^>]*>[^<]*<input id="' + id + '"').test(html);
});
ok('every form control has an accessible label', unlabelled.length === 0,
  unlabelled.map(t => (/id="([^"]+)"/.exec(t) || [])[1]).join(', '));
ok('all controls present', controls.length >= 12, controls.length + ' controls');

console.log('\n[C] required affordances');
ok('four preset buttons', (html.match(/class="preset"/g) || []).length === 4);
ok('export control present', /id="export"/.test(html));
ok('live status region for screen readers', /aria-live="polite"/.test(html));
ok('canvas exposes a described role', /role="img"/.test(html) && /aria-label=/.test(html));
ok('canvas is keyboard focusable', /id="view"[\s\S]{0,200}tabindex="0"/.test(html));
ok('reduced motion honoured in code',
  /prefers-reduced-motion/.test(src['app.js']) && /reducedMotion/.test(src['engine.js']));
ok('no blocking tutorial/modal markup', !/<dialog|class="modal|overlay-tutorial/.test(html));
ok('crop marks toggle present', /id="marks"/.test(html));

console.log('\n' + (fails ? 'FAILED' : 'PASSED') + ': ' + (count - fails) + '/' + count + ' checks\n');
process.exit(fails ? 1 : 0);
