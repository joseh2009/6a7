"use strict";
// Salas, draft por turnos, campeonato e partidas 3D. Independente de Express: recebe o `io` do Socket.IO.
const D = require("./data");
const { Tournament } = require("./tournament");
const { simulateMatch, penalties } = require("./sim");

const MODES = ["classic", "almanaque", "chaos", "vsrelogio", "player"];
const TOURNAMENT_MODES = ["classic", "almanaque", "player"];
const MAX_PLAYERS = 16, TURN_SECONDS = 60, MAX_REROLLS = 5, MATCH_SECONDS = 120;
const clean = (s, n) => String(s == null ? "" : s).replace(/[<>]/g, "").trim().slice(0, n);
const sanitizeCode = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

function createRooms(io, opts = {}) {
  const rooms = new Map(), now = opts.now || (() => Date.now());
  const rng = opts.rng || (() => Math.random());
  const emitRoom = (room, ev, data) => io.to(room.code).emit(ev, data);
  const emitTo = (sid, ev, data) => { if (sid) io.to(sid).emit(ev, data); };

  function newRoom(code) {
    const room = { code, mode: "classic", phase: "lobby", players: new Map(), teams: [], tournament: null, match: null, turn: null, timers: {}, createdAt: now(), champion: null, lastAdvance: 0, log: [] };
    rooms.set(code, room); return room;
  }
  const humans = room => [...room.players.values()].filter(p => p.role === "player");
  const connected = room => [...room.players.values()].filter(p => p.connected);
  function hostOf(room) { const c = connected(room); return c.find(p => p.role === "player") || c[0] || null; }
  const tournamentMode = room => TOURNAMENT_MODES.includes(room.mode);
  const hideOvr = room => room.mode === "almanaque" && room.phase === "draft";

  // ---------- estado público / privado ----------
  function publicTeam(t, hide) {
    return { id: t.id, name: t.name, sel: t.sel, copa: t.copa, meme: !!t.meme, kit: t.kit || null, human: t.human || null, owner: t.owner || null, formation: t.formation, style: t.style,
      ovr: hide ? null : Math.round(t.ratings.ovr), lineup: t.lineup.map(p => ({ ...D.publicPlayer(p, hide), slot: p.slot })) };
  }
  function publicRoom(room) {
    const host = hostOf(room);
    return {
      code: room.code, mode: room.mode, phase: room.phase, hostCid: host ? host.cid : null,
      players: [...room.players.values()].map(p => ({ cid: p.cid, name: p.name, connected: p.connected, role: p.role, count: p.d ? p.d.picks.length : 0, teamId: p.teamId || null, kit: p.kit || null })),
      turn: room.turn ? { cid: room.turn.cid, deadline: room.turn.deadline } : null,
      teams: room.phase === "draft" ? [] : room.teams.map(t => publicTeam(t, false)),
      tournament: room.tournament ? room.tournament.snapshot() : null,
      match: room.match ? { kind: room.match.kind, teams: room.match.teams.map(t => t.id), score: room.match.score, ended: room.match.ended, seconds: room.match.seconds, controllers: room.match.controllers } : null,
      champion: room.champion
    };
  }
  function privateState(room, p) {
    if (!p.d) return { cid: p.cid, role: p.role };
    const d = p.d, hide = hideOvr(room);
    const lineup = D.lineupFromSlots(d.slots, d.formation);
    const taken = takenIds(room);
    let draw = null;
    if (d.draw) draw = { key: d.draw.key, name: d.draw.name, sel: d.draw.sel, copa: d.draw.copa, meme: d.draw.meme,
      pool: d.draw.squad.map(pl => { const fits = D.fitsList(d.slots, d.formation, pl); return { ...D.publicPlayer(pl, hide), fits, ok: !taken.has(pl.id) && fits.length > 0 }; }) };
    return { cid: p.cid, role: p.role, formation: d.formation, style: d.style, rerolls: d.rerolls, unlimited: room.mode === "vsrelogio", draw,
      lineup: lineup.map(pl => pl ? { ...D.publicPlayer(pl, hide), slot: pl.slot } : null), picks: d.picks.length, myTurn: myTurn(room, p) };
  }
  function broadcast(room) {
    emitRoom(room, "room", publicRoom(room));
    for (const p of room.players.values()) if (p.connected) emitTo(p.sid, "you", privateState(room, p));
  }
  const notice = (p, msg) => p && emitTo(p.sid, "notice", msg);
  const takenIds = room => { const s = new Set(); for (const p of room.players.values()) if (p.d) p.d.picks.forEach(x => s.add(x.id)); return s; };
  const draftUnlimited = room => room.mode === "vsrelogio";
  const myTurn = (room, p) => room.phase === "draft" && (draftUnlimited(room) || (room.turn && room.turn.cid === p.cid));

  // ---------- fluxo de seleção (draft) ----------
  function newDraft() { return { picks: [], slots: new Array(11).fill(null), formation: "4-3-3", style: "balanced", draw: null, rerolls: { sel: 0, cup: 0 }, usedKeys: new Set() }; }
  function clearTimers(room) { Object.values(room.timers).forEach(t => clearTimeout(t)); room.timers = {}; }

  function startDraft(room) {
    clearTimers(room);
    const act = humans(room);
    room.phase = "draft"; room.teams = []; room.tournament = null; room.match = null; room.champion = null;
    for (const p of act) { const old = p.d; p.d = newDraft(); if (old) { p.d.formation = old.formation; p.d.style = old.style; } }
    room.turn = null; if (!draftUnlimited(room)) nextTurn(room, -1);
    broadcast(room);
  }
  function nextTurn(room, fromIdx) {
    clearTimeout(room.timers.turn);
    const act = humans(room); if (!act.length) { room.turn = null; return; }
    for (let k = 1; k <= act.length; k++) {
      const p = act[(fromIdx + k + act.length * 2) % act.length];
      if (p.d.picks.length < 11) {
        room.turn = { cid: p.cid, deadline: now() + TURN_SECONDS * 1000 };
        room.timers.turn = setTimeout(() => autoplay(room, p), TURN_SECONDS * 1000 + 50);
        if (!p.connected) autoplaySoon(room, p);
        return;
      }
    }
    room.turn = null;
  }
  function autoplaySoon(room, p) { clearTimeout(room.timers.turn); room.timers.turn = setTimeout(() => autoplay(room, p), 400); }
  // Jogada automática (tempo esgotado ou jogador desconectado): sorteia e escolhe o melhor encaixe.
  function autoplay(room, p) {
    if (room.phase !== "draft" || !p.d || p.d.picks.length >= 11) return;
    if (!draftUnlimited(room) && (!room.turn || room.turn.cid !== p.cid)) return;
    if (!p.d.draw && !doRoll(room, p, true)) return;
    const taken = takenIds(room), cands = p.d.draw.squad.filter(x => !taken.has(x.id) && D.fitsList(p.d.slots, p.d.formation, x).length > 0).sort((a, b) => b.ovr - a.ovr);
    if (!cands.length) { if (!doReroll(room, p, "sel", true)) return doRollAgain(room, p); return autoplay(room, p); }
    doPick(room, p, cands[0].id, true);
  }
  function doRollAgain(room, p) { p.d.draw = null; autoplay(room, p); }

  function drawHasOption(room, p, entry) {
    const taken = takenIds(room); return entry.squad.some(x => !taken.has(x.id) && D.fitsList(p.d.slots, p.d.formation, x).length > 0);
  }
  function setDraw(room, p, entry) {
    p.d.draw = { key: entry.key, name: entry.name, sel: entry.sel, copa: entry.copa, meme: entry.meme, squad: entry.squad }; p.d.usedKeys.add(entry.key);
  }
  function doRoll(room, p, silent) {
    const d = p.d; if (d.draw || d.picks.length >= 11) return false;
    const used = d.usedKeys;
    for (let i = 0; i < 60; i++) {
      const e = D.rollDraw(rng, { exclude: used, ignoreExclude: draftUnlimited(room) });
      if (e && drawHasOption(room, p, e)) { setDraw(room, p, e); return true; }
    }
    if (!silent) notice(p, "Não encontrei um elenco compatível com a sua formação. Tente de novo."); return false;
  }
  function doReroll(room, p, kind, silent) {
    const d = p.d; if (!d.draw) return false;
    if (!draftUnlimited(room) && d.rerolls[kind] >= MAX_REROLLS) { if (!silent) notice(p, `Você já usou as ${MAX_REROLLS} trocas de ${kind === "sel" ? "seleção" : "Copa"}.`); return false; }
    for (let i = 0; i < 40; i++) {
      const e = kind === "sel" ? D.rollDraw(rng, { keepCopa: d.draw.copa, memeChance: 0, exclude: d.usedKeys, ignoreExclude: draftUnlimited(room) })
        : D.rollDraw(rng, { keepSel: d.draw.sel, memeChance: 0, exclude: d.usedKeys, ignoreExclude: draftUnlimited(room) });
      if (!e || e.key === d.draw.key) continue;
      if (drawHasOption(room, p, e)) { if (!draftUnlimited(room)) d.rerolls[kind]++; setDraw(room, p, e); return true; }
    }
    if (!silent) notice(p, kind === "sel" ? "Não há outra seleção disponível nesta Copa." : "Não há outra Copa disponível para esta seleção."); return false;
  }
  function doPick(room, p, id, auto, slotIdx) {
    const d = p.d, taken = takenIds(room);
    if (!d.draw) return notice(p, "Role o sorteio primeiro.");
    const pl = d.draw.squad.find(x => x.id === id);
    if (!pl) return notice(p, "Jogador inválido.");
    if (taken.has(pl.id)) return notice(p, "Esse jogador já foi escolhido.");
    const idx = slotIdx == null ? D.bestSlot(d.slots, d.formation, pl) : slotIdx;
    const f = D.FORMATIONS[d.formation];
    if (!Number.isInteger(idx) || idx < 0 || idx > 10 || d.slots[idx]) return notice(p, "Essa posição já está ocupada ou não existe.");
    if (D.fitCost(pl, f[idx][0]) === Infinity) return notice(p, `${pl.name} não joga como ${f[idx][0]}.`);
    d.slots[idx] = pl;
    d.picks.push(pl); d.draw = null;
    if (!draftUnlimited(room)) { const act = humans(room); nextTurn(room, act.indexOf(p)); }
    if (humans(room).every(h => h.d.picks.length >= 11)) return finishDraft(room);
    broadcast(room);
  }

  // ---------- criação de times ----------
  let teamSeq = 0;
  function humanTeam(p) {
    const lineup = D.lineupFromSlots(p.d.slots, p.d.formation);
    const t = { id: "H" + p.cid.slice(0, 6) + (++teamSeq), name: p.name, sel: "HUM", copa: null, human: p.cid, owner: p.name, formation: p.d.formation, style: p.d.style, lineup, meme: false, kit: p.kit || null };
    t.ratings = D.teamRatings(lineup, t); p.teamId = t.id; return t;
  }
  function botTeam(usedKeys, opts = {}) {
    for (let i = 0; i < 80; i++) {
      const e = D.NATIONAL[Math.floor(rng() * D.NATIONAL.length)];
      if (usedKeys.has(e.key)) continue;
      const forms = ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "4-5-1"], f = forms[Math.floor(rng() * forms.length)], lineup = D.bestXI(e.squad, f);
      if (!lineup) continue;
      usedKeys.add(e.key);
      const t = { id: "B" + (++teamSeq), name: e.name, sel: e.sel, copa: e.copa, human: null, owner: null, formation: f, style: ["balanced", "offensive", "defensive"][Math.floor(rng() * 3)], lineup, meme: e.meme };
      t.ratings = D.teamRatings(lineup, t); return t;
    }
    throw new Error("sem elencos para bots");
  }
  // Modo jogador "meio roubado": com 2+ humanos, 70% chance de os humanos se enfrentarem na final;
  // 30% chance de um bot chegar à final contra um único humano. Exclusivo do modo jogador.
  function buildPlayerRig(room, rng) {
    if (room.mode !== "player") return null;
    const ids = room.teams.filter(t => t.human).map(t => t.id);
    if (ids.length < 2) return null;
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    if (rng() < 0.7) return { mode: "humans", finalists: [ids[0], ids[1]], humanIds: ids };
    return { mode: "bot", finalists: [ids[0]], humanIds: ids };
  }
  function finishDraft(room) {
    clearTimeout(room.timers.turn); room.turn = null;
    const act = humans(room), used = new Set();
    for (const p of act) p.d.picks.forEach(x => used.add(x.key));
    room.teams = act.map(humanTeam);
    if (tournamentMode(room)) {
      while (room.teams.length < 16) room.teams.push(botTeam(used));
      room.teams = require("./tournament").shuffle(room.teams, rng);
      room.rig = buildPlayerRig(room, rng);
      room.tournament = new Tournament(room.teams, rng, { rig: room.rig }); room.phase = "tournament";
      broadcast(room);
    } else { // vsrelogio: 1 contra 1 (ou contra bot)
      if (room.teams.length < 2) room.teams.push(botTeam(used));
      room.teams = room.teams.slice(0, 2);
      startMatch(room, room.mode === "chaos" ? { kind: "chaos", teams: room.teams, seconds: MATCH_SECONDS, chaos: true } : { kind: "quick", teams: room.teams, seconds: MATCH_SECONDS, chaos: false });
    }
  }
  // ---------- campeonato ----------
  function advanceTournament(room, p) {
    if (room.phase !== "tournament" || !room.tournament) return;
    if (!p || p.role !== "player") return;
    if (now() - room.lastAdvance < 1200) return; room.lastAdvance = now();
    const t = room.tournament, out = t.advance(); if (!out) return;
    if (out.stage === "F") {
      const [a, b] = [t.byId.get(t.final.a), t.byId.get(t.final.b)];
      return startMatch(room, { kind: "final", teams: [a, b], seconds: MATCH_SECONDS, chaos: false, humanControl: room.mode === "player" });
    }
    emitRoom(room, "tour:stage", { stage: out.stage, name: out.name, matches: out.matches });
    broadcast(room);
  }

  // ---------- partida 3D (host-autoritativa) ----------
  function matchPayload(room) {
    const m = room.match;
    return { kind: m.kind, seconds: m.seconds, chaos: m.chaos, humanControl: m.humanControl, controllers: m.controllers, seed: m.seed,
      teams: m.teams.map(t => ({ id: t.id, name: t.name, sel: t.sel, copa: t.copa, formation: t.formation, style: t.style, human: t.human, kit: t.kit || null,
        lineup: t.lineup.map((p, i) => ({ id: p.id, name: p.name, slot: p.slot, ovr: p.ovr, stats: D.playerStats(p), fx: p.fx, legend: p.legend, num: p.num, hx: D.FORMATIONS[t.formation][i][1], hy: D.FORMATIONS[t.formation][i][2] })) })) };
  }
  function startMatch(room, cfg) {
    clearTimers(room);
    const controllers = cfg.teams.map(t => cfg.humanControl || cfg.chaos ? (t.human || null) : null);
    room.phase = "match";
    room.match = { kind: cfg.kind, teams: cfg.teams, seconds: cfg.seconds, chaos: !!cfg.chaos, humanControl: !!cfg.humanControl, controllers, score: [0, 0], goals: [], ended: false, seed: Math.floor(rng() * 1e9), startedAt: now() };
    // Só assume a partida se o anfitrião sumir. Nada de limite de tempo de parede: celulares em segundo plano
    // reduzem a taxa de quadros, e a partida precisa seguir o tempo do jogo, não o relógio.
    room.match.hostCid = (hostOf(room) || {}).cid;
    const armWatchdog = () => { room.timers.watchdog = setTimeout(() => { if (!room.match || room.match.ended) return; const h = room.players.get(room.match.hostCid); if (h && h.connected) armWatchdog(); else resolveFallback(room); }, 15000); };
    armWatchdog();
    broadcast(room); emitRoom(room, "match:start", matchPayload(room));
  }
  function resolveFallback(room) { // o anfitrião sumiu: resolve com o simulador estatístico
    if (!room.match || room.match.ended) return;
    const m = room.match, r = simulateMatch(m.teams[0], m.teams[1], rng, { knockout: m.kind === "final" });
    endMatch(room, { score: r.score, goals: r.goals, pens: r.pens }, true);
  }
  function endMatch(room, res, forced) {
    const m = room.match; if (!m || m.ended) return;
    clearTimeout(room.timers.watchdog);
    let score = [Math.max(0, Math.min(40, res.score[0] | 0)), Math.max(0, Math.min(40, res.score[1] | 0))], pens = null;
    if (m.kind === "final" && score[0] === score[1]) pens = res.pens && res.pens.length === 2 && res.pens[0] !== res.pens[1] ? [res.pens[0] | 0, res.pens[1] | 0] : penalties(m.teams[0], m.teams[1], rng);
    m.ended = true; m.score = score; m.pens = pens; m.goals = (res.goals || []).slice(0, 80);
    const winner = score[0] !== score[1] ? (score[0] > score[1] ? 0 : 1) : pens ? (pens[0] > pens[1] ? 0 : 1) : null;
    if (m.kind === "final" && room.tournament) { room.tournament.setFinal(score, m.goals, pens, winner); room.champion = room.tournament.champion; }
    room.phase = m.kind === "final" ? "finished" : "finished";
    emitRoom(room, "match:end", { score, pens, goals: m.goals, winner, forced: !!forced, kind: m.kind });
    broadcast(room);
  }

  function reset(room) {
    clearTimers(room);
    for (const [cid, p] of room.players) { if (!p.connected) room.players.delete(cid); else { p.d = null; p.teamId = null; } }
    room.phase = "lobby"; room.teams = []; room.tournament = null; room.match = null; room.turn = null; room.champion = null;
    assignRoles(room); broadcast(room);
  }
  function assignRoles(room) {
    const limit = tournamentMode(room) ? MAX_PLAYERS : 2; let n = 0;
    for (const p of room.players.values()) p.role = n++ < limit ? "player" : "spec";
  }

  // ---------- conexões ----------
  io.on("connection", socket => {
    const withRoom = fn => (...a) => { try { const room = rooms.get(socket.data.room), p = room && room.players.get(socket.data.cid); if (room && p) fn(room, p, ...a); } catch (e) { console.error("[6a7]", e); } };

    socket.on("joinRoom", ({ code, name, cid } = {}) => {
      code = sanitizeCode(code); name = clean(name, 18) || "Jogador"; cid = clean(cid, 40) || Math.random().toString(36).slice(2, 12);
      if (!code) return socket.emit("notice", "Digite um código de sala.");
      const prev = rooms.get(socket.data.room); if (prev && prev.code !== code) leave(socket);
      let room = rooms.get(code) || newRoom(code), p = room.players.get(cid);
      if (!p) {
        if (room.players.size >= MAX_PLAYERS + 8) return socket.emit("notice", "Sala cheia.");
        if (room.phase !== "lobby") { // entra como espectador em partidas em andamento
          p = { cid, sid: socket.id, name, connected: true, role: "spec", d: null }; room.players.set(cid, p);
        } else { p = { cid, sid: socket.id, name, connected: true, role: "player", d: null }; room.players.set(cid, p); assignRoles(room); }
      } else { p.sid = socket.id; p.connected = true; if (name && room.phase === "lobby") p.name = name; if (room.turn && room.turn.cid === cid) { clearTimeout(room.timers.turn); room.timers.turn = setTimeout(() => autoplay(room, p), Math.max(1000, room.turn.deadline - now())); } }
      socket.join(code); socket.data.room = code; socket.data.cid = cid;
      socket.emit("joined", { code, cid, spectator: p.role === "spec" && room.phase !== "lobby", formations: D.FORMATIONS });
      broadcast(room);
      if (room.phase === "match" && room.match && !room.match.ended) socket.emit("match:start", matchPayload(room));
    });
    socket.on("setMode", withRoom((room, p, mode) => { if (room.phase !== "lobby" || p.cid !== (hostOf(room) || {}).cid || !MODES.includes(mode)) return; room.mode = mode; assignRoles(room); broadcast(room); }));
    socket.on("setKit", withRoom((room, p, k) => {
    if (room.phase !== "lobby" || !k) return;
    const ok = c => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
    if (ok(k.shirt) && ok(k.shorts)) { p.kit = { shirt: k.shirt, shorts: k.shorts }; broadcast(room); }
  }));
  socket.on("setName", withRoom((room, p, name) => { if (room.phase === "lobby") { p.name = clean(name, 18) || p.name; broadcast(room); } }));
    socket.on("startDraft", withRoom((room, p) => { if (room.phase !== "lobby" || p.cid !== (hostOf(room) || {}).cid) return; if (p.role !== "player") return; startDraft(room); }));
    socket.on("setTactics", withRoom((room, p, t = {}) => {
      if (p.role !== "player" || room.phase === "match" || room.phase === "tournament" || room.phase === "finished") return;
      if (!p.d) p.d = newDraft();
      if (D.STYLES.includes(t.style)) p.d.style = t.style;
      if (D.FORMATIONS[t.formation] && t.formation !== p.d.formation) {
        const a = D.assign(p.d.picks, t.formation);
        if (!a.ok) notice(p, "Essa formação não comporta os jogadores que você já escolheu.");
        else { const slots = new Array(11).fill(null); p.d.picks.forEach((pl, i) => { slots[a.slotOf[i]] = pl; }); p.d.slots = slots; p.d.formation = t.formation; }
      }
      if (room.phase === "draft") broadcast(room); else emitTo(p.sid, "you", privateState(room, p));
    }));
    socket.on("roll", withRoom((room, p) => {
      if (room.phase !== "draft" || p.role !== "player" || !p.d) return;
      if (!myTurn(room, p)) return notice(p, "Aguarde a sua vez de escolher.");
      if (p.d.picks.length >= 11) return notice(p, "Seu time já está completo.");
      if (p.d.draw) return notice(p, "Escolha um jogador ou troque a seleção/Copa."); doRoll(room, p); broadcast(room);
    }));
    socket.on("reroll", withRoom((room, p, kind) => {
      if (room.phase !== "draft" || p.role !== "player" || !p.d || !myTurn(room, p) || !["sel", "cup"].includes(kind)) return;
      doReroll(room, p, kind); broadcast(room);
    }));
    socket.on("pick", withRoom((room, p, id) => {
      if (room.phase !== "draft" || p.role !== "player" || !p.d || !myTurn(room, p)) return;
      if (p.d.picks.length >= 11) return; const pid = id && typeof id === "object" ? String(id.id) : String(id), pslot = id && typeof id === "object" && id.slot != null ? Number(id.slot) : null; doPick(room, p, pid, false, pslot);
    }));
    socket.on("nextStage", withRoom((room, p) => advanceTournament(room, p)));
    socket.on("playAgain", withRoom((room, p) => { if (room.phase === "finished" && p.cid === (hostOf(room) || {}).cid) reset(room); }));
    // Partida 3D: o anfitrião simula e transmite; os demais renderizam e enviam comandos.
    socket.on("match:snap", withRoom((room, p, snap) => { if (room.phase === "match" && room.match && p.cid === hostOf(room).cid) socket.to(room.code).volatile.emit("match:snap", snap); }));
    socket.on("match:event", withRoom((room, p, ev) => { if (room.phase === "match" && room.match && p.cid === hostOf(room).cid) { if (ev && Array.isArray(ev.score)) room.match.score = ev.score.map(n => n | 0); socket.to(room.code).emit("match:event", ev); } }));
    socket.on("dev:cmd", withRoom((room, p, cmd) => { const h = hostOf(room); if (room.match && !room.match.ended && h && cmd && typeof cmd === "object") emitTo(h.sid, "dev:apply", { op: String(cmd.op || "").slice(0, 20), name: cmd.name, on: !!cmd.on, v: cmd.v, s: cmd.s, team: cmd.team }); }));
    socket.on("match:input", withRoom((room, p, inp) => { const h = hostOf(room); if (room.match && h && h.cid !== p.cid) emitTo(h.sid, "match:input", { cid: p.cid, teamId: p.teamId, input: inp }); }));
    socket.on("match:end", withRoom((room, p, res) => { if (room.phase === "match" && room.match && !room.match.ended && p.cid === hostOf(room).cid && res && Array.isArray(res.score)) endMatch(room, res); }));
    socket.on("disconnect", () => leave(socket));
  });
  function leave(socket) {
    const room = rooms.get(socket.data.room), p = room && room.players.get(socket.data.cid);
    socket.leave && socket.leave(socket.data.room); socket.data.room = null;
    if (!room || !p || p.sid !== socket.id) return;
    p.connected = false;
    if (room.phase === "match" && room.match && !room.match.ended && p.role === "player") setTimeout(() => { const h = hostOf(room); if (room.match && !room.match.ended && (!h || !h.connected || h.cid === p.cid && !p.connected)) resolveFallback(room); }, 4000);
    if (room.phase === "lobby") { room.players.delete(p.cid); assignRoles(room); }
    else if (room.phase === "draft" && room.turn && room.turn.cid === p.cid) autoplaySoon(room, p);
    if (!connected(room).length) { clearTimers(room); rooms.delete(room.code); return; }
    broadcast(room);
  }
  return { rooms, _internals: { startDraft, publicRoom, privateState } };
}
module.exports = { createRooms, MODES };
