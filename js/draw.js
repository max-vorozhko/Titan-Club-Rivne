// Вкладка «Малюнок»: вид зверху, бігун ведеться пальцем і малює слово чи картинку по пунктиру.
// Щодня «малюнок дня» (за київською датою), бали до 1000, серія днів, картинка для сторіс.
(function () {
  const $ = (id) => document.getElementById(id);

  // ---------- Світ: 800 x 1000 умовних одиниць, полотно лише масштабує ----------
  const W = 800, H = 1000;
  const R = 26;   // «ширина дороги»: так далеко від пунктиру ще зараховується
  const RC = 24;  // так близько треба пробігти повз точку пунктиру, щоб її зафарбувати
  const BOX = { x: 70, y: 90, w: 660, h: 740 };
  const START = { x: 400, y: 925 };
  const BASE = 260, SPRINT = 470, TURN = 8.5; // швидкість, швидкість у темпі, поворот (рад/с)
  const DONE_AT = 0.95;

  // Кольори сцени (світла тема гри)
  const PAL = {
    map: "#eef0f2", mapLine: "#e1e4e8", water: "#d9e7f3", park: "#e2ecdd", road: "rgba(51,51,58,0.13)", roadDash: "#80808c",
    brand: "#f85a0a", accent: "#ffc21a", off: "#9a9aa6", ink: "#33333a",
  };

  // ---------- Малюнки ----------
  // Літери однією лінією у квадраті 0..1 (ширину літери стискаємо до 0.72 висоти)
  const SERIF_I = [[[0.2, 0], [0.8, 0]], [[0.5, 0], [0.5, 1]], [[0.2, 1], [0.8, 1]]];
  const GLYPHS = {
    T: [[[0, 0], [1, 0]], [[0.5, 0], [0.5, 1]]],
    I: SERIF_I,
    A: [[[0, 1], [0.5, 0], [1, 1]], [[0.22, 0.66], [0.78, 0.66]]],
    N: [[[0, 1], [0, 0], [1, 1], [1, 0]]],
    "Р": [[[0, 1], [0, 0], [0.8, 0], [1, 0.14], [1, 0.4], [0.8, 0.54], [0, 0.54]]],
    "І": SERIF_I,
    "В": [
      [[0, 0], [0, 1], [0.8, 1], [1, 0.86], [1, 0.64], [0.8, 0.5], [0, 0.5]],
      [[0, 0], [0.8, 0], [1, 0.14], [1, 0.36], [0.8, 0.5]],
    ],
    "Н": [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, 0.5], [1, 0.5]]],
    "Е": [[[1, 0], [0, 0], [0, 1], [1, 1]], [[0, 0.5], [0.8, 0.5]]],
  };

  function word(lines) {
    const gw = 0.72, gx = 0.3, gy = 0.45;
    const widths = lines.map((l) => l.length * gw + (l.length - 1) * gx);
    const maxW = Math.max(...widths);
    const strokes = [];
    lines.forEach((line, li) => {
      const x0 = (maxW - widths[li]) / 2;
      [...line].forEach((ch, ci) => {
        const ox = x0 + ci * (gw + gx), oy = li * (1 + gy);
        GLYPHS[ch].forEach((st) => strokes.push(st.map((p) => [ox + p[0] * gw, oy + p[1]])));
      });
    });
    return { strokes, w: maxW, h: lines.length + (lines.length - 1) * gy };
  }

  function heart() {
    const pts = [];
    for (let t = 0; t < Math.PI * 2; t += 0.05) {
      const x = 16 * Math.sin(t) ** 3;
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      pts.push([x + 16, y + 17]);
    }
    pts.push(pts[0]);
    return { strokes: [pts], w: 32, h: 29 };
  }

  function star() {
    const pts = [];
    for (let k = 0; k < 10; k++) {
      const r = k % 2 === 0 ? 1 : 0.42, a = -Math.PI / 2 + (k * Math.PI) / 5;
      pts.push([Math.cos(a) * r + 0.951, Math.sin(a) * r + 1]);
    }
    pts.push(pts[0]);
    return { strokes: [pts], w: 1.902, h: 1.809 };
  }

  const TEMPLATES = [
    { id: "titan", name: "TITAN", make: () => word(["TIT", "AN"]) },
    { id: "heart", name: "Серце", make: heart },
    { id: "star", name: "Зірка", make: star },
    { id: "rivne", name: "РІВНЕ", make: () => word(["РІВ", "НЕ"]) },
  ];

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function fit(d) {
    const s = Math.min(BOX.w / d.w, BOX.h / d.h);
    const ox = BOX.x + (BOX.w - d.w * s) / 2, oy = BOX.y + (BOX.h - d.h * s) / 2;
    return d.strokes.map((st) => st.map((p) => ({ x: ox + p[0] * s, y: oy + p[1] * s })));
  }

  function sample(strokes, step) {
    const out = [];
    strokes.forEach((st) => {
      for (let i = 0; i < st.length - 1; i++) {
        const a = st[i], b = st[i + 1], n = Math.max(1, Math.ceil(dist(a, b) / step));
        for (let j = 0; j < n; j++) out.push({ x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n, c: false });
      }
      const last = st[st.length - 1];
      out.push({ x: last.x, y: last.y, c: false });
    });
    return out;
  }

  function geometry(strokes) {
    let len = 0, conn = 0, prev = START;
    strokes.forEach((st) => {
      for (let i = 0; i < st.length - 1; i++) len += dist(st[i], st[i + 1]);
      const a = st[0], b = st[st.length - 1], da = dist(prev, a), db = dist(prev, b);
      conn += Math.min(da, db);
      prev = da <= db ? b : a;
    });
    return { len, conn };
  }

  // ---------- Дата, малюнок дня, пам'ять ----------
  const kyivFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" });
  const dayNumber = (iso) => { const p = iso.split("-"); return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); };
  const isoOf = (num) => new Date(num * 86400000).toISOString().slice(0, 10);
  const TODAY = kyivFmt.format(new Date());
  const DAILY = dayNumber(TODAY) % TEMPLATES.length;

  const KEY = "titan.draw.v1";
  let store = { best: {}, days: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) store = Object.assign(store, JSON.parse(raw));
  } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  }

  function streakOf() {
    const set = {};
    store.days.forEach((d) => (set[d] = true));
    let n = dayNumber(TODAY), count = 0;
    if (!set[isoOf(n)]) n -= 1;
    while (set[isoOf(n)]) { count++; n--; }
    return count;
  }

  // ---------- Елементи й стан ----------
  const board = $("dr-board");
  const cv = $("dr-canvas");
  const ctx = cv.getContext("2d");
  const tabEl = $("tab-draw");

  let tpl, strokes, pts, geo, par, covered, run;
  let steer = null, steerId = null, sprintHeld = false;
  const keys = { left: false, right: false };
  let lastBlob = null, lastResult = null, lastUrl = null, lastPlace = null, lastRun = null;

  function loadTemplate(i) {
    const t = TEMPLATES[i];
    tpl = { index: i, id: t.id, name: t.name };
    strokes = fit(t.make());
    pts = sample(strokes, 7);
    geo = geometry(strokes);
    par = ((geo.len + geo.conn) / BASE) * 1.35;
    covered = 0;
    lastRun = null;
    lastPlace = null;
    run = {
      state: "idle", x: START.x, y: START.y, a: -Math.PI / 2, t: 0, energy: 1, locked: false, sprinting: false,
      onLen: 0, offLen: 0, trail: [], doneT: 0,
    };
    steer = null;
    steerId = null;
    setHint("Торкнись і веди пальцем");
    $("dr-result").hidden = true;
    $("dr-finish").disabled = true;
    renderPicker();
    hud();
  }

  function setHint(text) {
    $("dr-hint").textContent = text || "";
    $("dr-hint").hidden = !text;
  }

  function begin() {
    if (run.state === "paused") return resume();
    if (run.state !== "idle") return;
    run.state = "running";
    setHint("");
    if (window.Analytics) Analytics.event("run-draw-" + tpl.id, "Забіг: Малюнок " + tpl.name);
  }

  function pause() {
    if (run.state !== "running") return;
    run.state = "paused";
    steer = null;
    steerId = null;
    sprintHeld = false;
    setHint("Пауза · торкнись, щоб продовжити");
  }

  function resume() {
    if (run.state !== "paused") return;
    run.state = "running";
    setHint("");
  }

  // ---------- Фізика ----------
  const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  function turnToward(target, maxStep) {
    const d = wrap(target - run.a);
    run.a = wrap(run.a + Math.max(-maxStep, Math.min(maxStep, d)));
  }
  function excessRatio() {
    const allowance = geo.conn * 1.3 + geo.len * 0.15;
    return Math.min(1, Math.max(0, run.offLen - allowance) / geo.len);
  }
  const coverage = () => covered / pts.length;

  function probe(moved) {
    let near = false;
    const r2 = R * R, rc2 = RC * RC;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], dx = p.x - run.x, dy = p.y - run.y, d2 = dx * dx + dy * dy;
      if (d2 <= r2) {
        near = true;
        if (!p.c && d2 <= rc2) { p.c = true; covered++; }
      }
    }
    if (near) run.onLen += moved; else run.offLen += moved;
    const last = run.trail[run.trail.length - 1];
    if (!last || Math.hypot(last.x - run.x, last.y - run.y) >= 4) run.trail.push({ x: run.x, y: run.y, on: near });
  }

  function update(dt) {
    if (run.state === "done") { run.doneT += dt; return; }
    if (run.state !== "running") return;
    run.t += dt;

    if (steer) {
      const dx = steer.x - run.x, dy = steer.y - run.y;
      if (dx * dx + dy * dy > 196) turnToward(Math.atan2(dy, dx), TURN * dt);
    }
    if (keys.left) run.a = wrap(run.a - TURN * dt);
    if (keys.right) run.a = wrap(run.a + TURN * dt);

    // темп витрачає сили; після повного виснаження вмикається знову, коли відновилось 25%
    if (run.energy <= 0) run.locked = true;
    if (run.locked && run.energy >= 0.25) run.locked = false;
    run.sprinting = sprintHeld && !run.locked && run.energy > 0;
    run.energy = Math.max(0, Math.min(1, run.energy + (run.sprinting ? -0.38 : 0.13) * dt));

    const v = run.sprinting ? SPRINT : BASE, total = v * dt, n = Math.max(1, Math.ceil(total / 6)), step = total / n;
    for (let i = 0; i < n; i++) {
      run.x = Math.max(16, Math.min(W - 16, run.x + Math.cos(run.a) * step));
      run.y = Math.max(16, Math.min(H - 16, run.y + Math.sin(run.a) * step));
      probe(step);
    }
    if (coverage() >= DONE_AT) finish();
  }

  // ---------- Фініш і бали ----------
  function scoreNow() {
    const c = coverage(), w = excessRatio();
    const points = Math.round(700 * c + 200 * (1 - w) + 100 * Math.min(1, par / Math.max(run.t, 0.1)));
    const stars = points >= 900 ? 3 : points >= 750 ? 2 : points >= 500 ? 1 : 0;
    return { points, stars, cover: c, waste: w, time: run.t };
  }

  function finish() {
    if (run.state !== "running") return;
    run.state = "done";
    run.doneT = 0;
    steer = null;
    sprintHeld = false;
    const res = scoreNow();
    lastResult = res;
    if (res.points > (store.best[tpl.id] || 0)) store.best[tpl.id] = res.points;
    if (tpl.index === DAILY && res.points >= 500 && store.days.indexOf(TODAY) < 0) store.days.push(TODAY);
    save();
    if (window.Profile) Profile.record({ mode: "draw" });
    lastPlace = null;
    lastRun = { id: tpl.id, name: tpl.name, res };
    showResult(res);
    submit();
    renderPicker();
    renderStreak();
  }

  const TITLES = ["Контур ще не готовий", "Контур є", "Добре пробіжено", "Чисто, як по лінійці"];

  function showResult(res) {
    $("dr-stars").innerHTML = "★".repeat(res.stars) + "<i>" + "★".repeat(3 - res.stars) + "</i>";
    $("dr-title").textContent = TITLES[res.stars];
    $("dr-points").textContent = res.points;
    $("dr-rtime").textContent = fmtTime(res.time);
    $("dr-rcover").textContent = Math.round(res.cover * 100) + "%";
    $("dr-best").textContent = store.best[tpl.id] || res.points;
    $("dr-share-sheet").hidden = true;
    $("dr-card").removeAttribute("src");
    lastBlob = null;
    $("dr-result").hidden = false;
    renderCard(res).then((blob) => {
      if (!blob) return;
      lastBlob = blob;
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(blob);
      $("dr-card").src = lastUrl;
    });
    setTimeout(() => $("dr-result").scrollIntoView({ behavior: "smooth", block: "nearest" }), 350);
  }

  // ---------- Рейтинг ----------
  function lbStatus(text) {
    $("dr-lb-status").hidden = !text;
    $("dr-lb-status").textContent = text || "";
  }

  async function submit() {
    $("dr-lb-form").hidden = true;
    lbStatus("");
    if (!window.Leaderboard || !Leaderboard.enabled || !lastRun) return;
    if (!Leaderboard.getName()) {
      $("dr-lb-name").value = "";
      $("dr-lb-form").hidden = false;
      return lbStatus("Введи ім'я, щоб потрапити в рейтинг");
    }
    const run = lastRun;
    lbStatus("Зберігаю результат…");
    try {
      const r = await Leaderboard.drawSubmit({ id: run.id, points: run.res.points, time: run.res.time });
      if (lastRun !== run) return; // тим часом почали новий забіг
      lastPlace = r.place;
      lbStatus(r.place ? `📊 #${r.place} у рейтингу «${run.name}» (кращий: ${r.best.points} балів)` : "Результат збережено");
    } catch (e) {
      if (lastRun === run) lbStatus("Не вдалося зберегти результат 😕");
    }
  }

  $("dr-lb-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("dr-lb-name").value.trim();
    if (name.length < 2) return;
    Leaderboard.setName(name);
    submit();
  });

  const openBoard = () => window.openLeaders && openLeaders("draw", tpl.id);
  $("dr-open-board").addEventListener("click", openBoard);
  $("dr-result-board").addEventListener("click", openBoard);

  // ---------- Малювання сцени (полотно гри й картинка для сторіс) ----------
  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function pathOfStrokes(g) {
    g.beginPath();
    strokes.forEach((st) => {
      g.moveTo(st[0].x, st[0].y);
      for (let i = 1; i < st.length; i++) g.lineTo(st[i].x, st[i].y);
    });
  }

  function drawRunner(g) {
    const pulse = run.state === "idle" ? 1 + Math.sin(Date.now() / 260) * 0.08 : 1;
    g.save();
    g.translate(run.x, run.y);
    if (run.sprinting) {
      g.strokeStyle = PAL.accent; g.lineWidth = 6; g.globalAlpha = 0.8;
      g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }
    g.scale(pulse, pulse);
    g.fillStyle = "rgba(0,0,0,0.22)"; g.beginPath(); g.arc(2, 4, 17, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffffff"; g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = PAL.brand; g.beginPath(); g.arc(0, 0, 14, 0, Math.PI * 2); g.fill();
    g.rotate(run.a);
    g.fillStyle = PAL.ink; g.beginPath(); g.arc(1, 0, 6.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = PAL.accent; g.beginPath(); g.moveTo(26, 0); g.lineTo(16, -7); g.lineTo(16, 7); g.closePath(); g.fill();
    g.restore();
  }

  function drawScene(g, o) {
    // місто зверху: квартали, парки, річка
    g.fillStyle = PAL.map; g.fillRect(0, 0, W, H);
    g.strokeStyle = PAL.mapLine; g.lineWidth = 4; g.lineCap = "butt";
    for (let k = 100; k < W; k += 100) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, H); g.stroke(); }
    for (let k = 100; k < H; k += 100) { g.beginPath(); g.moveTo(0, k); g.lineTo(W, k); g.stroke(); }
    g.fillStyle = PAL.park;
    rrect(g, 20, 20, 170, 150, 24); g.fill();
    rrect(g, 610, 830, 170, 150, 24); g.fill();
    g.strokeStyle = PAL.water; g.lineWidth = 70; g.lineCap = "round";
    g.beginPath(); g.moveTo(-40, 780); g.bezierCurveTo(220, 650, 440, 880, 840, 710); g.stroke();

    // пунктир малюнка: широка «дорога» і лінія посередині
    g.lineJoin = "round"; g.lineCap = "round";
    pathOfStrokes(g); g.strokeStyle = PAL.road; g.lineWidth = R * 2; g.stroke();
    pathOfStrokes(g); g.strokeStyle = PAL.roadDash; g.lineWidth = 3; g.setLineDash([12, 12]); g.stroke(); g.setLineDash([]);

    // слід бігуна: на пунктирі яскравий, поза ним тонкий і блідий
    const tr = run.trail;
    let cur = null, open = false;
    g.globalAlpha = o.trailAlpha;
    for (let i = 1; i < tr.length; i++) {
      const p = tr[i], q = tr[i - 1];
      if (cur !== p.on) {
        if (open) g.stroke();
        cur = p.on; g.beginPath(); open = false;
        g.strokeStyle = cur ? PAL.brand : PAL.off; g.lineWidth = cur ? 16 : 6;
      }
      if (!open) { g.moveTo(q.x, q.y); open = true; }
      g.lineTo(p.x, p.y);
    }
    if (open) g.stroke();
    g.globalAlpha = 1;

    // готовий малюнок світиться
    if (o.glow > 0) {
      g.save();
      pathOfStrokes(g); g.strokeStyle = PAL.accent; g.lineWidth = 30; g.globalAlpha = o.glow * 0.35; g.stroke();
      pathOfStrokes(g); g.strokeStyle = PAL.brand; g.lineWidth = 15; g.globalAlpha = o.glow; g.stroke();
      g.restore();
    }

    if (o.runner) {
      g.fillStyle = PAL.ink; g.globalAlpha = 0.55;
      g.beginPath(); g.arc(START.x, START.y, 22, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      g.fillStyle = PAL.map; g.font = "700 15px Oswald, Arial Narrow, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("СТАРТ", START.x, START.y);
      drawRunner(g);
    }
  }

  const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function render() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = Math.round(board.clientWidth * dpr), ch = Math.round(board.clientHeight * dpr);
    if (!cw || !ch) return;
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    ctx.setTransform(cw / W, 0, 0, ch / H, 0, 0);
    const done = run.state === "done";
    drawScene(ctx, { runner: true, trailAlpha: done ? 0.35 : 1, glow: done ? (reduceMotion ? 1 : Math.min(1, run.doneT / 0.6)) : 0 });
  }

  // Картинка для сторіс 540 x 960: сцена в рамці, зверху назва, знизу результат
  function renderCard(res) {
    let fonts = [];
    try { fonts = [document.fonts.load("700 56px Oswald"), document.fonts.load("600 26px Montserrat")]; } catch (e) {}
    return Promise.all(fonts).catch(() => {}).then(() => new Promise((resolve) => {
      const c = document.createElement("canvas");
      c.width = 540; c.height = 960;
      const g = c.getContext("2d");
      const bg = g.createLinearGradient(0, 0, 0, 960); bg.addColorStop(0, "#33333a"); bg.addColorStop(1, "#1f1f24");
      g.fillStyle = bg; g.fillRect(0, 0, 540, 960);
      g.fillStyle = "#f85a0a"; g.fillRect(0, 0, 540, 10);
      g.textAlign = "center"; g.textBaseline = "alphabetic";
      g.fillStyle = "#ffffff"; g.font = "700 58px Oswald, Impact, sans-serif"; g.fillText("TITAN RUN", 270, 92);
      g.fillStyle = "#ffc21a"; g.font = "600 24px Montserrat, sans-serif";
      const d = new Date().toLocaleDateString("uk-UA", { day: "numeric", month: "long", timeZone: "Europe/Kyiv" });
      g.fillText(("Малюнок дня · " + d).toUpperCase(), 270, 130);
      g.save();
      g.translate(30, 160); g.scale(0.6, 0.6);
      rrect(g, 0, 0, W, H, 40); g.clip();
      drawScene(g, { runner: false, trailAlpha: 0.3, glow: 1 });
      g.restore();
      g.fillStyle = "#ffc21a"; g.font = "700 64px Oswald, Impact, sans-serif";
      g.fillText("★".repeat(res.stars) + "☆".repeat(3 - res.stars), 270, 850);
      g.fillStyle = "#ffffff"; g.font = "700 40px Oswald, Impact, sans-serif";
      g.fillText(res.points + " балів · " + fmtTime(res.time), 270, 900);
      g.fillStyle = "#a2a2ae"; g.font = "600 20px Montserrat, sans-serif";
      g.fillText("@titan.club.rivne", 270, 940);
      try { c.toBlob((b) => resolve(b), "image/png"); } catch (e) { resolve(null); }
    }));
  }

  // ---------- Інтерфейс ----------
  function fmtTime(t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
  }

  function hud() {
    $("dr-time").textContent = fmtTime(run.t);
    $("dr-cover").textContent = Math.round(coverage() * 100) + "%";
    $("dr-waste").textContent = Math.round(excessRatio() * 100) + "%";
    $("dr-energy-fill").style.width = Math.round(run.energy * 100) + "%";
    $("dr-energy").classList.toggle("is-low", run.energy < 0.2);
    $("dr-finish").disabled = !(run.state === "running" && coverage() >= 0.6);
    $("dr-sprint").classList.toggle("is-on", run.sprinting);
  }

  function renderPicker() {
    const box = $("dr-picker");
    box.innerHTML = "";
    TEMPLATES.forEach((t, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dr-chip";
      b.setAttribute("aria-pressed", String(i === tpl.index));
      const best = store.best[t.id];
      const meta = (i === DAILY ? "малюнок дня" : "") + (best ? (i === DAILY ? " · " : "") + best : "");
      b.innerHTML = '<span class="dr-chip__name"></span><span class="dr-chip__meta"></span>';
      b.firstChild.textContent = t.name;
      b.lastChild.textContent = meta || "ще не пробігав";
      b.addEventListener("click", () => loadTemplate(i));
      box.appendChild(b);
    });
  }

  function renderStreak() {
    const n = streakOf();
    $("dr-streak").innerHTML = "Серія <b>" + n + "</b> " + plural(n, "день", "дні", "днів");
  }

  // ---------- Керування ----------
  function toWorld(e) {
    const r = board.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  board.addEventListener("pointerdown", (e) => {
    if (run.state === "done") return;
    e.preventDefault();
    try { board.setPointerCapture(e.pointerId); } catch (err) {}
    steerId = e.pointerId;
    steer = toWorld(e);
    begin();
  });
  board.addEventListener("pointermove", (e) => { if (e.pointerId === steerId) steer = toWorld(e); });
  ["pointerup", "pointercancel"].forEach((ev) =>
    board.addEventListener(ev, (e) => { if (e.pointerId === steerId) { steer = null; steerId = null; } })
  );

  const sprintBtn = $("dr-sprint");
  sprintBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    try { sprintBtn.setPointerCapture(e.pointerId); } catch (err) {}
    sprintHeld = true;
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => sprintBtn.addEventListener(ev, () => (sprintHeld = false)));
  sprintBtn.addEventListener("contextmenu", (e) => e.preventDefault());

  const active = () => tabEl.classList.contains("is-active");

  document.addEventListener("keydown", (e) => {
    if (!active() || e.target.tagName === "INPUT") return;
    if (e.key === "ArrowLeft") { keys.left = true; begin(); e.preventDefault(); }
    else if (e.key === "ArrowRight") { keys.right = true; begin(); e.preventDefault(); }
    else if (e.key === "Shift" || e.key === " ") {
      if (e.key === " " && e.target.tagName === "BUTTON") return;
      sprintHeld = true;
      if (e.key === " ") e.preventDefault();
    }
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft") keys.left = false;
    else if (e.key === "ArrowRight") keys.right = false;
    else if (e.key === "Shift" || e.key === " ") sprintHeld = false;
  });

  $("dr-restart").addEventListener("click", () => loadTemplate(tpl.index));
  $("dr-again").addEventListener("click", () => { loadTemplate(tpl.index); tabEl.querySelector(".panel").scrollTo({ top: 0, behavior: "smooth" }); });
  $("dr-next").addEventListener("click", () => { loadTemplate((tpl.index + 1) % TEMPLATES.length); tabEl.querySelector(".panel").scrollTo({ top: 0, behavior: "smooth" }); });
  $("dr-finish").addEventListener("click", finish);

  Share.attachSheet(
    $("dr-share"),
    $("dr-share-sheet"),
    () => {
      if (!lastResult) return null;
      const r = lastResult;
      return {
        text: `Малюнок дня Titan Run: ${tpl.name} — ${r.points} балів ${"★".repeat(r.stars)}${lastPlace ? ` · #${lastPlace} у рейтингу` : ""} 🏃✏️ А ти?`,
        photo: async () => lastBlob,
        filename: `titan-draw-${tpl.id}.png`,
      };
    },
    (text) => Profile.toast(text)
  );

  // ---------- Старт ----------
  $("dr-date").textContent = "Сьогодні, " + new Date().toLocaleDateString("uk-UA", { day: "numeric", month: "long", timeZone: "Europe/Kyiv" }) + ": " + TEMPLATES[DAILY].name;
  loadTemplate(DAILY);
  renderStreak();

  // Вихід з вкладки чи згортання застосунку ставить забіг на паузу
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });

  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (active()) {
      update(dt);
      render();
      hud();
    } else if (run.state === "running") pause();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.DrawUI = { loadTemplate, dailyId: () => TEMPLATES[DAILY].id };
})();
