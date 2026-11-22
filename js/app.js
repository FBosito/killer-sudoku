/* Killer Sudoku – Oberfläche, Stift-Tinte, Stoppuhr */
(function () {
  'use strict';

  const G = KS.Generator;
  const Ink = KS.Ink;
  const PREF_KEY = 'ks.prefs.v1';
  const BEST_KEY = 'ks.best.v1';
  const BEST_COUNT = 5;

  const $ = (id) => document.getElementById(id);
  const els = {
    sheet: $('sheet'), board: $('board'), overlay: $('overlay'), ink: $('ink'), msg: $('board-msg'),
    timer: $('timer'), start: $('btn-start'), pause: $('btn-pause'), stop: $('btn-stop'), newBtn: $('btn-new'), save: $('btn-save'),
    bestCharts: $('best-charts'), bestTitle: $('best-title'), clearLog: $('btn-clear-log'), sessionTitle: $('session-title'), sessionRows: $('session-rows'), sessionSummary: $('session-summary'),
  };

  // ---------- Zustand ----------
  let level = readLevel();
  let game = null;        // { level, cages, solution }
  let strokes = [];       // Striche in Brett-Koordinaten 0..1
  let elapsed = 0;        // ms bis zum letzten Stop
  let running = false;
  let paused = false;     // Pause gedrückt (Spiel läuft weiter, Uhr steht)
  let stopped = false;    // Stop gedrückt = Spiel als fertig markiert
  let runStart = 0;
  let generating = false;
  let generationId = 0;

  // ---------- Session-Protokoll ----------
  // Jeder Seitenaufruf startet eine neue Session. Ein Spiel gilt als "beendet", wenn es
  // nach Stop verlassen wird, sonst (laufend, pausiert, nie gestartet) als "verworfen".
  const session = { start: new Date(), games: [] };
  let current = null; // aktueller Protokolleintrag

  function beginEntry() {
    current = { nr: session.games.length + 1, level: game.level, startedAt: new Date(), ms: 0, status: 'offen' };
    session.games.push(current);
    renderSession();
  }

  function closeEntry() {
    if (!current) return;
    current.ms = elapsedMs();
    current.status = stopped && !running && current.ms >= 1000 ? 'beendet' : 'verworfen';
    if (current.status === 'beendet') recordBest(current.level, current.ms);
    current = null;
    renderSession();
  }

  // ---------- Bestzeiten (dauerhaft, je Level Top 5) ----------
  let freshBest = null; // { level, at } des zuletzt eingetragenen Rekords
  let pendingMsg = null; // Rekord-Meldung, wird nach dem Erzeugen des neuen Rätsels gezeigt

  function readBest() {
    try {
      const o = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
      return o && typeof o === 'object' ? o : {};
    } catch (e) { return {}; }
  }

  function recordBest(lvl, ms) {
    const best = readBest();
    const list = (best[lvl] = Array.isArray(best[lvl]) ? best[lvl] : []);
    const entry = { ms: Math.round(ms), at: new Date().toISOString() };
    list.push(entry);
    list.sort((a, b) => a.ms - b.ms);
    list.length = Math.min(list.length, BEST_COUNT);
    try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (e) { /* voll */ }
    const place = list.indexOf(entry) + 1;
    if (place > 0) {
      freshBest = { level: lvl, at: entry.at };
      pendingMsg = (place === 1 ? `Neue Bestzeit für Level ${lvl}!<br><b>${fmt(ms)}</b>` : `Platz ${place} der Bestenliste (Level ${lvl})<br><b>${fmt(ms)}</b>`);
    }
    renderBest();
  }

  function renderBest() {
    const best = readBest();
    const day = (iso) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    // nur das aktuell gewählte Level
    els.bestTitle.textContent = `Bestzeiten Level ${level} · ${G.LEVELS[level].name}`;
    const panels = [level].map((lvl) => {
      const list = (best[lvl] || []).slice(0, BEST_COUNT);
      const head = '';
      if (!list.length) return `<div class="best-panel">${head}<div class="best-empty">noch keine beendeten Spiele</div></div>`;
      // Skala je Level: längste Zeit der Top 5 = volle Breite
      const max = Math.max(...list.map((e) => e.ms));
      const rows = list.map((e, i) => {
        const fresh = freshBest && freshBest.level === lvl && freshBest.at === e.at;
        const pct = Math.max(2, (e.ms / max) * 100);
        const when = new Date(e.at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
        return `<div class="best-row${fresh ? ' fresh' : ''}" title="Platz ${i + 1}: ${fmt(e.ms)} am ${when}">` +
          `<span class="best-rank">${i + 1}.</span>` +
          `<span class="best-track"><span class="best-bar" style="width:${pct.toFixed(1)}%"></span></span>` +
          `<span class="best-val">${fmt(e.ms)}<small>${day(e.at)}</small></span></div>`;
      });
      return `<div class="best-panel" role="list" aria-label="Bestzeiten Level ${lvl}">${head}${rows.join('')}</div>`;
    });
    els.bestCharts.innerHTML = panels.join('');
  }

  function closeEntryAs(status) {
    if (!current) return;
    current.ms = elapsed;
    current.status = status;
    current = null;
    renderSession();
  }

  /** Löscht das Protokoll; das aktuelle Spiel bleibt als Eintrag 1 erhalten. */
  function clearSession() {
    session.start = new Date();
    session.games.length = 0;
    if (current) { current.nr = 1; session.games.push(current); }
    renderSession();
  }

  const clock = (d) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  function renderSession() {
    els.sessionTitle.textContent = `Session seit ${clock(session.start)} Uhr`;
    const rows = session.games.slice().reverse().map((g) => {
      const status = g === current ? (running ? 'läuft' : paused ? 'pausiert' : stopped ? 'gestoppt' : 'bereit') : g.status;
      const ms = g === current ? elapsedMs() : g.ms;
      return `<tr class="st-${status}"><td>${g.nr}</td><td>${clock(g.startedAt)}</td><td>${g.level}</td>` +
        `<td class="t"${g === current ? ' id="session-live"' : ''}>${fmt(ms)}</td><td>${status}</td></tr>`;
    });
    els.sessionRows.innerHTML = rows.join('');
    const done = session.games.filter((g) => g.status === 'beendet');
    const dropped = session.games.filter((g) => g.status === 'verworfen').length;
    const avg = done.length ? fmt(done.reduce((t, g) => t + g.ms, 0) / done.length) : '–';
    els.sessionSummary.textContent = `${done.length} beendet · ${dropped} verworfen · Ø ${avg}`;
  }

  // ---------- Level per Cookie ----------
  // Bei file:// speichern manche Browser keine Cookies – dann hilft localStorage aus.
  function readLevel() {
    const m = document.cookie.match(/(?:^|;\s*)ks_level=([1-4])/);
    if (m) return +m[1];
    try {
      const v = +JSON.parse(localStorage.getItem(PREF_KEY) || '{}').level;
      if (v >= 1 && v <= 4) return v;
    } catch (e) { /* ignorieren */ }
    return 2;
  }

  function writeLevel(v) {
    document.cookie = `ks_level=${v}; max-age=${365 * 24 * 3600}; path=/; SameSite=Lax`;
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ level: v })); } catch (e) { /* ignorieren */ }
  }

  // ---------- Stoppuhr ----------
  const elapsedMs = () => elapsed + (running ? performance.now() - runStart : 0);
  const fmt = KS.Snapshot.fmtTime;

  function tick() {
    els.timer.textContent = fmt(elapsedMs());
    const live = document.getElementById('session-live');
    if (live) live.textContent = els.timer.textContent;
    if (running) requestAnimationFrame(tick);
  }

  function start() {
    if (!game || generating || running) return;
    running = true;
    paused = false;
    stopped = false;
    runStart = performance.now();
    hideMsg();
    tick();
    updateUI();
    renderSession();
  }

  function halt() {
    if (running) elapsed += performance.now() - runStart;
    running = false;
    finishStroke();
    tick();
  }

  /** Pause: Uhr anhalten, Brett sperren – das Spiel bleibt offen. */
  function pause() {
    if (!running) return;
    halt();
    paused = true;
    updateUI();
    renderSession();
    showMsg('Pause – mit <b>Weiter</b> geht es weiter');
  }

  function togglePause() { if (paused) start(); else pause(); }

  /** Stop: Spiel als fertig markieren (zählt beim Verlassen als beendet). */
  function stop() {
    if (!running && !paused) return;
    halt();
    paused = false;
    stopped = true;
    hideMsg();
    updateUI();
    renderSession();
  }

  const canWrite = () => !!game && running && !generating;

  // ---------- Neues Rätsel ----------
  async function newPuzzle() {
    const myId = ++generationId;
    if (running) { elapsed += performance.now() - runStart; running = false; closeEntryAs('verworfen'); }
    else closeEntry();
    paused = false;
    stopped = false;
    elapsed = 0;
    active = null;
    strokes = [];
    game = null;
    generating = true;
    els.timer.textContent = fmt(0);
    renderOverlay();
    redrawInk();
    showMsg('Erzeuge Rätsel …');
    updateUI();
    const lvl = level;
    const p = await G.generateAsync(lvl, { budgetMs: 5000 });
    if (myId !== generationId) return; // inzwischen erneut geklickt
    generating = false;
    game = { level: lvl, cages: p.cages, solution: p.solution };
    if (pendingMsg) { showMsg(pendingMsg, 3000); pendingMsg = null; } else hideMsg();
    renderOverlay();
    updateUI();
    beginEntry();
  }

  // ---------- Darstellung ----------
  function renderOverlay() {
    const S = 100, parts = [];
    for (let i = 1; i < 9; i++) {
      const cls = i % 3 === 0 ? 'thick' : 'thin';
      parts.push(`<line class="${cls}" x1="${i * S}" y1="0" x2="${i * S}" y2="900"/>`);
      parts.push(`<line class="${cls}" x1="0" y1="${i * S}" x2="900" y2="${i * S}"/>`);
    }
    parts.push('<rect class="frame" x="2" y="2" width="896" height="896"/>');
    if (game) {
      const geo = KS.Geometry.cageOutlines(game.cages);
      for (const p of geo.paths) parts.push(`<path class="cage" d="${p.d}"/>`);
      for (const l of geo.labels) parts.push(`<text class="sum" x="${l.x}" y="${l.y}">${l.text}</text>`);
    }
    els.overlay.innerHTML = parts.join('');
  }

  function updateUI() {
    els.start.disabled = !game || running || paused || generating;
    els.pause.disabled = !running && !paused;
    els.pause.textContent = paused ? 'Weiter' : 'Pause';
    els.pause.classList.toggle('btn-primary', paused);
    els.stop.disabled = !running && !paused;
    els.save.disabled = !game || generating;
    els.timer.classList.toggle('running', running);
    els.sheet.classList.toggle('locked', !canWrite());
    for (const b of document.querySelectorAll('.level')) b.setAttribute('aria-checked', String(+b.dataset.level === level));
  }

  let msgTimer = 0;
  function showMsg(html, ms) {
    clearTimeout(msgTimer);
    els.msg.innerHTML = html;
    els.msg.hidden = false;
    if (ms) msgTimer = setTimeout(hideMsg, ms);
  }
  function hideMsg() { clearTimeout(msgTimer); els.msg.hidden = true; }

  // ---------- Tinte ----------
  const ctx = els.ink.getContext('2d');
  // Koordinaten der Striche: Ursprung = linke obere Brett-Ecke, Einheit = Brettbreite.
  // Notizen ober-/unterhalb des Bretts haben also y < 0 bzw. y > 1.
  let rect = null;       // Brett
  let sheetRect = null;  // Zeichenfläche (Blatt)
  let ox = 0, oy = 0;    // Brett-Versatz innerhalb der Zeichenfläche
  let active = null; // { id, pts, erasing }

  function resizeInk() {
    rect = els.board.getBoundingClientRect();
    sheetRect = els.sheet.getBoundingClientRect();
    ox = rect.left - sheetRect.left;
    oy = rect.top - sheetRect.top;
    const dpr = window.devicePixelRatio || 1;
    els.ink.width = Math.round(sheetRect.width * dpr);
    els.ink.height = Math.round(sheetRect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redrawInk();
  }

  function redrawInk() {
    if (!rect) return;
    ctx.clearRect(0, 0, sheetRect.width, sheetRect.height);
    Ink.drawStrokes(ctx, strokes, rect.width, ox, oy);
    if (active && !active.erasing) Ink.drawStrokes(ctx, [active.pts], rect.width, ox, oy);
  }

  const toBoard = (e) => [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.width];

  // Radiergummi-Ende (buttons 32) oder gedrückte Seitentaste (buttons 2)
  const isEraser = (e) => e.pointerType === 'pen' && ((e.buttons & 32) !== 0 || (e.buttons & 2) !== 0 || e.button === 5);

  function onDown(e) {
    if (e.pointerType === 'touch') return; // Finger/Handballen ignorieren
    e.preventDefault();
    if (!rect) resizeInk();
    if (active) return;
    if (!canWrite()) {
      if (paused) showMsg('Pause – mit <b>Weiter</b> geht es weiter');
      else if (game && !generating) showMsg('Zum Schreiben auf <b>Start</b> drücken', 1500);
      return;
    }
    try { els.ink.setPointerCapture(e.pointerId); } catch (err) { /* z. B. synthetische Events */ }
    const p = toBoard(e);
    active = { id: e.pointerId, pts: [p], erasing: isEraser(e) };
    if (active.erasing) erase(p);
    else redrawInk();
  }

  function onMove(e) {
    if (!active || e.pointerId !== active.id) return;
    e.preventDefault();
    const evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    const list = evs.length ? evs : [e];
    if (active.erasing) { for (const ev of list) erase(toBoard(ev)); return; }
    // inkrementell zeichnen
    const w = rect.width;
    ctx.save();
    ctx.strokeStyle = Ink.INK.color;
    ctx.lineWidth = Ink.INK.width * w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let last = active.pts[active.pts.length - 1];
    ctx.moveTo(ox + last[0] * w, oy + last[1] * w);
    for (const ev of list) {
      const p = toBoard(ev);
      if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 0.0008) continue;
      active.pts.push(p);
      ctx.lineTo(ox + p[0] * w, oy + p[1] * w);
      last = p;
    }
    ctx.stroke();
    ctx.restore();
  }

  function finishStroke() {
    if (!active) return;
    if (!active.erasing) strokes.push(active.pts);
    active = null;
    redrawInk();
  }

  function onUp(e) {
    if (!active || e.pointerId !== active.id) return;
    finishStroke();
  }

  function erase(p) {
    const before = strokes.length;
    strokes = Ink.eraseAt(strokes, p);
    if (strokes.length !== before) redrawInk();
  }

  // ---------- Speichern ----------
  async function saveImage() {
    if (!game || generating) return;
    finishStroke();
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const name = `killer-sudoku-L${game.level}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.png`;
    try {
      const blob = await KS.Snapshot.createPng({
        cages: game.cages, strokes, notePad: oy / rect.width, level: game.level, levelName: G.LEVELS[game.level].name, elapsed: elapsedMs(),
      });
      const res = await KS.Snapshot.saveBlob(blob, name);
      if (res !== 'aborted') showMsg('Bild gespeichert', 1500);
    } catch (e) {
      showMsg('Speichern fehlgeschlagen', 2500);
    }
  }

  // ---------- Events ----------
  els.ink.addEventListener('pointerdown', onDown);
  els.ink.addEventListener('pointermove', onMove);
  els.ink.addEventListener('pointerup', onUp);
  els.ink.addEventListener('pointercancel', onUp);
  els.ink.addEventListener('contextmenu', (e) => e.preventDefault()); // Seitentaste
  els.ink.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  els.ink.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  els.start.addEventListener('click', start);
  els.pause.addEventListener('click', togglePause);
  els.stop.addEventListener('click', stop);
  els.newBtn.addEventListener('click', newPuzzle);
  els.save.addEventListener('click', saveImage);
  els.clearLog.addEventListener('click', clearSession);
  for (const b of document.querySelectorAll('.level')) {
    b.addEventListener('click', () => { level = +b.dataset.level; writeLevel(level); updateUI(); renderBest(); });
  }
  window.addEventListener('resize', resizeInk);
  if (window.ResizeObserver) new ResizeObserver(resizeInk).observe(els.sheet);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // Für Tests
  window.KS.App = { session, get strokes() { return strokes; }, get game() { return game; }, get level() { return level; } };

  resizeInk();
  renderOverlay();
  renderSession();
  renderBest();
  newPuzzle();
})();
