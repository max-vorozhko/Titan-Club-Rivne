// Інтерфейс вкладки «Трейл»: старт, керування, фініш із картинкою й турнірна таблиця.
(function () {
  const $ = (id) => document.getElementById(id);
  const { TrailGame, makeProfile, drawProfile, storyImage, DISTANCES } = window.TrailRun;
  const { formatTime } = window.SundayRun;
  const MEDALS = ["🥇", "🥈", "🥉"];

  let dist = DISTANCES[0];
  let boardDist = DISTANCES[0];
  let lastResult = null;
  let lastPhoto = null;
  let lastPlace = null;
  let photoSeq = 0;
  let toastTimer;

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const ui = {
    hud(s) {
      $("trail-km").textContent = s.km.toFixed(2);
      $("trail-dist").textContent = s.dist;
      $("trail-time").textContent = s.time;
      $("trail-pace").textContent = s.pace === "—" ? "" : ` · ${s.pace}/км`;
      $("trail-energy").style.width = Math.max(0, s.energy) + "%";
      $("trail-energy").parentNode.classList.toggle("is-low", s.energy < 25);
      $("trail-marker").style.left = s.progress * 100 + "%";
      const slope = s.grade > 2 ? `↗ ${s.grade}%` : s.grade < -2 ? `↘ ${-s.grade}%` : "→ рівно";
      $("trail-climb").textContent = `🏔️ ${s.climbed} / ${s.dplus} м · ${slope}${s.hiking ? " · 🚶 йдеш кроком" : ""}`;
    },
    toast(text) {
      const el = $("trail-toast");
      el.textContent = text;
      el.classList.add("is-visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove("is-visible"), 1500);
    },
    finish(result) {
      lastResult = result;
      lastPlace = null;
      setPlaying(false);
      $("trail-toast").classList.remove("is-visible");
      $("trail-res-time").textContent = formatTime(result.time);
      $("trail-res-pace").textContent = formatTime(result.pace);
      $("trail-res-dplus").textContent = result.dplus;
      $("trail-again").textContent = `Ще раз · ${result.dist} км`;
      renderPhoto(null);
      submit(result);
      setTimeout(() => ($("trail-finish").hidden = false), 400);
    },
  };

  const game = new TrailGame($("trail-canvas"), ui);

  function setPlaying(on) {
    $("trail-hud").hidden = !on;
    $("trail-controls").hidden = !on;
    if (!on) game.setSprint(false);
  }

  function renderStart() {
    $("trail-dist-pick").querySelectorAll("[data-dist]").forEach((b) => {
      const d = Number(b.dataset.dist);
      b.innerHTML = `${d} км<small>D+ ${makeProfile(d).dplus} м</small>`;
    });
    $("trail-name").hidden = !(Leaderboard.enabled && !Leaderboard.getName());
  }

  function start() {
    const typed = $("trail-name-input").value.trim();
    if (!$("trail-name").hidden && typed.length >= 2) Leaderboard.setName(typed);
    ["trail-start", "trail-finish", "trail-board", "trail-pause", "trail-share-sheet"].forEach((id) => ($(id).hidden = true));
    setPlaying(true);
    game.resize();
    drawProfile($("trail-profile"), dist);
    game.start(dist);
  }

  function backToStart() {
    ["trail-finish", "trail-board", "trail-pause", "trail-share-sheet"].forEach((id) => ($(id).hidden = true));
    renderStart();
    $("trail-start").hidden = false;
  }

  async function renderPhoto(place) {
    const seq = ++photoSeq;
    try {
      const blob = await storyImage(lastResult, Leaderboard.getName(), place);
      if (seq !== photoSeq) return;
      lastPhoto = blob;
      const img = $("trail-photo");
      if (img.src) URL.revokeObjectURL(img.src);
      img.src = URL.createObjectURL(blob);
    } catch (e) {}
  }

  function status(text) {
    $("trail-status").hidden = !text;
    $("trail-status").textContent = text || "";
  }

  async function submit(result) {
    if (!Leaderboard.enabled) return status("");
    if (!Leaderboard.getName()) return status("Введи ім'я на старті, щоб потрапити в турнірну таблицю");
    status("Зберігаю результат…");
    try {
      const res = await Leaderboard.trailSubmit({ dist: result.dist, time: result.time, stumbles: result.stumbles });
      status(res.place ? `📊 #${res.place} у таблиці на ${result.dist} км (кращий час ${formatTime(res.best)})` : "Результат збережено");
      lastPlace = res.place;
      if (res.place) renderPhoto(res.place);
    } catch (e) {
      status("Не вдалося зберегти результат 😕");
    }
  }

  async function openBoard() {
    ["trail-start", "trail-finish"].forEach((id) => ($(id).hidden = true));
    $("trail-board").hidden = false;
    if (!Leaderboard.enabled) {
      $("trail-board-list").innerHTML = '<li class="leaders__empty">Таблиця поки недоступна</li>';
      return;
    }
    $("trail-board-list").innerHTML = '<li class="leaders__empty">Завантажую…</li>';
    try {
      const rows = await Leaderboard.trailTop(boardDist, 30);
      $("trail-board-list").innerHTML = rows.length
        ? rows
            .map(
              (r) => `
            <li class="leaders__row${r.me ? " is-me" : ""}">
              <span class="leaders__place">${MEDALS[r.place - 1] || r.place}</span>
              <span class="leaders__name">${escapeHtml(r.name)}${r.me ? " <small>(ти)</small>" : ""}</span>
              <span></span>
              <span class="leaders__km">${formatTime(r.time)}</span>
            </li>`
            )
            .join("")
        : '<li class="leaders__empty">Тут ще ніхто не біг. Будь першим! 🏔️</li>';
    } catch (e) {
      $("trail-board-list").innerHTML = '<li class="leaders__empty">Не вдалося завантажити таблицю 😕</li>';
    }
  }

  function closeBoard() {
    $("trail-board").hidden = true;
    if (lastResult && !game.running && game.finished) $("trail-finish").hidden = false;
    else $("trail-start").hidden = false;
  }

  // ---------- Події ----------

  function pick(group, onPick) {
    $(group).addEventListener("click", (e) => {
      const btn = e.target.closest("[data-dist]");
      if (!btn) return;
      $(group).querySelectorAll(".seg__btn").forEach((b) => b.classList.toggle("is-active", b === btn));
      onPick(Number(btn.dataset.dist));
    });
  }

  pick("trail-dist-pick", (d) => (dist = d));
  pick("trail-board-dist", (d) => {
    boardDist = d;
    openBoard();
  });

  $("trail-go").addEventListener("click", start);
  $("trail-again").addEventListener("click", start);
  $("trail-pick").addEventListener("click", backToStart);
  $("trail-name-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") start();
  });
  $("trail-open-board").addEventListener("click", openBoard);
  $("trail-finish-board").addEventListener("click", openBoard);
  $("trail-board-close").addEventListener("click", closeBoard);
  $("trail-resume").addEventListener("click", () => {
    $("trail-pause").hidden = true;
    game.resize();
    game.resume();
  });

  Share.attachSheet($("trail-share"), $("trail-share-sheet"), () => {
    if (!lastResult) return null;
    const r = lastResult;
    const place = lastPlace ? ` — #${lastPlace} у таблиці` : "";
    return {
      text: `Підготовка до Житомирських вертикалей: трейл ${r.dist} км (D+ ${r.dplus} м) за ${formatTime(r.time)}${place} 🏔️🏃 А ти?`,
      photo: async () => lastPhoto || storyImage(r, Leaderboard.getName(), lastPlace),
      filename: `titan-trail-${r.dist}k.png`,
    };
  }, ui.toast);

  $("trail-canvas").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    game.jump();
  });
  $("trail-jump").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    game.jump();
  });
  const sprintBtn = $("trail-sprint");
  sprintBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    sprintBtn.setPointerCapture && sprintBtn.setPointerCapture(e.pointerId);
    sprintBtn.classList.add("is-on");
    game.setSprint(true);
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) =>
    sprintBtn.addEventListener(ev, () => {
      sprintBtn.classList.remove("is-on");
      game.setSprint(false);
    })
  );
  sprintBtn.addEventListener("contextmenu", (e) => e.preventDefault());

  const active = () => $("tab-trail").classList.contains("is-active");

  document.addEventListener("keydown", (e) => {
    if (!active() || e.target.tagName === "INPUT") return;
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      if (game.running) game.jump();
      else if (!$("trail-start").hidden) start();
      else if (!$("trail-finish").hidden) backToStart();
    } else if (e.code === "ArrowRight" || e.code === "ShiftLeft" || e.code === "ShiftRight") {
      e.preventDefault();
      game.setSprint(true);
    }
  });
  document.addEventListener("keyup", (e) => {
    if (e.code === "ArrowRight" || e.code === "ShiftLeft" || e.code === "ShiftRight") game.setSprint(false);
  });

  function pause() {
    if (!game.running) return;
    game.pause();
    game.setSprint(false);
    $("trail-pause").hidden = false;
  }

  document.querySelectorAll(".tabs__btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === "trail") {
        renderStart();
        requestAnimationFrame(() => game.resize());
      } else pause();
    })
  );
  document.getElementById("home-link").addEventListener("click", pause);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });

  renderStart();
  window.TrailUI = { game, openBoard };
})();
