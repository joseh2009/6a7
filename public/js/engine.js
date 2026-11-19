/* 6a7 · Motor da partida (sem dependência de THREE: roda no navegador e no Node para testes).
   Convenção: campo x∈[-50,50] (comprimento), z∈[-30,30]. Time 0 ataca +x; time 1 ataca -x. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.Engine = factory(); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const L = 50, W = 30, GOAL_HW = 5.2, GOAL_H = 3.3, BALL_R = .55, PLAYER_R = .65;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), hyp = Math.hypot, TAU = Math.PI * 2;
  const SECTOR = { GOL: "G", LD: "D", ZAG: "D", LE: "D", VOL: "M", MEI: "M", MD: "M", ME: "M", PD: "A", PE: "A", CA: "A" };
  const CHAOS = {
    giant: { label: "BOLA GIGANTE", dur: 12 }, small: { label: "BOLA PEQUENA", dur: 12 }, speed: { label: "SUPERVELOCIDADE", dur: 12 },
    slippery: { label: "CAMPO ESCORREGADIO", dur: 12 }, lowgrav: { label: "GRAVIDADE BAIXA", dur: 12 }, ballrain: { label: "CHUVA DE BOLAS", dur: 15 },
    keeperboom: { label: "EXPLOSÃO DO GOLEIRO", dur: 3 }, earthquake: { label: "TERREMOTO", dur: 8 }, swap: { label: "TROCA DE POSIÇÕES", dur: 3 },
    power: { label: "CHUTE PODEROSO", dur: 12 }, bighead: { label: "MODO CABEÇÃO", dur: 15 }, invert: { label: "INVERSÃO", dur: 10 },
    meteor: { label: "METEORO", dur: 15 }, fire: { label: "FOGO", dur: 15 }, dogs: { label: "CACHORRO", dur: 15 },
    youplay: { label: "VOCÊ JOGA", dur: 9999 }, heavy: { label: "BOLA PESADA", dur: 12 }, jump: { label: "PULO", dur: 50 }, allgk: { label: "TODO MUNDO É GOLEIRO", dur: 15 }, explosive: { label: "BOLA EXPLOSIVA", dur: 16 }, gplayers: { label: "MODO GIGANTE", dur: 14 }, ants: { label: "MODO FORMIGA", dur: 14 },
    backgoal: { label: "GOL DE COSTAS", dur: 12 }, goalban: { label: "GOL PROIBIDO", dur: 10 }, movinggoals: { label: "META MÓVEL", dur: 16 }, invisball: { label: "BOLA INVISÍVEL", dur: 12 },
    upside: { label: "FUTEBOL DE CABEÇA PARA BAIXO", dur: 12 }, randomball: { label: "GOL ALEATÓRIO", dur: 2 }, pulledarea: { label: "PÊNALTI COLETIVO", dur: 3 },
    onevsall: { label: "UM CONTRA TODOS", dur: 10 }, splitball: { label: "BOLA DIVIDIDA", dur: 12 }, negativegoal: { label: "GOL VALENDO NEGATIVO", dur: 12 },
    ops: { label: "OPS!", dur: 3 }, dance: { label: "DANCINHA DO NADA", dur: 6 }, lag: { label: "EFEITO LAG", dur: 12 }, fifa: { label: "MODO FIFA", dur: 12 },
    picolo: { label: "PICOLO", dur: 6 }, theend: { label: "O FIM", dur: 6 }
  };
  const CHAOS_LIST = Object.keys(CHAOS).filter(k => k !== "youplay");
  const ZX = 6, ZZ = 4; // mapa de calor: 6 × 4 zonas do campo
  const blankStats = () => ({ shots: 0, passes: 0, passOk: 0, tackles: 0, tackleWon: 0, saves: 0, poss: 0 });
  const blankPlayerStats = () => ({ shots: 0, passes: 0, passOk: 0, tackles: 0, tackleWon: 0, dist: 0, heat: new Array(ZX * ZZ).fill(0) });

  class Match {
    constructor(cfg, o = {}) {
      this.cfg = cfg; this.rng = o.rng || Math.random; this.human = o.humans || [false, false];
      this.seconds = cfg.seconds || 120; this.t = 0; this.score = [0, 0]; this.goals = []; this.events = [];
      this.kind = cfg.kind; this.chaosOn = !!cfg.chaos; this.golden = false; this.ended = false; this.pause = 0; this.pauseNext = null; this.restartTeam = 0;
      this.fx = {}; this.ents = []; this.youPlay = false; this.chaosNext = 20; this.totalChaos = false; this.entId = 0; this.quake = 0;
      this.dev = { timeScale: 1, speed: 1, kick: 1, keep: {} }; this.opsList = []; this.solo = null; this.picoloP = null; this.fifaT = 0;
      this.stats = [blankStats(), blankStats()]; // devmode (Konami): multiplicadores e eventos mantidos
      this.players = []; this.ball = { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastTeam: 0, lastP: null, lock: null, scale: 1, spin: 0, beaten: false, fuse: 0 };
      this.ctrl = [{ pid: -1, in: null, charge: 0, wasShoot: false }, { pid: -1, in: null, charge: 0, wasShoot: false }];
      for (let t = 0; t < 2; t++) cfg.teams[t].lineup.forEach((lp, i) => this.players.push(this.makePlayer(t, i, lp, cfg.teams[t])));
      for (const p of this.players) p.s = blankPlayerStats();
      this.kickoff(0);
    }
    makePlayer(t, i, lp, team) {
      const depth = clamp((96 - (lp.hy == null ? 50 : lp.hy)) / 80, 0, 1), d = t === 0 ? 1 : -1;
      const hx = d * (-44 + depth * 72), hz = d * ((lp.hx == null ? 50 : lp.hx) - 50) * .58;
      const st = lp.stats || { speed: lp.ovr, passing: lp.ovr, shooting: lp.ovr, defending: lp.ovr, keeping: 40, vision: lp.ovr };
      return { id: t * 11 + i, team: t, idx: i, name: lp.name, slot: lp.slot, sector: SECTOR[lp.slot] || "M", hx0: hx, hx, hz, x: hx, z: hz, vx: 0, vz: 0, rot: t === 0 ? Math.PI / 2 : -Math.PI / 2, anim: 0,
        st, ovr: lp.ovr, fx: lp.fx || null, maxSpeed: 6.4 + st.speed / 100 * 3.6, mode: "ok", downT: 0, tilt: 0, y: 0, cdKick: 0, cdTackle: 0, cdDecide: 0, slowT: 0, confT: 0, hop: this.rng() * 6, style: team.style || "balanced", dead: false, holdT: 0, stun: 0, diveT: 0, diveCd: 1 + this.rng() * 2 };
    }
    emit(e) { this.events.push(e); }
    drain() { const e = this.events; this.events = []; return e; }
    minute() { return clamp(Math.ceil(this.t / this.seconds * 90), 1, 120); }
    dir(t) { return t === 0 ? 1 : -1; }

    // ---------- reinício / bola ----------
    kickoff(team) {
      const b = this.ball; Object.assign(b, { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lock: { team, t: 1.2 }, beaten: false });
      for (const p of this.players) { if (p.dead) continue; p.x = p.hx * (p.sector === "G" ? 1 : .96); p.z = p.hz; p.vx = p.vz = 0; p.mode = "ok"; p.downT = 0; p.tilt = 0; p.cdKick = 0; p.holdT = 0; }
      // quem bate o tiro de saída fica no centro
      const striker = this.players.filter(p => p.team === team && p.sector === "A" && !p.dead).sort((a, b) => Math.abs(a.hz) - Math.abs(b.hz))[0] || this.players.find(p => p.team === team && p.sector !== "G" && !p.dead);
      if (striker) { striker.x = -this.dir(team) * .9; striker.z = 0; }
    }
    restart(kind, team, x, z) { const b = this.ball; Object.assign(b, { x, z, y: BALL_R, vx: 0, vy: 0, vz: 0, owner: null, lock: { team, t: 1.1 }, beaten: false }); this.emit({ type: "whistle" }); }

    // ---------- chute / passe ----------
    kick(p, tx, tz, speed, lift, kindOfKick) {
      const b = this.ball, shooting = p.st.shooting / 100, skill = kindOfKick === "shot" ? shooting : p.st.passing / 100;
      let ang = Math.atan2(tz - b.z, tx - b.x) + (this.rng() - .5) * (1 - skill) * (kindOfKick === "shot" ? .5 : .3) * 1.4;
      if (this.fx.power) speed *= 2; if (this.fx.heavy) speed *= .5; speed *= this.dev.kick;
      if (kindOfKick === "shot") { this.stats[p.team].shots++; p.s.shots++; } else if (kindOfKick === "pass") { this.stats[p.team].passes++; p.s.passes++; }
      b.kickedPass = kindOfKick === "pass";
      if (p.fx === "power" && kindOfKick === "shot") speed *= 1.12;
      b.vx = Math.cos(ang) * speed; b.vz = Math.sin(ang) * speed; b.vy = lift; b.owner = null; b.lastTeam = p.team; b.lastP = p; b.beaten = false; b.lock = null;
      p.cdKick = .5; p.holdT = 0; this.emit({ type: "kick", power: speed });
    }
    facesAway(p) { const d = this.dir(p.team), fx = Math.sin(p.rot), fz = Math.cos(p.rot); return fx * (d * L - p.x) + fz * (-p.z) < 0; }
    shootAt(p, charge) { // charge 0..1
      if (this.fx.backgoal && !this.facesAway(p)) { if (p.holdT > 2.5) this.kick(p, this.dir(p.team) * L, (this.rng() - .5) * 10, 14, 0, "pass"); return; }
      const d = this.dir(p.team), gx = d * L, spread = GOAL_HW * .8, tz = (p.aimZ != null ? clamp(p.aimZ, -1, 1) * spread : (this.rng() - .5) * spread * 1.4);
      const speed = (17 + (p.st.shooting - 50) / 50 * 5 + charge * 11) * (this.human[p.team] && this.ctrl[p.team].pid === p.id ? 1 : 1);
      this.kick(p, gx, tz, speed, (this.rng() < .3 + charge * .3 ? 3.2 + charge * 3 : 0), "shot");
    }
    passTo(p, q, hard) {
      const dist = hyp(q.x - p.x, q.z - p.z), lead = clamp(dist / 20, .1, .9);
      const tx = q.x + q.vx * lead * .5, tz = q.z + q.vz * lead * .5;
      this.kick(p, tx, tz, clamp(5 + dist * .8 + (hard ? 4 : 0), 9, 30), dist > 28 ? 4 : 0, "pass"); q.expect = 1.5;
    }

    // ---------- IA ----------
    nearestOpp(p, maxD = 99) { let best = null, bd = maxD; for (const o of this.players) { if (o.team === p.team || o.dead || o.mode !== "ok") continue; const d = hyp(o.x - p.x, o.z - p.z); if (d < bd) { bd = d; best = o; } } return best ? { o: best, d: bd } : null; }
    bestPass(p, hum) {
      const d = this.dir(p.team); let best = null, bs = -1e9;
      for (const q of this.players) {
        if (q.team !== p.team || q === p || q.dead || q.mode !== "ok") continue;
        const dist = hyp(q.x - p.x, q.z - p.z); if (dist < 4 || dist > 42) continue;
        const open = this.nearestOpp(q, 12), openness = open ? Math.min(open.d, 10) : 10;
        const fwd = (q.x - p.x) * d;
        let sc = fwd * .6 + openness * 1.6 - dist * .15 + (q.sector === "G" ? -25 : 0);
        if (hum) { const dx = hum.dx, dz = hum.dz, len = hyp(dx, dz); if (len > .2) sc = ((q.x - p.x) * dx + (q.z - p.z) * dz) / (dist || 1) / len * 30 - dist * .2 + openness * .6; }
        else sc += (this.rng() - .5) * (1 - p.st.vision / 100) * 28;
        if (sc > bs) { bs = sc; best = q; }
      }
      return best;
    }
    decideOwner(p, dt) {
      p.cdDecide -= dt; if (p.cdDecide > 0) return;
      const d = this.dir(p.team), goalDist = Math.abs(d * L - p.x), press = this.nearestOpp(p, 4.2), skill = p.st.shooting / 100;
      p.cdDecide = clamp(.55 - p.st.vision / 100 * .3 + this.rng() * .25, .2, .8);
      if (p.sector === "G") { const q = this.bestPass(p); if (q && p.holdT > .7) this.passTo(p, q, true); else if (p.holdT > 1.6) this.kick(p, d * 20, (this.rng() - .5) * 30, 20, 3, "pass"); return; }
      const range = 10 + skill * 8 + (this.fx.power ? 12 : 0);
      if (this.fx.invert && this.rng() < .6) { this.kick(p, -d * L, (this.rng() - .5) * 8, 18, 0, "shot"); return; }
      if (goalDist < range && (goalDist < 15 || this.rng() < .12) && (!press || this.rng() < .6)) { p.aimZ = null; this.shootAt(p, this.rng() * .6); return; }
      const q = this.bestPass(p);
      const ahead = q ? (q.x - p.x) * d : 0, pressured = !!press;
      if (q && (pressured && this.rng() < .75 || ahead > 9 && this.rng() < .35 + p.st.vision / 250 || p.sector === "D" && this.rng() < .4)) { this.passTo(p, q, false); return; }
      if (goalDist > 34 && q && this.rng() < .2) this.passTo(p, q, false);
    }
    aiTarget(p, ctx) {
      if (this.fx.theend && p.cornerX != null) return [p.cornerX, p.cornerZ, 1];
      const b = this.ball, d = this.dir(p.team), mine = ctx[p.team], own = b.owner && b.owner.team === p.team, opp = b.owner && b.owner.team !== p.team;
      if (p.sector === "G") { // goleiro
        const gx = -d * (L - 2.4);
        if (!b.owner && !b.lock && Math.abs(b.x - gx) < 13 && Math.abs(b.z) < 12 && mine.chaser[0] === p) return [b.x + b.vx * .2, b.z + b.vz * .2, 1];
        let tz = clamp(b.z * .38, -GOAL_HW + .6, GOAL_HW - .6);
        if (!own && b.vx * -d > 3 && Math.abs(b.x - gx) < 30) { const t = Math.abs(b.x - gx) / Math.abs(b.vx); tz = clamp(b.z + b.vz * t, -GOAL_HW, GOAL_HW); return [gx + d * Math.min(2.2, Math.abs(b.x - gx) * .1), tz, 1.15]; }
        return [gx + d * Math.min(2.5, Math.abs(b.x - gx) * .08), tz, .8];
      }
      if (this.fx.onevsall && this.solo && !this.solo.dead && p.team !== this.solo.team && !own) return [this.solo.x, this.solo.z, 1];
      if (this.fx.invert) { const m = ctx.mirror; return [p.hx * -1 + b.x * .2, p.hz * -1, .8]; }
      if (mine.chaser[0] === p || (opp && mine.chaser[1] === p && p.sector !== "A")) {
        if (opp && mine.chaser[0] !== p) { const o = b.owner; return [o.x + (-d * 3), o.z * .9, 1]; }
        if (opp) return [b.owner.x, b.owner.z, 1];
        return [b.x + b.vx * .3, b.z + b.vz * .3, 1];
      }
      const prog = clamp(b.x * d, -L, L), style = p.style === "offensive" ? 3 : p.style === "defensive" ? -3 : 0;
      let shift = clamp(prog * .5, -12, 18) + style; if (own) shift += p.sector === "A" ? 9 : p.sector === "M" ? 5 : 2;
      let tx = p.hx + d * shift, tz = p.hz * .82 + b.z * .22;
      if (!own && p.sector === "D" && opp) { const o = b.owner; if (hyp(o.x - p.x, o.z - p.z) < 14) { tx = o.x - d * 2.2; tz = o.z * .8 + p.hz * .2; } }
      if (own && p.sector === "A") tz += Math.sin(this.t * .7 + p.idx) * 4;
      return [clamp(tx, -L + 1.5, L - 1.5), clamp(tz, -W + 1.5, W - 1.5), p.sector === "A" && own ? 1 : .88];
    }
    moveToward(p, tx, tz, mul, dt) {
      if (p.confT > 0) { p.confT -= dt; tx = p.x + Math.sin(this.t * 6 + p.idx) * 6; tz = p.z + Math.cos(this.t * 5 + p.idx) * 6; }
      if (p.danceT > 0) { p.vx = p.vz = 0; return; }
      const dx = tx - p.x, dz = tz - p.z, dist = hyp(dx, dz) || 1, max = p.maxSpeed * mul * (this.fx.gplayers ? .55 : 1) * (this.fx.ants ? 1.8 : 1) * (this.fx.speed ? 1.9 : 1) * (p.slowT > 0 ? .5 : 1) * this.dev.speed * (this.fx.onevsall && p === this.solo ? 2.2 : 1) * (this.fx.picolo && p === this.picoloP ? 1.8 : 1);
      const sp = Math.min(max, dist * 3.2), wx = dx / dist * sp, wz = dz / dist * sp, acc = (this.fx.slippery ? 7 : 38) * dt;
      p.vx += clamp(wx - p.vx, -acc, acc); p.vz += clamp(wz - p.vz, -acc, acc);
    }

    // ---------- humanos ----------
    input(team, inp) { if (inp && this.fx.upside) inp = { ...inp, dx: -inp.dx, dz: -inp.dz }; this.ctrl[team].in = inp; }
    controlled(team) { const c = this.ctrl[team]; return c.pid >= 0 ? this.players[c.pid] : null; }
    updateHumanSelection(team) {
      const c = this.ctrl[team], active = this.human[team] || this.youPlay && this.human[team]; if (!active) { c.pid = -1; return; }
      const b = this.ball, cur = c.pid >= 0 ? this.players[c.pid] : null, inp = c.in || {};
      const alive = this.players.filter(p => p.team === team && p.sector !== "G" && !p.dead && p.mode === "ok");
      if (b.owner && b.owner.team === team && b.owner.sector !== "G") { c.pid = b.owner.id; return; }
      const dist = p => hyp(p.x - b.x, p.z - b.z), nearest = alive.slice().sort((a, z) => dist(a) - dist(z));
      if (inp.switchEdge) { const i = nearest.findIndex(p => p === cur); c.pid = (nearest[(i + 1) % nearest.length] || nearest[0] || {}).id; inp.switchEdge = false; return; }
      if (!cur || cur.dead || cur.mode !== "ok" || (nearest[0] && nearest[0] !== cur && dist(cur) - dist(nearest[0]) > 3)) c.pid = nearest[0] ? nearest[0].id : -1;
    }
    humanAct(team, p, dt) {
      const c = this.ctrl[team], inp = c.in || {}, b = this.ball, dx = inp.dx || 0, dz = inp.dz || 0, len = hyp(dx, dz);
      const mul = inp.sprint ? 1 : .8, hasBall = b.owner === p;
      if (len > .08) this.moveToward(p, p.x + dx / len * 6, p.z + dz / len * 6, mul * Math.min(1, len + .15), dt); else { const acc = 40 * dt; p.vx -= clamp(p.vx, -acc, acc); p.vz -= clamp(p.vz, -acc, acc); }
      if (len > .2) { p.aimZ = dz / len * (this.dir(team) === 1 ? 1 : 1); }
      const shootDown = !!inp.shoot;
      if (shootDown) c.charge = Math.min(1, c.charge + dt / .9);
      if (c.wasShoot && !shootDown) { // soltou: chuta (com a bola) ou desarma
        if (hasBall) { p.aimZ = len > .2 ? dz / len : null; this.shootAt(p, Math.max(.15, c.charge)); }
        else this.tackle(p, true);
        c.charge = 0;
      }
      c.wasShoot = shootDown;
      if (inp.passEdge) { inp.passEdge = false; if (hasBall) { const q = this.bestPass(p, len > .2 ? { dx, dz } : null); if (q) this.passTo(p, q, false); } else this.tackle(p, true); }
    }
    tackle(p, human) {
      if (p.cdTackle > 0) return; p.cdTackle = human ? .8 : .7;
      const o = this.ball.owner; if (!o || o.team === p.team || hyp(o.x - p.x, o.z - p.z) > (human ? 2.4 : 1.5)) return;
      this.stats[p.team].tackles++; p.s.tackles++;
      const odrib = (o.st.speed + o.st.passing) / 2, chance = clamp(.34 + (p.st.defending - odrib) / 170 + (human ? .14 : 0), .1, .78);
      if (this.rng() < chance) { this.stats[p.team].tackleWon++; p.s.tackleWon++; const b = this.ball; b.owner = null; b.lastTeam = p.team; b.lastP = p; const a = Math.atan2(p.x - o.x, p.z - o.z) + (this.rng() - .5); b.vx = Math.sin(a) * 6; b.vz = Math.cos(a) * 6; o.cdKick = .6; o.stun = .5; b.lock = null; }
    }

    // ---------- passo principal ----------
    step(dt) {
      if (this.ended) return; dt = Math.min(dt, .05);
      if (this.chaosOn) this.stepChaos(dt);
      for (const p of this.players) { p.cdKick = Math.max(0, p.cdKick - dt); p.cdTackle = Math.max(0, p.cdTackle - dt); p.slowT = Math.max(0, p.slowT - dt); p.stun = Math.max(0, p.stun - dt); }
      if (this.pause > 0) { this.pause -= dt; this.settle(dt); this.stepEnts(dt); if (this.pause <= 0) { const n = this.pauseNext; this.pauseNext = null; if (n === "end") return this.finish(); this.kickoff(n == null ? 0 : n); } return; }
      this.t += dt;
      const b = this.ball, bt = b.owner ? b.owner.team : b.lastTeam; this.stats[bt].poss += dt;
      for (const p of this.players) { if (p.dead) continue; p.s.dist += hyp(p.vx, p.vz) * dt; const zx = clamp(Math.floor((p.x + L) / (2 * L) * ZX), 0, ZX - 1), zz = clamp(Math.floor((p.z + W) / (2 * W) * ZZ), 0, ZZ - 1); p.s.heat[zz * ZX + zx] += dt; }
      // contexto dos times: quem persegue a bola
      const ctx = [{ chaser: [] }, { chaser: [] }], key = b.owner || { x: b.x + b.vx * .35, z: b.z + b.vz * .35 };
      for (let t = 0; t < 2; t++) ctx[t].chaser = this.players.filter(p => p.team === t && p.sector !== "G" && !p.dead && p.mode === "ok" && p.stun <= 0 && !(b.owner && b.owner.team === t))
        .sort((a, z) => hyp(a.x - key.x, a.z - key.z) * (1 - a.st.vision / 600) - hyp(z.x - key.x, z.z - key.z) * (1 - z.st.vision / 600));
      ctx.mirror = true;
      for (let t = 0; t < 2; t++) this.updateHumanSelection(t);
      for (const p of this.players) {
        if (p.dead) continue;
        if (p.mode === "down") { p.downT -= dt; p.vx *= .9; p.vz *= .9; p.x += p.vx * dt; p.z += p.vz * dt; p.tilt = Math.min(1, p.tilt + dt * 5); if (p.downT <= 0) { p.mode = "ok"; p.tilt = 0; } continue; }
        const humanCtrl = (this.human[p.team] && (this.cfg.humanControl || this.youPlay) && this.ctrl[p.team].pid === p.id);
        if (humanCtrl) this.humanAct(p.team, p, dt);
        else {
          if (p.diveT > 0) { p.vx *= .96; p.vz *= .96; }
          else if (p.stun > 0) { p.vx *= .85; p.vz *= .85; }
          else {
            if (b.owner === p) { p.holdT += dt; this.decideOwner(p, dt); if (b.owner === p) { const d = this.dir(p.team), press = this.nearestOpp(p, 6); let tx = d * L, tz = p.z * .6; if (press) tz += (p.z - press.o.z >= 0 ? 1 : -1) * 6; if (p.sector === "G") { tx = p.x; tz = p.z; } if (this.fx.invert) tx = -d * L; this.moveToward(p, tx, clamp(tz, -W + 2, W - 2), .94, dt); } }
            else { const [tx, tz, mul] = this.aiTarget(p, ctx); this.moveToward(p, tx, tz, mul, dt); if (ctx[p.team].chaser[0] === p) { p.cdTackle <= 0 && b.owner && b.owner.team !== p.team && hyp(b.owner.x - p.x, b.owner.z - p.z) < 1.5 && this.rng() < .7 && this.tackle(p, false); } }
          }
        }
        p.x += p.vx * dt; p.z += p.vz * dt;
        p.x = clamp(p.x, -L - 1, L + 1); p.z = clamp(p.z, -W - 1, W + 1);
        const sp = hyp(p.vx, p.vz); p.anim = sp; if (sp > .6) { let a = Math.atan2(p.vx, p.vz), diff = ((a - p.rot + Math.PI * 3) % TAU) - Math.PI; p.rot += diff * Math.min(1, dt * 12); }
        else if (b.owner !== p) { const a = Math.atan2(b.x - p.x, b.z - p.z), diff = ((a - p.rot + Math.PI * 3) % TAU) - Math.PI; p.rot += diff * Math.min(1, dt * 5); }
        p.y = this.fx.jump ? Math.abs(Math.sin(this.t * 6 + p.hop)) * 1.3 : this.fx.lowgrav ? Math.abs(Math.sin(this.t * 2.2 + p.hop)) * 3.2 : 0;
      }
      this.updateDives(dt); this.separate(dt); this.stepBall(dt); this.stepEnts(dt);
      if (!this.ended) {
        if (this.t >= this.seconds) {
          if (this.kind === "final" && this.score[0] === this.score[1] && !this.golden) { this.golden = true; this.seconds += 30; this.emit({ type: "golden" }); }
          else this.finish();
        }
      }
    }
    goalZ() { return this.fx.movinggoals ? Math.sin(this.t * .35) * 9 : 0; }
    // Efeitos com lógica por quadro: OPS (cai, chora e vira bola de sinuca), FIFA (faltas), PICOLO (aura).
    stepNewFx(dt) {
      for (const p of this.players) p.danceT = Math.max(0, (p.danceT || 0) - dt);
      this.opsList = this.opsList.filter(o => {
        o.t -= dt; if (o.t > 0) return true;
        const p = o.p; if (p.dead) return false;
        const d = this.dir(p.team); p.dead = true; p.mode = "ok";
        this.ents.push({ id: ++this.entId, k: "snooker", x: p.x, y: 0.9, z: p.z, vx: d * 15, vz: 0, rot: 0, life: 9 });
        return false;
      });
      if (this.fx.fifa) { this.fifaT -= dt; if (this.fifaT <= 0) { this.fifaT = 2 + this.rng() * 2; const p = this.randomPlayer(q => q !== this.ball.owner && q.sector !== "G"); if (p) { this.knockDown(p, 1.4); this.emit({ type: "shout", text: ["FALTA!", "PÊNALTI!", "ME ENCOSTOU!", "IMPOSSÍVEL!"][Math.floor(this.rng() * 4)] }); } } }
      const a = this.picoloP;
      if (this.fx.picolo && a && !a.dead && a.mode === "ok") for (const o of this.players) if (o.team !== a.team && !o.dead && o.mode === "ok" && hyp(o.x - a.x, o.z - a.z) < 2.6) this.knockDown(o, 1e9);
    }
    // Comandos do devmode (enviados pelo anfitrião). Só valores válidos são aceitos.
    applyDev(c) {
      if (!c || typeof c !== "object" || this.ended) return false;
      const num = (v, lo, hi, d) => { v = +v; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
      switch (c.op) {
        case "trigger": { const n = String(c.name); if (!CHAOS[n]) return false; this.chaosOn = true; this.triggerChaos(n); this.chaosNext = this.t + (this.t < 60 ? 20 : 10); return true; }
        case "keep": { const n = String(c.name); if (!CHAOS[n] || n === "youplay") return false;
          if (c.on) { this.dev.keep[n] = true; this.chaosOn = true; } else { delete this.dev.keep[n]; if (this.fx[n] > 3) this.fx[n] = 3; } return true; }
        case "chaosOn": this.chaosOn = !!c.on; this.chaosNext = this.t + 2; return true;
        case "clearFx": for (const k of Object.keys(this.fx)) { delete this.fx[k]; this.emit({ type: "chaosEnd", name: k }); } this.dev.keep = {}; this.ball.scale = 1; this.ball.fuse = 0; return true;
        case "timeScale": this.dev.timeScale = num(c.v, .1, 4, 1); return true;
        case "speed": this.dev.speed = num(c.v, .3, 3, 1); return true;
        case "kick": this.dev.kick = num(c.v, .3, 3, 1); return true;
        case "addTime": this.seconds = Math.max(this.t + 1, this.seconds + num(c.s, -600, 600, 0)); return true;
        case "end": this.seconds = this.t; return true;
        case "goal": this.goal(+c.team === 1 ? 1 : 0); return true;
        case "resetBall": this.kickoff(0); return true;
        default: return false;
      }
    }
    scaleOf(p) { return this.fx.gplayers ? 2.2 : this.fx.ants ? .4 : 1; }
    // "Todo mundo é goleiro": jogadores de linha mergulham para desarmar ou desviar a bola.
    updateDives(dt) {
      const b = this.ball;
      for (const p of this.players) {
        if (p.dead || p.mode !== "ok" || !this.fx.allgk || p.sector === "G") { p.diveT = 0; continue; }
        p.diveT -= dt; p.diveCd -= dt;
        const dx = b.x - p.x, dz = b.z - p.z, d = hyp(dx, dz) || 1;
        if (p.diveT > 0) {
          const o = b.owner;
          if (d < 1.5 && b.y < 1.8 && b.owner !== p && !(o && o.team === p.team)) {
            b.owner = null; b.lock = null; b.lastTeam = p.team; b.lastP = p; b.beaten = false;
            b.vx = dx / d * 9 + p.vx * .3; b.vz = dz / d * 9 + p.vz * .3; b.vy = 2.5;
            p.diveT = 0; p.diveCd = 2.2; this.emit({ type: "save", x: p.x, z: p.z });
          }
          continue;
        }
        if (p.diveCd <= 0 && b.owner !== p && d < 4.2 && b.y < 2 && (hyp(b.vx, b.vz) > 4 || (b.owner && b.owner.team !== p.team)) && this.rng() < .3) {
          p.vx = dx / d * 13; p.vz = dz / d * 13; p.diveT = .55; p.diveCd = 2.2;
        }
      }
    }
    // "Bola explosiva": a bola explode, empurra quem está perto e volta ao centro.
    explode() {
      const b = this.ball;
      this.emit({ type: "boom", x: b.x, z: b.z });
      for (const p of this.players) {
        if (p.dead) continue;
        const dx = p.x - b.x, dz = p.z - b.z, d = hyp(dx, dz) || 1;
        if (d < 8) { const k = (8 - d) / 8, s = 4 + k * 12; p.vx += dx / d * s; p.vz += dz / d * s; if (d < 4.5) this.knockDown(p, .9 + k); }
      }
      Object.assign(b, { x: 0, z: 0, y: BALL_R, vx: 0, vy: 0, vz: 0, owner: null, lock: null, beaten: false, fuse: this.fx.explosive ? 4 : 0 });
    }
    settle(dt) { for (const p of this.players) { p.vx *= .85; p.vz *= .85; p.anim = 0; } }
    separate(dt) {
      const ps = this.players;
      for (let i = 0; i < ps.length; i++) { const a = ps[i]; if (a.dead) continue; for (let j = i + 1; j < ps.length; j++) { const c = ps[j]; if (c.dead) continue; const dx = c.x - a.x, dz = c.z - a.z, d = hyp(dx, dz); const minD = PLAYER_R * 1.7 * (this.scaleOf(a) + this.scaleOf(c)) / 2; if (d < minD && d > .001) { const push = (minD - d) * .5, nx = dx / d, nz = dz / d; a.x -= nx * push; a.z -= nz * push; c.x += nx * push; c.z += nz * push; } } }
    }
    stepBall(dt) {
      const b = this.ball; if (b.lock) { b.lock.t -= dt; if (b.lock.t <= 0) b.lock = null; }
      const r = BALL_R * b.scale;
      if (b.owner) {
        const o = b.owner; if (o.dead || o.mode !== "ok") { b.owner = null; }
        else { const a = Math.atan2(o.vx, o.vz), sp = hyp(o.vx, o.vz), fa = sp > .5 ? a : o.rot; b.x = o.x + Math.sin(fa) * (.9 + r * .3); b.z = o.z + Math.cos(fa) * (.9 + r * .3); b.y = r + Math.abs(Math.sin(this.t * 9)) * .12 * Math.min(1, sp / 6); b.vx = o.vx; b.vz = o.vz; b.vy = 0; b.lastTeam = o.team; b.lastP = o; b.spin += sp * dt; return; }
      }
      const g = this.fx.lowgrav ? 4 : 17, fr = this.fx.slippery ? .12 : this.fx.heavy ? 2.4 : .55;
      b.vy -= g * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y < r) { b.y = r; if (b.vy < -2) b.vy = -b.vy * .5; else b.vy = 0; }
      if (b.y <= r + .01) { const k = Math.exp(-fr * dt); b.vx *= k; b.vz *= k; } else { b.vx *= Math.exp(-.08 * dt); b.vz *= Math.exp(-.08 * dt); }
      b.spin += hyp(b.vx, b.vz) * dt;
      // gol / linhas
      if (Math.abs(b.x) > L) {
        if (Math.abs(b.z - this.goalZ()) < GOAL_HW && b.y < GOAL_H) return this.goal(b.x > 0 ? 0 : 1);
        const defTeam = b.x > 0 ? 1 : 0, last = b.lastTeam;
        if (last === defTeam) this.restart("corner", 1 - defTeam, Math.sign(b.x) * (L - .8), Math.sign(b.z || 1) * (W - .8));
        else this.restart("goalkick", defTeam, Math.sign(b.x) * (L - 6), clamp(b.z, -6, 6) * .5);
        return;
      }
      if (Math.abs(b.z) > W) { const t = 1 - b.lastTeam; this.restart("throw", t, clamp(b.x, -L + 3, L - 3), Math.sign(b.z) * (W - .6)); return; }
      // goleiros: defesas
      for (const gk of this.players) {
        if (gk.sector !== "G" || gk.dead || gk.mode !== "ok") continue;
        const d = hyp(gk.x - b.x, gk.z - b.z); if (d > 3.1 + (gk.fx === "wall" ? .8 : 0) || b.y > 3.3 || b.lastTeam === gk.team && !b.lock && hyp(b.vx, b.vz) < 3) continue;
        if (b.lock && b.lock.team === gk.team || hyp(b.vx, b.vz) < 9) { if (gk.cdKick <= 0) { b.owner = gk; b.vx = b.vz = 0; gk.holdT = 0; gk.cdDecide = .3; } continue; }
        if (b.lastTeam !== gk.team && !b.beaten) {
          const shooter = b.lastP, sh = shooter ? shooter.st.shooting : 70, pSave = clamp(.84 + (gk.st.keeping - sh) / 95 + (gk.fx === "wall" ? .12 : 0) - Math.min(.25, hyp(b.vx, b.vz) / 160), .06, .85);
          if (this.rng() < pSave) { this.stats[gk.team].saves++; if (this.rng() < .55) { b.owner = gk; b.vx = b.vz = 0; gk.holdT = 0; gk.cdDecide = .3; } else { const a = (this.rng() - .5) * 2.6 + (gk.team === 0 ? 0 : Math.PI); b.vx = Math.cos(a) * 9; b.vz = Math.sin(a) * 9; b.vy = 3; b.lastTeam = gk.team; b.lastP = gk; } this.emit({ type: "save", x: gk.x, z: gk.z }); }
          else b.beaten = true;
        }
      }
      // controle da bola
      const lock = b.lock; let best = null, bd = 1e9; const spd = hyp(b.vx, b.vz);
      for (const p of this.players) {
        if (p.dead || p.mode !== "ok" || p.cdKick > 0 || p.stun > 0 || (lock && lock.team !== p.team) || p.sector === "G" && spd > 10) continue;
        const d = hyp(p.x - b.x, p.z - b.z), reach = (1.05 + p.st.passing / 400) + r * .5 + (p.expect > 0 ? .5 : 0) + (this.fx.gplayers ? 1.2 : this.fx.ants ? -.25 : 0);
        if (d < reach && b.y < 2 && spd < 24 && d < bd) { bd = d; best = p; }
      }
      for (const p of this.players) if (p.expect > 0) p.expect -= dt;
      if (best) { if (b.kickedPass && b.lastP && b.lastP !== best && b.lastP.team === best.team) { this.stats[best.team].passOk++; b.lastP.s.passOk++; } b.kickedPass = false; b.owner = best; best.holdT = 0; best.cdDecide = .12 + this.rng() * .2; b.lastTeam = best.team; b.lastP = best; b.beaten = false; b.lock = null; this.emit({ type: "touch" }); }
    }
    goal(team) {
      this.score[team] += this.fx.negativegoal ? -1 : 1; const p = this.ball.lastP && this.ball.lastTeam === team ? this.ball.lastP : this.players.filter(q => q.team === team && q.sector === "A")[0] || this.players[team * 11 + 9];
      const own = this.ball.lastTeam !== team, who = own ? this.players.find(q => q.team === 1 - team && q.sector === "D") || p : p;
      const g = { team, min: this.minute(), player: who.name, own: own && this.ball.lastP && this.ball.lastP.team !== team }; this.goals.push(g);
      this.emit({ type: "goal", team, player: g.player, minute: g.min, score: this.score.slice(), pid: who.id });
      if (this.fx.goalban) who.stun = 4; // gol proibido: quem marcou fica paralisado
      this.ball.vx = this.ball.vz = 0; this.ball.owner = null; this.ball.x = Math.sign(this.ball.x) * (L + .5);
      if (this.golden) { this.pause = 3; this.pauseNext = "end"; } else { this.pause = 3; this.pauseNext = 1 - team; }
    }
    finish() { this.ended = true; this.emit({ type: "end", score: this.score.slice(), goals: this.goals.slice(), stats: this.statsOut() }); }
    statsOut() {
      const tot = this.stats[0].poss + this.stats[1].poss || 1;
      const teams = this.stats.map(t => ({ shots: t.shots, passes: t.passes, passOk: t.passOk, passPct: t.passes ? Math.round(t.passOk / t.passes * 100) : 0, tackles: t.tackles, tackleWon: t.tackleWon, saves: t.saves, possession: Math.round(t.poss / tot * 100) }));
      const players = this.players.map(p => ({ id: p.id, name: p.name, team: p.team, shots: p.s.shots, passes: p.s.passes, passOk: p.s.passOk, tackles: p.s.tackles, tackleWon: p.s.tackleWon, dist: Math.round(p.s.dist), heat: p.s.heat.map(v => Math.round(v * 10) / 10) }));
      return { teams, players };
    }
    result() { return { score: this.score.slice(), goals: this.goals.slice(), ended: this.ended }; }

    // ---------- CAOS ----------
    stepChaos(dt) {
      for (const k of Object.keys(this.fx)) { if (this.dev.keep[k]) continue; this.fx[k] -= dt; if (this.fx[k] <= 0) { delete this.fx[k]; this.emit({ type: "chaosEnd", name: k }); if (k === "giant" || k === "small" || k === "splitball") this.ball.scale = 1; if (k === "explosive") this.ball.fuse = 0; } }
      this.quake = this.fx.earthquake || this.fx.theend ? 1 : 0;
      if (this.fx.explosive && this.ball.fuse > 0) { this.ball.fuse -= dt; if (this.ball.fuse <= 0) this.explode(); }
      if (this.pause > 0) return;
      for (const k of Object.keys(this.dev.keep)) if (this.dev.keep[k] && !this.fx[k]) this.triggerChaos(k);
      this.stepNewFx(dt);
      const left = this.seconds - this.t;
      // Cronograma: no 1º minuto um evento a cada 20 s; no último minuto, a cada 10 s.
      // No máximo 2 efeitos ativos ao mesmo tempo, para não acumular tudo de uma vez.
      if (this.t >= this.chaosNext) {
        if (Object.keys(this.fx).length >= 2) this.chaosNext = this.t + 2;
        else { this.triggerChaos(); this.chaosNext = this.t < 60 ? this.t + 20 : this.t + 10; }
      }
      if (this.fx.earthquake && this.rng() < dt * .8) { const p = this.randomPlayer(); if (p) this.knockDown(p, 1.2); }
    }
    randomPlayer(filter) { const c = this.players.filter(p => !p.dead && p.mode === "ok" && (!filter || filter(p))); return c.length ? c[Math.floor(this.rng() * c.length)] : null; }
    knockDown(p, t) { if (p.dead || p.mode !== "ok") return; p.mode = "down"; p.downT = t; p.tilt = 0; if (this.ball.owner === p) { this.ball.owner = null; this.ball.vx = p.vx * .5; this.ball.vz = p.vz * .5; } }
    triggerChaos(force) {
      const humansPlaying = this.human[0] || this.human[1];
      let name = force;
      if (!name) { const pool = CHAOS_LIST.slice(); name = pool[Math.floor(this.rng() * pool.length)]; if (humansPlaying && !this.youPlay && this.rng() < .035) name = "youplay"; }
      const def = CHAOS[name], b = this.ball;
      this.emit({ type: "chaos", name, label: def.label, dur: def.dur, total: this.totalChaos });
      if (name === "youplay") { this.youPlay = true; this.cfg.humanControl = true; return; }
      this.fx[name] = def.dur;
      switch (name) {
        case "randomball": b.x = (this.rng() - .5) * L * 1.7; b.z = (this.rng() - .5) * W * 1.5; b.y = BALL_R; b.vx = b.vy = b.vz = 0; b.owner = null; b.lock = null; break;
        case "pulledarea": { const side = b.x >= 0 ? 1 : -1; b.owner = null; for (const p of this.players) { if (p.dead) continue; p.x = side * (L - 3 - this.rng() * 9); p.z = clamp(b.z + (this.rng() - .5) * 18, -W + 2, W - 2); p.vx = p.vz = 0; } break; }
        case "onevsall": this.solo = this.randomPlayer(q => q.sector !== "G"); break;
        case "picolo": this.picoloP = this.randomPlayer(q => q.sector !== "G"); break;
        case "ops": { const p = this.randomPlayer(q => q.sector !== "G"); if (p) { this.knockDown(p, 1e9); this.opsList.push({ p, t: 10 }); } break; }
        case "dance": { const p = this.randomPlayer(q => q.sector !== "G"); if (p) { p.danceT = 6; for (const q of this.players) if (q !== p && !q.dead && hyp(q.x - p.x, q.z - p.z) < 14) q.danceT = 6; } break; }
        case "theend": for (const p of this.players) { p.cornerX = this.rng() < .5 ? -L + 3 : L - 3; p.cornerZ = this.rng() < .5 ? -W + 3 : W - 3; } break;
        case "explosive": b.fuse = 4; break; case "giant": b.scale = 2.8; break; case "small": b.scale = .3; break;
        case "keeperboom": { const k = this.randomPlayer(p => p.sector === "G"); if (k) { k.dead = true; if (b.owner === k) b.owner = null; this.emit({ type: "boom", x: k.x, z: k.z }); } break; }
        case "swap": for (let t = 0; t < 2; t++) { const f = this.players.filter(p => p.team === t && p.sector !== "G"), xs = f.map(p => [p.hx, p.hz]); for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; } f.forEach((p, i) => { p.hx = xs[i][0]; p.hz = xs[i][1]; }); } break;
        case "ballrain": for (let i = 0; i < 8; i++) this.ents.push({ id: ++this.entId, k: "ball", x: (this.rng() - .5) * 90, y: 20 + this.rng() * 12, z: (this.rng() - .5) * 50, vx: (this.rng() - .5) * 4, vy: 0, vz: (this.rng() - .5) * 4, life: 15 }); break;
        case "meteor": for (let i = 0; i < 10; i++) this.ents.push({ id: ++this.entId, k: "meteor", x: (this.rng() - .5) * 90, y: 24 + this.rng() * 22, z: (this.rng() - .5) * 52, vy: -(12 + this.rng() * 7), life: 15, landed: false }); break;
        case "dogs": for (let i = 0; i < 5; i++) { const side = this.rng() < .5 ? -1 : 1; this.ents.push({ id: ++this.entId, k: "dog", x: side * (L - 1), y: 0, z: (this.rng() - .5) * 40, vx: 0, vz: 0, life: 15, rot: 0 }); } break;
        case "fire": { const side = this.rng() < .5 ? -1 : 1; this.ents.push({ id: ++this.entId, k: "torch", x: (this.rng() - .5) * 40, y: 0, z: side * (W + 2), vx: 0, vz: -side * 3.2, life: 15, acc: 0 }); break; }
      }
    }
    stepEnts(dt) {
      const live = [];
      for (const e of this.ents) {
        e.life -= dt; if (e.life <= 0) continue;
        if (e.k === "meteor") { if (!e.landed) { e.y += e.vy * dt; if (e.y <= 1) { e.y = .9; e.landed = true; this.emit({ type: "impact", x: e.x, z: e.z }); for (const p of this.players) if (!p.dead && hyp(p.x - e.x, p.z - e.z) < 3) this.knockDown(p, 2.3); } } else { for (const p of this.players) if (!p.dead && p.mode === "ok" && hyp(p.x - e.x, p.z - e.z) < 1.5) { p.confT = 2; } } }
        else if (e.k === "ball") { e.vy -= 17 * dt; e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt; if (e.y < .6) { e.y = .6; e.vy = Math.abs(e.vy) > 3 ? -e.vy * .55 : 0; e.vx *= .985; e.vz *= .985; for (const p of this.players) if (!p.dead && p.mode === "ok" && e.y < 1.6 && hyp(p.x - e.x, p.z - e.z) < 1.2 && hyp(e.vx, e.vz) + Math.abs(e.vy) > 5) this.knockDown(p, 1); } e.x = clamp(e.x, -L, L); e.z = clamp(e.z, -W, W); }
        else if (e.k === "snooker") { e.x += e.vx * dt; e.z += e.vz * dt; e.rot += dt * 8; e.life = Math.min(e.life, Math.abs(e.x) > L + 3 ? 0 : e.life); }
        else if (e.k === "dog") { const t = this.ball.owner || this.ball, dx = t.x - e.x, dz = t.z - e.z, d = hyp(dx, dz) || 1; e.vx = dx / d * 6.5; e.vz = dz / d * 6.5; e.x += e.vx * dt; e.z += e.vz * dt; e.rot = Math.atan2(e.vx, e.vz); for (const p of this.players) if (!p.dead && p.mode === "ok" && hyp(p.x - e.x, p.z - e.z) < 1.4) { this.knockDown(p, 2); e.x += (this.rng() - .5) * 8; e.z += (this.rng() - .5) * 8; } }
        else if (e.k === "torch") { e.x += e.vx * dt; e.z += e.vz * dt; e.acc += dt; if (e.acc > .35) { e.acc = 0; this.ents.push({ id: ++this.entId, k: "flame", x: e.x, y: 0, z: e.z, r: .8, life: 9 }); } if (Math.abs(e.z) > W + 3) e.life = 0; }
        else if (e.k === "flame") { e.r = Math.min(2.6, e.r + dt * .35); for (const p of this.players) if (!p.dead && hyp(p.x - e.x, p.z - e.z) < e.r + .3) { p.dead = true; if (this.ball.owner === p) this.ball.owner = null; this.emit({ type: "burn", x: p.x, z: p.z }); } }
        live.push(e);
      }
      this.ents = live.length > 400 ? live.slice(-400) : live;
    }

    // ---------- estado para renderização / rede ----------
    // Efeito lag: posições chegam em saltos (grade de 1,2 m). Bola dividida: três bolinhas decorativas girando em volta.
    snapPos(v) { return this.fx.lag ? Math.round(v / 1.2) * 1.2 : v; }
    miniBalls() { if (!this.fx.splitball) return []; const b = this.ball, out = []; for (let i = 0; i < 3; i++) { const a = this.t * 4 + i * 2.094; out.push(["miniball", b.x + Math.cos(a) * 1.6, b.y, b.z + Math.sin(a) * 1.6, 0, 0, -1 - i]); } return out; }
    state() {
      const b = this.ball, ctrlIds = [this.ctrl[0].pid, this.ctrl[1].pid];
      return { t: this.t, goalZ: this.goalZ(), left: Math.max(0, this.seconds - this.t), score: this.score.slice(), golden: this.golden, pause: this.pause > 0, total: this.totalChaos, quake: this.quake, youPlay: this.youPlay, fx: Object.keys(this.fx),
        players: this.players.map(p => [this.snapPos(p.x), p.y, this.snapPos(p.z), p.rot, p.anim, p.mode === "down" ? p.tilt : (p.diveT > 0 ? 1 : 0), (p.dead ? 1 : 0) | (this.fx.bighead ? 2 : 0) | (ctrlIds.includes(p.id) ? 4 : 0) | (b.owner === p ? 8 : 0) | (this.fx.allgk && p.sector !== "G" && !p.dead ? 16 : 0) | (p.danceT > 0 ? 32 : 0) | (this.fx.picolo && this.picoloP === p ? 64 : 0), this.scaleOf(p)]),
        ball: [b.x, b.y, b.z, b.scale, b.spin, b.fuse || 0], ents: [...this.ents.map(e => [e.k, e.x, e.y, e.z, e.rot || 0, e.r || 0, e.id]), ...this.miniBalls()] };
    }
  }
  return { Match, CHAOS, CHAOS_LIST, L, W, GOAL_HW, GOAL_H, BALL_R };
});
