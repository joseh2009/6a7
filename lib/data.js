"use strict";
// Dados históricos (offline) + formações + montagem de elencos.
const fs = require("fs"), path = require("path");

const COUNTRIES = {
  ALG:"Argélia",ARG:"Argentina",AUS:"Austrália",AUT:"Áustria",BEL:"Bélgica",BRA:"Brasil",BUL:"Bulgária",CHI:"Chile",CIV:"Costa do Marfim",
  CMR:"Camarões",COL:"Colômbia",CRC:"Costa Rica",CRO:"Croácia",CZE:"Tchéquia",DEN:"Dinamarca",ECU:"Equador",EGY:"Egito",ENG:"Inglaterra",
  ESP:"Espanha",FRA:"França",GER:"Alemanha",GHA:"Gana",GRE:"Grécia",IRL:"Irlanda",ITA:"Itália",JPN:"Japão",KOR:"Coreia do Sul",MAR:"Marrocos",
  MEX:"México",NED:"Holanda",NGA:"Nigéria",PAR:"Paraguai",PER:"Peru",POL:"Polônia",POR:"Portugal",ROU:"Romênia",RUS:"Rússia",SCO:"Escócia",
  SEN:"Senegal",SRB:"Sérvia",SUI:"Suíça",SWE:"Suécia",TUR:"Turquia",UKR:"Ucrânia",URU:"Uruguai",USA:"Estados Unidos",MEM:"Memes"
};

const SECTOR = { GOL:"G", LD:"D", ZAG:"D", LE:"D", VOL:"M", MEI:"M", MD:"M", ME:"M", PD:"A", PE:"A", CA:"A" };
// Posições "vizinhas": um jogador joga bem fora de posição se for do mesmo setor.
const NEAR = { LD:["MD"], MD:["LD","PD"], LE:["ME"], ME:["LE","PE"], PD:["MD","CA"], PE:["ME","CA"], CA:["PD","PE"], VOL:["MEI","ZAG"], MEI:["VOL","MD","ME"], ZAG:["VOL"] };

// [pos, x%, y%] — y=96 é o gol próprio (parte de baixo do campo tático).
const FORMATIONS = {
  "4-3-3":  [["PE",18,22],["CA",50,17],["PD",82,22],["MEI",31,46],["VOL",50,58],["MEI",69,46],["LE",20,82],["ZAG",39,86],["ZAG",61,86],["LD",80,82],["GOL",50,96]],
  "4-4-2":  [["CA",37,19],["CA",63,19],["ME",15,45],["MEI",39,48],["MEI",61,48],["MD",85,45],["LE",20,82],["ZAG",39,86],["ZAG",61,86],["LD",80,82],["GOL",50,96]],
  "4-2-3-1":[["CA",50,17],["PE",18,35],["MEI",50,38],["PD",82,35],["VOL",39,57],["VOL",61,57],["LE",20,82],["ZAG",39,86],["ZAG",61,86],["LD",80,82],["GOL",50,96]],
  "4-2-4":  [["PE",16,20],["CA",39,17],["CA",61,17],["PD",84,20],["VOL",39,52],["VOL",61,52],["LE",20,82],["ZAG",39,86],["ZAG",61,86],["LD",80,82],["GOL",50,96]],
  "3-5-2":  [["CA",38,18],["CA",62,18],["ME",14,43],["MEI",34,48],["VOL",50,57],["MEI",66,48],["MD",86,43],["ZAG",27,84],["ZAG",50,87],["ZAG",73,84],["GOL",50,96]],
  "5-3-2":  [["CA",38,18],["CA",62,18],["MEI",30,48],["VOL",50,58],["MEI",70,48],["LE",10,76],["ZAG",30,86],["ZAG",50,88],["ZAG",70,86],["LD",90,76],["GOL",50,96]],
  "4-5-1":  [["CA",50,17],["ME",12,43],["MEI",31,48],["VOL",50,57],["MEI",69,48],["MD",88,43],["LE",20,82],["ZAG",39,86],["ZAG",61,86],["LD",80,82],["GOL",50,96]],
  "3-4-3":  [["PE",18,21],["CA",50,17],["PD",82,21],["ME",20,49],["VOL",43,56],["VOL",57,56],["MD",80,49],["ZAG",27,85],["ZAG",50,88],["ZAG",73,85],["GOL",50,96]]
};
const FORMATION_NAMES = Object.keys(FORMATIONS);
const STYLES = ["defensive", "balanced", "offensive"];

