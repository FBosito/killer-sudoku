/* Käfig-Umrisse (eingerückt, gepunktet) im Koordinatensystem 900×900 (Zelle = 100).
 * Gemeinsam genutzt von Bildschirmdarstellung (SVG) und Bildexport (Canvas/Path2D). */
(function (root) {
  'use strict';

  function cageOutlines(cages, opts = {}) {
    const S = 100;
    const d = opts.inset || 7;
    const cageOf = new Int16Array(81);
    cages.forEach((k, i) => k.cells.forEach((c) => { cageOf[c] = i; }));
    const same = (a, b) => cageOf[a] === cageOf[b];
    const segs = cages.map(() => []);
    const labels = [];
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9), c = i % 9;
      const x0 = c * S, y0 = r * S, x1 = x0 + S, y1 = y0 + S;
      const up = r > 0 && same(i, i - 9), down = r < 8 && same(i, i + 9);
      const left = c > 0 && same(i, i - 1), right = c < 8 && same(i, i + 1);
      const ul = r > 0 && c > 0 && same(i, i - 10), ur = r > 0 && c < 8 && same(i, i - 8);
      const dl = r < 8 && c > 0 && same(i, i + 8), dr = r < 8 && c < 8 && same(i, i + 10);
      const k = cageOf[i];
      const isLabel = Math.min(...cages[k].cells) === i;
      const labelW = isLabel ? 12 + 11 * String(cages[k].sum).length : 0;
      const labelH = isLabel ? 22 : 0;
      const out = segs[k];
      // An konvexen Ecken eingerückt, an konkaven Ecken in den Nachbarn verlängert,
      // damit die Linien sauber um die Ecke laufen.
      if (!up) {
        const xa = left ? (ul ? x0 - d : x0) : x0 + d + labelW;
        const xb = right ? (ur ? x1 + d : x1) : x1 - d;
        out.push(`M${xa} ${y0 + d}H${xb}`);
      }
      if (!down) {
        const xa = left ? (dl ? x0 - d : x0) : x0 + d;
        const xb = right ? (dr ? x1 + d : x1) : x1 - d;
        out.push(`M${xa} ${y1 - d}H${xb}`);
      }
      if (!left) {
        const ya = up ? (ul ? y0 - d : y0) : y0 + d + labelH;
        const yb = down ? (dl ? y1 + d : y1) : y1 - d;
        out.push(`M${x0 + d} ${ya}V${yb}`);
      }
      if (!right) {
        const ya = up ? (ur ? y0 - d : y0) : y0 + d;
        const yb = down ? (dr ? y1 + d : y1) : y1 - d;
        out.push(`M${x1 - d} ${ya}V${yb}`);
      }
      if (isLabel) labels.push({ cage: k, x: x0 + d + 2, y: y0 + d + 17, text: String(cages[k].sum) });
    }
    return { paths: segs.map((s, k) => ({ cage: k, d: s.join('') })), labels };
  }

  root.KS = root.KS || {};
  root.KS.Geometry = { cageOutlines };
})(typeof self !== 'undefined' ? self : this);
