(function () {
  const $ = (id) => document.getElementById(id);
  const BEST_KEY = "titan.best.v1";

  function getBest() {
    try {
      return parseFloat(localStorage.getItem(BEST_KEY)) || 0;
    } catch (e) {
      return 0;
    }
  }

  function setBest(km) {
    try {
      localStorage.setItem(BEST_KEY, String(km));
    } catch (e) {}
  }

  // ---------- Вкладки ----------
  // Верхнє меню ховається на головній (там ті самі кнопки великими картками)
  function showTab(name) {
    document.querySelectorAll(".tabs__btn").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === name));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.id === "tab-" + name));
    document.body.classList.toggle("is-home", name === "home");
    window.scrollTo(0, 0);
  }

  document.querySelectorAll(".tabs__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      showTab(btn.dataset.tab);
      if (btn.dataset.tab === "game") game.resize();
      else if (btn.dataset.tab === "leaders") loadLeaders();
      else if (btn.dataset.tab === "profile") renderRewards();
    });
  });

  // Переходи з головної та інших кнопок: «натискаємо» відповідну вкладку, щоб спрацювали обробники режимів
  function goTab(name) {
    document.querySelector(`.tabs__btn[data-tab="${name}"]`).click();
  }

  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) goTab(go.dataset.go);
    // Плашка про буст на старті «Неділі»/«Трейлу» веде у вкладку «Буст-кросівки» профілю
    if (e.target.closest("[data-goto-boost]")) {
      goTab("profile");
      if (window.ProfileUI) ProfileUI.showPane("boost");
    }
  });

  // Лого веде на головну з вибором формату
  $("home-link").addEventListener("click", (e) => {
    e.preventDefault();
    closeModals();
    showTab("home");
    if (!game.running) {
      $("screen-over").hidden = true;
      $("screen-start").hidden = false;
    }
  });

  // ---------- Спливаючі вікна «Як грати» ----------
  function closeModals() {
    document.querySelectorAll(".modal").forEach((m) => (m.hidden = true));
  }

  document.addEventListener("click", (e) => {
    const open = e.target.closest("[data-help]");
    if (open) {
      $(open.dataset.help).hidden = false;
      return;
    }
    const modal = e.target.closest(".modal");
    // Закриваємо кнопкою «Зрозуміло» або тапом по затемненню навколо картки
    if (modal && (e.target === modal || e.target.closest("[data-close]"))) modal.hidden = true;
  });

  // Поки відкрите вікно, Пробіл/↑ не мають запускати забіг; Esc закриває
  document.addEventListener(
    "keydown",
    (e) => {
      if (!document.querySelector(".modal:not([hidden])")) return;
      if (e.key === "Escape" || e.key === "Enter") closeModals();
      e.stopImmediatePropagation();
      if (e.code === "Space" || e.code === "ArrowUp" || e.key === "Enter") e.preventDefault();
    },
    true
  );

  // ---------- Гра ----------
  let toastTimer;
  let lastResult = null;

  const ui = {
    hud(km, energy, coins) {
      $("hud-km").textContent = km.toFixed(2);
      $("hud-energy").style.width = Math.max(0, energy) + "%";
      $("hud-energy").parentNode.classList.toggle("is-low", energy < 25);
      $("hud-coins").textContent = coins;
    },
    toast(text) {
      const el = $("toast");
      el.textContent = text;
      el.classList.add("is-visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove("is-visible"), 1600);
    },
    over(result) {
      lastResult = result;
      const best = Math.max(getBest(), result.km);
      const isRecord = result.km > getBest();
      setBest(best);
      $("hud").hidden = true;
      // Причину показуємо завжди, щоб було зрозуміло, чим закінчився забіг
      $("over-title").textContent = result.reason;
      $("over-record").hidden = !isRecord;
      $("over-km").textContent = result.km.toFixed(2);
      $("over-coins").textContent = result.coins;
      $("over-pace").textContent = result.mark;
      $("best-over").textContent = best.toFixed(2);
      $("best-start").textContent = best.toFixed(2);
      Profile.record({ mode: "game", km: result.km });
      prepareSubmit(result);
      // Невелика пауза, щоб випадковий тап не перезапустив гру одразу
      setTimeout(() => ($("screen-over").hidden = false), 450);
    },
  };

  const game = new TitanGame($("game-canvas"), ui);
  $("best-start").textContent = getBest().toFixed(2);

  // Ім'я для рейтингу можна ввести ще до забігу
  function renderStartName() {
    const name = Leaderboard.enabled ? Leaderboard.getName() : "";
    $("start-name").hidden = !Leaderboard.enabled || !!name;
    $("start-who").hidden = !name;
    if (name) {
      $("start-who").innerHTML = `Граєш як <b>${escapeHtml(name)}</b> · <button class="link" id="start-rename" type="button">змінити</button>`;
    }
  }

  $("start-who").addEventListener("click", (e) => {
    if (e.target.id !== "start-rename") return;
    $("start-name-input").value = Leaderboard.getName();
    $("start-who").hidden = true;
    $("start-name").hidden = false;
    $("start-name-input").focus();
  });

  $("start-name-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") start();
  });

  function start() {
    const typed = $("start-name-input").value.trim();
    if (!$("start-name").hidden && typed.length >= 2) {
      Leaderboard.setName(typed);
      renderStartName();
    }
    $("share-sheet").hidden = true;
    $("screen-start").hidden = true;
    $("screen-over").hidden = true;
    $("hud").hidden = false;
    game.start();
  }

  $("btn-start").addEventListener("click", start);
  $("btn-restart").addEventListener("click", start);

  $("game-canvas").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    game.jump();
  });
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" && e.code !== "ArrowUp") return;
    // Пробіл у полі імені — це просто пробіл, а не новий забіг
    if (e.target.tagName === "INPUT") return;
    if (!$("tab-game").classList.contains("is-active")) return;
    e.preventDefault();
    if (game.running) game.jump();
    else if (!$("tab-game").classList.contains("is-active")) return;
    else if (!$("screen-start").hidden || !$("screen-over").hidden) start();
  });

  // Меню «Поділитись»: соцмережі, картинка для сторіс, копіювання, системне меню
  $("btn-share").addEventListener("click", () => {
    if (!lastResult) return;
    const sheet = $("share-sheet");
    if (!sheet.hidden) {
      sheet.hidden = true;
      return;
    }
    const l = Share.links(lastResult);
    $("share-telegram").href = l.telegram;
    $("share-viber").href = l.viber;
    $("share-whatsapp").href = l.whatsapp;
    $("share-facebook").href = l.facebook;
    $("share-x").href = l.x;
    $("share-more").hidden = !Share.hasNative;
    sheet.hidden = false;
  });

  $("share-copy").addEventListener("click", async () => {
    ui.toast((await Share.copy(lastResult)) ? "Скопійовано! Встав у чат 👍" : "Не вдалося скопіювати 😕");
  });

  $("share-more").addEventListener("click", () => Share.native(lastResult));

  $("share-story").addEventListener("click", async () => {
    ui.toast("Готую картинку…");
    try {
      const how = await Share.shareImage(lastResult);
      if (how === "downloaded") ui.toast("Картинку збережено — додай її в сторіс 📸");
    } catch (e) {
      ui.toast("Не вдалося створити картинку 😕");
    }
  });

  // ---------- Рейтинг ----------
  const MIN_KM_FOR_BOARD = 0.1;
  const MEDALS = ["🥇", "🥈", "🥉"];

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function lbStatus(text) {
    $("lb-status").hidden = !text;
    $("lb-status").textContent = text || "";
  }

  // Після забігу: якщо ім'я вже відоме, відправляємо одразу, інакше просимо його ввести
  function prepareSubmit(result) {
    $("lb-form").hidden = true;
    lbStatus("");
    if (!Leaderboard.enabled) return;
    if (result.km < MIN_KM_FOR_BOARD) {
      lbStatus("Пробіжи хоча б 100 м, щоб потрапити в рейтинг 🏃");
      return;
    }
    if (Leaderboard.getName()) submitRun(result);
    else {
      $("lb-name").value = "";
      $("lb-form").hidden = false;
    }
  }

  async function submitRun(result) {
    lbStatus("Зберігаю результат…");
    try {
      const res = await Leaderboard.submit(result);
      lbStatus(res.place ? `📊 Ти #${res.place} у рейтингу клубу (кращий: ${Number(res.best).toFixed(2)} км)` : "Результат збережено");
    } catch (e) {
      lbStatus("Не вдалося зберегти результат 😕");
    }
  }

  $("lb-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("lb-name").value.trim();
    if (name.length < 2) return;
    Leaderboard.setName(name);
    renderStartName();
    $("lb-form").hidden = true;
    if (lastResult) submitRun(lastResult);
  });

  // Спільна турнірна таблиця: розділи Біг / Неділя / Трейл, у Неділі й Трейлі — розбивка за дистанціями
  const LB_DISTS = { sunday: [5, 10], trail: [7, 13, 26] };
  const lbDist = { sunday: 5, trail: 7 };
  let lbMode = "game";
  let lbSeq = 0;

  const fmt = (sec) => window.SundayRun.formatTime(sec);
  const empty = (text) => `<li class="leaders__empty">${text}</li>`;

  function timeRows(rows) {
    return rows
      .map(
        (r) => `
        <li class="leaders__row${r.me ? " is-me" : ""}">
          <span class="leaders__place">${MEDALS[r.place - 1] || r.place}</span>
          <span class="leaders__name">${escapeHtml(r.name)}${r.boost ? ' <span class="boost-mark" title="Результат із бустом «Супер-кросівки»">⚡</span>' : ""}${r.me ? " <small>(ти)</small>" : ""}${Leaderboard.moveBadge(r)}</span>
          <span></span>
          <span class="leaders__km">${fmt(r.time)}</span>
        </li>`
      )
      .join("");
  }

  function renderLbDists() {
    const dists = LB_DISTS[lbMode];
    $("lb-dist").hidden = !dists;
    $("lb-dist").innerHTML = dists
      ? dists.map((d) => `<button class="seg__btn${d === lbDist[lbMode] ? " is-active" : ""}" data-dist="${d}" type="button">${d} км</button>`).join("")
      : "";
  }

  function renderMe(place, total) {
    const name = Leaderboard.getName();
    $("lb-me").hidden = !name;
    $("lb-me").innerHTML = name
      ? `Ти граєш як <b>${escapeHtml(name)}</b>${place ? ` · місце #${place}${total ? ` з ${total}` : ""}` : ""} · <button class="link" id="lb-rename" type="button">змінити ім'я</button>`
      : "";
  }

  async function loadLeaders() {
    renderLbDists();
    $("lb-archive").hidden = lbMode !== "sunday";
    $("lb-past").hidden = true;
    const week = window.SundayRun.weekInfo(0);
    $("lb-lead").textContent = {
      game: "Найдовші забіги в Titan Run серед учасників Titan Club Rivne.",
      sunday: `Тиждень №${week.number} · ${week.theme.name} · найкращий час тижня. Рейтинг обнуляється щопонеділка.`,
      trail: "Підготовка до Житомирських вертикалей · найкращий час за весь час.",
    }[lbMode];
    if (!Leaderboard.enabled) {
      $("lb-wip").hidden = false;
      $("lb-list").innerHTML = empty("Скоро тут з'явиться рейтинг учасників клубу.");
      return;
    }
    const seq = ++lbSeq;
    $("lb-refresh").hidden = false;
    $("lb-list").innerHTML = empty("Завантажую…");
    renderMe(null);
    try {
      if (lbMode === "game") {
        const data = await Leaderboard.top();
        if (seq !== lbSeq) return; // тим часом переключили розділ
        $("lb-list").innerHTML = data.rows.length
          ? data.rows.map((r) => `
            <li class="leaders__row${r.me ? " is-me" : ""}">
              <span class="leaders__place">${MEDALS[r.place - 1] || r.place}</span>
              <span class="leaders__name">${escapeHtml(r.name)}${r.me ? " <small>(ти)</small>" : ""}${Leaderboard.moveBadge(r)}</span>
              <span class="leaders__coins">🪙 ${r.coins}</span>
              <span class="leaders__km">${Number(r.km).toFixed(2)} км</span>
            </li>`).join("")
          : empty("Поки що порожньо. Стань першим! 🏃");
        renderMe(data.me && data.me.place, data.total);
      } else {
        const d = lbDist[lbMode];
        const rows = lbMode === "sunday" ? await Leaderboard.sundayTop(week.id, d, 30, { moves: true, prevWeek: window.SundayRun.weekInfo(-1).id }) : await Leaderboard.trailTop(d, 30);
        if (seq !== lbSeq) return;
        const mine = rows.find((r) => r.me);
        $("lb-list").innerHTML = rows.length
          ? timeRows(rows)
          : empty(lbMode === "sunday" ? "Цього тижня ще ніхто не біг. Будь першим! 🏃" : "Тут ще ніхто не біг. Будь першим! 🏔️");
        renderMe(mine && mine.place);
        if (lbMode === "sunday") loadPastWeek(d, seq);
      }
    } catch (e) {
      if (seq === lbSeq) $("lb-list").innerHTML = empty("Не вдалося завантажити рейтинг 😕");
    }
  }

  // Минулий тиждень: топ-3 сірим, далі «⋯» і перехід в архів
  async function loadPastWeek(d, seq) {
    const past = window.SundayRun.weekInfo(-1);
    try {
      const rows = await Leaderboard.sundayTop(past.id, d, 4);
      if (seq !== lbSeq) return;
      $("lb-past-title").textContent = `Минулий тиждень №${past.number} · ${past.theme.name}`;
      $("lb-past-list").innerHTML = rows.length
        ? timeRows(rows.slice(0, 3).map((r) => ({ ...r, move: 0, isNew: false }))) + (rows.length > 3 ? '<li class="leaders__more">⋯</li>' : "")
        : empty("Минулого тижня ніхто не біг");
      $("lb-past").hidden = false;
    } catch (e) {}
  }

  $("lb-mode").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (!btn) return;
    lbMode = btn.dataset.mode;
    $("lb-mode").querySelectorAll(".seg__btn").forEach((b) => b.classList.toggle("is-active", b === btn));
    loadLeaders();
  });

  $("lb-dist").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-dist]");
    if (!btn) return;
    lbDist[lbMode] = Number(btn.dataset.dist);
    loadLeaders();
  });

  // Архів переможців живе у вкладці «Неділя»
  $("lb-archive").addEventListener("click", () => {
    goTab("sunday");
    if (window.SundayUI) SundayUI.openBoard();
  });

  $("lb-refresh").addEventListener("click", loadLeaders);
  $("lb-me").addEventListener("click", (e) => {
    if (e.target.id !== "lb-rename") return;
    const name = prompt("Нове ім'я для рейтингу (оновиться після наступного забігу):", Leaderboard.getName());
    if (name && name.trim().length >= 2) {
      Leaderboard.setName(name);
      renderStartName();
      loadLeaders();
    }
  });

  // ---------- Бонуси ----------
  // Облік пробіжок ще в розробці, тому показуємо лише рівні програми (js/attendance.js поки не підключено).
  function renderRewards() {
    $("reward-track").innerHTML = REWARDS.map((r) => `
      <div class="reward">
        <div class="reward__icon">${r.icon}</div>
        <div class="reward__name">${r.name}</div>
        <div class="reward__goal">${r.runs} пробіжок</div>
      </div>`).join("");
  }

  renderRewards();
  renderStartName();
})();
