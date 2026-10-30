// «Недільна пробіжка»: забіг на 5/10 км із групою клубу від КТС і назад.
// Траса тижня однакова для всіх і змінюється щопонеділка (за київським часом).
(function () {
  const H = 400;
  const GROUND = H - 70;
  const MIN_W = 480;
  const GROUP_SPEED = 420;            // px/с — темп групи
  const PX_PER_KM = GROUP_SPEED * 36; // група пробігає 1 км за 36 с гри…
  const TIME_SCALE = 10;              // …що відповідає темпу 6:00/км у «реальному» часі
  const GRAVITY = 2300;
  const JUMP = -760;
  const DOUBLE_JUMP = -640;
  const SPRINT = 1.4;
  const GEL = 1.25;
  const STUMBLE = 0.45;
  const TIRED = 0.75;
  const GROUP_RADIUS = 260;           // px: ближче — біжиш «з групою»
  const PLAYER_X = 150;               // де на екрані тримаємо бігуна
  const CONTROLS_SPACE = 92;          // CSS px під кнопками «Темп» і «Стрибок»

  // Перший тиждень, від якого рахуємо чергування трас (понеділок 26.10.2026)
  const FIRST_MONDAY = Date.UTC(2026, 9, 26);
  const THEMES = [
    { name: "Клубна траса", stops: ["вул. Шухевича", "вул. Костромська", "Епіцентр", "вул. Вербова"], sky: ["#7cc8f2", "#fde9c8"] },
    { name: "Гідропарк", stops: ["вул. Соборна", "Гідропарк", "річка Устя", "Свято-Воскресенський собор"], sky: ["#8fd3f0", "#e8f6ff"] },
    { name: "Басів Кут", stops: ["вул. Шухевича", "Басів Кут", "озеро Басів Кут", "вул. Вербова"], sky: ["#a5d8f5", "#fff1d6"] },
    { name: "Центр міста", stops: ["Театральна площа", "вул. Соборна", "парк Шевченка", "Свято-Воскресенський собор"], sky: ["#79b9ef", "#ffe3c4"] },
  ];

  const OBSTACLES = {
    cone: { w: 26, h: 40 },
    puddle: { w: 74, h: 8 },
    bench: { w: 70, h: 44 },
    dog: { w: 48, h: 32 },
    scooter: { w: 50, h: 46 },
  };

  const PHRASES = [
    "Тримаємо темп! 💪",
    "Ще трохи — і кава ☕",
    "Дай п'ять! ✋",
    "Як настрій?",
    "На фініші фото! 📸",
    "Смаколики чекають 🥐",
    "Не відставай!",
    "Красиво біжимо 🧡",
  ];

  const DEFAULT_RUNNERS = ["Коля кум", "Вадік кум", "Макс", "Паша", "Іра", "Настя", "Таня", "Люда"];
  const SKIN = ["#f1c27d", "#e0ac69", "#ffdbac", "#c68642"];
  const SHORTS = ["#33333a", "#1f3b73", "#2d5a3d", "#5b2a6e", "#444"];

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---------- Тиждень і траса ----------

  function kyivToday() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }

  function mondayOf(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const t = Date.UTC(y, m - 1, d);
    const weekday = (new Date(t).getUTCDay() + 6) % 7;
    return new Date(t - weekday * 864e5);
  }

  function isoWeekNumber(monday) {
    const thursday = new Date(monday.getTime() + 3 * 864e5);
    const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
    return Math.floor((thursday - yearStart) / 864e5 / 7) + 1;
  }

  /** offset = 0 — поточний тиждень, -1 — минулий і т.д. */
  function weekInfo(offset) {
    const monday = mondayOf(kyivToday());
    monday.setUTCDate(monday.getUTCDate() + (offset || 0) * 7);
    const index = Math.round((monday.getTime() - FIRST_MONDAY) / (7 * 864e5));
    const theme = THEMES[((index % THEMES.length) + THEMES.length) % THEMES.length];
    return { id: monday.toISOString().slice(0, 10), number: isoWeekNumber(monday), monday, theme };
  }

  // Детермінований генератор: та сама траса для всіх гравців протягом тижня
  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function buildTrack(week, distKm) {
    const r = rng(hash(week.id + ":" + distKm));
    const end = distKm * PX_PER_KM;
    const items = [];
    const kinds = Object.keys(OBSTACLES);
    for (let x = 1400; x < end - 900; x += 560 + r() * 520) {
      const type = kinds[Math.floor(r() * kinds.length)];
      items.push({ kind: "obstacle", type, x, w: OBSTACLES[type].w, h: OBSTACLES[type].h });
    }
    for (let x = 2600; x < end - 600; x += 2600 + r() * 2200) {
      items.push({ kind: "pickup", type: r() < 0.82 ? "water" : "gel", x, w: 24, h: 24, y: GROUND - 60 - r() * 90 });
    }
    // Зупинки (вулиці й місця) рівномірно по трасі, КТС — на старті й фініші
    const stops = week.theme.stops.map((name, i) => ({ name, x: (end * (i + 1)) / (week.theme.stops.length + 1) }));
    return { end, items, stops };
  }

  function runners() {
    const named = (window.TITAN_CONFIG && window.TITAN_CONFIG.clubRunners) || DEFAULT_RUNNERS;
    const r = rng(hash(named.join(",")));
    const list = named.slice(0, 14).map((name) => ({ name }));
    while (list.length < 12) list.push({ name: "" });
    return list.map((p, i) => ({
      ...p,
      offset: -230 + r() * 330,
      depth: r() * 14 - 4,
      skin: SKIN[i % SKIN.length],
      shorts: SHORTS[Math.floor(r() * SHORTS.length)],
      phase: r() * 6,
      tempo: 0.92 + r() * 0.16,
    }));
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = String(m).padStart(h ? 2 : 1, "0");
    return (h ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
  }

  // ---------- Малювання (спільне для гри й фото) ----------

  // Бігун «паличками»; s — масштаб, swing — фаза бігу (null — стоїть)
  function drawPerson(c, x, y, s, look, swing, wave) {
    const shirt = look.shirt || css("--brand");
    const hip = y - 28 * s;
    const shoulder = y - 50 * s;
    c.lineCap = "round";
    c.lineWidth = 7 * s;
    c.strokeStyle = look.shorts;
    if (swing === null) {
      line(c, x - 2 * s, hip, x - 6 * s, y);
      line(c, x + 2 * s, hip, x + 6 * s, y);
    } else {
      limb(c, x, hip, -swing, 14 * s, 15 * s);
      limb(c, x, hip, swing, 14 * s, 15 * s);
    }
    c.strokeStyle = shirt;
    c.lineWidth = 13 * s;
    line(c, x, hip, x + (swing === null ? 0 : 3 * s), shoulder);
    c.lineWidth = 6 * s;
    c.strokeStyle = look.skin;
    if (swing === null) {
      line(c, x - 4 * s, shoulder + 4 * s, x - 10 * s, hip + 4 * s);
      if (wave) line(c, x + 4 * s, shoulder + 4 * s, x + 14 * s, shoulder - 16 * s);
      else line(c, x + 4 * s, shoulder + 4 * s, x + 10 * s, hip + 4 * s);
    } else {
      limb(c, x + 2 * s, shoulder + 4 * s, swing, 12 * s, 11 * s);
      limb(c, x + 2 * s, shoulder + 4 * s, -swing, 12 * s, 11 * s);
    }
    c.fillStyle = look.skin;
    c.beginPath();
    c.arc(x + (swing === null ? 0 : 5 * s), shoulder - 11 * s, 9 * s, 0, Math.PI * 2);
    c.fill();
  }

  function line(c, x1, y1, x2, y2) {
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }

  function limb(c, x, y, swing, l1, l2) {
    const a1 = Math.PI / 2 + swing * 0.8;
    const kx = x + Math.cos(a1) * l1;
    const ky = y + Math.sin(a1) * l1;
    const a2 = a1 + (swing > 0 ? 0.2 : 0.9);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(kx, ky);
    c.lineTo(kx + Math.cos(a2) * l2, ky + Math.sin(a2) * l2);
    c.stroke();
  }

  // Будівля КТС (місце збору клубу): графітовий фасад, мансарда під черепицею,
  // бірюзовий логотип у заокругленій рамці на розі та бірюзовий портал входу
  const KTS = { wall: "#4b4a4f", trim: "#3c3b40", roof: "#8b4a36", mint: "#3cc9b4", glass: "#8fb7c9", frame: "#2a2a2e" };

  function drawKTS(c, x, ground, s) {
    const w = 300 * s;
    const h = 150 * s;
    const top = ground - h;

    // Дах-мансарда з двома слуховими вікнами
    c.fillStyle = KTS.roof;
    c.beginPath();
    c.moveTo(x - 6 * s, top);
    c.lineTo(x + 26 * s, top - 44 * s);
    c.lineTo(x + w - 26 * s, top - 44 * s);
    c.lineTo(x + w + 6 * s, top);
    c.fill();
    for (const dx of [150, 232]) {
      c.fillStyle = KTS.wall;
      c.fillRect(x + dx * s, top - 34 * s, 26 * s, 26 * s);
      c.fillStyle = KTS.glass;
      c.fillRect(x + (dx + 6) * s, top - 28 * s, 14 * s, 18 * s);
      c.fillStyle = KTS.roof;
      c.beginPath();
      c.moveTo(x + (dx - 4) * s, top - 34 * s);
      c.lineTo(x + (dx + 13) * s, top - 46 * s);
      c.lineTo(x + (dx + 30) * s, top - 34 * s);
      c.fill();
    }

    // Фасад і карниз із зубчиками
    c.fillStyle = KTS.wall;
    c.fillRect(x, top, w, h);
    c.fillStyle = KTS.trim;
    c.fillRect(x, top, w, 8 * s);
    for (let i = 0; i < 30; i++) c.fillRect(x + (4 + i * 10) * s, top + 8 * s, 5 * s, 5 * s);
    c.fillRect(x, top + 72 * s, w, 4 * s);

    // Вікна (на лівому розі вікон менше — там логотип)
    for (const [wx, wy, ww, wh] of [[150, 22, 20, 40], [196, 22, 20, 40], [242, 22, 20, 40], [150, 86, 22, 46], [242, 86, 22, 46]]) {
      c.fillStyle = KTS.frame;
      c.fillRect(x + wx * s, top + wy * s, ww * s, wh * s);
      c.fillStyle = KTS.glass;
      c.fillRect(x + (wx + 3) * s, top + (wy + 3) * s, (ww - 6) * s, (wh - 6) * s);
    }

    // Бірюзовий логотип у заокругленій рамці
    const lx = x + 8 * s;
    const ly = top + 14 * s;
    const lw = 128 * s;
    const lh = 60 * s;
    c.strokeStyle = KTS.mint;
    c.lineWidth = 7 * s;
    c.beginPath();
    if (c.roundRect) c.roundRect(lx, ly, lw, lh, lh / 2);
    else c.rect(lx, ly, lw, lh);
    c.stroke();
    c.fillStyle = KTS.mint;
    c.font = `800 ${38 * s}px Montserrat, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("КТС", lx + lw / 2, ly + lh / 2 + 2 * s);
    c.textAlign = "left";
    c.textBaseline = "alphabetic";

    // Вхід: бірюзовий портал-навіс і скляні двері
    const ex = x + 96 * s;
    c.fillStyle = KTS.mint;
    c.fillRect(ex - 8 * s, top + 84 * s, 52 * s, 7 * s);
    c.fillRect(ex + 36 * s, top + 84 * s, 8 * s, h - 84 * s);
    c.fillStyle = KTS.frame;
    c.fillRect(ex, top + 94 * s, 32 * s, h - 94 * s);
    c.fillStyle = "#5f7f8f";
    c.fillRect(ex + 3 * s, top + 97 * s, 26 * s, h - 97 * s);
  }

  // ---------- Гра ----------

  class SundayGame {
    constructor(canvas, ui) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.ui = ui;
      this.running = false;
      this.paused = false;
      this.group = runners();
      this.setup(weekInfo(0), 5);
      this.resize();
      window.addEventListener("resize", () => this.resize());
    }

    setup(week, distKm) {
      this.week = week;
      this.dist = distKm;
      this.track = buildTrack(week, distKm);
      this.items = this.track.items.map((it) => ({ ...it }));
      this.player = { pos: 0, y: GROUND, vy: 0, jumps: 0, phase: 0, speed: GROUP_SPEED };
      this.groupPos = 0;
      this.time = 0;
      this.energy = 100;
      this.gel = 0;
      this.stumble = 0;
      this.stumbles = 0;
      this.sprinting = false;
      this.withGroup = true;
      this.bubble = null;
      this.nextBubble = 3;
      this.stopIndex = 0;
      this.finished = false;
      this.draw();
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = window.devicePixelRatio || 1;
      this.scale = Math.min(rect.height / H, rect.width / MIN_W);
      this.W = rect.width / this.scale;
      // Сцену піднімаємо над кнопками керування, щоб вони не закривали бігунів
      this.bottom = CONTROLS_SPACE / this.scale;
      this.top = rect.height / this.scale - H - this.bottom;
      this.canvas.width = Math.round(rect.width * dpr);
      this.canvas.height = Math.round(rect.height * dpr);
      const k = dpr * this.scale;
      this.ctx.setTransform(k, 0, 0, k, 0, this.top * k);
      this.draw();
    }

    start(distKm) {
      this.setup(weekInfo(0), distKm);
      this.running = true;
      this.paused = false;
      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }

    pause() {
      if (this.running) {
        this.running = false;
        this.paused = true;
      }
    }

    resume() {
      if (!this.paused) return;
      this.paused = false;
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }

    jump() {
      if (!this.running) return;
      const p = this.player;
      if (p.jumps === 0 && p.y >= GROUND) {
        p.vy = JUMP;
        p.jumps = 1;
      } else if (p.jumps === 1) {
        p.vy = DOUBLE_JUMP;
        p.jumps = 2;
      }
    }

    setSprint(on) {
      this.sprinting = on;
    }

    loop(now) {
      if (!this.running) return;
      const dt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      this.update(dt);
      this.draw();
      if (this.running) requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
      const p = this.player;
      this.time += dt;
      this.gel = Math.max(0, this.gel - dt);
      this.stumble = Math.max(0, this.stumble - dt);

      // Темп: прискорення коштує енергії, група «тягне» і відновлює сили
      const sprint = this.sprinting && this.energy > 0;
      let mult = 1;
      if (sprint) mult *= SPRINT;
      if (this.gel > 0) mult *= GEL;
      if (this.stumble > 0) mult *= STUMBLE;
      if (this.energy <= 0) mult *= TIRED;
      p.speed += (GROUP_SPEED * mult - p.speed) * Math.min(1, dt * 4);
      p.pos += p.speed * dt;
      this.groupPos = Math.min(this.track.end + 400, this.groupPos + GROUP_SPEED * dt);

      this.withGroup = Math.abs(p.pos - this.groupPos) < GROUP_RADIUS;
      this.energy -= dt * (0.5 + (sprint ? 4.5 : 0));
      if (this.withGroup && !sprint) this.energy += dt * 1.6;
      this.energy = Math.max(0, Math.min(100, this.energy));

      p.vy += GRAVITY * dt;
      p.y += p.vy * dt;
      if (p.y >= GROUND) {
        p.y = GROUND;
        p.vy = 0;
        p.jumps = 0;
      }
      p.phase += (dt * p.speed) / 38;

      this.collide();

      // Репліки одноклубників, поки біжиш поруч
      this.nextBubble -= dt;
      if (this.bubble) {
        this.bubble.ttl -= dt;
        if (this.bubble.ttl <= 0) this.bubble = null;
      }
      if (this.nextBubble <= 0 && this.withGroup) {
        const named = this.group.filter((g) => g.name);
        const who = named[Math.floor(Math.random() * named.length)];
        const next = this.track.stops[this.stopIndex];
        const pool = next ? PHRASES.concat([`До «${next.name}» вже близько!`]) : PHRASES;
        if (who) this.bubble = { who, text: pool[Math.floor(Math.random() * pool.length)], ttl: 2.4 };
        this.nextBubble = 4 + Math.random() * 3;
      }

      const stop = this.track.stops[this.stopIndex];
      if (stop && p.pos >= stop.x) {
        this.ui.toast(`📍 ${stop.name}`);
        this.stopIndex++;
      }

      this.ui.hud(this.hudState());

      if (p.pos >= this.track.end) this.finish();
    }

    collide() {
      const p = this.player;
      const left = p.pos - 11;
      const right = p.pos + 11;
      const bottom = p.y;
      const top = p.y - 56;
      for (const it of this.items) {
        if (it.done || it.x > right + 10) continue;
        if (it.x + it.w < left) continue;
        if (it.kind === "pickup") {
          if (bottom > it.y && top < it.y + it.h) {
            it.done = true;
            if (it.type === "water") {
              this.energy = Math.min(100, this.energy + 22);
              this.ui.toast("💧 +енергія");
            } else {
              this.gel = 4;
              this.ui.toast("⚡ Енергогель!");
            }
          }
        } else if (bottom > GROUND - it.h) {
          it.done = true;
          if (this.gel > 0) continue;
          this.stumble = 0.9;
          this.stumbles++;
          this.ui.toast("Ой! Спіткнувся 😬");
        }
      }
    }

    hudState() {
      const p = this.player;
      const km = Math.min(this.dist, p.pos / PX_PER_KM);
      const realTime = this.time * TIME_SCALE;
      const gap = Math.round(((p.pos - this.groupPos) / PX_PER_KM) * 1000);
      return {
        km,
        dist: this.dist,
        time: formatTime(realTime),
        pace: km > 0.05 ? formatTime(realTime / km) : "—",
        energy: this.energy,
        group: this.withGroup ? "👥 біжиш з групою" : gap > 0 ? `👥 група позаду ${gap} м` : `👥 група попереду ${-gap} м`,
        progress: Math.min(1, p.pos / this.track.end),
      };
    }

    finish() {
      this.running = false;
      this.finished = true;
      const time = Math.round(this.time * TIME_SCALE);
      this.draw();
      this.ui.finish({
        week: this.week,
        dist: this.dist,
        time,
        pace: time / this.dist,
        stumbles: this.stumbles,
        withGroup: this.withGroup,
      });
    }

    // ---------- Малювання світу ----------

    draw() {
      const c = this.ctx;
      if (!this.W) return;
      const W = this.W;
      const cam = this.player.pos - PLAYER_X;
      const theme = this.week.theme;

      const g = c.createLinearGradient(0, -this.top, 0, GROUND);
      g.addColorStop(0, theme.sky[0]);
      g.addColorStop(1, theme.sky[1]);
      c.fillStyle = g;
      c.fillRect(0, -this.top, W, GROUND + this.top);
      c.fillStyle = "#fff6b0";
      c.beginPath();
      c.arc(W * 0.82, 60, 30, 0, Math.PI * 2);
      c.fill();

      this.drawParallax(c, W, cam);

      // Пам'ятки біля зупинок
      for (const stop of this.track.stops) {
        const sx = stop.x - cam;
        if (sx < -300 || sx > W + 300) continue;
        this.drawLandmark(c, sx, stop.name);
      }
      // КТС на старті й фініші
      for (const kx of [-100, this.track.end + 120]) {
        const sx = kx - cam;
        if (sx > -300 && sx < W + 50) drawKTS(c, sx, GROUND, 1);
      }

      // Доріжка
      c.fillStyle = "#2b2b31";
      c.fillRect(0, GROUND, W, H - GROUND + this.bottom);
      c.fillStyle = "#c9c4bb";
      c.fillRect(0, GROUND, W, 6);
      c.fillStyle = "rgba(255,255,255,.5)";
      const off = ((cam % 60) + 60) % 60;
      for (let x = -off; x < W; x += 60) c.fillRect(x, GROUND + 30, 30, 4);

      // Старт, кілометри, фініш
      this.drawBanner(c, 0 - cam, "СТАРТ");
      this.drawBanner(c, this.track.end - cam, "ФІНІШ");
      for (let k = 1; k < this.dist; k++) {
        const sx = k * PX_PER_KM - cam;
        if (sx > -20 && sx < W + 20) {
          c.fillStyle = "#fff";
          c.fillRect(sx - 1, GROUND - 46, 3, 46);
          c.fillStyle = css("--brand");
          c.fillRect(sx - 18, GROUND - 62, 36, 18);
          c.fillStyle = "#fff";
          c.font = "700 12px Oswald, sans-serif";
          c.textAlign = "center";
          c.fillText(k + " км", sx, GROUND - 49);
          c.textAlign = "left";
        }
      }

      for (const it of this.items) {
        const sx = it.x - cam;
        if (it.done || sx < -100 || sx > W + 100) continue;
        if (it.kind === "obstacle") this.drawObstacle(c, it, sx);
        else this.drawPickup(c, it, sx);
      }

      this.drawGroup(c, cam);
      this.drawPlayer(c);
      this.drawBubble(c, cam);
    }

    drawParallax(c, W, cam) {
      const tile = 420;
      const far = ((cam * 0.15) % tile + tile) % tile;
      c.fillStyle = "rgba(60,60,80,.25)";
      const blocks = [[0, 80, 60], [70, 130, 50], [130, 60, 90], [230, 110, 50], [290, 150, 40], [340, 90, 70]];
      for (let x = -far; x < W + tile; x += tile) {
        for (const [bx, h, w] of blocks) c.fillRect(x + bx, GROUND - 40 - h, w, h + 40);
      }
      const near = ((cam * 0.4) % 300 + 300) % 300;
      for (let x = -near; x < W + 300; x += 300) {
        for (const tx of [60, 210]) {
          c.fillStyle = "#4a3426";
          c.fillRect(x + tx - 4, GROUND - 40, 8, 40);
          c.fillStyle = "#2f7d4a";
          c.beginPath();
          c.arc(x + tx, GROUND - 54, 26, 0, Math.PI * 2);
          c.fill();
        }
      }
    }

    drawLandmark(c, x, name) {
      if (/Епіцентр/.test(name)) {
        c.fillStyle = "#d8d8dc";
        c.fillRect(x - 160, GROUND - 120, 320, 120);
        c.fillStyle = "#f5a200";
        c.fillRect(x - 160, GROUND - 120, 320, 16);
        c.fillStyle = "#2e7d32";
        c.fillRect(x - 70, GROUND - 160, 140, 34);
        c.fillStyle = "#fff";
        c.font = "700 20px Oswald, sans-serif";
        c.textAlign = "center";
        c.fillText("ЕПІЦЕНТР", x, GROUND - 136);
        c.textAlign = "left";
      } else if (/собор/.test(name)) {
        c.fillStyle = "#f3efe6";
        c.fillRect(x - 60, GROUND - 110, 120, 110);
        c.fillStyle = "#3f7fbf";
        for (const [dx, r, top] of [[0, 26, 150], [-42, 16, 118], [42, 16, 118]]) {
          c.beginPath();
          c.arc(x + dx, GROUND - top + r, r, Math.PI, 0);
          c.fill();
          c.fillStyle = "#d4af37";
          c.fillRect(x + dx - 2, GROUND - top - 16, 4, 18);
          c.fillStyle = "#3f7fbf";
        }
      } else if (/озеро|Устя|Гідропарк/.test(name)) {
        c.fillStyle = "#5fb3e6";
        c.beginPath();
        c.ellipse(x, GROUND - 6, 220, 22, 0, Math.PI, 0);
        c.fill();
      } else if (/парк|Басів Кут/.test(name)) {
        for (const dx of [-90, -30, 40, 100]) {
          c.fillStyle = "#4a3426";
          c.fillRect(x + dx - 5, GROUND - 60, 10, 60);
          c.fillStyle = "#3c9a5c";
          c.beginPath();
          c.arc(x + dx, GROUND - 78, 34, 0, Math.PI * 2);
          c.fill();
        }
      }
      // Табличка з назвою місця
      c.font = "600 13px Montserrat, sans-serif";
      const tw = c.measureText(name).width + 18;
      c.fillStyle = "#555";
      c.fillRect(x - 2, GROUND - 70, 4, 70);
      c.fillStyle = "#1e6b3a";
      c.fillRect(x - tw / 2, GROUND - 96, tw, 26);
      c.fillStyle = "#fff";
      c.textAlign = "center";
      c.fillText(name, x, GROUND - 78);
      c.textAlign = "left";
    }

    drawBanner(c, x, text) {
      if (x < -120 || x > this.W + 120) return;
      // Банер вище даху КТС, щоб не закривав будівлю
      c.fillStyle = "#555";
      c.fillRect(x - 70, GROUND - 220, 5, 220);
      c.fillRect(x + 65, GROUND - 220, 5, 220);
      c.fillStyle = css("--brand");
      c.fillRect(x - 74, GROUND - 240, 148, 30);
      c.fillStyle = "#fff";
      c.font = "700 18px Oswald, sans-serif";
      c.textAlign = "center";
      c.fillText(text, x, GROUND - 218);
      c.textAlign = "left";
    }

    drawObstacle(c, o, x) {
      const y = GROUND - o.h;
      const { w, h } = o;
      switch (o.type) {
        case "cone":
          c.fillStyle = "#ff7b00";
          c.beginPath();
          c.moveTo(x + w / 2, y);
          c.lineTo(x + w, y + h);
          c.lineTo(x, y + h);
          c.fill();
          c.fillStyle = "#fff";
          c.fillRect(x + 7, y + h * 0.45, w - 14, 6);
          break;
        case "puddle":
          c.fillStyle = "#3d8fd6";
          c.beginPath();
          c.ellipse(x + w / 2, y + h, w / 2, h, 0, 0, Math.PI * 2);
          c.fill();
          break;
        case "bench":
          c.fillStyle = "#8d5a33";
          c.fillRect(x, y + 14, w, 10);
          c.fillRect(x, y, w, 8);
          c.fillStyle = "#333";
          c.fillRect(x + 6, y + 24, 6, h - 24);
          c.fillRect(x + w - 12, y + 24, 6, h - 24);
          break;
        case "dog":
          c.fillStyle = "#7a5230";
          c.fillRect(x + 6, y + 8, w - 14, 14);
          c.fillRect(x - 4, y, 16, 14);
          c.fillRect(x + 8, y + 22, 5, 10);
          c.fillRect(x + w - 14, y + 22, 5, 10);
          c.fillRect(x + w - 10, y + 4, 10, 4);
          break;
        case "scooter":
          c.strokeStyle = "#222";
          c.lineWidth = 4;
          line(c, x + 8, y + h - 8, x + w - 8, y + h - 8);
          line(c, x + w - 10, y + h - 8, x + w - 14, y);
          line(c, x + w - 22, y, x + w - 6, y);
          c.fillStyle = "#2ecc71";
          c.fillRect(x + 8, y + h - 14, w - 20, 5);
          c.fillStyle = "#222";
          for (const wx of [x + 8, x + w - 10]) {
            c.beginPath();
            c.arc(wx, y + h - 4, 5, 0, Math.PI * 2);
            c.fill();
          }
          break;
      }
    }

    drawPickup(c, it, x) {
      const y = it.y + Math.sin(this.time * 4 + it.x) * 5;
      const cx = x + it.w / 2;
      const cy = y + it.h / 2;
      if (it.type === "water") {
        c.fillStyle = "#4fc3f7";
        c.fillRect(cx - 7, cy - 8, 14, 20);
        c.fillStyle = "#0277bd";
        c.fillRect(cx - 4, cy - 13, 8, 5);
      } else {
        c.fillStyle = css("--accent");
        c.beginPath();
        c.moveTo(cx + 3, cy - 13);
        c.lineTo(cx - 8, cy + 2);
        c.lineTo(cx, cy + 2);
        c.lineTo(cx - 3, cy + 13);
        c.lineTo(cx + 8, cy - 2);
        c.lineTo(cx, cy - 2);
        c.fill();
      }
    }

    // Одноклубники біжать групою й самі перестрибують перешкоди
    drawGroup(c, cam) {
      const labels = [];
      for (const m of this.group) {
        const wx = this.groupPos + m.offset + Math.sin(this.time * 0.7 + m.phase) * 25;
        const sx = wx - cam;
        if (sx < -40 || sx > this.W + 40) continue;
        let hop = 0;
        for (const it of this.items) {
          if (it.kind !== "obstacle") continue;
          const d = Math.abs(it.x + it.w / 2 - wx);
          if (d < 70) hop = Math.max(hop, (1 - d / 70) * (it.h + 18));
        }
        const y = GROUND + m.depth * 0.3 - hop;
        c.globalAlpha = 0.9;
        drawPerson(c, sx, y, 0.92, m, hop > 0 ? 0.6 : Math.sin(this.time * 11 * m.tempo + m.phase));
        c.globalAlpha = 1;
        if (m.name) labels.push({ name: m.name, x: sx, y: y - 76 });
      }
      // Підписуємо лише тих, чиї імена не налазять одне на одне й на «ТИ»
      c.font = "600 11px Montserrat, sans-serif";
      c.fillStyle = "rgba(51,51,58,.85)";
      c.textAlign = "center";
      const placed = [{ x: PLAYER_X, w: 40 }];
      labels.sort((a, b) => Math.abs(a.x - PLAYER_X) - Math.abs(b.x - PLAYER_X));
      for (const l of labels) {
        const w = c.measureText(l.name).width + 10;
        if (placed.some((p) => Math.abs(p.x - l.x) < (p.w + w) / 2)) continue;
        placed.push({ x: l.x, w });
        c.fillText(l.name, l.x, l.y);
      }
      c.textAlign = "left";
    }

    drawPlayer(c) {
      const p = this.player;
      if (this.gel > 0) {
        c.fillStyle = "rgba(255,194,26,.35)";
        c.beginPath();
        c.ellipse(PLAYER_X, p.y - 32, 30, 40, 0, 0, Math.PI * 2);
        c.fill();
      }
      const swing = p.y < GROUND ? 0.6 : Math.sin(p.phase);
      drawPerson(c, PLAYER_X, p.y, 1, { shirt: css("--brand"), shorts: css("--ink"), skin: css("--brand") }, swing);
      c.font = "700 12px Montserrat, sans-serif";
      c.fillStyle = css("--brand");
      c.textAlign = "center";
      c.fillText("ТИ", PLAYER_X, p.y - 80);
      c.textAlign = "left";
    }

    drawBubble(c, cam) {
      const b = this.bubble;
      if (!b) return;
      const wx = this.groupPos + b.who.offset + Math.sin(this.time * 0.7 + b.who.phase) * 25;
      const sx = Math.max(90, Math.min(this.W - 90, wx - cam));
      const text = `${b.who.name}: ${b.text}`;
      c.font = "600 12px Montserrat, sans-serif";
      const w = c.measureText(text).width + 20;
      const y = GROUND - 128;
      c.fillStyle = "#fff";
      c.strokeStyle = css("--ink");
      c.lineWidth = 1.5;
      c.beginPath();
      c.roundRect ? c.roundRect(sx - w / 2, y, w, 26, 12) : c.rect(sx - w / 2, y, w, 26);
      c.fill();
      c.stroke();
      c.fillStyle = css("--ink");
      c.textAlign = "center";
      c.fillText(text, sx, y + 17);
      c.textAlign = "left";
    }
  }

  // ---------- Фото на фініші (1080×1920, для сторіс) ----------

  async function groupPhoto(result, name, place) {
    const W = 1080;
    const Hh = 1920;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = Hh;
    const c = cv.getContext("2d");
    const brand = css("--brand");
    const ink = css("--ink");
    await document.fonts.ready;

    const sky = c.createLinearGradient(0, 0, 0, 1300);
    sky.addColorStop(0, result.week.theme.sky[0]);
    sky.addColorStop(1, result.week.theme.sky[1]);
    c.fillStyle = sky;
    c.fillRect(0, 0, W, Hh);

    c.textAlign = "center";
    c.fillStyle = ink;
    c.font = "700 92px Oswald, sans-serif";
    c.fillText("НЕДІЛЬНА ПРОБІЖКА", W / 2, 170);
    c.font = "600 44px Montserrat, sans-serif";
    c.fillText(`Тиждень №${result.week.number} · ${result.week.theme.name}`, W / 2, 240);

    // КТС і група на тлі
    drawKTS(c, 90, 1180, 3);
    c.fillStyle = "#cfc9bf";
    c.fillRect(0, 1180, W, 120);

    const group = runners();
    const back = group.slice(0, 7);
    const front = group.slice(7, 13);
    c.textAlign = "center";
    back.forEach((m, i) => {
      const x = 130 + i * 136;
      drawPerson(c, x, 1190, 2.6, m, null, i % 3 === 0);
    });
    const me = { shirt: brand, shorts: ink, skin: brand };
    const frontXs = [150, 300, 450, 630, 780, 930];
    front.forEach((m, i) => drawPerson(c, frontXs[i], 1300, 3, m, null, i % 2 === 1));
    c.fillStyle = "rgba(248,90,10,.18)";
    c.beginPath();
    c.ellipse(540, 1170, 110, 190, 0, 0, Math.PI * 2);
    c.fill();
    drawPerson(c, 540, 1320, 3.4, me, null, true);

    // Імена під групою
    c.fillStyle = ink;
    c.font = "600 30px Montserrat, sans-serif";
    const names = group.filter((m) => m.name).map((m) => m.name);
    for (let i = 0; i < names.length; i += 5) c.fillText(names.slice(i, i + 5).join(" · "), W / 2, 1362 + (i / 5) * 40);

    // Кава на фініші
    for (const [x, col] of [[150, "#6f4e37"], [900, "#c0392b"]]) {
      c.fillStyle = "#fff";
      c.fillRect(x - 26, 1452, 52, 58);
      c.fillStyle = col;
      c.fillRect(x - 26, 1452, 52, 12);
      c.strokeStyle = "#fff";
      c.lineWidth = 8;
      c.beginPath();
      c.arc(x + 34, 1480, 14, -Math.PI / 2, Math.PI / 2);
      c.stroke();
    }
    c.fillStyle = ink;
    c.font = "600 34px Montserrat, sans-serif";
    c.fillText("☕ кава й смаколики в КТС", W / 2, 1495);

    // Результат
    c.fillStyle = brand;
    c.fillRect(0, Hh - 380, W, 380);
    c.fillStyle = "#fff";
    c.font = "700 64px Oswald, sans-serif";
    c.fillText(name ? name.toUpperCase() : "МІЙ РЕЗУЛЬТАТ", W / 2, Hh - 290);
    c.font = "700 120px Oswald, sans-serif";
    c.fillText(`${result.dist} КМ · ${formatTime(result.time)}`, W / 2, Hh - 165);
    c.font = "600 40px Montserrat, sans-serif";
    const extra = [`темп ${formatTime(result.pace)}/км`];
    if (place) extra.push(`#${place} цього тижня`);
    c.fillText(extra.join(" · "), W / 2, Hh - 100);
    c.font = "600 34px Montserrat, sans-serif";
    c.fillText("@titan.club.rivne · Titan Run", W / 2, Hh - 45);

    return new Promise((resolve) => cv.toBlob(resolve, "image/png"));
  }

  window.SundayRun = { SundayGame, weekInfo, formatTime, groupPhoto, buildTrack, PX_PER_KM, TIME_SCALE };
})();
