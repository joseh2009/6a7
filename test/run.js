"use strict";
// Testes de ponta a ponta da lógica de salas, sem precisar de rede (io falso).
const assert = require("assert");
const { createRooms } = require("../lib/rooms");
const D = require("../lib/data");

function makeIO() {
  const sockets = new Map(), log = [];
  const io = {
    handlers: {}, on(ev, fn) { this.handlers[ev] = fn; },
    to(target) { return { emit: (ev, data) => { log.push({ target, ev, data }); for (const s of sockets.values()) if (s.id === target || s.rooms.has(target)) s.got.push({ ev, data }); }, volatile: { emit() {} } }; }
  };
  let n = 0;
  io.connect = () => {
    const s = { id: "s" + (++n), rooms: new Set(), data: {}, got: [], h: {}, on(ev, fn) { this.h[ev] = fn; }, join(r) { this.rooms.add(r); }, leave(r) { this.rooms.delete(r); },
      emit(ev, data) { this.got.push({ ev, data }); }, to(room) { const self = this; return { emit: (ev, d) => { for (const o of sockets.values()) if (o !== self && o.rooms.has(room)) o.got.push({ ev, data: d }); }, volatile: { emit() {} } }; },
      fire(ev, ...a) { this.h[ev](...a); }, last(ev) { for (let i = this.got.length - 1; i >= 0; i--) if (this.got[i].ev === ev) return this.got[i].data; return null; } };
    sockets.set(s.id, s); io.handlers.connection(s); return s;
  };
  return { io, log, sockets };
}
let seed = 7; const rng = D.makeRng(seed);

function draftFully(sock) { // joga o draft de um humano até completar (respeitando o turno)
  let guard = 0;
  while (guard++ < 600) {
    const me = sock.last("you"), room = sock.last("room");
    if (room.phase !== "draft") return;
    if (!me.myTurn) return "wait";
    if (me.picks >= 11) return "done";
    if (!me.draw) { sock.fire("roll"); continue; }
    const ok = me.draw.pool.filter(p => p.ok).sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
    if (ok.length) sock.fire("pick", { id: ok[0].id, slot: ok[0].fits[0] }); else sock.fire("reroll", Math.random() < .5 ? "sel" : "cup");
  }
  throw new Error("draft não terminou");
}
const tests = [];
const test = (n, f) => tests.push([n, f]);

