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
    const w = await Profile.loadWallet();
    $("profile-boosts").textContent = w.boosts;
    $("profile-coins").textContent = w.coins;
    $("profile-heads").textContent = w.heads;
    const left = Profile.buysLeft();
    const btn = $("profile-buy-head");
    btn.disabled = !left || w.coins < Profile.HEAD_PRICE;
    btn.textContent = !left
      ? `Ліміт на сьогодні: ${Profile.BUY_LIMIT} розгонів`
      : w.coins < Profile.HEAD_PRICE
        ? `Розгін за ${Profile.HEAD_PRICE} 🪙: ще ${Profile.HEAD_PRICE - w.coins}`
        : `Купити розгін за ${Profile.HEAD_PRICE} 🪙 (сьогодні ще ${left})`;
  }

  $("profile-buy-head").addEventListener("click", async () => {
    try {
      await Profile.buyHead();
      Profile.toast("⚡ Розгін куплено! Він чекає в «Бігу».");
    } catch (err) {
      Profile.toast(err.message === "limit" ? "Ліміт на сьогодні вичерпано" : err.message === "no_coins" ? "Не вистачає монет" : "Не вдалося купити 😕");
    }
    renderBoosts();
  });

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
    const reward = e.submitter && e.submitter.dataset.reward === "coins" ? "coins" : "boost";
    try {
      await Profile.redeem(input.value, reward);
      input.value = "";
      renderBoosts();
      Profile.toast(reward === "coins" ? `🪙 Промокод активовано: +${Profile.PROMO_COINS} монет!` : "⚡ Промокод активовано: +1 буст!");
    } catch (err) {
      Profile.toast("Промокод недійсний або вже використаний 😕");
    }
  });

  // ---------- Тренування ----------
  let trainTimer = null;
  const hm = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  function renderTraining() {
    const w = Profile.wallet();
    const list = $("train-list");
    if (!w) {
      list.innerHTML = '<p class="muted">Завантажую…</p>';
      return;
    }
    $("train-coins").textContent = w.coins;
    const t = Profile.training();
    list.innerHTML = Object.entries(Profile.STATS)
      .map(([id, st]) => {
        const lvl = w[st.key];
        const next = lvl + 1;
        const mine = t && t.stat === id;
        let action;
        if (mine && t.done) action = `<p class="train-timer train-done">✅ Тренування завершено</p><button class="btn btn--primary btn--small" data-train="claim" type="button">Забрати рівень ${t.nextLevel}</button>`;
        else if (mine) {
          const cost = Profile.skipCost(t.left);
          action = `<p class="train-timer">⏳ Лишилось <b data-left="${t.endsAt}">${hm(t.left)}</b></p><button class="btn btn--small" data-train="skip" type="button"${w.coins < cost ? " disabled" : ""}>Прискорити за ${cost} 🪙</button>`;
        } else if (lvl >= Profile.MAX_LEVEL) action = '<p class="train-timer">Максимальний рівень 🏆</p>';
        else if (t) action = '<button class="btn btn--small" type="button" disabled>Іде інше тренування</button>';
        else {
          const cost = Profile.trainCost(next);
          action = `<button class="btn btn--small" data-train="start" data-stat="${id}" type="button"${w.coins < cost ? " disabled" : ""}>Тренувати до рівня ${next} · ${cost} 🪙 · ${Profile.trainHours(next)} год</button>`;
        }
        return `<div class="train-card">
          <div class="train-card__head"><b>${st.icon} ${st.name}</b><span>Рівень ${lvl}/${Profile.MAX_LEVEL} · +${lvl}%</span></div>
          <div class="train-bar"><i style="width:${lvl * 10}%"></i></div>
          <small>${st.hint}</small>
          ${action}
        </div>`;
      })
      .join("");
  }

  async function refreshTraining() {
    if (!Leaderboard.enabled) {
      $("train-list").innerHTML = '<p class="muted">Прокачка поки недоступна.</p>';
      return;
    }
    await Profile.loadWallet();
    renderTraining();
  }

  // Раз на секунду оновлюємо таймер; коли час вийшов — перемальовуємо кнопки
  function startTrainingTicker() {
    stopTrainingTicker();
    refreshTraining();
    trainTimer = setInterval(() => {
      const el = document.querySelector("#train-list [data-left]");
      if (!el) return;
      const left = Number(el.dataset.left) - Date.now();
      if (left <= 0) renderTraining();
      else el.textContent = hm(left);
    }, 1000);
  }

  function stopTrainingTicker() {
    clearInterval(trainTimer);
    trainTimer = null;
  }

  $("train-list").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-train]");
    if (!btn) return;
    btn.disabled = true;
    const what = btn.dataset.train;
    try {
      if (what === "start") {
        await Profile.startTraining(btn.dataset.stat);
        Profile.toast("🏋️ Тренування розпочато!");
      } else if (what === "claim") {
        const w = await Profile.claimTraining();
        Profile.toast(`🎉 Новий рівень! Разом ★${w.lvlSpd + w.lvlEnd}`);
      } else if (what === "skip") {
        await Profile.speedUpTraining();
        await Profile.claimTraining();
        Profile.toast("⚡ Тренування прискорено й завершено!");
      }
    } catch (err) {
      Profile.toast(err.message === "no_coins" ? "Не вистачає монет" : "Не вдалося 😕 Спробуй ще раз");
      await Profile.loadWallet();
    }
    renderTraining();
  });

  // Розділи профілю: Вигляд / Ачівки й задачі / Буст-кросівки — щоб не гортати донизу
  function showPane(name) {
    document.querySelectorAll("#profile-tabs .ptabs__btn").forEach((b) => b.classList.toggle("is-active", b.dataset.pane === name));
    ["look", "goals", "boost", "train"].forEach((p) => ($("pane-" + p).hidden = p !== name));
    if (name === "train") startTrainingTicker();
    else stopTrainingTicker();
  }

  $("profile-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pane]");
    if (btn) showPane(btn.dataset.pane);
  });

  document.querySelectorAll(".tabs__btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === "profile") render();
      else stopTrainingTicker();
    })
  );

  window.ProfileUI = { render, showPane };
})();
