"use strict";
/* 6a7 · roteamento de telas, início e sala. */
(function () {
  applyTheme(store.get("6a7Theme", "light"));
  document.querySelectorAll("[data-theme-toggle]").forEach(b => b.onclick = () => applyTheme(document.body.dataset.theme === "light" ? "dark" : "light"));
  G.muted = store.get("6a7Muted", "0") === "1"; $("muteBtn").textContent = G.muted ? "🔇" : "🔊";
  $("muteBtn").onclick = () => { G.muted = !G.muted; store.set("6a7Muted", G.muted ? "1" : "0"); $("muteBtn").textContent = G.muted ? "🔇" : "🔊"; Sound.ensure(); };

  const params = new URLSearchParams(location.search);
  $("playerName").value = store.get("6a7Name", "") || "";
  $("roomCode").value = (params.get("sala") || store.get("6a7Room", "")).toUpperCase().slice(0, 8);
  function setMode(m) { G.mode = m; document.querySelectorAll(".mode").forEach(b => b.classList.toggle("active", b.dataset.mode === m)); $("modeDesc").textContent = MODE_INFO[m].desc; }
  document.querySelectorAll(".mode").forEach(b => b.onclick = () => setMode(b.dataset.mode)); setMode(params.get("modo") && MODE_INFO[params.get("modo")] ? params.get("modo") : "classic");

  const code6 = () => Math.random().toString(36).replace(/[^a-z0-9]/g, "").slice(0, 6).toUpperCase();
  function join(code) {
    G.name = $("playerName").value.trim().slice(0, 18) || "Jogador"; store.set("6a7Name", G.name);
    code = (code || $("roomCode").value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!code) { code = code6(); $("roomCode").value = code; }
    store.set("6a7Room", code); G.room = { code }; G.pendingMode = G.mode; Sound.ensure(); $("homeStatus").textContent = "Entrando na sala…";
    emit("joinRoom", { code, name: G.name, cid: G.cid });
  }
  $("joinBtn").onclick = () => join(); $("soloBtn").onclick = () => join(code6());
  $("roomCode").addEventListener("keydown", e => { if (e.key === "Enter") join(); });
  $("brandBtn").onclick = () => { if (!G.room || !G.room.phase || G.room.phase === "lobby") { if (G.room && G.room.code) show("lobby"); else show("home"); } };

  connect(); if (!G.socket) return;
  G.socket.on("joined", d => { G.cid = d.cid; G.formations = d.formations || G.formations; $("lobbyCode").textContent = d.code; if (d.spectator) toast("A partida já começou: você entrou como espectador."); if (G.pendingMode) { emit("setMode", G.pendingMode); G.pendingMode = null; } });
  G.socket.on("you", y => { G.you = y; if (G.screen === "draft") Draft.render(); if (G.room && G.room.phase === "lobby") renderLobby(); });
  G.socket.on("room", r => {
    const prev = G.room; G.room = r; G.mode = r.mode;
    if (r.phase === "lobby") { if (G.screen !== "lobby") { View3D.stop(); show("lobby"); } renderLobby(); }
    else if (r.phase === "draft") { if (G.screen !== "draft") show("draft"); Draft.render(); }
    else if (r.phase === "tournament") { if (G.screen !== "tour") { View3D.stop(); show("tour"); } Tour.render(); }
    else if (r.phase === "finished") { if (G.screen === "match") { /* resultado aparece por cima */ } else { show(r.tournament ? "tour" : "lobby"); r.tournament ? Tour.render() : renderLobby(); } }
    else if (r.phase === "match") { if (G.screen !== "match") show("match"); }
    $("lobbyMode").textContent = MODE_INFO[r.mode].name;
  });
  G.socket.on("tour:stage", d => Tour.onStage(d));
  G.socket.on("match:start", d => { show("match"); View3D.start(d); });
  G.socket.on("match:snap", s => View3D.onSnap(s));
  G.socket.on("match:event", e => View3D.onEvent(e));
  G.socket.on("match:input", m => View3D.onRemoteInput(m));
  G.socket.on("dev:apply", c => View3D.onDevApply(c));
  G.socket.on("match:end", r => View3D.onEnd(r));

  // ----- sala -----
  function renderLobby() {
    const r = G.room; if (!r) return;
    const isHost = r.hostCid === G.cid, me = r.players.find(p => p.cid === G.cid), tm = ["classic", "almanaque", "player"].includes(r.mode);
    $("lobbyCode").textContent = r.code; $("lobbyMode").textContent = MODE_INFO[r.mode].name;
    $("roomPlayers").innerHTML = r.players.map(p => `<div class="person ${p.connected ? "" : "off"}"><span><i class="dot"></i>${esc(p.name)}${p.cid === G.cid ? " (você)" : ""}</span><small>${p.cid === r.hostCid ? "ANFITRIÃO · " : ""}${p.role === "spec" ? "ESPECTADOR" : tm ? "SELEÇÃO" : "TIME"}</small></div>`).join("");
    $("lobbyHint").textContent = tm ? `${r.players.filter(p => p.role === "player").length} jogador(es) real(is). As ${16 - r.players.filter(p => p.role === "player").length} vagas restantes serão preenchidas por bots.` : "Este modo é 1 contra 1. Se estiver sozinho, você enfrenta um bot; quem entrar depois do 2º jogador assiste.";
    $("lobbyModes").innerHTML = Object.keys(MODE_INFO).map(m => `<button class="chip ${m === r.mode ? "active" : ""}" data-m="${m}" ${isHost ? "" : "disabled"}>${MODE_INFO[m].name}</button>`).join("");
    $("lobbyModes").querySelectorAll("[data-m]").forEach(b => b.onclick = () => emit("setMode", b.dataset.m));
    $("lobbyModeDesc").textContent = MODE_INFO[r.mode].desc;
    $("startDraft").disabled = !isHost || !me || me.role !== "player"; $("startDraft").textContent = "COMEÇAR SELEÇÃO";
    $("startHint").textContent = isHost ? "" : "Só o anfitrião pode iniciar.";
    if (me && me.kit && document.activeElement !== $("kitShirt") && document.activeElement !== $("kitShorts")) { $("kitShirt").value = me.kit.shirt; $("kitShorts").value = me.kit.shorts; }
  }
  $("startDraft").onclick = () => { Sound.ensure(); emit("startDraft"); };
  $("copyCode").onclick = () => { const c = G.room && G.room.code; navigator.clipboard ? navigator.clipboard.writeText(c).then(() => toast("Código copiado!"), () => toast("Código: " + c)) : toast("Código: " + c); };
  $("copyLink").onclick = () => { const u = `${location.origin}${location.pathname}?sala=${G.room.code}`; navigator.clipboard ? navigator.clipboard.writeText(u).then(() => toast("Link copiado!"), () => toast(u)) : toast(u); };
  // ----- uniforme do jogador (aparece na partida 3D) -----
  const sendKit = () => emit("setKit", { shirt: $("kitShirt").value, shorts: $("kitShorts").value });
  $("kitShirt").onchange = sendKit; $("kitShorts").onchange = sendKit;
  $("kitPresets").innerHTML = KIT_PRESETS.map(([a, b], i) => `<button class="chip kitp" type="button" data-a="${a}" data-b="${b}" style="background:linear-gradient(90deg,${a} 50%,${b} 50%);color:#fff;text-shadow:0 1px 2px #000">KIT ${i + 1}</button>`).join("");
  $("kitPresets").querySelectorAll(".kitp").forEach(b => b.onclick = () => { $("kitShirt").value = b.dataset.a; $("kitShorts").value = b.dataset.b; sendKit(); });
  window.addEventListener("keydown", e => { if (e.key === "Escape") $("modal").classList.add("hidden"); });
  $("modal").addEventListener("click", e => { if (e.target === $("modal")) $("modal").classList.add("hidden"); });
})();