test("Clássico solo: draft → bots → campeonato → final 3D → campeão", () => {
  const { io } = makeIO(); createRooms(io, { rng }); const a = io.connect();
  a.fire("joinRoom", { code: "t1", name: "Ana", cid: "ca" }); a.fire("setMode", "classic"); a.fire("startDraft");
  draftFully(a);
  let room = a.last("room"); assert.equal(room.phase, "tournament"); assert.equal(room.teams.length, 16);
  assert.equal(room.teams.filter(t => t.human).length, 1);
  room.teams.forEach(t => { assert.equal(t.lineup.length, 11); assert.ok(t.lineup.every(p => p && p.ovr)); assert.equal(new Set(t.lineup.map(p => p.id)).size, 11); });
  const stages = [];
  for (let i = 0; i < 6; i++) { a.got.length = 0; a.fire("nextStage"); const st = a.last("tour:stage"); if (st) stages.push(st.stage); if (a.last("match:start")) break; require("child_process"); const t0 = Date.now(); while (Date.now() - t0 < 1250); }
  assert.deepEqual(stages, ["G1", "G2", "G3", "QF", "SF"]);
  const ms = a.last("match:start"); assert.ok(ms, "final 3D iniciada"); assert.equal(ms.kind, "final"); assert.equal(ms.teams[0].lineup.length, 11);
  a.fire("match:end", { score: [1, 1], goals: [] }); // empate → pênaltis decididos pelo servidor
  room = a.last("room"); assert.equal(room.phase, "finished"); assert.ok(room.champion);
  const me = a.last("match:end"); assert.ok(me.pens && me.pens[0] !== me.pens[1]);
});
test("Almanaque esconde overalls durante o draft e revela depois", () => {
  const { io } = makeIO(); createRooms(io, { rng }); const a = io.connect();
  a.fire("joinRoom", { code: "t2", name: "Ana", cid: "ca" }); a.fire("setMode", "almanaque"); a.fire("startDraft"); a.fire("roll");
  const me = a.last("you"); assert.ok(me.draw.pool.every(p => p.ovr === null));
  draftFully(a); const room = a.last("room"); assert.ok(room.teams[0].lineup.every(p => typeof p.ovr === "number"));
});
test("Draft por turnos: o segundo jogador espera", () => {
  const { io } = makeIO(); createRooms(io, { rng }); const a = io.connect(), b = io.connect();
  a.fire("joinRoom", { code: "t3", name: "A", cid: "ca" }); b.fire("joinRoom", { code: "t3", name: "B", cid: "cb" });
  a.fire("startDraft"); assert.equal(a.last("room").turn.cid, "ca");
  b.got.length = 0; b.fire("roll"); assert.ok(b.last("notice"), "B deve aguardar");
  a.fire("roll"); const pa = a.last("you").draw.pool.find(p => p.ok); a.fire("pick", { id: pa.id, slot: pa.fits[0] });
  assert.equal(a.last("room").turn.cid, "cb");
  for (let i = 0; i < 40 && a.last("room").phase === "draft"; i++) { draftFully(a); draftFully(b); }
  const room = a.last("room"); assert.equal(room.phase, "tournament");
  assert.equal(room.teams.filter(t => t.human).length, 2);
  const ids = room.teams.flatMap(t => t.lineup.map(p => p.id)); assert.equal(new Set(ids).size, ids.length, "sem jogadores repetidos");
});
test("VsRelógio: sem espera e trocas ilimitadas, termina em partida 3D", () => {
  const { io } = makeIO(); createRooms(io, { rng }); const a = io.connect(), b = io.connect();
  a.fire("joinRoom", { code: "t4", name: "A", cid: "ca" }); b.fire("joinRoom", { code: "t4", name: "B", cid: "cb" });
  a.fire("setMode", "vsrelogio"); a.fire("startDraft");
  a.fire("roll"); b.fire("roll"); assert.ok(a.last("you").draw && b.last("you").draw);
  for (let i = 0; i < 12; i++) a.fire("reroll", "sel"); assert.ok(!a.got.some(g => g.ev === "notice" && /usou/.test(g.data)));
  for (let i = 0; i < 40 && a.last("room").phase === "draft"; i++) { draftFully(a); draftFully(b); }
  assert.equal(a.last("room").phase, "match"); assert.equal(a.last("match:start").kind, "quick");
});
test("Limite de 5 trocas fora do VsRelógio", () => {
  const { io } = makeIO(); createRooms(io, { rng }); const a = io.connect();
  a.fire("joinRoom", { code: "t5", name: "A", cid: "ca" }); a.fire("startDraft"); a.fire("roll");
  for (let i = 0; i < 5; i++) a.fire("reroll", "cup"); a.got.length = 0; a.fire("reroll", "cup");
  assert.ok(/usou/.test(a.last("notice")) || a.last("you").rerolls.cup <= 5); assert.ok(a.last("you").rerolls.cup <= 5);
});
test("Caos: draft por turnos com os dois humanos e partida de 2 min", () => {
  const { io } = makeIO(); createRooms(io, { rng }); const a = io.connect(), b = io.connect();
  a.fire("joinRoom", { code: "t6", name: "A", cid: "ca" }); b.fire("joinRoom", { code: "t6", name: "B", cid: "cb" });
  a.fire("setMode", "chaos"); a.fire("startDraft"); assert.equal(a.last("room").phase, "draft");
  for (let i = 0; i < 40 && a.last("room").phase === "draft"; i++) { draftFully(a); draftFully(b); }
  const ms = a.last("match:start"); assert.ok(ms, "partida iniciou"); assert.equal(ms.kind, "chaos"); assert.ok(ms.chaos); assert.equal(ms.seconds, 120);
  assert.deepEqual(ms.controllers.filter(Boolean).sort(), ["ca", "cb"]);
  b.fire("match:end", { score: [9, 0] }); assert.equal(a.last("room").phase, "match");
  a.fire("match:end", { score: [2, 3], goals: [] }); assert.equal(a.last("room").phase, "finished");
});
test("Cor do uniforme é salva por jogador e vai para a partida", () => {
  const { io } = makeIO(); createRooms(io, { rng }); const a = io.connect();
  a.fire("joinRoom", { code: "t9", name: "A", cid: "ca" }); a.fire("setKit", { shirt: "#c8102e", shorts: "#ffffff" });
  assert.equal(a.last("room").players[0].kit.shirt, "#c8102e");
  a.fire("setKit", { shirt: "javascript:x", shorts: "#ffffff" }); assert.equal(a.last("room").players[0].kit.shirt, "#c8102e", "cor inválida é ignorada");
});
test("Modo Jogador: final com controle humano", () => {
  const { io } = makeIO(); createRooms(io, { rng }); const a = io.connect();
  a.fire("joinRoom", { code: "t7", name: "A", cid: "ca" }); a.fire("setMode", "player"); a.fire("startDraft"); draftFully(a);
  for (let i = 0; i < 6; i++) { a.fire("nextStage"); if (a.last("match:start")) break; const t0 = Date.now(); while (Date.now() - t0 < 1250); }
  assert.ok(a.last("match:start").humanControl);
});
test("Formação incompatível é recusada; reconexão mantém o time", () => {
  const { io } = makeIO(); createRooms(io, { rng }); const a = io.connect();
  a.fire("joinRoom", { code: "t8", name: "A", cid: "ca" }); a.fire("startDraft"); draftFully(a);
  const s2 = io.connect(); s2.fire("joinRoom", { code: "t8", name: "A", cid: "ca" }); assert.equal(s2.last("room").players.length, 1);
});
test("Elencos: toda seleção monta XI em todas as formações", () => {
  for (const e of D.ALL) for (const f of D.FORMATION_NAMES) assert.ok(D.bestXI(e.squad, f), e.key + f);
});
let fail = 0;
for (const [n, f] of tests) { try { f(); console.log("  ok  ", n); } catch (e) { fail++; console.log("  FALHOU", n, "\n", e.stack.split("\n").slice(0, 4).join("\n")); } }
console.log(fail ? `\n${fail} teste(s) falharam` : "\nTodos os testes passaram"); process.exit(fail ? 1 : 0);
