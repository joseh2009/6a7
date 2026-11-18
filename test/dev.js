"use strict";
// Testa os comandos do devmode (Konami) aplicados no motor da partida.
const assert = require("assert");
const D = require("../lib/data");
const Engine = require("../public/js/engine.js");

function mk(team) { const lineup = D.bestXI(team.squad, "4-3-3"); const t = { id: team.key, name: team.key, sel: team.sel, copa: team.copa, formation: "4-3-3", style: "balanced", lineup, human: null, meme: false }; t.ratings = D.teamRatings(lineup, t); return t; }
const [A, B] = [D.ALL[0], D.ALL[1]];
const eng = new Engine.Match({ kind: "quick", seconds: 120, chaos: false, teams: [mk(A), mk(B)] }, { rng: D.makeRng(3) });
const run = (sec) => { for (let i = 0; i < sec * 60; i++) eng.step(1 / 60); };

assert.equal(eng.chaosOn, false);
assert.equal(eng.applyDev({ op: "bogus" }), false, "operação desconhecida é recusada");
assert.equal(eng.applyDev({ op: "trigger", name: "nao-existe" }), false, "evento inexistente é recusado");
assert.equal(eng.applyDev({ op: "trigger", name: "giant" }), true);
assert.ok(eng.fx.giant > 0 && eng.chaosOn, "disparo liga o caos e ativa o efeito");
eng.applyDev({ op: "keep", name: "giant", on: true });
run(40); assert.ok(eng.fx.giant > 0, "efeito mantido não expira");
eng.applyDev({ op: "keep", name: "giant", on: false }); assert.ok(eng.fx.giant <= 3, "soltar o efeito faz ele expirar");
assert.equal(eng.applyDev({ op: "timeScale", v: 99 }), true); assert.equal(eng.dev.timeScale, 4, "timeScale limitado a 4");
assert.equal(eng.applyDev({ op: "speed", v: "lixo" }), true); assert.equal(eng.dev.speed, 1, "valor inválido volta ao padrão");
eng.applyDev({ op: "kick", v: 2 }); assert.equal(eng.dev.kick, 2);
const before = eng.score.slice(); eng.applyDev({ op: "goal", team: 1 }); assert.equal(eng.score[1], before[1] + 1, "gol forçado");
eng.applyDev({ op: "keep", name: "youplay", on: true }); assert.ok(!eng.dev.keep.youplay, "youplay não pode ser mantido");
eng.applyDev({ op: "addTime", s: 30 }); assert.equal(eng.seconds, 150);
eng.applyDev({ op: "clearFx" }); assert.deepEqual(Object.keys(eng.fx), []);
eng.applyDev({ op: "end" }); run(8);
assert.ok(eng.ended, "encerrar termina a partida");
const evs = eng.drain(); assert.ok(evs.some(e => e.type === "end"), "evento de fim emitido");
console.log("  ok   devmode do motor: disparo, manter, multiplicadores, gol, encerrar, validação");
console.log("Todos os testes do devmode passaram");
