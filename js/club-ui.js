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

  // Стовпчики: скільки людей було на кожній неділі (останні 26). Тап по стовпчику показує деталі.
  function chart(runs) {
    const last = runs.slice(-26);
    const max = Math.max(1, ...last.map((r) => r.count));
    const bars = last
      .map((r) => {
        const h = Math.max(4, Math.round((r.count / max) * 100));
        const info = `Тиждень ${r.week} · ${Club.formatDate(r.date)}: ${r.count} ${plural(r.count, "учасник", "учасники", "учасників")}${r.km !== null ? ` · ${num(r.km)} км` : ""}`;
        return `<button class="club-bar" type="button" data-info="${escapeHtml(info)}" aria-label="${escapeHtml(info)}"><span style="height:${h}%"></span></button>`;
      })
      .join("");
    const first = last[0];
    const end = last[last.length - 1];
    return `
      <h3 class="profile__sub">Учасників на пробіжках</h3>
      <div class="club-chart" id="club-chart">${bars}</div>
      <div class="club-chart__axis"><span>Тиждень ${first.week}</span><span>Тиждень ${end.week}</span></div>
      <p class="club-chart__info" id="club-chart-info">Торкнись стовпчика, щоб побачити деталі</p>`;
  }

  function row(place, a, right, sub) {
    return `
      <li class="leaders__row">
        <span class="leaders__place">${MEDALS[place - 1] || place}</span>
        <span class="leaders__name">${escapeHtml(a.emoji)} ${escapeHtml(a.persona)}<small class="club-sub">${sub}</small></span>
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
    const record = s.runs.reduce((m, r) => (r.count > m.count ? r : m), s.runs[0]);
    const active = s.athletes.filter((a) => a.count > 0);
    const loyal = [...active].sort((a, b) => b.count - a.count || b.km - a.km).slice(0, TOP_N);
    const streaks = [...active].filter((a) => a.bestStreak > 1).sort((a, b) => b.bestStreak - a.bestStreak || b.streak - a.streak).slice(0, 5);
    const hasKm = s.clubKm > 0;

    $("club-body").innerHTML = `
      <div class="stats club-tiles">
        ${tile(s.held, plural(s.held, "неділя", "неділі", "неділь"))}
        ${tile(hasKm ? num(s.clubKm) : "—", "км разом")}
        ${tile(num(s.avg), "у середньому")}
        ${tile(record.count, `рекорд · тиждень ${record.week}`)}
      </div>
      ${chart(s.runs)}
      <h3 class="profile__sub">Найвірніші</h3>
      <ol class="leaders club-list">
        ${loyal.map((a, i) => row(i + 1, a, `${a.pct}%`, `${a.count} з ${s.held}${a.km ? ` · ${num(Math.round(a.km))} км` : ""}`)).join("")}
      </ol>
      ${
        streaks.length
          ? `<h3 class="profile__sub">Серії без пропусків</h3>
             <ol class="leaders club-list">
               ${streaks.map((a, i) => row(i + 1, a, a.bestStreak, a.streak > 1 ? `🔥 зараз ${a.streak} поспіль` : "найдовша серія")).join("")}
             </ol>`
          : ""
      }
      <p class="muted small-left club-foot">Дані вносять адміни клубу після кожної неділі.</p>`;
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
    const bar = e.target.closest(".club-bar");
    if (!bar) return;
    document.querySelectorAll(".club-bar.is-on").forEach((b) => b.classList.remove("is-on"));
    bar.classList.add("is-on");
    $("club-chart-info").textContent = bar.dataset.info;
  });

  document.querySelectorAll(".tabs__btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === "club") load();
    })
  );

  window.ClubUI = { load, render };
})();
