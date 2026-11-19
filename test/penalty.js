"use strict";
// Testa a sequência de pênaltis decidida no servidor.
const assert = require("assert");
const D = require("../lib/data");
const { defaultKickers, runShootout } = require("../lib/penalty");
function mk(t) { const lineup = D.bestXI(t.squad, "4-3-3"); return { lineup }; }
let ok = 0;
for (let s = 1; s <= 300; s++) {
  const A = mk(D.ALL[0]), B = mk(D.ALL[1]), rng = D.makeRng(s);
  const r = runShootout(A, B, defaultKickers(A), defaultKickers(B), rng);
  assert.ok(r.kicks.length >= 2 && r.kicks.length <= 60, "cobranças dentro do limite");
  assert.ok(r.kicks.filter(k => k.team === 0).length >= 1 && r.kicks.filter(k => k.team === 1).length >= 1);
  assert.equal(r.kicks.filter(k => k.team === 0 && k.goal).length, r.score[0]);
  assert.equal(r.kicks.filter(k => k.team === 1 && k.goal).length, r.score[1]);
  assert.ok(r.winner !== null, "sempre há vencedor");
  assert.ok(r.kicks.every(k => ["L", "C", "R"].includes(k.target) && ["L", "C", "R"].includes(k.dive)));
  ok++;
}
// Escolha do jogador é respeitada: o primeiro cobrador é o escolhido.
const A = mk(D.ALL[0]), B = mk(D.ALL[1]);
const pick = A.lineup.filter(p => p.pos !== "GOL").slice(-1)[0].id;
const r = runShootout(A, B, [pick], defaultKickers(B), D.makeRng(3));
assert.equal(r.kicks[0].id, pick, "o cobrador escolhido bate o primeiro pênalti");
console.log(`  ok   pênaltis: ${ok}/300 disputas com placar consistente e escolha respeitada`);
console.log("Todos os testes de pênalti passaram");
