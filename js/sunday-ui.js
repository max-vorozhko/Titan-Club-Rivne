// Інтерфейс вкладки «Неділя»: старт, керування, фініш із фото, рейтинг тижня й архів.
(function () {
  const $ = (id) => document.getElementById(id);
  const { SundayGame, weekInfo, formatTime, groupPhoto } = window.SundayRun;
  const ARCHIVE_WEEKS = 6;
  const MEDALS = ["🥇", "🥈", "🥉"];

  let dist = 5;
  let boardDist = 5;
  let lastResult = null;
  let lastPhoto = null;
  let toastTimer;

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const ui = {
    hud(s) {
      $("sun-km").textContent = s.km.toFixed(2);
      $("sun-dist").textContent = s.dist;
      $("sun-time").textContent = s.time;
      $("sun-pace").textContent = s.pace === "—" ? "" : ` · ${s.pace}/км`;
      $("sun-energy").style.width = Math.max(0, s.energy) + "%";
      $("sun-energy").parentNode.classList.toggle("is-low", s.energy < 25);
      $("sun-progress").style.width = s.progress * 100 + "%";
      $("sun-group").textContent = s.group;
    },
    toast(text) {
      const el = $("sun-toast");
      el.textContent = text;
      el.classList.add("is-visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove("is-visible"), 1500);
    },
    finish(result) {
      lastResult = result;
      setPlaying(false);
      $("sun-toast").classList.remove("is-visible");
      $("sun-res-time").textContent = formatTime(result.time);
      $("sun-res-pace").textContent = formatTime(result.pace);
      $("sun-res-stumbles").textContent = result.stumbles;
      $("sun-again").textContent = `Ще раз · ${result.dist} км`;
      renderPhoto(null);
      submit(result);
      setTimeout(() => ($("sun-finish").hidden = false), 400);
    },
  };

  const game = new SundayGame($("sun-canvas"), ui);

  function setPlaying(on) {
    $("sun-hud").hidden = !on;
    $("sun-controls").hidden = !on;
    if (!on) game.setSprint(false);
  }

  function renderStart() {
    const week = weekInfo(0);
    $("sun-week").textContent = `Тиждень №${week.number} · траса оновлюється щопонеділка`;
    $("sun-route").innerHTML = `<b>${escapeHtml(week.theme.name)}:</b> ${["КТС", ...week.theme.stops, "КТС"].map(escapeHtml).join(" → ")}`;
    $("sun-name").hidden = !(Leaderboard.enabled && !Leaderboard.getName());
  }

  function start() {
    const typed = $("sun-name-input").value.trim();
    if (!$("sun-name").hidden && typed.length >= 2) Leaderboard.setName(typed);
    ["sun-start", "sun-finish", "sun-board", "sun-pause"].forEach((id) => ($(id).hidden = true));
    setPlaying(true);
    game.resize();
    game.start(dist);
  }

  let photoSeq = 0;
  async function renderPhoto(place) {
    const seq = ++photoSeq;
    try {
      const blob = await groupPhoto(lastResult, Leaderboard.getName(), place);
      if (seq !== photoSeq) return; // уже малюється новіша версія (наприклад, з місцем у рейтингу)
      lastPhoto = blob;
      const img = $("sun-photo");
      if (img.src) URL.revokeObjectURL(img.src);
      img.src = URL.createObjectURL(lastPhoto);
    } catch (e) {}
  }

  function status(text) {
    $("sun-status").hidden = !text;
    $("sun-status").textContent = text || "";
  }

  async function submit(result) {
    if (!Leaderboard.enabled) return status("");
    if (!Leaderboard.getName()) return status("Введи ім'я на старті, щоб потрапити в рейтинг тижня");
    status("Зберігаю результат…");
    try {
      const res = await Leaderboard.sundaySubmit({ week: result.week.id, dist: result.dist, time: result.time, stumbles: result.stumbles });
      status(res.place ? `📊 #${res.place} цього тижня на ${result.dist} км (кращий час ${formatTime(res.best)})` : "Результат збережено");
      if (res.place) renderPhoto(res.place);
    } catch (e) {
      status("Не вдалося зберегти результат 😕");
    }
  }

  // ---------- Рейтинг тижня й архів ----------

  function rowsHtml(rows) {
    return rows
      .map(
        (r) => `
        <li class="leaders__row${r.me ? " is-me" : ""}">
          <span class="leaders__place">${MEDALS[r.place - 1] || r.place}</span>
          <span class="leaders__name">${escapeHtml(r.name)}${r.me ? " <small>(ти)</small>" : ""}</span>
          <span></span>
          <span class="leaders__km">${formatTime(r.time)}</span>
        </li>`
      )
      .join("");
  }

  async function openBoard() {
    const week = weekInfo(0);
    $("sun-board-title").textContent = `Рейтинг тижня №${week.number}`;
    ["sun-start", "sun-finish"].forEach((id) => ($(id).hidden = true));
    $("sun-board").hidden = false;
    if (!Leaderboard.enabled) {
      $("sun-board-list").innerHTML = '<li class="leaders__empty">Рейтинг поки недоступний</li>';
      $("sun-archive").innerHTML = "";
      return;
    }
    $("sun-board-list").innerHTML = '<li class="leaders__empty">Завантажую…</li>';
    $("sun-archive").innerHTML = "";
    try {
      const rows = await Leaderboard.sundayTop(week.id, boardDist, 30);
      $("sun-board-list").innerHTML = rows.length ? rowsHtml(rows) : '<li class="leaders__empty">Цього тижня ще ніхто не біг. Будь першим! 🏃</li>';
    } catch (e) {
      $("sun-board-list").innerHTML = '<li class="leaders__empty">Не вдалося завантажити рейтинг 😕</li>';
    }
    const weeks = Array.from({ length: ARCHIVE_WEEKS }, (_, i) => weekInfo(-(i + 1)));
    const winners = await Promise.all(weeks.map((w) => Leaderboard.sundayTop(w.id, boardDist, 1).catch(() => [])));
    $("sun-archive").innerHTML = weeks
      .map((w, i) => {
        const win = winners[i][0];
        return `
        <li class="leaders__row sun-archive__row">
          <span class="leaders__place">№${w.number}</span>
          <span class="leaders__name">${escapeHtml(w.theme.name)}<small class="sun-archive__who">${win ? ` 🥇 ${escapeHtml(win.name)}` : " — ніхто не біг"}</small></span>
          <span></span>
          <span class="leaders__km">${win ? formatTime(win.time) : ""}</span>
        </li>`;
      })
      .join("");
  }

  function closeBoard() {
    $("sun-board").hidden = true;
    if (lastResult && !game.running && game.finished) $("sun-finish").hidden = false;
    else $("sun-start").hidden = false;
  }

  // ---------- Події ----------

  function pick(group, attr, onPick) {
    $(group).addEventListener("click", (e) => {
      const btn = e.target.closest("[data-" + attr + "]");
      if (!btn) return;
      $(group).querySelectorAll(".seg__btn").forEach((b) => b.classList.toggle("is-active", b === btn));
      onPick(Number(btn.dataset[attr]));
    });
  }

  pick("sun-dist-pick", "dist", (d) => (dist = d));
  pick("sun-board-dist", "dist", (d) => {
    boardDist = d;
    openBoard();
  });

  $("sun-go").addEventListener("click", start);
  // «Вибір дистанції» повертає на старт; «Ще раз» перезапускає ту саму дистанцію
  function backToStart() {
    ["sun-finish", "sun-board", "sun-pause"].forEach((id) => ($(id).hidden = true));
    renderStart();
    $("sun-start").hidden = false;
  }

  $("sun-again").addEventListener("click", start);
  $("sun-pick").addEventListener("click", backToStart);
  $("sun-name-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") start();
  });
  $("sun-open-board").addEventListener("click", openBoard);
  $("sun-finish-board").addEventListener("click", openBoard);
  $("sun-board-close").addEventListener("click", closeBoard);
  $("sun-resume").addEventListener("click", () => {
    $("sun-pause").hidden = true;
    game.resize();
    game.resume();
  });

  $("sun-share").addEventListener("click", async () => {
    if (!lastPhoto || !lastResult) return;
    const text = `Недільна пробіжка Titan Club: ${lastResult.dist} км за ${formatTime(lastResult.time)} 🏃☕`;
    const how = await Share.shareBlob(lastPhoto, `titan-sunday-${lastResult.week.id}-${lastResult.dist}k.png`, text);
    if (how === "downloaded") ui.toast("Фото збережено 📸");
  });

  // Стрибок — тап по полю або кнопка; темп — утримання кнопки
  $("sun-canvas").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    game.jump();
  });
  $("sun-jump").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    game.jump();
  });
  const sprintBtn = $("sun-sprint");
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

  const active = () => $("tab-sunday").classList.contains("is-active");

  document.addEventListener("keydown", (e) => {
    if (!active() || e.target.tagName === "INPUT") return;
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      if (game.running) game.jump();
      else if (!$("sun-start").hidden) start();
      else if (!$("sun-finish").hidden) backToStart();
    } else if (e.code === "ArrowRight" || e.code === "ShiftLeft" || e.code === "ShiftRight") {
      e.preventDefault();
      game.setSprint(true);
    }
  });
  document.addEventListener("keyup", (e) => {
    if (e.code === "ArrowRight" || e.code === "ShiftLeft" || e.code === "ShiftRight") game.setSprint(false);
  });

  // Пауза, коли йдемо з вкладки або ховаємо застосунок
  function pause() {
    if (!game.running) return;
    game.pause();
    game.setSprint(false);
    $("sun-pause").hidden = false;
  }

  document.querySelectorAll(".tabs__btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === "sunday") {
        renderStart();
        requestAnimationFrame(() => game.resize());
      } else pause();
    })
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });

  renderStart();
  window.SundayUI = { game, openBoard };
})();
