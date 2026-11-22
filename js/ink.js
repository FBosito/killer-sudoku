/* Tinte: drucksensitive Striche in Brett-Koordinaten (Einheit = Brettbreite).
 * Ein Punkt ist [x, y, druck]; druck 0..1 (fehlt er, gilt 0,5).
 * Gemeinsam genutzt von der Bildschirmdarstellung und dem Bildexport. */
(function (root) {
  'use strict';

  const INK = {
    color: '#000',
    width: 0.0022,       // Strichstärke bei mittlerem Druck, relativ zur Brettbreite
    minFactor: 0.35,     // Breite bei ganz leichtem Druck (× width)
    maxFactor: 1.9,      // Breite bei vollem Druck (× width)
    eraserRadius: 0.014, // Radiergummi-Radius relativ zur Brettbreite
  };

  const curve = (p) => INK.minFactor + (INK.maxFactor - INK.minFactor) * Math.pow(p, 0.85);
  const MID = curve(0.5);

  /** Strichbreite (in Brett-Einheiten) für einen Druckwert; mittlerer Druck = INK.width. */
  function widthAt(p) {
    const pr = p === undefined ? 0.5 : Math.max(0, Math.min(1, p));
    return INK.width * (curve(pr) / MID);
  }

  /** Fügt einem Pfad die Segmente ab Index from hinzu, mit variabler Breite
   *  (Kreis je Punkt + Trapez je Segment; deckend gefüllt, Überlappung unkritisch). */
  function addSegments(ctx, pts, from, size, ox, oy) {
    const X = (p) => ox + p[0] * size, Y = (p) => oy + p[1] * size;
    const R = (p) => (widthAt(p[2]) * size) / 2;
    if (from === 0) {
      const p = pts[0], r = R(p);
      ctx.moveTo(X(p) + r, Y(p));
      ctx.arc(X(p), Y(p), r, 0, Math.PI * 2);
      from = 1;
    }
    for (let i = from; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const ax = X(a), ay = Y(a), bx = X(b), by = Y(b);
      const ra = R(a), rb = R(b);
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      if (len > 0.01) {
        const nx = -dy / len, ny = dx / len;
        // Alle Teilflächen gleich orientieren (wie die Kreise: im Uhrzeigersinn),
        // sonst heben sich Überlappungen beim Füllen (nonzero) gegenseitig auf.
        const q = [
          [ax + nx * ra, ay + ny * ra], [bx + nx * rb, by + ny * rb],
          [bx - nx * rb, by - ny * rb], [ax - nx * ra, ay - ny * ra],
        ];
        let area = 0;
        for (let k = 0; k < 4; k++) { const u = q[k], v = q[(k + 1) % 4]; area += u[0] * v[1] - v[0] * u[1]; }
        if (area < 0) q.reverse();
        ctx.moveTo(q[0][0], q[0][1]);
        ctx.lineTo(q[1][0], q[1][1]);
        ctx.lineTo(q[2][0], q[2][1]);
        ctx.lineTo(q[3][0], q[3][1]);
        ctx.closePath();
      }
      ctx.moveTo(bx + rb, by);
      ctx.arc(bx, by, rb, 0, Math.PI * 2);
    }
  }

  /** Zeichnet ganze Striche; size = Brettbreite in Kontexteinheiten, ox/oy = Brett-Ursprung. */
  function drawStrokes(ctx, strokes, size, ox = 0, oy = 0) {
    ctx.save();
    ctx.fillStyle = INK.color;
    for (const s of strokes) {
      if (!s.length) continue;
      ctx.beginPath();
      addSegments(ctx, s, 0, size, ox, oy);
      ctx.fill('nonzero');
    }
    ctx.restore();
  }

  /** Zeichnet nur die neuen Segmente eines wachsenden Strichs ab Index from. */
  function drawTail(ctx, pts, from, size, ox = 0, oy = 0) {
    if (from >= pts.length) return;
    ctx.save();
    ctx.fillStyle = INK.color;
    ctx.beginPath();
    addSegments(ctx, pts, from, size, ox, oy);
    ctx.fill('nonzero');
    ctx.restore();
  }

  function segDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + t * dx - px, qy = ay + t * dy - py;
    return qx * qx + qy * qy;
  }

  /** Liefert die Striche ohne die, die der Radiergummi an Punkt p berührt. */
  function eraseAt(strokes, p) {
    const r2 = INK.eraserRadius * INK.eraserRadius;
    return strokes.filter((s) => {
      if (s.length === 1) return segDist2(p[0], p[1], s[0][0], s[0][1], s[0][0], s[0][1]) > r2;
      for (let i = 1; i < s.length; i++) {
        if (segDist2(p[0], p[1], s[i - 1][0], s[i - 1][1], s[i][0], s[i][1]) <= r2) return false;
      }
      return true;
    });
  }

  root.KS = root.KS || {};
  root.KS.Ink = { INK, widthAt, drawStrokes, drawTail, eraseAt };
})(typeof self !== 'undefined' ? self : this);
