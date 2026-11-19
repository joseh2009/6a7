// Pênaltis da final em 3D. A sequência vem do servidor (todos veem o mesmo resultado); aqui só animamos.
// Câmera em terceira pessoa: fica atrás do cobrador, olhando para o gol.
(function () {
  const THREEREF = window.THREE;
  const SIDE_X = { L: -2.5, C: 0, R: 2.5 };
  const COLORS = [0x2f6fdc, 0xdc3c3c];
  const tween = (dur, fn) => new Promise(res => { const t0 = performance.now(); (function f(now) { const k = Math.min(1, (now - t0) / (dur * 1000)); fn(k); if (k < 1) requestAnimationFrame(f); else res(); })(performance.now()); });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const esc2 = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---- escolha dos cobradores (5, na ordem) ----
  function select(d) {
    const idx = (d.cids || []).indexOf(G.cid);
    if (idx < 0) { toast("Pênaltis: os cobradores de cada time estão sendo escolhidos."); return; }
    const team = d.teams[idx], chosen = [];
    const box = document.createElement("div"); box.id = "penPick"; box.className = "pen-pick";
    const draw = () => {
      const rows = team.players.filter(p => p.pos !== "GOL").sort((a, b) => b.ovr - a.ovr).map(p => {
        const n = chosen.indexOf(p.id) + 1;
        return `<button class="pen-row${n ? " on" : ""}" data-id="${esc2(p.id)}"><b>${n || "·"}</b> ${esc2(p.name)} <small>${esc2(p.pos)} · ${p.ovr}</small></button>`;
      }).join("");
      box.innerHTML = `<div class="pen-card"><div class="eyebrow">PÊNALTIS · ${esc2(team.name)}</div><h3>Escolha 5 cobradores, na ordem</h3><p class="muted">Sem escolha, o técnico escolhe os melhores. Tempo: ${d.seconds || 25} s.</p><div class="pen-list">${rows}</div><div class="join-actions"><button id="penConfirm" class="primary">CONFIRMAR (${chosen.length}/5)</button></div></div>`;
    };
    box.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.id === "penConfirm") { G.socket.emit("pen:pick", chosen.slice(0, 5)); box.remove(); toast("Cobradores enviados."); return; }
      if (!b.dataset.id) return;
      const i = chosen.indexOf(b.dataset.id);
      if (i >= 0) chosen.splice(i, 1); else if (chosen.length < 5) chosen.push(b.dataset.id);
      draw();
    });
    draw(); document.body.appendChild(box);
  }
  function esc(s) { return esc2(s); }

  // ---- animação 3D ----
  function run(d) {
    const old = document.getElementById("penPick"); if (old) old.remove();
    const ov = document.createElement("div"); ov.id = "penOverlay"; ov.className = "pen-overlay";
    ov.innerHTML = '<div class="pen-hud"><div class="pen-title">PÊNALTIS</div><div class="pen-score" id="penScore"></div><div class="pen-line" id="penLine"></div></div><div class="pen-banner" id="penBanner"></div>';
    document.body.appendChild(ov);
    const renderer = new THREEREF.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(window.innerWidth, window.innerHeight);
    ov.prepend(renderer.domElement);
    const scene = new THREEREF.Scene(); scene.background = new THREEREF.Color(0x9fd3ff); scene.fog = new THREEREF.Fog(0x9fd3ff, 45, 120);
    const cam = new THREEREF.PerspectiveCamera(60, window.innerWidth / window.innerHeight, .1, 300);
    scene.add(new THREEREF.HemisphereLight(0xffffff, 0x335533, 1.1));
    const sun = new THREEREF.DirectionalLight(0xffffff, .7); sun.position.set(6, 14, 8); scene.add(sun);
    const mat = c => new THREEREF.MeshLambertMaterial({ color: c });
    const grass = new THREEREF.Mesh(new THREEREF.PlaneGeometry(140, 140), mat(0x2e8b3e)); grass.rotation.x = -Math.PI / 2; scene.add(grass);
    const line = (w, d2, x, z) => { const m = new THREEREF.Mesh(new THREEREF.BoxGeometry(w, .02, d2), mat(0xffffff)); m.position.set(x, .02, z); scene.add(m); };
    line(40.3, .15, 0, 16.5); line(.15, 16.5, -20.15, 8.25); line(.15, 16.5, 20.15, 8.25); // área
    line(7.32 + .3, .15, 0, 0); // linha do gol
    const post = (x, y, w, h, d2) => { const m = new THREEREF.Mesh(new THREEREF.BoxGeometry(w, h, d2), mat(0xffffff)); m.position.set(x, y, 0); scene.add(m); };
    post(-3.66, 1.22, .12, 2.44, .12); post(3.66, 1.22, .12, 2.44, .12); post(0, 2.44, 7.44, .12, .12);
    const spot = new THREEREF.Mesh(new THREEREF.CircleGeometry(.12, 12), mat(0xffffff)); spot.rotation.x = -Math.PI / 2; spot.position.set(0, .03, 11); scene.add(spot);
    const person = (color, z) => { const g = new THREEREF.Group(); const body = new THREEREF.Mesh(new THREEREF.BoxGeometry(.5, .9, .3), mat(color)); body.position.y = .95; g.add(body); const head = new THREEREF.Mesh(new THREEREF.BoxGeometry(.36, .36, .36), mat(0xf1c27d)); head.position.y = 1.7; g.add(head); const legs = new THREEREF.Mesh(new THREEREF.BoxGeometry(.42, .5, .26), mat(0x222233)); legs.position.y = .25; g.add(legs); g.position.z = z; scene.add(g); return g; };
    const keeper = person(0xf2a500, .6);
    const kicker = person(COLORS[0], 13.5);
    const ball = new THREEREF.Mesh(new THREEREF.SphereGeometry(.11, 16, 12), mat(0xffffff)); ball.position.set(0, .11, 11); scene.add(ball);
    const SPOT = new THREEREF.Vector3(0, .11, 11);
    let kickerTarget = new THREEREF.Vector3(0, 0, 13.5);
    let running = true;
    (function loop() { if (!running) return; kicker.position.lerp(kickerTarget, .2); const want = new THREEREF.Vector3(kicker.position.x * .4, 2.0, kicker.position.z + 3.4); cam.position.lerp(want, .12); cam.lookAt(0, 1.1, 0); renderer.render(scene, cam); requestAnimationFrame(loop); })();
    const hud = { score: document.getElementById("penScore"), line: document.getElementById("penLine"), banner: document.getElementById("penBanner") };
    let sc = [0, 0];
    const setScore = () => { hud.score.textContent = `${d.names[0]} ${sc[0]} × ${sc[1]} ${d.names[1]}`; };
    setScore();
    const flash = (text, cls) => { hud.banner.textContent = text; hud.banner.className = "pen-banner show " + (cls || ""); };
    const k = d.kicks;
    return (async () => {
      for (let i = 0; i < k.length; i++) {
        const c = k[i], team = c.team;
        const col = COLORS[team]; kicker.children[0].material.color.setHex(col);
        kickerTarget = new THREEREF.Vector3(0, 0, 12.2 + (c.team ? .2 : 0)); kicker.position.set(0, 0, 13.5);
        ball.position.copy(SPOT); keeper.position.set(0, 0, .6); keeper.rotation.z = 0;
        hud.line.textContent = `Cobrança ${i + 1} · ${c.name} (${d.names[team]})`; flash("");
        await tween(.6, () => {});
        // chute: a bola segue para o alvo; o goleiro se joga para o lado escolhido
        const sx = SIDE_X[c.target] ?? 0, tx = c.goal ? sx : (c.dive === c.target ? SIDE_X[c.dive] ?? 0 : sx * 1.8);
        const ty = c.target === "C" ? .7 : 1.0;
        const endPos = c.goal ? new THREEREF.Vector3(sx, ty, -.25) : (c.dive === c.target ? new THREEREF.Vector3(SIDE_X[c.dive] ?? 0, 1.0, .5) : new THREEREF.Vector3(sx * 1.8, c.target === "C" ? 3.2 : 1.0, 0));
        const dv = SIDE_X[c.dive] ?? 0;
        await tween(.6, t => {
          const e = t;
          ball.position.lerpVectors(SPOT, endPos, e); ball.position.y += Math.sin(Math.PI * e) * .6;
          keeper.position.x = dv * Math.min(1, t * 2.2); keeper.rotation.z = -Math.sign(dv) * .9 * Math.min(1, t * 2.2);
        });
        const saved = !c.goal && c.dive === c.target;
        if (c.goal) { sc[team]++; setScore(); flash("GOL!", "gol"); }
        else if (saved) flash("DEFESA!", "def");
        else flash("PARA FORA!", "out");
        await wait(1300);
      }
      flash(d.score[0] === d.score[1] ? "" : `${d.names[d.score[0] > d.score[1] ? 0 : 1]} venceu nos pênaltis`, "fim");
      await wait(2000);
      running = false; renderer.dispose(); ov.remove();
    })();
  }
  window.Penalty3D = { select, run };
})();
