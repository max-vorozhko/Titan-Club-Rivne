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
      else renderRewards();
    });
  });

  // ---------- Гра ----------
  let toastTimer;
  let lastResult = null;

  const ui = {
    hud(km, energy, coins) {
      $("hud-km").textContent = km.toFixed(2);
      $("hud-energy").style.width = Math.max(0, energy) + "%";
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
      $("over-title").textContent = isRecord ? "Новий рекорд! 🏆" : result.reason;
      $("over-km").textContent = result.km.toFixed(2);
      $("over-coins").textContent = result.coins;
      $("over-pace").textContent = result.mark;
      $("best-over").textContent = best.toFixed(2);
      $("best-start").textContent = best.toFixed(2);
      // Невелика пауза, щоб випадковий тап не перезапустив гру одразу
      setTimeout(() => ($("screen-over").hidden = false), 450);
    },
  };

  const game = new TitanGame($("game-canvas"), ui);
  $("best-start").textContent = getBest().toFixed(2);

  function start() {
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
    e.preventDefault();
    if (game.running) game.jump();
    else if (!$("tab-game").classList.contains("is-active")) return;
    else if (!$("screen-start").hidden || !$("screen-over").hidden) start();
  });

  $("btn-share").addEventListener("click", async () => {
    if (!lastResult) return;
    const text = `Я пробіг ${lastResult.km.toFixed(2)} км у грі Titan Run від @titan.club.rivne 🏃‍♂️ А ти?`;
    try {
      if (navigator.share) await navigator.share({ title: "Titan Run", text, url: location.href });
      else {
        await navigator.clipboard.writeText(`${text} ${location.href}`);
        ui.toast("Скопійовано!");
      }
    } catch (e) {}
  });

  // ---------- Бонуси ----------
  function plural(n) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return "пробіжка";
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "пробіжки";
    return "пробіжок";
  }

  function renderRewards() {
    const visits = Attendance.count();
    const next = nextReward(visits);
    $("visits-count").textContent = visits;
    $("visits-count").nextElementSibling.textContent = plural(visits);

    if (next) {
      const left = next.runs - visits;
      $("visits-next").textContent = `До подарунка «${next.name}» ${next.icon} ще ${left} ${plural(left)}`;
    } else {
      $("visits-next").textContent = "Усі подарунки зібрано! Ти справжній Титан 🏆";
    }

    let prev = 0;
    $("reward-track").innerHTML = REWARDS.map((r) => {
      const progress = Math.max(0, Math.min(1, (visits - prev) / (r.runs - prev)));
      prev = r.runs;
      const cls = visits >= r.runs ? "is-done" : r === next ? "is-next" : "";
      return `
        <div class="reward ${cls}">
          <div class="reward__icon">${r.icon}</div>
          <div>
            <div class="reward__name">${r.name}</div>
            <div class="reward__bar"><i style="width:${progress * 100}%"></i></div>
          </div>
          <div class="reward__goal">${visits >= r.runs ? "✓" : r.runs}</div>
        </div>`;
    }).join("");

    const btn = $("btn-checkin");
    if (Attendance.checkedInToday()) {
      btn.disabled = true;
      $("checkin-hint").textContent = "Сьогодні ти вже відмітився. До наступної неділі!";
    } else if (!Attendance.isRunDay()) {
      btn.disabled = true;
      $("checkin-hint").textContent = "Відмітитися можна в неділю, у день клубної пробіжки.";
    } else {
      btn.disabled = false;
      $("checkin-hint").textContent = "";
    }

    const history = Attendance.list().slice().reverse();
    $("visits-history").innerHTML = history.length
      ? history.map((d) => `<li>🏃 ${new Date(d).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" })}</li>`).join("")
      : "<li>Поки що порожньо. Чекаємо на тебе в неділю!</li>";
  }

  $("btn-checkin").addEventListener("click", () => {
    const before = Attendance.count();
    if (!Attendance.checkIn()) return;
    const earned = REWARDS.find((r) => before < r.runs && Attendance.count() >= r.runs);
    renderRewards();
    if (earned) alert(`Вітаємо! Ти заробив(-ла): ${earned.name} ${earned.icon}. Покажи цей екран тренеру.`);
  });

  renderRewards();
})();
