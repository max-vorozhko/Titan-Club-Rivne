// Київський час і дата українською БЕЗ залежності від Intl і бази часових поясів браузера.
// Старі вбудовані браузери Android (WebView до 2022 року) не знають назви «Europe/Kyiv», через що падали цілі скрипти
// (вкладка «Малюнок» була порожня). Україна: UTC+2 взимку, UTC+3 влітку; перехід в останню неділю березня й жовтня о 01:00 UTC.
(function () {
  const HOUR = 3600000;
  const MONTHS_GEN = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
  const pad = (n) => (n < 10 ? "0" : "") + n;

  // Остання неділя місяця (0 — січень) о 01:00 UTC, мс
  function lastSunday(year, month) {
    const d = new Date(Date.UTC(year, month + 1, 0, 1, 0, 0));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.getTime();
  }

  // Різниця Києва з UTC у годинах у момент ms
  function offsetHours(ms) {
    const y = new Date(ms).getUTCFullYear();
    return ms >= lastSunday(y, 2) && ms < lastSunday(y, 9) ? 3 : 2;
  }

  // Київський «настінний» час: { y, m (1–12), d, h, min, s, wd (0 — неділя) }
  function wall(date) {
    const ms = (date || new Date()).getTime();
    const k = new Date(ms + offsetHours(ms) * HOUR);
    return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(), h: k.getUTCHours(), min: k.getUTCMinutes(), s: k.getUTCSeconds(), wd: k.getUTCDay() };
  }

  const iso = (date) => {
    const w = wall(date);
    return `${w.y}-${pad(w.m)}-${pad(w.d)}`;
  };

  // Київська північ цієї доби, мс від початку епохи
  function startOfDayMs(date) {
    const w = wall(date);
    const utcMidnight = Date.UTC(w.y, w.m - 1, w.d);
    for (const o of [2, 3]) {
      const ms = utcMidnight - o * HOUR;
      if (offsetHours(ms) === o) return ms;
    }
    return utcMidnight - 2 * HOUR;
  }

  const dayMonthOfISO = (s) => {
    const [, m, d] = s.split("-").map(Number);
    return `${d} ${MONTHS_GEN[m - 1]}`;
  };

  window.Kyiv = {
    wall,
    iso,
    today: () => iso(new Date()),
    startOfDayMs,
    dayMonth: (date) => dayMonthOfISO(iso(date)),
    dayMonthOfISO,
  };
})();
