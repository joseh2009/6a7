"use strict";
// Pênaltis da final em 3D. O servidor decide a sequência inteira de cobranças (todos veem o mesmo resultado);
// o cliente só anima. Cada time tem 5 cobradores (escolhidos pelo jogador ou automáticos) e depois morte súbita.
const SIDES = ["L", "C", "R"];
const OUTFIELD = p => p.pos !== "GOL";

// Os 5 melhores de linha, por overall (usado para bots e quando o jogador não escolhe).
function defaultKickers(team, n = 5) {
  return team.lineup.filter(OUTFIELD).sort((a, b) => b.ovr - a.ovr).slice(0, n).map(p => p.id);
}
const keeperOf = team => team.lineup.find(p => p.pos === "GOL") || { ovr: 60 };

// Uma cobrança: o cobrador escolhe um lado, o goleiro se joga para um lado. Mesmo lado = defesa provável.
function kickOne(shooter, keeper, rng) {
  const target = SIDES[Math.floor(rng() * 3)], dive = SIDES[Math.floor(rng() * 3)];
  const skill = Math.max(-.15, Math.min(.15, (shooter.ovr - keeper.ovr) / 200));
  const goal = dive === target ? rng() < .35 - skill : rng() < .9 + skill / 2;
  return { target, dive, goal: !!goal };
}

// picksA/picksB: ids dos cobradores (ordem de cobrança). Sem escolha válida, usa os melhores.
function runShootout(A, B, picksA, picksB, rng) {
  const pick = (team, ids) => {
    const byId = new Map(team.lineup.map(p => [p.id, p]));
    const list = (Array.isArray(ids) ? ids : []).map(id => byId.get(id)).filter(p => p && OUTFIELD(p));
    const seen = new Set(), uniq = list.filter(p => !seen.has(p.id) && seen.add(p.id));
    const fill = team.lineup.filter(OUTFIELD).sort((a, b) => b.ovr - a.ovr).filter(p => !seen.has(p.id));
    return uniq.concat(fill);
  };
  const seqA = pick(A, picksA), seqB = pick(B, picksB);
  const kicks = []; let sa = 0, sb = 0;
  for (let r = 0; r < 60; r++) {
    const ka = seqA[r % seqA.length], kb = seqB[r % seqB.length];
    const a = kickOne(ka, keeperOf(B), rng); kicks.push({ team: 0, id: ka.id, name: ka.name, ...a }); if (a.goal) sa++;
    const b = kickOne(kb, keeperOf(A), rng); kicks.push({ team: 1, id: kb.id, name: kb.name, ...b }); if (b.goal) sb++;
    const done = r + 1;
    if (done >= 5 && sa !== sb) break; // após as 5 cobranças de cada, morte súbita até desempatar
    if (done < 5 && (sa > sb + (5 - done) || sb > sa + (5 - done))) break; // já não dá para alcançar
  }
  return { kicks, score: [sa, sb], winner: sa === sb ? null : sa > sb ? 0 : 1 };
}

module.exports = { defaultKickers, runShootout, SIDES };
