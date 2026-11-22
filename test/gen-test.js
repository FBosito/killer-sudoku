const G = require('../js/generator.js');
for (const level of [1,2,3,4]) {
  for (let n = 0; n < 3; n++) {
    const t = Date.now();
    const p = G.generate(level);
    const ms = Date.now() - t;
    const sizes = p.cages.map(k => k.cells.length);
    const singles = sizes.filter(s => s === 1).length;
    const r = G.solve(p.cages, 2);
    const ok = r.count === 1 && r.solutions[0].every((v, i) => v === p.solution[i]);
    // cage validity
    const valid = p.cages.every(k => new Set(k.cells.map(c => p.solution[c])).size === k.cells.length && k.sum === k.cells.reduce((s,c)=>s+p.solution[c],0));
    const covered = new Set(p.cages.flatMap(k => k.cells)).size === 81;
    console.log(`L${level} ${ms}ms att=${p.attempts} rating=${p.rating} cages=${p.cages.length} singles=${singles} max=${Math.max(...sizes)} unique=${ok} valid=${valid && covered}`);
  }
}
