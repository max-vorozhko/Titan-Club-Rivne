// Адмінка клубу (admin.html): вхід через Google, відвідуваність недільних пробіжок, атлети,
// промокоди (лише власник) і вивантаження в Google-таблицю.
// Права перевіряє не ця сторінка, а правила Firestore (колекція admins/{email}).
(function () {
  const $ = (id) => document.getElementById(id);
  const cfg = window.TITAN_CONFIG || {};
  const SDK_VERSION = "11.10.0";
  const SDK = ["app", "auth", "firestore"].map((m) => `https://cdn.jsdelivr.net/npm/firebase@${SDK_VERSION}/firebase-${m}-compat.js`);
  const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
  const SHEET = Object.assign({ id: "", tab: "Аркуш1", kmTab: "Кілометри" }, cfg.attendanceSheet);
  const FIRST_WEEK_COL = 5; // колонка F: тиждень 1 (A №, B ПІБ, C теоретично, D фактично, E %)
  const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  // Кнопка «Увійти з Google» від самого Google (Google Identity Services). Працює напряму з github.io,
  // без проміжної сторінки firebaseapp.com, яку Safari на iPhone блокує (вхід «губився»).
  const CLIENT_ID = cfg.googleClientId || "";
  const GIS_SRC = "https://accounts.google.com/gsi/client";
  // Вбудовані браузери Telegram / Instagram / Facebook: Google-вхід у них часто не працює
  const IN_APP = typeof window.TelegramWebviewProxy !== "undefined" || /Telegram|Instagram|FBAN|FBAV/i.test(navigator.userAgent);

  let auth, db, FV;
  let user = null;
  let role = "";
  let athletes = []; // [{id, name, persona, emoji, active}]
  let runs = new Map(); // id → {date, km, present, updatedBy, updatedAt}
  let year = Club.lastSunday().year;
  let week = Club.lastSunday().week;
  let checked = new Set();

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let toastTimer;
  function toast(text) {
    const el = $("global-toast");
    el.textContent = text;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2200);
  }

  const status = (id, text, bad) => {
    $(id).textContent = text || "";
    $(id).classList.toggle("is-bad", !!bad);
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("sdk_load"));
      document.head.appendChild(s);
    });
  }

  // Окремий екземпляр Firebase: вхід в адмінку не зачіпає анонімного гравця гри в цьому ж браузері
  async function initFirebase() {
    for (const src of SDK) await loadScript(src);
    const app = firebase.initializeApp(cfg.firebase, "club-admin");
    auth = app.auth();
    db = app.firestore();
    FV = firebase.firestore.FieldValue;
    if (cfg.emulator) {
      auth.useEmulator("http://127.0.0.1:9099");
      db.useEmulator("127.0.0.1", 8080);
    }
  }

  // ---------- Вхід ----------

  function showScreen(name) {
    $("adm-login").hidden = name !== "login";
    $("adm-denied").hidden = name !== "denied";
    $("adm-app").hidden = name !== "app";
    $("adm-user").hidden = name === "login";
  }

  // Google повернув ID-токен — входимо з ним у Firebase (запит напряму до Firebase, без перенаправлень)
  async function onGisCredential(resp) {
    status("adm-login-status", "Входжу…");
    try {
      await auth.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(resp.credential));
      status("adm-login-status", "");
    } catch (e) {
      status("adm-login-status", "Не вдалося увійти 😕 " + (e.code || ""), true);
    }
  }

  async function setupGis() {
    await loadScript(GIS_SRC);
    google.accounts.id.initialize({ client_id: CLIENT_ID, callback: onGisCredential, ux_mode: "popup", auto_select: false, use_fedcm_for_button: true });
    google.accounts.id.renderButton($("adm-gis"), { theme: "filled_blue", size: "large", shape: "pill", text: "signin_with", locale: "uk", width: 280 });
    $("adm-signin").hidden = true;
    $("adm-gis").hidden = false;
  }

  // Запасний варіант (якщо googleClientId не задано): вхід через вікно Firebase
  async function signIn() {
    status("adm-login-status", "");
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await auth.signInWithPopup(provider);
    } catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
        return auth.signInWithRedirect(provider);
      }
      if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
        status("adm-login-status", "Не вдалося увійти 😕 " + (e.code || ""), true);
      }
    }
  }

  async function onUser(u) {
    user = u;
    sheetsToken = null;
    if (!u) return showScreen("login");
    $("adm-email").textContent = u.email;
    let snap = null;
    try {
      snap = await db.collection("admins").doc(u.email).get();
    } catch (e) {}
    role = snap && snap.exists ? snap.data().role : "";
    if (role !== "owner" && role !== "admin") {
      $("adm-denied-email").textContent = u.email;
      return showScreen("denied");
    }
    $("adm-tab-codes").hidden = role !== "owner";
    showScreen("app");
    await loadAll();
  }

  // ---------- Дані ----------

  async function loadAll() {
    const [a, r] = await Promise.all([db.collection("athletes").get(), db.collection("runs").get()]);
    athletes = a.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => x.name.localeCompare(y.name, "uk"));
    runs = new Map(r.docs.map((d) => [d.id, d.data()]));
    renderWeekSelect();
    openRun();
    renderSummary();
    renderAthletes();
  }

  // Публічна версія пробіжки: лише ідентифікатори атлетів, без імен і без того, хто вносив
  const publicRun = (r) => ({ date: r.date, km: r.km, present: r.present });
  const publicAthlete = (a) => ({ p: a.persona, e: a.emoji, a: a.active });
  const publicDoc = () => db.collection("club").doc("public");

  // ---------- Відвідуваність ----------

  function renderSummary() {
    const pub = { athletes: {}, runs: {} };
    athletes.forEach((a) => (pub.athletes[a.id] = publicAthlete(a)));
    runs.forEach((r, id) => (pub.runs[id] = publicRun(r)));
    const s = Club.stats(pub);
    const tiles = [
      ["Пробіжок", s.held],
      ["Км клубу", s.clubKm.toLocaleString("uk-UA")],
      ["Середньо на пробіжці", s.avg],
      ["Атлетів", athletes.filter((a) => a.active).length],
    ];
    $("adm-summary").innerHTML =
      tiles.map(([l, v]) => `<div class="stat"><span class="stat__val">${v}</span><span class="stat__lbl">${l}</span></div>`).join("") +
      (s.kmMissing ? `<p class="adm-note">Без кілометрів: ${s.kmMissing} ${Club.plural(s.kmMissing, "пробіжка", "пробіжки", "пробіжок")} — допишіть км, щоб «Км клубу» був точним.</p>` : "");
  }

  function renderWeekSelect() {
    const last = Club.lastSunday();
    const maxWeek = year === last.year ? last.week : Club.weeksInYear(year);
    const opts = [];
    for (let w = maxWeek; w >= 1; w--) {
      const id = Club.runId(year, w);
      const mark = runs.has(id) ? "✓ " : "";
      opts.push(`<option value="${w}"${w === week ? " selected" : ""}>${mark}№${w} · ${Club.formatDate(Club.sundayOf(year, w))}</option>`);
    }
    $("run-week").innerHTML = opts.join("");
    $("run-prev").disabled = week <= 1;
    $("run-next").disabled = week >= maxWeek;
  }

  function openRun() {
    const id = Club.runId(year, week);
    const r = runs.get(id);
    checked = new Set(r ? r.present : []);
    $("run-km").value = r && typeof r.km === "number" ? r.km : "";
    $("run-delete").hidden = !r;
    renderChecklist();
    if (r && r.updatedAt) {
      const at = r.updatedAt.toDate ? r.updatedAt.toDate().toLocaleString("uk-UA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";
      status("run-status", `Збережено: ${r.updatedBy || ""}${at ? ", " + at : ""}`);
    } else status("run-status", r ? "Імпортовано з таблиці" : "Ще не внесено");
  }

  function renderChecklist() {
    // Вибулих показуємо, лише якщо вони були саме на цій пробіжці
    const list = athletes.filter((a) => a.active || checked.has(a.id));
    $("run-list").innerHTML = list.length
      ? list
          .map(
            (a) => `<li><label class="adm-check${a.active ? "" : " is-inactive"}">
              <input type="checkbox" data-id="${a.id}"${checked.has(a.id) ? " checked" : ""}>
              <span class="adm-check__name">${escapeHtml(a.name)}</span>
              <span class="adm-check__persona">${escapeHtml(a.emoji)} ${escapeHtml(a.persona)}</span>
            </label></li>`
          )
          .join("")
      : '<li class="muted">Ще немає атлетів. Додайте їх у вкладці «Атлети» або імпортуйте з таблиці.</li>';
    $("run-count").textContent = `${checked.size} з ${list.length}`;
  }

  async function saveRun() {
    const id = Club.runId(year, week);
    const kmText = $("run-km").value.trim().replace(",", ".");
    const km = kmText === "" ? null : Math.round(Number(kmText) * 10) / 10;
    if (km !== null && !(km >= 0 && km <= 100)) return status("run-status", "Кілометри мають бути від 0 до 100", true);
    const run = { date: Club.sundayOf(year, week), km, present: [...checked], updatedBy: user.email, updatedAt: FV.serverTimestamp() };
    status("run-status", "Зберігаю…");
    const batch = db.batch();
    batch.set(db.collection("runs").doc(id), run);
    batch.set(publicDoc(), { runs: { [id]: publicRun(run) }, updatedAt: FV.serverTimestamp() }, { merge: true });
    try {
      await batch.commit();
      runs.set(id, { ...run, updatedAt: { toDate: () => new Date() } });
      renderWeekSelect();
      openRun();
      renderSummary();
      toast(`✓ Тиждень ${week}: ${checked.size} ${Club.plural(checked.size, "учасник", "учасники", "учасників")}`);
    } catch (e) {
      status("run-status", "Не вдалося зберегти 😕 Перевірте, чи є у вас права адміна.", true);
    }
  }

  async function deleteRun() {
    const id = Club.runId(year, week);
    if (!confirm(`Видалити пробіжку тижня ${week}? Відмітки цієї неділі зникнуть.`)) return;
    const batch = db.batch();
    batch.delete(db.collection("runs").doc(id));
    batch.update(publicDoc(), new firebase.firestore.FieldPath("runs", id), FV.delete(), "updatedAt", FV.serverTimestamp());
    try {
      await batch.commit();
      runs.delete(id);
      renderWeekSelect();
      openRun();
      renderSummary();
      toast("Пробіжку видалено");
    } catch (e) {
      status("run-status", "Не вдалося видалити 😕", true);
    }
  }

  // ---------- Атлети ----------

  function renderAthletes() {
    const counts = new Map();
    runs.forEach((r) => r.present.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1)));
    $("ath-list").innerHTML = athletes.length
      ? athletes
          .map(
            (a) => `<li class="adm-athlete${a.active ? "" : " is-inactive"}">
              <div>
                <b>${escapeHtml(a.name)}</b>
                <small>${escapeHtml(a.emoji)} ${escapeHtml(a.persona)} · пробіжок: ${counts.get(a.id) || 0}${a.active ? "" : " · вибув"}</small>
              </div>
              <span class="adm-athlete__acts">
                <button class="link" data-rename="${a.id}" type="button">змінити</button>
                <button class="link" data-toggle="${a.id}" type="button">${a.active ? "вибув" : "повернути"}</button>
              </span>
            </li>`
          )
          .join("")
      : '<li class="muted">Поки порожньо.</li>';
  }

  async function writeAthlete(a) {
    const ref = db.collection("athletes").doc(a.id);
    const batch = db.batch();
    batch.set(ref, { name: a.name, persona: a.persona, emoji: a.emoji, active: a.active, updatedAt: FV.serverTimestamp() });
    batch.set(publicDoc(), { athletes: { [a.id]: publicAthlete(a) }, updatedAt: FV.serverTimestamp() }, { merge: true });
    await batch.commit();
    const i = athletes.findIndex((x) => x.id === a.id);
    if (i < 0) athletes.push(a);
    else athletes[i] = a;
    athletes.sort((x, y) => x.name.localeCompare(y.name, "uk"));
    renderAthletes();
    renderChecklist();
    renderSummary();
  }

  async function addAthlete(name) {
    const clean = name.trim().replace(/\s+/g, " ");
    if (clean.length < 2) return;
    if (athletes.some((a) => a.name.toLowerCase() === clean.toLowerCase())) return status("ath-status", "Такий атлет уже є", true);
    const p = Club.pickPersona(athletes.map((a) => a.persona));
    const a = { id: db.collection("athletes").doc().id, name: clean, persona: p.persona, emoji: p.emoji, active: true };
    try {
      await writeAthlete(a);
      status("ath-status", `✓ Додано: ${clean} (${p.emoji} ${p.persona})`);
      $("ath-name").value = "";
    } catch (e) {
      status("ath-status", "Не вдалося додати 😕", true);
    }
  }

  // ---------- Промокоди (лише власник) ----------

  function newCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const part = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    return `TR-${part.slice(0, 4)}-${part.slice(4)}`;
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      prompt("Скопіюйте вручну:", text);
      return false;
    }
  }

  async function loadCodes() {
    try {
      const snap = await db.collection("codes").get();
      const unused = snap.docs.filter((d) => !d.data().used).map((d) => d.id).sort();
      $("code-summary").textContent = `Усього: ${snap.size}, використано: ${snap.size - unused.length}, вільних: ${unused.length}`;
      $("code-list").innerHTML = unused.map((c) => `<li><span>${c}</span><button class="btn btn--small" data-code="${c}" type="button">Копіювати</button></li>`).join("");
    } catch (e) {
      $("code-summary").textContent = "Немає доступу до промокодів.";
    }
  }

  async function generateCodes() {
    const n = Math.max(1, Math.min(50, Number($("code-count").value) || 10));
    const batch = db.batch();
    for (let i = 0; i < n; i++) batch.set(db.collection("codes").doc(newCode()), { used: false, createdAt: FV.serverTimestamp() });
    try {
      await batch.commit();
      status("code-status", `✓ Створено кодів: ${n}`);
      loadCodes();
    } catch (e) {
      status("code-status", "Немає прав на промокоди.", true);
    }
  }

  // ---------- Google-таблиця ----------

  // Доступ до таблиць просимо лише тут, а не під час входу. Токен живе ~1 годину, тримаємо в пам'яті.
  let sheetsToken = null;
  async function getSheetsToken() {
    if (sheetsToken && sheetsToken.until > Date.now()) return sheetsToken.value;
    if (CLIENT_ID && window.google && google.accounts && google.accounts.oauth2) {
      // Вікно Google відкривається синхронно від натискання кнопки, тож Safari його не блокує
      const res = await new Promise((resolve, reject) => {
        google.accounts.oauth2
          .initTokenClient({
            client_id: CLIENT_ID,
            scope: SHEETS_SCOPE,
            login_hint: user.email,
            callback: (r) => (r.error ? reject(Object.assign(new Error(r.error), { code: r.error })) : resolve(r)),
            error_callback: (e) => reject(Object.assign(new Error(e.type || "popup"), { code: e.type === "popup_closed" ? "auth/popup-closed-by-user" : e.type })),
          })
          .requestAccessToken({ prompt: "" });
      });
      sheetsToken = { value: res.access_token, until: Date.now() + (Number(res.expires_in) || 3000) * 1000 - 60000 };
      return sheetsToken.value;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope(SHEETS_SCOPE);
    provider.setCustomParameters({ login_hint: user.email });
    const res = await auth.currentUser.reauthenticateWithPopup(provider);
    sheetsToken = { value: res.credential.accessToken, until: Date.now() + 50 * 60000 };
    return sheetsToken.value;
  }

  async function sheetsApi(path, options) {
    const token = await getSheetsToken();
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET.id}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`sheets_${res.status}`);
    return res.json();
  }

  const range = (tab, a1) => encodeURIComponent(`'${tab.replace(/'/g, "''")}'!${a1}`);

  function sheetError(e) {
    if (/sheets_40[13]/.test(e.message)) return "Немає доступу до таблиці: увійдіть акаунтом, якому вона відкрита.";
    if (/sheets_404/.test(e.message)) return "Таблицю не знайдено. Перевірте attendanceSheet у js/config.js.";
    if (e.code === "auth/popup-closed-by-user") return "Вікно Google закрили — доступ до таблиці не надано.";
    return "Помилка Google-таблиці 😕 " + (e.code || e.message);
  }

  // Читає аркуш: атлети (колонка B) і відмітки 1/0 по тижнях (колонки F…)
  let preview = null;
  async function previewImport() {
    status("sheet-import-status", "Читаю таблицю…");
    $("sheet-preview-box").hidden = true;
    try {
      const data = await sheetsApi(`/values/${range(SHEET.tab, "A1:BE300")}`);
      const rows = (data.values || []).slice(1).filter((r) => r[1] && String(r[1]).trim().length >= 2);
      // Скільки неділь уже було: «Теоретична кількість» першого атлета або останній тиждень з відміткою
      let held = 0;
      rows.forEach((r) => r.slice(FIRST_WEEK_COL).forEach((v, i) => String(v).trim() === "1" && (held = Math.max(held, i + 1))));
      const theory = rows.length ? parseInt(rows[0][2], 10) : NaN;
      if (theory > 0 && theory <= 53) held = Math.max(held, theory);
      const people = rows.map((r) => ({
        name: String(r[1]).trim().replace(/\s+/g, " "),
        weeks: r.slice(FIRST_WEEK_COL, FIRST_WEEK_COL + held).map((v) => String(v).trim() === "1"),
      }));
      const marks = people.reduce((n, p) => n + p.weeks.filter(Boolean).length, 0);
      const known = new Set(athletes.map((a) => a.name.toLowerCase()));
      const fresh = people.filter((p) => !known.has(p.name.toLowerCase())).length;
      const overlap = [...Array(held)].filter((_, i) => runs.has(Club.runId(year, i + 1))).length;
      preview = { people, held };
      $("sheet-preview-text").innerHTML =
        `Знайдено атлетів: <b>${people.length}</b> (нових: ${fresh}), неділь ${year} року: <b>${held}</b>, відміток: <b>${marks}</b>.` +
        (overlap ? `<br><b>Увага:</b> ${overlap} з цих неділь уже є в адмінці — їхні відмітки буде замінено даними з таблиці (кілометри збережуться).` : "");
      $("sheet-preview-box").hidden = false;
      status("sheet-import-status", "");
    } catch (e) {
      status("sheet-import-status", sheetError(e), true);
    }
  }

  async function runImport() {
    if (!preview) return;
    status("sheet-import-status", "Імпортую…");
    const byName = new Map(athletes.map((a) => [a.name.toLowerCase(), a]));
    const newAthletes = [];
    for (const p of preview.people) {
      if (byName.has(p.name.toLowerCase())) continue;
      const persona = Club.pickPersona([...athletes, ...newAthletes].map((a) => a.persona));
      const a = { id: db.collection("athletes").doc().id, name: p.name, persona: persona.persona, emoji: persona.emoji, active: true };
      newAthletes.push(a);
      byName.set(p.name.toLowerCase(), a);
    }
    const newRuns = new Map();
    for (let w = 1; w <= preview.held; w++) {
      const id = Club.runId(year, w);
      const old = runs.get(id);
      const present = preview.people.filter((p) => p.weeks[w - 1]).map((p) => byName.get(p.name.toLowerCase()).id);
      newRuns.set(id, { date: Club.sundayOf(year, w), km: old && typeof old.km === "number" ? old.km : null, present, updatedBy: user.email, updatedAt: FV.serverTimestamp() });
    }
    const pub = { athletes: {}, runs: {}, updatedAt: FV.serverTimestamp() };
    newAthletes.forEach((a) => (pub.athletes[a.id] = publicAthlete(a)));
    newRuns.forEach((r, id) => (pub.runs[id] = publicRun(r)));

    const writes = [];
    newAthletes.forEach((a) => writes.push((b) => b.set(db.collection("athletes").doc(a.id), { name: a.name, persona: a.persona, emoji: a.emoji, active: true, updatedAt: FV.serverTimestamp() })));
    newRuns.forEach((r, id) => writes.push((b) => b.set(db.collection("runs").doc(id), r)));
    try {
      // Пакети по 400 записів (ліміт Firestore — 500); публічний документ — у першому пакеті
      for (let i = 0; i < writes.length || i === 0; i += 400) {
        const batch = db.batch();
        writes.slice(i, i + 400).forEach((fn) => fn(batch));
        if (i === 0) batch.set(publicDoc(), pub, { merge: true });
        await batch.commit();
      }
      await loadAll();
      $("sheet-preview-box").hidden = true;
      preview = null;
      status("sheet-import-status", `✓ Імпортовано. Нових атлетів: ${newAthletes.length}, неділь: ${newRuns.size}.`);
    } catch (e) {
      status("sheet-import-status", "Не вдалося імпортувати 😕 " + (e.code || ""), true);
    }
  }

  async function exportSheet() {
    status("sheet-export-status", "Вивантажую…");
    try {
      const pub = { athletes: {}, runs: {} };
      athletes.forEach((a) => (pub.athletes[a.id] = publicAthlete(a)));
      runs.forEach((r, id) => (pub.runs[id] = publicRun(r)));
      const s = Club.stats(pub);
      const yearRuns = s.runs.filter((r) => r.year === year);
      const weeks = Club.weeksInYear(year);
      const lastWeek = yearRuns.length ? yearRuns[yearRuns.length - 1].week : 0;
      const held = yearRuns.length;
      const presentIn = new Map(yearRuns.map((r) => [r.week, new Set(r.present)]));
      const header = ["№", "ПІБ атлета", "Теоретична кількість пробіжок", "Фактична кількість пробіжок", "% ефективності", ...Array.from({ length: weeks }, (_, i) => String(i + 1))];
      const list = athletes.filter((a) => a.active || yearRuns.some((r) => r.present.includes(a.id)));
      const body = list.map((a, i) => {
        const marks = Array.from({ length: weeks }, (_, w) => (w + 1 > lastWeek ? "" : presentIn.has(w + 1) ? (presentIn.get(w + 1).has(a.id) ? 1 : 0) : ""));
        const fact = marks.filter((m) => m === 1).length;
        return [i + 1, a.name, held, fact, held ? Math.round((fact / held) * 100) + "%" : "0%", ...marks];
      });

      await sheetsApi(`/values/${range(SHEET.tab, "A1:BE300")}:clear`, { method: "POST", body: "{}" });
      await sheetsApi(`/values/${range(SHEET.tab, "A1")}?valueInputOption=USER_ENTERED`, {
        method: "PUT",
        body: JSON.stringify({ values: [header, ...body] }),
      });

      // Кілометри — на окремому аркуші, щоб не ламати структуру основного
      const meta = await sheetsApi("?fields=sheets.properties.title");
      if (!meta.sheets.some((sh) => sh.properties.title === SHEET.kmTab)) {
        await sheetsApi(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET.kmTab } } }] }) });
      }
      const kmRows = [["Тиждень", "Дата", "Км пробіжки", "Учасників", "Км клубу"]];
      yearRuns.forEach((r) => kmRows.push([r.week, r.date, r.km === null ? "" : r.km, r.count, r.km === null ? "" : Math.round(r.km * r.count * 10) / 10]));
      kmRows.push(["Разом", "", "", yearRuns.reduce((n, r) => n + r.count, 0), Math.round(yearRuns.reduce((n, r) => n + (r.km || 0) * r.count, 0) * 10) / 10]);
      await sheetsApi(`/values/${range(SHEET.kmTab, "A1:E400")}:clear`, { method: "POST", body: "{}" });
      await sheetsApi(`/values/${range(SHEET.kmTab, "A1")}?valueInputOption=USER_ENTERED`, { method: "PUT", body: JSON.stringify({ values: kmRows }) });

      status("sheet-export-status", `✓ Вивантажено о ${new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}. Атлетів: ${list.length}, неділь: ${held}.`);
    } catch (e) {
      status("sheet-export-status", sheetError(e), true);
    }
  }

  // ---------- Події ----------

  $("adm-signin").addEventListener("click", signIn);
  $("adm-inapp-copy").addEventListener("click", async () => {
    if (await copy(location.href.split("#")[0])) toast("Посилання скопійовано — встав у Safari або Chrome");
  });
  $("adm-logout").addEventListener("click", () => {
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    auth.signOut();
  });

  $("adm-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pane]");
    if (!btn) return;
    $("adm-tabs").querySelectorAll(".seg__btn").forEach((b) => b.classList.toggle("is-active", b === btn));
    ["runs", "athletes", "codes", "sheet"].forEach((p) => ($("pane-" + p).hidden = p !== btn.dataset.pane));
    if (btn.dataset.pane === "codes") loadCodes();
  });

  $("run-week").addEventListener("change", () => {
    week = Number($("run-week").value);
    renderWeekSelect();
    openRun();
  });
  $("run-prev").addEventListener("click", () => {
    week--;
    renderWeekSelect();
    openRun();
  });
  $("run-next").addEventListener("click", () => {
    week++;
    renderWeekSelect();
    openRun();
  });
  $("run-list").addEventListener("change", (e) => {
    const box = e.target.closest("[data-id]");
    if (!box) return;
    box.checked ? checked.add(box.dataset.id) : checked.delete(box.dataset.id);
    $("run-count").textContent = `${checked.size} з ${$("run-list").querySelectorAll("[data-id]").length}`;
  });
  $("run-all").addEventListener("click", () => {
    athletes.filter((a) => a.active).forEach((a) => checked.add(a.id));
    renderChecklist();
  });
  $("run-none").addEventListener("click", () => {
    checked.clear();
    renderChecklist();
  });
  $("run-save").addEventListener("click", saveRun);
  $("run-delete").addEventListener("click", deleteRun);

  $("ath-form").addEventListener("submit", (e) => {
    e.preventDefault();
    addAthlete($("ath-name").value);
  });
  $("ath-list").addEventListener("click", async (e) => {
    const renameId = e.target.dataset.rename;
    const toggleId = e.target.dataset.toggle;
    const a = athletes.find((x) => x.id === (renameId || toggleId));
    if (!a) return;
    const next = { ...a };
    if (renameId) {
      const name = prompt("Прізвище та ім'я:", a.name);
      if (!name || name.trim().length < 2) return;
      next.name = name.trim().replace(/\s+/g, " ");
    } else next.active = !a.active;
    try {
      await writeAthlete(next);
    } catch (err) {
      status("ath-status", "Не вдалося зберегти 😕", true);
    }
  });

  $("code-generate").addEventListener("click", generateCodes);
  $("code-list").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-code]");
    if (b && (await copy(b.dataset.code))) b.textContent = "✓";
  });

  $("sheet-preview").addEventListener("click", previewImport);
  $("sheet-import").addEventListener("click", runImport);
  $("sheet-export").addEventListener("click", exportSheet);
  document.querySelectorAll(".sheet-tab").forEach((el) => (el.textContent = SHEET.tab));

  (async function start() {
    if (!cfg.firebase) return status("adm-login-status", "Firebase не налаштовано", true);
    try {
      await initFirebase();
    } catch (e) {
      return status("adm-login-status", "Не вдалося завантажити Firebase 😕", true);
    }
    auth.getRedirectResult().catch(() => {});
    auth.onAuthStateChanged(onUser);
    $("adm-inapp").hidden = !IN_APP;
    $("adm-inapp-url").textContent = location.href.split("#")[0];
    if (CLIENT_ID) {
      try {
        await setupGis();
      } catch (e) {
        status("adm-login-status", "Не вдалося завантажити кнопку Google — спробую звичайний вхід.");
      }
    }
  })();
})();
