// Аватар бігуна: малювання «паличками» з одягом і аксесуарами, спільне для всіх режимів і фото.
(function () {
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // Варіанти гардероба. unlock — id досягнення (js/profile.js), без нього річ доступна одразу.
  const OPTIONS = {
    shirt: [
      { id: "titan", label: "Titan", color: "#f85a0a" },
      { id: "ink", label: "Графіт", color: "#33333a" },
      { id: "white", label: "Біла", color: "#f4f4f5" },
      { id: "black", label: "Titan Black", color: "#111114", unlock: "game10" },
      { id: "kts", label: "Бірюзова КТС", color: "#3cc9b4", unlock: "sunday5" },
      { id: "gold", label: "Золота фінішерська", color: "#e0b02a", unlock: "game42" },
      { id: "bronze", label: "Бронза 100 км", color: "#b0713b", unlock: "year100" },
      { id: "silver", label: "Срібло 500 км", color: "#b9bec6", unlock: "year500" },
      { id: "diamond", label: "Діамант 1000 км", color: "#4fd1ff", unlock: "year1000" },
    ],
    shorts: [
      { id: "ink", label: "Графіт", color: "#33333a" },
      { id: "navy", label: "Синій", color: "#1f3b73" },
      { id: "green", label: "Зелений", color: "#2d5a3d" },
      { id: "purple", label: "Фіолетовий", color: "#5b2a6e" },
    ],
    skin: [
      { id: "titan", label: "Titan", color: "#f85a0a" },
      { id: "light", label: "Світла", color: "#ffdbac" },
      { id: "medium", label: "Середня", color: "#f1c27d" },
      { id: "tan", label: "Засмагла", color: "#e0ac69" },
      { id: "dark", label: "Темна", color: "#c68642" },
    ],
    shoes: [
      { id: "white", label: "Білі", color: "#f4f4f5" },
      { id: "ink", label: "Чорні", color: "#222226" },
      { id: "titan", label: "Titan", color: "#f85a0a" },
      { id: "neon", label: "Неонові", color: "#39ff14", unlock: "top3week" },
      { id: "trail", label: "Гірські", color: "#6b8e23", unlock: "trail26" },
    ],
    hat: [
      { id: "none", label: "Без", icon: "—" },
      { id: "headband", label: "Пов'язка", icon: "〰️" },
      { id: "cap", label: "Кепка Titan", icon: "🧢", unlock: "streak3" },
      { id: "buff", label: "Бафф трейлраннера", icon: "🧣", unlock: "trailAny" },
      { id: "wreath", label: "Лавровий вінок", icon: "🌿", unlock: "top1" },
    ],
    glasses: [
      { id: "none", label: "Без", icon: "—" },
      { id: "sun", label: "Сонцезахисні", icon: "🕶️", unlock: "streak7" },
    ],
  };

  const DEFAULT_LOOK = { shirt: "titan", shorts: "ink", skin: "titan", shoes: "white", hat: "none", glasses: "none" };
  const GOLD = "#ffc21a";

  const option = (part, id) => OPTIONS[part].find((o) => o.id === id) || OPTIONS[part][0];

  // Перетворює вибір гардероба на кольори для малювання; boosted — золоті «супер-кросівки»
  function resolve(look, boosted) {
    const l = Object.assign({}, DEFAULT_LOOK, look);
    return {
      shirt: option("shirt", l.shirt).color,
      shorts: option("shorts", l.shorts).color,
      skin: option("skin", l.skin).color,
      shoes: boosted ? GOLD : option("shoes", l.shoes).color,
      hat: l.hat,
      glasses: l.glasses,
      boosted: !!boosted,
    };
  }

  function line(c, x1, y1, x2, y2) {
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }

  // Двосегментна кінцівка; повертає точку кінця (стопу чи кисть)
  function limb(c, x, y, swing, l1, l2) {
    const a1 = Math.PI / 2 + swing * 0.8;
    const kx = x + Math.cos(a1) * l1;
    const ky = y + Math.sin(a1) * l1;
    const a2 = a1 + (swing > 0 ? 0.2 : 0.9);
    const ex = kx + Math.cos(a2) * l2;
    const ey = ky + Math.sin(a2) * l2;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(kx, ky);
    c.lineTo(ex, ey);
    c.stroke();
    return [ex, ey];
  }

  function shoe(c, [fx, fy], s, color, boosted) {
    if (!color) return;
    if (boosted) {
      c.fillStyle = "rgba(255,194,26,.45)";
      c.beginPath();
      c.ellipse(fx + 2 * s, fy, 9 * s, 5 * s, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(fx + 2 * s, fy, 6 * s, 3 * s, 0, 0, Math.PI * 2);
    c.fill();
  }

  function headwear(c, hx, hy, s, look) {
    const r = 9 * s;
    switch (look.hat) {
      case "headband":
        c.fillStyle = css("--accent") || GOLD;
        c.fillRect(hx - r, hy - r * 0.55, r * 2, r * 0.45);
        break;
      case "cap":
        c.fillStyle = "#33333a";
        c.beginPath();
        c.arc(hx, hy - r * 0.15, r * 1.02, Math.PI, 0);
        c.fill();
        c.fillRect(hx, hy - r * 0.3, r * 1.6, r * 0.32);
        c.fillStyle = css("--brand") || "#f85a0a";
        c.fillRect(hx - r * 0.3, hy - r * 0.85, r * 0.6, r * 0.35);
        break;
      case "buff":
        c.fillStyle = "#3cc9b4";
        c.fillRect(hx - r, hy - r * 0.75, r * 2, r * 0.55);
        c.fillRect(hx - r * 0.8, hy + r * 0.55, r * 1.6, r * 0.6);
        break;
      case "wreath":
        c.fillStyle = "#3f9a4a";
        for (let i = 0; i < 7; i++) {
          const a = Math.PI + (i / 6) * Math.PI;
          c.beginPath();
          c.ellipse(hx + Math.cos(a) * r * 0.95, hy + Math.sin(a) * r * 0.95, r * 0.32, r * 0.18, a + Math.PI / 2, 0, Math.PI * 2);
          c.fill();
        }
        break;
    }
    if (look.glasses === "sun") {
      c.fillStyle = "#111";
      c.fillRect(hx + r * 0.05, hy - r * 0.2, r * 0.95, r * 0.38);
    }
  }

  /**
   * Бігун. look — колірний вигляд (resolve() або {shirt, shorts, skin, ...});
   * swing — фаза бігу (null — стоїть), wave — махає рукою (для фото).
   */
  function drawPerson(c, x, y, s, look, swing, wave) {
    const shirt = look.shirt || css("--brand");
    const hip = y - 28 * s;
    const shoulder = y - 50 * s;
    c.lineCap = "round";
    c.lineWidth = 7 * s;
    c.strokeStyle = look.shorts;
    let feet;
    if (swing === null) {
      line(c, x - 2 * s, hip, x - 6 * s, y);
      line(c, x + 2 * s, hip, x + 6 * s, y);
      feet = [[x - 7 * s, y], [x + 5 * s, y]];
    } else {
      feet = [limb(c, x, hip, -swing, 14 * s, 15 * s), limb(c, x, hip, swing, 14 * s, 15 * s)];
    }
    feet.forEach((f) => shoe(c, f, s, look.shoes, look.boosted));
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
    const hx = x + (swing === null ? 0 : 5 * s);
    const hy = shoulder - 11 * s;
    c.fillStyle = look.skin;
    c.beginPath();
    c.arc(hx, hy, 9 * s, 0, Math.PI * 2);
    c.fill();
    headwear(c, hx, hy, s, look);
  }

  window.Avatar = { OPTIONS, DEFAULT_LOOK, option, resolve, drawPerson, limb, line };
})();
