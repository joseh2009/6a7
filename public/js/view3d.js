"use strict";
/* 6a7 · partida em 3D. O anfitrião roda o motor (engine.js) e transmite o estado; os demais só renderizam e enviam comandos. */
const View3D = (function () {
  const L = Engine.L, W = Engine.W, GH = Engine.GOAL_HW;
  let S = null, camMode = "orig";
  const keys = {}, latch = { pass: false, sw: false }, touchIn = { dx: 0, dz: 0, shoot: false, sprint: false };
  const lerp = (a, b, t) => a + (b - a) * t, angLerp = (a, b, t) => { let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; return a + d * t; };
  const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
  const hexToRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const colorDist = (a, b) => { const x = hexToRgb(a), y = hexToRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  const fmt = s => { s = Math.max(0, Math.ceil(s)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };

  // ---------------------------------------------------------------- início / fim
  function start(payload) {
    stop(); $("result").classList.add("hidden"); $("banner").classList.add("hidden"); $("goalFx").classList.add("hidden");
    const r = G.room, host = r && r.hostCid === G.cid;
    S = { payload, host, myTeam: payload.controllers.indexOf(G.cid), t0: performance.now(), snaps: [], state: null, ended: false, remote: [null, null], lastSend: 0, frame: 0, models: [], ents: new Map(), particles: [], shake: 0, flash: 0, lastScore: [0, 0], clock: payload.seconds, active: false, youPlay: false, focus: null };
    S.kits = pickKits(payload.teams);
    $("n0").textContent = payload.teams[0].name; $("n1").textContent = payload.teams[1].name; $("n0").style.color = S.kits[0].shirt; $("n1").style.color = S.kits[1].shirt;
    $("s0").textContent = 0; $("s1").textContent = 0; $("clock").textContent = fmt(payload.seconds);
    $("matchKicker").textContent = payload.kind === "final" ? "GRANDE FINAL" : payload.chaos ? "MODO CAOS" : "PARTIDA RÁPIDA";
    setHint(); setCam(store.get("6a7Cam", "orig")); S.active = !!(S.myTeam >= 0 && payload.humanControl);
    updateTouch();
    if (host) { const eng = new Engine.Match({ kind: payload.kind, seconds: payload.seconds, chaos: payload.chaos, humanControl: payload.humanControl, teams: payload.teams }, { rng: seeded(payload.seed), humans: payload.controllers.map(c => !!c) }); S.eng = eng; }
    if (!window.THREE) { $("loading3d").style.display = "grid"; $("loading3d").innerHTML = "Não foi possível carregar o Three.js (CDN). Verifique a internet.<br>" + (host ? "A partida está sendo resolvida automaticamente…" : "Aguarde o anfitrião."); if (host) headless(); return; }
    $("loading3d").style.display = "grid"; $("loading3d").textContent = "Carregando estádio 3D…";
    Promise.all([loadSkin(), loadWolf()]).then(([img, wolf]) => { if (!S || S.dead) return; S.wolf = wolf; try { build(img); $("loading3d").style.display = "none"; S.raf = requestAnimationFrame(loop); } catch (e) { console.error(e); $("loading3d").innerHTML = "Falha ao iniciar o 3D: " + esc(e.message) + (host ? "<br>Resolvendo a partida automaticamente…" : ""); if (host) headless(); } });
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku); window.addEventListener("resize", onResize); S.listen = true;
  }
  function seeded(seed) { let s = seed >>> 0 || 1; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function headless() { // sem 3D: o anfitrião ainda resolve a partida (acelerada) para ninguém ficar preso
    const s = S; s.timer = setInterval(() => { if (!S || S !== s || s.ended) return clearInterval(s.timer); for (let i = 0; i < 40; i++) s.eng.step(1 / 60); for (const e of s.eng.drain()) if (e.type === "end") { s.ended = true; emit("match:end", { score: e.score, goals: e.goals }); } }, 30);
  }
  function stop() {
    if (!S) return; S.dead = true; cancelAnimationFrame(S.raf); clearInterval(S.timer); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("resize", onResize);
    if (S.renderer) { S.renderer.dispose(); S.renderer.domElement.remove(); } S = null; devClose(); $("touch").classList.add("hidden");
  }
  function pickKits(teams) {
    const k = teams.map(t => { if (t.kit) return { shirt: t.kit.shirt, shorts: t.kit.shorts, sock: t.kit.shirt }; const [a, b] = pal(t.sel); return { shirt: a, shorts: b, sock: a }; });
    if (colorDist(k[0].shirt, k[1].shirt) < 110) { const alt = colorDist(k[1].shorts, k[0].shirt) > 110 && k[1].shorts !== "#ffffff" ? k[1].shorts : "#d33a3a"; k[1] = { shirt: alt, shorts: k[1].shirt, sock: alt }; if (colorDist(k[0].shirt, k[1].shirt) < 110) k[1].shirt = k[1].sock = "#222a38"; }
    return k;
  }
  function loadSkin() { return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = "/minecraft-steve/textures/steve.png"; }); }

  // Lobo (modelo 3D do Minecraft, em public/dog). Se falhar, os cachorros viram caixas.
  function loadWolf() {
    return fetch("/dog/wolf.json").then(r => r.json()).then(j => new Promise(res => {
      const pos = new Float32Array(j.pos.length); for (let i = 0; i < pos.length; i++) pos[i] = j.pos[i] * .1;
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(j.uv), 2)); geo.computeVertexNormals();
      new THREE.TextureLoader().load("/dog/wolf.png", tex => { tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace; res({ geo, mat: new THREE.MeshLambertMaterial({ map: tex, alphaTest: .5, side: THREE.DoubleSide }) }); }, undefined, () => res(null));
    })).catch(() => null);
  }
  // ---------------------------------------------------------------- cena
  function build(skin) {
    const wrap = $("stage"), w = wrap.clientWidth || 800, h = wrap.clientHeight || 450;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fc1ea); scene.fog = new THREE.Fog(0x8fc1ea, 110, 240);
    const camera = new THREE.PerspectiveCamera(46, w / h, .1, 400), renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75)); renderer.setSize(w, h); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace;
    wrap.insertBefore(renderer.domElement, wrap.firstChild); renderer.domElement.addEventListener("click", onStageClick);
    scene.add(new THREE.HemisphereLight(0xdff0ff, 0x4a7a4a, 1.7)); const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-30, 60, 25); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -72; sc.right = 72; sc.top = 48; sc.bottom = -48; sc.near = 5; sc.far = 160; sun.shadow.bias = -.0004; scene.add(sun);
    scene.add(buildPitch()); buildGoals(scene);
    Object.assign(S, { scene, camera, renderer, camPos: new THREE.Vector3(0, 60, 72), camLook: new THREE.Vector3(0, 0, 4), skin });
    // jogadores
    S.payload.teams.forEach((t, ti) => t.lineup.forEach((p, i) => { const m = playerModel(ti, i, p, t); scene.add(m.group); m.group.userData.idx = S.models.length; S.models.push(m); }));
    // bola
    const bt = ballTexture(), ball = new THREE.Mesh(new THREE.SphereGeometry(.55, 20, 14), new THREE.MeshStandardMaterial({ map: bt, roughness: .6 })); ball.castShadow = true; scene.add(ball);
    const blob = new THREE.Mesh(new THREE.CircleGeometry(.6, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .35 })); blob.rotation.x = -Math.PI / 2; blob.position.y = .03; scene.add(blob);
    S.ball = ball; S.blob = blob; S.bt = bt; onResize();
  }
  function buildPitch() {
    const PX = 14, cw = 112 * PX, ch = 72 * PX, c = document.createElement("canvas"); c.width = cw; c.height = ch; const g = c.getContext("2d"), X = x => (x + 56) * PX, Z = z => (z + 36) * PX;
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? "#2d8a47" : "#34964f"; g.fillRect(i * cw / 16, 0, cw / 16 + 1, ch); }
    g.strokeStyle = "#f4fbf4"; g.lineWidth = PX * .22; g.lineCap = "round"; const rect = (x1, z1, x2, z2) => g.strokeRect(X(x1), Z(z1), (x2 - x1) * PX, (z2 - z1) * PX), arc = (x, z, r, a0, a1) => { g.beginPath(); g.arc(X(x), Z(z), r * PX, a0, a1); g.stroke(); };
    rect(-L, -W, L, W); g.beginPath(); g.moveTo(X(0), Z(-W)); g.lineTo(X(0), Z(W)); g.stroke(); arc(0, 0, 9, 0, Math.PI * 2); g.fillStyle = "#f4fbf4"; g.beginPath(); g.arc(X(0), Z(0), .45 * PX, 0, 7); g.fill();
    for (const s of [-1, 1]) { rect(s < 0 ? -L : L - 16, -19, s < 0 ? -L + 16 : L, 19); rect(s < 0 ? -L : L - 5.5, -9, s < 0 ? -L + 5.5 : L, 9); arc(s * (L - 11), 0, 9, s < 0 ? -.93 : Math.PI - .93, s < 0 ? .93 : Math.PI + .93); g.beginPath(); g.arc(X(s * (L - 11)), Z(0), .35 * PX, 0, 7); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(112, 72), new THREE.MeshStandardMaterial({ map: t, roughness: 1 })); m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
    const grp = new THREE.Group(); grp.add(m); const out = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x2a6b3d, roughness: 1 })); out.rotation.x = -Math.PI / 2; out.position.y = -.05; out.receiveShadow = true; grp.add(out); return grp;
  }
  function buildGoals(scene) {
    const white = new THREE.MeshStandardMaterial({ color: 0xf6f6f2 }), net = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: .28 });
    for (const s of [-1, 1]) {
      const g = new THREE.Group(), post = (z) => { const p = new THREE.Mesh(new THREE.BoxGeometry(.3, Engine.GOAL_H, .3), white); p.position.set(0, Engine.GOAL_H / 2, z); p.castShadow = true; g.add(p); };
      post(-GH); post(GH); const bar = new THREE.Mesh(new THREE.BoxGeometry(.3, .3, GH * 2 + .3), white); bar.position.y = Engine.GOAL_H; g.add(bar);
      const back = new THREE.Mesh(new THREE.BoxGeometry(.05, Engine.GOAL_H, GH * 2, 1, 6, 12), net); back.position.set(s * 3.2, Engine.GOAL_H / 2, 0); g.add(back);
      const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, .05, GH * 2, 5, 1, 12), net); top.position.set(s * 1.6, Engine.GOAL_H, 0); g.add(top);
      for (const z of [-GH, GH]) { const side = new THREE.Mesh(new THREE.BoxGeometry(3.2, Engine.GOAL_H, .05, 5, 6, 1), net); side.position.set(s * 1.6, Engine.GOAL_H / 2, z); g.add(side); }
      g.position.x = s * L; scene.add(g);
    }
  }
  function ballTexture() {
    const c = document.createElement("canvas"); c.width = 128; c.height = 64; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 128, 64); g.fillStyle = "#222";
    for (let i = 0; i < 10; i++) { const x = (i * 13 + 6) % 128, y = 10 + ((i * 29) % 44); g.beginPath(); for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 - Math.PI / 2; g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); } g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // ---------------------------------------------------------------- personagens (skin do Minecraft)
  const SKIN_TONES = ["#ffffff", "#f2d2b6", "#d9a77f", "#b9824f", "#7d4f31"];
  function uvBox(w, h, d, rects, mat) { // rects: [px,nx,py,ny,pz,nz] em pixels (x,y,w,h) da skin 64×64
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    rects.forEach((r, f) => { const u0 = r[0] / 64, u1 = (r[0] + r[2]) / 64, v0 = 1 - r[1] / 64, v1 = 1 - (r[1] + r[3]) / 64; uv.setXY(f * 4, u0, v0); uv.setXY(f * 4 + 1, u1, v0); uv.setXY(f * 4 + 2, u0, v1); uv.setXY(f * 4 + 3, u1, v1); });
    const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
  }
  function kitTexture(kit, gk, tone, number) {
    const key = [kit.shirt, kit.shorts, gk, tone, number].join("|"); S.texCache = S.texCache || {}; if (S.texCache[key]) return S.texCache[key];
    const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    if (S.skin) g.drawImage(S.skin, 0, 0); else { g.fillStyle = "#c68a5e"; g.fillRect(0, 0, 64, 64); }
    const shirt = gk ? "#7ddc3c" : kit.shirt, shorts = gk ? "#1a1f2b" : kit.shorts, sock = gk ? "#7ddc3c" : kit.sock, ink = lum(shirt) > 150 ? "#14202e" : "#ffffff";
    g.fillStyle = tone === "#ffffff" ? "#00000000" : tone; g.globalCompositeOperation = "multiply"; g.fillRect(0, 0, 32, 16); g.globalCompositeOperation = "source-over";
    g.fillStyle = shirt; g.fillRect(16, 16, 24, 16); g.fillRect(40, 16, 16, 12); g.fillStyle = tone === "#ffffff" ? "#c68a5e" : tone; g.fillRect(40, 28, 16, 4);
    g.fillStyle = shorts; g.fillRect(0, 16, 16, 10); g.fillStyle = sock; g.fillRect(0, 26, 16, 6);
    g.fillStyle = shade(shirt, -.18); g.fillRect(16, 31, 24, 1); g.fillRect(20, 20, 8, 1); // gola/barra
    g.fillStyle = ink; g.font = "bold 9px monospace"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(number || ""), 36, 27);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return S.texCache[key] = t;
  }
  const lum = h => { const [r, g, b] = hexToRgb(h); return .299 * r + .587 * g + .114 * b; }, shade = (h, k) => { const [r, g, b] = hexToRgb(h).map(v => Math.max(0, Math.min(255, Math.round(v * (1 + k))))); return `rgb(${r},${g},${b})`; };
  function playerModel(ti, i, p, team) {
    const gk = p.slot === "GOL", tone = SKIN_TONES[hash(p.id) % SKIN_TONES.length], tex = kitTexture(S.kits[ti], gk, tone, p.num || i + 1), mat = new THREE.MeshLambertMaterial({ map: tex });
    const s = .095, grp = new THREE.Group(), body = new THREE.Group(); grp.add(body);
    const head = uvBox(8 * s, 8 * s, 8 * s, [[16, 8, 8, 8], [0, 8, 8, 8], [8, 0, 8, 8], [16, 0, 8, 8], [8, 8, 8, 8], [24, 8, 8, 8]], mat); head.position.y = 28 * s; body.add(head);
    const tor = uvBox(8 * s, 12 * s, 4 * s, [[28, 20, 4, 12], [16, 20, 4, 12], [20, 16, 8, 4], [28, 16, 8, 4], [20, 20, 8, 12], [32, 20, 8, 12]], mat); tor.position.y = 18 * s; body.add(tor);
    const limb = (x, y, isArm) => { const pv = new THREE.Group(); pv.position.set(x * s, y * s, 0); const r = isArm ? [[48, 20, 4, 12], [40, 20, 4, 12], [44, 16, 4, 4], [48, 16, 4, 4], [44, 20, 4, 12], [52, 20, 4, 12]] : [[8, 20, 4, 12], [0, 20, 4, 12], [4, 16, 4, 4], [8, 16, 4, 4], [4, 20, 4, 12], [12, 20, 4, 12]]; const m = uvBox(4 * s, 12 * s, 4 * s, r, mat); m.position.y = -6 * s; pv.add(m); body.add(pv); return pv; };
    const armL = limb(6, 24, true), armR = limb(-6, 24, true), legL = limb(2, 12, false), legR = limb(-2, 12, false);
    const lab = labelSprite(p.name, S.kits[ti].shirt); lab.position.y = 3.6; grp.add(lab);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.95, 1.2, 28), new THREE.MeshBasicMaterial({ color: ti === 0 ? 0x5aa0ff : 0xff6a6a, transparent: true, opacity: .95, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .06; ring.visible = false; grp.add(ring);
    return { group: grp, body, head, armL, armR, legL, legR, ring, lab, phase: Math.random() * 6, gk };
  }
  function labelSprite(name, color) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 56; const g = c.getContext("2d"); g.fillStyle = "rgba(10,14,22,.78)"; const w = Math.min(248, 28 + g.measureText(name).width); g.font = "bold 26px Arial"; const tw = Math.min(240, g.measureText(name).width + 28);
    g.fillRect((256 - tw) / 2, 6, tw, 40); g.fillStyle = color; g.fillRect((256 - tw) / 2, 6, 6, 40); g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(name.length > 18 ? name.slice(0, 17) + "…" : name, 128 + 3, 27);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); sp.scale.set(4.6, 1.0, 1); sp.renderOrder = 10; return sp;
  }

  // ---------------------------------------------------------------- loop
  let lastT = 0;
  function loop(ts) {
    if (!S || S.dead) return; S.raf = requestAnimationFrame(loop);
    const dt = Math.min(.05, (ts - (lastT || ts)) / 1000); lastT = ts; S.frame++;
    let st;
    if (S.host) {
      const eng = S.eng; sendInputToEngine(eng);
      S.acc = (S.acc || 0) + dt * eng.dev.timeScale; let n = 0; while (S.acc >= 1 / 60 && n++ < 24) { eng.step(1 / 60); S.acc -= 1 / 60; }
      for (const e of eng.drain()) hostEvent(e);
      st = eng.state(); if (S.frame % 3 === 0 && !S.ended) emit("match:snap", compact(st));
    } else st = interpolate(ts);
    if (st) { S.state = st; renderState(st, dt); hud(st); }
    S.renderer.render(S.scene, S.camera);
    if (!S.host && S.active) sendInput(ts);
  }
  function compact(st) { const r = v => Math.round(v * 100) / 100; return { t: r(st.t), left: r(st.left), score: st.score, golden: st.golden, pause: st.pause, total: st.total, quake: st.quake, youPlay: st.youPlay, fx: st.fx, players: st.players.map(p => p.map(r)), ball: st.ball.map(r), ents: st.ents.map(e => [e[0], r(e[1]), r(e[2]), r(e[3]), r(e[4]), r(e[5]), e[6]]) }; }
  function onSnap(s) { if (!S || S.host) return; S.snaps.push({ at: performance.now(), s }); if (S.snaps.length > 12) S.snaps.shift(); }
  function interpolate(ts) {
    const q = S.snaps; if (!q.length) return S.state; const target = performance.now() - 110; let a = q[0], b = q[q.length - 1];
    for (let i = q.length - 1; i > 0; i--) if (q[i - 1].at <= target) { a = q[i - 1]; b = q[i]; break; }
    if (a === b || target >= b.at) return b.s; if (target <= a.at) return a.s;
    const k = (target - a.at) / (b.at - a.at), A = a.s, B = b.s;
    return { ...B, players: B.players.map((p, i) => { const o = A.players[i]; return [lerp(o[0], p[0], k), lerp(o[1], p[1], k), lerp(o[2], p[2], k), angLerp(o[3], p[3], k), p[4], p[5], p[6]]; }), ball: B.ball.map((v, i) => i < 3 ? lerp(A.ball[i], v, k) : v), left: lerp(A.left, B.left, k) };
  }

  // ---------------------------------------------------------------- render
  function renderState(st, dt) {
    const cam = S.camera, ms = S.models, T = performance.now() / 1000;
    st.players.forEach((p, i) => {
      const m = ms[i], dead = p[6] & 1; m.group.visible = !dead; if (dead) return;
      m.group.position.set(p[0], p[1], p[2]); m.group.scale.setScalar(p[7] || 1); m.group.rotation.y = p[3]; m.body.rotation.x = p[5] * (Math.PI / 2) * -1; m.body.position.y = p[5] * .6 - 0; m.group.rotation.z = 0;
      const sp = Math.min(1, p[4] / 8), sw = Math.sin(T * (8 + sp * 8) + m.phase) * (.15 + sp * .85) * .9; m.legL.rotation.x = sw; m.legR.rotation.x = -sw; m.armL.rotation.x = -sw * .9; m.armR.rotation.x = sw * .9;
      m.head.scale.setScalar(p[6] & 2 ? 2.2 : 1); m.head.position.y = (p[6] & 2 ? 28 + 6 : 28) * .095; m.lab.position.y = p[6] & 2 ? 4.4 : 3.6; m.ring.visible = !!(p[6] & 4); if (p[6] & 4) m.ring.rotation.z = T * 2;
      if (p[6] & 8 && p[4] > 1) { m.armL.rotation.x = -.5; m.armR.rotation.x = .3; }
      if (p[6] & 16) { m.armL.rotation.x = -2.5; m.armR.rotation.x = -2.5; m.legL.rotation.x = .5; m.legR.rotation.x = -.5; }
    });
    const b = st.ball, bs = b[3]; S.ball.position.set(b[0], b[1], b[2]); S.ball.scale.setScalar(bs); S.ball.rotation.z = -b[4] * .6; S.ball.rotation.x = b[4] * .2; S.blob.position.set(b[0], .04, b[2]); S.blob.scale.setScalar(bs * (1 - Math.min(.6, b[1] / 10))); S.blob.material.opacity = .35 * (1 - Math.min(.7, b[1] / 12));
    const fz = b[5] || 0, glow = fz > 0 ? (fz < 1.5 ? .5 + .5 * Math.sin(T * 30) : .2 + .2 * Math.sin(T * 8)) : 0; S.ball.material.emissive.setRGB(glow, glow * .25, 0);
    renderEnts(st.ents, T); stepParticles(dt); cameraUpdate(st, dt);
    if (st.quake) { S.camera.position.x += Math.sin(T * 47) * .5; S.camera.position.y += Math.cos(T * 39) * .35; }
  }
  function renderEnts(list, T) {
    const seen = new Set();
    for (const e of list) {
      const [k, x, y, z, rot, r, id] = e; seen.add(id); let o = S.ents.get(id);
      if (!o) { o = makeEnt(k); if (!o) continue; S.scene.add(o); S.ents.set(id, o); }
      o.position.set(x, y, z);
      if (k === "dog") { o.rotation.y = rot; o.children.forEach((c, i) => { if (c.userData.leg) c.rotation.x = Math.sin(T * 14 + i) * .6; }); }
      if (k === "flame") { const s = r * (1 + Math.sin(T * 12 + id) * .12); o.scale.set(s, s * (1.2 + Math.sin(T * 9 + id) * .3), s); }
      if (k === "meteor") o.rotation.y = T * 3;
    }
    for (const [id, o] of S.ents) if (!seen.has(id)) { S.scene.remove(o); S.ents.delete(id); }
  }
  function makeEnt(k) {
    const g = new THREE.Group();
    if (k === "meteor") { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.95, 0), new THREE.MeshStandardMaterial({ color: 0xffd21c, emissive: 0xb86a00, emissiveIntensity: .9 })); m.castShadow = true; g.add(m); }
    else if (k === "ball") { const m = new THREE.Mesh(new THREE.SphereGeometry(.55, 14, 10), new THREE.MeshStandardMaterial({ map: S.bt })); m.castShadow = true; g.add(m); }
    else if (k === "dog") {
      if (S.wolf) { const m = new THREE.Mesh(S.wolf.geo, S.wolf.mat); m.castShadow = true; g.add(m); }
      else { const fur = new THREE.MeshLambertMaterial({ color: 0x8a5a32 }), box = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fur); m.position.set(x, y, z); m.castShadow = true; g.add(m); }; box(.7, .7, 1.5, 0, .85, 0); box(.6, .6, .6, 0, 1.2, .95); }
    }
    else if (k === "torch") { const st = new THREE.Mesh(new THREE.BoxGeometry(.25, 3, .25), new THREE.MeshLambertMaterial({ color: 0x5b3a1e })); st.position.y = 1.5; g.add(st); const f = new THREE.Mesh(new THREE.ConeGeometry(.7, 1.6, 6), new THREE.MeshBasicMaterial({ color: 0xff7a18 })); f.position.y = 3.6; g.add(f); const pl = new THREE.PointLight(0xff8a30, 30, 18); pl.position.y = 3.6; g.add(pl); }
    else if (k === "flame") { const f = new THREE.Mesh(new THREE.ConeGeometry(.9, 1.8, 6), new THREE.MeshBasicMaterial({ color: 0xff5a10, transparent: true, opacity: .85 })); f.position.y = .9; g.add(f); const f2 = new THREE.Mesh(new THREE.ConeGeometry(.5, 1.1, 5), new THREE.MeshBasicMaterial({ color: 0xffd23a })); f2.position.y = .6; g.add(f2); }
    else return null; return g;
  }
  function burst(x, z, colors, n = 30, spd = 9) {
    if (!S || !S.scene) return; const g = new THREE.Group(); g.position.set(x, 1.4, z);
    for (let i = 0; i < n; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, .2), new THREE.MeshBasicMaterial({ color: colors[i % colors.length] })); c.userData.v = new THREE.Vector3((Math.random() - .5) * spd, Math.random() * spd, (Math.random() - .5) * spd); g.add(c); }
    S.scene.add(g); S.particles.push({ g, life: 1.8 });
  }
  function stepParticles(dt) { for (let i = S.particles.length - 1; i >= 0; i--) { const f = S.particles[i]; f.life -= dt; f.g.children.forEach(c => { c.position.addScaledVector(c.userData.v, dt); c.userData.v.y -= 14 * dt; if (c.position.y < -1.3) { c.position.y = -1.3; c.userData.v.set(0, 0, 0); } }); if (f.life <= 0) { S.scene.remove(f.g); f.g.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); }); S.particles.splice(i, 1); } } }
  function setFov(f) { if (Math.abs(S.camera.fov - f) > .1) { S.camera.fov = f; S.camera.updateProjectionMatrix(); } }
  function cameraUpdate(st, dt) {
    const cam = S.camera, b = st.ball, ps = st.players, portrait = S.camera.aspect < 1;
    const k = 1 - Math.exp(-dt * 4.5);
    let mine = -1; if (S.myTeam >= 0 && S.active) ps.forEach((p, i) => { if ((p[6] & 4) && Math.floor(i / 11) === S.myTeam) mine = i; });
    let carrier = -1, bd = 1e9; ps.forEach((p, i) => { if (p[6] & 1) return; const d = Math.hypot(p[0] - b[0], p[2] - b[2]); if (d < bd) { bd = d; carrier = i; } });
    const locked = S.focus != null && ps[S.focus] && !(ps[S.focus][6] & 1) ? S.focus : -1; const focus = locked >= 0 ? locked : mine >= 0 ? mine : carrier, P = focus >= 0 ? ps[focus] : null;
    if (camMode === "first" && P) {
      // Primeira pessoa: altura dos olhos do atleta, olhando para onde ele está virado.
      const dir = new THREE.Vector3(Math.sin(P[3]), 0, Math.cos(P[3]));
      const eye = new THREE.Vector3(P[0], 2.1 + P[1], P[2]), kk = 1 - Math.exp(-dt * 16);
      S.camPos.lerp(eye, kk);
      S.camLook.lerp(new THREE.Vector3(P[0] + dir.x * 22, 1.3, P[2] + dir.z * 22), kk);
      setFov(portrait ? 84 : 72); cam.position.copy(S.camPos); cam.lookAt(S.camLook); return;
    }
    let want, look;
    if (camMode === "follow" && P) {
      // Acompanhar: lateral tipo transmissão, seguindo o jogador com a bola (ou o seu).
      const fx = THREE.MathUtils.clamp(P[0], -L + 12, L - 12) * .85;
      want = new THREE.Vector3(fx, portrait ? 26 : 18, 44); look = new THREE.Vector3(fx * .9, 1, THREE.MathUtils.clamp(P[2] * .4, -8, 8));
      setFov(portrait ? 66 : 50);
    } else {
      // Panorâmica: campo inteiro, sempre igual.
      want = new THREE.Vector3(0, portrait ? 84 : 60, portrait ? 92 : 74); look = new THREE.Vector3(0, 0, 3);
      setFov(portrait ? 64 : 46);
    }
    S.camPos.lerp(want, k); S.camLook.lerp(look, k);
    cam.position.copy(S.camPos); cam.position.y = Math.max(2, cam.position.y); cam.lookAt(S.camLook);
  }
  // Clicar num jogador: a câmera passa a segui-lo. Clicar no gramado: volta ao automático.
  function onStageClick(e) {
    if (!S || !S.renderer || !S.models.length) return;
    const r = S.renderer.domElement.getBoundingClientRect(), mv = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(mv, S.camera);
    const hits = ray.intersectObjects(S.models.filter(x => x.group.visible).map(x => x.group), true);
    let idx = null; if (hits.length) { let o = hits[0].object; while (o && o.userData.idx === undefined) o = o.parent; if (o) idx = o.userData.idx; }
    if (idx == null) { S.focus = null; toast("Câmera automática"); return; }
    setCam("follow"); S.focus = idx;
    const pl = S.payload.teams[Math.floor(idx / 11)].lineup[idx % 11]; toast("Câmera seguindo " + pl.name);
  }
  function onResize() { if (!S || !S.renderer) return; const w = $("stage").clientWidth, h = $("stage").clientHeight; S.camera.aspect = w / h; S.camera.updateProjectionMatrix(); S.renderer.setSize(w, h); }
  function setCam(m) { camMode = m; if (S) S.focus = null; store.set("6a7Cam", m); document.querySelectorAll("[data-cam]").forEach(b => b.classList.toggle("active", b.dataset.cam === m)); }
  document.querySelectorAll("[data-cam]").forEach(b => b.onclick = () => setCam(b.dataset.cam));

  // ---------------------------------------------------------------- HUD e eventos
  function hud(st) {
    $("clock").textContent = (st.golden ? "OURO " : "") + fmt(st.left); if (st.score[0] !== S.lastScore[0] || st.score[1] !== S.lastScore[1]) { S.lastScore = st.score.slice(); }
    $("s0").textContent = st.score[0]; $("s1").textContent = st.score[1];
    if (st.youPlay && !S.youPlay) { S.youPlay = true; S.active = S.myTeam >= 0; updateTouch(); setHint(); }
  }
  function banner(html, cls, ms) { const b = $("banner"); b.className = "banner " + (cls || ""); b.innerHTML = html; clearTimeout(banner._t); banner._t = setTimeout(() => b.classList.add("hidden"), ms || 3500); }
  function handleEvent(e) {
    switch (e.type) {
      case "goal": { const f = $("goalFx"); f.innerHTML = `<b>GOOOL!</b><span>${esc(e.player)} · ${e.minute}'</span>`; f.classList.remove("hidden"); setTimeout(() => f && f.classList.add("hidden"), 2600); Sound.goal(); break; }
      case "chaos": Sound.event(); if (e.name === "youplay") banner(`VOCÊ JOGA!<small>${S.myTeam >= 0 ? "Você controla os jogadores até o fim da partida!" : "Os participantes assumiram o controle!"}</small>`, "total", 5000); else banner(`${e.total ? "CAOS TOTAL · " : "EVENTO · "}${esc(e.label)}<small>${e.dur < 100 ? Math.round(e.dur) + " segundos" : ""}</small>`, e.total ? "total" : "", 3200); break;
      case "golden": banner(`GOL DE OURO!<small>O próximo gol decide a partida</small>`, "", 4000); Sound.whistle(); break;
      case "whistle": Sound.whistle(); break; case "kick": Sound.kick(); break;
      case "boom": Sound.boom(); burst(e.x, e.z, [0xff3b18, 0xffa51f, 0xffe45c], 40, 12); break;
      case "burn": burst(e.x, e.z, [0x222222, 0xff5a10, 0xffb000], 22, 7); break;
      case "impact": burst(e.x, e.z, [0xffd21c, 0xb86a00], 12, 6); break;
    }
  }
  function hostEvent(e) { handleEvent(e); if (e.type === "end") { if (!S.ended) { S.ended = true; emit("match:end", { score: e.score, goals: e.goals }); } return; } if (e.type !== "touch" && e.type !== "save" && e.type !== "kick") emit("match:event", { ...e, score: S.eng.score.slice() }); }
  function onEvent(e) { if (S && !S.host) handleEvent(e); }
  function onEnd(r) {
    if (!S) return; S.ended = true; const t = S.payload.teams, rm = G.room;
    $("result").classList.remove("hidden"); $("s0").textContent = r.score[0]; $("s1").textContent = r.score[1];
    const w = r.winner; $("resTitle").textContent = r.kind === "final" ? (w != null ? `CAMPEÃO: ${t[w].name.toUpperCase()}` : "FIM DE JOGO") : w == null ? "EMPATE" : `VITÓRIA · ${t[w].name.toUpperCase()}`;
    $("resScore").innerHTML = `${r.score[0]} × ${r.score[1]}`; $("resMsg").textContent = r.pens ? `Pênaltis: ${r.pens[0]} × ${r.pens[1]}` : r.forced ? "Partida encerrada pelo servidor." : "";
    $("resGoals").innerHTML = (r.goals || []).map(g => `<li>${g.min}' · ${esc(g.player)} (${esc(t[g.team] ? t[g.team].name : "")})</li>`).join("");
    const fin = r.kind === "final", c = $("resContinue"); c.textContent = fin ? "VER CAMPEONATO" : (rm && rm.hostCid === G.cid ? "JOGAR DE NOVO" : "AGUARDANDO O ANFITRIÃO");
    c.disabled = !fin && !(rm && rm.hostCid === G.cid); Sound.whistle();
    c.onclick = () => { if (fin) { $("result").classList.add("hidden"); stop(); show("tour"); Tour.render(); } else emit("playAgain"); };
  }

  // ---------------------------------------------------------------- entrada
  // ---------------------------------------------------------------- devmode (Konami)
  // Konami: ↑ ↑ ↓ ↓ ← → ← → B A. Em celular (sem teclado): 10 toques rápidos no título da partida.
  const KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
  let konamiBuf = [], devTimer = null, devLast = { f: 0, t: 0 }, tapN = 0, tapT = 0;
  function konamiPush(k) {
    konamiBuf.push(k); if (konamiBuf.length > KONAMI.length) konamiBuf.shift();
    if (konamiBuf.join(",") === KONAMI.join(",")) { konamiBuf = []; devOpen(); }
  }
  $("matchKicker").addEventListener("click", () => { const now = Date.now(); if (now - tapT > 3000) tapN = 0; tapT = now; if (++tapN >= 10) { tapN = 0; devOpen(); } });
  function devOpen() {
    if (!S) return;
    let p = $("devPanel");
    if (!p) {
      p = document.createElement("div"); p.id = "devPanel"; p.className = "dev-panel";
      p.innerHTML = devHtml(); document.body.appendChild(p);
      p.addEventListener("click", devClick); p.addEventListener("input", devInput);
    }
    p.classList.remove("hidden"); devLast = { f: S.frame, t: performance.now() };
    clearInterval(devTimer); devTimer = setInterval(devStats, 500); devStats();
  }
  function devClose() { clearInterval(devTimer); devTimer = null; const p = $("devPanel"); if (p) p.classList.add("hidden"); }
  function devStats() {
    if (!S) return; const now = performance.now(), fps = Math.round((S.frame - devLast.f) / Math.max(1, (now - devLast.t)) * 1000);
    devLast = { f: S.frame, t: now }; const el = $("devStats"); if (el) el.textContent = "FPS: " + fps + " · tempo " + (S.eng ? S.eng.dev.timeScale : 1) + "×";
  }
  function devHtml() {
    const E = Engine;
    const rows = E.CHAOS_LIST.map(n => '<div class="dev-row"><span>' + esc(E.CHAOS[n].label) + '</span><button data-trig="' + n + '">▶ disparar</button><label><input type="checkbox" data-keep="' + n + '"> manter</label></div>').join("");
    const slider = (key, label, min, max, step) => '<label class="dev-slider">' + label + ' <output>1×</output><input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="1" data-slider="' + key + '"></label>';
    return '<div class="dev-card"><div class="dev-head"><b>DEVMODE</b><button data-dev="close">×</button></div>' +
      '<div class="dev-sec"><h4>EVENTOS DO CAOS</h4><div class="dev-list">' + rows + '</div>' +
      '<div class="dev-btns"><button data-dev="chaosOn">LIGAR CAOS</button><button data-dev="chaosOff">DESLIGAR CAOS</button><button data-dev="clearFx">LIMPAR EFEITOS</button></div></div>' +
      '<div class="dev-sec"><h4>PARTIDA</h4><div class="dev-btns"><button data-dev="addTime">+30 s</button><button data-dev="end">ENCERRAR</button><button data-dev="goal0">GOL AZUL</button><button data-dev="goal1">GOL VERMELHO</button><button data-dev="resetBall">REINICIAR BOLA</button></div>' +
      slider("timeScale", "Velocidade do tempo", .25, 4, .25) + slider("speed", "Velocidade dos jogadores", .5, 2.5, .1) + slider("kick", "Força dos chutes", .5, 2.5, .1) + '</div>' +
      '<div class="dev-sec"><h4>VISUAL (só no seu aparelho)</h4><div class="dev-btns"><button data-dev="names">NOMES: LIGADOS</button></div><p id="devStats" class="muted">FPS: —</p></div>' +
      '<p class="muted">Os comandos valem para todos na partida. Abra com ↑ ↑ ↓ ↓ ← → ← → B A.</p></div>';
  }
  function devClick(e) {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.trig) return emit("dev:cmd", { op: "trigger", name: b.dataset.trig });
    switch (b.dataset.dev) {
      case "close": return devClose();
      case "chaosOn": return emit("dev:cmd", { op: "chaosOn", on: true });
      case "chaosOff": return emit("dev:cmd", { op: "chaosOn", on: false });
      case "clearFx": return emit("dev:cmd", { op: "clearFx" });
      case "addTime": return emit("dev:cmd", { op: "addTime", s: 30 });
      case "end": return emit("dev:cmd", { op: "end" });
      case "goal0": return emit("dev:cmd", { op: "goal", team: 0 });
      case "goal1": return emit("dev:cmd", { op: "goal", team: 1 });
      case "resetBall": return emit("dev:cmd", { op: "resetBall" });
      case "names": { const on = b.textContent.includes("DESLIGADOS"); b.textContent = "NOMES: " + (on ? "LIGADOS" : "DESLIGADOS"); if (S) S.models.forEach(m => { if (m.lab) m.lab.visible = !on; }); return; }
    }
  }
  function devInput(e) {
    const t = e.target;
    if (t.dataset.keep) return emit("dev:cmd", { op: "keep", name: t.dataset.keep, on: t.checked });
    if (t.dataset.slider) { const v = +t.value; const out = t.parentElement.querySelector("output"); if (out) out.textContent = v + "×"; emit("dev:cmd", { op: t.dataset.slider, v }); }
  }
  // Comando de devmode vindo do servidor: só o anfitrião (quem roda o motor) aplica.
  function onDevApply(cmd) { if (S && S.host && S.eng) S.eng.applyDev(cmd); }
  function setHint() {
    const h = $("matchHint"); if (!S) return; const p = S.payload;
    if (S.myTeam < 0 && p.humanControl) h.textContent = "Você não está nesta final: assistindo. Os controles aparecem para os dois finalistas humanos.";
    else h.textContent = S.myTeam >= 0 && (p.humanControl || S.youPlay) ? "Controles: WASD/setas mover · Espaço (segure e solte) chutar · E passar · Q trocar jogador · Shift correr." : p.chaos ? "Os bots jogam sozinhos. Se o raro evento VOCÊ JOGA surgir, o controle é seu!" : "Partida simulada pela inteligência artificial. Aproveite!";
  }
  const kd = e => { if (G.screen !== "match") return; const k = e.key.toLowerCase(); konamiPush(k); if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault(); if (!keys[k]) { if (k === "e" || k === "j") latch.pass = true; if (k === "q" || k === "k") latch.sw = true; } keys[k] = true; };
  const ku = e => { keys[e.key.toLowerCase()] = false; };
  function camBasis() { const f = new THREE.Vector3(); S.camera.getWorldDirection(f); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize(); return [f.x, f.z]; }
  function readInput() {
    const [fx, fz] = camBasis(), rx = -fz, rz = fx;
    let up = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0), rt = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
    up += -touchIn.dz; rt += touchIn.dx; const l = Math.hypot(up, rt) || 1, sc = l > 1 ? 1 / l : 1; up *= sc; rt *= sc;
    return { dx: fx * up + rx * rt, dz: fz * up + rz * rt, sprint: !!(keys.shift || touchIn.sprint), shoot: !!(keys[" "] || touchIn.shoot), passEdge: latch.pass, switchEdge: latch.sw };
  }
  function sendInputToEngine(eng) {
    for (let t = 0; t < 2; t++) {
      if (!S.payload.controllers[t]) continue;
      if (S.payload.controllers[t] === G.cid) { if (eng.cfg.humanControl || eng.youPlay) { eng.input(t, readInput()); latch.pass = latch.sw = false; } }
      else if (S.remote[t]) eng.input(t, S.remote[t]);
    }
  }
  function sendInput(ts) { if (ts - S.lastSend < 50) return; S.lastSend = ts; const i = readInput(); emit("match:input", i); latch.pass = latch.sw = false; }
  function onRemoteInput(m) { if (!S || !S.host) return; const t = S.payload.controllers.indexOf(m.cid); if (t < 0) return; const o = S.remote[t], i = m.input || {}; if (o) { i.passEdge = !!(i.passEdge || o.passEdge); i.switchEdge = !!(i.switchEdge || o.switchEdge); } S.remote[t] = { dx: +i.dx || 0, dz: +i.dz || 0, sprint: !!i.sprint, shoot: !!i.shoot, passEdge: !!i.passEdge, switchEdge: !!i.switchEdge }; }
  function updateTouch() {
    $("touch").classList.toggle("hidden", !(S && S.myTeam >= 0 && (S.payload.humanControl || S.youPlay)));
  }
  (function touchUI() {
    const stick = $("stick"), knob = stick.firstElementChild; let id = null;
    const move = e => { const r = stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2); const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } touchIn.dx = dx; touchIn.dz = dy; touchIn.sprint = l > .92; knob.style.transform = `translate(${dx * 30}px,${dy * 30}px)`; };
    stick.addEventListener("pointerdown", e => { id = e.pointerId; stick.setPointerCapture(id); move(e); e.preventDefault(); }); stick.addEventListener("pointermove", e => { if (e.pointerId === id) move(e); });
    const end = e => { if (e.pointerId !== id) return; id = null; touchIn.dx = touchIn.dz = 0; touchIn.sprint = false; knob.style.transform = ""; }; stick.addEventListener("pointerup", end); stick.addEventListener("pointercancel", end);
    const hold = (btn, on, off) => { btn.addEventListener("pointerdown", e => { on(); e.preventDefault(); }); ["pointerup", "pointercancel", "pointerleave"].forEach(ev => btn.addEventListener(ev, off)); };
    hold($("bShoot"), () => touchIn.shoot = true, () => touchIn.shoot = false); hold($("bPass"), () => latch.pass = true, () => {}); hold($("bSwitch"), () => latch.sw = true, () => {}); hold($("bRun"), () => touchIn.sprint = true, () => touchIn.sprint = false);
  })();
  // ---------------------------------------------------------------- tela cheia
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  $("fsBtn").onclick = () => {
    if (!fsEl()) {
      try { const p = ($("stage").requestFullscreen || $("stage").webkitRequestFullscreen).call($("stage")); if (p && p.catch) p.catch(() => toast("Tela cheia não disponível neste navegador.")); } catch (e) { toast("Tela cheia não disponível neste navegador."); }
      try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {}); } catch (e) {}
    } else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  };
  const fsChange = () => { $("fsBtn").textContent = fsEl() ? "SAIR DA TELA CHEIA" : "TELA CHEIA"; onResize(); };
  document.addEventListener("fullscreenchange", fsChange); document.addEventListener("webkitfullscreenchange", fsChange);
  return { start, stop, onSnap, onEvent, onEnd, onRemoteInput, onDevApply };
})();
