"use strict";
// Simulação sem cabeça: IA × IA, mede gols e exercita todos os eventos do Caos.
const E = require("../public/js/engine.js"), D = require("../lib/data");
function team(entry, f) { const l = D.bestXI(entry.squad, f); return { id: entry.key, name: entry.name, formation: f, style: "balanced", lineup: l.map((p, i) => ({ name: p.name, slot: p.slot, ovr: p.ovr, stats: D.playerStats(p), fx: p.fx, hx: D.FORMATIONS[f][i][1], hy: D.FORMATIONS[f][i][2] })) }; }
const rng = D.makeRng(3);
function run(cfg, seeds, opts = {}) {
  let goals = 0, ended = 0, evs = {}, maxBall = 0, nanBad = 0, wins = [0, 0, 0];
  for (let s = 0; s < seeds; s++) {
    const r = D.makeRng(100 + s), a = D.NATIONAL[Math.floor(r() * D.NATIONAL.length)], b = D.NATIONAL[Math.floor(r() * D.NATIONAL.length)];
    const m = new E.Match({ ...cfg, teams: [team(a, "4-3-3"), team(b, "4-4-2")] }, { rng: r, humans: opts.humans || [false, false] });
    if (opts.force) m.triggerChaos(opts.force);
    for (let i = 0; i < 120 * 70 * 1.6 && !m.ended; i++) {
      m.step(1 / 60); if (i % 30 === 0) { const st = m.state(); if (st.players.some(p => p.slice(0, 4).some(v => !Number.isFinite(v))) || !st.ball.every(Number.isFinite)) nanBad++; }
      for (const e of m.drain()) evs[e.type] = (evs[e.type] || 0) + 1;
    }
    if (m.ended) ended++; goals += m.score[0] + m.score[1]; wins[m.score[0] > m.score[1] ? 0 : m.score[0] < m.score[1] ? 1 : 2]++;
  }
  return { goalsPerMatch: (goals / seeds).toFixed(2), ended, evs, nanBad, wins };
}
console.log("normal", JSON.stringify(run({ kind: "quick", seconds: 120 }, 12)));
console.log("caos  ", JSON.stringify(run({ kind: "chaos", seconds: 120, chaos: true }, 12)));
for (const k of E.CHAOS_LIST) { const r = run({ kind: "chaos", seconds: 60, chaos: true }, 2, { force: k }); if (r.nanBad || r.ended !== 2) console.log("PROBLEMA", k, r); }
console.log("youplay", JSON.stringify(run({ kind: "chaos", seconds: 120, chaos: true, humanControl: true }, 2, { humans: [true, false], force: "youplay" })));
console.log("final  ", JSON.stringify(run({ kind: "final", seconds: 120 }, 8)));
// simetria: mesmo time contra si mesmo
{ let w = [0, 0, 0], g = 0; const a = D.BY_KEY.get("BRA-1994"); for (let s = 0; s < 30; s++) { const m = new E.Match({ kind: "quick", seconds: 120, teams: [team(a, "4-3-3"), team(a, "4-3-3")] }, { rng: D.makeRng(500 + s) }); while (!m.ended) m.step(1 / 60); w[m.score[0] > m.score[1] ? 0 : m.score[0] < m.score[1] ? 1 : 2]++; g += m.score[0] + m.score[1]; } console.log("espelho", w, (g / 30).toFixed(2)); }
