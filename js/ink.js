/* Tinte: Striche in Brett-Koordinaten (0..1), feste Farbe und Strichstärke.
 * Gemeinsam genutzt von der Bildschirmdarstellung und dem Bildexport. */
(function (root) {
  'use strict';

  const INK = {
    color: '#000',
    width: 0.0022,       // Strichstärke relativ zur Brettbreite (≈ 1,8 px bei 800 px)
    eraserRadius: 0.014, // Radiergummi-Radius relativ zur Brettbreite
  };

  /** Zeichnet Striche auf einen 2D-Kontext; size = Brettbreite in Kontexteinheiten. */
  function drawStrokes(ctx, strokes, size, ox = 0, oy = 0) {
    ctx.save();
    ctx.strokeStyle = INK.color;
    ctx.fillStyle = INK.color;
    ctx.lineWidth = INK.width * size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of strokes) drawStroke(ctx, s, size, ox, oy);
    ctx.restore();
  }

  function drawStroke(ctx, pts, size, ox = 0, oy = 0) {
    if (!pts.length) return;
    const X = (p) => ox + p[0] * size, Y = (p) => oy + p[1] * size;
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(X(pts[0]), Y(pts[0]), (INK.width * size) / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // Geglättet über Mittelpunkte (quadratische Kurven)
    ctx.beginPath();
    ctx.moveTo(X(pts[0]), Y(pts[0]));
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(X(pts[i]), Y(pts[i]), ox + mx * size, oy + my * size);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(X(last), Y(last));
    ctx.stroke();
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
  root.KS.Ink = { INK, drawStrokes, drawStroke, eraseAt };
})(typeof self !== 'undefined' ? self : this);
