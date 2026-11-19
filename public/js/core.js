"use strict";
/* 6a7 · núcleo do cliente: estado, utilidades, tema, som e conexão. */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const G = { socket: null, room: null, you: null, cid: null, name: "Jogador", formations: null, mode: "classic", screen: "home", muted: false };
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

const MODE_INFO = {
  classic: { name: "CLÁSSICO", desc: "Campeonato de 16 seleções. Monte seu elenco por sorteio, acompanhe as partidas simuladas e assista à grande final em 3D." },
  almanaque: { name: "ALMANAQUE", desc: "O mesmo campeonato do Clássico, mas todos os overalls viram interrogações. Teste seu conhecimento de futebol e sua sorte." },
  chaos: { name: "CAOS", desc: "Escolha seu elenco e entre numa partida de 2 minutos com eventos absurdos: a cada 20 s, e a cada 10 s no último minuto." },
  vsrelogio: { name: "VSRELÓGIO", desc: "O modo várzea: troque de seleção e de Copa quantas vezes quiser, sem esperar ninguém, e entre numa partida rápida." },
  player: { name: "JOGADOR", desc: "Campeonato como no Clássico, mas na grande final você entra em campo e controla os atletas em 3D." }
};
const KIT_PRESETS = [["#3a7be0", "#ffffff"], ["#c8102e", "#ffffff"], ["#f6c90e", "#0c8a43"], ["#14234f", "#ffffff"], ["#111111", "#e0242f"], ["#ffffff", "#14304b"], ["#7b2cbf", "#f6c90e"], ["#2aa04a", "#111111"]];
const STYLE_NAMES = { defensive: "Defensivo", balanced: "Equilibrado", offensive: "Ofensivo" };

// Cores por seleção (camisa / calção) usadas nas bandeirinhas e nos uniformes 3D.
const PALETTE = { BRA: ["#f6c90e", "#0c8a43"], ARG: ["#7ec3ee", "#ffffff"], GER: ["#f2f2f2", "#111111"], FRA: ["#1a3fa0", "#ffffff"], ITA: ["#1b62c4", "#ffffff"], ESP: ["#d6212b", "#1a3fa0"], ENG: ["#f4f4f4", "#14234f"], POR: ["#b3122a", "#0b6b3a"], NED: ["#f47b1f", "#ffffff"], BEL: ["#c8102e", "#111111"], URU: ["#5aa8e0", "#111111"], MEX: ["#0b7a3b", "#ffffff"], SWE: ["#f5cd1b", "#1b5ea8"], CRO: ["#e8e8e8", "#c8102e"], JPN: ["#1b3f9a", "#ffffff"], KOR: ["#c8102e", "#ffffff"], COL: ["#f7d117", "#1b3f9a"], CHI: ["#d22b2b", "#1b3f9a"], PER: ["#f4f4f4", "#c8102e"], PAR: ["#c8102e", "#ffffff"], ECU: ["#f7d117", "#1b3f9a"], USA: ["#1b2f6b", "#ffffff"], CMR: ["#0b8a43", "#c8102e"], NGA: ["#2aa04a", "#ffffff"], SEN: ["#f4f4f4", "#0b8a43"], GHA: ["#f7d117", "#c8102e"], MAR: ["#c8102e", "#0b6b3a"], ALG: ["#f4f4f4", "#0b8a43"], EGY: ["#c8102e", "#111111"], CIV: ["#f58220", "#0b8a43"], TUR: ["#d80027", "#ffffff"], RUS: ["#c8102e", "#ffffff"], POL: ["#f4f4f4", "#c8102e"], SRB: ["#c8102e", "#1b3f9a"], SUI: ["#d80027", "#ffffff"], DEN: ["#c8102e", "#ffffff"], SCO: ["#1b3f9a", "#ffffff"], IRL: ["#169b62", "#ffffff"], AUT: ["#d80027", "#ffffff"], BUL: ["#f4f4f4", "#169b62"], CZE: ["#d7141a", "#11457e"], GRE: ["#1b6fc4", "#ffffff"], ROU: ["#f5cd1b", "#1b3f9a"], UKR: ["#f5cd1b", "#1b6fc4"], AUS: ["#f5cd1b", "#0b6b3a"], CRC: ["#c8102e", "#1b3f9a"], MEM: ["#ff9f1c", "#7b2cbf"], HUM: ["#3a7be0", "#ffffff"] };
const pal = sel => PALETTE[sel] || ["#3a7be0", "#ffffff"];
const flag = (sel, label) => { const [a, b] = pal(sel); return `<span class="flag" style="--c1:${a};--c2:${b}" title="${esc(label || sel)}">${esc(sel === "HUM" ? "VOCÊ" : sel)}</span>`; };
const teamLabel = t => t.sel === "HUM" ? esc(t.name) : `${esc(t.name)}${t.copa ? ` <span class="sub">${t.copa}</span>` : ""}`;

