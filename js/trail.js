// «Трейл»: підготовка до Житомирських вертикалей — забіг лісовою стежкою з підйомами й спусками.
// Траси 7, 13 і 26 км фіксовані (однакові для всіх), тож рейтинг — найкращий час за весь час.
(function () {
  const { drawPerson, formatTime, rng, hash } = window.SundayRun;

  const H = 400;
  const BASE_Y = H - 110;            // де на екрані «земля» під бігуном
  const MIN_W = 480;
  const SPEED = 420;                 // px/с по рівному
  const PX_PER_KM = SPEED * 15;      // 1 км по рівному — 15 с гри…
  const TIME_SCALE = 24;             // …що відповідає темпу 6:00/км
  const METER_PX = 6;                // 1 м висоти на екрані
  const GRAVITY = 2300;
  const JUMP = 760;
  const DOUBLE_JUMP = 640;
  const SPRINT = 1.4;
  const GEL = 1.25;
  const STUMBLE = 0.45;
  const EXHAUSTED = 0.6;             // без сил — переходиш на крок
  const PLAYER_X = 150;
  const CONTROLS_SPACE = 92;

  // Пункти харчування (км) для кожної дистанції
  const TRACKS = {
    7: { aid: [3.5] },
    13: { aid: [4.5, 9] },
    26: { aid: [6.5, 13, 19.5] },
  };

  const OBSTACLES = {
    root: { w: 44, h: 12 },
    rock: { w: 34, h: 28 },
    log: { w: 84, h: 26 },
    boulder: { w: 46, h: 58 },
    stream: { w: 92, h: 6 },
  };

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---------- Рельєф ----------

  // Висота траси (м) як сума хвиль різного масштабу; фази фіксовані для кожної дистанції
  function makeProfile(distKm) {
    const r = rng(hash("trail:" + distKm));
    const waves = [
      [30, 3.1],
      [17, 1.15],
      [5, 0.42],
      [1.8, 0.17],
    ].map(([amp, len]) => ({ amp, len, phase: r() * Math.PI * 2 }));
    const raw = (km) => waves.reduce((h, w) => h + w.amp * Math.sin((2 * Math.PI * km) / w.len + w.phase), 0);
    const h0 = raw(0);
    const height = (km) => raw(km) - h0;
    let dplus = 0;
    for (let km = 0; km < distKm; km += 0.01) dplus += Math.max(0, height(km + 0.01) - height(km));
    return { height, dplus: Math.round(dplus) };
  }

  function buildTrack(distKm) {
    const r = rng(hash("trail-track:" + distKm));
    const end = distKm * PX_PER_KM;
    const items = [];
    const kinds = Object.keys(OBSTACLES);
    for (let x = 900; x < end - 700; x += 620 + r() * 560) {
      const type = kinds[Math.floor(r() * kinds.length)];
      items.push({ kind: "obstacle", type, x, w: OBSTACLES[type].w, h: OBSTACLES[type].h });
    }
    for (let x = 1800; x < end - 500; x += 2400 + r() * 1400) {
      items.push({ kind: "pickup", type: r() < 0.85 ? "water" : "gel", x, w: 24, h: 24, alt: 50 + r() * 80 });
    }
    const aid = TRACKS[distKm].aid.map((km) => ({ x: km * PX_PER_KM, done: false }));
    return { end, items, aid, profile: makeProfile(distKm) };
  }

  // ---------- Гра ----------

  class TrailGame {
    constructor(canvas, ui) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.ui = ui;
      this.running = false;
      this.paused = false;
      this.setup(7);
      this.resize();
      window.addEventListener("resize", () => this.resize());
    }

    setup(distKm) {
      this.dist = distKm;
      this.track = buildTrack(distKm);
      this.items = this.track.items.map((it) => ({ ...it }));
      this.aid = this.track.aid.map((a) => ({ ...a }));
      this.player = { pos: 0, alt: 0, vz: 0, jumps: 0, phase: 0, speed: SPEED };
      this.time = 0;
      this.energy = 100;
      this.gel = 0;
      this.stumble = 0;
      this.stumbles = 0;
      this.climbed = 0;
      this.sprinting = false;
      this.finished = false;
      this.camH = 0;
      this.draw();
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = window.devicePixelRatio || 1;
      this.scale = Math.min(rect.height / H, rect.width / MIN_W);
      this.W = rect.width / this.scale;
      this.bottom = CONTROLS_SPACE / this.scale;
      this.top = rect.height / this.scale - H - this.bottom;
      this.canvas.width = Math.round(rect.width * dpr);
      this.canvas.height = Math.round(rect.height * dpr);
      const k = dpr * this.scale;
      this.ctx.setTransform(k, 0, 0, k, 0, this.top * k);
      this.draw();
    }

    start(distKm) {
      this.setup(distKm);
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
      if (p.jumps === 0 && p.alt <= 0) {
        p.vz = JUMP;
        p.jumps = 1;
      } else if (p.jumps === 1) {
        p.vz = DOUBLE_JUMP;
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

    heightPx(x) {
      return this.track.profile.height(x / PX_PER_KM) * METER_PX;
    }

    // Ухил (частка: 0.1 = 10%) у точці траси
    grade(x) {
      const km = x / PX_PER_KM;
      const h = this.track.profile.height;
      return (h(km + 0.005) - h(km - 0.005)) / 10;
    }

    update(dt) {
      const p = this.player;
      this.time += dt;
      this.gel = Math.max(0, this.gel - dt);
      this.stumble = Math.max(0, this.stumble - dt);

      // Угору повільніше й важче, униз — швидше і можна перепочити
      const g = this.grade(p.pos);
      const sprint = this.sprinting && this.energy > 0;
      let mult = g > 0 ? 1 / (1 + 5 * g) : 1 + Math.min(-g, 0.2) * 1.5;
      if (sprint) mult *= SPRINT;
      if (this.gel > 0) mult *= GEL;
      if (this.stumble > 0) mult *= STUMBLE;
      if (this.energy <= 0) mult *= EXHAUSTED;
      p.speed += (SPEED * mult - p.speed) * Math.min(1, dt * 4);
      const before = this.track.profile.height(p.pos / PX_PER_KM);
      p.pos += p.speed * dt;
      this.climbed += Math.max(0, this.track.profile.height(p.pos / PX_PER_KM) - before);

      this.energy -= dt * (0.4 + Math.max(g, 0) * 18 * (sprint ? 1.6 : 1) + (sprint ? 4 : 0));
      if (g < -0.03 && !sprint) this.energy += dt * Math.min(2, -g * 12);
      this.energy = Math.max(0, Math.min(100, this.energy));

      p.vz -= GRAVITY * dt;
      p.alt += p.vz * dt;
      if (p.alt <= 0) {
        p.alt = 0;
        p.vz = 0;
        p.jumps = 0;
      }
      p.phase += (dt * p.speed) / 38;

      // Камера плавно стежить за висотою бігуна
      this.camH += (this.heightPx(p.pos) - this.camH) * Math.min(1, dt * 6);

      for (const a of this.aid) {
        if (!a.done && p.pos >= a.x) {
          a.done = true;
          this.energy = 100;
          this.ui.toast("🍌 Пункт харчування — сили відновлено");
        }
      }

      this.collide();
      this.ui.hud(this.hudState());
      if (p.pos >= this.track.end) this.finish();
    }

    collide() {
      const p = this.player;
      const left = p.pos - 11;
      const right = p.pos + 11;
      for (const it of this.items) {
        if (it.done || it.x > right + 10 || it.x + it.w < left) continue;
        if (it.kind === "pickup") {
          if (p.alt + 56 > it.alt && p.alt < it.alt + it.h) {
            it.done = true;
            if (it.type === "water") {
              this.energy = Math.min(100, this.energy + 20);
              this.ui.toast("💧 +енергія");
            } else {
              this.gel = 4;
              this.ui.toast("⚡ Енергогель!");
            }
          }
        } else if (p.alt < it.h - 2) {
          it.done = true;
          if (this.gel > 0) continue;
          this.stumble = 1;
          this.stumbles++;
          this.ui.toast(it.type === "stream" ? "Мокрі ноги! 💦" : "Ой! Зачепився 😬");
        }
      }
    }

    hudState() {
      const p = this.player;
      const km = Math.min(this.dist, p.pos / PX_PER_KM);
      const realTime = this.time * TIME_SCALE;
      const g = Math.round(this.grade(p.pos) * 100);
      return {
        km,
        dist: this.dist,
        time: formatTime(realTime),
        pace: km > 0.05 ? formatTime(realTime / km) : "—",
        energy: this.energy,
        climbed: Math.round(this.climbed),
        dplus: this.track.profile.dplus,
        grade: g,
        hiking: this.energy <= 0,
        progress: Math.min(1, p.pos / this.track.end),
      };
    }

    finish() {
      this.running = false;
      this.finished = true;
      const time = Math.round(this.time * TIME_SCALE);
      this.draw();
      this.ui.finish({ dist: this.dist, time, pace: time / this.dist, stumbles: this.stumbles, dplus: this.track.profile.dplus });
    }

    // ---------- Малювання ----------

    sy(x) {
      return BASE_Y - (this.heightPx(x) - this.camH);
    }

    draw() {
      const c = this.ctx;
      if (!this.W) return;
      const W = this.W;
      const cam = this.player.pos - PLAYER_X;

      const sky = c.createLinearGradient(0, -this.top, 0, BASE_Y);
      sky.addColorStop(0, "#8ec5ea");
      sky.addColorStop(1, "#f3ead6");
      c.fillStyle = sky;
      c.fillRect(0, -this.top, W, BASE_Y + this.top + 200);
      c.fillStyle = "#fff4c2";
      c.beginPath();
      c.arc(W * 0.8, 40, 26, 0, Math.PI * 2);
      c.fill();

      this.drawHills(c, W, cam, 0.12, "#9db8a4", 150, 70);
      this.drawRiver(c, W);
      this.drawHills(c, W, cam, 0.3, "#5f8a6c", 110, 45);
      this.drawPines(c, W, cam);

      // Земля стежки
      const step = 8;
      c.beginPath();
      c.moveTo(0, H + this.bottom + 50);
      for (let sx = 0; sx <= W + step; sx += step) c.lineTo(sx, this.sy(cam + sx));
      c.lineTo(W + step, H + this.bottom + 50);
      c.closePath();
      c.fillStyle = "#5b4636";
      c.fill();
      c.beginPath();
      for (let sx = 0; sx <= W + step; sx += step) {
        const y = this.sy(cam + sx);
        if (sx === 0) c.moveTo(sx, y);
        else c.lineTo(sx, y);
      }
      c.strokeStyle = "#3f8a4a";
      c.lineWidth = 6;
      c.stroke();
      c.strokeStyle = "#a07a55";
      c.lineWidth = 2;
      c.stroke();

      this.drawBanner(c, 0 - cam, 0, "СТАРТ");
      this.drawBanner(c, this.track.end - cam, this.track.end, "ФІНІШ");
      for (let k = 1; k < this.dist; k++) {
        const x = k * PX_PER_KM;
        const sx = x - cam;
        if (sx < -20 || sx > W + 20) continue;
        const y = this.sy(x);
        c.fillStyle = "#6d5640";
        c.fillRect(sx - 2, y - 40, 4, 40);
        c.fillStyle = css("--brand");
        c.fillRect(sx - 18, y - 56, 36, 18);
        c.fillStyle = "#fff";
        c.font = "700 12px Oswald, sans-serif";
        c.textAlign = "center";
        c.fillText(k + " км", sx, y - 43);
        c.textAlign = "left";
      }
      for (const a of this.aid) {
        const sx = a.x - cam;
        if (sx > -80 && sx < W + 80) this.drawAid(c, sx, this.sy(a.x));
      }

      for (const it of this.items) {
        const sx = it.x - cam;
        if (it.done || sx < -100 || sx > W + 100) continue;
        const base = this.sy(it.x + it.w / 2);
        if (it.kind === "obstacle") this.drawObstacle(c, it, sx, base);
        else this.drawPickup(c, it, sx, base);
      }

      const p = this.player;
      const py = this.sy(p.pos) - p.alt;
      if (this.gel > 0) {
        c.fillStyle = "rgba(255,194,26,.35)";
        c.beginPath();
        c.ellipse(PLAYER_X, py - 32, 30, 40, 0, 0, Math.PI * 2);
        c.fill();
      }
      const swing = p.alt > 0 ? 0.6 : Math.sin(p.phase) * (this.energy <= 0 ? 0.5 : 1);
      drawPerson(c, PLAYER_X, py, 1, { shirt: css("--brand"), shorts: css("--ink"), skin: css("--brand") }, swing);
    }

    // Пасма пагорбів із гранітними виступами; parallax — частка руху камери
    drawHills(c, W, cam, parallax, color, base, amp) {
      const off = cam * parallax;
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(0, BASE_Y + 60);
      for (let sx = 0; sx <= W + 10; sx += 10) {
        const x = (sx + off) / 90;
        const y = BASE_Y - base + Math.sin(x * 0.7) * amp * 0.5 + Math.sin(x * 1.9 + 1) * amp * 0.3 + Math.sin(x * 0.23) * amp * 0.4;
        c.lineTo(sx, y);
      }
      c.lineTo(W + 10, BASE_Y + 60);
      c.closePath();
      c.fill();
      // Сірі скелі на ближчому пасмі
      if (parallax > 0.2) {
        const tile = 520;
        const o = ((off % tile) + tile) % tile;
        c.fillStyle = "#8e9399";
        for (let x = -o; x < W + tile; x += tile) {
          c.beginPath();
          c.moveTo(x + 60, BASE_Y - 40);
          c.lineTo(x + 90, BASE_Y - 110);
          c.lineTo(x + 130, BASE_Y - 95);
          c.lineTo(x + 150, BASE_Y - 40);
          c.fill();
        }
      }
    }

    // Річка внизу долини
    drawRiver(c, W) {
      c.fillStyle = "#6fb3d9";
      c.fillRect(0, BASE_Y - 70, W, 10);
    }

    drawPines(c, W, cam) {
      const tile = 160;
      const off = (((cam * 0.55) % tile) + tile) % tile;
      for (let x = -off; x < W + tile; x += tile) {
        for (const [dx, h] of [[20, 70], [80, 95], [130, 60]]) {
          const bx = x + dx;
          const by = BASE_Y - 20;
          c.fillStyle = "#4a3426";
          c.fillRect(bx - 3, by - 14, 6, 14);
          c.fillStyle = "#2e6b45";
          c.beginPath();
          c.moveTo(bx, by - h);
          c.lineTo(bx + 22, by - 10);
          c.lineTo(bx - 22, by - 10);
          c.fill();
        }
      }
    }

    drawBanner(c, sx, x, text) {
      if (sx < -120 || sx > this.W + 120) return;
      const y = this.sy(x);
      c.fillStyle = "#6d5640";
      c.fillRect(sx - 70, y - 150, 5, 150);
      c.fillRect(sx + 65, y - 150, 5, 150);
      c.fillStyle = css("--brand");
      c.fillRect(sx - 74, y - 170, 148, 30);
      c.fillStyle = "#fff";
      c.font = "700 18px Oswald, sans-serif";
      c.textAlign = "center";
      c.fillText(text, sx, y - 148);
      c.textAlign = "left";
    }

    drawAid(c, x, y) {
      c.fillStyle = css("--brand");
      c.beginPath();
      c.moveTo(x - 40, y - 50);
      c.lineTo(x, y - 80);
      c.lineTo(x + 40, y - 50);
      c.fill();
      c.fillStyle = "#ddd";
      c.fillRect(x - 36, y - 50, 4, 50);
      c.fillRect(x + 32, y - 50, 4, 50);
      c.fillStyle = "#fff";
      c.fillRect(x - 30, y - 24, 60, 6);
      c.font = "16px sans-serif";
      c.textAlign = "center";
      c.fillText("🍌💧", x, y - 30);
      c.textAlign = "left";
    }

    drawObstacle(c, o, x, base) {
      const { w, h } = o;
      switch (o.type) {
        case "root":
          c.strokeStyle = "#5a3b22";
          c.lineWidth = 6;
          c.beginPath();
          c.moveTo(x, base);
          c.quadraticCurveTo(x + w * 0.3, base - h * 1.6, x + w * 0.6, base - 2);
          c.quadraticCurveTo(x + w * 0.8, base - h, x + w, base);
          c.stroke();
          break;
        case "rock":
          c.fillStyle = "#8a8f96";
          c.beginPath();
          c.moveTo(x, base);
          c.lineTo(x + 6, base - h * 0.7);
          c.lineTo(x + w * 0.5, base - h);
          c.lineTo(x + w - 4, base - h * 0.6);
          c.lineTo(x + w, base);
          c.fill();
          break;
        case "log":
          c.fillStyle = "#7a5230";
          c.fillRect(x, base - h, w, h);
          c.fillStyle = "#c8a070";
          c.beginPath();
          c.ellipse(x + w, base - h / 2, 7, h / 2, 0, 0, Math.PI * 2);
          c.fill();
          break;
        case "boulder":
          c.fillStyle = "#6f747b";
          c.beginPath();
          c.ellipse(x + w / 2, base - h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "#8d939a";
          c.beginPath();
          c.ellipse(x + w / 2 - 6, base - h * 0.62, w / 4, h / 5, 0, 0, Math.PI * 2);
          c.fill();
          break;
        case "stream":
          c.fillStyle = "#4a9fd8";
          c.beginPath();
          c.ellipse(x + w / 2, base, w / 2, 8, 0, 0, Math.PI * 2);
          c.fill();
          break;
      }
    }

    drawPickup(c, it, x, base) {
      const y = base - it.alt - it.h + Math.sin(this.time * 4 + it.x) * 4;
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
  }

  // Профіль висот для HUD
  function drawProfile(canvas, distKm) {
    const { height } = makeProfile(distKm);
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 34;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const c = canvas.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pts = [];
    for (let i = 0; i <= 120; i++) pts.push(height((distKm * i) / 120));
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    c.clearRect(0, 0, w, h);
    c.beginPath();
    c.moveTo(0, h);
    pts.forEach((v, i) => c.lineTo((w * i) / 120, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)));
    c.lineTo(w, h);
    c.closePath();
    c.fillStyle = "rgba(51,51,58,.55)";
    c.fill();
  }

  // ---------- Картинка для сторіс ----------

  async function storyImage(result, name, place) {
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
    sky.addColorStop(0, "#8ec5ea");
    sky.addColorStop(1, "#f3ead6");
    c.fillStyle = sky;
    c.fillRect(0, 0, W, Hh);

    // Пагорби, скелі й ліс
    const ridge = (color, base, amp, freq) => {
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(0, 1500);
      for (let x = 0; x <= W; x += 20) c.lineTo(x, base + Math.sin(x * freq) * amp + Math.sin(x * freq * 2.7 + 1) * amp * 0.4);
      c.lineTo(W, 1500);
      c.fill();
    };
    ridge("#9db8a4", 760, 70, 0.006);
    ridge("#5f8a6c", 900, 60, 0.009);
    c.fillStyle = "#8e9399";
    c.beginPath();
    c.moveTo(600, 1220);
    c.lineTo(690, 900);
    c.lineTo(820, 960);
    c.lineTo(900, 1220);
    c.fill();
    for (let i = 0; i < 9; i++) {
      const x = 40 + i * 125;
      const hgt = 160 + (i % 3) * 50;
      c.fillStyle = "#2e6b45";
      c.beginPath();
      c.moveTo(x, 1230 - hgt);
      c.lineTo(x + 55, 1230);
      c.lineTo(x - 55, 1230);
      c.fill();
    }
    c.fillStyle = "#5b4636";
    c.fillRect(0, 1220, W, 300);
    c.fillStyle = "#3f8a4a";
    c.fillRect(0, 1215, W, 14);
    drawPerson(c, 760, 1225, 4, { shirt: brand, shorts: ink, skin: brand }, null, true);

    c.textAlign = "center";
    c.fillStyle = ink;
    c.font = "700 70px Oswald, sans-serif";
    c.fillText("ПІДГОТОВКА ДО", W / 2, 170);
    c.font = "700 92px Oswald, sans-serif";
    c.fillText("ЖИТОМИРСЬКИХ", W / 2, 270);
    c.fillText("ВЕРТИКАЛЕЙ", W / 2, 370);
    c.font = "600 44px Montserrat, sans-serif";
    c.fillText(`Трейл ${result.dist} км · D+ ${result.dplus} м`, W / 2, 450);

    c.fillStyle = brand;
    c.fillRect(0, Hh - 400, W, 400);
    c.fillStyle = "#fff";
    c.font = "700 64px Oswald, sans-serif";
    c.fillText(name ? name.toUpperCase() : "МІЙ РЕЗУЛЬТАТ", W / 2, Hh - 300);
    c.font = "700 120px Oswald, sans-serif";
    c.fillText(`${result.dist} КМ · ${formatTime(result.time)}`, W / 2, Hh - 175);
    c.font = "600 40px Montserrat, sans-serif";
    const extra = [`темп ${formatTime(result.pace)}/км`];
    if (place) extra.push(`#${place} у таблиці`);
    c.fillText(extra.join(" · "), W / 2, Hh - 110);
    c.font = "600 34px Montserrat, sans-serif";
    c.fillText("@titan.club.rivne · Titan Run", W / 2, Hh - 50);

    return new Promise((resolve) => cv.toBlob(resolve, "image/png"));
  }

  window.TrailRun = { TrailGame, makeProfile, buildTrack, drawProfile, storyImage, PX_PER_KM, TIME_SCALE, DISTANCES: [7, 13, 26] };
})();
