"use strict";
// Simulação estatística de partidas (fases do campeonato que não são em 3D).
const POS_W = { CA: 1, PE: .7, PD: .7, MEI: .5, ME: .35, MD: .35, VOL: .15, LE: .08, LD: .08, ZAG: .06, GOL: .004 };

function poisson(l, rng) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rng(); } while (p > L); return k - 1; }
function pickScorer(team, rng) {
  const w = team.lineup.map(p => Math.pow(Math.max(1, p.ovr - 40) / 50, 3) * (POS_W[p.slot] || .1));
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return team.lineup[i]; }
  return team.lineup[0];
}
function lambdas(a, b, factor = 1) {
  const ra = a.ratings, rb = b.ratings;
  const la = 1.12 * Math.exp((ra.att - rb.def + (ra.mid - rb.mid) * .35) / 26);
  const lb = 1.12 * Math.exp((rb.att - ra.def + (rb.mid - ra.mid) * .35) / 26);
  return [Math.min(4.8, Math.max(.25, la)) * factor, Math.min(4.8, Math.max(.25, lb)) * factor];
}
function penalties(a, b, rng) {
  const pa = Math.min(.9, Math.max(.6, .76 + (a.ratings.att - b.ratings.gk) / 400)), pb = Math.min(.9, Math.max(.6, .76 + (b.ratings.att - a.ratings.gk) / 400));
  let sa = 0, sb = 0;
  for (let i = 0; i < 5; i++) { if (rng() < pa) sa++; if (rng() < pb) sb++; }
  let guard = 0;
  while (sa === sb && guard++ < 30) { if (rng() < pa) sa++; if (rng() < pb) sb++; }
  if (sa === sb) sa++;
  return [sa, sb];
}
function simulateMatch(a, b, rng, { knockout = false } = {}) {
  const [la, lb] = lambdas(a, b), ga = poisson(la, rng), gb = poisson(lb, rng), goals = [];
  const add = (team, idx, min) => { const p = pickScorer(team, rng); goals.push({ team: idx, min, player: p.name, pid: p.id }); };
  for (let i = 0; i < ga; i++) add(a, 0, 1 + Math.floor(rng() * 90));
  for (let i = 0; i < gb; i++) add(b, 1, 1 + Math.floor(rng() * 90));
  let score = [ga, gb], extra = false, pens = null;
  if (knockout && ga === gb) {
    extra = true; const [xa, xb] = lambdas(a, b, .3), ea = poisson(xa, rng), eb = poisson(xb, rng);
    for (let i = 0; i < ea; i++) add(a, 0, 91 + Math.floor(rng() * 30));
    for (let i = 0; i < eb; i++) add(b, 1, 91 + Math.floor(rng() * 30));
    score = [ga + ea, gb + eb];
    if (score[0] === score[1]) pens = penalties(a, b, rng);
  }
  goals.sort((x, y) => x.min - y.min);
  let winner = null; if (score[0] !== score[1]) winner = score[0] > score[1] ? 0 : 1; else if (pens) winner = pens[0] > pens[1] ? 0 : 1;
  return { score, goals, extra, pens, winner };
}
module.exports = { simulateMatch, penalties, poisson };
