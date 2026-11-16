// Нижня навігація, верхня панель і віджет «Сьогодні» на головній.
// Режим дня крутиться за днем тижня (Біг: Пн/Ср/Пт, Трейл: Вт/Чт, Неділя: Сб/Нд); якщо гравець 7+ днів не грав у якийсь
// режим, що вже пробував, показуємо його. Усі дані — вже наявні в грі (профіль, гаманець, траса тижня).
(function () {
  const $ = (id) => document.getElementById(id);
  const MODES = ["game", "sunday", "trail", "draw"];
  const ROTATION = { 1: "game", 2: "trail", 3: "game", 4: "trail", 5: "game", 6: "sunday", 0: "sunday" };
  const DAYS = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота"];
  const NAMES = { game: "Біг", trail: "Трейл", sunday: "Неділя" };
  const TITLES = { leaders: "Рейтинг", club: "Клуб", photo: "Фото з пробіжки", profile: "Профіль" };
  const NAV_OF = { home: "play", game: "play", sunday: "play", trail: "play", draw: "play", leaders: "leaders", club: "club", photo: "photo", profile: "profile" };
  const WEEK_MS = 7 * 864e5;

  const plural = (n, one, few, many) => {
    const m10 = n % 10;
    const m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  };

  function weekday() {
    const w = Kyiv.wall(new Date());
    return new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay();
  }

  // Який режим показати: «давно не грав» має пріоритет над розкладом за днем тижня
  function pickMode(stats) {
    const last = stats.lastPlayed || {};
    const now = Date.now();
    let stale = null;
    ["game", "trail", "sunday"].forEach((m) => {
      if (last[m] && now - last[m] >= WEEK_MS && (!stale || last[m] < last[stale])) stale = m;
    });
    return { mode: stale || ROTATION[weekday()], stale: !!stale };
  }

  function modeCard(mode, stats, stale) {
    if (mode === "game") {
      const best = stats.gameBest || 0;
      return { icon: "🏃", title: "Біг: побий свій рекорд", sub: best > 0 ? `Рекорд ${best.toFixed(2)} км. Спробуй пробігти більше` : "Спробуй свій перший забіг", cta: "Бігти" };
    }
    if (mode === "trail") {
      const t = stats.trail && stats.trail[7];
      return { icon: "🏔️", title: "Трейл 7 км сьогодні", sub: t ? `Твій найкращий час на 7 км: ${SundayRun.formatTime(t)}` : "Спробуй свій перший трейл", cta: "Старт" };
    }
    const wk = SundayRun.weekInfo(0);
    return { icon: "☕", title: "Неділя з клубом", sub: `Траса тижня: ${wk.theme.name}`, cta: "Бігти" };
  }

  // Серія днів: рахуємо лише якщо востаннє грали сьогодні чи вчора
  function streakNow(stats) {
    const today = Kyiv.today();
    const yesterday = Kyiv.iso(new Date(Date.now() - 864e5));
    return stats.lastDay === today || stats.lastDay === yesterday ? stats.streak || 0 : 0;
  }

  function leftText(ms) {
    const min = Math.ceil(ms / 60000);
    if (min >= 60) return `${Math.floor(min / 60)} год${min % 60 ? " " + (min % 60) + " хв" : ""}`;
    return `${Math.max(1, min)} хв`;
  }

  function trainingTile() {
    const t = window.Profile && Profile.wallet() ? Profile.training() : null;
    const w = Profile.wallet();
    if (!w) return `<button class="today__tile today__tile--wide" data-today="train" type="button"><span class="today__lbl">🏋️ Тренування</span><span class="today__txt">Прокачуй бігуна</span></button>`;
    if (!t) return `<button class="today__tile today__tile--wide" data-today="train" type="button"><span class="today__lbl">🏋️ Тренування</span><span class="today__txt">Не йде. Почни, кожен рівень +1%</span></button>`;
    const st = Profile.STATS[t.stat];
    if (t.done) return `<button class="today__tile today__tile--wide is-ready" data-today="train" type="button"><span class="today__lbl">🏋️ ${st.name}</span><span class="today__txt">Готово! Забери рівень ${t.nextLevel}</span></button>`;
    const len = Profile.trainHours(t.nextLevel) * 3600000;
    const pct = Math.max(4, Math.min(100, Math.round(((len - t.left) / len) * 100)));
    return `<button class="today__tile today__tile--wide" data-today="train" type="button"><span class="today__lbl">🏋️ ${st.name}</span><span class="today__txt">завершиться за ${leftText(t.left)}</span><span class="today__bar"><i style="width:${pct}%"></i></span></button>`;
  }

  function render() {
    const box = $("today");
    if (!box || !window.Profile || !window.SundayRun) return;
    const stats = Profile.state.stats;
    const { mode, stale } = pickMode(stats);
    const card = modeCard(mode, stats, stale);
    const day = DAYS[weekday()];
    $("today-day").textContent = `${day} · ${NAMES[mode]}`;
    const streak = streakNow(stats);
    const dots = Array.from({ length: 7 }, (_, i) => `<i class="${i < Math.min(streak, 7) ? "on" : ""}"></i>`).join("");
    const streakText = streak ? `${streak} ${plural(streak, "день", "дні", "днів")}` : "Грай щодня";
    box.innerHTML = `
      <div class="today__main"><div class="today__ic">${card.icon}</div><div><div class="today__title">${card.title}</div><div class="today__sub">${stale ? "Давно не грав: повертайся 💪 " : ""}${card.sub}</div></div></div>
      <button class="btn btn--primary" data-go="${mode}" type="button">${card.cta}</button>
      <div class="today__row">
        <div class="today__tile"><span class="today__lbl">🔥 Серія</span><span class="today__val">${streakText}</span><span class="today__dots">${dots}</span></div>
        ${trainingTile()}
      </div>`;
    renderCoins();
  }

  function renderCoins() {
    const w = window.Profile && window.Leaderboard && Leaderboard.enabled ? Profile.wallet() : null;
    ["home-coins", "topbar-coins"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.hidden = !w;
      if (w) el.querySelector("b").textContent = w.coins;
    });
  }

  // Гаманець підтягуємо при показі головної (не частіше за раз на 30 с)
  let lastWallet = 0;
  function refreshWallet() {
    if (!window.Leaderboard || !Leaderboard.enabled || Date.now() - lastWallet < 30000) return;
    lastWallet = Date.now();
    Profile.loadWallet().then(render, () => {});
  }

  function syncNav(name) {
    const nav = NAV_OF[name] || "play";
    document.querySelectorAll(".bnav__btn").forEach((b) => b.classList.toggle("is-active", b.dataset.nav === nav));
    $("topbar-title").textContent = TITLES[name] || "";
  }

  let updatePlaying = () => {};
  document.addEventListener("titan:tab", (e) => {
    const name = e.detail;
    syncNav(name);
    updatePlaying();
    renderCoins();
    if (name === "home") {
      render();
      refreshWallet();
    }
  });

  $("bnav").addEventListener("click", (e) => {
    const b = e.target.closest("[data-nav]");
    if (!b) return;
    if (b.dataset.nav === "play") $("home-link").click();
    else document.querySelector(`.tabs__btn[data-tab="${b.dataset.nav}"]`).click();
  });

  // Плитки віджета: тренування → профіль, розділ «Тренування»; монети → «Гаманець»
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-today='train']")) {
      document.querySelector('.tabs__btn[data-tab="profile"]').click();
      if (window.ProfileUI) ProfileUI.showPane("train");
    } else if (e.target.closest("#home-coins, #topbar-coins")) {
      document.querySelector('.tabs__btn[data-tab="profile"]').click();
      if (window.ProfileUI) ProfileUI.showPane("boost");
    }
  });

  // Під час забігу нижню навігацію ховаємо (більше місця для гри)
  const huds = ["hud", "sun-hud", "trail-hud"].map($).filter(Boolean);
  // Навігація схована лише коли гравець на екрані гри й забіг іде (на головній і в інших розділах вона завжди є)
  updatePlaying = () => document.body.classList.toggle("playing", document.body.classList.contains("in-mode") && huds.some((h) => !h.hidden));
  if (window.MutationObserver) {
    const mo = new MutationObserver(updatePlaying);
    huds.forEach((h) => mo.observe(h, { attributes: true, attributeFilter: ["hidden"] }));
  }
  updatePlaying();

  render();
  refreshWallet();
  setInterval(() => {
    if (document.body.classList.contains("is-home")) render();
  }, 60000);

  window.Today = { render, pickMode, weekday };
})();