function load(file) { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", file), "utf8")); }
const RAW = load("squads.json");
const MEMES = load("memes.json");

function normalize(entry) {
  const key = `${entry.sel}-${entry.copa}${entry.label ? "-" + entry.label : ""}`;
  return {
    key, sel: entry.sel, copa: entry.copa, meme: entry.sel === "MEM",
    name: entry.label || COUNTRIES[entry.sel] || entry.sel,
    squad: entry.squad.map(p => ({
      id: `${key}:${p.id}`, name: p.n, positions: p.pos, pos: p.pos[0], num: p.num || 0,
      ovr: Math.max(40, Math.min(99, p.ovr)), legend: !!p.lg, fx: p.fx || null, sel: entry.sel, copa: entry.copa, key
    }))
  };
}
const NATIONAL = RAW.map(normalize).filter(e => e.squad.length >= 14);
const MEME_SQUADS = MEMES.map(normalize);
const ALL = [...NATIONAL, ...MEME_SQUADS];
const BY_KEY = new Map(ALL.map(e => [e.key, e]));

const SECTOR_OF = pos => SECTOR[pos] || "M";
function fitCost(player, slotPos) {
  // 0 = posição natural, 1 = vizinha, 3 = mesmo setor, Infinity = não pode jogar ali.
  if (player.positions.includes(slotPos)) return 0;
  if (slotPos === "GOL" || player.positions.includes("GOL")) return Infinity;
  if (player.positions.some(p => (NEAR[p] || []).includes(slotPos))) return 1;
  if (player.positions.some(p => SECTOR_OF(p) === SECTOR_OF(slotPos))) return 3;
  return Infinity;
}
// Atribuição ótima (DP por bitmask) de jogadores às vagas livres da formação.
function assign(players, formation) {
  const slots = FORMATIONS[formation] || FORMATIONS["4-3-3"], n = slots.length, memo = new Map();
  function go(i, mask) {
    if (i === players.length) return { cost: 0, list: [] };
    const k = i * 4096 + mask; if (memo.has(k)) return memo.get(k);
    let best = { cost: Infinity, list: null };
    for (let s = 0; s < n; s++) {
      if (mask & (1 << s)) continue;
      const c = fitCost(players[i], slots[s][0]); if (c === Infinity) continue;
      const rest = go(i + 1, mask | (1 << s)); if (rest.cost === Infinity) continue;
      if (c + rest.cost < best.cost) best = { cost: c + rest.cost, list: [s, ...rest.list] };
    }
    memo.set(k, best); return best;
  }
  const r = go(0, 0);
  return r.list ? { ok: true, slotOf: r.list, cost: r.cost } : { ok: false };
}
function canAdd(current, candidate, formation) { return assign([...current, candidate], formation).ok; }
// Vagas (índices) livres onde o jogador pode ser colocado manualmente.
function fitsList(slots, formation, pl) {
  const f = FORMATIONS[formation] || FORMATIONS["4-3-3"];
  return f.map((s, i) => i).filter(i => !slots[i] && fitCost(pl, f[i][0]) !== Infinity);
}
function bestSlot(slots, formation, pl) {
  const f = FORMATIONS[formation] || FORMATIONS["4-3-3"], fits = fitsList(slots, formation, pl);
  let best = -1, bc = Infinity; for (const i of fits) { const c = fitCost(pl, f[i][0]); if (c < bc) { bc = c; best = i; } }
  return best;
}
// Escalação na ordem da formação, a partir do mapa vaga → jogador escolhido pelo usuário.
function lineupFromSlots(slots, formation) {
  const f = FORMATIONS[formation] || FORMATIONS["4-3-3"];
  return slots.map((pl, i) => pl ? { ...pl, slot: f[i][0], off: fitCost(pl, f[i][0]) } : null);
}

function buildLineup(players, formation) {
  const a = assign(players, formation); if (!a.ok) return null;
  const slots = FORMATIONS[formation], line = new Array(11).fill(null);
  players.forEach((p, i) => { line[a.slotOf[i]] = { ...p, slot: slots[a.slotOf[i]][0], off: fitCost(p, slots[a.slotOf[i]][0]) }; });
  return line;
}

// Melhor 11 de um elenco para uma formação (usado pelos bots).
function bestXI(squad, formation) {
  const slots = FORMATIONS[formation], used = new Set(), line = [];
  const order = slots.map((s, i) => i).sort((a, b) => (slots[a][0] === "GOL" ? -1 : 0) - (slots[b][0] === "GOL" ? -1 : 0));
  const out = new Array(11).fill(null);
  for (const i of order) {
    let best = null, bs = -1;
    for (const p of squad) {
      if (used.has(p.id)) continue; const c = fitCost(p, slots[i][0]); if (c === Infinity) continue;
      const sc = p.ovr - c * 2.2; if (sc > bs) { bs = sc; best = p; }
    }
    if (!best) return null;
    used.add(best.id); out[i] = { ...best, slot: slots[i][0], off: fitCost(best, slots[i][0]) };
  }
  return out;
}

function playerStats(p) {
  const o = p.ovr, s = p.slot || p.pos, sec = SECTOR_OF(s), pen = (p.off || 0) * 1.5;
  const f = (d) => Math.max(30, Math.min(99, Math.round(o + d - pen)));
  const a = sec === "A", m = sec === "M", d = sec === "D", g = sec === "G";
  const st = { speed: f(a ? 2 : d ? -4 : 0), passing: f(m ? 3 : a ? -1 : -3), shooting: f(a ? 4 : m ? -3 : -12), defending: f(d ? 4 : m ? -4 : -14), keeping: g ? f(2) : 20, vision: f(m ? 3 : 0) };
  if (p.fx === "speed") st.speed = Math.min(99, st.speed + 8);
  if (p.fx === "power") st.shooting = Math.min(99, st.shooting + 8);
  if (p.fx === "wall") st.defending = Math.min(99, st.defending + 8), st.keeping = g ? Math.min(99, st.keeping + 6) : st.keeping;
  return st;
}

function teamRatings(lineup, tactics) {
  const t = { A: [], M: [], D: [], G: [] };
  lineup.forEach(p => t[SECTOR_OF(p.slot)].push(p.ovr - (p.off || 0) * 1.5));
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 60;
  let att = avg(t.A) * .62 + avg(t.M) * .38, def = avg(t.D) * .6 + avg(t.M) * .15 + avg(t.G) * .25, mid = avg(t.M);
  const st = (tactics && tactics.style) || "balanced";
  if (st === "offensive") { att += 3; def -= 3; } else if (st === "defensive") { att -= 3; def += 3; }
  return { att, mid, def, gk: avg(t.G), ovr: lineup.reduce((s, p) => s + p.ovr, 0) / lineup.length };
}

// Sorteio: seleção + Copa. 8% de chance de uma seleção especial de memes.
function rollDraw(rng, { exclude = new Set(), keepSel = null, keepCopa = null, memeChance = 0, ignoreExclude = false } = {}) {
  let pool = NATIONAL;
  if (keepSel) pool = (keepSel === "MEM" ? MEME_SQUADS : NATIONAL).filter(e => e.sel === keepSel);
  if (keepCopa) pool = pool.filter(e => e.copa === keepCopa);
  if (!keepSel && !keepCopa && rng() < memeChance) pool = MEME_SQUADS;
  let cand = ignoreExclude ? pool : pool.filter(e => !exclude.has(e.key));
  if (!cand.length) cand = pool;
  return cand[Math.floor(rng() * cand.length)] || null;
}
function publicPlayer(p, hideOvr) {
  return { id: p.id, name: p.name, positions: p.positions, pos: p.pos, num: p.num, ovr: hideOvr ? null : p.ovr, legend: p.legend, fx: p.fx, sel: p.sel, copa: p.copa };
}
function makeRng(seed) { let s = (seed >>> 0) || 1; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

module.exports = { fitsList, bestSlot, lineupFromSlots, COUNTRIES, FORMATIONS, FORMATION_NAMES, STYLES, NATIONAL, MEME_SQUADS, ALL, BY_KEY, SECTOR_OF, fitCost, assign, canAdd, buildLineup, bestXI, playerStats, teamRatings, rollDraw, publicPlayer, makeRng };
