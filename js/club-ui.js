// Вкладка «Клуб»: публічна статистика недільних пробіжок з документа club/public (лише вигадані персонажі).
(function () {
  const $ = (id) => document.getElementById(id);
  const MEDALS = ["🥇", "🥈", "🥉"];
  const TOP_N = 10;

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => Number(n).toLocaleString("uk-UA");
  const plural = Club.plural;

  function tile(value, label) {
    return `<div class="stat"><span class="stat__val">${value}</span><span class="stat__lbl">${label}</span></div>`;
  }

  const MONTHS = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
  const monthOf = (iso) => Number(iso.slice(5, 7)) - 1;
  const people = (n) => `${n} ${plural(n, "учасник", "учасники", "учасників")}`;

  // Підписи місяців під колонками тижнів (лише там, де місяць змінюється)
  function monthRow(runs, cls) {
    let prev = -1;
    return `<div class="${cls}">${runs
      .map((r) => {
        const m = monthOf(r.date);
        const label = m !== prev ? MONTHS[m] : "";
        prev = m;
        return `<span>${label}</span>`;
      })
      .join("")}</div>`;
  }

  // Стовпчики: скільки людей було на кожній неділі. Гортається вліво-вправо, відкривається на останніх тижнях.
  function chart(runs, year) {
    const max = Math.max(1, ...runs.map((r) => r.count));
    const avg = runs.reduce((n, r) => n + r.count, 0) / runs.length;
    const bars = runs
      .map((r, i) => {
        const h = Math.max(4, Math.round((r.count / max) * 100));
        const info = `Тиждень ${r.week} · ${Club.formatDate(r.date)}: ${people(r.count)}${r.km !== null ? ` · ${num(r.km)} км` : ""}`;
        return `<button class="club-bar${i === runs.length - 1 ? " is-last" : ""}" type="button" data-info="${escapeHtml(info)}" aria-label="${escapeHtml(info)}"><span style="height:${h}%"></span><i>${r.count}</i></button>`;
      })
      .join("");
    return `
      <h3 class="profile__sub">Учасників на пробіжках · ${year}</h3>
      <div class="club-scroll" data-scroll-end>
        <div class="club-chart" style="--avg:${Math.round((avg / max) * 100)}%">${bars}</div>
        ${monthRow(runs, "club-months club-months--chart")}
      </div>
      <p class="club-chart__info" id="club-chart-info">Гортай вліво, щоб побачити попередні тижні. Торкнись стовпчика — деталі. Пунктир — середнє.</p>`;
  }

  // «Шлях марафону»: скільки учасників уже дійшли до кожної нагороди за рік
  function rewards(athletes, year) {
    const list = window.REWARDS || [];
    if (!list.length) return "";
    const total = athletes.filter((a) => a.active || a.yearCount > 0).length;
    return `
      <h3 class="profile__sub">Нагороди ${year}</h3>
      <p class="muted small-left">Скільки учасників уже отримали кожну нагороду програми «Марафон підтримки».</p>
      <div class="club-path">
        ${list
          .map((r, i) => {
            const got = athletes.filter((a) => a.yearCount >= r.runs).length;
            return `<div class="club-step${i === list.length - 1 ? " is-final" : ""}">
              <span class="club-step__icon">${r.icon}</span>
              <b class="club-step__runs">${r.runs}</b>
              <span class="club-step__name">${escapeHtml(r.name)}</span>
              <span class="club-step__got"><b>${got}</b> з ${total}</span>
            </div>`;
          })
          .join("")}
      </div>`;
  }

  // Теплова карта: рядок — персонаж, клітинка — неділя. Гортається, ім'я персонажа лишається зліва.
  function heatmap(athletes, runs, year) {
    const rows = athletes.filter((a) => a.yearCount > 0).sort((a, b) => b.yearCount - a.yearCount || a.persona.localeCompare(b.persona, "uk"));
    if (!rows.length) return "";
    const sets = runs.map((r) => new Set(r.present));
    return `
      <h3 class="profile__sub">Карта пробіжок · ${year}</h3>
      <p class="muted small-left">Рядок — учасник, клітинка — неділя. <span class="club-legend"><i class="on"></i> був <i></i> не був</span></p>
      <div class="club-scroll club-heat" data-scroll-end style="--cols:${runs.length}">
        <div class="club-heat__row club-heat__head"><span class="club-heat__who"></span>${monthRow(runs, "club-months club-months--heat")}</div>
        ${rows
          .map(
            (a) => `<div class="club-heat__row">
              <span class="club-heat__who" title="${escapeHtml(a.persona)}">${escapeHtml(a.emoji)} ${escapeHtml(a.persona)}</span>
              <span class="club-heat__cells">${runs
                .map((r, i) => {
                  const on = sets[i].has(a.id);
                  return `<button class="club-cell${on ? " on" : ""}" type="button" data-info="${escapeHtml(`${a.emoji} ${a.persona} · тиждень ${r.week}, ${Club.formatDate(r.date)}: ${on ? "був ✓" : "не був"}`)}"></button>`;
                })
                .join("")}</span>
            </div>`
          )
          .join("")}
      </div>
      <p class="club-chart__info" id="club-heat-info">Торкнись клітинки, щоб побачити неділю.</p>`;
  }

  // Повний перелік — згорнутий, хто хоче, той розгорне
  function roster(athletes, held, lastRun) {
    const yearMoves = addMoves(athletes, "yearCount", lastRun);
    const list = athletes
      .filter((a) => a.active || a.yearCount > 0)
      .sort((a, b) => b.yearCount - a.yearCount || a.persona.localeCompare(b.persona, "uk"));
    const next = (n) => {
      const r = window.nextReward ? window.nextReward(n) : null;
      return r ? `${r.icon} ${escapeHtml(r.name)} · ще ${r.runs - n}` : "🏁 усі нагороди";
    };
    return `
      <details class="club-roster">
        <summary>Усі учасники (${list.length})</summary>
        <ol class="leaders club-list">
          ${list
            .map((a, i) =>
              row(i + 1, a, `${held ? Math.round((a.yearCount / held) * 100) : 0}%`, `${a.yearCount} з ${held} · ${next(a.yearCount)}${a.streak > 1 ? ` · 🔥 ${a.streak} поспіль` : ""}`, yearMoves.get(a.id))
            )
            .join("")}
        </ol>
      </details>`;
  }

  // Зміна місця відносно попередньої неділі: місце за кількістю пробіжок до і після останньої неділі
  function addMoves(list, key, lastRun) {
    const here = new Set(lastRun ? lastRun.present : []);
    const now = list.map((a) => a[key]);
    const before = list.map((a) => a[key] - (here.has(a.id) ? 1 : 0));
    const rank = (v, all) => all.filter((x) => x > v).length + 1;
    const moves = new Map();
    list.forEach((a, i) => {
      if (before[i] === 0 && now[i] > 0) moves.set(a.id, { isNew: true, move: 0 });
      else moves.set(a.id, { isNew: false, move: before[i] > 0 ? rank(before[i], before) - rank(now[i], now) : 0 });
    });
    return moves;
  }

  function badge(m) {
    if (!m) return "";
    if (m.isNew) return ' <span class="mv mv--new" title="Новий з минулої неділі">NEW</span>';
    if (m.move > 0) return ` <span class="mv mv--up" title="Піднявся за минулу неділю на ${m.move}">▲${m.move}</span>`;
    if (m.move < 0) return ` <span class="mv mv--down" title="Опустився за минулу неділю на ${-m.move}">▼${-m.move}</span>`;
    return "";
  }

  function row(place, a, right, sub, m) {
    return `
      <li class="leaders__row">
        <span class="leaders__place">${MEDALS[place - 1] || place}</span>
        <span class="leaders__name">${escapeHtml(a.emoji)} ${escapeHtml(a.persona)}${badge(m)}<small class="club-sub">${sub}</small></span>
        <span></span>
        <span class="leaders__km">${right}</span>
      </li>`;
  }

  function render(pub) {
    const s = Club.stats(pub);
    if (!s.held) {
      $("club-body").innerHTML = '<p class="leaders__empty">Скоро тут з\'явиться статистика недільних пробіжок клубу 🏃</p>';
      return;
    }
    // Нагороди, графік і карта — за поточний (останній) рік програми
    const year = s.runs[s.runs.length - 1].year;
    const yearRuns = s.runs.filter((r) => r.year === year);
    const yearSets = yearRuns.map((r) => new Set(r.present));
    s.athletes.forEach((a) => (a.yearCount = yearSets.filter((set) => set.has(a.id)).length));

    const record = s.runs.reduce((m, r) => (r.count > m.count ? r : m), s.runs[0]);
    const active = s.athletes.filter((a) => a.count > 0);
    const loyal = [...active].sort((a, b) => b.count - a.count || b.km - a.km).slice(0, TOP_N);
    const streaks = [...active].filter((a) => a.bestStreak > 1).sort((a, b) => b.bestStreak - a.bestStreak || b.streak - a.streak).slice(0, 5);
    const hasKm = s.clubKm > 0;
    const lastRun = s.runs[s.runs.length - 1];
    const moves = addMoves(s.athletes, "count", lastRun);

    $("club-body").innerHTML = `
      <div class="stats club-tiles">
        ${tile(s.held, plural(s.held, "неділя", "неділі", "неділь"))}
        ${tile(hasKm ? num(s.clubKm) : "—", "км разом")}
        ${tile(num(s.avg), "у середньому")}
        ${tile(record.count, `рекорд · тиждень ${record.week}`)}
      </div>
      ${rewards(s.athletes, year)}
      ${chart(yearRuns, year)}
      <h3 class="profile__sub">Найвірніші</h3>
      <p class="muted small-left">▲▼ — як змінилось місце за минулу неділю, NEW — новенькі.</p>
      <ol class="leaders club-list">
        ${loyal.map((a, i) => row(i + 1, a, `${a.pct}%`, `${a.count} з ${s.held}${a.km ? ` · ${num(Math.round(a.km))} км` : ""}`, moves.get(a.id))).join("")}
      </ol>
      ${
        streaks.length
          ? `<h3 class="profile__sub">Серії без пропусків</h3>
             <ol class="leaders club-list">
               ${streaks.map((a, i) => row(i + 1, a, a.bestStreak, a.streak > 1 ? `🔥 зараз ${a.streak} поспіль` : "найдовша серія")).join("")}
             </ol>`
          : ""
      }
      ${heatmap(s.athletes, yearRuns, year)}
      ${roster(s.athletes, yearRuns.length, yearRuns[yearRuns.length - 1])}
      <p class="muted small-left club-foot">Дані вносять адміни клубу після кожної неділі. Справжні імена замінені на вигаданих персонажів.</p>`;
    // Графік і карту відкриваємо на найсвіжіших тижнях
    requestAnimationFrame(() => document.querySelectorAll("#club-body [data-scroll-end]").forEach((el) => (el.scrollLeft = el.scrollWidth)));
  }

  let loading = false;
  async function load() {
    if (loading) return;
    if (!Leaderboard.enabled) {
      $("club-body").innerHTML = '<p class="leaders__empty">Статистика клубу поки недоступна</p>';
      return;
    }
    loading = true;
    try {
      const { db } = await Leaderboard.connect();
      const snap = await db.collection("club").doc("public").get();
      render(snap.exists ? snap.data() : null);
    } catch (e) {
      $("club-body").innerHTML = '<p class="leaders__empty">Не вдалося завантажити статистику 😕</p>';
    } finally {
      loading = false;
    }
  }

  $("club-body").addEventListener("click", (e) => {
    const el = e.target.closest(".club-bar, .club-cell");
    if (!el) return;
    const cls = el.classList.contains("club-bar") ? "club-bar" : "club-cell";
    document.querySelectorAll(`.${cls}.is-on`).forEach((b) => b.classList.remove("is-on"));
    el.classList.add("is-on");
    $(cls === "club-bar" ? "club-chart-info" : "club-heat-info").textContent = el.dataset.info;
  });

  document.querySelectorAll(".tabs__btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === "club") load();
    })
  );

  window.ClubUI = { load, render };
})();
