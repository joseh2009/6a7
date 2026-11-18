"use strict";
/* 6a7 · seleção: sorteie, escolha o jogador e clique na posição dele no campo (como no 7a0). */
const Draft = (function () {
  let tick = null, sel = null, lastKey = null, lastPool = [], lastLineup = [], lastSlots = [];
  const FORM_LIST = ["4-3-3", "4-4-2", "4-2-3-1", "4-2-4", "3-5-2", "5-3-2", "4-5-1", "3-4-3"];
  const mk = (id, items, cur, cb) => { $(id).innerHTML = items.map(([v, l]) => `<button class="chip ${v === cur ? "active" : ""}" data-v="${v}">${l}</button>`).join(""); $(id).querySelectorAll("button").forEach(b => b.onclick = () => cb(b.dataset.v)); };

  function render() {
    const r = G.room, y = G.you; if (!r || !y || r.phase !== "draft") return;
    const almanaque = r.mode === "almanaque", forms = G.formations || {}, slots = forms[y.formation] || [];
    const me = r.players.find(p => p.cid === G.cid), spectator = !me || me.role !== "player";
    const can = y.myTurn && !spectator, d = y.draw;
    $("draftCount").textContent = `${y.picks || 0}/11`;

    // turno
    const turnP = r.turn ? r.players.find(p => p.cid === r.turn.cid) : null, tb = $("turnBox");
    tb.classList.toggle("mine", !!y.myTurn);
    if (spectator) tb.innerHTML = `Você está assistindo<small>Aguarde o fim da seleção.</small>`;
    else if (r.mode === "vsrelogio") tb.innerHTML = `Modo várzea<small>Escolha à vontade, sem esperar ninguém.</small>`;
    else if (y.myTurn) tb.innerHTML = `SUA VEZ<small>${d ? "Escolha um jogador e clique na posição dele no campo." : "Clique em ROLAR para sortear uma seleção e uma Copa."}</small>`;
    else if (y.picks >= 11) tb.innerHTML = `Seu time está completo<small>Aguardando os outros participantes…</small>`;
    else tb.innerHTML = `Vez de ${esc(turnP ? turnP.name : "…")}<small>Aguarde sua vez de escolher.</small>`;
    clearInterval(tick); const tbx = $("timerBox"); tbx.textContent = "";
    if (r.turn && r.mode !== "vsrelogio") { const f = () => { const s = Math.max(0, Math.ceil((r.turn.deadline - Date.now()) / 1000)); tbx.textContent = `${s}s para escolher`; }; f(); tick = setInterval(f, 500); }

    // táticas
    mk("formChips", FORM_LIST.map(f => [f, f]), y.formation, v => emit("setTactics", { formation: v, style: y.style }));
    mk("styleChips", Object.entries(STYLE_NAMES), y.style, v => emit("setTactics", { formation: y.formation, style: v }));

    // sorteio
    const box = $("drawBox"), unl = y.unlimited;
    if (d && d.key !== lastKey) { sel = null; if (can) Sound.event(); }
    lastKey = d ? d.key : null;
    if (sel && !(d && d.pool.some(p => p.id === sel))) sel = null;
    box.classList.toggle("meme", !!(d && d.meme));
    box.innerHTML = d ? `<small>${d.meme ? "SELEÇÃO ESPECIAL · MEMES" : "SORTEIO"}</small><strong>${flag(d.sel)} ${esc(d.name)}</strong><span>${d.meme ? "Copa dos Memes" : "Copa " + d.copa}</span>` : `<small>SORTEIO</small><strong>Role para sortear</strong><span>uma seleção e uma Copa do Mundo</span>`;
    $("rerollRow").classList.toggle("hidden", !d);
    $("rerollSel").textContent = unl ? "↻ OUTRA SELEÇÃO (∞)" : `↻ OUTRA SELEÇÃO (${y.rerolls.sel}/5)`;
    $("rerollCup").textContent = unl ? "↻ OUTRA COPA (∞)" : `↻ OUTRA COPA (${y.rerolls.cup}/5)`;
    $("rerollSel").disabled = !can || (!unl && y.rerolls.sel >= 5);
    $("rerollCup").disabled = !can || (!unl && y.rerolls.cup >= 5);
    const rb = $("rollBtn"); rb.disabled = !can || !!d || y.picks >= 11; rb.innerHTML = d ? "ESCOLHA UM JOGADOR" : "ROLAR <i>◆</i>"; rb.style.fontSize = d ? "20px" : "";

    // lista de jogadores
    const pool = $("pool"); pool.classList.toggle("hidden", !d); lastPool = d ? d.pool : [];
    if (d) pool.innerHTML = d.pool.slice().sort((a, b) => (b.ok - a.ok) || ((b.ovr || 0) - (a.ovr || 0))).map(p => `<button class="pp ${p.legend ? "lg" : ""} ${sel === p.id ? "sel" : ""}" data-id="${esc(p.id)}" ${p.ok && can ? "" : "disabled"}><span class="no">${p.num || ""}</span><strong>${esc(p.name)}</strong><span class="ps">${p.positions.join("/")}</span><b>${almanaque ? "?" : p.ovr}</b></button>`).join("");
    pool.querySelectorAll(".pp").forEach(b => b.onclick = () => { sel = sel === b.dataset.id ? null : b.dataset.id; render(); });
    const picked = sel ? lastPool.find(p => p.id === sel) : null;
    $("draftHelp").textContent = !d ? "" : picked ? `${picked.name} selecionado. Clique em uma vaga destacada no campo (${picked.positions.join("/")}).` : "Clique em um jogador da lista e depois na posição dele no campo. Jogadores apagados não cabem em nenhuma vaga livre.";

    // campo e escalação
    const lineup = y.lineup || []; lastLineup = lineup; lastSlots = slots;
    $("pitchSlots").innerHTML = slots.map(([pos, x, yy], i) => {
      const p = lineup[i], hint = picked && picked.fits && picked.fits.includes(i);
      return `<div class="slot ${p ? "on" : ""} ${hint ? "hint" : ""}" data-i="${i}" title="${pos}" style="left:${x}%;top:${yy}%">${p ? `<b>${p.num || "•"}</b><span class="nm">${esc(p.name.split(" ").slice(-1)[0])}</span>` : pos}</div>`;
    }).join("");
    $("lineup").innerHTML = slots.map(([pos], i) => { const p = lineup[i]; return `<div class="lr ${p ? "" : "empty"}"><span>${pos}</span><span>${p ? esc(p.name) : "—"}</span><b>${p ? (almanaque ? "?" : p.ovr) : ""}</b></div>`; }).join("");
    const filled = lineup.filter(Boolean);
    $("teamOvr").textContent = almanaque ? "?" : filled.length ? Math.round(filled.reduce((s, p) => s + p.ovr, 0) / filled.length) : "—";
    $("others").innerHTML = r.players.filter(p => p.role === "player").map(p => `<div class="oth ${p.cid === G.cid ? "me" : ""}"><span>${esc(p.name)}${p.connected ? "" : " (offline)"}</span><b>${p.count}/11</b></div>`).join("");
  }

  // clique no campo: coloca o jogador selecionado na vaga
  $("pitchSlots").addEventListener("click", e => {
    const el = e.target.closest(".slot"); if (!el) return;
    const i = Number(el.dataset.i);
    if (lastLineup[i]) return toast("Essa posição já está ocupada.");
    if (!sel) return toast("Escolha um jogador da lista primeiro.");
    const pl = lastPool.find(p => p.id === sel);
    if (!pl || !pl.fits.includes(i)) return toast(`${pl ? pl.name : "Esse jogador"} não joga nessa posição (${lastSlots[i][0]}).`);
    emit("pick", { id: sel, slot: i }); sel = null;
  });
  $("rollBtn").onclick = () => { Sound.ensure(); emit("roll"); };
  $("rerollSel").onclick = () => emit("reroll", "sel"); $("rerollCup").onclick = () => emit("reroll", "cup");
  window.addEventListener("keydown", e => { if (G.screen === "draft" && (e.key === "r" || e.key === "R") && !$("rollBtn").disabled && document.activeElement.tagName !== "INPUT") emit("roll"); });
  return { render };
})();
