// Вкладка «Профіль»: аватар і статистика, а нижче розділи: гардероб, досягнення, супер-кросівки й промокоди.
(function () {
  const $ = (id) => document.getElementById(id);
  const { formatTime } = window.SundayRun;
  const cfg = window.TITAN_CONFIG || {};

  const PARTS = [
    ["shirt", "Футболка"],
    ["shorts", "Шорти"],
    ["skin", "Колір бігуна"],
    ["shoes", "Кросівки"],
    ["hat", "На голові"],
    ["glasses", "Окуляри"],
  ];

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function drawAvatar() {
    const canvas = $("profile-avatar");
    const c = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = 180;
    const h = 220;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#e8e8eb";
    c.beginPath();
    c.ellipse(w / 2, h - 18, 56, 10, 0, 0, Math.PI * 2);
    c.fill();
    Avatar.drawPerson(c, w / 2, h - 20, 2.6, Profile.look(false), null, true);
  }

  function requirement(unlockId) {
    const a = Profile.ACHIEVEMENTS.find((x) => x.id === unlockId);
    return a ? `${a.title}: ${a.desc.toLowerCase()}` : "";
  }

  function renderWardrobe() {
    const look = Profile.state.look;
    $("profile-wardrobe").innerHTML = PARTS.map(([part, title]) => {
      const items = Avatar.OPTIONS[part]
        .map((o) => {
          const open = Profile.isAvailable(part, o.id);
          const sel = look[part] === o.id;
          const swatch = o.color ? `<span class="swatch__dot" style="background:${o.color}"></span>` : `<span class="swatch__icon">${o.icon}</span>`;
          return `<button class="swatch${sel ? " is-selected" : ""}${open ? "" : " is-locked"}" type="button"
              data-part="${part}" data-id="${o.id}" title="${escapeHtml(open ? o.label : "🔒 " + requirement(o.unlock))}">
              ${swatch}<span class="swatch__label">${open ? "" : "🔒 "}${escapeHtml(o.label)}</span></button>`;
        })
        .join("");
      return `<div class="wardrobe__row"><div class="wardrobe__title">${title}</div><div class="wardrobe__items">${items}</div></div>`;
    }).join("");
  }

  function renderStats() {
    const s = Profile.state.stats;
    const best = (obj, d) => (obj[d] ? formatTime(obj[d]) : "—");
    const tiles = [
      ["Забігів", s.runs],
      ["Км у грі", s.totalKm.toFixed(1)],
      ["Днів поспіль", s.streak],
      ["Рекорд серії", s.bestStreak],
      ["Біг: рекорд", s.gameBest ? s.gameBest.toFixed(2) + " км" : "—"],
      ["Неділя 5 км", best(s.sunday, 5)],
      ["Неділя 10 км", best(s.sunday, 10)],
      ["Трейл 7 км", best(s.trail, 7)],
      ["Трейл 13 км", best(s.trail, 13)],
      ["Трейл 26 км", best(s.trail, 26)],
    ];
    $("profile-stats").innerHTML = tiles
      .map(([label, value]) => `<div class="stat"><span class="stat__val">${value}</span><span class="stat__lbl">${label}</span></div>`)
      .join("");
  }

  function renderAchievements() {
    const got = Profile.state.unlocked;
    $("profile-achievements").innerHTML = Profile.ACHIEVEMENTS.map((a) => {
      const done = got.includes(a.id);
      return `<li class="achievement${done ? " is-done" : ""}">
          <span class="achievement__mark">${done ? "✓" : "🔒"}</span>
          <span><b>${escapeHtml(a.title)}</b><small>${escapeHtml(a.desc)}</small></span>
          <span class="achievement__item">🎁 ${escapeHtml(Profile.itemName(a))}</span>
        </li>`;
    }).join("");
  }

  async function renderBoosts() {
    const n = await Profile.refreshBoosts();
    $("profile-boosts").textContent = n;
  }

  function renderDonate() {
    const link = $("profile-donate");
    link.hidden = !cfg.donateUrl;
    if (cfg.donateUrl) link.href = cfg.donateUrl;
    link.textContent = `Задонатити ${cfg.boostPrice || 30} грн на банку`;
    const contact = cfg.promoContact ? ` і напиши ${cfg.promoContact}` : "";
    $("profile-donate-hint").textContent = cfg.donateUrl
      ? `У коментарі до донату вкажи своє ім'я з гри${contact} — отримаєш одноразовий промокод.`
      : "Донат за супер-кросівки скоро з'явиться. Якщо маєш промокод — активуй його нижче.";
  }

  function render() {
    const name = Leaderboard.getName();
    $("profile-name").textContent = name || "Мій профіль";
    drawAvatar();
    renderWardrobe();
    renderStats();
    renderAchievements();
    renderDonate();
    if (Leaderboard.enabled) renderBoosts();
  }

  $("profile-wardrobe").addEventListener("click", (e) => {
    const btn = e.target.closest(".swatch");
    if (!btn) return;
    const { part, id } = btn.dataset;
    if (!Profile.setLook(part, id)) {
      Profile.toast(`🔒 ${requirement(Avatar.option(part, id).unlock)}`);
      return;
    }
    drawAvatar();
    renderWardrobe();
  });

  $("profile-rename").addEventListener("click", () => {
    const name = prompt("Ім'я для рейтингів:", Leaderboard.getName());
    if (name && name.trim().length >= 2) {
      Leaderboard.setName(name);
      render();
    }
  });

  $("profile-code-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("profile-code");
    if (!Leaderboard.enabled) return Profile.toast("Активація промокодів поки недоступна");
    try {
      const n = await Profile.redeem(input.value);
      input.value = "";
      $("profile-boosts").textContent = n;
      Profile.toast("⚡ Промокод активовано: +1 супер-кросівки!");
    } catch (err) {
      Profile.toast("Промокод недійсний або вже використаний 😕");
    }
  });

  // Розділи профілю: Вигляд / Ачівки й задачі / Буст-кросівки — щоб не гортати донизу
  function showPane(name) {
    document.querySelectorAll("#profile-tabs .ptabs__btn").forEach((b) => b.classList.toggle("is-active", b.dataset.pane === name));
    ["look", "goals", "boost"].forEach((p) => ($("pane-" + p).hidden = p !== name));
  }

  $("profile-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pane]");
    if (btn) showPane(btn.dataset.pane);
  });

  document.querySelectorAll(".tabs__btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === "profile") render();
    })
  );

  window.ProfileUI = { render, showPane };
})();
