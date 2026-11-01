// Статистика відвідувань через GoatCounter: без cookie й банерів згоди.
// Рахуємо перегляди сайту і кілька подій: відкриття вкладок, старти забігів, «Поділитись».
// Працює лише на публічному сайті (github.io), щоб прототипи й локальні тести не псували цифри.
(function () {
  const code = (window.TITAN_CONFIG || {}).goatcounter;
  const live = /(^|\.)github\.io$/.test(location.hostname);
  const enabled = !!code && live;

  function event(path, title) {
    if (!enabled) return;
    const gc = window.goatcounter;
    if (gc && gc.count) gc.count({ path, title: title || path, event: true });
  }

  window.Analytics = { enabled, event };
  if (!enabled) return;

  const s = document.createElement("script");
  s.async = true;
  s.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  s.src = "https://gc.zgo.at/count.js";
  document.head.appendChild(s);

  // Вибрана дистанція на стартовому екрані режиму (5/10 або 7/13/26 км)
  const dist = (pickId) => {
    const b = document.querySelector(`#${pickId} .seg__btn.is-active`);
    return b ? b.dataset.dist : "";
  };

  // Слухаємо кліки делегуванням, щоб не чіпати код режимів
  document.addEventListener("click", (e) => {
    const el = e.target.closest("button, a");
    if (!el) return;

    if (el.classList.contains("tabs__btn")) return event(`tab-${el.dataset.tab}`, `Вкладка: ${el.textContent.trim()}`);
    if (el.id === "home-link") return event("tab-home", "Лого → головна");

    if (el.id === "btn-start" || el.id === "btn-restart") return event("run-game", "Забіг: Біг");
    if (el.id === "sun-go" || el.id === "sun-again") return event(`run-sunday-${dist("sun-dist-pick")}k`, `Забіг: Неділя ${dist("sun-dist-pick")} км`);
    if (el.id === "trail-go" || el.id === "trail-again") return event(`run-trail-${dist("trail-dist-pick")}k`, `Забіг: Трейл ${dist("trail-dist-pick")} км`);

    // «Поділитись»: соцмережі в основному меню (id share-*) і в меню «Неділі»/«Трейлу» (data-net / data-act)
    const target = el.dataset.net || el.dataset.act || (el.id.startsWith("share-") && el.id.slice(6));
    if (target && el.closest(".share-sheet")) {
      const sheet = el.closest(".share-sheet").id;
      const mode = sheet.startsWith("sun") ? "sunday" : sheet.startsWith("trail") ? "trail" : "game";
      const label = { game: "Біг", sunday: "Неділя", trail: "Трейл" }[mode];
      return event(`share-${mode}-${target}`, `Поділились: ${label} → ${target}`);
    }
  });
})();
