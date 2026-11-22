/* Rätsel samt handschriftlicher Lösung als PNG-Bild speichern. */
(function (root) {
  'use strict';

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  }

  function renderCanvas({ cages, strokes, notePad = 0, level, levelName, elapsed }) {
    const M = 50, HEAD = 80, PAD = Math.round(notePad * 900); // Schreibrand ringsum
    const W = 2 * M + 2 * PAD + 900, H = HEAD + 2 * PAD + 900 + M;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const font = '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, W, H);

    // Kopfzeile
    g.fillStyle = '#111';
    g.font = `600 30px ${font}`;
    g.fillText('Killer Sudoku', M, 52);
    g.font = `20px ${font}`;
    const date = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    g.textAlign = 'right';
    g.fillText(`Level ${level} (${levelName}) · Zeit ${fmtTime(elapsed)} · ${date}`, W - M, 52);
    g.textAlign = 'left';

    if (PAD) {
      g.fillStyle = '#f4f5f7';
      g.fillRect(M, HEAD, 900 + 2 * PAD, 900 + 2 * PAD);
      g.fillStyle = '#fff';
      g.fillRect(M + PAD, HEAD + PAD, 900, 900);
    }

    root.KS.Geometry.drawBoard(g, cages, 900, M + PAD, HEAD + PAD);
    root.KS.Ink.drawStrokes(g, strokes, 900, M + PAD, HEAD + PAD);
    return cv;
  }

  function createPng(data) {
    const cv = renderCanvas(data);
    return new Promise((resolve, reject) => {
      cv.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht erzeugt werden'))), 'image/png');
    });
  }

  /** Speichert über den Speichern-Dialog (falls verfügbar), sonst als Download. */
  async function saveBlob(blob, filename) {
    if (root.showSaveFilePicker) {
      try {
        const handle = await root.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'PNG-Bild', accept: { 'image/png': ['.png'] } }],
        });
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        return 'saved';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'aborted';
        // z. B. SecurityError bei file:// → Download
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'downloaded';
  }

  root.KS = root.KS || {};
  root.KS.Snapshot = { createPng, saveBlob, fmtTime };
})(typeof self !== 'undefined' ? self : this);
