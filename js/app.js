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
  document.querySelectorAll(".tabs__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs__btn").forEach((b) => b.classList.toggle("is-active", b === btn));
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.id === "tab-" + btn.dataset.tab));
      if (btn.dataset.tab === "game") game.resize();
      else if (btn.dataset.tab === "leaders") loadLeaders();
      else if (btn.dataset.tab === "rewards") renderRewards();
    });
  });

  // Лого веде на головну: вкладка «Гра» зі стартовим екраном
  $("home-link").addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelector('.tabs__btn[data-tab="game"]').click();
    if (!game.running) {
      $("screen-over").hidden = true;
      $("screen-start").hidden = false;
      window.scrollTo(0, 0);
    }
  });

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

  async function loadLeaders() {
    if (!Leaderboard.enabled) {
      $("lb-wip").hidden = false;
      $("lb-lead").textContent = "Скоро тут з'явиться рейтинг найдовших забігів серед учасників клубу.";
      return;
    }
    $("lb-refresh").hidden = false;
    $("lb-list").innerHTML = '<li class="leaders__empty">Завантажую…</li>';
    try {
      const data = await Leaderboard.top();
      $("lb-list").innerHTML = data.rows.length
        ? data.rows.map((r) => `
            <li class="leaders__row${r.me ? " is-me" : ""}">
              <span class="leaders__place">${MEDALS[r.place - 1] || r.place}</span>
              <span class="leaders__name">${escapeHtml(r.name)}${r.me ? " <small>(ти)</small>" : ""}</span>
              <span class="leaders__coins">🪙 ${r.coins}</span>
              <span class="leaders__km">${Number(r.km).toFixed(2)} км</span>
            </li>`).join("")
        : '<li class="leaders__empty">Поки що порожньо. Стань першим! 🏃</li>';
      const name = Leaderboard.getName();
      $("lb-me").hidden = !name;
      $("lb-me").innerHTML = name
        ? `Ти граєш як <b>${escapeHtml(name)}</b>${data.me && data.me.place ? ` · місце #${data.me.place}${data.total ? ` з ${data.total}` : ""}` : ""} · <button class="link" id="lb-rename" type="button">змінити ім'я</button>`
        : "";
    } catch (e) {
      $("lb-list").innerHTML = '<li class="leaders__empty">Не вдалося завантажити рейтинг 😕</li>';
    }
  }

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
