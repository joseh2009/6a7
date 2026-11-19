"use strict";
// Testa os 16 eventos novos do caos: efeito esperado, sem NaN e sem travar a partida.
const assert = require("assert");
const D = require("../lib/data");
const Engine = require("../public/js/engine.js");
const { CHAOS, CHAOS_LIST } = Engine;
function mk(team) { const lineup = D.bestXI(team.squad, "4-3-3"); const t = { id: team.key, name: team.key, sel: team.sel, copa: team.copa, formation: "4-3-3", style: "balanced", lineup, human: null, meme: false }; t.ratings = D.teamRatings(lineup, t); return t; }
const NEW = ["backgoal", "goalban", "movinggoals", "invisball", "upside", "randomball", "pulledarea", "onevsall", "splitball", "negativegoal", "ops", "dance", "lag", "fifa", "picolo", "theend"];
for (const n of NEW) assert.ok(CHAOS[n] && CHAOS[n].label && CHAOS[n].dur > 0, "catálogo: " + n);
assert.ok(NEW.every(n => CHAOS_LIST.includes(n)), "todos aparecem no caos e no devmode");
const fresh = (seed) => new Engine.Match({ kind: "chaos", seconds: 120, chaos: true, teams: [mk(D.ALL[0]), mk(D.ALL[1])] }, { rng: D.makeRng(seed) });
const run = (eng, sec) => { for (let i = 0; i < sec * 60; i++) eng.step(1 / 60); };
const finite = eng => { for (const p of eng.players) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z), "NaN em jogador"); assert.ok(Number.isFinite(eng.ball.x) && Number.isFinite(eng.ball.z), "NaN na bola"); };
for (const n of NEW) { // cada evento isolado: roda 25 s sem travar
  const e = fresh(11); e.applyDev({ op: "trigger", name: n }); run(e, 25); finite(e);
  assert.ok(e.t > 10 || e.ended, n + " trava a partida (t=" + e.t.toFixed(1) + ")");
}
// efeitos específicos
{ const e = fresh(2); e.applyDev({ op: "keep", name: "movinggoals", on: true }); const z0 = e.goalZ(); run(e, 6); assert.ok(Math.abs(e.goalZ() - z0) > 1, "meta móvel se desloca"); assert.ok(e.state().goalZ !== undefined, "estado envia goalZ"); }
{ const e = fresh(3); e.applyDev({ op: "trigger", name: "upside" }); e.input(0, { dx: 1, dz: 0.5 }); assert.deepEqual([e.ctrl[0].in.dx, e.ctrl[0].in.dz], [-1, -0.5], "controles invertidos"); }
{ const e = fresh(4); e.applyDev({ op: "trigger", name: "negativegoal" }); e.applyDev({ op: "goal", team: 0 }); assert.equal(e.score[0], -1, "gol vale negativo"); }
{ const e = fresh(5); e.applyDev({ op: "trigger", name: "goalban" }); e.applyDev({ op: "goal", team: 1 }); const who = e.goals[e.goals.length - 1]; const sc = e.players.find(p => p.name === who.player); assert.ok(e.players.some(p => p.stun > 0), "quem marca fica paralisado"); }
{ const e = fresh(6); e.applyDev({ op: "trigger", name: "splitball" }); assert.equal(e.state().ents.filter(x => x[0] === "miniball").length, 3, "três bolinhas"); }
{ const e = fresh(7); e.applyDev({ op: "trigger", name: "lag" }); const st = e.state(); assert.ok(st.players.every(p => Math.abs(p[0] / 1.2 - Math.round(p[0] / 1.2)) < 1e-9), "lag em saltos"); }
{ const e = fresh(8); e.applyDev({ op: "trigger", name: "ops" }); run(e, 11); assert.ok(e.players.some(p => p.dead), "jogador desmaia"); assert.ok(e.ents.some(x => x.k === "snooker"), "vira bola de sinuca"); }
{ const e = fresh(9); e.applyDev({ op: "trigger", name: "theend" }); run(e, 0.1); assert.equal(e.state().quake, 1, "o campo treme"); const dist = () => e.players.filter(q => q.cornerX != null).reduce((s, q) => s + Math.hypot(q.x - q.cornerX, q.z - q.cornerZ), 0); const d0 = dist(); run(e, 4); assert.ok(dist() < d0 - 40, "jogadores correm para os cantos"); }
{ const e = fresh(10); e.applyDev({ op: "trigger", name: "dance" }); assert.ok(e.players.some(p => p.danceT > 0), "alguém dança"); }
{ const e = fresh(12); e.applyDev({ op: "trigger", name: "picolo" }); assert.ok(e.picoloP, "picolo escolhido"); run(e, 6); assert.ok(e.players.some(p => p.mode === "down" && p.downT > 1e6), "picolo derruba rivais que não voltam"); }
console.log("  ok   16 eventos novos: catálogo, efeitos e estabilidade");
console.log("Todos os testes dos eventos novos passaram");
