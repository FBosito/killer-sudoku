// End-to-End-Test über das Chrome DevTools Protocol (ohne Abhängigkeiten, Node >= 22).
// Aufruf: node test/e2e.mjs [ausgabeordner]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = resolve(process.argv[2] || 'test/out');
mkdirSync(OUT, { recursive: true });
const url = pathToFileURL(resolve('index.html')).href;
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'ks-e2e-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu', '--window-size=820,1180', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, seq = 0;
const pending = new Map();
const consoleMsgs = [];

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
        ws.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
          if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
          if (m.method === 'Runtime.exceptionThrown') consoleMsgs.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
        };
        return;
      }
    } catch (e) { /* noch nicht bereit */ }
    await sleep(200);
  }
  throw new Error('Chrome nicht erreichbar');
}

function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((r) => pending.set(id, r));
}

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result.result.value;
}

async function screenshot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(r.result.data, 'base64'));
}

async function pen(points, buttons = 1, button = 'left') {
  const base = { pointerType: 'pen', button, force: 0.5 };
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: points[0][0], y: points[0][1], buttons, clickCount: 1, ...base });
  for (const [x, y] of points.slice(1)) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons, ...base });
  const [x, y] = points[points.length - 1];
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, buttons: 0, clickCount: 1, ...base });
}

