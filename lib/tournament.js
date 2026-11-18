"use strict";
// Campeonato de 16 seleções: 4 grupos (3 rodadas) → quartas → semifinais → final (3D).
const { simulateMatch } = require("./sim");

function shuffle(a, rng) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const STAGES = ["G1", "G2", "G3", "QF", "SF", "F"];
const STAGE_NAMES = { G1: "Fase de grupos · Rodada 1", G2: "Fase de grupos · Rodada 2", G3: "Fase de grupos · Rodada 3", QF: "Quartas de final", SF: "Semifinais", F: "Grande final" };
const ROUNDS = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];

class Tournament {
  constructor(teams, rng, opts = {}) {
    if (teams.length !== 16) throw new Error("O campeonato precisa de 16 seleções");
    this.rng = rng; this.teams = teams; this.byId = new Map(teams.map(t => [t.id, t]));
    let order = shuffle(teams.map(t => t.id), rng);
    // Modo jogador (rig): os finalistas humanos são colocados em grupos de metades opostas do chaveamento.
    this.rig = opts.rig && opts.rig.finalists && opts.rig.finalists.length ? opts.rig : null;
    if (this.rig) {
      const fins = this.rig.finalists.filter(id => order.includes(id));
      order = order.filter(id => !fins.includes(id));
      const slots = [0, 8]; // A1 (metade 1) e C1 (metade 2)
      fins.forEach((id, i) => order.splice(slots[i], 0, id));
    }
    this.groups = [0, 1, 2, 3].map(g => ({ name: "ABCD"[g], ids: order.slice(g * 4, g * 4 + 4) }));
    this.stageIndex = -1; this.results = {}; this.champion = null; this.final = null; this.qualified = [];
  }
  get stage() { return STAGES[this.stageIndex] || null; }
  get nextStageKey() { return STAGES[this.stageIndex + 1] || null; }
  get done() { return !!this.champion; }
  _sim(aId, bId, knockout) {
    const ta = this.byId.get(aId), tb = this.byId.get(bId);
    if (!this.rig) return { a: aId, b: bId, ...simulateMatch(ta, tb, this.rng, { knockout }) };
    // Regra do rig: finalista sempre vence; humano não-finalista é eliminado por bot.
    const fin = this.rig.finalists, humans = this.rig.humanIds || [];
    let want = null;
    if (fin.includes(aId)) want = 0; else if (fin.includes(bId)) want = 1;
    else if (humans.includes(aId) && !humans.includes(bId)) want = 1;
    else if (humans.includes(bId) && !humans.includes(aId)) want = 0;
    let res = simulateMatch(ta, tb, this.rng, { knockout });
    if (want !== null) {
      const ok = r => knockout ? r.winner === want : (want === 0 ? r.score[0] > r.score[1] : r.score[1] > r.score[0]);
      for (let i = 0; i < 400 && !ok(res); i++) res = simulateMatch(ta, tb, this.rng, { knockout });
    }
    return { a: aId, b: bId, ...res };
  }
  standings() {
    return this.groups.map(g => {
      const rows = g.ids.map(id => ({ id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
      const row = id => rows.find(r => r.id === id);
      for (const s of ["G1", "G2", "G3"]) for (const m of (this.results[s] || [])) {
        if (!g.ids.includes(m.a)) continue;
        const A = row(m.a), B = row(m.b); A.p++; B.p++; A.gf += m.score[0]; A.ga += m.score[1]; B.gf += m.score[1]; B.ga += m.score[0];
        if (m.score[0] > m.score[1]) { A.w++; A.pts += 3; B.l++; } else if (m.score[0] < m.score[1]) { B.w++; B.pts += 3; A.l++; } else { A.d++; B.d++; A.pts++; B.pts++; }
      }
      rows.forEach(r => { r.gd = r.gf - r.ga; r.tb = this.byId.get(r.id).ratings.ovr; });
      rows.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || y.tb - x.tb);
      return { name: g.name, rows };
    });
  }
  // Gera a próxima fase. A final não é simulada: é jogada em 3D e informada por setFinal().
  advance() {
    const key = this.nextStageKey; if (!key) return null;
    this.stageIndex++;
    let matches = [];
    if (key[0] === "G") {
      const r = Number(key[1]) - 1;
      this.groups.forEach(g => ROUNDS[r].forEach(([i, j]) => matches.push({ ...this._sim(g.ids[i], g.ids[j], false), group: g.name })));
      this.results[key] = matches;
      if (key === "G3") this.qualified = this.standings().map(s => [s.rows[0].id, s.rows[1].id]);
      return this._out(key, matches);
    }
    if (key === "QF") {
      const q = this.qualified; // A1-B2, B1-A2, C1-D2, D1-C2
      matches = [[q[0][0], q[1][1]], [q[1][0], q[0][1]], [q[2][0], q[3][1]], [q[3][0], q[2][1]]].map(([a, b]) => this._sim(a, b, true));
    } else if (key === "SF") {
      const w = this.results.QF.map(m => m.winner === 0 ? m.a : m.b);
      matches = [[w[0], w[1]], [w[2], w[3]]].map(([a, b]) => this._sim(a, b, true));
    } else if (key === "F") {
      const w = this.results.SF.map(m => m.winner === 0 ? m.a : m.b);
      this.final = { a: w[0], b: w[1], score: null, winner: null };
      this.results.F = [this.final]; return this._out(key, [this.final]);
    }
    this.results[key] = matches; return this._out(key, matches);
  }
  _out(key, matches) { return { stage: key, name: STAGE_NAMES[key], matches }; }
  setFinal(score, goals, pens, winnerIdx) {
    Object.assign(this.final, { score, goals, pens, winner: winnerIdx });
    this.champion = winnerIdx === 0 ? this.final.a : this.final.b; return this.champion;
  }
  snapshot() {
    return { stageIndex: this.stageIndex, stage: this.stage, next: this.nextStageKey, stageNames: STAGE_NAMES, groups: this.groups,
      standings: this.stageIndex >= 0 ? this.standings() : null, results: this.results, champion: this.champion, qualified: this.qualified, done: this.done };
  }
}
module.exports = { Tournament, STAGES, STAGE_NAMES, shuffle };
