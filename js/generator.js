/* Killer-Sudoku: Löser, Generator und Schwierigkeitsbewertung.
 * Läuft ohne Build-Schritt im Browser (global KS.Generator) und in Node (module.exports). */
(function (root) {
  'use strict';

  const ALL = 0x3fe; // Bits 1..9
  const DIGIT = new Int8Array(1024).fill(0);
  const POP = new Uint8Array(1024);
  for (let d = 1; d <= 9; d++) DIGIT[1 << d] = d;
  for (let m = 0; m < 1024; m++) { let c = 0, x = m; while (x) { x &= x - 1; c++; } POP[m] = c; }

  const row = (i) => (i / 9) | 0;
  const col = (i) => i % 9;
  const box = (i) => ((row(i) / 3) | 0) * 3 + ((col(i) / 3) | 0);

  // 27 Einheiten: 0-8 Zeilen, 9-17 Spalten, 18-26 Blöcke
  const UNITS = [];
  for (let u = 0; u < 27; u++) UNITS.push([]);
  for (let i = 0; i < 81; i++) {
    UNITS[row(i)].push(i);
    UNITS[9 + col(i)].push(i);
    UNITS[18 + box(i)].push(i);
  }
  const CELL_UNITS = [];
  for (let i = 0; i < 81; i++) CELL_UNITS.push([row(i), 9 + col(i), 18 + box(i)]);

  const SUDOKU_PEERS = [];
  for (let i = 0; i < 81; i++) {
    const s = new Set();
    for (const u of CELL_UNITS[i]) for (const c of UNITS[u]) if (c !== i) s.add(c);
    SUDOKU_PEERS.push(s);
  }

  // Orthogonale Nachbarn
  const NEIGH = [];
  for (let i = 0; i < 81; i++) {
    const n = [], r = row(i), c = col(i);
    if (r > 0) n.push(i - 9);
    if (r < 8) n.push(i + 9);
    if (c > 0) n.push(i - 1);
    if (c < 8) n.push(i + 1);
    NEIGH.push(n);
  }

  // COMBOS[size][sum] = Liste von Ziffernmasken
  const COMBOS = [];
  for (let s = 0; s <= 9; s++) { COMBOS.push([]); for (let t = 0; t <= 45; t++) COMBOS[s].push([]); }
  for (let m = 1; m < 512; m++) {
    const mask = m << 1;
    let sum = 0;
    for (let d = 1; d <= 9; d++) if (mask & (1 << d)) sum += d;
    COMBOS[POP[mask]][sum].push(mask);
  }

  function shuffle(a, rnd) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---------- Constraint-Aufbereitung ----------

  function unitsContaining(cells) {
    const res = [];
    for (let u = 0; u < 27; u++) {
      const set = UNITS[u];
      if (cells.every((c) => set.includes(c))) res.push(u);
    }
    return res;
  }

  function makeConstraint(cells, sum) {
    const units = unitsContaining(cells);
    const inCage = new Set(cells);
    const outside = new Set();
    for (const u of units) for (const c of UNITS[u]) if (!inCage.has(c)) outside.add(c);
    return {
      cells: cells.slice(),
      sum,
      combos: cells.length <= 9 && sum <= 45 ? COMBOS[cells.length][sum] : [],
      outside: Array.from(outside),
    };
  }

  /** Virtuelle Käfige nach der 45er-Regel (Innies/Outies je Einheit). */
  function virtualConstraints(cages) {
    const cageOf = new Int16Array(81);
    cages.forEach((k, idx) => k.cells.forEach((c) => { cageOf[c] = idx; }));
    const res = [];
    const seen = new Set();
    const push = (cells, sum) => {
      if (cells.length === 0 || cells.length > 9) return;
      const key = cells.slice().sort((a, b) => a - b).join(',');
      if (seen.has(key)) return;
      seen.add(key);
      res.push(makeConstraint(cells, sum));
    };
    for (let u = 0; u < 27; u++) {
      const unitSet = new Set(UNITS[u]);
      const touching = new Set();
      for (const c of UNITS[u]) touching.add(cageOf[c]);
      let sumInside = 0, sumTouch = 0;
      const covered = new Set();
      const outies = [];
      for (const k of touching) {
        const cage = cages[k];
        sumTouch += cage.sum;
        if (cage.cells.every((c) => unitSet.has(c))) {
          sumInside += cage.sum;
          cage.cells.forEach((c) => covered.add(c));
        } else {
          for (const c of cage.cells) if (!unitSet.has(c)) outies.push(c);
        }
      }
      // Innies: alle in derselben Einheit, also paarweise verschieden
      const innies = UNITS[u].filter((c) => !covered.has(c));
      if (innies.length > 0 && innies.length < 9) push(innies, 45 - sumInside);
      // Outies: nur verwendbar, wenn sie eine gemeinsame Einheit teilen
      if (outies.length > 0 && (outies.length === 1 || unitsContaining(outies).length > 0)) {
        push(outies, sumTouch - 45);
      }
    }
    return res;
  }

  function buildPeers(cages) {
    const peers = SUDOKU_PEERS.map((s) => new Set(s));
    for (const k of cages) for (const a of k.cells) for (const b of k.cells) if (a !== b) peers[a].add(b);
    return peers.map((s) => Int16Array.from(s));
  }

  // ---------- Propagation ----------

  /** Wendet Logik an, bis sich nichts mehr ändert. false = Widerspruch.
   *  advanced: Käfig-in-Einheit-Elimination aktivieren. */
  function propagate(cand, val, peers, cons, advanced) {
    let changed = true;
    while (changed) {
      changed = false;

      // Naked Singles
      for (let i = 0; i < 81; i++) {
        if (val[i]) continue;
        const m = cand[i];
        if (m === 0) return false;
        if ((m & (m - 1)) === 0) {
          val[i] = DIGIT[m];
          const p = peers[i];
          for (let j = 0; j < p.length; j++) {
            const q = p[j];
            if (cand[q] & m) {
              cand[q] &= ~m;
              if (cand[q] === 0) return false;
            }
          }
          changed = true;
        }
      }

      // Hidden Singles in Einheiten
      for (let u = 0; u < 27; u++) {
        const cells = UNITS[u];
        for (let d = 1; d <= 9; d++) {
          const bit = 1 << d;
          let cnt = 0, pos = -1;
          for (let j = 0; j < 9; j++) if (cand[cells[j]] & bit) { cnt++; pos = cells[j]; if (cnt > 1) break; }
          if (cnt === 0) return false;
          if (cnt === 1 && cand[pos] !== bit) { cand[pos] = bit; changed = true; }
        }
      }

      // Käfig-Kombinationen
      for (let k = 0; k < cons.length; k++) {
        const ct = cons[k];
        const cells = ct.cells;
        let U = 0, P = 0;
        for (let j = 0; j < cells.length; j++) {
          const c = cells[j];
          U |= cand[c];
          if (val[c]) P |= cand[c];
        }
        let allowed = 0, req = ALL;
        const list = ct.combos;
        for (let x = 0; x < list.length; x++) {
          const cm = list[x];
          if ((cm & P) !== P || (cm & ~U)) continue;
          let ok = true;
          for (let j = 0; j < cells.length; j++) if (!(cand[cells[j]] & cm)) { ok = false; break; }
          if (!ok) continue;
          allowed |= cm;
          req &= cm;
        }
        if (!allowed) return false;
        for (let j = 0; j < cells.length; j++) {
          const c = cells[j];
          const nm = cand[c] & allowed;
          if (nm !== cand[c]) { if (!nm) return false; cand[c] = nm; changed = true; }
        }
        // Hidden Single im Käfig (nur bei paarweise verschiedenen Zellen gültig – immer der Fall)
        for (let d = 1; d <= 9; d++) {
          const bit = 1 << d;
          if (!(req & bit)) continue;
          let cnt = 0, pos = -1;
          for (let j = 0; j < cells.length; j++) if (cand[cells[j]] & bit) { cnt++; pos = cells[j]; }
          if (cnt === 0) return false;
          if (cnt === 1 && cand[pos] !== bit) { cand[pos] = bit; changed = true; }
        }
        if (advanced && req) {
          const out = ct.outside;
          for (let j = 0; j < out.length; j++) {
            const c = out[j];
            if (cand[c] & req) {
              cand[c] &= ~req;
              if (!cand[c]) return false;
              changed = true;
            }
          }
        }
      }
    }
    return true;
  }

  /** Logikstufen: basic = Singles + Käfig-Kombinationen; medium = zusätzlich Käfig-in-Einheit-
   *  Elimination; advanced = zusätzlich 45er-Regel (Innies/Outies als virtuelle Käfige). */
  function prepare(cages, mode) {
    const real = cages.map((k) => makeConstraint(k.cells, k.sum));
    const cons = mode === 'advanced' ? real.concat(virtualConstraints(cages)) : real;
    return { peers: buildPeers(cages), cons, advanced: mode !== 'basic' };
  }

  /** Zählt Lösungen bis limit. */
  function solve(cages, limit = 2) {
    const ctx = prepare(cages, 'advanced');
    const solutions = [];
    let nodes = 0;
    const rec = (cand, val) => {
      nodes++;
      if (!propagate(cand, val, ctx.peers, ctx.cons, true)) return;
      let best = -1, bestPop = 10;
      for (let i = 0; i < 81; i++) {
        if (!val[i]) {
          const p = POP[cand[i]];
          if (p < bestPop) { bestPop = p; best = i; if (p === 2) break; }
        }
      }
      if (best < 0) { solutions.push(Array.from(val)); return; }
      const m = cand[best];
      for (let d = 1; d <= 9; d++) {
        if (!(m & (1 << d))) continue;
        const c2 = cand.slice(), v2 = val.slice();
        c2[best] = 1 << d;
        rec(c2, v2);
        if (solutions.length >= limit) return;
      }
    };
    rec(new Uint16Array(81).fill(ALL), new Uint8Array(81));
    return { count: solutions.length, solutions, nodes };
  }

  /** Löst rein logisch (ohne Raten). Liefert true, wenn vollständig gelöst. */
  function logicalSolve(cages, mode) {
    const ctx = prepare(cages, mode);
    const cand = new Uint16Array(81).fill(ALL);
    const val = new Uint8Array(81);
    if (!propagate(cand, val, ctx.peers, ctx.cons, ctx.advanced)) return false;
    return val.every((v) => v > 0);
  }

  // ---------- Generator ----------

  function randomSolution(rnd) {
    const grid = new Uint8Array(81);
    const rows = new Uint16Array(9), cols = new Uint16Array(9), boxes = new Uint16Array(9);
    const fill = (i) => {
      if (i === 81) return true;
      const r = row(i), c = col(i), b = box(i);
      const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd);
      for (const d of digits) {
        const bit = 1 << d;
        if ((rows[r] | cols[c] | boxes[b]) & bit) continue;
        grid[i] = d; rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
        if (fill(i + 1)) return true;
        grid[i] = 0; rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
      }
      return false;
    };
    fill(0);
    return Array.from(grid);
  }

  const LEVELS = {
    // Einzelzellen-Käfige gibt es in keinem Level (maxSingles 0 ist eine harte Bedingung).
    // accept: zulässige Logikstufen (siehe prepare/rateCages)
    1: { name: 'Leicht', sizes: { 2: 60, 3: 35, 4: 5 }, max: 4, minSingles: 0, maxSingles: 0, accept: ['basic', 'medium'] },
    2: { name: 'Mittel', sizes: { 2: 35, 3: 40, 4: 25 }, max: 4, minSingles: 0, maxSingles: 0, accept: ['advanced'] },
    3: { name: 'Schwer', sizes: { 2: 30, 3: 40, 4: 20, 5: 10 }, max: 5, minSingles: 0, maxSingles: 0, accept: ['advanced'] },
    4: { name: 'Experte', sizes: { 2: 12, 3: 28, 4: 30, 5: 18, 6: 12 }, max: 6, minSingles: 0, maxSingles: 0, accept: ['hard', 'advanced'] },
  };

  function pickSize(cfg, rnd) {
    const entries = Object.entries(cfg.sizes);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let x = rnd() * total;
    for (const [size, w] of entries) { x -= w; if (x < 0) return +size; }
    return +entries[entries.length - 1][0];
  }

  /** Teilt nicht zusammenhängende Käfige in Komponenten auf und berechnet Summen neu. */
  function normalizeCages(groups, sol) {
    const res = [];
    for (const cells of groups) {
      if (!cells.length) continue;
      const left = new Set(cells);
      while (left.size) {
        const start = left.values().next().value;
        const comp = [start];
        left.delete(start);
        for (let q = 0; q < comp.length; q++) {
          for (const n of NEIGH[comp[q]]) if (left.has(n)) { left.delete(n); comp.push(n); }
        }
        comp.sort((a, b) => a - b);
        res.push({ cells: comp, sum: comp.reduce((s, c) => s + sol[c], 0) });
      }
    }
    return res;
  }

  function partition(sol, cfg, rnd) {
    const cageOf = new Int16Array(81).fill(-1);
    const groups = [];
    const order = shuffle([...Array(81).keys()], rnd);
    for (const start of order) {
      if (cageOf[start] >= 0) continue;
      const target = pickSize(cfg, rnd);
      const id = groups.length;
      const cells = [start];
      let digits = 1 << sol[start];
      cageOf[start] = id;
      while (cells.length < target) {
        const frontier = [];
        for (const c of cells) for (const n of NEIGH[c]) {
          if (cageOf[n] < 0 && !(digits & (1 << sol[n]))) frontier.push(n);
        }
        if (!frontier.length) break;
        const n = frontier[(rnd() * frontier.length) | 0];
        cells.push(n); cageOf[n] = id; digits |= 1 << sol[n];
      }
      groups.push(cells);
    }

    // Zu viele Einzelzellen: an Nachbarkäfige anhängen
    const singles = () => groups.map((g, i) => (g.length === 1 ? i : -1)).filter((i) => i >= 0);
    let s = shuffle(singles(), rnd);
    for (const gi of s) {
      if (singles().length <= cfg.maxSingles) break;
      const c = groups[gi][0];
      if (groups[gi].length !== 1) continue;
      const options = [];
      for (const n of NEIGH[c]) {
        const other = cageOf[n];
        if (other === gi) continue;
        const g = groups[other];
        if (g.length >= cfg.max + 1) continue;
        if (g.some((x) => sol[x] === sol[c])) continue;
        options.push(other);
      }
      if (!options.length) continue;
      options.sort((a, b) => groups[a].length - groups[b].length);
      const target = options[0];
      groups[target].push(c);
      cageOf[c] = target;
      groups[gi] = [];
    }

    // Zu wenige Einzelzellen (Level 1): Zellen aus großen Käfigen herauslösen
    let guard = 0;
    while (singles().length < cfg.minSingles && guard++ < 200) {
      const gi = (rnd() * groups.length) | 0;
      const g = groups[gi];
      if (g.length < 3) continue;
      const k = (rnd() * g.length) | 0;
      const c = g.splice(k, 1)[0];
      groups.push([c]);
      cageOf[c] = groups.length - 1;
    }
    return normalizeCages(groups, sol);
  }

  /** Hängt Einzelzellen-Käfige an passende Nachbarkäfige (keine doppelte Ziffer, Größe <= limit). */
  function absorbSingles(cages, sol, limit, rnd) {
    const groups = cages.map((k) => k.cells.slice());
    const idxOf = new Int16Array(81);
    groups.forEach((g, i) => g.forEach((c) => { idxOf[c] = i; }));
    for (let gi = 0; gi < groups.length; gi++) {
      if (groups[gi].length !== 1) continue;
      const c = groups[gi][0];
      const options = [];
      for (const n of NEIGH[c]) {
        const oi = idxOf[n];
        if (oi === gi || groups[oi].length === 0 || groups[oi].length >= limit) continue;
        if (groups[oi].some((x) => sol[x] === sol[c])) continue;
        if (!options.includes(oi)) options.push(oi);
      }
      if (!options.length) continue;
      shuffle(options, rnd).sort((a, b) => groups[a].length - groups[b].length);
      const target = options[0];
      groups[target].push(c);
      idxOf[c] = target;
      groups[gi] = [];
    }
    return normalizeCages(groups, sol);
  }

  /** Macht ein mehrdeutiges Rätsel eindeutig, indem Käfige an Unterscheidungszellen geteilt werden. */
  function makeUnique(cages, sol, cfg, rnd, deadline) {
    for (let iter = 0; iter < 60; iter++) {
      if (Date.now() > deadline) return null;
      const r = solve(cages, 2);
      if (r.count === 1) return cages;
      if (r.count === 0) return null; // sollte nicht vorkommen
      const [a, b] = r.solutions;
      const diffs = [];
      for (let i = 0; i < 81; i++) if (a[i] !== b[i]) diffs.push(i);
      const c = diffs[(rnd() * diffs.length) | 0];
      const groups = cages.map((k) => k.cells.slice());
      const gi = groups.findIndex((g) => g.includes(c));
      const g0 = groups[gi];
      if (g0.length >= 4) {
        // Käfig in zwei zusammenhängende Teile schneiden: BFS ab c bis zur halben Größe
        const inG = new Set(g0);
        const part = [c];
        const seen = new Set([c]);
        const half = g0.length >> 1;
        for (let q = 0; q < part.length && part.length < half; q++) {
          for (const n of shuffle(NEIGH[part[q]].slice(), rnd)) {
            if (inG.has(n) && !seen.has(n) && part.length < half) { seen.add(n); part.push(n); }
          }
        }
        groups[gi] = g0.filter((x) => !seen.has(x));
        groups.push(part);
      } else {
        groups[gi] = g0.filter((x) => x !== c);
        // Zelle an einen Nachbarkäfig hängen, sonst Einzelzelle
        const options = [];
        for (const n of NEIGH[c]) {
          const oi = groups.findIndex((g) => g.includes(n));
          if (oi < 0 || oi === gi) continue;
          const g = groups[oi];
          if (g.length >= cfg.max + 1) continue;
          if (g.some((x) => sol[x] === sol[c])) continue;
          options.push(oi);
        }
        if (options.length) {
          // kleinere Käfige bevorzugen
          options.sort((a, b) => groups[a].length - groups[b].length);
          groups[options[0]].push(c);
        } else groups.push([c]);
      }
      cages = normalizeCages(groups, sol);
      if (cfg.maxSingles === 0) cages = absorbSingles(absorbSingles(cages, sol, cfg.max + 1, rnd), sol, cfg.max + 3, rnd);
    }
    return null;
  }

  function rateCages(cages) {
    if (logicalSolve(cages, 'basic')) return 'basic';
    if (logicalSolve(cages, 'medium')) return 'medium';
    if (logicalSolve(cages, 'advanced')) return 'advanced';
    return 'hard';
  }

  function levelMatches(cfg, rating, cages) {
    const singles = cages.filter((k) => k.cells.length === 1).length;
    if (singles > cfg.maxSingles) return false;
    return cfg.accept.includes(rating);
  }

  /** Zustandsbehafteter Generator: step() macht einen Versuch und liefert ggf. das Ergebnis. */
  function createJob(level, opts = {}) {
    const cfg = LEVELS[level] || LEVELS[2];
    const rnd = opts.random || Math.random;
    const deadline = Date.now() + (opts.budgetMs || 5000);
    let fallback = null;
    let attempts = 0;
    let sol = null;
    return {
      step() {
        if (attempts % 4 === 0) sol = randomSolution(rnd);
        attempts++;
        let cages = partition(sol, cfg, rnd);
        if (cfg.maxSingles === 0) cages = absorbSingles(absorbSingles(cages, sol, cfg.max + 1, rnd), sol, cfg.max + 3, rnd);
        cages = makeUnique(cages, sol, cfg, rnd, Math.max(deadline, Date.now() + 2000));
        if (cages) {
          const rating = rateCages(cages);
          const result = { level, levelName: cfg.name, cages, solution: sol, rating, attempts };
          if (levelMatches(cfg, rating, cages)) return result;
          const singles = cages.filter((k) => k.cells.length === 1).length;
          const score = singles * 1000 + (cfg.accept.includes(rating) ? 0 : 100);
          if (!fallback || score < fallback.score) { fallback = result; fallback.score = score; }
        }
        // Nach Ablauf des Budgets das beste Ergebnis nehmen – Einzelzellen aber nur im Notfall
        if (fallback && Date.now() > deadline && (fallback.score < 1000 || Date.now() > deadline + 15000)) return fallback;
        return null;
      },
    };
  }

  /** Erzeugt synchron ein eindeutiges Killer-Sudoku für Level 1..4. */
  function generate(level, opts) {
    const job = createJob(level, opts);
    for (;;) { const r = job.step(); if (r) return r; }
  }

  /** Wie generate, gibt aber zwischen den Versuchen die UI frei. */
  function generateAsync(level, opts) {
    const job = createJob(level, opts);
    return new Promise((resolve) => {
      const tick = () => {
        const until = Date.now() + 40;
        while (Date.now() < until) {
          const r = job.step();
          if (r) { resolve(r); return; }
        }
        setTimeout(tick, 0);
      };
      setTimeout(tick, 0);
    });
  }

  const api = { generate, generateAsync, solve, logicalSolve, rateCages, LEVELS, COMBOS, UNITS, NEIGH, row, col, box };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.KS = root.KS || {}; root.KS.Generator = api; }
})(typeof self !== 'undefined' ? self : this);