function toast(msg, ms = 2600) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), ms); }
function show(id) { G.screen = id; ["home", "lobby", "draft", "tour", "match"].forEach(s => $(s).classList.toggle("hidden", s !== id)); window.scrollTo(0, 0); }

// ----- tema -----
function applyTheme(v) {
  v = v === "dark" ? "dark" : "light"; document.body.dataset.theme = v;
  const logo = v === "dark" ? "/assets/logo-escuro.png" : "/assets/logo-claro.png";
  $("brandLogo").src = logo; $("pageIcon").href = logo; document.querySelector('meta[name="theme-color"]').content = v === "dark" ? "#0a0708" : "#eef5fc";
  document.querySelectorAll("[data-theme-toggle]").forEach(b => b.textContent = v === "light" ? "TEMA ESCURO" : "TEMA CLARO"); store.set("6a7Theme", v);
}

// ----- som (sintetizado, sem arquivos) -----
const Sound = {
  ctx: null, ensure() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); return this.ctx; },
  tone(f, d, type = "sine", vol = .15, f2) { if (G.muted) return; const c = this.ensure(); if (!c) return; const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; if (f2) o.frequency.linearRampToValueAtTime(f2, c.currentTime + d); g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + d); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + d); },
  noise(d, vol = .2, freq = 1200) { if (G.muted) return; const c = this.ensure(); if (!c) return; const n = c.sampleRate * d, buf = c.createBuffer(1, n, c.sampleRate), data = buf.getChannelData(0); for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); f.type = "bandpass"; f.frequency.value = freq; g.gain.value = vol; s.buffer = buf; s.connect(f).connect(g).connect(c.destination); s.start(); },
  kick() { this.tone(140, .08, "triangle", .2, 60); }, whistle() { this.tone(2800, .35, "sine", .1, 3100); }, goal() { this.noise(1.6, .25, 900); this.tone(220, .6, "sawtooth", .08, 330); }, event() { this.tone(500, .25, "square", .06, 900); }, boom() { this.noise(.6, .3, 200); }
};

// ----- conexão -----
function connect() {
  G.cid = store.get("6a7Cid", null) || Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4); store.set("6a7Cid", G.cid);
  if (typeof io === "undefined") { setConn("bad", "sem servidor"); toast("Não foi possível carregar o Socket.IO. Abra o jogo pelo servidor (npm start)."); return; }
  G.socket = io({ reconnectionDelayMax: 3000 });
  G.socket.on("connect", () => { setConn("ok", "conectado"); if (G.room && G.room.code) G.socket.emit("joinRoom", { code: G.room.code, name: G.name, cid: G.cid, password: G.pass || "" }); });
  G.socket.on("disconnect", () => setConn("bad", "reconectando…"));
  G.socket.on("connect_error", () => setConn("bad", "sem conexão"));
  G.socket.on("notice", msg => { toast(msg); const s = $("homeStatus"); if (s && G.screen === "home") s.textContent = msg; });
}
function setConn(cls, txt) { const c = $("connState"); c.className = "conn " + cls; c.lastElementChild.textContent = txt; }
const emit = (ev, ...a) => G.socket && G.socket.emit(ev, ...a);
