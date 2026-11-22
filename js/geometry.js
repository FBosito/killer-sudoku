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

  const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif';

  /** Zeichnet das Brett (weiß, Gitter, Käfige, Summen) auf einen 2D-Kontext.
   *  size = Brettbreite in Kontexteinheiten, ox/oy = linke obere Ecke. cages darf null sein. */
  function drawBoard(ctx, cages, size, ox = 0, oy = 0) {
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(size / 900, size / 900);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 900, 900);
    ctx.lineCap = 'butt';
    for (let i = 1; i < 9; i++) {
      ctx.strokeStyle = i % 3 === 0 ? '#222' : '#555';
      ctx.lineWidth = i % 3 === 0 ? 3.5 : 1.2;
      ctx.beginPath(); ctx.moveTo(i * 100, 0); ctx.lineTo(i * 100, 900); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 100); ctx.lineTo(900, i * 100); ctx.stroke();
    }
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 896, 896);
    if (cages) {
      const geo = cageOutlines(cages);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.setLineDash([2, 4]);
      for (const p of geo.paths) ctx.stroke(new Path2D(p.d));
      ctx.setLineDash([]);
      ctx.fillStyle = '#111';
      ctx.font = `19px ${FONT}`;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      for (const l of geo.labels) ctx.fillText(l.text, l.x, l.y);
    }
    ctx.restore();
  }

  root.KS = root.KS || {};
  root.KS.Geometry = { cageOutlines, drawBoard };
})(typeof self !== 'undefined' ? self : this);
