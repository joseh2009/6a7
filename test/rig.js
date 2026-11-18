"use strict";
// Testa o "rig" do modo jogador: 70% humanos na final, 30% bot na final contra um humano.
const assert = require("assert");
const D = require("../lib/data");
const { Tournament } = require("../lib/tournament");

function mkTeam(e, i, human) {
  const lineup = D.bestXI(e.squad, "4-3-3");
  const t = { id: (human ? "H" : "B") + i, name: e.name || e.key, sel: e.sel, copa: e.copa, human: human ? "c" + i : null, formation: "4-3-3", style: "balanced", lineup, meme: false };
  t.ratings = D.teamRatings(lineup, t); return t;
}
function play(rig, seed) {
  const rng = D.makeRng(seed);
  const pool = D.ALL.slice(0, 40);
  const teams = [];
  for (let i = 0; i < 16; i++) teams.push(mkTeam(pool[i], i, i < 2));
  const humanIds = ["H0", "H1"];
  const r = rig === "humans" ? { mode: "humans", finalists: ["H0", "H1"], humanIds } : rig === "bot" ? { mode: "bot", finalists: ["H0"], humanIds } : null;
  const t = new Tournament(teams, rng, { rig: r });
  while (t.nextStageKey && t.nextStageKey !== "F") t.advance();
  t.advance();
  return t.final;
}
let humansFinal = 0, botFinal = 0; const N = 400;
for (let s = 1; s <= N; s++) {
  // Modo "humans": ambos os finalistas humanos devem estar na final.
  const f = play("humans", s);
  assert.ok(["H0", "H1"].includes(f.a) && ["H0", "H1"].includes(f.b) && f.a !== f.b, "humanos na final (seed " + s + ")");
  humansFinal++;
  // Modo "bot": H0 na final contra um bot; H1 eliminado.
  const g = play("bot", s);
  assert.ok((g.a === "H0") !== (g.b === "H0"), "um humano na final (seed " + s + ")");
  assert.ok(g.a !== "H1" && g.b !== "H1", "H1 eliminado (seed " + s + ")");
  botFinal++;
}
// Sem rig, o campeonato continua o mesmo de antes (sem erro).
play(null, 99);
console.log(`  rig ok: ${humansFinal}/${N} finais humanos x humanos, ${botFinal}/${N} bot x humano (regra garantida)`);
console.log("Todos os testes do rig passaram");