const interp = (pts, n = 12) => {
  const out = [];
  for (let k = 1; k < pts.length; k++) for (let t = 0; t < n; t++) {
    const a = pts[k - 1], b = pts[k];
    out.push([a[0] + ((b[0] - a[0]) * t) / n, a[1] + ((b[1] - a[1]) * t) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
};

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${info}`); };
const strokeCount = () => evaluate('KS.App.strokes.length');
const waitForPuzzle = async () => { for (let i = 0; i < 60; i++) { await sleep(200); if (await evaluate("!!(window.KS && KS.App && KS.App.game)")) return; } };

try {
  await connect();
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await waitForPuzzle();
  check('Rätsel wird erzeugt', await evaluate("KS.App.game.cages.length > 15"));
  check('Start aktiv, Stop inaktiv', await evaluate("!document.getElementById('btn-start').disabled && document.getElementById('btn-stop').disabled"));
  await screenshot('1-neu.png');

  const rect = await evaluate("(() => { const r = document.getElementById('board').getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width}; })()");
  const cs = rect.w / 9;
  const inCell = (cell, pts) => interp(pts).map(([u, v]) => [rect.x + ((cell % 9) + u) * cs, rect.y + (Math.floor(cell / 9) + v) * cs]);

  await pen(inCell(10, [[0.5, 0.2], [0.5, 0.8]]));
  check('Vor Start wird nicht geschrieben', (await strokeCount()) === 0);

  await evaluate("document.getElementById('btn-start').click()");
  await sleep(1300);
  check('Kein Mauszeiger über dem Blatt beim Schreiben', (await evaluate("getComputedStyle(document.getElementById('ink')).cursor + '/' + getComputedStyle(document.getElementById('sheet')).cursor")) === 'none/none');
  check('Uhr läuft nach Start', (await evaluate("document.getElementById('timer').textContent")) === '00:01');

  // Ziffern schreiben: 1, 7, 4 (zweistrichig) und eine kleine Notiz
  await pen(inCell(10, [[0.45, 0.25], [0.55, 0.15], [0.55, 0.85]]));
  await pen(inCell(11, [[0.25, 0.2], [0.75, 0.2], [0.4, 0.85]]));
  await pen(inCell(12, [[0.55, 0.15], [0.25, 0.6], [0.75, 0.6]]));
  await pen(inCell(12, [[0.6, 0.35], [0.6, 0.85]]));
  await pen(inCell(13, [[0.15, 0.15], [0.3, 0.1], [0.25, 0.32]]));
  check('Striche bleiben als Tinte stehen', (await strokeCount()) === 5);
  // Druck: leicht vs. fest ergibt unterschiedliche gespeicherte Druckwerte und Breiten
  {
    const strokeWith = async (force, cell) => {
      const pts = inCell(cell, [[0.2, 0.5], [0.8, 0.5]]);
      const base = { pointerType: 'pen', button: 'left', force };
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0][0], y: pts[0][1], buttons: 1, clickCount: 1, ...base });
      for (const [x, y] of pts.slice(1)) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 1, ...base });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pts.at(-1)[0], y: pts.at(-1)[1], buttons: 0, clickCount: 1, ...base });
    };
    await strokeWith(0.1, 60);
    await strokeWith(1.0, 61);
    const pr = await evaluate('KS.App.strokes.slice(-2).map((s) => s[s.length - 1][2])');
    const w = await evaluate(`KS.App.strokes.slice(-2).map((s) => KS.Ink.widthAt(s[s.length - 1][2]))`);
    check('Druck steuert Strichbreite', pr[0] < 0.3 && pr[1] > 0.8 && w[1] > w[0] * 2, `druck=${pr} breite=${w.map((x) => x.toFixed(4))}`);
    await screenshot('2b-druck.png');
    await evaluate('KS.App.strokes.splice(-2, 2); 1');
  }
  // Notizen ober- und unterhalb des Bretts
  await pen(interp([[rect.x + 100, rect.y - 40], [rect.x + 160, rect.y - 50]]));
  await pen(interp([[rect.x + 100, rect.y + rect.w + 40], [rect.x + 160, rect.y + rect.w + 30]]));
  check('Notizbereich oben/unten beschreibbar', (await strokeCount()) === 7
    && (await evaluate('KS.App.strokes[5][0][1] < 0 && KS.App.strokes[6][0][1] > 1')));
  await evaluate('KS.App.strokes.splice(5, 2); 1');

  // Finger zeichnet nicht
  {
    const [x, y] = [rect.x + 4.5 * cs, rect.y + 4.5 * cs];
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let k = 1; k <= 8; k++) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + k * 5, y: y + k * 5 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check('Finger/Handballen zeichnet nicht', (await strokeCount()) === 5);
  }
  await screenshot('2-tinte.png');

  // Radiergummi-Ende (buttons=32) und Seitentaste (buttons=1|2) als echte PointerEvents
  const synthPen = (cell, pts, buttons) => evaluate(`(() => {
    const el = document.getElementById('ink');
    const pts = ${JSON.stringify(inCell(cell, pts))};
    const ev = (type, [x, y], b) => el.dispatchEvent(new PointerEvent(type, { pointerId: 77, pointerType: 'pen', clientX: x, clientY: y, buttons: b, button: ${buttons === 32 ? 5 : 2}, bubbles: true, cancelable: true }));
    ev('pointerdown', pts[0], ${buttons});
    for (const p of pts.slice(1)) ev('pointermove', p, ${buttons});
    ev('pointerup', pts[pts.length - 1], 0);
    return 1; })()`);
  await synthPen(11, [[0.1, 0.5], [0.9, 0.5]], 32);
  check('Radiergummi-Ende löscht Strich', (await strokeCount()) === 4);
  await synthPen(10, [[0.2, 0.5], [0.8, 0.5]], 3);
  check('Seitentaste löscht Strich', (await strokeCount()) === 3);

  // Pause / Weiter
  await evaluate("document.getElementById('btn-pause').click()");
  const tP = await evaluate("document.getElementById('timer').textContent");
  await pen(inCell(40, [[0.5, 0.2], [0.5, 0.8]]));
  await sleep(1200);
  check('Pause: Uhr steht, Brett gesperrt, Knopf heißt Weiter',
    (await strokeCount()) === 3 && tP === (await evaluate("document.getElementById('timer').textContent"))
    && (await evaluate("document.getElementById('btn-pause').textContent")) === 'Weiter');
  await evaluate("document.getElementById('btn-pause').click()");
  await pen(inCell(40, [[0.5, 0.2], [0.5, 0.8]]));
  check('Weiter: Schreiben wieder möglich', (await strokeCount()) === 4);
  await evaluate('KS.App.strokes.pop(); 1');

  // Stop sperrt
  await evaluate("document.getElementById('btn-stop').click()");
  await pen(inCell(40, [[0.5, 0.2], [0.5, 0.8]]));
  check('Nach Stop wird nicht geschrieben', (await strokeCount()) === 3);
  check('Stop: Start wieder aktiv', await evaluate("document.getElementById('btn-stop').disabled && !document.getElementById('btn-start').disabled"));

  // Bild erzeugen
  const img = await evaluate(`(async () => {
    const blob = await KS.Snapshot.createPng({ cages: KS.App.game.cages, strokes: KS.App.strokes, notePad: 0.1, level: KS.App.game.level, levelName: 'Mittel', elapsed: 754000 });
    const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    const im = new Image(); await new Promise(r => { im.onload = r; im.src = dataUrl; });
    return { w: im.width, h: im.height, dataUrl };
  })()`);
  check('Bild wird erzeugt (mit Notizbereichen)', img.w > 1100 && img.h > 1100, `${img.w}x${img.h}`);
  writeFileSync(join(OUT, '3-bild.png'), Buffer.from(img.dataUrl.split(',')[1], 'base64'));

  // Level merken
  await evaluate("document.querySelector('.level[data-level=\"3\"]').click(); location.reload(); 1");
  await waitForPuzzle();
  check('Level nach Neuladen gemerkt', (await evaluate('KS.App.level')) === 3, `cookie="${await evaluate('document.cookie')}"`);

  // Neu generieren löscht Tinte, Uhr 0, gesperrt bis Start
  await evaluate("document.getElementById('btn-start').click()");
  await pen(inCell(0, [[0.5, 0.2], [0.5, 0.8]]));
  await sleep(1100);
  await evaluate("document.getElementById('btn-stop').click()");   // gestoppt verlassen → beendet
  await evaluate("document.getElementById('btn-new').click()");
  await waitForPuzzle();
  await sleep(300);
  await evaluate("document.getElementById('btn-new').click()");    // nie gestartet → verworfen
  await waitForPuzzle();
  await sleep(300);
  await evaluate("document.getElementById('btn-start').click()");
  await sleep(1100);
  await evaluate("document.getElementById('btn-new').click()");    // laufend verlassen → verworfen
  await waitForPuzzle();
  await sleep(300);
  await evaluate("document.getElementById('btn-start').click()");
  await sleep(1100);
  await evaluate("document.getElementById('btn-abort').click()");  // aufgegeben → abgebrochen
  await pen(inCell(0, [[0.5, 0.2], [0.5, 0.8]]));
  check('Abbrechen sperrt Brett und Start', (await strokeCount()) === 0
    && (await evaluate("document.getElementById('btn-start').disabled && document.getElementById('btn-abort').disabled")));
  await evaluate("document.getElementById('btn-new').click()");
  await waitForPuzzle();
  await sleep(300);
  check('Neu generieren: Tinte weg, Uhr 00:00, gesperrt',
    (await strokeCount()) === 0 && (await evaluate("document.getElementById('timer').textContent")) === '00:00'
    && (await evaluate("document.getElementById('sheet').classList.contains('locked')")));

  // Session-Protokoll: Spiel 1 (gestoppt) beendet, Spiel 2 (nie gestartet) verworfen... siehe unten
  const log = await evaluate('KS.App.session.games.map((g) => g.status + ":" + g.level)');
  check('Session-Log', JSON.stringify(log) === JSON.stringify(['beendet:3', 'verworfen:3', 'verworfen:3', 'abgebrochen:3', 'offen:3']), JSON.stringify(log));
  const best = await evaluate("JSON.parse(localStorage.getItem('ks.best.v1') || '{}')");
  check('Bestzeit gespeichert (Level 3)', Array.isArray(best[3]) && best[3].length === 1,
    JSON.stringify(best));
  check('Bestzeiten-Chart zeigt Eintrag', (await evaluate("document.querySelectorAll('.best-row').length")) === 1);
  await screenshot('5-session.png');
  await evaluate("document.getElementById('btn-clear-log').click()");
  const log2 = await evaluate('KS.App.session.games.map((g) => g.nr + ":" + g.status)');
  check('Log löschen behält nur aktuelles Spiel', JSON.stringify(log2) === JSON.stringify(['1:offen']), JSON.stringify(log2));
  // Bestzeiten-Chart mit Beispieldaten (nur für den Screenshot)
  await evaluate(`localStorage.setItem('ks.best.v1', JSON.stringify({
    1: [{ ms: 312000, at: '2026-11-20T09:00:00Z' }, { ms: 355000, at: '2026-11-18T09:00:00Z' }, { ms: 401000, at: '2026-11-15T09:00:00Z' }],
    2: [{ ms: 598000, at: '2026-11-21T09:00:00Z' }, { ms: 640000, at: '2026-11-19T09:00:00Z' }, { ms: 702000, at: '2026-11-17T09:00:00Z' }, { ms: 811000, at: '2026-11-12T09:00:00Z' }, { ms: 905000, at: '2026-11-10T09:00:00Z' }],
    3: [{ ms: 1340000, at: '2026-11-22T09:00:00Z' }] })); location.reload(); 1`);
  await waitForPuzzle();
  await evaluate("document.querySelector('.session').scrollTop = 9999; 1");
  check('Bestzeiten nur für gewähltes Level (3: 1 Eintrag)', (await evaluate("document.querySelectorAll('.best-row').length")) === 1
    && (await evaluate("document.getElementById('best-title').textContent")).includes('Level 3'));
  await evaluate("document.querySelector('.level[data-level=\"2\"]').click(); document.querySelector('.session').scrollTop = 9999; 1");
  check('Levelwechsel zeigt dessen Bestzeiten (2: 5 Einträge)', (await evaluate("document.querySelectorAll('.best-row').length")) === 5);
  await screenshot('6-bestzeiten.png');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  await screenshot('4-quer.png');
} catch (e) {
  check('Ausnahme', false, e.message);
} finally {
  if (consoleMsgs.length) console.log('Konsole:', consoleMsgs);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} bestanden. Screenshots: ${OUT}`);
  try { ws && ws.close(); } catch (e) { /* */ }
  chrome.kill();
  process.exit(failed ? 1 : 0);
}
