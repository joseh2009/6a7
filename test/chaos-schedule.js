"use strict";
// Confere o cronograma do Caos: eventos a cada 20 s no 1º minuto, a cada 10 s no último, máx. 2 efeitos ativos.
const assert = require("assert");
const E = require("../public/js/engine.js"), D = require("../lib/data");
const a = D.BY_KEY.get("BRA-1994"), b = D.BY_KEY.get("ARG-1986");
const mk = (e, f) => { const l = D.bestXI(e.squad, f); return { id: e.key, name: e.name, formation: f, style: "balanced", lineup: l.map((p, i) => ({ name: p.name, slot: p.slot, ovr: p.ovr, stats: D.playerStats(p), hx: D.FORMATIONS[f][i][1], hy: D.FORMATIONS[f][i][2] })) }; };
const m = new E.Match({ kind: "quick", seconds: 120, chaos: true, teams: [mk(a, "4-3-3"), mk(b, "4-4-2")] }, { rng: D.makeRng(77) });
const times = []; let maxActive = 0;
while (!m.ended) { m.step(1 / 60); for (const e of m.drain()) if (e.type === "chaos") times.push(Math.round(m.t)); maxActive = Math.max(maxActive, Object.keys(m.fx).length); }
console.log("eventos em (s):", times.join(", "), "| máx. simultâneos:", maxActive);
assert.ok(times.length >= 6, "deve haver eventos");
assert.ok(times.slice(0, 2).every((t, i) => Math.abs(t - [20, 40][i]) <= 2), "1º minuto: a cada 20 s");
assert.ok(times.filter(t => t >= 60).every((t, i, arr) => i === 0 || arr[i] - arr[i - 1] >= 9), "último minuto: a cada 10 s");
assert.ok(maxActive <= 2, "no máximo 2 efeitos ao mesmo tempo");
console.log("  ok   cronograma do Caos");
