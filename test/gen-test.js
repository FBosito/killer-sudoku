// Generator-Test: Gültigkeit, Eindeutigkeit, keine Einzelzellen, Laufzeit je Level
const G = require('../js/generator.js');
const N = +(process.argv[2] || 8);
let failed = 0;
for (const level of [1, 2, 3, 4]) {
  const times = [];
  let bad = 0, offRating = 0;
  for (let n = 0; n < N; n++) {
    const t = Date.now();
    const p = G.generate(level);
    times.push(Date.now() - t);
    const r = G.solve(p.cages, 2);
    const unique = r.count === 1 && r.solutions[0].every((v, i) => v === p.solution[i]);
    const valid = p.cages.every((k) => new Set(k.cells.map((c) => p.solution[c])).size === k.cells.length
      && k.sum === k.cells.reduce((s, c) => s + p.solution[c], 0));
    const covered = new Set(p.cages.flatMap((k) => k.cells)).size === 81;
    const singles = p.cages.filter((k) => k.cells.length === 1).length;
    if (!unique || !valid || !covered || singles) bad++;
    if (!G.LEVELS[level].accept.includes(p.rating)) offRating++;
  }
  times.sort((a, b) => a - b);
  console.log(`L${level}: ${N} Rätsel, Median ${times[N >> 1]} ms, max ${times[N - 1]} ms, fehlerhaft ${bad}, Stufe verfehlt ${offRating}`);
  failed += bad;
}
process.exit(failed ? 1 : 0);
