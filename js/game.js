// Titan Run: раннер, у якому учасник клубу біжить вулицями Рівного.
(function () {
  const H = 400;            // логічна висота сцени; ширина залежить від екрана
  const MIN_W = 480;        // мінімальна видима ширина, щоб устигати реагувати
  const GROUND = H - 70;    // лінія доріжки
  const PX_PER_KM = 4000;
  const GRAVITY = 2300;
  const JUMP = -760;
  const DOUBLE_JUMP = -640;
  const START_SPEED = 340;
  const MAX_SPEED = 780;

  const MILESTONES = [
    { km: 1, label: "Перший кілометр!" },
    { km: 5, label: "5K — паркран!" },
    { km: 10, label: "10K — красень!" },
    { km: 21.1, label: "Півмарафон!" },
    { km: 42.2, label: "МАРАФОН! Титан!" },
  ];

  const OBSTACLES = {
    cone:    { w: 26, h: 40, minKm: 0 },
    puddle:  { w: 74, h: 8,  minKm: 0 },
    bench:   { w: 70, h: 44, minKm: 0.5 },
    dog:     { w: 48, h: 32, minKm: 1.5, extraSpeed: 110 },
    barrier: { w: 26, h: 86, minKm: 4 },
  };

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  class Game {
    constructor(canvas, ui) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.ui = ui;
      this.W = 800;
      this.running = false;
      this.colors = { brand: css("--brand"), ink: css("--ink"), accent: css("--accent") };
      this.reset();
      this.resize();
      window.addEventListener("resize", () => this.resize());
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      // На вертикальному екрані зберігаємо мінімальну ширину огляду,
      // а сцену притискаємо до низу; зверху лишається небо.
      this.scale = Math.min(rect.height / H, rect.width / MIN_W);
      this.W = rect.width / this.scale;
      this.top = rect.height / this.scale - H;
      this.canvas.width = Math.round(rect.width * dpr);
      this.canvas.height = Math.round(rect.height * dpr);
      const k = dpr * this.scale;
      this.ctx.setTransform(k, 0, 0, k, 0, this.top * k);
      if (!this.running) this.draw(0);
    }

    reset() {
      this.player = { x: 70, y: GROUND, vy: 0, w: 30, h: 62, jumps: 0, phase: 0 };
      this.speed = START_SPEED;
      this.dist = 0;
      this.energy = 100;
      this.coins = 0;
      this.boost = 0;
      this.items = [];
      this.particles = [];
      this.nextObstacle = 1.2;
      this.nextPickup = 2.5;
      this.milestone = 0;
      this.time = 0;
    }

    start() {
      this.reset();
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
        this.burst(p.x, p.y, "#ffffff", 8);
      }
    }

    get km() {
      return this.dist / PX_PER_KM;
    }

    loop(now) {
      if (!this.running) return;
      const dt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      this.update(dt);
      this.draw(dt);
      requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
      this.time += dt;
      const p = this.player;
      const boosted = this.boost > 0;
      this.speed = Math.min(MAX_SPEED, START_SPEED + this.km * 22);
      const v = this.speed * (boosted ? 1.35 : 1);
      this.dist += v * dt;
      this.boost = Math.max(0, this.boost - dt);
      this.energy -= dt * (2.6 + this.km * 0.08);

      // Гравітація
      p.vy += GRAVITY * dt;
      p.y += p.vy * dt;
      if (p.y >= GROUND) {
        p.y = GROUND;
        p.vy = 0;
        p.jumps = 0;
      }
      p.phase += dt * v / 38;

      this.spawn(dt);

      for (const it of this.items) {
        it.x -= (v + (it.extraSpeed || 0)) * dt;
        if (it.kind === "pickup") it.bob += dt * 4;
      }
      this.items = this.items.filter((it) => it.x + it.w > -20 && !it.taken);

      this.collide();

      for (const pt of this.particles) {
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += 900 * dt;
        pt.life -= dt;
      }
      this.particles = this.particles.filter((pt) => pt.life > 0);

      const m = MILESTONES[this.milestone];
      if (m && this.km >= m.km) {
        this.ui.toast(m.label);
        this.milestone++;
        this.burst(p.x, p.y - 40, this.colors.accent, 24);
      }

      this.ui.hud(this.km, this.energy, this.coins);
      if (this.energy <= 0) this.over("Енергія закінчилась 🥵");
    }

    spawn(dt) {
      this.nextObstacle -= dt;
      this.nextPickup -= dt;

      if (this.nextObstacle <= 0) {
        const kinds = Object.keys(OBSTACLES).filter((k) => this.km >= OBSTACLES[k].minKm);
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        const o = OBSTACLES[kind];
        this.items.push({ kind: "obstacle", type: kind, x: this.W + 20, y: GROUND - o.h, w: o.w, h: o.h, extraSpeed: o.extraSpeed || 0 });
        // Що швидше біжимо, то частіше перешкоди, але завжди лишаємо час на реакцію
        const gap = Math.max(0.75, 1.9 - this.km * 0.03);
        this.nextObstacle = gap + Math.random() * 0.9;
      }

      if (this.nextPickup <= 0) {
        const r = Math.random();
        const type = r < 0.45 ? "water" : r < 0.6 ? "gel" : "coin";
        const y = GROUND - 50 - Math.random() * 120;
        const count = type === "coin" ? 4 : 1;
        for (let i = 0; i < count; i++) {
          this.items.push({ kind: "pickup", type, x: this.W + 20 + i * 36, y, w: 24, h: 24, bob: i });
        }
        this.nextPickup = 1.6 + Math.random() * 2;
      }
    }

    collide() {
      const p = this.player;
      const box = { x: p.x - p.w / 2 + 4, y: p.y - p.h + 6, w: p.w - 8, h: p.h - 6 };
      for (const it of this.items) {
        const iy = it.kind === "pickup" ? it.y + Math.sin(it.bob) * 6 : it.y;
        const hit = box.x < it.x + it.w && box.x + box.w > it.x && box.y < iy + it.h && box.y + box.h > iy;
        if (!hit) continue;

        if (it.kind === "pickup") {
          it.taken = true;
          if (it.type === "water") {
            this.energy = Math.min(100, this.energy + 30);
            this.burst(it.x, iy, "#4fc3f7", 10);
          } else if (it.type === "gel") {
            this.boost = 4;
            this.energy = Math.min(100, this.energy + 10);
            this.ui.toast("⚡ Енергогель!");
            this.burst(it.x, iy, this.colors.accent, 14);
          } else {
            this.coins++;
            this.burst(it.x, iy, "#ffd54f", 6);
          }
        } else if (this.boost > 0) {
          it.taken = true;
          this.burst(it.x + it.w / 2, it.y, "#ffffff", 12);
        } else {
          this.over(this.crashText(it.type));
          return;
        }
      }
    }

    crashText(type) {
      return {
        cone: "Конус переміг 🚧",
        puddle: "Мокрі кросівки 💦",
        bench: "Лавка не здалась 🪑",
        dog: "Собака теж бігун 🐕",
        barrier: "Шлагбаум закрито 🚫",
      }[type];
    }

    over(reason) {
      this.running = false;
      this.burst(this.player.x, this.player.y - 30, this.colors.brand, 30);
      this.draw(0);
      const reached = MILESTONES.slice(0, this.milestone).pop();
      this.ui.over({ km: this.km, coins: this.coins, reason, mark: reached ? reached.label.replace(/[!—].*$/, "").trim() : "—" });
    }

    burst(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        this.particles.push({
          x, y, color,
          vx: (Math.random() - 0.5) * 360,
          vy: -Math.random() * 380,
          life: 0.4 + Math.random() * 0.4,
        });
      }
    }

    // ---------- Малювання ----------

    draw() {
      const c = this.ctx;
      const W = this.W;
      this.drawSky(c, W);
      this.drawLayer(c, W, 0.15, GROUND - 40, this.drawBuildings);
      this.drawLayer(c, W, 0.4, GROUND, this.drawTrees);

      // Доріжка
      c.fillStyle = "#2b2b31";
      c.fillRect(0, GROUND, W, H - GROUND);
      c.fillStyle = this.colors.brand;
      c.fillRect(0, GROUND, W, 4);
      c.fillStyle = "rgba(255,255,255,.5)";
      const off = this.dist % 60;
      for (let x = -off; x < W; x += 60) c.fillRect(x, GROUND + 30, 30, 4);

      for (const it of this.items) {
        if (it.kind === "obstacle") this.drawObstacle(c, it);
        else this.drawPickup(c, it);
      }

      this.drawRunner(c);

      for (const pt of this.particles) {
        c.globalAlpha = Math.max(0, pt.life * 2);
        c.fillStyle = pt.color;
        c.fillRect(pt.x - 3, pt.y - 3, 6, 6);
      }
      c.globalAlpha = 1;
    }

    drawSky(c, W) {
      // Небо поступово темніє до заходу сонця на марафонській дистанції
      const t = Math.min(1, this.km / 42.2);
      const g = c.createLinearGradient(0, -this.top, 0, GROUND);
      g.addColorStop(0, mix("#5ec8ff", "#2b1a4a", t));
      g.addColorStop(1, mix("#ffe9c7", "#ff7a3d", t));
      c.fillStyle = g;
      c.fillRect(0, -this.top, W, GROUND + this.top);
      c.fillStyle = mix("#fff6b0", "#ffb347", t);
      c.beginPath();
      c.arc(W * 0.8, 70 + t * 160, 32, 0, Math.PI * 2);
      c.fill();
      // Хмари пливуть повільніше за місто
      c.fillStyle = "rgba(255,255,255,.75)";
      const span = W + 200;
      for (let i = 0; i < 5; i++) {
        const x = span - ((this.dist * 0.05 + i * 260) % span) - 100;
        const y = 40 - this.top * (0.2 + (i % 3) * 0.25);
        c.beginPath();
        c.arc(x, y, 22, 0, Math.PI * 2);
        c.arc(x + 26, y - 10, 28, 0, Math.PI * 2);
        c.arc(x + 54, y, 20, 0, Math.PI * 2);
        c.fill();
      }
    }

    drawLayer(c, W, factor, base, fn) {
      const tile = 400;
      const off = (this.dist * factor) % tile;
      for (let x = -off; x < W + tile; x += tile) fn.call(this, c, x, base);
    }

    drawBuildings(c, x, base) {
      c.fillStyle = "rgba(40,40,60,.35)";
      const blocks = [[0, 90, 60], [65, 140, 50], [120, 70, 80], [205, 120, 45], [255, 160, 40], [300, 80, 95]];
      for (const [bx, h, w] of blocks) c.fillRect(x + bx, base - h, w, h + 40);
      // Шпиль — натяк на Свято-Воскресенський собор
      c.beginPath();
      c.moveTo(x + 275, base - 200);
      c.lineTo(x + 265, base - 160);
      c.lineTo(x + 285, base - 160);
      c.fill();
    }

    drawTrees(c, x, base) {
      for (const tx of [40, 170, 300]) {
        c.fillStyle = "#4a3426";
        c.fillRect(x + tx - 4, base - 40, 8, 40);
        c.fillStyle = "#2f7d4a";
        c.beginPath();
        c.arc(x + tx, base - 54, 26, 0, Math.PI * 2);
        c.fill();
      }
    }

    drawObstacle(c, o) {
      const { x, y, w, h } = o;
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
        case "dog": {
          const leg = Math.sin(this.time * 20) * 4;
          c.fillStyle = "#7a5230";
          c.fillRect(x + 6, y + 8, w - 14, 14);
          c.fillRect(x - 4, y, 16, 14);
          c.fillRect(x + 8 + leg, y + 22, 5, 10);
          c.fillRect(x + w - 14 - leg, y + 22, 5, 10);
          c.fillRect(x + w - 10, y + 4, 10, 4);
          break;
        }
        case "barrier":
          c.fillStyle = "#555";
          c.fillRect(x + w / 2 - 3, y, 6, h);
          for (let i = 0; i < 4; i++) {
            c.fillStyle = i % 2 ? "#fff" : "#e53935";
            c.fillRect(x, y + i * 14, w, 14);
          }
          break;
      }
    }

    drawPickup(c, it) {
      const y = it.y + Math.sin(it.bob) * 6;
      const cx = it.x + it.w / 2;
      const cy = y + it.h / 2;
      if (it.type === "coin") {
        c.fillStyle = "#ffd54f";
        c.beginPath();
        c.arc(cx, cy, 11, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#c79a00";
        c.font = "900 13px Montserrat, sans-serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText("T", cx, cy + 1);
      } else if (it.type === "water") {
        c.fillStyle = "#4fc3f7";
        c.fillRect(cx - 7, cy - 8, 14, 20);
        c.fillStyle = "#0277bd";
        c.fillRect(cx - 4, cy - 13, 8, 5);
      } else {
        c.fillStyle = this.colors.accent;
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

    drawRunner(c) {
      const p = this.player;
      const air = p.y < GROUND;
      const s = air ? 0.6 : Math.sin(p.phase);
      const x = p.x;
      const hip = p.y - 28;
      const shoulder = p.y - 50;

      if (this.boost > 0) {
        c.fillStyle = "rgba(255,212,0,.35)";
        c.beginPath();
        c.ellipse(x, p.y - 32, 30, 40, 0, 0, Math.PI * 2);
        c.fill();
      }

      // Силует у стилі логотипу: помаранчеві торс і голова, графітові кінцівки
      const { brand, ink } = this.colors;
      c.lineCap = "round";
      c.lineWidth = 7;
      // Задні кінцівки (трохи світліші, щоб читалась глибина)
      c.globalAlpha = 0.75;
      c.strokeStyle = ink;
      limb(c, x, hip, -s, 14, 15);
      limb(c, x, shoulder + 4, s, 12, 11);
      c.globalAlpha = 1;
      // Тулуб
      c.strokeStyle = brand;
      c.lineWidth = 13;
      c.beginPath();
      c.moveTo(x, hip);
      c.lineTo(x + 3, shoulder);
      c.stroke();
      // Передні кінцівки
      c.lineWidth = 7;
      c.strokeStyle = ink;
      limb(c, x, hip, s, 14, 15);
      limb(c, x + 2, shoulder + 4, -s, 12, 11);
      // Голова
      c.fillStyle = brand;
      c.beginPath();
      c.arc(x + 5, shoulder - 11, 9, 0, Math.PI * 2);
      c.fill();
    }
  }

  // Двосегментна кінцівка: кут колінного/ліктьового згину залежить від фази бігу
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

  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (shift) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  window.TitanGame = Game;
})();
