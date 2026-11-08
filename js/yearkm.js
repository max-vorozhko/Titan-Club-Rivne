// Пробіг з початку року для учасників Titan Premium (прив'язаних адміном до атлета клубу).
// Кабінет у профілі: «пробіг з початку року» + «+ км» + історія; рейтинг Titan Premium у вкладці «Клуб».
// Дані: yearKm/{рік}/members/{athleteId}. Бачать і пишуть лише прив'язані учасники й адміни (правила Firestore).
(function () {
  const $ = (id) => document.getElementById(id);
  const MAX_ADD = 100;
  const MEDALS = ["🥇", "🥈", "🥉"];
  const year = () => Number(Kyiv.today().slice(0, 4));
  const stampNow = () => firebase.firestore.FieldValue.serverTimestamp();
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // «12,5» і «12.5» → 12.5 (до десятих)
  function parseKm(raw) {
    const n = Number(String(raw).trim().replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : NaN;
  }
  const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  const tidy = (n) => Math.round(n * 10) / 10;

  const linked = () => !!(window.Account && Account.enabled() && Account.state.signedIn && Account.state.athleteId);

  let mine = null;

  async function colRef() {
    const { db } = await Leaderboard.connect();
    return db.collection("yearKm").doc(String(year())).collection("members");
  }

  async function ref() {
    return (await colRef()).doc(Account.state.athleteId);
  }

  async function loadMine() {
    const snap = await (await ref()).get();
    mine = snap.exists ? snap.data() : null;
    return mine;
  }

  // Змінює документ: change(поточний | null) → новий. Усе перевіряють правила Firestore.
  async function write(change) {
    const r = await ref();
    const snap = await r.get();
    const next = change(snap.exists ? { ...snap.data() } : null);
    next.updatedAt = stampNow();
    await r.set(next);
    mine = (await r.get()).data();
    return mine;
  }

  const withTotal = (d) => ({ ...d, total: d.base + d.added });

  const saveBase = (km) =>
    write((cur) => (cur ? withTotal({ ...cur, base: km }) : { base: km, added: 0, total: km, log: [] }));

  async function addKm(km) {
    // Документа ще немає: спершу створюємо його з нульовою базою
    if (!mine) await saveBase(0);
    return write((cur) => {
      const added = tidy(cur.added + km);
      return withTotal({ ...cur, added, log: [...cur.log, { k: km, t: Date.now() }].slice(-30) });
    });
  }

  function undoLast() {
    return write((cur) => {
      const last = cur.log[cur.log.length - 1];
      if (!last) throw new Error("nothing");
      return withTotal({ ...cur, added: Math.max(0, tidy(cur.added - last.k)), log: cur.log.slice(0, -1) });
    });
  }

  // ---------- Кабінет у профілі ----------

  function verifiedText(d) {
    if (!d || d.verifiedKm === undefined) return "Ще не перевірено адміністраторами.";
    const when = d.verifiedAt && d.verifiedAt.toDate ? d.verifiedAt.toDate().toLocaleDateString("uk-UA", { day: "numeric", month: "long" }) : "";
    return Math.abs(d.verifiedKm - d.total) < 0.05
      ? `✅ Підтверджено адміністраторами${when ? " " + when : ""}.`
      : `⏳ Підтверджено ${fmt(d.verifiedKm)} км${when ? " (" + when + ")" : ""}, потім змінено. Адміни перевірять знову.`;
  }

  function renderCabinet() {
    const card = $("yearkm");
    if (!card) return;
    card.hidden = !linked();
    if (!linked()) return;
    const d = mine || { base: 0, added: 0, total: 0, log: [] };
    $("yk-year").textContent = year();
    $("yk-total").textContent = fmt(d.total);
    $("yk-verified").textContent = verifiedText(mine);
    const baseInput = $("yk-base");
    if (document.activeElement !== baseInput) baseInput.value = mine ? String(d.base).replace(".", ",") : "";
    $("yk-parts").textContent = mine ? `База ${fmt(d.base)} км + додано ${fmt(d.added)} км` : "";
    const log = d.log.slice().reverse().slice(0, 5);
    $("yk-log").innerHTML = log
      .map((e) => `<li><b>+${fmt(e.k)} км</b><small>${new Date(e.t).toLocaleDateString("uk-UA", { day: "numeric", month: "short" })}</small></li>`)
      .join("");
    $("yk-undo").hidden = !d.log.length;
  }

  function checkMilestones() {
    if (mine && window.Profile && Profile.milestones) Profile.milestones(mine.total);
  }

  async function refreshCabinet() {
    if (!linked()) return renderCabinet();
    try {
      await loadMine();
    } catch (e) {}
    renderCabinet();
    checkMilestones();
  }

  function toast(text) {
    if (window.Profile) Profile.toast(text);
  }

  const errText = (e) => (e && /permission/i.test(String(e.code || e.message)) ? "Не вдалося: перевір цифру (занадто велика для цієї дати?)" : "Не вдалося зберегти 😕");

  $("yk-base-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const km = parseKm($("yk-base").value);
    if (!(km >= 0) || km > 30000) return toast("Введи цифру в кілометрах, наприклад 482,5");
    try {
      await saveBase(km);
      toast("✓ Збережено");
      renderCabinet();
      checkMilestones();
    } catch (err) {
      toast(errText(err));
    }
  });

  $("yk-add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("yk-add");
    const km = parseKm(input.value);
    if (!(km > 0)) return toast("Введи, скільки кілометрів додати");
    if (km > MAX_ADD) return toast(`За один раз можна додати до ${MAX_ADD} км`);
    try {
      await addKm(km);
      input.value = "";
      toast(`✓ +${fmt(km)} км додано`);
      renderCabinet();
      checkMilestones();
    } catch (err) {
      toast(errText(err));
    }
  });

  $("yk-undo").addEventListener("click", async () => {
    try {
      await undoLast();
      toast("Останнє додавання скасовано");
      renderCabinet();
    } catch (err) {
      toast(errText(err));
    }
  });

  // ---------- Рейтинг Titan Premium у вкладці «Клуб» ----------

  async function renderBoard() {
    const box = $("club-year");
    if (!box) return;
    box.hidden = !linked();
    if (!linked()) return;
    box.innerHTML = `<h3 class="club-year__title">🏅 Рейтинг Titan Premium: пробіг за ${year()} рік</h3><p class="leaders__empty">Завантажую…</p>`;
    try {
      const [snap, names] = await Promise.all([(await colRef()).get(), Account.athleteNames()]);
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total);
      const me = Account.state.athleteId;
      const list = rows.length
        ? rows
            .map((r, i) => {
              const ok = r.verifiedKm !== undefined && Math.abs(r.verifiedKm - r.total) < 0.05;
              const name = (names[r.id] && names[r.id].name) || "Учасник";
              return `<li class="leaders__row${r.id === me ? " is-me" : ""}">
                <span class="leaders__place">${MEDALS[i] || i + 1}</span>
                <span class="leaders__name">${escapeHtml(name)}${r.id === me ? " <small>(ти)</small>" : ""}${ok ? ' <span title="Підтверджено адміністраторами">✅</span>' : ""}</span>
                <span></span>
                <span class="leaders__km">${fmt(r.total)} км</span>
              </li>`;
            })
            .join("")
        : '<li class="leaders__empty">Поки порожньо. Додай свій пробіг у профілі! 🏃</li>';
      const total = rows.reduce((s, r) => s + r.total, 0);
      box.innerHTML = `<h3 class="club-year__title">🏅 Рейтинг Titan Premium: пробіг за ${year()} рік</h3>
        <p class="muted small-left">Цю таблицю бачать лише учасники Titan Premium. Цифри вносять самі учасники, адміни перевіряють їх вручну (✅ — підтверджено).${rows.length ? ` Разом клуб: <b>${fmt(total)} км</b>.` : ""}</p>
        <ul class="leaders">${list}</ul>`;
    } catch (e) {
      box.innerHTML = `<h3 class="club-year__title">🏅 Рейтинг Titan Premium</h3><p class="leaders__empty">Не вдалося завантажити 😕</p>`;
    }
  }

  // ---------- Коли оновлювати ----------

  const active = (tab) => $("tab-" + tab).classList.contains("is-active");

  function update() {
    if (active("profile")) refreshCabinet();
    if (active("club")) renderBoard();
  }

  document.querySelectorAll(".tabs__btn").forEach((b) =>
    b.addEventListener("click", () => {
      if ((b.dataset.tab === "profile" || b.dataset.tab === "club") && window.Account && Account.enabled()) Account.refresh().then(update, update);
    })
  );
  if (window.Account) Account.onChange(update);

  window.YearKm = { year, parseKm, saveBase, addKm, undoLast };
})();
