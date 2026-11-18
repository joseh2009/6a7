"use strict";
/* 6a7 · campeonato: grupos, mata-mata, resultados com narração minuto a minuto. */
const Tour = (function () {
  const ORDER = ["G1", "G2", "G3", "QF", "SF", "F"], TABS = [["G", "Fase de grupos"], ["QF", "Quartas"], ["SF", "Semifinais"], ["F", "Final"]];
  let shown = null, anim = null, timer = null, tab = null;
  const teams = () => { const m = {}; (G.room.teams || []).forEach(t => m[t.id] = t); return m; };
  const mine = t => t && t.human === G.cid;
  const tn = (t, extra = "") => t ? `<span class="tn ${mine(t) ? "mine" : ""}" data-team="${esc(t.id)}">${flag(t.sel, t.name)} ${teamLabel(t)}${extra}</span>` : `<span class="tn muted">A definir</span>`;

  function standings(snap, upto) {
    const T = teams(), res = snap.results;
    return snap.groups.map(g => {
      const rows = g.ids.map(id => ({ id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 })), row = id => rows.find(r => r.id === id);
      for (const s of ["G1", "G2", "G3"]) { if (ORDER.indexOf(s) > upto) continue; for (const m of (res[s] || [])) { if (!g.ids.includes(m.a)) continue; const A = row(m.a), B = row(m.b); A.p++; B.p++; A.gf += m.score[0]; A.ga += m.score[1]; B.gf += m.score[1]; B.ga += m.score[0]; if (m.score[0] > m.score[1]) { A.w++; A.pts += 3; B.l++; } else if (m.score[0] < m.score[1]) { B.w++; B.pts += 3; A.l++; } else { A.d++; B.d++; A.pts++; B.pts++; } } }
      rows.forEach(r => { r.gd = r.gf - r.ga; r.tb = (T[r.id] || {}).ovr || 0; });
      rows.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || y.tb - x.tb); return { name: g.name, rows };
    });
  }
  function dispOf(m, key, i) { // o que mostrar de uma partida agora (ao vivo ou final)
    if (anim && anim.stage === key) { const maxMin = m.extra ? 120 : 90, min = Math.min(maxMin, Math.round(anim.p * maxMin)), done = anim.p >= 1, gs = m.goals.filter(g => g.min <= min); return { min, done, goals: gs, score: [gs.filter(g => g.team === 0).length, gs.filter(g => g.team === 1).length], live: !done, pens: done ? m.pens : null }; }
    return { min: m.extra ? 120 : 90, done: true, goals: m.goals, score: m.score, live: false, pens: m.pens };
  }
  function matchCard(m, key, i, T) {
    const d = dispOf(m, key, i), a = T[m.a], b = T[m.b], hum = mine(a) || mine(b);
    const win = d.done && m.winner != null ? m.winner : null;
    const minTxt = d.live ? `<span class="min live">${d.min}'</span>` : `<span class="min">ENCERRADO${m.extra ? (m.pens ? " · PÊNALTIS" : " · PRORROGAÇÃO") : ""}</span>`;
    const gl = d.goals.map(g => `<div><span>${g.min}' ${esc(g.player)}</span><span>${g.team === 0 ? esc(a.name) : esc(b.name)}</span></div>`).join("");
    return `<div class="mt ${hum ? "mine" : ""}" id="mc-${key}-${i}">${m.group ? `<div class="grp">GRUPO ${m.group}</div>` : ""}<div class="tt">${tn(a)}<div class="sc">${d.score[0]} – ${d.score[1]}</div>${tn(b)}</div>${minTxt}${d.pens ? `<div class="min">PÊNALTIS ${d.pens[0]} – ${d.pens[1]}</div>` : ""}<div class="gl">${gl || (d.done ? "Sem gols" : "")}</div>${win != null ? `<div class="min win">Classificado: ${esc((win === 0 ? a : b).name)}</div>` : ""}</div>`;
  }
  function currentTab(snap) { if (tab) return tab; const k = ORDER[shown == null ? 0 : Math.max(0, shown)]; return k[0] === "G" ? "G" : k; }

  function render() {
    const r = G.room, snap = r && r.tournament; if (!snap) return; const T = teams();
    const me = r.players.find(p => p.cid === G.cid), canAct = me && me.role === "player";
    if (!anim) shown = snap.stageIndex; else if (shown == null) shown = snap.stageIndex - 1;
    const t = currentTab(snap);
    $("tourKicker").textContent = `${MODE_INFO[r.mode].name} · ${r.teams.length} SELEÇÕES`;
    $("tourTitle").textContent = snap.done ? "FIM DE CAMPEONATO" : shown < 0 || shown == null ? "PRONTO PARA COMEÇAR" : snap.stageNames[ORDER[shown]].toUpperCase();
    // campeão
    const ch = $("champion"); ch.classList.toggle("hidden", !snap.champion || (anim != null));
    if (snap.champion && !anim) { const c = T[snap.champion], f = snap.results.F[0]; ch.innerHTML = `<div class="trophy">🏆</div><h3>${esc(c.name)} ${c.copa ? c.copa : ""}</h3><p>${mine(c) ? "É SEU! VOCÊ É O CAMPEÃO!" : "Campeã do 6a7"} · Final ${f.score[0]}–${f.score[1]}${f.pens ? ` (pên. ${f.pens[0]}–${f.pens[1]})` : ""}</p>`; }
    // botões
    const nb = $("nextStage"), nxt = snap.next;
    nb.classList.toggle("hidden", !nxt || snap.done); nb.disabled = !!anim || !canAct;
    nb.textContent = nxt === "G1" ? "COMEÇAR CAMPEONATO" : nxt === "F" ? "IR PARA A GRANDE FINAL (3D)" : nxt ? `PRÓXIMA FASE · ${(snap.stageNames[nxt] || "").toUpperCase()}` : "";
    $("skipAnim").classList.toggle("hidden", !anim);
    $("againBtn").classList.toggle("hidden", !(snap.done && r.hostCid === G.cid));
    // abas
    $("tourTabs").innerHTML = TABS.map(([k, l]) => { const avail = k === "G" ? shown >= 0 : ORDER.indexOf(k) <= shown || (k === "QF" && shown >= 3); return `<button class="tab ${t === k ? "active" : ""}" data-t="${k}" ${avail ? "" : "disabled"}>${l}</button>`; }).join("");
    $("tourTabs").querySelectorAll(".tab").forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });
    // corpo
    let html = "";
    if (shown == null || shown < 0) html = renderPreview(r, T);
    else if (t === "G") {
      const st = standings(snap, shown);
      html += `<div class="groups">${st.map(g => `<div class="card"><h3>GRUPO ${g.name}</h3><table class="gt"><tr><th></th><th>SELEÇÃO</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th><th>PTS</th></tr>${g.rows.map((x, i) => `<tr class="${shown >= 2 && i < 2 ? "q" : ""} ${mine(T[x.id]) ? "mine" : ""}"><td>${i + 1}</td><td>${tn(T[x.id])}</td><td>${x.p}</td><td>${x.w}</td><td>${x.d}</td><td>${x.l}</td><td>${x.gd > 0 ? "+" : ""}${x.gd}</td><td class="pts">${x.pts}</td></tr>`).join("")}</table></div>`).join("")}</div>`;
      for (const k of ["G3", "G2", "G1"]) { const idx = ORDER.indexOf(k); if (idx > shown && !(anim && anim.stage === k)) continue; const ms = snap.results[k]; if (!ms) continue; html += `<h3 style="margin-top:22px">${esc(snap.stageNames[k]).toUpperCase()}</h3><div class="matches">${ms.map((m, i) => matchCard(m, k, i, T)).join("")}</div>`; }
    } else {
      html += renderBracket(snap, T);
      const ms = snap.results[t]; if (ms && (ORDER.indexOf(t) <= shown || (anim && anim.stage === t))) html += `<h3 style="margin-top:22px">${esc(snap.stageNames[t]).toUpperCase()}</h3><div class="matches">${ms.map((m, i) => m.score ? matchCard(m, t, i, T) : `<div class="mt mine"><div class="tt">${tn(T[m.a])}<div class="sc">×</div>${tn(T[m.b])}</div><div class="min">${m.score ? "" : "AGUARDANDO A FINAL EM 3D"}</div></div>`).join("")}</div>`;
    }
    $("tourBody").innerHTML = html;
    $("tourBody").querySelectorAll("[data-team]").forEach(el => el.onclick = () => teamModal(T[el.dataset.team]));
  }
  function renderPreview(r, T) {
    const hum = r.teams.filter(t => t.human);
    return `<div class="card"><h3>AS 16 SELEÇÕES</h3><p class="muted">Grupos sorteados quando o campeonato começar. Toque em uma seleção para ver o onze.</p><div class="matches">${r.teams.slice().sort((a, b) => b.ovr - a.ovr).map(t => `<div class="mt ${mine(t) ? "mine" : ""}"><div class="tt"><span>${tn(t)}</span><div class="sc" style="font-size:24px">${t.ovr == null ? "?" : t.ovr}</div><span class="muted">${t.human ? "👤 " + esc(t.owner) : "BOT"} · ${t.formation}</span></div></div>`).join("")}</div></div>`;
  }
  function renderBracket(snap, T) {
    const qf = snap.results.QF || [], sf = snap.results.SF || [], f = (snap.results.F || [])[0];
    const seen = k => ORDER.indexOf(k) <= shown;
    const bm = (m, k) => { if (!m || !seen(k)) return `<div class="bm"><div><span class="muted">A definir</span></div><div><span class="muted">A definir</span></div></div>`; const sc = m.score; const w = m.winner; return `<div class="bm"><div class="${w === 0 ? "w" : ""}">${tn(T[m.a])}<b>${sc ? sc[0] : ""}</b></div><div class="${w === 1 ? "w" : ""}">${tn(T[m.b])}<b>${sc ? sc[1] : ""}</b></div></div>`; };
    return `<div class="bracket"><div class="bcol"><h4>QUARTAS</h4>${[0, 1, 2, 3].map(i => bm(qf[i], "QF")).join("")}</div><div class="bcol"><h4>SEMIFINAIS</h4>${[0, 1].map(i => bm(sf[i], "SF")).join("")}</div><div class="bcol"><h4>FINAL · 3D</h4>${bm(f, "F")}</div></div>`;
  }
  function teamModal(t) {
    if (!t) return; const al = G.room.mode === "almanaque" && G.room.phase === "draft";
    $("modalCard").innerHTML = `<h3><span>${flag(t.sel)} ${esc(t.name)} ${t.copa || ""}</span><button class="ghost" id="mClose">FECHAR</button></h3><p class="muted">${t.human ? "Time de " + esc(t.owner) : "Controlado por bot"} · ${t.formation} · ${STYLE_NAMES[t.style] || ""} · overall ${t.ovr}</p>${t.lineup.map(p => `<div class="lr"><span>${p.slot}</span><span>${esc(p.name)}${p.legend ? " ★" : ""}</span><b>${p.ovr}</b></div>`).join("")}`;
    $("modal").classList.remove("hidden"); $("mClose").onclick = () => $("modal").classList.add("hidden");
  }
  function onStage(d) {
    clearInterval(timer); const idx = ORDER.indexOf(d.stage); anim = { stage: d.stage, p: 0, start: performance.now(), dur: d.stage[0] === "G" ? 8000 : 9000 }; shown = idx - 1; tab = d.stage[0] === "G" ? "G" : d.stage;
    G.screen === "tour" || show("tour");
    timer = setInterval(() => { anim.p = Math.min(1, (performance.now() - anim.start) / anim.dur); if (anim.p >= 1) { finish(); } else render(); }, 250);
    render();
  }
  function finish() { clearInterval(timer); timer = null; if (anim) { shown = ORDER.indexOf(anim.stage); const last = anim.stage; anim = null; tab = last[0] === "G" ? "G" : last; } render(); }
  $("skipAnim").onclick = () => { if (anim) { anim.p = 1; finish(); } };
  $("nextStage").onclick = () => { Sound.ensure(); emit("nextStage"); };
  $("againBtn").onclick = () => emit("playAgain");
  return { render, onStage, reset() { clearInterval(timer); anim = null; shown = null; tab = null; } };
})();
